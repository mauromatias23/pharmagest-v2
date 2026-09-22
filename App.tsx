import React, { useState, useEffect } from 'react';
import { User, UserRole, Product, Batch, Invoice, InvoiceStatus } from './types';
import { db } from './services/db';
import { SyncService } from './services/syncService';
import { SaleService } from './services/saleService';
import Layout from './components/Layout';
import Dashboard from './views/Dashboard';
import Inventory from './views/Inventory';
import Billing from './views/Billing';
import Reports from './views/Reports';
import Login from './views/Login';
import Users from './views/Users';
import { RecoveryBilling } from './views/RecoveryBilling';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // Carrega os dados mais recentes de Dexie para o React State
  const reloadLocalData = async () => {
    try {
      const [u, p, b, i] = await Promise.all([
        db.users.toArray(),
        db.products.toArray(),
        db.batches.toArray(),
        db.invoices.orderBy('date').reverse().toArray()
      ]);

      const sanitizedBatches = b.map(batch => ({
        ...batch,
        quantity: Math.max(0, Number(batch.quantity) || 0)
      }));

      // Calcula com precisão matemática absoluta o Stock Atual de cada produto a partir dos seus lotes reais
      const calculatedProducts = p.map(prod => {
        const prodBatches = sanitizedBatches.filter(batch => batch.productId === prod.id);
        const calculatedStock = prodBatches.length > 0
          ? Math.max(0, prodBatches.reduce((acc, batch) => acc + Math.max(0, Number(batch.quantity) || 0), 0))
          : Math.max(0, Number(prod.totalQuantity) || 0);

        return {
          ...prod,
          totalQuantity: calculatedStock
        };
      });

      setUsers(u);
      setProducts(calculatedProducts);
      setBatches(sanitizedBatches);
      // Faturas organizadas em ordem crescente dos dias e dos meses
      const sortedInvoices = [...i].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''));
      setInvoices(sortedInvoices);
    } catch (err) {
      console.error('[reloadLocalData Error]', err);
    }
  };

  // Inicialização do aplicativo
  useEffect(() => {
    let mounted = true;

    // Timeout de segurança: nunca deixa o usuário preso em tela de carregamento por mais de 2 segundos
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setIsLoading(false);
        setIsInitialized(true);
      }
    }, 2000);

    const initDB = async () => {
      try {
        // 1. Garante que os dados locais mínimos existem
        await db.populate();
        await reloadLocalData();

        // 2. Libera a interface IMEDIATAMENTE com os dados locais
        if (mounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }

        // 3. Em segundo plano, sincroniza bidirecionalmente (envia pendentes locais e recebe atualizações)
        if (SyncService.isConfigured() && !SyncService.isQuotaRestricted()) {
          SyncService.syncAll()
            .then(async (res) => {
              if (res.success && mounted) {
                await reloadLocalData();
              }
            })
            .catch((syncErr) => {
              console.warn('[Initial Supabase Sync Warning]', syncErr);
            });
        }

        // 4. Verificar fecho automático às 00:00 para dias anteriores
        try {
          const autoRes = await SyncService.performAutoMidnightClosureIfNeeded();
          if (autoRes.closedDaysCount > 0 && mounted) {
            await reloadLocalData();
          }
        } catch (autoErr) {
          console.warn('[AutoMidnightClosure Warning]', autoErr);
        }

        // Garante que o login é SEMPRE exigido ao abrir ou recarregar o sistema por segurança
        if (mounted) {
          setCurrentUser(null);
          localStorage.removeItem('pharma_user');
        }
      } catch (error) {
        console.warn('[initDB Warning]', error);
        if (mounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      } finally {
        clearTimeout(safetyTimeout);
      }
    };

    initDB();

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
    };
  }, []);

  // Real-time e loop de sincronização automática para multi-dispositivo e multi-navegadores
  useEffect(() => {
    if (!isInitialized) return;

    // 1. Subscrição BroadcastChannel local (sincronização instantânea entre abas no mesmo navegador)
    const unsubscribeBroadcast = SyncService.subscribeToLocalBroadcast(async () => {
      await reloadLocalData();
    });

    // 2. Subscrição em Tempo Real (Supabase Realtime para múltiplos navegadores/dispositivos)
    if (SyncService.isConfigured() && !SyncService.isQuotaRestricted()) {
      SyncService.subscribeToRealtime(async () => {
        await reloadLocalData();
      });
    }

    // 3. Monitor de autorrecuperação quando a quota do Supabase for restaurada
    const unsubscribeAutoRecovery = SyncService.startAutoRecoveryWatcher(async () => {
      await reloadLocalData();
    });

    // 4. Sincronização ao focar na janela/aba (Window focus & Visibility change)
    const handleFocusSync = async () => {
      try {
        if (SyncService.isConfigured() && !SyncService.isQuotaRestricted()) {
          await SyncService.syncAll();
        }
        await reloadLocalData();
      } catch (err) {
        console.warn('[Focus Sync Warning]', err);
      }
    };

    window.addEventListener('focus', handleFocusSync);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleFocusSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 5. Verificação rápida de faturas locais pendentes para envio automático (a cada 15 segundos)
    const pendingPushInterval = setInterval(async () => {
      try {
        if (SyncService.isConfigured() && !SyncService.isQuotaRestricted()) {
          const allInvoices = await db.invoices.toArray();
          const unsynced = allInvoices.filter(i => !i.synchronized);
          if (unsynced.length > 0) {
            const pushRes = await SyncService.pushAllLocalToSupabase();
            if (pushRes.success) {
              await reloadLocalData();
            }
          }
        }
      } catch (err) {
        console.warn('[PendingPush Interval Warning]', err);
      }
    }, 15000);

    // 6. Atualização periódica de novidades da nuvem (a cada 2 minutos para poupar a quota de 5GB)
    const remotePullInterval = setInterval(async () => {
      try {
        if (SyncService.isConfigured() && !SyncService.isQuotaRestricted()) {
          const res = await SyncService.fetchAllFromSupabase();
          if (res.success) {
            await reloadLocalData();
          }
        }
      } catch (err) {
        console.warn('[RemotePull Interval Warning]', err);
      }
    }, 120000);

    // 6. Verificação periódica a cada 60s do fecho automático das 00:00
    const midnightInterval = setInterval(async () => {
      try {
        const autoRes = await SyncService.performAutoMidnightClosureIfNeeded();
        if (autoRes.closedDaysCount > 0) {
          await reloadLocalData();
        }
      } catch (e) {}
    }, 60000);

    return () => {
      unsubscribeBroadcast();
      unsubscribeAutoRecovery();
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(pendingPushInterval);
      clearInterval(remotePullInterval);
      clearInterval(midnightInterval);
    };
  }, [isInitialized]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('pharma_user');
    setActiveTab('dashboard');
  };

  // =========================================================================
  // HANDLERS DE PRODUTOS (SINGLE SOURCE OF TRUTH)
  // =========================================================================

  const handleAddProduct = async (product: Product, initialBatch?: { lotNumber: string; expiryDate: string; quantity: number }) => {
    try {
      await SyncService.createProduct(product, initialBatch);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleAddProduct Error]', err);
      alert(`Erro ao cadastrar medicamento: ${err.message || err}`);
    }
  };

  const handleUpdateProduct = async (product: Product) => {
    try {
      await SyncService.updateProduct(product);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleUpdateProduct Error]', err);
      alert(`Erro ao atualizar medicamento: ${err.message || err}`);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para eliminar produtos.");
      return;
    }
    try {
      // 1. Atualizar UI instantaneamente
      setProducts(prev => prev.filter(p => p.id !== productId));
      setBatches(prev => prev.filter(b => b.productId !== productId));

      // 2. Eliminar no Supabase e no Dexie
      await SyncService.deleteProduct(productId);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleDeleteProduct Error]', err);
      alert(`Erro ao eliminar produto no banco de dados: ${err.message || err}`);
      await reloadLocalData();
    }
  };

  // =========================================================================
  // HANDLERS DE LOTES (SINGLE SOURCE OF TRUTH)
  // =========================================================================

  const handleAddBatch = async (batch: Batch) => {
    try {
      const sanitizedBatch: Batch = {
        ...batch,
        quantity: Math.max(0, Number(batch.quantity) || 0)
      };
      await SyncService.createBatch(sanitizedBatch);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleAddBatch Error]', err);
      alert(`Erro ao adicionar lote: ${err.message || err}`);
    }
  };

  const handleUpdateBatch = async (batch: Batch) => {
    try {
      const sanitizedBatch: Batch = {
        ...batch,
        quantity: Math.max(0, Number(batch.quantity) || 0)
      };
      await SyncService.updateBatch(sanitizedBatch);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleUpdateBatch Error]', err);
      alert(`Erro ao atualizar lote: ${err.message || err}`);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para eliminar lotes de stock.");
      return;
    }
    try {
      // 1. Atualizar UI instantaneamente
      setBatches(prev => prev.filter(b => b.id !== batchId));

      // 2. Eliminar no Supabase e no Dexie
      await SyncService.deleteBatch(batchId);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleDeleteBatch Error]', err);
      alert(`Erro ao eliminar lote no banco de dados: ${err.message || err}`);
      await reloadLocalData();
    }
  };

  // =========================================================================
  // HANDLERS DE FATURAS E VENDAS (SINGLE SOURCE OF TRUTH)
  // =========================================================================

  const handleAddInvoice = async (newInvoice: Invoice) => {
    try {
      await SaleService.completeSale(newInvoice);
      await reloadLocalData();
      // Dispara envio em segundo plano
      SyncService.processQueue().then(() => reloadLocalData()).catch(() => {});
    } catch (err: any) {
      console.error('[handleAddInvoice Error]', err);
      try {
        await reloadLocalData();
      } catch (rErr) {
        console.warn('[reloadLocalData Warning]', rErr);
      }
    }
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para anular faturas.");
      return;
    }
    try {
      await SaleService.cancelSale(invoiceId, 'Anulação solicitada pelo Administrador');
      await reloadLocalData();
      // Dispara envio em segundo plano
      SyncService.processQueue().then(() => reloadLocalData()).catch(() => {});
    } catch (err: any) {
      console.error('[handleCancelInvoice Error]', err);
      alert(`Erro ao anular fatura: ${err.message || err}`);
      await reloadLocalData();
    }
  };

  const handleCancelInvoiceItem = async (invoiceId: string, itemIndex: number) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para anular itens de faturas.");
      return;
    }
    try {
      const invoice = await db.invoices.get(invoiceId);
      if (!invoice || !invoice.items[itemIndex]) {
        throw new Error('Item ou fatura não encontrado.');
      }
      const itemToCancel = invoice.items[itemIndex];
      await SyncService.cancelInvoiceItem(invoiceId, itemToCancel.id);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleCancelInvoiceItem Error]', err);
      alert(`Erro ao anular item da fatura: ${err.message || err}`);
      await reloadLocalData();
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para eliminar faturas.");
      return;
    }
    try {
      setInvoices(prev => prev.filter(i => i.id !== invoiceId));
      await SyncService.deleteInvoice(invoiceId);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleDeleteInvoice Error]', err);
      alert(`Erro ao eliminar fatura: ${err.message || err}`);
      await reloadLocalData();
    }
  };

  const handleDeleteInvoicesBatch = async (invoiceIds: string[]) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para eliminar faturas.");
      return;
    }
    try {
      const idSet = new Set(invoiceIds);
      setInvoices(prev => prev.filter(i => !idSet.has(i.id)));
      await SyncService.deleteInvoicesBatch(invoiceIds);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleDeleteInvoicesBatch Error]', err);
      alert(`Erro ao eliminar faturas: ${err.message || err}`);
      await reloadLocalData();
    }
  };

  // =========================================================================
  // HANDLERS DE UTILIZADORES (SINGLE SOURCE OF TRUTH)
  // =========================================================================

  const handleAddUser = async (user: User) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para adicionar utilizadores.");
      return;
    }
    try {
      await SyncService.createUser(user);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleAddUser Error]', err);
      alert(`Erro ao cadastrar utilizador: ${err.message || err}`);
    }
  };

  const handleUpdateUser = async (user: User) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para alterar utilizadores.");
      return;
    }
    try {
      await SyncService.updateUser(user);
      await reloadLocalData();
      if (currentUser?.id === user.id) {
        if (!user.active) {
          handleLogout();
        } else {
          setCurrentUser(user);
        }
      }
    } catch (err: any) {
      console.error('[handleUpdateUser Error]', err);
      alert(`Erro ao atualizar utilizador: ${err.message || err}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (currentUser?.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para eliminar utilizadores.");
      return;
    }
    if (currentUser?.id === userId) {
      alert("Não pode eliminar o próprio utilizador logado.");
      return;
    }
    try {
      setUsers(prev => prev.filter(u => u.id !== userId));
      await SyncService.deleteUser(userId);
      await reloadLocalData();
    } catch (err: any) {
      console.error('[handleDeleteUser Error]', err);
      alert(`Erro ao eliminar utilizador: ${err.message || err}`);
      await reloadLocalData();
    }
  };

  if (isLoading || !isInitialized) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-emerald-500">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-black tracking-widest text-xs uppercase">Carregando Sistema...</p>
      </div>
    );
  }

  // BLOQUEIO TOTAL: Se não houver utilizador, renderiza APENAS o login.
  if (!currentUser) {
    return <Login onLogin={handleLogin} users={users} />;
  }

  return (
    <Layout 
      user={currentUser} 
      onLogout={handleLogout} 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
    >
      {activeTab === 'dashboard' && (
        <Dashboard products={products} batches={batches} invoices={invoices} />
      )}
      {activeTab === 'inventory' && (
        <Inventory 
          user={currentUser}
          products={products} 
          batches={batches} 
          onAddBatch={handleAddBatch} 
          onUpdateBatch={handleUpdateBatch}
          onDeleteBatch={handleDeleteBatch}
          onUpdateProduct={handleUpdateProduct}
          onAddProduct={handleAddProduct}
          onDeleteProduct={handleDeleteProduct}
        />
      )}
      {activeTab === 'billing' && (
        <Billing 
          user={currentUser}
          products={products} 
          batches={batches} 
          invoices={invoices}
          onCompleteSale={handleAddInvoice}
          onLogout={handleLogout}
        />
      )}
      {activeTab === 'reports' && (
        <Reports 
          user={currentUser}
          invoices={invoices} 
          products={products} 
          batches={batches}
          onCancelInvoice={handleCancelInvoice}
          onCancelInvoiceItem={handleCancelInvoiceItem}
          onDeleteInvoice={handleDeleteInvoice}
          onDeleteInvoicesBatch={handleDeleteInvoicesBatch}
          onDeleteProduct={handleDeleteProduct}
        />
      )}
      {activeTab === 'users' && (
        <Users 
          users={users}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
        />
      )}
      {activeTab === 'recovery_sales' && currentUser.role === UserRole.ADMIN && (
        <RecoveryBilling 
          user={currentUser}
          products={products}
          batches={batches}
          invoices={invoices}
          onCompleteSale={handleAddInvoice}
          onLogout={handleLogout}
          onRefreshData={reloadLocalData}
        />
      )}
    </Layout>
  );
};

export default App;
