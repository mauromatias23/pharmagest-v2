import { db, type DailyClosure } from './db';
import { getSupabase, isSupabaseConfigured, isQuotaExceededError, safeUUID } from './supabaseClient';
import { 
  type User, 
  type Product, 
  type Batch, 
  type Invoice, 
  type InvoiceItem, 
  InvoiceStatus,
  SyncOperationStatus,
  SyncOperationType
} from '../types';
import { DeviceService } from './deviceService';

let realtimeChannel: any = null;
let autoReconnectInterval: any = null;
let isAutoSyncing = false;

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel('pharma_sync_channel');
  } catch (e) {
    console.warn('[BroadcastChannel not supported]', e);
  }
}

// Estado de quota e listeners
let _isQuotaRestricted = false;
let _quotaErrorDetails = '';
let _quotaListeners: Array<(restricted: boolean, details: string) => void> = [];

export const SyncService = {
  isConfigured(): boolean {
    return isSupabaseConfigured();
  },

  isQuotaRestricted(): boolean {
    return _isQuotaRestricted;
  },

  getQuotaDetails(): string {
    return _quotaErrorDetails;
  },

  setQuotaRestricted(restricted: boolean, details: string = ''): void {
    if (_isQuotaRestricted !== restricted || _quotaErrorDetails !== details) {
      _isQuotaRestricted = restricted;
      _quotaErrorDetails = details;
      _quotaListeners.forEach(fn => {
        try { fn(restricted, details); } catch (e) {}
      });
    }
  },

  subscribeToQuotaStatus(listener: (restricted: boolean, details: string) => void): () => void {
    _quotaListeners.push(listener);
    return () => {
      _quotaListeners = _quotaListeners.filter(l => l !== listener);
    };
  },

  /**
   * Envia notificação para todas as abas e janelas locais do navegador
   */
  broadcastLocalChange(): void {
    try {
      if (broadcastChannel) {
        broadcastChannel.postMessage({ type: 'DATA_CHANGED', timestamp: Date.now() });
      }
    } catch (e) {
      // Ignorar erros de broadcast
    }
  },

  /**
   * Escuta mensagens de outras abas no mesmo navegador
   */
  subscribeToLocalBroadcast(onDataChanged: () => void): () => void {
    if (!broadcastChannel) return () => {};
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'DATA_CHANGED') {
        onDataChanged();
      }
    };
    broadcastChannel.addEventListener('message', handler);
    return () => {
      broadcastChannel?.removeEventListener('message', handler);
    };
  },

  /**
   * Aplica cirurgicamente uma alteração vinda do Supabase Realtime diretamente
   * no banco local Dexie, sem NUNCA fazer download completo de todas as tabelas.
   */
  async handleSurgicalRealtimeChange(table: string, eventType: string, newRecord: any, oldRecord: any): Promise<void> {
    try {
      const recordId = newRecord?.id || oldRecord?.id;

      if (eventType === 'DELETE' && recordId) {
        if (table === 'products') {
          await db.products.delete(recordId);
          await db.deletedRecords.put({ id: recordId, table: 'products', timestamp: Date.now() });
          const batches = await db.batches.where('productId').equals(recordId).toArray();
          for (const b of batches) {
            await db.batches.delete(b.id);
            await db.deletedRecords.put({ id: b.id, table: 'batches', timestamp: Date.now() });
          }
        } else if (table === 'batches') {
          await db.batches.delete(recordId);
          await db.deletedRecords.put({ id: recordId, table: 'batches', timestamp: Date.now() });
        } else if (table === 'users') {
          await db.users.delete(recordId);
        }
        return;
      }

      if (!newRecord) return;

      if (table === 'products') {
        const prodId = newRecord.id;

        // Se o produto foi inativado / soft deleted no Supabase:
        if (newRecord.active === false) {
          await db.products.delete(prodId);
          await db.deletedRecords.put({ id: prodId, table: 'products', timestamp: Date.now() });
          const batches = await db.batches.where('productId').equals(prodId).toArray();
          for (const b of batches) {
            await db.batches.delete(b.id);
            await db.deletedRecords.put({ id: b.id, table: 'batches', timestamp: Date.now() });
          }
          return;
        }

        // REGRA CRÍTICA ANTI-RESSURREIÇÃO:
        // Se o produto está registrado como eliminado (tombstone) ou possui operação DELETE pendente localmente,
        // IGNORA sumariamente o evento Realtime e JAMAIS restaura o produto!
        const isDeleted = await db.deletedRecords.get(prodId);
        if (isDeleted) {
          return;
        }

        const pendingDelete = await db.syncQueue
          .where('entityId')
          .equals(prodId)
          .filter(op => op.status === SyncOperationStatus.PENDING && op.operationType === SyncOperationType.DELETE)
          .first();
        if (pendingDelete) {
          return;
        }

        const p: Product = {
          id: newRecord.id,
          code: newRecord.code,
          name: newRecord.name,
          activeIngredient: newRecord.active_ingredient,
          category: newRecord.category,
          type: newRecord.type || '',
          priceType: newRecord.price_type,
          costPrice: Number(newRecord.cost_price) || 0,
          sellPrice: Number(newRecord.sell_price) || 0,
          hasVAT: newRecord.has_vat ?? true,
          supplier: newRecord.supplier || '',
          minStock: Number(newRecord.min_stock) || 0,
          totalQuantity: Number(newRecord.total_quantity) || 0,
          active: newRecord.active ?? true
        };
        await db.products.put(p);
      } else if (table === 'batches') {
        const batchId = newRecord.id;
        const prodId = newRecord.product_id;

        // Se o lote ou o seu produto associado foi eliminado localmente:
        const isBatchDeleted = await db.deletedRecords.get(batchId);
        const isProdDeleted = prodId ? await db.deletedRecords.get(prodId) : null;
        if (isBatchDeleted || isProdDeleted) {
          return;
        }

        const pendingBatchDel = await db.syncQueue
          .where('entityId')
          .equals(batchId)
          .filter(op => op.status === SyncOperationStatus.PENDING && op.operationType === SyncOperationType.DELETE)
          .first();
        if (pendingBatchDel) {
          return;
        }

        const b: Batch = {
          id: newRecord.id,
          productId: newRecord.product_id,
          lotNumber: newRecord.lot_number,
          expiryDate: newRecord.expiry_date,
          quantity: Math.max(0, Number(newRecord.quantity) || 0),
          entryDate: newRecord.entry_date
        };
        await db.batches.put(b);
      } else if (table === 'invoices') {
        // Verificar se a fatura não está em estado PENDING localmente
        const existingLocal = await db.invoices.get(newRecord.id);
        if (existingLocal && !existingLocal.synchronized) {
          // Operação local pendente prevalece
          return;
        }
        const inv: Invoice & { synchronized: boolean } = {
          id: newRecord.id,
          invoiceNumber: newRecord.invoice_number,
          customerId: newRecord.customer_id || undefined,
          customerName: newRecord.customer_name || 'Consumidor Final',
          customerNif: newRecord.customer_nif || '999999999',
          userId: newRecord.user_id || '',
          userName: newRecord.user_name || 'Operador',
          date: newRecord.date,
          totalGross: Number(newRecord.total_gross) || 0,
          totalVAT: Number(newRecord.total_vat) || 0,
          totalNet: Number(newRecord.total_net) || 0,
          status: newRecord.status as InvoiceStatus,
          paymentMethod: newRecord.payment_method,
          items: existingLocal?.items || [],
          closed: newRecord.closed ?? false,
          closureId: newRecord.closure_id || undefined,
          shiftNumber: newRecord.shift_number || 1,
          shiftName: newRecord.shift_name || '1º Turno',
          synchronized: true
        };
        await db.invoices.put(inv);
      } else if (table === 'daily_closures') {
        const c: DailyClosure = {
          id: newRecord.id,
          date: newRecord.date,
          userId: newRecord.user_id || '',
          userName: newRecord.user_name || '',
          type: newRecord.type || 'SHIFT',
          shiftNumber: newRecord.shift_number || 1,
          shiftName: newRecord.shift_name || '1º Turno',
          totalCash: Number(newRecord.total_cash) || 0,
          totalTpa: Number(newRecord.total_tpa) || 0,
          totalTransfer: Number(newRecord.total_transfer) || 0,
          totalMixed: Number(newRecord.total_mixed) || 0,
          totalInvoices: Number(newRecord.total_invoices) || 0,
          grandTotal: Number(newRecord.grand_total) || 0,
          timestamp: newRecord.timestamp,
          shiftBreakdowns: newRecord.shift_breakdowns || undefined,
          synchronized: true
        };
        await db.dailyClosures.put(c);
      }
    } catch (err) {
      console.warn(`[handleSurgicalRealtimeChange] Erro ao aplicar alteração em ${table}:`, err);
    }
  },

  /**
   * Subscreve aos eventos em Tempo Real do Supabase de forma cirúrgica.
   * Aplica diretamente a alteração na tabela local sem recarregar tudo.
   */
  subscribeToRealtime(onDataChanged: () => void) {
    if (!this.isConfigured() || this.isQuotaRestricted()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const handlePayload = async (payload: any) => {
      await this.handleSurgicalRealtimeChange(
        payload.table,
        payload.eventType,
        payload.new,
        payload.old
      );
      onDataChanged();
      this.broadcastLocalChange();
    };

    try {
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }

      realtimeChannel = supabase
        .channel('pharma-realtime-surgical')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handlePayload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, handlePayload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, handlePayload)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_closures' }, handlePayload)
        .subscribe((status) => {
          console.log('[Supabase Realtime Cirúrgico Status]:', status);
        });
    } catch (err: any) {
      console.warn('[subscribeToRealtime Warning]', err?.message || err);
    }
  },

  /**
   * Inicia o monitor de reconexão automática e sincronização transparente.
   * Verifica periodicamente se a quota do Supabase foi restabelecida.
   * Assim que a quota for restabelecida, envia automaticamente todas as faturas,
   * movimentações de stock e fechos realizados no período offline.
   */
  startAutoRecoveryWatcher(onDataRecovered?: () => void): () => void {
    if (autoReconnectInterval) {
      clearInterval(autoReconnectInterval);
    }

    autoReconnectInterval = setInterval(async () => {
      if (!this.isConfigured() || isAutoSyncing) return;
      const supabase = getSupabase();
      if (!supabase) return;

      if (this.isQuotaRestricted()) {
        try {
          const { data, error } = await supabase.from('products').select('id').limit(1);
          if (error) {
            // Se ainda houver qualquer erro de rede ou quota, permanece em modo offline
            return;
          }

          console.log('[SyncService] Supabase restabelecido! A iniciar sincronização automática de dados pendentes...');
          isAutoSyncing = true;
          this.setQuotaRestricted(false, '');

          // 1. Processar primeiro a fila pendente com prioridade absoluta para operações DELETE
          await this.processQueue();

          // 2. Enviar tudo o que foi faturado e alterado localmente enquanto esteve offline
          await this.pushAllLocalToSupabase();

          // 3. Trazer novidades do Supabase preservando dados locais
          await this.fetchAllFromSupabase();

          // 3. Reconectar realtime e atualizar telas
          if (onDataRecovered) {
            onDataRecovered();
            this.subscribeToRealtime(onDataRecovered);
          }

          this.broadcastLocalChange();
        } catch (checkErr: any) {
          // Permanece em modo offline seguro se ainda houver erro de rede
          return;
        } finally {
          isAutoSyncing = false;
        }
      } else {
        // Se estiver online, verifica de tempos em tempos se existem faturas locais não sincronizadas (inclui undefined ou false)
        try {
          const allInvoices = await db.invoices.toArray();
          const unsynced = allInvoices.filter(i => !i.synchronized);
          if (unsynced.length > 0 && !isAutoSyncing) {
            isAutoSyncing = true;
            await this.pushAllLocalToSupabase();
            isAutoSyncing = false;
            this.broadcastLocalChange();
          }
        } catch (e) {
          isAutoSyncing = false;
        }
      }
    }, 20000);

    return () => {
      if (autoReconnectInterval) {
        clearInterval(autoReconnectInterval);
      }
    };
  },

  /**
   * Resumo de dados pendentes locais (calculado a partir da syncQueue e faturas não sincronizadas).
   */
  async getPendingSyncSummary(): Promise<{ totalInvoices: number; unsyncedInvoices: number; periodInvoices: number; queuePending: number }> {
    try {
      const allInvoices = await db.invoices.toArray();
      const unsynced = allInvoices.filter(i => !i.synchronized);
      const queuePendingCount = await db.syncQueue.where('status').equals(SyncOperationStatus.PENDING).count();
      const periodInvoices = allInvoices.filter(i => {
        if (!i.date) return false;
        try {
          const dt = new Date(i.date);
          if (isNaN(dt.getTime())) {
            const str = String(i.date);
            return str.includes('2026-09-') || str.includes('/09/2026') || str.includes('09-2026');
          }
          const y = dt.getFullYear();
          const m = dt.getMonth() + 1;
          const d = dt.getDate();
          return y === 2026 && m === 9 && d >= 11 && d <= 21;
        } catch {
          const dStr = (i.date || '').slice(0, 10);
          return dStr >= '2026-09-11' && dStr <= '2026-09-21';
        }
      });
      return {
        totalInvoices: allInvoices.length,
        unsyncedInvoices: unsynced.length,
        periodInvoices: periodInvoices.length,
        queuePending: queuePendingCount
      };
    } catch {
      return { totalInvoices: 0, unsyncedInvoices: 0, periodInvoices: 0, queuePending: 0 };
    }
  },

  /**
   * Processa a fila de operações local (syncQueue) de forma atómica e idempotente.
   * Transita de PENDING -> SYNCING -> SYNCED com confirmação individual.
   */
  async processQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (!this.isConfigured() || this.isQuotaRestricted()) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }
    const supabase = getSupabase();
    if (!supabase) return { processed: 0, succeeded: 0, failed: 0 };

    const pendingOps = await db.syncQueue
      .where('status')
      .equals(SyncOperationStatus.PENDING)
      .sortBy('id');

    if (pendingOps.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    for (const op of pendingOps) {
      if (!op.id) continue;
      try {
        await db.syncQueue.update(op.id, { status: SyncOperationStatus.SYNCING });

        let opSuccess = false;

        if (op.entityType === 'INVOICE') {
          if (op.operationType === SyncOperationType.CREATE) {
            const inv = op.payload as Invoice;
            // 1. Enviar fatura
            const { error: invErr } = await supabase.from('invoices').upsert({
              id: inv.id,
              invoice_number: inv.invoiceNumber,
              customer_id: inv.customerId || null,
              customer_name: inv.customerName || null,
              customer_nif: inv.customerNif || null,
              user_id: inv.userId || null,
              user_name: inv.userName,
              date: inv.date,
              total_gross: Number(inv.totalGross) || 0,
              total_vat: Number(inv.totalVAT) || 0,
              total_net: Number(inv.totalNet) || 0,
              status: inv.status,
              payment_method: inv.paymentMethod,
              closed: Boolean(inv.closed),
              closure_id: inv.closureId || null,
              shift_number: inv.shiftNumber || 1,
              shift_name: inv.shiftName || '1º Turno'
            }, { onConflict: 'id' });

            if (!invErr || invErr.message?.includes('duplicate key')) {
              // 2. Enviar itens
              if (inv.items && inv.items.length > 0) {
                const itemsToUpsert = inv.items.map(it => ({
                  id: it.id,
                  invoice_id: inv.id,
                  product_id: it.productId || null,
                  product_name: it.productName || 'Item',
                  batch_id: it.batchId || null,
                  lot_number: it.lotNumber || 'LOTE-PADRAO',
                  quantity: Number(it.quantity) || 1,
                  unit_price: Number(it.unitPrice) || 0,
                  subtotal: Number(it.subtotal) || 0,
                  vat_amount: Number(it.vatAmount) || 0
                }));
                await supabase.from('invoice_items').upsert(itemsToUpsert, { onConflict: 'id' });
              }
              opSuccess = true;
              await db.invoices.update(inv.id, { synchronized: true });
            }
          } else if (op.operationType === SyncOperationType.CANCEL) {
            const { error: cancelErr } = await supabase.from('invoices').update({
              status: InvoiceStatus.CANCELLED
            }).eq('id', op.entityId);
            if (!cancelErr) {
              opSuccess = true;
              await db.invoices.update(op.entityId, { synchronized: true });
            }
          }
        } else if (op.entityType === 'DAILY_CLOSURE') {
          const c = op.payload as DailyClosure;
          const { error: closErr } = await supabase.from('daily_closures').upsert({
            id: c.id,
            date: c.date,
            user_id: c.userId || null,
            user_name: c.userName,
            type: c.type || 'SHIFT',
            shift_number: c.shiftNumber || 1,
            shift_name: c.shiftName || '1º Turno',
            total_cash: c.totalCash,
            total_tpa: c.totalTpa,
            total_transfer: c.totalTransfer,
            total_mixed: c.totalMixed,
            total_invoices: c.totalInvoices,
            grand_total: c.grandTotal,
            timestamp: c.timestamp,
            shift_breakdowns: c.shiftBreakdowns || null
          }, { onConflict: 'id' });
          if (!closErr) {
            opSuccess = true;
            await db.dailyClosures.update(c.id, { synchronized: true });
          }
        } else if (op.entityType === 'PRODUCT') {
          if (op.operationType === SyncOperationType.DELETE) {
            const res = await this.executeDeleteProductOnSupabase(
              op.entityId,
              op.payload?.batchIds || [],
              Boolean(op.payload?.hasHistoricalInvoices)
            );
            if (res.success) {
              opSuccess = true;
              // Garante que o tombstone persiste em db.deletedRecords
              const now = Date.now();
              await db.deletedRecords.put({ id: op.entityId, table: 'products', timestamp: now });
              if (op.payload?.batchIds && Array.isArray(op.payload.batchIds)) {
                for (const bId of op.payload.batchIds) {
                  await db.deletedRecords.put({ id: bId, table: 'batches', timestamp: now });
                }
              }
              // Garante que o produto e lotes estão fora do Dexie local
              await db.products.delete(op.entityId);
              if (op.payload?.batchIds && Array.isArray(op.payload.batchIds)) {
                for (const bId of op.payload.batchIds) {
                  await db.batches.delete(bId);
                }
              }
            } else {
              opSuccess = false;
            }
          } else if (op.operationType === SyncOperationType.CREATE || op.operationType === SyncOperationType.UPDATE) {
            // Verificar se não foi excluído posteriormente
            const isDel = await db.deletedRecords.get(op.entityId);
            if (isDel) {
              opSuccess = true; // Ignora pois foi excluído
            } else {
              const p = op.payload as Product;
              if (p) {
                const { error: pErr } = await supabase.from('products').upsert({
                  id: p.id,
                  code: p.code,
                  name: p.name,
                  active_ingredient: p.activeIngredient,
                  category: p.category,
                  type: p.type || null,
                  price_type: p.priceType,
                  cost_price: Number(p.costPrice) || 0,
                  sell_price: Number(p.sellPrice) || 0,
                  has_vat: p.hasVAT,
                  supplier: p.supplier || null,
                  min_stock: Number(p.minStock) || 0,
                  total_quantity: Number(p.totalQuantity) || 0,
                  active: p.active ?? true,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
                if (!pErr) opSuccess = true;
              }
            }
          }
        } else if (op.entityType === 'BATCH') {
          if (op.operationType === SyncOperationType.DELETE) {
            const ok = await this.executeDeleteBatchOnSupabase(op.entityId);
            if (ok) {
              opSuccess = true;
              await db.deletedRecords.put({ id: op.entityId, table: 'batches', timestamp: Date.now() });
              await db.batches.delete(op.entityId);
            } else {
              opSuccess = false;
            }
          } else if (op.operationType === SyncOperationType.CREATE || op.operationType === SyncOperationType.UPDATE) {
            const isDel = await db.deletedRecords.get(op.entityId);
            if (isDel) {
              opSuccess = true;
            } else {
              const b = op.payload as Batch;
              if (b) {
                const { error: bErr } = await supabase.from('batches').upsert({
                  id: b.id,
                  product_id: b.productId,
                  lot_number: b.lotNumber,
                  expiry_date: b.expiryDate,
                  quantity: Math.max(0, Number(b.quantity) || 0),
                  entry_date: b.entryDate
                }, { onConflict: 'id' });
                if (!bErr) opSuccess = true;
              }
            }
          }
        } else {
          // Operações de outras entidades (genérica)
          opSuccess = true;
        }

        if (opSuccess) {
          await db.syncQueue.update(op.id, {
            status: SyncOperationStatus.SYNCED,
            syncedAt: new Date().toISOString()
          });
          succeeded++;
        } else {
          await db.syncQueue.update(op.id, {
            status: SyncOperationStatus.PENDING,
            attempts: (op.attempts || 0) + 1
          });
          failed++;
        }
      } catch (err: any) {
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
          await db.syncQueue.update(op.id, {
            status: SyncOperationStatus.PENDING,
            lastError: err?.message
          });
          break; // Para o loop pois o servidor está inacessível
        } else {
          await db.syncQueue.update(op.id, {
            status: SyncOperationStatus.PENDING,
            attempts: (op.attempts || 0) + 1,
            lastError: err?.message
          });
          failed++;
        }
      }
    }

    return { processed: pendingOps.length, succeeded, failed };
  },

  /**
   * Exporta todo o banco local completo para backup JSON (preservação absoluta de dados).
   */
  async exportLocalDataToJSON(): Promise<{ 
    metadata: { exportedAt: string; deviceId: string; version: number };
    users: any[];
    products: any[];
    batches: any[];
    invoices: any[]; 
    closures: any[]; 
    stockMovements: any[];
    purchases: any[];
    expenses: any[];
    syncQueue: any[];
  }> {
    const users = await db.users.toArray();
    const products = await db.products.toArray();
    const batches = await db.batches.toArray();
    const invoices = await db.invoices.toArray();
    const closures = await db.dailyClosures.toArray();
    const stockMovements = await db.stockMovements.toArray();
    const purchases = await db.purchases.toArray();
    const expenses = await db.expenses.toArray();
    const syncQueue = await db.syncQueue.toArray();

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        deviceId: DeviceService.getDeviceId(),
        version: 95
      },
      users,
      products,
      batches,
      invoices,
      closures,
      stockMovements,
      purchases,
      expenses,
      syncQueue
    };
  },

  /**
   * Importa dados de um ficheiro JSON para a base de dados local deste navegador
   * de forma estritamente aditiva (sem sobrescrever faturas existentes).
   */
  async importLocalDataFromJSON(data: { 
    invoices?: any[]; 
    closures?: any[]; 
    products?: any[]; 
    batches?: any[]; 
    stockMovements?: any[];
    expenses?: any[];
  }): Promise<{ importedInvoices: number; importedClosures: number }> {
    let importedInvoices = 0;
    let importedClosures = 0;

    if (data.invoices && Array.isArray(data.invoices) && data.invoices.length > 0) {
      for (const inv of data.invoices) {
        try {
          const existing = await db.invoices.get(inv.id);
          if (!existing) {
            await db.invoices.put({ ...inv, synchronized: false });
            // Cria operação pendente na syncQueue
            await db.syncQueue.add({
              operationId: inv.operationId || DeviceService.generateOperationId(),
              deviceId: inv.deviceId || DeviceService.getDeviceId(),
              entityType: 'INVOICE',
              entityId: inv.id,
              operationType: SyncOperationType.CREATE,
              payload: inv,
              createdAt: inv.date || new Date().toISOString(),
              status: SyncOperationStatus.PENDING,
              attempts: 0
            });
            importedInvoices++;
          }
        } catch (e) {
          console.warn('[importLocalDataFromJSON] Erro ao importar fatura:', e);
        }
      }
    }

    if (data.closures && Array.isArray(data.closures) && data.closures.length > 0) {
      for (const c of data.closures) {
        try {
          const existing = await db.dailyClosures.get(c.id);
          if (!existing) {
            await db.dailyClosures.put({ ...c, synchronized: false });
            importedClosures++;
          }
        } catch (e) {
          console.warn('[importLocalDataFromJSON] Erro ao importar fecho:', e);
        }
      }
    }

    if (data.products && Array.isArray(data.products) && data.products.length > 0) {
      await db.products.bulkPut(data.products);
    }

    if (data.batches && Array.isArray(data.batches) && data.batches.length > 0) {
      await db.batches.bulkPut(data.batches);
    }

    if (data.stockMovements && Array.isArray(data.stockMovements) && data.stockMovements.length > 0) {
      await db.stockMovements.bulkPut(data.stockMovements);
    }

    if (data.expenses && Array.isArray(data.expenses) && data.expenses.length > 0) {
      await db.expenses.bulkPut(data.expenses);
    }

    this.broadcastLocalChange();
    return { importedInvoices, importedClosures };
  },

  /**
   * Envia todos os dados locais (utilizadores, produtos, lotes, faturas de 11 a 21 de setembro e fechos)
   * para o Supabase com resiliência total contra restrições de Foreign Key.
   */
  async pushAllLocalToSupabase(): Promise<{ 
    success: boolean; 
    pushed: number; 
    pushedInvoices: number; 
    pushedItems: number; 
    pushedClosures: number; 
    message: string 
  }> {
    if (!this.isConfigured()) {
      return { success: false, pushed: 0, pushedInvoices: 0, pushedItems: 0, pushedClosures: 0, message: 'Supabase não está configurado.' };
    }

    if (this.isQuotaRestricted()) {
      return { 
        success: false, 
        pushed: 0, 
        pushedInvoices: 0, 
        pushedItems: 0, 
        pushedClosures: 0, 
        message: 'O projeto Supabase está com a quota de tráfego excedida (exceed_egress_quota). Os dados estão salvos localmente.' 
      };
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, pushed: 0, pushedInvoices: 0, pushedItems: 0, pushedClosures: 0, message: 'Cliente Supabase indisponível.' };
    }

    try {
      // 0. Processar fila pendente prioritária (operações DELETE têm precedência absoluta)
      try {
        await this.processQueue();
      } catch (qErr) {}

      // Obter tombstones de produtos e lotes eliminados
      const allDeleted = await db.deletedRecords.toArray();
      const deletedProductIds = new Set(allDeleted.filter(d => d.table === 'products').map(d => d.id));
      const deletedBatchIds = new Set(allDeleted.filter(d => d.table === 'batches').map(d => d.id));

      // 1. Enviar Utilizadores locais primeiro para garantir chaves estrangeiras
      const localUsers = await db.users.toArray();
      const validUserIds = new Set<string>();
      if (localUsers.length > 0) {
        const usersData = localUsers.map(u => ({
          id: u.id,
          name: u.name,
          role: u.role,
          active: u.active ?? true,
          password: u.password || null
        }));
        try {
          const { error: userErr } = await supabase.from('users').upsert(usersData, { onConflict: 'id' });
          if (!userErr) {
            localUsers.forEach(u => validUserIds.add(u.id));
          } else {
            console.warn('[pushAllLocalToSupabase] Aviso ao enviar utilizadores:', userErr.message);
          }
        } catch (uErr) {
          console.warn('[pushAllLocalToSupabase] Exceção em utilizadores:', uErr);
        }
      }

      // 2. Enviar Produtos locais (estritamente ativos e NÃO eliminados)
      const allLocalProducts = await db.products.toArray();
      const localProducts = allLocalProducts.filter(p => !deletedProductIds.has(p.id) && p.active !== false);
      const validProductIds = new Set<string>();
      if (localProducts.length > 0) {
        const productsData = localProducts.map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          active_ingredient: p.activeIngredient,
          category: p.category,
          type: p.type || null,
          price_type: p.priceType,
          cost_price: p.costPrice,
          sell_price: p.sellPrice,
          has_vat: p.hasVAT,
          supplier: p.supplier || null,
          min_stock: p.minStock,
          total_quantity: p.totalQuantity,
          active: p.active
        }));
        // Envio em lotes de 50 produtos para evitar limites de payload
        for (let i = 0; i < productsData.length; i += 50) {
          const chunk = productsData.slice(i, i + 50);
          try {
            const { error: prodErr } = await supabase.from('products').upsert(chunk, { onConflict: 'id' });
            if (!prodErr) {
              chunk.forEach(p => validProductIds.add(p.id));
            } else {
              console.warn('[pushAllLocalToSupabase] Lote de produtos falhou, tentando unitário:', prodErr.message);
              for (const p of chunk) {
                const { error: singleErr } = await supabase.from('products').upsert(p, { onConflict: 'id' });
                if (!singleErr) validProductIds.add(p.id);
              }
            }
          } catch (pChunkErr) {
            console.warn('[pushAllLocalToSupabase] Exceção em lote de produtos:', pChunkErr);
          }
        }
      }

      // 3. Enviar Lotes locais (estritamente não eliminados e de produtos válidos)
      const allLocalBatches = await db.batches.toArray();
      const validBatchIds = new Set<string>();
      if (allLocalBatches.length > 0) {
        const safeBatches = allLocalBatches.filter(b => 
          b.productId && 
          !deletedBatchIds.has(b.id) && 
          !deletedProductIds.has(b.productId) && 
          (validProductIds.size === 0 || validProductIds.has(b.productId))
        );
        const batchesData = safeBatches.map(b => ({
          id: b.id,
          product_id: b.productId,
          lot_number: b.lotNumber,
          expiry_date: b.expiryDate,
          quantity: Math.max(0, b.quantity),
          entry_date: b.entryDate
        }));
        for (let i = 0; i < batchesData.length; i += 50) {
          const chunk = batchesData.slice(i, i + 50);
          try {
            const { error: batchErr } = await supabase.from('batches').upsert(chunk, { onConflict: 'id' });
            if (!batchErr) {
              chunk.forEach(b => validBatchIds.add(b.id));
            } else {
              console.warn('[pushAllLocalToSupabase] Lote de lotes falhou, tentando unitário:', batchErr.message);
              for (const b of chunk) {
                const { error: sErr } = await supabase.from('batches').upsert(b, { onConflict: 'id' });
                if (!sErr) validBatchIds.add(b.id);
              }
            }
          } catch (bChunkErr) {
            console.warn('[pushAllLocalToSupabase] Exceção em lotes:', bChunkErr);
          }
        }
      }

      // 4. Enviar Faturas locais (incluindo todas as vendas locais de 11 a 21 de setembro)
      const localInvoices = await db.invoices.toArray();
      let pushedInvoicesCount = 0;
      let pushedItemsCount = 0;

      if (localInvoices.length > 0) {
        const invoicesData = localInvoices.map(inv => ({
          id: inv.id,
          invoice_number: inv.invoiceNumber,
          customer_id: inv.customerId || null,
          customer_name: inv.customerName || null,
          customer_nif: inv.customerNif || null,
          user_id: (inv.userId && validUserIds.has(inv.userId)) ? inv.userId : null,
          user_name: inv.userName || 'Operador',
          date: inv.date,
          total_gross: Number(inv.totalGross) || 0,
          total_vat: Number(inv.totalVAT) || 0,
          total_net: Number(inv.totalNet) || 0,
          status: inv.status,
          payment_method: inv.paymentMethod,
          closed: inv.closed || false,
          closure_id: inv.closureId || null,
          shift_number: inv.shiftNumber || 1,
          shift_name: inv.shiftName || '1º Turno'
        }));

        // Enviar em blocos de 25 faturas com fallback seguro para tabelas com esquemas antigos
        for (let i = 0; i < invoicesData.length; i += 25) {
          const chunk = invoicesData.slice(i, i + 25);
          let { error: invErr } = await supabase.from('invoices').upsert(chunk, { onConflict: 'id' });
          
          if (invErr) {
            console.warn('[pushAllLocalToSupabase] Lote de faturas deu erro. Tentando envio individual seguro:', invErr.message);
            for (const singleInv of chunk) {
              let { error: sErr } = await supabase.from('invoices').upsert(singleInv, { onConflict: 'id' });
              if (sErr && (sErr.code === 'PGRST204' || sErr.message?.includes('closed') || sErr.message?.includes('closure_id') || sErr.message?.includes('shift_') || sErr.message?.includes('foreign key'))) {
                // Tenta sem colunas adicionais ou sem user_id se for problema de chave
                const stripped = {
                  id: singleInv.id,
                  invoice_number: singleInv.invoice_number,
                  customer_name: singleInv.customer_name,
                  customer_nif: singleInv.customer_nif,
                  user_id: null,
                  user_name: singleInv.user_name,
                  date: singleInv.date,
                  total_gross: singleInv.total_gross,
                  total_vat: singleInv.total_vat,
                  total_net: singleInv.total_net,
                  status: singleInv.status,
                  payment_method: singleInv.payment_method
                };
                const retryStrip = await supabase.from('invoices').upsert(stripped, { onConflict: 'id' });
                if (!retryStrip.error) pushedInvoicesCount++;
                else console.warn('[pushAllLocalToSupabase] Falha ao enviar fatura:', singleInv.invoice_number, retryStrip.error.message);
              } else if (!sErr) {
                pushedInvoicesCount++;
              }
            }
          } else {
            pushedInvoicesCount += chunk.length;
          }
        }

        // 5. Enviar Itens das Faturas com validação de chaves estrangeiras
        const allItems: any[] = [];
        localInvoices.forEach(inv => {
          if (inv.items && inv.items.length > 0) {
            inv.items.forEach(item => {
              allItems.push({
                id: item.id,
                invoice_id: inv.id,
                product_id: (item.productId && validProductIds.has(item.productId)) ? item.productId : null,
                product_name: item.productName || 'Medicamento',
                batch_id: (item.batchId && validBatchIds.has(item.batchId)) ? item.batchId : null,
                lot_number: item.lotNumber || 'LOTE-PADRAO',
                quantity: Math.max(1, Number(item.quantity) || 1),
                unit_price: Number(item.unitPrice) || 0,
                subtotal: Number(item.subtotal) || 0,
                vat_amount: Number(item.vatAmount) || 0
              });
            });
          }
        });

        if (allItems.length > 0) {
          for (let i = 0; i < allItems.length; i += 50) {
            const chunk = allItems.slice(i, i + 50);
            const { error: itemErr } = await supabase.from('invoice_items').upsert(chunk, { onConflict: 'id' });
            if (itemErr) {
              console.warn('[pushAllLocalToSupabase] Lote de itens deu erro. Tentando envio item a item:', itemErr.message);
              for (const singleItem of chunk) {
                const { error: sItemErr } = await supabase.from('invoice_items').upsert(singleItem, { onConflict: 'id' });
                if (!sItemErr) pushedItemsCount++;
                else {
                  // Fallback desvinculando batch e product se houver violação de chave
                  const neutralItem = { ...singleItem, product_id: null, batch_id: null };
                  const { error: nErr } = await supabase.from('invoice_items').upsert(neutralItem, { onConflict: 'id' });
                  if (!nErr) pushedItemsCount++;
                }
              }
            } else {
              pushedItemsCount += chunk.length;
            }
          }
        }
      }

      // 6. Enviar Fechos diários locais
      const localClosures = await db.dailyClosures.toArray();
      let pushedClosuresCount = 0;
      if (localClosures.length > 0) {
        const closuresData = localClosures.map(c => ({
          id: c.id,
          date: c.date,
          user_id: (c.userId && validUserIds.has(c.userId)) ? c.userId : null,
          user_name: c.userName || 'Operador',
          type: c.type || 'SHIFT',
          shift_number: c.shiftNumber || 1,
          shift_name: c.shiftName || '1º Turno',
          total_cash: Number(c.totalCash) || 0,
          total_tpa: Number(c.totalTpa) || 0,
          total_transfer: Number(c.totalTransfer) || 0,
          total_mixed: Number(c.totalMixed) || 0,
          total_invoices: Number(c.totalInvoices) || 0,
          grand_total: Number(c.grandTotal) || 0,
          timestamp: c.timestamp,
          shift_breakdowns: c.shiftBreakdowns || null
        }));
        for (let i = 0; i < closuresData.length; i += 25) {
          const chunk = closuresData.slice(i, i + 25);
          const { error: closErr } = await supabase.from('daily_closures').upsert(chunk, { onConflict: 'id' });
          if (!closErr) {
            pushedClosuresCount += chunk.length;
          } else {
            console.warn('[pushAllLocalToSupabase] Lote de fechos deu erro. Tentando envio individual:', closErr.message);
            for (const singleClos of chunk) {
              const { error: sClosErr } = await supabase.from('daily_closures').upsert(singleClos, { onConflict: 'id' });
              if (!sClosErr) pushedClosuresCount++;
            }
          }
        }
      }

      // 7. Marcar faturas e fechos locais como sincronizados no Dexie
      try {
        await db.invoices.toCollection().modify({ synchronized: true });
        await db.dailyClosures.toCollection().modify({ synchronized: true });
      } catch (modErr) {
        console.warn('[pushAllLocalToSupabase] Aviso ao marcar faturas como sincronizadas:', modErr);
      }

      const totalPushed = pushedInvoicesCount + pushedItemsCount + pushedClosuresCount + localProducts.length;
      return {
        success: true,
        pushed: totalPushed,
        pushedInvoices: pushedInvoicesCount,
        pushedItems: pushedItemsCount,
        pushedClosures: pushedClosuresCount,
        message: `${pushedInvoicesCount} faturas (incluindo período 11/09 a 21/09) e ${pushedClosuresCount} fechos locais enviados com sucesso para o Supabase!`
      };
    } catch (err: any) {
      if (isQuotaExceededError(err)) {
        this.setQuotaRestricted(true, err?.message || 'Quota de transferência do Supabase excedida ou indisponível.');
        console.warn('[SyncService] Supabase temporariamente restrito por quota ou offline. Operações locais continuam seguras.');
        return {
          success: false,
          pushed: 0,
          pushedInvoices: 0,
          pushedItems: 0,
          pushedClosures: 0,
          message: 'Quota de tráfego do Supabase excedida (exceed_egress_quota). Os seus dados continuam seguros localmente.'
        };
      }
      console.warn('[pushAllLocalToSupabase Warning]', err?.message || err);
      return {
        success: false,
        pushed: 0,
        pushedInvoices: 0,
        pushedItems: 0,
        pushedClosures: 0,
        message: err?.message || 'Falha ao enviar dados locais para o Supabase.'
      };
    }
  },

  /**
   * Busca todos os dados reais do Supabase (Fonte Única de Verdade)
   * e substitui o cache local (Dexie) para manter 100% de consistência.
   * NUNCA envia cache antigo de volta para o Supabase.
   */
  async fetchAllFromSupabase(): Promise<{ success: boolean; pulled: number; message: string }> {
    if (!this.isConfigured()) {
      return { success: false, pulled: 0, message: 'Supabase não está configurado.' };
    }

    if (this.isQuotaRestricted()) {
      return { 
        success: false, 
        pulled: 0, 
        message: 'Supabase temporariamente em modo offline por limite de quota (exceed_egress_quota).' 
      };
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, pulled: 0, message: 'Cliente Supabase indisponível.' };
    }

    try {
      // 1. Obter todos os utilizadores
      const { data: remoteUsers, error: usersErr } = await supabase.from('users').select('*');
      if (usersErr) throw usersErr;

      // 2. Obter todos os produtos
      const { data: remoteProducts, error: prodErr } = await supabase.from('products').select('*');
      if (prodErr) throw prodErr;

      // 3. Obter todos os lotes
      const { data: remoteBatches, error: batchErr } = await supabase.from('batches').select('*');
      if (batchErr) throw batchErr;

      // 4. Obter faturas e itens
      const { data: remoteInvoices, error: invErr } = await supabase.from('invoices').select('*');
      if (invErr) throw invErr;

      const { data: remoteItems, error: itemsErr } = await supabase.from('invoice_items').select('*');
      if (itemsErr) throw itemsErr;

      // 5. Obter fechos diários
      const { data: remoteClosures, error: closErr } = await supabase.from('daily_closures').select('*');
      if (closErr) throw closErr;

      // Se todas as consultas correram bem, limpa qualquer restrição anterior
      this.setQuotaRestricted(false, '');

      // 5.1. IDENTIFICAR PRODUTOS E LOTES ELIMINADOS (Tombstones locais + Fila pendente)
      const allDeleted = await db.deletedRecords.toArray();
      const deletedProductIds = new Set(allDeleted.filter(d => d.table === 'products').map(d => d.id));
      const deletedBatchIds = new Set(allDeleted.filter(d => d.table === 'batches').map(d => d.id));

      const pendingDeletes = await db.syncQueue
        .where('status')
        .equals(SyncOperationStatus.PENDING)
        .toArray();
      pendingDeletes.forEach(op => {
        if (op.operationType === SyncOperationType.DELETE) {
          if (op.entityType === 'PRODUCT') deletedProductIds.add(op.entityId);
          if (op.entityType === 'BATCH') deletedBatchIds.add(op.entityId);
        }
      });

      // Se o Supabase trouxe produtos inativados (soft deleted) ou que estão no tombstone local:
      // Expurga-os imediatamente do Dexie para garantir que nunca mais apareçam
      const productsToPurge = (remoteProducts || []).filter(p => p.active === false || deletedProductIds.has(p.id));
      for (const p of productsToPurge) {
        deletedProductIds.add(p.id);
        await db.products.delete(p.id);
        await db.deletedRecords.put({ id: p.id, table: 'products', timestamp: Date.now() });
        const pBatches = await db.batches.where('productId').equals(p.id).toArray();
        for (const b of pBatches) {
          deletedBatchIds.add(b.id);
          await db.batches.delete(b.id);
          await db.deletedRecords.put({ id: b.id, table: 'batches', timestamp: Date.now() });
        }
      }

      // Filtrar estritamente produtos remotos válidos e ativos
      const validRemoteProducts = (remoteProducts || []).filter(p => 
        p.active !== false && !deletedProductIds.has(p.id)
      );
      const validRemoteProductIds = new Set(validRemoteProducts.map(p => p.id));

      // MULTI-COMPUTADOR: Se este computador tiver localmente um produto que foi eliminado noutro computador
      // (não existe no Supabase e não é uma criação local pendente de envio), remove-o com tombstone!
      const currentLocalProducts = await db.products.toArray();
      for (const locProd of currentLocalProducts) {
        if (!validRemoteProductIds.has(locProd.id)) {
          const isPendingCreate = pendingDeletes.some(op => 
            op.entityId === locProd.id && 
            op.entityType === 'PRODUCT' && 
            op.operationType === SyncOperationType.CREATE
          );
          if (!isPendingCreate) {
            await db.products.delete(locProd.id);
            await db.deletedRecords.put({ id: locProd.id, table: 'products', timestamp: Date.now() });
            deletedProductIds.add(locProd.id);
            const bList = await db.batches.where('productId').equals(locProd.id).toArray();
            for (const b of bList) {
              await db.batches.delete(b.id);
              await db.deletedRecords.put({ id: b.id, table: 'batches', timestamp: Date.now() });
              deletedBatchIds.add(b.id);
            }
          }
        }
      }

      // Mapear dados para os tipos do PharmaGest preservando senhas locais válidas
      const currentLocalUsers = await db.users.toArray();
      const localUserMap = new Map(currentLocalUsers.map(u => [u.id, u]));

      const mappedUsers: User[] = (remoteUsers || []).map(u => {
        const local = localUserMap.get(u.id);
        let finalPassword = (u.password && String(u.password).trim() !== '') 
          ? String(u.password).trim() 
          : (local?.password ? String(local.password).trim() : undefined);

        if (!finalPassword) {
          const norm = (u.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          if (u.role === UserRole.ADMIN || norm.includes('admin') || u.id === 'u-admin') {
            finalPassword = '1111';
          } else if (norm.includes('1') || u.id === 'u-f1') {
            finalPassword = '2222';
          } else if (norm.includes('2') || u.id === 'u-f2') {
            finalPassword = '3333';
          } else {
            finalPassword = 'admin123';
          }
        }

        return {
          id: u.id,
          name: u.name,
          role: u.role as UserRole,
          active: u.active ?? true,
          password: finalPassword
        };
      });

      // Filtrar lotes remotos válidos (não deletados e pertencentes a produtos válidos ativos)
      const validRemoteBatches = (remoteBatches || []).filter(b => 
        !deletedBatchIds.has(b.id) && 
        !deletedProductIds.has(b.product_id) && 
        validRemoteProductIds.has(b.product_id)
      );

      const mappedBatches: Batch[] = validRemoteBatches.map(b => ({
        id: b.id,
        productId: b.product_id,
        lotNumber: b.lot_number,
        expiryDate: b.expiry_date,
        quantity: Math.max(0, Number(b.quantity) || 0),
        entryDate: b.entry_date
      }));

      const mappedProducts: Product[] = validRemoteProducts.map(p => {
        const prodBatches = mappedBatches.filter(b => b.productId === p.id);
        const calculatedStock = prodBatches.length > 0
          ? Math.max(0, prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0))
          : Math.max(0, Number(p.total_quantity) || 0);

        return {
          id: p.id,
          code: p.code,
          name: p.name,
          activeIngredient: p.active_ingredient,
          category: p.category,
          type: p.type || '',
          priceType: p.price_type,
          costPrice: Number(p.cost_price) || 0,
          sellPrice: Number(p.sell_price) || 0,
          hasVAT: p.has_vat ?? true,
          supplier: p.supplier || '',
          minStock: Number(p.min_stock) || 0,
          totalQuantity: calculatedStock,
          active: true
        };
      });

      // Mapear itens por fatura
      const itemsByInvoice = new Map<string, InvoiceItem[]>();
      (remoteItems || []).forEach(it => {
        const list = itemsByInvoice.get(it.invoice_id) || [];
        list.push({
          id: it.id,
          productId: it.product_id,
          productName: it.product_name,
          batchId: it.batch_id,
          lotNumber: it.lot_number,
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unit_price) || 0,
          subtotal: Number(it.subtotal) || 0,
          vatAmount: Number(it.vat_amount) || 0
        });
        itemsByInvoice.set(it.invoice_id, list);
      });

      const mappedInvoices: (Invoice & { synchronized: boolean })[] = (remoteInvoices || []).map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        customerId: inv.customer_id || undefined,
        customerName: inv.customer_name || 'Consumidor Final',
        customerNif: inv.customer_nif || '999999999',
        userId: inv.user_id || '',
        userName: inv.user_name || 'Operador',
        date: inv.date,
        totalGross: Number(inv.total_gross) || 0,
        totalVAT: Number(inv.total_vat) || 0,
        totalNet: Number(inv.total_net) || 0,
        status: inv.status as InvoiceStatus,
        paymentMethod: inv.payment_method,
        items: itemsByInvoice.get(inv.id) || [],
        closed: inv.closed ?? false,
        closureId: inv.closure_id || undefined,
        shiftNumber: inv.shift_number || 1,
        shiftName: inv.shift_name || '1º Turno',
        synchronized: true
      }));

      const mappedClosures: DailyClosure[] = (remoteClosures || []).map(c => ({
        id: c.id,
        date: c.date,
        userId: c.user_id || '',
        userName: c.user_name || '',
        type: c.type || 'SHIFT',
        shiftNumber: c.shift_number || 1,
        shiftName: c.shift_name || '1º Turno',
        totalCash: Number(c.total_cash) || 0,
        totalTpa: Number(c.total_tpa) || 0,
        totalTransfer: Number(c.total_transfer) || 0,
        totalMixed: Number(c.total_mixed) || 0,
        totalInvoices: Number(c.total_invoices) || 0,
        grandTotal: Number(c.grand_total) || 0,
        timestamp: c.timestamp,
        shiftBreakdowns: c.shift_breakdowns || undefined,
        synchronized: true
      }));

      // 6. MESCLAGEM INTELIGENTE E NÃO-DESTRUTIVA (SMART MERGE):
      // NUNCA sobrescreve dados locais mais atualizados com dados remotos antigos ou desatualizados.
      // O Supabase apenas atualiza se o registo local não tiver alterações pendentes.
      const currentLocalBatches = await db.batches.toArray();
      const localBatchMap = new Map(currentLocalBatches.map(b => [b.id, b]));

      // Obter operações pendentes de produtos ou lotes na syncQueue para respeitar prioridade local
      const pendingBatchOps = new Set(
        pendingDeletes
          .filter(op => op.entityType === 'BATCH')
          .map(op => op.entityId)
      );

      // Mesclagem de lotes:
      // - Se o lote existe localmente e a quantidade local for menor devido a vendas efetuadas offline,
      //   a quantidade local mais recente prevalece para evitar inflar o stock indevidamente!
      // - Se for lote novo no Supabase, é adicionado.
      const finalBatchesToSave: Batch[] = [];
      const processedBatchIds = new Set<string>();

      for (const remoteB of mappedBatches) {
        processedBatchIds.add(remoteB.id);
        const localB = localBatchMap.get(remoteB.id);
        if (!localB) {
          // Lote novo que veio do Supabase
          finalBatchesToSave.push(remoteB);
        } else {
          // Se houver alteração pendente local, prevalece o local
          if (pendingBatchOps.has(remoteB.id)) {
            finalBatchesToSave.push(localB);
          } else {
            // Em caso de divergência de stock onde o local sofreu baixas de faturação offline,
            // preservamos a quantidade mais conservadora/realista local
            const localQty = Number(localB.quantity) || 0;
            const remoteQty = Number(remoteB.quantity) || 0;
            const chosenQty = (localQty < remoteQty) ? localQty : remoteQty;
            finalBatchesToSave.push({
              ...remoteB,
              quantity: Math.max(0, chosenQty)
            });
          }
        }
      }

      // Adicionar lotes existentes apenas no Dexie local (criados localmente ou não sincronizados)
      for (const localB of currentLocalBatches) {
        if (!processedBatchIds.has(localB.id) && !deletedBatchIds.has(localB.id) && !deletedProductIds.has(localB.productId)) {
          finalBatchesToSave.push(localB);
        }
      }

      // Mesclagem de produtos:
      // O stock total do produto deve refletir rigorosamente a soma real dos seus lotes mesclados
      const currentLocalProductsList = await db.products.toArray();
      const localProductMap = new Map(currentLocalProductsList.map(p => [p.id, p]));
      const finalProductsToSave: Product[] = [];
      const processedProductIds = new Set<string>();

      for (const remoteP of mappedProducts) {
        processedProductIds.add(remoteP.id);
        const prodBatches = finalBatchesToSave.filter(b => b.productId === remoteP.id);
        const accurateStock = prodBatches.length > 0
          ? Math.max(0, prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0))
          : Math.max(0, Number(remoteP.totalQuantity) || 0);

        const localP = localProductMap.get(remoteP.id);
        finalProductsToSave.push({
          ...remoteP,
          sellPrice: localP?.sellPrice !== undefined ? localP.sellPrice : remoteP.sellPrice,
          costPrice: localP?.costPrice !== undefined ? localP.costPrice : remoteP.costPrice,
          totalQuantity: accurateStock
        });
      }

      // Preservar produtos que existem apenas localmente (criados offline)
      for (const localP of currentLocalProductsList) {
        if (!processedProductIds.has(localP.id) && !deletedProductIds.has(localP.id)) {
          const prodBatches = finalBatchesToSave.filter(b => b.productId === localP.id);
          const accurateStock = prodBatches.length > 0
            ? Math.max(0, prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0))
            : Math.max(0, Number(localP.totalQuantity) || 0);
          finalProductsToSave.push({
            ...localP,
            totalQuantity: accurateStock
          });
        }
      }

      // 7. Mesclagem inteligente de Faturas (Preservação estrita das faturas de 11 a 21 de setembro e offline)
      const currentLocalInvoices = await db.invoices.toArray();
      const localInvoiceMap = new Map(currentLocalInvoices.map(i => [i.id, i]));
      const localInvoiceNumMap = new Map(currentLocalInvoices.map(i => [i.invoiceNumber, i]));
      const finalInvoicesToSave: (Invoice & { synchronized?: boolean })[] = [];
      const processedInvoiceIds = new Set<string>();

      for (const remoteInv of mappedInvoices) {
        processedInvoiceIds.add(remoteInv.id);
        const localInv = localInvoiceMap.get(remoteInv.id) || localInvoiceNumMap.get(remoteInv.invoiceNumber);
        
        if (!localInv) {
          // Fatura remota inexistente localmente -> insere
          finalInvoicesToSave.push(remoteInv);
        } else {
          // Se a fatura local ainda não foi confirmada como sincronizada, ou possui itens detalhados salvos offline,
          // PRESERVA a versão local intacta para não perder itens nem dados de venda offline!
          if (localInv.synchronized === false || (!remoteInv.items || remoteInv.items.length === 0)) {
            finalInvoicesToSave.push({
              ...remoteInv,
              ...localInv,
              items: (localInv.items && localInv.items.length > 0) ? localInv.items : remoteInv.items,
              synchronized: localInv.synchronized ?? false
            });
          } else {
            // Remoto sincronizado
            finalInvoicesToSave.push({
              ...remoteInv,
              items: (remoteInv.items && remoteInv.items.length > 0) ? remoteInv.items : (localInv.items || []),
              synchronized: true
            });
          }
        }
      }

      // Adicionar todas as faturas locais que não vieram no payload do Supabase (ex: período de 11 a 21 de setembro)
      for (const localInv of currentLocalInvoices) {
        if (!processedInvoiceIds.has(localInv.id)) {
          finalInvoicesToSave.push(localInv);
        }
      }

      // 8. Mesclagem inteligente de Fechos de Caixa
      const currentLocalClosures = await db.dailyClosures.toArray();
      const localClosureMap = new Map(currentLocalClosures.map(c => [c.id, c]));
      const finalClosuresToSave: DailyClosure[] = [];
      const processedClosureIds = new Set<string>();

      for (const remoteC of mappedClosures) {
        processedClosureIds.add(remoteC.id);
        const localC = localClosureMap.get(remoteC.id);
        if (localC && localC.synchronized === false) {
          finalClosuresToSave.push(localC);
        } else {
          finalClosuresToSave.push(remoteC);
        }
      }

      for (const localC of currentLocalClosures) {
        if (!processedClosureIds.has(localC.id)) {
          finalClosuresToSave.push(localC);
        }
      }

      // 9. Atualizar o Dexie local de forma estritamente aditiva e inteligente
      await db.transaction('rw', [db.users, db.products, db.batches, db.invoices, db.dailyClosures], async () => {
        if (mappedUsers.length > 0) await db.users.bulkPut(mappedUsers);
        if (finalProductsToSave.length > 0) await db.products.bulkPut(finalProductsToSave);
        if (finalBatchesToSave.length > 0) await db.batches.bulkPut(finalBatchesToSave);
        if (finalInvoicesToSave.length > 0) await db.invoices.bulkPut(finalInvoicesToSave);
        if (finalClosuresToSave.length > 0) await db.dailyClosures.bulkPut(finalClosuresToSave);
      });

      const totalPulled = mappedUsers.length + finalProductsToSave.length + finalBatchesToSave.length + finalInvoicesToSave.length + finalClosuresToSave.length;

      return {
        success: true,
        pulled: totalPulled,
        message: `Sincronização concluída com sucesso! Todos os dados e faturas locais foram preservados e consolidados.`
      };
    } catch (err: any) {
      if (isQuotaExceededError(err)) {
        this.setQuotaRestricted(true, err?.message || 'Quota de transferência (egress) excedida ou Supabase temporariamente inacessível.');
        console.warn('[SyncService] Supabase temporariamente indisponível (limite de quota ou offline). Modo local seguro ativo no Dexie.');
        return {
          success: false,
          pulled: 0,
          message: 'Supabase temporariamente inacessível. Modo offline seguro ativado.'
        };
      }
      console.warn('[fetchAllFromSupabase Warning]', err?.message || err);
      return {
        success: false,
        pulled: 0,
        message: err?.message || 'Falha ao sincronizar com o Supabase.'
      };
    }
  },

  /**
   * Sincronização geral manual completa (Bidirecional: Envia faturas/fechos locais e traz novidades da nuvem)
   * Ordem estrita: LOCAL PENDING -> SUPABASE -> CONFIRMAÇÃO -> SUPABASE -> LOCAL (Regra 14)
   */
  async syncAll(): Promise<{ success: boolean; pushed: number; pulled: number; message: string }> {
    // 1. Processar a fila de operações pendentes (syncQueue) com confirmação individual
    try {
      await this.processQueue();
    } catch (qErr) {
      console.warn('[syncAll processQueue warning]', qErr);
    }

    // 2. Enviar dados pendentes diretos (faturas locais não sincronizadas)
    let pushRes = { success: false, pushed: 0, message: '' };
    try {
      pushRes = await this.pushAllLocalToSupabase();
    } catch (pushErr: any) {
      console.warn('[syncAll Push Warning]', pushErr);
    }

    // 3. Buscar os dados atualizados do Supabase preservando dados locais (sem clear())
    const pullRes = await this.fetchAllFromSupabase();

    const isSuccess = pushRes.success || pullRes.success;
    return {
      success: isSuccess,
      pushed: pushRes.pushed,
      pulled: pullRes.pulled,
      message: `Sincronização concluída! ${pushRes.pushed} registos locais enviados (upload) e ${pullRes.pulled} registos da nuvem recebidos (download).`
    };
  },

  // =========================================================================
  // OPERAÇÕES DE PRODUTO E LOTE (SAFE OFFLINE-FIRST COM TOMBSTONES E QUEUE)
  // =========================================================================

  /**
   * Executa a eliminação segura de um produto no Supabase de forma idempotente:
   * - Se já não existir no Supabase, considera com sucesso.
   * - Se tiver vendas históricas ou restrições de chave estrangeira (FK 23503),
   *   executa soft-delete (active: false, total_quantity: 0) e zera lotes,
   *   preservando 100% intactas as faturas históricas.
   * - Se não tiver vendas associadas, remove com segurança lotes e produto.
   */
  async executeDeleteProductOnSupabase(
    productId: string, 
    batchIds: string[] = [], 
    hasHistoricalInvoices: boolean = false
  ): Promise<{ success: boolean; softDeleted: boolean; message?: string }> {
    const supabase = getSupabase();
    if (!this.isConfigured() || !supabase || this.isQuotaRestricted()) {
      return { success: false, softDeleted: false, message: 'Supabase offline ou indisponível' };
    }

    try {
      // 1. Verificar se o produto ainda existe no Supabase
      const { data: remoteProd, error: checkErr } = await supabase
        .from('products')
        .select('id, active')
        .eq('id', productId)
        .maybeSingle();

      if (checkErr) {
        if (isQuotaExceededError(checkErr)) {
          this.setQuotaRestricted(true, checkErr.message);
        }
        return { success: false, softDeleted: false, message: checkErr.message };
      }

      // Se já não existe no Supabase, a operação já foi concluída com sucesso (idempotência perfeita)
      if (!remoteProd) {
        return { success: true, softDeleted: false };
      }

      // Se já estiver inativo (soft deleted), também já está concluída
      if (remoteProd.active === false) {
        return { success: true, softDeleted: true };
      }

      // 2. Se foi sinalizado que possui faturas históricas, faz soft delete direto para preservar histórico
      if (hasHistoricalInvoices) {
        const { error: softErr } = await supabase
          .from('products')
          .update({ active: false, total_quantity: 0, updated_at: new Date().toISOString() })
          .eq('id', productId);

        if (softErr) {
          if (isQuotaExceededError(softErr)) this.setQuotaRestricted(true, softErr.message);
          return { success: false, softDeleted: true, message: softErr.message };
        }

        // Zera quantidade dos lotes no Supabase para não inflacionar o estoque
        try {
          await supabase.from('batches').update({ quantity: 0 }).eq('product_id', productId);
        } catch (bErr) {}

        return { success: true, softDeleted: true };
      }

      // 3. Caso não haja histórico prévio conhecido, tenta hard delete seguro
      const { error: bDelErr } = await supabase.from('batches').delete().eq('product_id', productId);
      if (bDelErr) {
        // Se falhar por foreign key em invoice_items (código Postgres 23503)
        if (bDelErr.code === '23503' || bDelErr.message?.toLowerCase().includes('foreign key') || bDelErr.message?.toLowerCase().includes('violates foreign key')) {
          await supabase.from('products').update({ active: false, total_quantity: 0, updated_at: new Date().toISOString() }).eq('id', productId);
          await supabase.from('batches').update({ quantity: 0 }).eq('product_id', productId);
          return { success: true, softDeleted: true };
        }
        if (isQuotaExceededError(bDelErr)) this.setQuotaRestricted(true, bDelErr.message);
        return { success: false, softDeleted: false, message: bDelErr.message };
      }

      const { error: prodDelErr } = await supabase.from('products').delete().eq('id', productId);
      if (prodDelErr) {
        if (prodDelErr.code === '23503' || prodDelErr.message?.toLowerCase().includes('foreign key') || prodDelErr.message?.toLowerCase().includes('violates foreign key')) {
          await supabase.from('products').update({ active: false, total_quantity: 0, updated_at: new Date().toISOString() }).eq('id', productId);
          await supabase.from('batches').update({ quantity: 0 }).eq('product_id', productId);
          return { success: true, softDeleted: true };
        }
        if (isQuotaExceededError(prodDelErr)) this.setQuotaRestricted(true, prodDelErr.message);
        return { success: false, softDeleted: false, message: prodDelErr.message };
      }

      return { success: true, softDeleted: false };
    } catch (err: any) {
      if (isQuotaExceededError(err)) this.setQuotaRestricted(true, err.message);
      return { success: false, softDeleted: false, message: err?.message };
    }
  },

  async executeDeleteBatchOnSupabase(batchId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!this.isConfigured() || !supabase || this.isQuotaRestricted()) return false;

    try {
      const { data: bData } = await supabase.from('batches').select('id, product_id').eq('id', batchId).maybeSingle();
      if (!bData) return true; // Já eliminado

      const { error: delErr } = await supabase.from('batches').delete().eq('id', batchId);
      if (delErr) {
        if (delErr.code === '23503' || delErr.message?.toLowerCase().includes('foreign key')) {
          await supabase.from('batches').update({ quantity: 0 }).eq('id', batchId);
          return true;
        }
        if (isQuotaExceededError(delErr)) this.setQuotaRestricted(true, delErr.message);
        return false;
      }

      if (bData.product_id) {
        try {
          const { data: allB } = await supabase.from('batches').select('quantity').eq('product_id', bData.product_id);
          const newTot = (allB || []).reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
          await supabase.from('products').update({ total_quantity: newTot }).eq('id', bData.product_id);
        } catch (e) {}
      }

      return true;
    } catch (err: any) {
      return false;
    }
  },

  async createProduct(
    product: Product, 
    initialBatch?: { lotNumber: string; expiryDate: string; quantity: number }
  ): Promise<{ product: Product; batch?: Batch }> {
    const supabase = getSupabase();
    let createdBatch: Batch | undefined;

    // Remove qualquer tombstone prévio para este ID
    await db.deletedRecords.delete(product.id);

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Inserir ou atualizar produto no Supabase (UPSERT)
        const { error: prodErr } = await supabase.from('products').upsert({
          id: product.id,
          code: product.code,
          name: product.name,
          active_ingredient: product.activeIngredient,
          category: product.category,
          type: product.type || null,
          price_type: product.priceType,
          cost_price: product.costPrice,
          sell_price: product.sellPrice,
          has_vat: product.hasVAT,
          supplier: product.supplier || null,
          min_stock: product.minStock,
          total_quantity: product.totalQuantity,
          active: product.active,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        if (prodErr) {
          console.warn('[createProduct Supabase Warning]', prodErr);
          if (isQuotaExceededError(prodErr)) {
            this.setQuotaRestricted(true, prodErr.message);
          }
        }

        // 2. Se houver lote inicial, inserir lote no Supabase
        if (initialBatch && initialBatch.lotNumber.trim() && !this.isQuotaRestricted()) {
          createdBatch = {
            id: safeUUID(),
            productId: product.id,
            lotNumber: initialBatch.lotNumber.trim(),
            expiryDate: initialBatch.expiryDate,
            quantity: Math.max(0, initialBatch.quantity),
            entryDate: new Date().toISOString().split('T')[0]
          };

          await db.deletedRecords.delete(createdBatch.id);

          const { error: batchErr } = await supabase.from('batches').upsert({
            id: createdBatch.id,
            product_id: createdBatch.productId,
            lot_number: createdBatch.lotNumber,
            expiry_date: createdBatch.expiryDate,
            quantity: createdBatch.quantity,
            entry_date: createdBatch.entryDate
          }, { onConflict: 'id' });

          if (batchErr) {
            console.warn('[createProduct batch Supabase Warning]', batchErr);
            if (isQuotaExceededError(batchErr)) {
              this.setQuotaRestricted(true, batchErr.message);
            }
          }
        }
      } catch (err: any) {
        console.warn('[createProduct Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    if (!createdBatch && initialBatch && initialBatch.lotNumber.trim()) {
      createdBatch = {
        id: safeUUID(),
        productId: product.id,
        lotNumber: initialBatch.lotNumber.trim(),
        expiryDate: initialBatch.expiryDate,
        quantity: Math.max(0, initialBatch.quantity),
        entryDate: new Date().toISOString().split('T')[0]
      };
      await db.deletedRecords.delete(createdBatch.id);
    }

    // Salvar simultaneamente no Dexie local
    await db.products.put(product);
    if (createdBatch) {
      await db.batches.put(createdBatch);
    }
    this.broadcastLocalChange();

    return { product, batch: createdBatch };
  },

  async updateProduct(product: Product): Promise<void> {
    const supabase = getSupabase();

    // Remove qualquer tombstone prévio
    await db.deletedRecords.delete(product.id);

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        const { error } = await supabase.from('products').upsert({
          id: product.id,
          code: product.code,
          name: product.name,
          active_ingredient: product.activeIngredient,
          category: product.category,
          type: product.type || null,
          price_type: product.priceType,
          cost_price: product.costPrice,
          sell_price: product.sellPrice,
          has_vat: product.hasVAT,
          supplier: product.supplier || null,
          min_stock: product.minStock,
          total_quantity: product.totalQuantity,
          active: product.active,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        if (error) {
          console.warn('[updateProduct Supabase Warning]', error);
          if (isQuotaExceededError(error)) {
            this.setQuotaRestricted(true, error.message);
          }
        }
      } catch (err: any) {
        console.warn('[updateProduct Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Salvar simultaneamente no Dexie local
    await db.products.put(product);
    this.broadcastLocalChange();
  },

  /**
   * Eliminação segura, offline-first e resiliente de medicamento:
   * 1. Regista Tombstones imediatos em deletedRecords (para o produto e seus lotes).
   * 2. Expurga imediatamente da cache local Dexie para resposta instantânea ao utilizador.
   * 3. Cria operação com status PENDING na syncQueue para envio assíncrono garantido.
   * 4. Se online, executa a deleção no Supabase preservando faturas históricas.
   * 5. Só altera para SYNCED após confirmação explícita do Supabase.
   */
  async deleteProduct(productId: string, userId?: string): Promise<void> {
    // 1. Obter dados locais do produto e seus lotes antes de remover
    const product = await db.products.get(productId);
    const localBatches = await db.batches.where('productId').equals(productId).toArray();
    const batchIds = localBatches.map(b => b.id);

    // 2. Verificar se este produto ou algum dos seus lotes está presente em faturas históricas
    const allInvoices = await db.invoices.toArray();
    const hasHistoricalInvoices = allInvoices.some(inv => 
      inv.items && inv.items.some(it => it.productId === productId || batchIds.includes(it.batchId || ''))
    );

    // 3. REGISTRO IMEDIATO DO TOMBSTONE (db.deletedRecords):
    // Impede categoricamente qualquer ressurreição em sincronizações futuras
    const now = Date.now();
    await db.deletedRecords.put({ id: productId, table: 'products', timestamp: now });
    for (const bId of batchIds) {
      await db.deletedRecords.put({ id: bId, table: 'batches', timestamp: now });
    }

    // 4. Expurga imediatamente da Cache Local (Dexie) para o usuário ver o efeito instantâneo
    await db.products.delete(productId);
    for (const b of localBatches) {
      await db.batches.delete(b.id);
    }

    // 5. REGISTRO NA FILA DE OPERAÇÕES (syncQueue):
    // Garante que a deleção seja enviada ao Supabase offline-first e permaneça PENDING até confirmação
    const deviceId = this.getOrCreateDeviceId();
    const opId = safeUUID();
    const deleteOp: SyncOperation = {
      id: opId,
      operationId: opId,
      deviceId,
      userId: userId || undefined,
      entityType: 'PRODUCT',
      entityId: productId,
      operationType: SyncOperationType.DELETE,
      payload: {
        productId,
        productCode: product?.code,
        productName: product?.name,
        batchIds,
        hasHistoricalInvoices,
        deletedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      status: SyncOperationStatus.PENDING,
      attempts: 0
    };
    await db.syncQueue.put(deleteOp);

    // 6. Tentativa imediata no Supabase se online:
    // Apenas marca como SYNCED se o Supabase confirmar com sucesso!
    if (this.isConfigured() && !this.isQuotaRestricted()) {
      try {
        const result = await this.executeDeleteProductOnSupabase(productId, batchIds, hasHistoricalInvoices);
        if (result.success) {
          await db.syncQueue.update(opId, {
            status: SyncOperationStatus.SYNCED,
            syncedAt: new Date().toISOString()
          });
        }
      } catch (err: any) {
        console.warn('[deleteProduct Online Attempt Fallback]', err?.message || err);
      }
    }

    // 7. Notifica a aplicação sobre a alteração local
    this.broadcastLocalChange();
  },

  async createBatch(batch: Batch): Promise<void> {
    const supabase = getSupabase();

    // Remove qualquer tombstone prévio
    await db.deletedRecords.delete(batch.id);

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Inserir lote no Supabase
        const { error: batchErr } = await supabase.from('batches').upsert({
          id: batch.id,
          product_id: batch.productId,
          lot_number: batch.lotNumber,
          expiry_date: batch.expiryDate,
          quantity: Math.max(0, batch.quantity),
          entry_date: batch.entryDate
        }, { onConflict: 'id' });

        if (batchErr) {
          console.warn('[createBatch Supabase Warning]', batchErr);
          if (isQuotaExceededError(batchErr)) {
            this.setQuotaRestricted(true, batchErr.message);
          }
        }

        // 2. Recalcular stock total do produto no Supabase
        if (!this.isQuotaRestricted()) {
          try {
            const { data: allBatches } = await supabase.from('batches').select('quantity').eq('product_id', batch.productId);
            const newTotal = (allBatches || []).reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
            await supabase.from('products').update({ total_quantity: newTotal }).eq('id', batch.productId);
          } catch (pUpErr) {}
        }
      } catch (err: any) {
        console.warn('[createBatch Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Gravar simultaneamente no Dexie local
    await db.batches.put(batch);
    const prod = await db.products.get(batch.productId);
    if (prod) {
      const localBatches = await db.batches.where('productId').equals(batch.productId).toArray();
      prod.totalQuantity = localBatches.reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
      await db.products.put(prod);
    }
    this.broadcastLocalChange();
  },

  async updateBatch(batch: Batch): Promise<void> {
    const supabase = getSupabase();

    // Remove qualquer tombstone prévio
    await db.deletedRecords.delete(batch.id);

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Atualizar lote no Supabase
        const { error: batchErr } = await supabase.from('batches').upsert({
          id: batch.id,
          product_id: batch.productId,
          lot_number: batch.lotNumber,
          expiry_date: batch.expiryDate,
          quantity: Math.max(0, batch.quantity),
          entry_date: batch.entryDate
        }, { onConflict: 'id' });

        if (batchErr) {
          console.warn('[updateBatch Supabase Warning]', batchErr);
          if (isQuotaExceededError(batchErr)) {
            this.setQuotaRestricted(true, batchErr.message);
          }
        }

        // 2. Recalcular stock total do produto no Supabase
        if (!this.isQuotaRestricted()) {
          try {
            const { data: allBatches } = await supabase.from('batches').select('quantity').eq('product_id', batch.productId);
            const newTotal = (allBatches || []).reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
            await supabase.from('products').update({ total_quantity: newTotal }).eq('id', batch.productId);
          } catch (pUpErr) {}
        }
      } catch (err: any) {
        console.warn('[updateBatch Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Gravar simultaneamente no Dexie local
    await db.batches.put(batch);
    const prod = await db.products.get(batch.productId);
    if (prod) {
      const localBatches = await db.batches.where('productId').equals(batch.productId).toArray();
      prod.totalQuantity = localBatches.reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
      await db.products.put(prod);
    }
    this.broadcastLocalChange();
  },

  async deleteBatch(batchId: string, userId?: string): Promise<void> {
    const batch = await db.batches.get(batchId);
    const productId = batch?.productId;

    // 1. Tombstone imediato
    await db.deletedRecords.put({ id: batchId, table: 'batches', timestamp: Date.now() });

    // 2. Expurga do Dexie local
    await db.batches.delete(batchId);
    if (productId) {
      const prod = await db.products.get(productId);
      if (prod) {
        const localBatches = await db.batches.where('productId').equals(productId).toArray();
        prod.totalQuantity = localBatches.reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
        await db.products.put(prod);
      }
    }

    // 3. Fila de sincronização (PENDING até confirmação)
    const deviceId = this.getOrCreateDeviceId();
    const opId = safeUUID();
    const deleteOp: SyncOperation = {
      id: opId,
      operationId: opId,
      deviceId,
      userId: userId || undefined,
      entityType: 'BATCH',
      entityId: batchId,
      operationType: SyncOperationType.DELETE,
      payload: { batchId, productId, deletedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      status: SyncOperationStatus.PENDING,
      attempts: 0
    };
    await db.syncQueue.put(deleteOp);

    // 4. Tentativa online
    if (this.isConfigured() && !this.isQuotaRestricted()) {
      try {
        const ok = await this.executeDeleteBatchOnSupabase(batchId);
        if (ok) {
          await db.syncQueue.update(opId, {
            status: SyncOperationStatus.SYNCED,
            syncedAt: new Date().toISOString()
          });
        }
      } catch (err) {}
    }

    this.broadcastLocalChange();
  },

  // =========================================================================
  // OPERAÇÕES DE VENDA / FATURAS (SUPABASE FIRST COM FALLBACK OFFLINE SEGURO)
  // =========================================================================

  async createInvoice(invoice: Invoice): Promise<void> {
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Garantir que o utilizador/operador existe na tabela users do Supabase para evitar conflito de Foreign Key
        let validUserId: string | null = null;
        if (invoice.userId) {
          try {
            const localUser = await db.users.get(invoice.userId);
            if (localUser) {
              const { error: uErr } = await supabase.from('users').upsert({
                id: localUser.id,
                name: localUser.name,
                role: localUser.role,
                active: localUser.active ?? true,
                password: localUser.password || null
              }, { onConflict: 'id' });

              if (uErr) {
                if (isQuotaExceededError(uErr)) {
                  this.setQuotaRestricted(true, uErr.message);
                } else {
                  console.warn('[Supabase user upsert warning]:', uErr);
                }
              } else {
                validUserId = localUser.id;
              }
            } else {
              // Verificar se o ID já existe no Supabase
              const { data: remoteUser, error: rUserErr } = await supabase.from('users').select('id').eq('id', invoice.userId).maybeSingle();
              if (rUserErr && isQuotaExceededError(rUserErr)) {
                this.setQuotaRestricted(true, rUserErr.message);
              } else if (remoteUser) {
                validUserId = remoteUser.id;
              }
            }
          } catch (uErr: any) {
            if (isQuotaExceededError(uErr)) {
              this.setQuotaRestricted(true, uErr.message);
            } else {
              console.warn('[createInvoice user check warning]:', uErr);
            }
          }
        }

        if (!this.isQuotaRestricted()) {
          // 2. Inserir fatura no Supabase (UPSERT)
          const invoicePayload = {
            id: invoice.id,
            invoice_number: invoice.invoiceNumber,
            customer_id: invoice.customerId || null,
            customer_name: invoice.customerName || null,
            customer_nif: invoice.customerNif || null,
            user_id: validUserId,
            user_name: invoice.userName,
            date: invoice.date,
            total_gross: Number(invoice.totalGross) || 0,
            total_vat: Number(invoice.totalVAT) || 0,
            total_net: Number(invoice.totalNet) || 0,
            status: invoice.status,
            payment_method: invoice.paymentMethod,
            closed: Boolean(invoice.closed),
            closure_id: invoice.closureId || null,
            shift_number: invoice.shiftNumber || 1,
            shift_name: invoice.shiftName || '1º Turno'
          };

          console.log('[Supabase] A registar fatura na tabela "invoices"...', invoicePayload);
          let { error: invErr } = await supabase
            .from('invoices')
            .upsert(invoicePayload, { onConflict: 'id' });

          // Se a coluna 'closed' ou outras colunas de turno ainda não existirem na tabela invoices do Supabase do utilizador
          if (invErr && (invErr.code === 'PGRST204' || invErr.message?.includes('closed') || invErr.message?.includes('closure_id') || invErr.message?.includes('shift_'))) {
            console.warn('[Supabase] Tabela invoices antiga detectada sem colunas extras. A tentar envio seguro com campos essenciais...');
            const basePayload = {
              id: invoice.id,
              invoice_number: invoice.invoiceNumber,
              customer_id: invoice.customerId || null,
              customer_name: invoice.customerName || null,
              customer_nif: invoice.customerNif || null,
              user_id: validUserId,
              user_name: invoice.userName,
              date: invoice.date,
              total_gross: Number(invoice.totalGross) || 0,
              total_vat: Number(invoice.totalVAT) || 0,
              total_net: Number(invoice.totalNet) || 0,
              status: invoice.status,
              payment_method: invoice.paymentMethod
            };
            const retryResult = await supabase.from('invoices').upsert(basePayload, { onConflict: 'id' });
            invErr = retryResult.error;
          }

          if (invErr) {
            console.warn('[Supabase Invoices Warning]', invErr);
            this.setQuotaRestricted(true, invErr.message || 'Supabase indisponível no momento.');
          }
        }

        // 3. Inserir itens da fatura no Supabase se quota ok
        if (!this.isQuotaRestricted() && invoice.items && invoice.items.length > 0) {
          const itemsData = [];

          for (const item of invoice.items) {
            let linkedProductId: string | null = null;
            let linkedBatchId: string | null = null;

            // Valida existência do produto no Supabase
            if (item.productId) {
              try {
                const { data: prodCheck } = await supabase.from('products').select('id').eq('id', item.productId).maybeSingle();
                if (prodCheck) {
                  linkedProductId = prodCheck.id;
                } else {
                  const localProd = await db.products.get(item.productId);
                  if (localProd) {
                    const { error: pSyncErr } = await supabase.from('products').upsert({
                      id: localProd.id,
                      code: localProd.code,
                      name: localProd.name,
                      active_ingredient: localProd.activeIngredient,
                      category: localProd.category,
                      type: localProd.type,
                      price_type: localProd.priceType,
                      cost_price: localProd.costPrice,
                      sell_price: localProd.sellPrice,
                      has_vat: localProd.hasVAT,
                      supplier: localProd.supplier,
                      min_stock: localProd.minStock,
                      total_quantity: localProd.totalQuantity,
                      active: localProd.active
                    }, { onConflict: 'id' });
                    if (!pSyncErr) linkedProductId = localProd.id;
                  }
                }
              } catch (pErr) {}
            }

            // Valida existência do lote no Supabase
            if (item.batchId && linkedProductId) {
              try {
                const { data: batchCheck } = await supabase.from('batches').select('id').eq('id', item.batchId).maybeSingle();
                if (batchCheck) {
                  linkedBatchId = batchCheck.id;
                } else {
                  const localBatch = await db.batches.get(item.batchId);
                  if (localBatch) {
                    const { error: bSyncErr } = await supabase.from('batches').upsert({
                      id: localBatch.id,
                      product_id: localBatch.productId,
                      lot_number: localBatch.lotNumber,
                      expiry_date: localBatch.expiryDate,
                      quantity: localBatch.quantity,
                      entry_date: localBatch.entryDate
                    }, { onConflict: 'id' });
                    if (!bSyncErr) linkedBatchId = localBatch.id;
                  }
                }
              } catch (bErr) {}
            }

            itemsData.push({
              id: item.id || safeUUID(),
              invoice_id: invoice.id,
              product_id: linkedProductId,
              product_name: item.productName,
              batch_id: linkedBatchId,
              lot_number: item.lotNumber,
              quantity: item.quantity,
              unit_price: Number(item.unitPrice) || 0,
              subtotal: Number(item.subtotal) || 0,
              vat_amount: Number(item.vatAmount) || 0
            });
          }

          console.log('[Supabase] A registar itens da fatura na tabela "invoice_items"...', itemsData);
          const { error: itemsErr } = await supabase
            .from('invoice_items')
            .upsert(itemsData, { onConflict: 'id' });

          if (itemsErr) {
            console.warn('[Supabase Invoice Items Warning]', itemsErr);
            this.setQuotaRestricted(true, itemsErr.message || 'Supabase itens indisponíveis.');
          }

          // 4. Atualizar quantidades de lotes e produtos no Supabase se quota ok
          if (!this.isQuotaRestricted()) {
            for (const item of invoice.items) {
              if (item.batchId) {
                try {
                  const { data: curBatch } = await supabase.from('batches').select('quantity').eq('id', item.batchId).maybeSingle();
                  if (curBatch) {
                    const updatedQty = Math.max(0, (Number(curBatch.quantity) || 0) - item.quantity);
                    await supabase.from('batches').update({ quantity: updatedQty }).eq('id', item.batchId);
                  }
                } catch (bUpdateErr) {
                  console.warn('[Supabase batch stock update warning]:', bUpdateErr);
                }
              }

              if (item.productId) {
                try {
                  const { data: allBatches } = await supabase.from('batches').select('quantity').eq('product_id', item.productId);
                  if (allBatches) {
                    const totalStock = allBatches.reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
                    await supabase.from('products').update({ total_quantity: totalStock }).eq('id', item.productId);
                  }
                } catch (pUpdateErr) {
                  console.warn('[Supabase product stock update warning]:', pUpdateErr);
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('[createInvoice Supabase Fallback]', err?.message || err);
        this.setQuotaRestricted(true, err?.message || 'Supabase temporariamente inacessível.');
      }
    }

    // Atualizar simultaneamente no Dexie local (Fonte da verdade garantida)
    try {
      await db.invoices.put({ ...invoice, synchronized: !this.isQuotaRestricted() });
      for (const item of invoice.items) {
        if (item.batchId) {
          const batch = await db.batches.get(item.batchId);
          if (batch) {
            batch.quantity = Math.max(0, (Number(batch.quantity) || 0) - (Number(item.quantity) || 0));
            await db.batches.put(batch);
          }
        }
        if (item.productId) {
          const prod = await db.products.get(item.productId);
          if (prod) {
            const prodBatches = await db.batches.where('productId').equals(item.productId).toArray();
            prod.totalQuantity = prodBatches.reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
            await db.products.put(prod);
          }
        }
      }
      this.broadcastLocalChange();
    } catch (localErr: any) {
      console.error('[createInvoice Dexie Warning]', localErr);
      // Fallback final direto na fatura
      await db.invoices.put({ ...invoice, synchronized: false });
      this.broadcastLocalChange();
    }
  },

  async cancelInvoice(invoiceId: string): Promise<void> {
    const invoice = await db.invoices.get(invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    // Prevenção de duplicidade: se já foi anulada, não reverter stock novamente
    if (invoice.status === InvoiceStatus.CANCELLED) {
      console.warn('[cancelInvoice] Fatura já se encontra anulada.');
      return;
    }

    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Atualizar status da fatura no Supabase para 'Anulada'
        const { error: invErr } = await supabase.from('invoices').update({
          status: InvoiceStatus.CANCELLED
        }).eq('id', invoiceId);

        if (invErr) {
          console.warn('[cancelInvoice Supabase Warning]', invErr);
          if (isQuotaExceededError(invErr)) {
            this.setQuotaRestricted(true, invErr.message);
          }
        }

        // 2. Devolver stock aos lotes e produtos no Supabase
        if (!this.isQuotaRestricted() && invoice.items && invoice.items.length > 0) {
          for (const item of invoice.items) {
            const itemQty = Number(item.quantity) || 0;
            if (item.batchId && itemQty > 0) {
              try {
                const { data: curBatch } = await supabase.from('batches').select('quantity').eq('id', item.batchId).single();
                if (curBatch) {
                  const restoredQty = (Number(curBatch.quantity) || 0) + itemQty;
                  await supabase.from('batches').update({ quantity: restoredQty }).eq('id', item.batchId);
                }
              } catch (bErr) {}
            }

            if (item.productId) {
              try {
                const { data: allBatches } = await supabase.from('batches').select('quantity').eq('product_id', item.productId);
                const totalStock = (allBatches || []).reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
                await supabase.from('products').update({ total_quantity: totalStock }).eq('id', item.productId);
              } catch (pErr) {}
            }
          }
        }
      } catch (err: any) {
        console.warn('[cancelInvoice Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err?.message || 'Supabase temporariamente inacessível.');
        }
      }
    }

    // Atualizar simultaneamente no Dexie local com devolução matemática exata
    invoice.status = InvoiceStatus.CANCELLED;
    invoice.synchronized = !this.isQuotaRestricted();
    await db.invoices.put(invoice);

    if (invoice.items && invoice.items.length > 0) {
      const affectedProductIds = new Set<string>();

      for (const item of invoice.items) {
        const itemQty = Number(item.quantity) || 0;
        if (item.batchId && itemQty > 0) {
          const batch = await db.batches.get(item.batchId);
          if (batch) {
            await db.batches.update(item.batchId, {
              quantity: (Number(batch.quantity) || 0) + itemQty
            });
          }
        }
        if (item.productId) {
          affectedProductIds.add(item.productId);
        }
      }

      for (const prodId of affectedProductIds) {
        const productBatches = await db.batches.where('productId').equals(prodId).toArray();
        if (productBatches.length > 0) {
          const accurateTotal = productBatches.reduce(
            (sum, b) => sum + Math.max(0, Number(b.quantity) || 0),
            0
          );
          await db.products.update(prodId, { totalQuantity: accurateTotal });
        } else {
          const prod = await db.products.get(prodId);
          if (prod) {
            const restoredSum = invoice.items
              .filter(i => i.productId === prodId)
              .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
            await db.products.update(prodId, {
              totalQuantity: (Number(prod.totalQuantity) || 0) + restoredSum
            });
          }
        }
      }
    }

    this.broadcastLocalChange();
  },

  async cancelInvoiceItem(invoiceId: string, itemId: string): Promise<void> {
    const invoice = await db.invoices.get(invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    const targetItem = invoice.items.find(i => i.id === itemId);
    if (!targetItem) throw new Error('Item não encontrado na fatura.');

    const remainingItems = invoice.items.filter(i => i.id !== itemId);
    const targetQty = Number(targetItem.quantity) || 0;
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Eliminar item da fatura no Supabase
        const { error: itemDelErr } = await supabase.from('invoice_items').delete().eq('id', itemId);
        if (itemDelErr) {
          console.warn('[cancelInvoiceItem Supabase Warning]', itemDelErr);
          if (isQuotaExceededError(itemDelErr)) {
            this.setQuotaRestricted(true, itemDelErr.message);
          }
        }

        // 2. Restaurar stock do lote e produto no Supabase
        if (!this.isQuotaRestricted()) {
          if (targetItem.batchId && targetQty > 0) {
            try {
              const { data: curBatch } = await supabase.from('batches').select('quantity').eq('id', targetItem.batchId).single();
              if (curBatch) {
                const restoredQty = (Number(curBatch.quantity) || 0) + targetQty;
                await supabase.from('batches').update({ quantity: restoredQty }).eq('id', targetItem.batchId);
              }
            } catch (bErr) {}
          }

          if (targetItem.productId) {
            try {
              const { data: allBatches } = await supabase.from('batches').select('quantity').eq('product_id', targetItem.productId);
              const totalStock = (allBatches || []).reduce((acc, b) => acc + Math.max(0, Number(b.quantity) || 0), 0);
              await supabase.from('products').update({ total_quantity: totalStock }).eq('id', targetItem.productId);
            } catch (pErr) {}
          }

          // 3. Se não sobrarem itens, anular fatura; caso contrário, recalcular totais
          if (remainingItems.length === 0) {
            try {
              await supabase.from('invoices').update({
                status: InvoiceStatus.CANCELLED,
                total_gross: 0,
                total_vat: 0,
                total_net: 0
              }).eq('id', invoiceId);
            } catch (invUpErr) {}
          } else {
            const newGross = remainingItems.reduce((sum, it) => sum + it.subtotal, 0);
            const newVAT = remainingItems.reduce((sum, it) => sum + it.vatAmount, 0);
            const newNet = newGross + newVAT;

            try {
              await supabase.from('invoices').update({
                total_gross: newGross,
                total_vat: newVAT,
                total_net: newNet
              }).eq('id', invoiceId);
            } catch (invUpErr) {}
          }
        }
      } catch (err: any) {
        console.warn('[cancelInvoiceItem Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Atualizar simultaneamente no Dexie local
    if (targetItem.batchId && targetQty > 0) {
      const batch = await db.batches.get(targetItem.batchId);
      if (batch) {
        await db.batches.update(targetItem.batchId, {
          quantity: (Number(batch.quantity) || 0) + targetQty
        });
      }
    }

    if (targetItem.productId) {
      const productBatches = await db.batches.where('productId').equals(targetItem.productId).toArray();
      if (productBatches.length > 0) {
        const exactSum = productBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0);
        await db.products.update(targetItem.productId, { totalQuantity: exactSum });
      } else {
        const prod = await db.products.get(targetItem.productId);
        if (prod) {
          await db.products.update(targetItem.productId, {
            totalQuantity: (Number(prod.totalQuantity) || 0) + targetQty
          });
        }
      }
    }

    if (remainingItems.length === 0) {
      invoice.status = InvoiceStatus.CANCELLED;
      invoice.items = [];
      invoice.totalGross = 0;
      invoice.totalVAT = 0;
      invoice.totalNet = 0;
    } else {
      invoice.items = remainingItems;
      invoice.totalGross = remainingItems.reduce((sum, it) => sum + it.subtotal, 0);
      invoice.totalVAT = remainingItems.reduce((sum, it) => sum + it.vatAmount, 0);
      invoice.totalNet = invoice.totalGross + invoice.totalVAT;
    }
    await db.invoices.put(invoice);
    this.broadcastLocalChange();
  },

  async deleteInvoice(invoiceId: string): Promise<void> {
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Eliminar itens da fatura no Supabase
        const { error: itemsErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
        if (itemsErr) {
          console.warn('[deleteInvoice itemsErr Warning]', itemsErr);
          if (isQuotaExceededError(itemsErr)) {
            this.setQuotaRestricted(true, itemsErr.message);
          }
        }

        if (!this.isQuotaRestricted()) {
          // 2. Eliminar a fatura no Supabase
          const { error: invErr } = await supabase.from('invoices').delete().eq('id', invoiceId);
          if (invErr) {
            console.warn('[deleteInvoice invErr Warning]', invErr);
            if (isQuotaExceededError(invErr)) {
              this.setQuotaRestricted(true, invErr.message);
            }
          }
        }
      } catch (err: any) {
        console.warn('[deleteInvoice Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Expurga da Cache Local
    await db.invoices.delete(invoiceId);
    this.broadcastLocalChange();
  },

  async deleteInvoicesBatch(invoiceIds: string[]): Promise<{ count: number }> {
    if (!invoiceIds || invoiceIds.length === 0) return { count: 0 };

    const uniqueIds = Array.from(new Set(invoiceIds));
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // Eliminar itens das faturas em lotes no Supabase
        const chunkSize = 50;
        for (let i = 0; i < uniqueIds.length; i += chunkSize) {
          if (this.isQuotaRestricted()) break;
          const chunk = uniqueIds.slice(i, i + chunkSize);
          const { error: itemErr } = await supabase.from('invoice_items').delete().in('invoice_id', chunk);
          if (itemErr) {
            console.warn('[deleteInvoicesBatch itemErr Warning]', itemErr);
            if (isQuotaExceededError(itemErr)) {
              this.setQuotaRestricted(true, itemErr.message);
              break;
            }
          }

          const { error: invErr } = await supabase.from('invoices').delete().in('id', chunk);
          if (invErr) {
            console.warn('[deleteInvoicesBatch invErr Warning]', invErr);
            if (isQuotaExceededError(invErr)) {
              this.setQuotaRestricted(true, invErr.message);
              break;
            }
          }
        }
      } catch (err: any) {
        console.warn('[deleteInvoicesBatch Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Expurga da Cache Local
    await db.invoices.bulkDelete(uniqueIds);
    this.broadcastLocalChange();

    return { count: uniqueIds.length };
  },

  // =========================================================================
  // OPERAÇÕES DE UTILIZADOR (SUPABASE FIRST COM FALLBACK OFFLINE SEGURO)
  // =========================================================================

  async createUser(user: User): Promise<void> {
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        const { error } = await supabase.from('users').upsert({
          id: user.id,
          name: user.name,
          role: user.role,
          active: user.active ?? true,
          password: user.password || null
        }, { onConflict: 'id' });

        if (error) {
          console.warn('[createUser Supabase Warning]', error);
          if (isQuotaExceededError(error)) {
            this.setQuotaRestricted(true, error.message);
          }
        }
      } catch (err: any) {
        console.warn('[createUser Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Salvar simultaneamente no Dexie local
    await db.users.put(user);
    this.broadcastLocalChange();
  },

  async updateUser(user: User): Promise<void> {
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        const { error } = await supabase.from('users').upsert({
          id: user.id,
          name: user.name,
          role: user.role,
          active: user.active,
          password: user.password || null
        }, { onConflict: 'id' });

        if (error) {
          console.warn('[updateUser Supabase Warning]', error);
          if (isQuotaExceededError(error)) {
            this.setQuotaRestricted(true, error.message);
          }
        }
      } catch (err: any) {
        console.warn('[updateUser Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Salvar simultaneamente no Dexie local
    await db.users.put(user);
    this.broadcastLocalChange();
  },

  async deleteUser(userId: string): Promise<void> {
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Desvincular faturas e fechos de caixa deste utilizador para não bloquear FK
        try {
          await supabase.from('invoices').update({ user_id: null }).eq('user_id', userId);
          await supabase.from('daily_closures').update({ user_id: null }).eq('user_id', userId);
        } catch (uFkErr) {}

        // 2. Eliminar o utilizador no Supabase
        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (error) {
          console.warn('[deleteUser Supabase Warning]', error);
          if (isQuotaExceededError(error)) {
            this.setQuotaRestricted(true, error.message);
          }
        }
      } catch (err: any) {
        console.warn('[deleteUser Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Expurga da Cache Local
    await db.users.delete(userId);
    this.broadcastLocalChange();
  },

  // =========================================================================
  // OPERAÇÕES DE FECHO DE CAIXA (SUPABASE FIRST COM FALLBACK OFFLINE SEGURO)
  // =========================================================================

  /**
   * Realiza o fecho diário automático quando forem 00:00 ou posterior
   * caso existam faturas de dias anteriores ainda em aberto.
   * Libera e dá início imediato às vendas do novo dia (1º Turno).
   */
  async performAutoMidnightClosureIfNeeded(): Promise<{ closedDaysCount: number; closuresCreated: DailyClosure[] }> {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const unclosedInvoices = await db.invoices
      .filter(inv => !inv.closed && inv.status !== InvoiceStatus.CANCELLED)
      .toArray();

    if (unclosedInvoices.length === 0) {
      return { closedDaysCount: 0, closuresCreated: [] };
    }

    const invoicesByDate: Record<string, Invoice[]> = {};
    for (const inv of unclosedInvoices) {
      const invDate = (inv.date || '').split('T')[0];
      if (!invDate) continue;
      if (invDate < todayStr) {
        if (!invoicesByDate[invDate]) {
          invoicesByDate[invDate] = [];
        }
        invoicesByDate[invDate].push(inv);
      }
    }

    const pastDates = Object.keys(invoicesByDate).sort();
    if (pastDates.length === 0) {
      return { closedDaysCount: 0, closuresCreated: [] };
    }

    console.log(`[AutoMidnightClosure] A detetar ${pastDates.length} dia(s) anterior(es) pendente(s) de fecho às 00:00:`, pastDates);

    const closuresCreated: DailyClosure[] = [];

    for (const pastDate of pastDates) {
      const dayInvoices = invoicesByDate[pastDate];
      if (dayInvoices.length === 0) continue;

      const shiftsFound = Array.from(new Set(dayInvoices.map(i => i.shiftNumber || 1))).sort((a, b) => a - b);
      const shiftBreakdowns = shiftsFound.map(shiftNum => {
        const sInvs = dayInvoices.filter(i => (i.shiftNumber || 1) === shiftNum);
        const sCash = sInvs.filter(i => i.paymentMethod === 'Numerário' || i.paymentMethod === 'Dinheiro').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
        const sTpa = sInvs.filter(i => i.paymentMethod === 'Multicaixa' || i.paymentMethod === 'TPA' || i.paymentMethod === 'Cartão').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
        const sTransfer = sInvs.filter(i => i.paymentMethod === 'Transferência').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
        const sMixed = sInvs.filter(i => i.paymentMethod === 'Misto').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
        const sTotal = sCash + sTpa + sTransfer + sMixed;
        const shiftName = sInvs[0]?.shiftName || `${shiftNum}º Turno`;
        const operator = sInvs[sInvs.length - 1]?.userName || 'Sistema (Fecho Automático 00:00)';

        return {
          shiftNumber: shiftNum,
          shiftName,
          operator,
          totalInvoices: sInvs.length,
          totalCash: sCash,
          totalTpa: sTpa,
          totalTransfer: sTransfer,
          totalMixed: sMixed,
          grandTotal: sTotal,
          closedAt: `${pastDate}T23:59:59.999Z`
        };
      });

      const totalCash = dayInvoices.filter(i => i.paymentMethod === 'Numerário' || i.paymentMethod === 'Dinheiro').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
      const totalTpa = dayInvoices.filter(i => i.paymentMethod === 'Multicaixa' || i.paymentMethod === 'TPA' || i.paymentMethod === 'Cartão').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
      const totalTransfer = dayInvoices.filter(i => i.paymentMethod === 'Transferência').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
      const totalMixed = dayInvoices.filter(i => i.paymentMethod === 'Misto').reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
      const grandTotal = totalCash + totalTpa + totalTransfer + totalMixed;

      // Chave determinística para evitar duplicatas em múltiplos computadores (Regra 34)
      const deterministicClosureId = `CLOSURE_${pastDate}_GENERAL_1`;
      const existingClosure = await db.dailyClosures.get(deterministicClosureId);
      if (existingClosure) {
        // Já foi fechado por outro terminal ou em execução prévia
        for (const inv of dayInvoices) {
          await db.invoices.update(inv.id, {
            closed: true,
            closureId: deterministicClosureId
          });
        }
        continue;
      }

      const autoClosure: DailyClosure = {
        id: deterministicClosureId,
        operationId: `OP_${deterministicClosureId}`,
        deviceId: DeviceService.getDeviceId(),
        date: pastDate,
        userId: 'system_auto_midnight',
        userName: 'Sistema (Fecho Automático 00:00)',
        type: 'GENERAL',
        shiftNumber: 1,
        shiftName: 'Fecho Geral Automático 00:00',
        totalCash,
        totalTpa,
        totalTransfer,
        totalMixed,
        totalInvoices: dayInvoices.length,
        grandTotal,
        timestamp: `${pastDate}T23:59:59.999Z`,
        shiftBreakdowns
      };

      try {
        await this.createClosure(autoClosure, dayInvoices);
        closuresCreated.push(autoClosure);
      } catch (closureErr) {
        console.warn(`[AutoMidnightClosure] Aviso ao salvar fecho automático para ${pastDate}:`, closureErr);
        await db.dailyClosures.put(autoClosure);
        for (const inv of dayInvoices) {
          await db.invoices.update(inv.id, {
            closed: true,
            closureId: autoClosure.id,
            synchronized: false
          });
        }
        closuresCreated.push(autoClosure);
      }
    }

    this.broadcastLocalChange();

    return {
      closedDaysCount: closuresCreated.length,
      closuresCreated
    };
  },

  async createClosure(closure: DailyClosure, closedInvoices: Invoice[]): Promise<void> {
    const supabase = getSupabase();

    if (this.isConfigured() && supabase && !this.isQuotaRestricted()) {
      try {
        // 1. Inserir fecho no Supabase (UPSERT)
        const { error: closErr } = await supabase.from('daily_closures').upsert({
          id: closure.id,
          date: closure.date,
          user_id: closure.userId || null,
          user_name: closure.userName,
          type: closure.type || 'SHIFT',
          shift_number: closure.shiftNumber || 1,
          shift_name: closure.shiftName || '1º Turno',
          total_cash: closure.totalCash,
          total_tpa: closure.totalTpa,
          total_transfer: closure.totalTransfer,
          total_mixed: closure.totalMixed,
          total_invoices: closure.totalInvoices,
          grand_total: closure.grandTotal,
          timestamp: closure.timestamp,
          shift_breakdowns: closure.shiftBreakdowns || null
        }, { onConflict: 'id' });

        if (closErr) {
          console.warn('[createClosure Supabase Warning]', closErr);
          if (isQuotaExceededError(closErr)) {
            this.setQuotaRestricted(true, closErr.message);
          }
        }

        // 2. Atualizar faturas fechadas no Supabase
        if (!this.isQuotaRestricted()) {
          const invoiceIds = closedInvoices.map(inv => inv.id);
          if (invoiceIds.length > 0) {
            try {
              await supabase.from('invoices').update({
                closed: true,
                closure_id: closure.id,
                shift_number: closure.shiftNumber || 1,
                shift_name: closure.shiftName || '1º Turno'
              }).in('id', invoiceIds);
            } catch (invErr) {}
          }
        }
      } catch (err: any) {
        console.warn('[createClosure Supabase Fallback]', err?.message || err);
        if (isQuotaExceededError(err)) {
          this.setQuotaRestricted(true, err.message);
        }
      }
    }

    // Gravar simultaneamente no Dexie local
    await db.dailyClosures.put(closure);
    for (const inv of closedInvoices) {
      await db.invoices.put({ ...inv, synchronized: !this.isQuotaRestricted() });
    }
    this.broadcastLocalChange();
  }
};
