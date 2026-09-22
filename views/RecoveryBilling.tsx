import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Product, Batch, Invoice, User, InvoiceItem, InvoiceStatus, StockMovementType } from '../types';
import { COMPANY_INFO, VAT_RATE, PAYMENT_METHODS } from '../constants';
import { db } from '../services/db';
import { DeviceService } from '../services/deviceService';
import { SyncService } from '../services/syncService';
import { 
  Search, Trash2, Banknote, CreditCard, Landmark, Layers, History, X, Plus, Minus, 
  Printer as PrinterIcon, CheckCircle, FileText, AlertCircle, ShieldCheck, ArrowRight, 
  Calendar, Clock, Check, RefreshCw, AlertTriangle, ArrowUpDown, Tag
} from 'lucide-react';

interface RecoveryBillingProps {
  user: User;
  products: Product[];
  batches: Batch[];
  invoices?: Invoice[];
  onCompleteSale: (invoice: Invoice) => Promise<void> | void;
  onLogout: () => void;
  onRefreshData?: () => Promise<void>;
}

export const RecoveryBilling: React.FC<RecoveryBillingProps> = ({
  user,
  products,
  batches,
  invoices = [],
  onCompleteSale,
  onLogout,
  onRefreshData
}) => {
  // Configuração da data e hora retroativa (padrão 11/09/2026 ou data padrão no passado)
  const [retroactiveDate, setRetroactiveDate] = useState<string>('2026-09-11');
  const [retroactiveTime, setRetroactiveTime] = useState<string>('12:00');
  const [useCustomNumber, setUseCustomNumber] = useState<boolean>(false);
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState<string>('');
  const [autoInvoiceNumber, setAutoInvoiceNumber] = useState<string>('RET-2026-09-0001');

  // Estado do Carrinho e POS
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerNif, setCustomerNif] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [isFinishing, setIsFinishing] = useState(false);

  // Lista de Faturas Recuperadas (ordenadas por ordem crescente de dia e mês)
  const [recoveredInvoices, setRecoveredInvoices] = useState<Invoice[]>([]);
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<Invoice | null>(null);
  const [toastMessage, setToastMessage] = useState<{ title: string; subtitle: string } | null>(null);

  // Carrega e gera o próximo número sequencial RET-YYYY-MM-XXXX
  const refreshAutoInvoiceNumber = useCallback(async (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const year = isNaN(d.getFullYear()) ? 2026 : d.getFullYear();
      const month = isNaN(d.getMonth()) ? '09' : String(d.getMonth() + 1).padStart(2, '0');
      const prefix = `RET-${year}-${month}-`;

      const allInvs = await db.invoices.toArray();
      const matching = allInvs.filter(i => 
        (i.invoiceNumber && i.invoiceNumber.startsWith(prefix)) ||
        (i.invoiceNumber && i.invoiceNumber.startsWith(`RET-${year}-`))
      );
      const nextSeq = matching.length + 1;
      const nextNum = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      setAutoInvoiceNumber(nextNum);
    } catch (err) {
      console.error('Erro ao gerar número retroativo:', err);
    }
  }, []);

  // Carrega todas as faturas recuperadas / retroativas do banco local ordenadas em ordem crescente de dias e meses
  const loadRecoveredInvoices = useCallback(async () => {
    try {
      const allInvs = await db.invoices.toArray();
      const retroInvs = allInvs
        .filter(inv => inv.isRetroactive || (inv.invoiceNumber && inv.invoiceNumber.startsWith('RET-')))
        // ORDEM CRESCENTE DOS DIAS E DOS MESES (Cronológica da mais antiga para a mais recente)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''));
      
      setRecoveredInvoices(retroInvs);
    } catch (err) {
      console.error('Erro ao carregar faturas recuperadas:', err);
    }
  }, []);

  useEffect(() => {
    refreshAutoInvoiceNumber(retroactiveDate);
  }, [retroactiveDate, refreshAutoInvoiceNumber]);

  useEffect(() => {
    loadRecoveredInvoices();
  }, [loadRecoveredInvoices, invoices]);

  // Resumo do Carrinho
  const cartSummary = useMemo(() => {
    const gross = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const vat = cart.reduce((sum, item) => sum + item.vatAmount, 0);
    return { gross, vat, net: gross + vat };
  }, [cart]);

  // Filtragem de Produtos
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return products.filter(p => 
      p.active && (p.name.toLowerCase().includes(term) || (p.code && p.code.toLowerCase().includes(term)))
    );
  }, [products, searchTerm]);

  // Adicionar produto ao carrinho
  const addToCart = (product: Product) => {
    // Procura lote com stock disponível
    const availableBatches = batches
      .filter(b => b.productId === product.id && b.quantity > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    if (availableBatches.length === 0) {
      alert(`O produto "${product.name}" não possui nenhum lote com stock disponível.`);
      return;
    }

    const batch = availableBatches[0];
    const existing = cart.find(item => item.productId === product.id && item.batchId === batch.id);

    if (existing) {
      updateQuantity(existing.id, 1);
    } else {
      const subtotal = product.sellPrice;
      const vatAmount = product.hasVAT ? subtotal * VAT_RATE : 0;
      const newItem: InvoiceItem = {
        id: DeviceService.generateOperationId(),
        productId: product.id,
        productName: product.name,
        batchId: batch.id,
        lotNumber: batch.lotNumber,
        quantity: 1,
        unitPrice: product.sellPrice,
        subtotal: subtotal,
        vatAmount: vatAmount,
        costPriceHistorical: product.costPrice || 0,
        totalCostHistorical: product.costPrice || 0
      };
      setCart(prev => [...prev, newItem]);
    }
    setSearchTerm('');
  };

  // Atualizar quantidade no carrinho
  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.id === itemId) {
        const batch = batches.find(b => b.id === item.batchId);
        const newQty = Math.max(1, item.quantity + delta);
        if (batch && newQty > batch.quantity) {
          alert(`Stock insuficiente no lote ${batch.lotNumber}! Quantidade máxima disponível: ${batch.quantity}`);
          return item;
        }
        const subtotal = newQty * item.unitPrice;
        const product = products.find(p => p.id === item.productId);
        return {
          ...item,
          quantity: newQty,
          subtotal: subtotal,
          vatAmount: (product?.hasVAT) ? subtotal * VAT_RATE : 0,
          totalCostHistorical: (item.costPriceHistorical || 0) * newQty
        };
      }
      return item;
    }));
  };

  // Remover item do carrinho
  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  // Finalizar e Gravar Venda Retroativa
  const handleFinishSale = async (shouldPrint: boolean = false) => {
    if (cart.length === 0 || isFinishing) return;

    if (!retroactiveDate) {
      alert('Por favor, informe a Data da Venda Retroativa.');
      return;
    }

    try {
      setIsFinishing(true);

      // Constrói a data/hora retroativa real
      const combinedDateTime = new Date(`${retroactiveDate}T${retroactiveTime || '12:00'}:00`);
      const saleDateIso = isNaN(combinedDateTime.getTime()) ? `${retroactiveDate}T12:00:00.000Z` : combinedDateTime.toISOString();
      const launchDateIso = new Date().toISOString(); // Data do lançamento: Hoje (21/09/2026)

      const finalInvoiceNumber = useCustomNumber && customInvoiceNumber.trim()
        ? customInvoiceNumber.trim().toUpperCase()
        : autoInvoiceNumber;

      const newInvoice: Invoice = {
        id: DeviceService.generateOperationId(),
        invoiceNumber: finalInvoiceNumber,
        operationId: DeviceService.generateOperationId(),
        deviceId: DeviceService.getDeviceId(),
        customerName: customerName.trim() || 'Consumidor Final',
        customerNif: customerNif.trim() || '999999999',
        userId: user.id,
        userName: user.name,
        date: saleDateIso, // Data da venda no passado (ex: 11/09/2026)
        createdAt: launchDateIso, // Data do lançamento: Hoje
        isRetroactive: true,
        retroactiveType: 'RETROATIVA / RECUPERADA',
        originalSaleDate: saleDateIso,
        totalGross: cartSummary.gross,
        totalVAT: cartSummary.vat,
        totalNet: cartSummary.net,
        status: InvoiceStatus.ISSUED,
        paymentMethod: paymentMethod,
        items: [...cart],
        closed: true, // Já pertence a período passado, portanto fica fechada
        shiftNumber: 1,
        shiftName: 'Recuperação Histórica'
      };

      // 1. Processa a venda com dedução exata de stock via onCompleteSale / SaleService
      await onCompleteSale(newInvoice);

      // 2. Notifica e atualiza a interface
      setToastMessage({
        title: 'Fatura Recuperada com Sucesso!',
        subtitle: `${newInvoice.invoiceNumber} registrada com data de ${new Date(saleDateIso).toLocaleDateString('pt-AO')} • Lançada hoje (${new Date().toLocaleDateString('pt-AO')})`
      });

      // 3. Limpa o carrinho
      setCart([]);
      setCustomerName('');
      setCustomerNif('');
      if (useCustomNumber) {
        setCustomInvoiceNumber('');
      }

      // 4. Recarrega os dados locais
      await loadRecoveredInvoices();
      await refreshAutoInvoiceNumber(retroactiveDate);
      if (onRefreshData) {
        await onRefreshData();
      }

      // 5. Impressão se solicitada
      if (shouldPrint) {
        setLastCreatedInvoice(newInvoice);
        setTimeout(() => {
          window.print();
        }, 350);
      }
    } catch (err: any) {
      console.error('Erro ao registrar fatura retroativa:', err);
      alert(`Erro ao registrar venda: ${err?.message || err}`);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-[250] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-emerald-500/30 flex items-start gap-3 animate-fade-in max-w-md">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-sm text-emerald-300">{toastMessage.title}</h4>
            <p className="text-xs text-slate-300 mt-0.5">{toastMessage.subtitle}</p>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CABEÇALHO DO MÓDULO */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <History className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-amber-950/40 rounded-full border border-amber-300/30">
                  Lançamento Retroativo
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 bg-emerald-500 text-slate-950 rounded-full">
                  Offline-First & Supabase
                </span>
              </div>
              <h2 className="text-2xl font-black tracking-tight mt-1">Recuperar Vendas Antigas</h2>
            </div>
          </div>
          <p className="text-xs text-amber-100 max-w-2xl mt-2 leading-relaxed">
            Permite cadastrar faturas realizadas anteriormente (ex: entre <strong>10/09</strong> e <strong>21/09</strong>) que não foram enviadas ou foram perdidas. 
            O estoque atual dos medicamentos será reduzido <strong>exatamente</strong> pela quantidade lançada.
          </p>
        </div>

        <div className="bg-amber-950/40 border border-amber-400/30 rounded-2xl p-4 w-full md:w-auto min-w-[280px]">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-200 flex items-center justify-between">
            <span>Data de Lançamento (Hoje):</span>
            <span className="font-mono text-white bg-white/20 px-2 py-0.5 rounded">
              {new Date().toLocaleDateString('pt-AO')}
            </span>
          </div>
          <div className="mt-2 text-[10px] font-black uppercase tracking-wider text-amber-200 flex items-center justify-between">
            <span>Faturas Recuperadas:</span>
            <span className="font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded font-bold">
              {recoveredInvoices.length} Registadas
            </span>
          </div>
        </div>
      </div>

      {/* PAINEL CENTRAL DE CONFIGURAÇÃO DA DATA DA VENDA E NÚMERO */}
      <div className="bg-white border-2 border-amber-500/30 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          {/* Data e Hora Retroativa */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-600" />
              <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight">
                1. Data Real da Venda Original (Retroativa)
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Dia / Mês / Ano</label>
                <input 
                  type="date"
                  value={retroactiveDate}
                  onChange={(e) => setRetroactiveDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all cursor-pointer"
                />
              </div>
              <div className="w-32">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Hora Aproximada</label>
                <input 
                  type="time"
                  value={retroactiveTime}
                  onChange={(e) => setRetroactiveTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all cursor-pointer"
                />
              </div>
            </div>

            {/* Atalhos rápidos de data */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Atalhos:</span>
              {[
                { label: '10/09/2026', value: '2026-09-10' },
                { label: '11/09/2026', value: '2026-09-11' },
                { label: '12/09/2026', value: '2026-09-12' },
                { label: '17/09/2026', value: '2026-09-17' },
                { label: '19/09/2026', value: '2026-09-19' },
                { label: 'Ontem', value: new Date(Date.now() - 86400000).toISOString().split('T')[0] },
              ].map(shortcut => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => setRetroactiveDate(shortcut.value)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    retroactiveDate === shortcut.value 
                      ? 'bg-amber-600 text-white shadow-sm' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden lg:block w-px h-24 bg-slate-200"></div>

          {/* Numeração da Fatura Recuperada */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight">
                  2. Identificador / Nº da Fatura
                </h3>
              </div>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={useCustomNumber}
                  onChange={(e) => setUseCustomNumber(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                Digitar Nº Original (ex: FR-2026/3050)
              </label>
            </div>

            {useCustomNumber ? (
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                  Número Original da Fatura
                </label>
                <input 
                  type="text"
                  placeholder="Ex: FR-2026/5203 ou FR-2026/3050"
                  value={customInvoiceNumber}
                  onChange={(e) => setCustomInvoiceNumber(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                  Identificador Automático Retroativo
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    disabled
                    value={autoInvoiceNumber}
                    className="w-full px-4 py-2.5 bg-amber-50 border border-amber-300 rounded-xl text-sm font-mono font-black text-amber-900"
                  />
                  <button
                    type="button"
                    onClick={() => refreshAutoInvoiceNumber(retroactiveDate)}
                    title="Recarregar numeração"
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Badge de Auditoria */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span><strong>Tipo:</strong> <span className="text-amber-700 font-bold">RETROATIVA / RECUPERADA</span></span>
              <span><strong>Data Venda:</strong> {new Date(retroactiveDate).toLocaleDateString('pt-AO')} {retroactiveTime}</span>
              <span><strong>Lançamento:</strong> {new Date().toLocaleDateString('pt-AO')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ÁREA PRINCIPAL DO POS (PRODUTOS + CARRINHO) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: CATÁLOGO DE MEDICAMENTOS (8 COLUNAS) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar medicamento por nome ou código para adicionar à fatura..."
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Lista de Resultados da Busca */}
            {searchTerm.trim().length > 0 && (
              <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto bg-white shadow-lg">
                {filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-bold text-sm">
                    Nenhum medicamento encontrado para "{searchTerm}".
                  </div>
                ) : (
                  filteredProducts.map(product => {
                    const totalStock = batches
                      .filter(b => b.productId === product.id)
                      .reduce((sum, b) => sum + (b.quantity || 0), 0);
                    return (
                      <div
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="p-3.5 hover:bg-amber-50/60 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-slate-800 leading-tight">{product.name}</h4>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            <span>{product.category || 'Geral'}</span>
                            <span>•</span>
                            <span className="font-mono text-slate-500">Cód: {product.code}</span>
                            <span>•</span>
                            <span className={`font-bold ${totalStock > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                              Stock: {totalStock} un
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-sm text-slate-900">{product.sellPrice.toLocaleString()} Kz</p>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 mt-0.5">
                            <Plus className="w-3.5 h-3.5" /> Adicionar
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Grid de Atalhos de Medicamentos Populares */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-black text-xs text-slate-500 uppercase tracking-wider">
                Medicamentos Disponíveis em Stock ({products.filter(p => p.active).length})
              </h4>
              <span className="text-xs text-slate-400">Clique para adicionar à venda retroativa</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {products
                .filter(p => p.active)
                .slice(0, 30)
                .map(product => {
                  const productBatches = batches.filter(b => b.productId === product.id && b.quantity > 0);
                  const totalStock = productBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={totalStock <= 0}
                      className="p-4 text-left border border-slate-200 hover:border-amber-400 hover:shadow-md rounded-2xl transition-all bg-slate-50/50 hover:bg-white flex flex-col justify-between group disabled:opacity-40 disabled:hover:border-slate-200 cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {product.category || 'Medicamento'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            totalStock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {totalStock} un
                          </span>
                        </div>
                        <h5 className="font-bold text-sm text-slate-800 mt-1 line-clamp-2 group-hover:text-amber-700 transition-colors">
                          {product.name}
                        </h5>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-black text-sm text-slate-900">
                          {product.sellPrice.toLocaleString()} Kz
                        </span>
                        <div className="w-7 h-7 rounded-xl bg-amber-50 group-hover:bg-amber-600 text-amber-600 group-hover:text-white flex items-center justify-center transition-colors">
                          <Plus className="w-4 h-4" />
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: PAINEL DO CARRINHO E FINALIZAÇÃO (4-5 COLUNAS) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-sm sticky top-6">
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h3 className="font-black text-base text-slate-900 tracking-tight">Itens da Fatura</h3>
                <p className="text-xs text-slate-400">
                  Data da Venda: <strong className="text-amber-700">{new Date(retroactiveDate).toLocaleDateString('pt-AO')}</strong>
                </p>
              </div>
              <span className="text-xs font-black bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
                {cart.length} {cart.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* Lista de Itens no Carrinho */}
            <div className="py-4 space-y-3 max-h-[300px] overflow-y-auto divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2 opacity-50" />
                  <p className="font-bold text-xs uppercase tracking-wider">Carrinho Vazio</p>
                  <p className="text-[11px] text-slate-400 mt-1">Selecione medicamentos para incluir nesta fatura retroativa.</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="pt-3 first:pt-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h5 className="font-bold text-xs text-slate-800 leading-tight">{item.productName}</h5>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Lote: {item.lotNumber} • {item.unitPrice.toLocaleString()} Kz
                        </p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                        title="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-black text-xs text-slate-800">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <p className="font-black text-xs text-slate-900">
                        {item.subtotal.toLocaleString()} Kz
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Dados do Cliente e Forma de Pagamento */}
            <div className="pt-4 border-t space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Cliente</label>
                  <input
                    type="text"
                    placeholder="Consumidor Final"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">NIF</label>
                  <input
                    type="text"
                    placeholder="999999999"
                    value={customerNif}
                    onChange={(e) => setCustomerNif(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Forma de Pagamento</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Dinheiro', 'Multicaixa (TPA)', 'Transferência', 'Misto'].map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                        paymentMethod === method 
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs' 
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Resumo Financeiro */}
            <div className="pt-4 border-t space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal Ilíquido:</span>
                <span className="font-mono font-bold">{cartSummary.gross.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>IVA (14%):</span>
                <span className="font-mono font-bold">{cartSummary.vat.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t">
                <span>Total a Faturar:</span>
                <span className="text-amber-600 font-mono">{cartSummary.net.toLocaleString()} Kz</span>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="pt-5 space-y-2">
              <button
                type="button"
                onClick={() => handleFinishSale(false)}
                disabled={cart.length === 0 || isFinishing}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isFinishing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>A Gravar e Abater Stock...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Gravar Fatura Retroativa</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleFinishSale(true)}
                disabled={cart.length === 0 || isFinishing}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <PrinterIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Gravar & Imprimir Recibo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO: HISTÓRICO DE FATURAS RECUPERADAS (ORGANIZADAS EM ORDEM CRESCENTE DE DIAS E MESES) */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden mt-8">
        <div className="px-6 py-5 border-b bg-slate-50/70 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              <h3 className="font-black text-base text-slate-800">Histórico de Faturas Recuperadas</h3>
              <span className="text-xs font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
                {recoveredInvoices.length} faturas
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Organizadas rigorosamente em <strong>ordem crescente dos dias e dos meses</strong> (da data mais antiga à mais recente).
            </p>
          </div>

          <button
            onClick={loadRecoveredInvoices}
            className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            Atualizar Lista
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50 border-b tracking-wider">
              <tr>
                <th className="px-5 py-3.5 text-center">Nº Seq</th>
                <th className="px-5 py-3.5">Data da Venda (Original)</th>
                <th className="px-5 py-3.5">Fatura Nº</th>
                <th className="px-5 py-3.5">Cliente</th>
                <th className="px-5 py-3.5">Medicamentos / Qtd</th>
                <th className="px-5 py-3.5">Pagamento</th>
                <th className="px-5 py-3.5 text-right">Total</th>
                <th className="px-5 py-3.5">Data Lançamento</th>
                <th className="px-5 py-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recoveredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-wider">
                    Nenhuma fatura retroativa / recuperada registrada até ao momento.
                  </td>
                </tr>
              ) : (
                recoveredInvoices.map((inv, idx) => (
                  <tr key={inv.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-5 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-700 border border-slate-200">
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <p className="font-black text-xs text-slate-800">
                            {new Date(inv.date).toLocaleDateString('pt-AO')}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400">
                            {new Date(inv.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono font-black text-xs text-amber-700">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-700">
                      {inv.customerName || 'Consumidor Final'}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      <div className="space-y-0.5">
                        {inv.items.map((it, i) => (
                          <p key={i} className="text-xs font-semibold text-slate-700 truncate max-w-xs">
                            {it.quantity}x {it.productName}
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        {inv.paymentMethod}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-xs text-slate-900">
                      {inv.totalNet.toLocaleString()} Kz
                    </td>
                    <td className="px-5 py-4 text-[11px] text-slate-400">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('pt-AO') : 'Hoje'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => {
                          setLastCreatedInvoice(inv);
                          setTimeout(() => window.print(), 300);
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 mx-auto transition-colors cursor-pointer"
                        title="Imprimir Comprovativo da Venda"
                      >
                        <PrinterIcon className="w-3.5 h-3.5" />
                        <span>Imprimir</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ÁREA DE IMPRESSÃO: FATURA RECIBO RETROATIVA (TÉRMICA / A4) */}
      {lastCreatedInvoice && (
        <div id="printable-recovery-invoice" className="hidden print:block p-4 text-black bg-white w-full max-w-[80mm] mx-auto text-[10px] leading-tight font-sans">
          <div className="text-center mb-3">
            <h1 className="font-black text-sm uppercase">{COMPANY_INFO.name}</h1>
            <p className="text-[9px]">{COMPANY_INFO.address}</p>
            <p className="text-[9px]">NIF: {COMPANY_INFO.nif} | Tel: {COMPANY_INFO.contact}</p>
            <div className="border-b-2 border-black my-2"></div>
            
            <div className="border-2 border-black p-1 my-1">
              <h2 className="font-black text-xs uppercase">FATURA RETROATIVA / RECUPERADA</h2>
              <p className="text-[9px] font-bold">Nº: {lastCreatedInvoice.invoiceNumber}</p>
            </div>

            <p className="text-[9px] mt-1">
              <strong>Data da Venda:</strong> {new Date(lastCreatedInvoice.date).toLocaleString('pt-AO')}
            </p>
            <p className="text-[9px]">
              <strong>Data de Lançamento:</strong> {lastCreatedInvoice.createdAt ? new Date(lastCreatedInvoice.createdAt).toLocaleString('pt-AO') : new Date().toLocaleString('pt-AO')}
            </p>
            <p className="font-black border-y border-black py-1 mt-1 uppercase text-[9px]">
              Pagamento: {lastCreatedInvoice.paymentMethod}
            </p>
          </div>

          <div className="mb-3 text-[9px]">
            <p><strong>Cliente:</strong> {lastCreatedInvoice.customerName}</p>
            <p><strong>NIF:</strong> {lastCreatedInvoice.customerNif}</p>
            <p><strong>Operador:</strong> {lastCreatedInvoice.userName}</p>
          </div>

          <table className="w-full text-left text-[9px] border-collapse mb-3">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1">Artigo</th>
                <th className="py-1 text-center">Qtd</th>
                <th className="py-1 text-right">Preço</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dotted divide-gray-400">
              {lastCreatedInvoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1">
                    <p className="font-bold">{item.productName}</p>
                    <p className="text-[8px] text-gray-600">Lote: {item.lotNumber}</p>
                  </td>
                  <td className="py-1 text-center font-bold">{item.quantity}</td>
                  <td className="py-1 text-right">{item.unitPrice.toLocaleString()}</td>
                  <td className="py-1 text-right font-bold">{item.subtotal.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t-2 border-black pt-2 space-y-1 text-[9px]">
            <div className="flex justify-between">
              <span>Total Ilíquido:</span>
              <span className="font-bold">{lastCreatedInvoice.totalGross.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Total IVA:</span>
              <span className="font-bold">{lastCreatedInvoice.totalVAT.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between text-xs font-black border-t border-black pt-1">
              <span>TOTAL PAGO:</span>
              <span>{lastCreatedInvoice.totalNet.toLocaleString()} Kz</span>
            </div>
          </div>

          <div className="text-center mt-4 pt-2 border-t border-dotted border-gray-400 text-[8px] text-gray-500">
            <p className="font-bold uppercase">Documento Emitido para Efeitos de Recuperação Histórica</p>
            <p>Os bens e serviços foram faturados na data indicada e deduzidos do stock.</p>
            <p className="mt-1 font-mono">Processado por PharmaGest Angola</p>
          </div>
        </div>
      )}
    </div>
  );
};
