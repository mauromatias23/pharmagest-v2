
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Product, Batch, Invoice, User, InvoiceItem, InvoiceStatus } from '../types';
import { COMPANY_INFO, VAT_RATE, PAYMENT_METHODS } from '../constants';
import { db, type DailyClosure, type ShiftBreakdown } from '../services/db';
import { SyncService } from '../services/syncService';
import { safeUUID } from '../services/supabaseClient';
import { 
  Search, Trash2, Banknote, CreditCard, Landmark, Layers, History, X, Plus, Minus, Printer as PrinterIcon, CheckCircle, PlusCircle, FileText, Check, AlertCircle, ShieldCheck, ArrowRight, Lock, RotateCcw, Award, Calendar, Clock, User as UserIcon
} from 'lucide-react';

interface BillingProps {
  user: User;
  products: Product[];
  batches: Batch[];
  invoices?: Invoice[];
  onCompleteSale: (invoice: Invoice) => void;
  onLogout: () => void;
}

interface SuccessToast {
  title: string;
  subtitle: string;
  invoice: Invoice;
}

interface CompletedShiftClosureWithInvoices extends DailyClosure {
  closedInvoicesList: Invoice[];
}

interface CompletedGeneralClosureWithBreakdown extends DailyClosure {
  shiftBreakdowns: ShiftBreakdown[];
}

// Função utilitária para verificar com precisão se a data corresponde estritamente ao dia de hoje
const isDateToday = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const todayISO = new Date().toISOString().split('T')[0];
      const todayLocal = new Date().toLocaleDateString('en-CA');
      return dateStr.startsWith(todayISO) || dateStr.startsWith(todayLocal);
    }
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
};

const Billing: React.FC<BillingProps> = ({ user, products, batches, invoices = [], onCompleteSale, onLogout }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerNif, setCustomerNif] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [isFinishing, setIsFinishing] = useState(false);
  const [dailyInvoices, setDailyInvoices] = useState<Invoice[]>([]);
  const [todayClosedShifts, setTodayClosedShifts] = useState<DailyClosure[]>([]);
  
  // Turno ativo
  const [currentShiftNumber, setCurrentShiftNumber] = useState<number>(1);
  const [currentShiftName, setCurrentShiftName] = useState<string>('1º Turno');

  // Modais de interface
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showClosingOptionsModal, setShowClosingOptionsModal] = useState(false);
  const [showShiftConfirmModal, setShowShiftConfirmModal] = useState(false);
  const [showGeneralConfirmModal, setShowGeneralConfirmModal] = useState(false);
  const [isProcessingClosing, setIsProcessingClosing] = useState(false);

  // Modais de comprovativos e visualização
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<Invoice | null>(null);
  const [lastCompletedShiftClosure, setLastCompletedShiftClosure] = useState<CompletedShiftClosureWithInvoices | null>(null);
  const [lastCompletedGeneralClosure, setLastCompletedGeneralClosure] = useState<CompletedGeneralClosureWithBreakdown | null>(null);
  const [successToast, setSuccessToast] = useState<SuccessToast | null>(null);

  // Carrega faturas ativas ordenadas da primeira à última e identifica o turno ativo
  const loadDailyStatsAndShifts = useCallback(async () => {
    try {
      await SyncService.performAutoMidnightClosureIfNeeded();

      const todayISO = new Date().toISOString().split('T')[0];
      const todayLocal = new Date().toLocaleDateString('en-CA');
      
      const allInvoices = await db.invoices.toArray();
      const allClosures = await db.dailyClosures.toArray();

      // Fechos de turno realizados hoje
      const shiftsToday = allClosures
        .filter(c => (isDateToday(c.date) || c.date === todayISO || c.date === todayLocal) && c.type === 'SHIFT')
        .sort((a, b) => (a.shiftNumber || 1) - (b.shiftNumber || 1));
      
      setTodayClosedShifts(shiftsToday);

      const nextShiftNum = shiftsToday.length + 1;
      setCurrentShiftNumber(nextShiftNum);
      setCurrentShiftName(`${nextShiftNum}º Turno`);

      // Apenas faturas ativas emitidas no dia de HOJE que ainda NÃO foram fechadas no fecho de caixa
      // IMPORTANTE: Organizadas cronologicamente da PRIMEIRA venda até a ÚLTIMA venda
      const openInvoices = allInvoices
        .filter(inv => isDateToday(inv.date) && !inv.closed && inv.status === InvoiceStatus.ISSUED)
        .sort((a, b) => a.date.localeCompare(b.date));

      setDailyInvoices(openInvoices);
    } catch (err) {
      console.error("Erro ao carregar estatísticas diárias e turnos:", err);
    }
  }, [invoices]);

  useEffect(() => {
    loadDailyStatsAndShifts();
  }, [loadDailyStatsAndShifts, isFinishing]);

  // Auto-dismiss toast after 4.5 seconds
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => {
      setSuccessToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [successToast]);

  // Estatísticas das vendas ativas do turno corrente
  const dailyStats = useMemo(() => {
    const stats = { cash: 0, tpa: 0, transfer: 0, mixed: 0, total: 0 };
    dailyInvoices.forEach(inv => {
      if (inv.paymentMethod === 'Dinheiro') stats.cash += inv.totalNet;
      else if (inv.paymentMethod === 'Multicaixa (TPA)') stats.tpa += inv.totalNet;
      else if (inv.paymentMethod === 'Transferência') stats.transfer += inv.totalNet;
      else if (inv.paymentMethod === 'Misto') stats.mixed += inv.totalNet;
      stats.total += inv.totalNet;
    });
    return stats;
  }, [dailyInvoices]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return products.filter(p => 
      p.active && (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.includes(searchTerm))
    );
  }, [products, searchTerm]);

  const cartSummary = useMemo(() => {
    const gross = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const vat = cart.reduce((sum, item) => sum + item.vatAmount, 0);
    return { gross, vat, net: gross + vat };
  }, [cart]);

  const addToCart = (product: Product) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const activeBatches = batches
      .filter(b => b.productId === product.id && b.quantity > 0 && b.expiryDate >= todayStr)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    if (activeBatches.length === 0) {
      alert("ERRO: Produto sem stock disponível dentro do prazo de validade!");
      return;
    }

    const batch = activeBatches[0];
    const existing = cart.find(item => item.productId === product.id && item.batchId === batch.id);

    if (existing) {
      updateQuantity(existing.id, 1);
    } else {
      const subtotal = product.sellPrice;
      const vatAmount = product.hasVAT ? subtotal * VAT_RATE : 0;
      const newItem: InvoiceItem = {
        id: Math.random().toString(36).substring(2, 11),
        productId: product.id,
        productName: product.name,
        batchId: batch.id,
        lotNumber: batch.lotNumber,
        quantity: 1,
        unitPrice: product.sellPrice,
        subtotal: subtotal,
        vatAmount: vatAmount
      };
      setCart(prev => [...prev, newItem]);
    }
    setSearchTerm('');
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.id === itemId) {
        const batch = batches.find(b => b.id === item.batchId);
        const newQty = Math.max(1, item.quantity + delta);
        if (batch && newQty > batch.quantity) {
          alert(`Stock insuficiente! Quantidade máxima disponível neste lote: ${batch.quantity}`);
          return item;
        }
        const subtotal = newQty * item.unitPrice;
        const product = products.find(p => p.id === item.productId);
        return {
          ...item,
          quantity: newQty,
          subtotal: subtotal,
          vatAmount: (product?.hasVAT) ? subtotal * VAT_RATE : 0
        };
      }
      return item;
    }));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  const handleFinishSale = async (shouldPrint: boolean = false) => {
    if (cart.length === 0 || isFinishing) return;
    
    try {
      setIsFinishing(true);
      const date = new Date();
      const invNumber = `FR-${date.getFullYear()}/${Math.floor(1000 + Math.random() * 8999)}`;

      const newInvoice: Invoice = {
        id: safeUUID(),
        invoiceNumber: invNumber,
        customerName: customerName.trim() || 'Consumidor Final',
        customerNif: customerNif.trim() || '999999999',
        userId: user.id,
        userName: user.name,
        date: date.toISOString(),
        totalGross: cartSummary.gross,
        totalVAT: cartSummary.vat,
        totalNet: cartSummary.net,
        status: InvoiceStatus.ISSUED,
        paymentMethod,
        items: [...cart],
        closed: false,
        shiftNumber: currentShiftNumber,
        shiftName: currentShiftName
      };

      // Salva a venda imediatamente no banco local e atualiza stock
      try {
        await onCompleteSale(newInvoice);
      } catch (saleErr) {
        console.warn('[Billing onCompleteSale Warning, fallback local seguro]', saleErr);
        await db.invoices.put({ ...newInvoice, synchronized: false });
      }

      // Adiciona instantaneamente aos registos de vendas ativas
      setDailyInvoices(prev => [...prev.filter(i => i.id !== newInvoice.id), newInvoice].sort((a, b) => a.date.localeCompare(b.date)));

      // Limpa os dados do carrinho imediatamente
      setCart([]);
      setCustomerName('');
      setCustomerNif('');

      if (shouldPrint) {
        // Abre o modal de visualização e aciona a impressão da fatura
        setLastCreatedInvoice(newInvoice);
        setTimeout(() => {
          window.print();
        }, 350);
      } else {
        // Feedback visual rápido sem bloquear a interface de vendas
        setSuccessToast({
          title: 'Venda Concluída com Sucesso!',
          subtitle: `Fatura ${newInvoice.invoiceNumber} registrada no ${currentShiftName} • Total: ${newInvoice.totalNet.toLocaleString()} Kz`,
          invoice: newInvoice
        });
      }
    } catch (err: any) {
      console.error("Erro ao finalizar venda:", err);
      alert(`Erro no banco local do navegador: ${err?.message || err}`);
    } finally {
      setIsFinishing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Abre o modal de escolha de fecho (Novo Turno ou Fecho Geral)
  const handleOpenClosingOptions = () => {
    setShowHistoryModal(false);
    setShowClosingOptionsModal(true);
  };

  // =========================================================================
  // EXECUÇÃO DA OPÇÃO 1: NOVO TURNO (FECHA TURNO ATUAL E ZERA VENDAS ATIVAS)
  // =========================================================================
  const handleExecuteShiftClosing = async () => {
    if (dailyInvoices.length === 0) {
      alert("Não existem vendas ativas no turno atual para fechar.");
      return;
    }
    if (isProcessingClosing) return;

    try {
      setIsProcessingClosing(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const closureId = `CLS-TURNO-${currentShiftNumber}-${Date.now()}`;
      const timestampStr = new Date().toISOString();

      const shiftClosureData: DailyClosure = {
        id: closureId,
        date: todayStr,
        userId: user.id,
        userName: user.name,
        type: 'SHIFT',
        shiftNumber: currentShiftNumber,
        shiftName: currentShiftName,
        totalCash: dailyStats.cash,
        totalTpa: dailyStats.tpa,
        totalTransfer: dailyStats.transfer,
        totalMixed: dailyStats.mixed,
        totalInvoices: dailyInvoices.length,
        grandTotal: dailyStats.total,
        timestamp: timestampStr,
        synchronized: false
      };

      // Marca todas as faturas do turno ativo como fechadas com o ID do fecho de turno
      const closedInvoices = dailyInvoices.map(inv => ({
        ...inv,
        closed: true,
        closureId: closureId,
        closedAt: timestampStr,
        shiftNumber: currentShiftNumber,
        shiftName: currentShiftName,
        synchronized: false
      }));

      // 1. Gravação no Supabase e no Dexie
      await SyncService.createClosure(shiftClosureData, closedInvoices);

      // 2. Reinicia o contador de vendas local imediatamente para ZERO
      setDailyInvoices([]);
      setShowShiftConfirmModal(false);
      setShowClosingOptionsModal(false);
      setShowHistoryModal(false);

      // 3. Atualiza estado de turnos (avança para o próximo turno)
      const nextShiftNum = currentShiftNumber + 1;
      setCurrentShiftNumber(nextShiftNum);
      setCurrentShiftName(`${nextShiftNum}º Turno`);

      // 4. Abre o comprovativo visual do Fecho de Turno com opção de impressão
      setLastCompletedShiftClosure({
        ...shiftClosureData,
        closedInvoicesList: closedInvoices
      });
    } catch (err: any) {
      console.error("Erro ao realizar fecho de turno:", err);
      alert(`Erro ao gravar fecho de turno: ${err.message || err}`);
    } finally {
      setIsProcessingClosing(false);
    }
  };

  // =========================================================================
  // EXECUÇÃO DA OPÇÃO 2: FECHO GERAL (CONSOLIDA 1º TURNO + 2º TURNO + TOTAL)
  // =========================================================================
  const handleExecuteGeneralClosing = async () => {
    if (isProcessingClosing) return;

    try {
      setIsProcessingClosing(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const closureId = `CLS-GERAL-${Date.now()}`;
      const timestampStr = new Date().toISOString();

      // 1. Carrega todos os fechos de turno já concluídos hoje
      const allClosures = await db.dailyClosures.toArray();
      const existingShifts = allClosures
        .filter(c => (isDateToday(c.date) || c.date === todayStr) && c.type === 'SHIFT')
        .sort((a, b) => (a.shiftNumber || 1) - (b.shiftNumber || 1));

      const breakdowns: ShiftBreakdown[] = [];

      // Adiciona turnos previamente fechados hoje
      for (const s of existingShifts) {
        breakdowns.push({
          shiftNumber: s.shiftNumber || 1,
          shiftName: s.shiftName || `${s.shiftNumber || 1}º Turno`,
          userId: s.userId,
          userName: s.userName,
          totalCash: s.totalCash,
          totalTpa: s.totalTpa,
          totalTransfer: s.totalTransfer,
          totalMixed: s.totalMixed,
          totalInvoices: s.totalInvoices,
          grandTotal: s.grandTotal,
          closedAt: s.timestamp
        });
      }

      // Se houver vendas ativas no turno atual, inclui este turno no fecho geral e fecha as faturas
      let newlyClosedInvoices: Invoice[] = [];
      if (dailyInvoices.length > 0) {
        const activeShiftBreakdown: ShiftBreakdown = {
          shiftNumber: currentShiftNumber,
          shiftName: currentShiftName,
          userId: user.id,
          userName: user.name,
          totalCash: dailyStats.cash,
          totalTpa: dailyStats.tpa,
          totalTransfer: dailyStats.transfer,
          totalMixed: dailyStats.mixed,
          totalInvoices: dailyInvoices.length,
          grandTotal: dailyStats.total,
          closedAt: timestampStr
        };
        breakdowns.push(activeShiftBreakdown);

        newlyClosedInvoices = dailyInvoices.map(inv => ({
          ...inv,
          closed: true,
          closureId: closureId,
          closedAt: timestampStr,
          shiftNumber: currentShiftNumber,
          shiftName: currentShiftName,
          synchronized: false
        }));

        for (const inv of newlyClosedInvoices) {
          await db.invoices.put(inv);
        }
      }

      if (breakdowns.length === 0) {
        alert("Não existem turnos ou vendas registradas hoje para realizar o Fecho Geral.");
        setIsProcessingClosing(false);
        return;
      }

      // 2. Calcula os Totais Globais do Dia (Fecho Total)
      const grandTotalCash = breakdowns.reduce((sum, b) => sum + b.totalCash, 0);
      const grandTotalTpa = breakdowns.reduce((sum, b) => sum + b.totalTpa, 0);
      const grandTotalTransfer = breakdowns.reduce((sum, b) => sum + b.totalTransfer, 0);
      const grandTotalMixed = breakdowns.reduce((sum, b) => sum + b.totalMixed, 0);
      const grandTotalInvoices = breakdowns.reduce((sum, b) => sum + b.totalInvoices, 0);
      const grandTotalAll = breakdowns.reduce((sum, b) => sum + b.grandTotal, 0);

      const generalClosureData: DailyClosure = {
        id: closureId,
        date: todayStr,
        userId: user.id,
        userName: user.name,
        type: 'GENERAL',
        totalCash: grandTotalCash,
        totalTpa: grandTotalTpa,
        totalTransfer: grandTotalTransfer,
        totalMixed: grandTotalMixed,
        totalInvoices: grandTotalInvoices,
        grandTotal: grandTotalAll,
        timestamp: timestampStr,
        shiftBreakdowns: breakdowns,
        synchronized: false
      };

      // 3. Gravação no Supabase e no Dexie
      await SyncService.createClosure(generalClosureData, newlyClosedInvoices);

      // 4. Reinicia estado de vendas ativas e contador de turnos para o próximo dia
      setDailyInvoices([]);
      setShowGeneralConfirmModal(false);
      setShowClosingOptionsModal(false);
      setShowHistoryModal(false);
      setCurrentShiftNumber(1);
      setCurrentShiftName('1º Turno');

      // 5. Abre o comprovativo do Fecho Geral (com exibição dos 3 fechos: Total, 1º Turno e 2º Turno)
      setLastCompletedGeneralClosure({
        ...generalClosureData,
        shiftBreakdowns: breakdowns
      });
    } catch (err: any) {
      console.error("Erro ao realizar fecho geral:", err);
      alert(`Erro ao gravar fecho geral: ${err.message || err}`);
    } finally {
      setIsProcessingClosing(false);
    }
  };

  // Identificação dos turnos para exibição no Fecho Geral (1º Turno, 2º Turno e Fecho Total)
  const generalClosureTurno1 = useMemo(() => {
    if (!lastCompletedGeneralClosure?.shiftBreakdowns) return null;
    return lastCompletedGeneralClosure.shiftBreakdowns.find(b => b.shiftNumber === 1) || lastCompletedGeneralClosure.shiftBreakdowns[0] || null;
  }, [lastCompletedGeneralClosure]);

  const generalClosureTurno2 = useMemo(() => {
    if (!lastCompletedGeneralClosure?.shiftBreakdowns) return null;
    return lastCompletedGeneralClosure.shiftBreakdowns.find(b => b.shiftNumber === 2) || (lastCompletedGeneralClosure.shiftBreakdowns.length > 1 ? lastCompletedGeneralClosure.shiftBreakdowns[1] : null);
  }, [lastCompletedGeneralClosure]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full pb-10 relative">
      {/* Estilos específicos para impressão perfeita da fatura ou fecho de caixa */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-invoice, #printable-invoice * {
            visibility: visible;
          }
          #printable-shift-closure, #printable-shift-closure * {
            visibility: visible;
          }
          #printable-general-closure, #printable-general-closure * {
            visibility: visible;
          }
          #printable-invoice, #printable-shift-closure, #printable-general-closure {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 90mm !important;
            margin: 0 auto !important;
            padding: 10px !important;
            background: white !important;
            color: black !important;
          }
          .no-print, aside, header, nav {
            display: none !important;
          }
          @page {
            size: auto;
            margin: 0.4cm;
          }
        }
      `}</style>

      {/* TOAST DE SUCESSO NÃO-BLOQUEANTE (Ao finalizar sem imprimir) */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-5 py-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in slide-in-from-top-4 duration-300 no-print max-w-md">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-emerald-400 uppercase tracking-wider">{successToast.title}</p>
            <p className="text-xs text-slate-300 font-medium truncate">{successToast.subtitle}</p>
          </div>
          <button
            onClick={() => {
              setLastCreatedInvoice(successToast.invoice);
              setSuccessToast(null);
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> Ver / Imprimir
          </button>
          <button 
            onClick={() => setSuccessToast(null)} 
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PAINEL ESQUERDO: RESUMO DO TURNO ATIVO + PESQUISA DE MEDICAMENTOS */}
      <div className="lg:col-span-7 space-y-6 flex flex-col no-print">
        
        {/* BARRA DE ESTADO DO TURNO ATIVO */}
        <div className="bg-slate-900 text-white p-3.5 px-5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  {currentShiftName}
                </span>
                <span className="text-xs text-slate-400 font-medium">Turno Ativo</span>
              </div>
              <p className="text-[11px] text-slate-300 font-bold mt-0.5">
                Operador: <span className="text-white font-black">{user.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vendas ({dailyInvoices.length})</span>
            </button>
            <button
              onClick={handleOpenClosingOptions}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Fecho de Caixa</span>
            </button>
          </div>
        </div>

        {/* CARTÕES DE TOTAIS POR MÉTODO DE PAGAMENTO */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
          <SummaryCard label="Dinheiro" value={dailyStats.cash} icon={Banknote} color="emerald" />
          <SummaryCard label="Multicaixa" value={dailyStats.tpa} icon={CreditCard} color="blue" />
          <SummaryCard label="Transferência" value={dailyStats.transfer} icon={Landmark} color="orange" />
          <SummaryCard label="Misto" value={dailyStats.mixed} icon={Layers} color="purple" />
          <div className="bg-emerald-600 p-4 rounded-xl shadow-lg text-white flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase opacity-90">Total {currentShiftName}</span>
            <p className="text-base font-black truncate">{dailyStats.total.toLocaleString()} <span className="text-xs">Kz</span></p>
          </div>
        </div>

        {/* PESQUISA DE MEDICAMENTOS */}
        <div className="bg-white p-5 rounded-2xl border shadow-sm relative flex-1 min-h-[400px]">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Pesquisar medicamento por nome ou código..."
              className="w-full pl-10 pr-4 py-3.5 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50 font-bold text-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          {searchTerm.trim() !== '' && (
            <div className="absolute left-0 right-0 top-[85px] mt-2 bg-white border rounded-2xl shadow-2xl z-40 p-4 max-h-[50vh] overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold text-sm">
                  Nenhum medicamento encontrado para "{searchTerm}".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredProducts.map((product) => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const productBatches = batches.filter(b => b.productId === product.id);
                    const validBatches = productBatches.filter(b => b.expiryDate >= todayStr);
                    const stockCount = productBatches.length > 0
                      ? validBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0)
                      : (Number(product.totalQuantity) || 0);

                    return (
                      <button 
                        key={product.id} 
                        onClick={() => addToCart(product)} 
                        disabled={stockCount <= 0}
                        className={`p-3 border rounded-xl text-left transition-all ${
                          stockCount <= 0 
                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' 
                            : 'hover:border-emerald-500 hover:shadow-md bg-white cursor-pointer'
                        }`}
                      >
                        <h5 className="font-black text-slate-800 text-sm">{product.name}</h5>
                        <p className="text-[10px] text-slate-400 font-mono">{product.code}</p>
                        <div className="flex justify-between mt-2 items-center">
                          <span className={`text-[10px] font-bold ${stockCount === 0 ? 'text-red-500' : 'text-slate-500'}`}>
                            {stockCount} em stock
                          </span>
                          <span className="font-black text-emerald-600">{product.sellPrice.toLocaleString()} Kz</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="absolute bottom-5 left-5 right-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button 
              onClick={() => setShowHistoryModal(true)} 
              className="py-3.5 px-4 border-2 border-emerald-100 hover:border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-700 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <History className="w-4 h-4" /> Vendas Ativas ({dailyInvoices.length})
            </button>

            <button 
              onClick={handleOpenClosingOptions} 
              className="py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
            >
              <Lock className="w-4 h-4 text-emerald-400" /> Fecho de Caixa
            </button>
          </div>
        </div>
      </div>

      {/* PAINEL DIREITO: DADOS DO CLIENTE + CARRINHO E TOTALIZADOR */}
      <div className="lg:col-span-5 flex flex-col gap-6 no-print">
        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Cliente</label>
              <input 
                type="text" 
                placeholder="Consumidor Final" 
                className="w-full p-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none" 
                value={customerName} 
                onChange={e => setCustomerName(e.target.value)} 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">NIF</label>
              <input 
                type="text" 
                placeholder="999999999" 
                className="w-full p-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none" 
                value={customerNif} 
                onChange={e => setCustomerNif(e.target.value)} 
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm flex-1 flex flex-col overflow-hidden min-h-[420px]">
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="font-black uppercase text-xs text-slate-700">Itens da Venda Atual</h3>
            <span className="bg-slate-900 text-white text-[10px] font-black px-2.5 py-1 rounded-full">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} unidades
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Search className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-bold">Carrinho vazio</p>
                <p className="text-xs opacity-70">Pesquise medicamentos ao lado para adicionar à venda.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-xl bg-white shadow-xs">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-black text-slate-800 truncate">{item.productName}</p>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {item.unitPrice.toLocaleString()} Kz / un {item.vatAmount > 0 ? '(IVA 14%)' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded-lg p-1 bg-slate-50">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-200 rounded transition-colors cursor-pointer"><Minus className="w-3 h-3 text-slate-600" /></button>
                      <span className="px-2 text-xs font-black text-slate-800">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-200 rounded transition-colors cursor-pointer"><Plus className="w-3 h-3 text-slate-600" /></button>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="p-2 text-slate-300 hover:text-red-500 rounded transition-colors cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-5 bg-slate-900 text-white shrink-0">
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-xs font-black uppercase text-slate-400">Total a Pagar:</span>
              <span className="text-2xl font-black text-emerald-400">{cartSummary.net.toLocaleString()} Kz</span>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {PAYMENT_METHODS.map(m => (
                <button 
                  key={m} 
                  onClick={() => setPaymentMethod(m)} 
                  className={`p-2 rounded-xl border text-[9px] font-black uppercase transition-all cursor-pointer ${
                    paymentMethod === m 
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm' 
                      : 'border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {m.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button 
                onClick={() => handleFinishSale(false)} 
                disabled={cart.length === 0 || isFinishing} 
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-black rounded-xl uppercase tracking-wider text-[11px] shadow-md disabled:opacity-40 flex items-center justify-center gap-2 transition-all border border-slate-700 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">{isFinishing ? 'Salvando...' : 'Finalizar sem Imprimir'}</span>
              </button>

              <button 
                onClick={() => handleFinishSale(true)} 
                disabled={cart.length === 0 || isFinishing} 
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl uppercase tracking-wider text-[11px] shadow-xl disabled:opacity-40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <PrinterIcon className="w-4 h-4 text-slate-950 shrink-0" />
                <span className="truncate">{isFinishing ? 'Salvando...' : 'Finalizar e Imprimir'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ESCOLHA DE FECHO DE CAIXA ("NOVO TURNO" OU "FECHO GERAL")       */}
      {/* ========================================================================= */}
      {showClosingOptionsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">Fecho de Caixa</h3>
                  <p className="text-xs text-slate-400">Escolha o tipo de encerramento pretendido</p>
                </div>
              </div>
              <button 
                onClick={() => setShowClosingOptionsModal(false)} 
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Opção 1: Novo Turno */}
              <div 
                onClick={() => {
                  setShowClosingOptionsModal(false);
                  setShowShiftConfirmModal(true);
                }}
                className="p-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-500 transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-base text-slate-900">Novo Turno</h4>
                        <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-emerald-200 text-emerald-800">
                          {currentShiftName} ➔ {currentShiftNumber + 1}º Turno
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Fecha o <strong>{currentShiftName}</strong> e reinicia as vendas ativas a <strong>ZERO (0 Kz)</strong> para o próximo turno. Todas as vendas anteriores ficam guardadas no sistema e nos relatórios.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center justify-between text-xs text-emerald-800 font-bold">
                  <span>Vendas no {currentShiftName}: <strong>{dailyInvoices.length} faturas</strong></span>
                  <span className="text-emerald-700 font-black text-sm">{dailyStats.total.toLocaleString()} Kz</span>
                </div>
              </div>

              {/* Opção 2: Fecho Geral */}
              <div 
                onClick={() => {
                  setShowClosingOptionsModal(false);
                  setShowGeneralConfirmModal(true);
                }}
                className="p-5 rounded-2xl border-2 border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-800 transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-base text-slate-900">Fecho Geral do Dia</h4>
                        <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-slate-200 text-slate-800">
                          Consolidação Diária
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Consolida todos os turnos do dia (<strong>1º Turno</strong>, <strong>2º Turno</strong> e <strong>Fecho Total</strong>). Gera o comprovativo com os 3 fechos discriminados e encerra o dia fiscal.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-700 font-bold">
                  <span>Turnos realizados hoje: <strong>{todayClosedShifts.length + (dailyInvoices.length > 0 ? 1 : 0)} turno(s)</strong></span>
                  <span className="text-slate-900 font-black text-sm">
                    {(todayClosedShifts.reduce((acc, s) => acc + s.grandTotal, 0) + dailyStats.total).toLocaleString()} Kz
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t flex justify-end">
              <button 
                onClick={() => setShowClosingOptionsModal(false)}
                className="px-6 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRMAÇÃO DO FECHO DE TURNO ("NOVO TURNO")                    */}
      {/* ========================================================================= */}
      {showShiftConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[320] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-emerald-700 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">Fechar {currentShiftName} e Iniciar Novo Turno</h3>
                  <p className="text-xs text-emerald-100">Operador: <strong>{user.name}</strong></p>
                </div>
              </div>
              <button 
                onClick={() => setShowShiftConfirmModal(false)} 
                className="p-1.5 hover:bg-emerald-800 rounded-lg text-emerald-100 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-black text-emerald-800 uppercase">Total a Fechar no {currentShiftName}:</span>
                  <span className="text-2xl font-black text-emerald-700">{dailyStats.total.toLocaleString()} Kz</span>
                </div>
                <p className="text-[11px] text-emerald-600 font-bold">{dailyInvoices.length} faturas emitidas neste turno</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border rounded-xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase block">Dinheiro</span>
                  <span className="font-black text-slate-800 text-sm">{dailyStats.cash.toLocaleString()} Kz</span>
                </div>
                <div className="p-3 bg-slate-50 border rounded-xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase block">Multicaixa (TPA)</span>
                  <span className="font-black text-slate-800 text-sm">{dailyStats.tpa.toLocaleString()} Kz</span>
                </div>
                <div className="p-3 bg-slate-50 border rounded-xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase block">Transferência</span>
                  <span className="font-black text-slate-800 text-sm">{dailyStats.transfer.toLocaleString()} Kz</span>
                </div>
                <div className="p-3 bg-slate-50 border rounded-xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase block">Misto</span>
                  <span className="font-black text-slate-800 text-sm">{dailyStats.mixed.toLocaleString()} Kz</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-900 leading-relaxed font-medium">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Ao confirmar, todas as <strong>{dailyInvoices.length} faturas</strong> do {currentShiftName} serão arquivadas com segurança. As vendas ativas serão <strong>reiniciadas a ZERO (0 Kz)</strong> para o <strong>{currentShiftNumber + 1}º Turno</strong>.
                </span>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t flex gap-3">
              <button 
                onClick={() => setShowShiftConfirmModal(false)}
                disabled={isProcessingClosing}
                className="flex-1 py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleExecuteShiftClosing}
                disabled={isProcessingClosing || dailyInvoices.length === 0}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isProcessingClosing ? 'Fechando Turno...' : 'Confirmar e Iniciar Novo Turno'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CONFIRMAÇÃO DO FECHO GERAL DO DIA                                */}
      {/* ========================================================================= */}
      {showGeneralConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[320] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">Confirmar Fecho Geral do Dia</h3>
                  <p className="text-xs text-slate-400">Consolidação de todos os turnos de hoje</p>
                </div>
              </div>
              <button 
                onClick={() => setShowGeneralConfirmModal(false)} 
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-black text-slate-400 uppercase">Fecho Total Previsto:</span>
                  <span className="text-2xl font-black text-emerald-400">
                    {(todayClosedShifts.reduce((acc, s) => acc + s.grandTotal, 0) + dailyStats.total).toLocaleString()} Kz
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-medium">
                  {todayClosedShifts.length + (dailyInvoices.length > 0 ? 1 : 0)} turnos consolidados
                </p>
              </div>

              {/* Lista dos Turnos a Consolidar */}
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {todayClosedShifts.map((s, idx) => (
                  <div key={s.id} className="p-3 bg-slate-50 border rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <span className="font-black text-slate-800">{s.shiftName || `${idx + 1}º Turno`}</span>
                      <p className="text-[10px] text-slate-500">{s.userName} • {s.totalInvoices} faturas</p>
                    </div>
                    <span className="font-black text-slate-700">{s.grandTotal.toLocaleString()} Kz</span>
                  </div>
                ))}
                {dailyInvoices.length > 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center text-xs">
                    <div>
                      <span className="font-black text-emerald-800">{currentShiftName} (Ativo)</span>
                      <p className="text-[10px] text-emerald-600">{user.name} • {dailyInvoices.length} faturas</p>
                    </div>
                    <span className="font-black text-emerald-700">{dailyStats.total.toLocaleString()} Kz</span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-[11px] text-blue-900 leading-relaxed font-medium">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  O Fecho Geral gerará o documento com <strong>3 fechos</strong>: <strong>Fecho Total</strong>, <strong>Fecho do 1º Turno</strong> e <strong>Fecho do 2º Turno</strong>.
                </span>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t flex gap-3">
              <button 
                onClick={() => setShowGeneralConfirmModal(false)}
                disabled={isProcessingClosing}
                className="flex-1 py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleExecuteGeneralClosing}
                disabled={isProcessingClosing}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-lg shadow-slate-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{isProcessingClosing ? 'Consolidando Fecho...' : 'Confirmar Fecho Geral'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: COMPROVATIVO DE FECHO DE TURNO (NOVO TURNO CONCLUÍDO)            */}
      {/* ========================================================================= */}
      {lastCompletedShiftClosure && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[350] flex items-center justify-center p-4 no-print animate-in zoom-in-95 duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-emerald-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base uppercase tracking-tight">Fecho de {lastCompletedShiftClosure.shiftName || 'Turno'} Realizado</h3>
                  <p className="text-xs text-emerald-100">{lastCompletedShiftClosure.id} • {new Date(lastCompletedShiftClosure.timestamp).toLocaleString('pt-AO')}</p>
                </div>
              </div>
              <button 
                onClick={() => setLastCompletedShiftClosure(null)} 
                className="p-1.5 hover:bg-emerald-700 rounded-lg text-emerald-100 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
              <div className="w-full max-w-[380px] bg-white p-6 rounded-2xl shadow-md border border-slate-300 text-slate-800 text-[11px] font-sans">
                <div className="text-center pb-3 border-b border-dashed border-slate-300">
                  <h4 className="font-black text-sm uppercase text-slate-900">{COMPANY_INFO.name}</h4>
                  <p className="text-[10px] text-slate-500">{COMPANY_INFO.address}</p>
                  <p className="text-[10px] text-slate-500">NIF: {COMPANY_INFO.nif} | Tel: {COMPANY_INFO.contact}</p>
                  
                  <div className="my-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <span className="font-black text-xs text-emerald-900 uppercase block">Comprovativo de Fecho de Turno</span>
                    <span className="font-black text-xs text-emerald-700">{lastCompletedShiftClosure.shiftName}</span>
                    <span className="font-mono text-[10px] text-slate-500 block">{lastCompletedShiftClosure.id}</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {new Date(lastCompletedShiftClosure.timestamp).toLocaleString('pt-AO')}
                  </p>
                </div>

                <div className="py-2.5 border-b border-dashed border-slate-300 text-[10px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Operador:</span>
                    <span className="font-bold text-slate-800">{lastCompletedShiftClosure.userName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total de Faturas Fechadas:</span>
                    <span className="font-bold text-slate-800">{lastCompletedShiftClosure.totalInvoices}</span>
                  </div>
                </div>

                <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Dinheiro:</span>
                    <span className="font-bold">{lastCompletedShiftClosure.totalCash.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Multicaixa (TPA):</span>
                    <span className="font-bold">{lastCompletedShiftClosure.totalTpa.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Transferência:</span>
                    <span className="font-bold">{lastCompletedShiftClosure.totalTransfer.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Misto:</span>
                    <span className="font-bold">{lastCompletedShiftClosure.totalMixed.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-xs font-black pt-2 border-t border-slate-300 text-slate-900">
                    <span className="uppercase">Total do Turno:</span>
                    <span className="text-emerald-700 text-sm font-black">{lastCompletedShiftClosure.grandTotal.toLocaleString()} Kz</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 text-center text-[9px] text-slate-400 italic border-t border-dashed border-slate-300">
                  <p>Vendas guardadas no sistema e sincronizadas com o banco de dados.</p>
                  <p className="font-bold text-emerald-700 uppercase mt-1">Próximo turno iniciado a ZERO (0 Kz)!</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0">
              <button 
                onClick={handlePrint}
                className="py-3 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <PrinterIcon className="w-4 h-4 shrink-0" />
                <span>Imprimir Turno</span>
              </button>

              <button 
                onClick={() => setLastCompletedShiftClosure(null)}
                className="py-3 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <ArrowRight className="w-4 h-4 shrink-0" />
                <span>Continuar Vendas</span>
              </button>

              <button 
                onClick={() => {
                  setLastCompletedShiftClosure(null);
                  onLogout();
                }}
                className="py-3 px-3 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all flex items-center justify-center cursor-pointer"
              >
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: COMPROVATIVO DE FECHO GERAL (3 FECHOS: TOTAL, 1º TURNO, 2º TURNO)*/}
      {/* ========================================================================= */}
      {lastCompletedGeneralClosure && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[350] flex items-center justify-center p-4 no-print animate-in zoom-in-95 duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base uppercase tracking-tight">Comprovativo de Fecho Geral do Dia</h3>
                  <p className="text-xs text-slate-300">
                    {lastCompletedGeneralClosure.id} • {new Date(lastCompletedGeneralClosure.timestamp).toLocaleDateString('pt-AO')}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setLastCompletedGeneralClosure(null)} 
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
              <div className="w-full max-w-[500px] bg-white p-6 rounded-2xl shadow-md border border-slate-300 text-slate-800 text-[11px] font-sans space-y-4">
                
                {/* Cabeçalho */}
                <div className="text-center pb-3 border-b border-dashed border-slate-300">
                  <h4 className="font-black text-sm uppercase text-slate-900">{COMPANY_INFO.name}</h4>
                  <p className="text-[10px] text-slate-500">{COMPANY_INFO.address}</p>
                  <p className="text-[10px] text-slate-500">NIF: {COMPANY_INFO.nif} | Tel: {COMPANY_INFO.contact}</p>
                  
                  <div className="my-2.5 py-1.5 bg-slate-900 text-white rounded-lg">
                    <span className="font-black text-xs uppercase block tracking-wider">FECHO GERAL DIÁRIO</span>
                    <span className="font-mono text-[10px] text-emerald-400 block">{lastCompletedGeneralClosure.id}</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Data: {new Date(lastCompletedGeneralClosure.timestamp).toLocaleString('pt-AO')}
                  </p>
                </div>

                {/* 1. FECHO TOTAL (GERAL) */}
                <div className="p-4 bg-emerald-50/70 border-2 border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center border-b border-emerald-200 pb-2">
                    <div>
                      <span className="text-[11px] font-black uppercase text-emerald-950 block">1. FECHO TOTAL (GERAL)</span>
                      <span className="text-[10px] text-emerald-700 font-bold">{lastCompletedGeneralClosure.totalInvoices} Faturas Emitidas no Dia</span>
                    </div>
                    <span className="text-base font-black text-emerald-700">
                      {lastCompletedGeneralClosure.grandTotal.toLocaleString()} Kz
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Dinheiro:</span>
                      <span className="font-bold text-slate-900">{lastCompletedGeneralClosure.totalCash.toLocaleString()} Kz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Multicaixa:</span>
                      <span className="font-bold text-slate-900">{lastCompletedGeneralClosure.totalTpa.toLocaleString()} Kz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Transferência:</span>
                      <span className="font-bold text-slate-900">{lastCompletedGeneralClosure.totalTransfer.toLocaleString()} Kz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Misto:</span>
                      <span className="font-bold text-slate-900">{lastCompletedGeneralClosure.totalMixed.toLocaleString()} Kz</span>
                    </div>
                  </div>
                </div>

                {/* 2. FECHO DO 1º TURNO */}
                {generalClosureTurno1 && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-800 block">2. FECHO DO 1º TURNO</span>
                        <span className="text-[9px] text-slate-500 font-medium">Operador: <strong>{generalClosureTurno1.userName}</strong> • {generalClosureTurno1.totalInvoices} faturas</span>
                      </div>
                      <span className="text-xs font-black text-slate-800">
                        {generalClosureTurno1.grandTotal.toLocaleString()} Kz
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] text-slate-600 pt-1">
                      <div className="flex justify-between">
                        <span>Dinheiro:</span>
                        <span className="font-bold">{generalClosureTurno1.totalCash.toLocaleString()} Kz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Multicaixa:</span>
                        <span className="font-bold">{generalClosureTurno1.totalTpa.toLocaleString()} Kz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transferência:</span>
                        <span className="font-bold">{generalClosureTurno1.totalTransfer.toLocaleString()} Kz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Misto:</span>
                        <span className="font-bold">{generalClosureTurno1.totalMixed.toLocaleString()} Kz</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. FECHO DO 2º TURNO */}
                {generalClosureTurno2 && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-800 block">3. FECHO DO 2º TURNO</span>
                        <span className="text-[9px] text-slate-500 font-medium">Operador: <strong>{generalClosureTurno2.userName}</strong> • {generalClosureTurno2.totalInvoices} faturas</span>
                      </div>
                      <span className="text-xs font-black text-slate-800">
                        {generalClosureTurno2.grandTotal.toLocaleString()} Kz
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] text-slate-600 pt-1">
                      <div className="flex justify-between">
                        <span>Dinheiro:</span>
                        <span className="font-bold">{generalClosureTurno2.totalCash.toLocaleString()} Kz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Multicaixa:</span>
                        <span className="font-bold">{generalClosureTurno2.totalTpa.toLocaleString()} Kz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transferência:</span>
                        <span className="font-bold">{generalClosureTurno2.totalTransfer.toLocaleString()} Kz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Misto:</span>
                        <span className="font-bold">{generalClosureTurno2.totalMixed.toLocaleString()} Kz</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Assinaturas */}
                <div className="mt-6 pt-4 border-t border-dashed border-slate-300 text-center text-[9px] space-y-3">
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="border-b border-slate-400 w-32 mx-auto mb-1"></div>
                      <span className="font-bold text-slate-700 uppercase text-[8px]">Operador de Caixa</span>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 w-32 mx-auto mb-1"></div>
                      <span className="font-bold text-slate-700 uppercase text-[8px]">Responsável / Gerência</span>
                    </div>
                  </div>
                  <p className="italic text-slate-400 text-[8px]">Software certificado • PharmaGest Angola</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
              <button 
                onClick={handlePrint}
                className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <PrinterIcon className="w-4 h-4 shrink-0" />
                <span>Imprimir Fecho Geral (3 Fechos)</span>
              </button>

              <button 
                onClick={() => setLastCompletedGeneralClosure(null)}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Concluir e Novo Dia</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: VISUALIZAÇÃO E IMPRESSÃO DA FATURA RECIBO                        */}
      {/* ========================================================================= */}
      {lastCreatedInvoice && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 no-print overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-4 px-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider text-emerald-400">Fatura Emitida</h3>
                  <p className="text-[10px] text-slate-300">{lastCreatedInvoice.invoiceNumber}</p>
                </div>
              </div>
              <button 
                onClick={() => setLastCreatedInvoice(null)} 
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
              <div className="w-full max-w-[380px] bg-white p-6 rounded-2xl shadow-md border border-slate-300 text-slate-800 text-[11px] font-sans">
                <div className="text-center pb-3 border-b border-dashed border-slate-300">
                  <h4 className="font-black text-sm uppercase text-slate-900 tracking-tight">{COMPANY_INFO.name}</h4>
                  <p className="text-[10px] text-slate-500">{COMPANY_INFO.address}</p>
                  <p className="text-[10px] text-slate-500">NIF: {COMPANY_INFO.nif} | Tel: {COMPANY_INFO.contact}</p>
                  <p className="text-[10px] text-slate-500">Licença: {COMPANY_INFO.license}</p>
                  
                  <div className="my-2 py-1 bg-slate-100 rounded-lg">
                    <span className="font-black text-xs text-slate-800 uppercase block">Fatura Recibo</span>
                    <span className="font-mono font-bold text-xs text-emerald-700">{lastCreatedInvoice.invoiceNumber}</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {new Date(lastCreatedInvoice.date).toLocaleString('pt-AO')}
                  </p>
                </div>

                <div className="py-2.5 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cliente:</span>
                    <span className="font-bold text-slate-800">{lastCreatedInvoice.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">NIF:</span>
                    <span className="font-mono font-bold text-slate-800">{lastCreatedInvoice.customerNif}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Operador:</span>
                    <span className="font-bold text-slate-800">{lastCreatedInvoice.userName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Turno:</span>
                    <span className="font-bold text-slate-800">{lastCreatedInvoice.shiftName || currentShiftName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pagamento:</span>
                    <span className="font-bold text-emerald-700 uppercase">{lastCreatedInvoice.paymentMethod}</span>
                  </div>
                </div>

                {/* Itens */}
                <div className="py-2.5 border-b border-dashed border-slate-300">
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="text-slate-400 font-bold uppercase border-b border-slate-200">
                        <th className="pb-1">Artigo</th>
                        <th className="pb-1 text-center">Qtd</th>
                        <th className="pb-1 text-right">Preço</th>
                        <th className="pb-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lastCreatedInvoice.items.map((item, idx) => (
                        <tr key={idx} className="py-1">
                          <td className="py-1 font-bold text-slate-800 max-w-[140px] truncate">{item.productName}</td>
                          <td className="py-1 text-center font-bold text-slate-600">{item.quantity}</td>
                          <td className="py-1 text-right font-medium text-slate-500">{item.unitPrice.toLocaleString()}</td>
                          <td className="py-1 text-right font-bold text-slate-800">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totais */}
                <div className="pt-2.5 space-y-1 text-[10px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Ilíquido:</span>
                    <span>{lastCreatedInvoice.totalGross.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA (14%):</span>
                    <span>{lastCreatedInvoice.totalVAT.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-xs font-black pt-1.5 border-t border-slate-300 text-slate-900">
                    <span className="uppercase">Total a Pagar:</span>
                    <span className="text-emerald-600 text-sm font-black">{lastCreatedInvoice.totalNet.toLocaleString()} Kz</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 text-center text-[9px] text-slate-400 italic border-t border-dashed border-slate-300">
                  <p>{COMPANY_INFO.software}</p>
                  <p className="font-bold text-slate-600 uppercase mt-0.5">Obrigado pela preferência!</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
              <button 
                onClick={() => setLastCreatedInvoice(null)} 
                className="py-3 px-4 border-2 border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Nova Venda</span>
              </button>
              <button 
                onClick={handlePrint} 
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <PrinterIcon className="w-4 h-4 shrink-0" /> 
                <span>Imprimir Fatura</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: HISTÓRICO DE VENDAS ATIVAS DO TURNO CORRENTE                    */}
      {/* ORDENADO DA 1ª À ÚLTIMA VENDA COM OPÇÕES DE NOVO TURNO E FECHO GERAL      */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[200] no-print">
          <div className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b bg-slate-900 text-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-xl uppercase tracking-tight">Histórico de Vendas Ativas</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-slate-950 uppercase">
                    {currentShiftName}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {dailyInvoices.length} faturas emitidas neste turno • Organizadas cronologicamente da <strong>1ª venda até a última venda</strong>
                </p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors cursor-pointer"><X className="w-6 h-6" /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr className="text-[10px] font-black text-slate-500 uppercase border-b">
                    <th className="px-6 py-4 text-center">Ordem</th>
                    <th className="px-6 py-4">Nº Fatura</th>
                    <th className="px-6 py-4">Medicamentos</th>
                    <th className="px-6 py-4 text-center">Unidades</th>
                    <th className="px-6 py-4">Forma de Pagamento</th>
                    <th className="px-6 py-4 text-right">Total</th>
                    <th className="px-6 py-4">Hora</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dailyInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-16 text-center text-slate-400 font-bold uppercase tracking-widest">
                        Nenhuma venda ativa registrada neste {currentShiftName}.
                      </td>
                    </tr>
                  ) : (
                    dailyInvoices.map((inv, index) => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-center">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-700 border border-slate-200">
                            {index + 1}ª Venda
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono font-black text-xs text-slate-600">{inv.invoiceNumber}</td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {inv.items.map((item, idx) => (
                              <p key={idx} className="text-sm font-bold text-slate-700 leading-tight">
                                {item.productName} <span className="text-xs font-normal text-slate-400 font-mono">({item.quantity}x {item.unitPrice.toLocaleString()} Kz)</span>
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-700">
                          {inv.items.reduce((sum, it) => sum + it.quantity, 0)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ${
                            inv.paymentMethod === 'Dinheiro' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                            inv.paymentMethod === 'Multicaixa (TPA)' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                            inv.paymentMethod === 'Transferência' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                            'bg-purple-50 text-purple-600 border-purple-200'
                          }`}>
                            {inv.paymentMethod}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-black text-emerald-600">{inv.totalNet.toLocaleString()} Kz</p>
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-[11px] font-bold uppercase">
                          {new Date(inv.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => {
                              setLastCreatedInvoice(inv);
                              setShowHistoryModal(false);
                            }}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                          >
                            <PrinterIcon className="w-3.5 h-3.5" /> Ver / Imprimir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t bg-slate-50 flex flex-wrap justify-between items-center gap-4">
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => {
                    setShowHistoryModal(false);
                    setShowShiftConfirmModal(true);
                  }}
                  disabled={dailyInvoices.length === 0} 
                  className="px-6 py-3 bg-emerald-600 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase flex items-center gap-2 hover:bg-emerald-500 transition-all shadow-md cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Novo Turno (Zerar Caixa)</span>
                </button>

                <button 
                  onClick={() => {
                    setShowHistoryModal(false);
                    setShowGeneralConfirmModal(true);
                  }}
                  className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Fecho Geral do Dia</span>
                </button>
              </div>

              <button onClick={() => setShowHistoryModal(false)} className="px-8 py-3 bg-white border border-slate-300 rounded-xl font-black text-xs uppercase hover:bg-slate-100 transition-all cursor-pointer">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ÁREA DE IMPRESSÃO: FATURA RECIBO (TÉRMICA / A4)                           */}
      {/* ========================================================================= */}
      {lastCreatedInvoice && (
        <div id="printable-invoice" className="hidden print:block p-4 text-black bg-white w-full max-w-[80mm] mx-auto text-[10px] leading-tight font-sans">
          <div className="text-center mb-3">
            <h1 className="font-black text-sm uppercase">{COMPANY_INFO.name}</h1>
            <p className="text-[9px]">{COMPANY_INFO.address}</p>
            <p className="text-[9px]">NIF: {COMPANY_INFO.nif} | Tel: {COMPANY_INFO.contact}</p>
            <p className="text-[9px]">Licença: {COMPANY_INFO.license}</p>
            <div className="border-b-2 border-black my-2"></div>
            <h2 className="font-bold text-xs uppercase">Fatura Recibo {lastCreatedInvoice.invoiceNumber}</h2>
            <p className="text-[9px]">Data: {new Date(lastCreatedInvoice.date).toLocaleString('pt-AO')}</p>
            <p className="font-black border-y border-black py-1 mt-1 uppercase text-[9px]">Pagamento: {lastCreatedInvoice.paymentMethod}</p>
          </div>

          <div className="mb-3 text-[9px]">
            <p><strong>Cliente:</strong> {lastCreatedInvoice.customerName}</p>
            <p><strong>NIF:</strong> {lastCreatedInvoice.customerNif}</p>
            <p><strong>Operador:</strong> {lastCreatedInvoice.userName}</p>
            <p><strong>Turno:</strong> {lastCreatedInvoice.shiftName || currentShiftName}</p>
          </div>

          <table className="w-full mb-3 border-collapse text-[9px]">
            <thead className="border-b border-black">
              <tr className="text-left font-bold uppercase text-[8px]">
                <th className="py-1">Produto</th>
                <th className="py-1 text-center">Qtd</th>
                <th className="py-1 text-right">Preço</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lastCreatedInvoice.items.map((item, idx) => (
                <tr key={idx} className="border-b border-dashed border-gray-300">
                  <td className="py-1 font-medium">{item.productName}</td>
                  <td className="py-1 text-center">{item.quantity}</td>
                  <td className="py-1 text-right">{item.unitPrice.toLocaleString()}</td>
                  <td className="py-1 text-right font-bold">{(item.quantity * item.unitPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-0.5 text-right text-[9px]">
            <p>Total Ilíquido: {lastCreatedInvoice.totalGross.toLocaleString()} Kz</p>
            <p>IVA (14%): {lastCreatedInvoice.totalVAT.toLocaleString()} Kz</p>
            <div className="border-t-2 border-black pt-1 mt-1">
              <p className="text-xs font-black uppercase">Total: {lastCreatedInvoice.totalNet.toLocaleString()} Kz</p>
            </div>
          </div>

          <div className="mt-5 text-center text-[8px] italic border-t border-dashed border-black pt-3">
            <p>{COMPANY_INFO.software}</p>
            <p className="font-bold uppercase mt-1">Obrigado pela sua preferência!</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ÁREA DE IMPRESSÃO: COMPROVATIVO DE FECHO DE TURNO                         */}
      {/* ========================================================================= */}
      {lastCompletedShiftClosure && (
        <div id="printable-shift-closure" className="hidden print:block p-4 text-black bg-white w-full max-w-[80mm] mx-auto text-[10px] leading-tight font-sans">
          <div className="text-center mb-3">
            <h1 className="font-black text-sm uppercase">{COMPANY_INFO.name}</h1>
            <p className="text-[9px]">{COMPANY_INFO.address}</p>
            <p className="text-[9px]">NIF: {COMPANY_INFO.nif} | Tel: {COMPANY_INFO.contact}</p>
            <div className="border-b-2 border-black my-2"></div>
            <h2 className="font-bold text-xs uppercase">COMPROVATIVO DE FECHO DE TURNO</h2>
            <p className="text-[10px] font-black uppercase">{lastCompletedShiftClosure.shiftName}</p>
            <p className="text-[9px] font-mono font-bold">{lastCompletedShiftClosure.id}</p>
            <p className="text-[9px]">Data/Hora: {new Date(lastCompletedShiftClosure.timestamp).toLocaleString('pt-AO')}</p>
            <p className="text-[9px]">Operador: <strong>{lastCompletedShiftClosure.userName}</strong></p>
          </div>

          <div className="border-t border-b border-black py-2 my-2 space-y-1 text-[9px]">
            <div className="flex justify-between">
              <span>Dinheiro:</span>
              <span className="font-bold">{lastCompletedShiftClosure.totalCash.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Multicaixa (TPA):</span>
              <span className="font-bold">{lastCompletedShiftClosure.totalTpa.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Transferência:</span>
              <span className="font-bold">{lastCompletedShiftClosure.totalTransfer.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Misto:</span>
              <span className="font-bold">{lastCompletedShiftClosure.totalMixed.toLocaleString()} Kz</span>
            </div>
            <div className="border-t border-black pt-1 flex justify-between font-black text-xs">
              <span>TOTAL DO TURNO:</span>
              <span>{lastCompletedShiftClosure.grandTotal.toLocaleString()} Kz</span>
            </div>
          </div>

          <div className="text-[9px] mb-4">
            <p><strong>Total de Faturas Emitidas:</strong> {lastCompletedShiftClosure.totalInvoices}</p>
          </div>

          <div className="mt-8 pt-4 border-t border-dashed border-black text-center text-[9px]">
            <div className="mb-4">
              <p className="border-b border-black w-48 mx-auto pb-1"></p>
              <p className="mt-1 font-bold">Assinatura do Operador</p>
            </div>
            <div>
              <p className="border-b border-black w-48 mx-auto pb-1"></p>
              <p className="mt-1 font-bold">Assinatura do Responsável</p>
            </div>
            <p className="mt-4 italic text-[8px]">Software certificado • PharmaGest Angola</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ÁREA DE IMPRESSÃO: COMPROVATIVO DE FECHO GERAL (3 FECHOS)                 */}
      {/* ========================================================================= */}
      {lastCompletedGeneralClosure && (
        <div id="printable-general-closure" className="hidden print:block p-4 text-black bg-white w-full max-w-[80mm] mx-auto text-[10px] leading-tight font-sans">
          <div className="text-center mb-3">
            <h1 className="font-black text-sm uppercase">{COMPANY_INFO.name}</h1>
            <p className="text-[9px]">{COMPANY_INFO.address}</p>
            <p className="text-[9px]">NIF: {COMPANY_INFO.nif} | Tel: {COMPANY_INFO.contact}</p>
            <div className="border-b-2 border-black my-2"></div>
            <h2 className="font-bold text-xs uppercase">COMPROVATIVO DE FECHO GERAL DO DIA</h2>
            <p className="text-[9px] font-mono font-bold">{lastCompletedGeneralClosure.id}</p>
            <p className="text-[9px]">Data/Hora: {new Date(lastCompletedGeneralClosure.timestamp).toLocaleString('pt-AO')}</p>
            <p className="text-[9px]">Responsável: <strong>{lastCompletedGeneralClosure.userName}</strong></p>
          </div>

          {/* 1. FECHO TOTAL DO DIA */}
          <div className="border-2 border-black p-2 my-2 space-y-1 text-[9px]">
            <p className="font-black text-[10px] uppercase border-b border-black pb-0.5">1. FECHO TOTAL (GERAL)</p>
            <div className="flex justify-between">
              <span>Dinheiro:</span>
              <span className="font-bold">{lastCompletedGeneralClosure.totalCash.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Multicaixa (TPA):</span>
              <span className="font-bold">{lastCompletedGeneralClosure.totalTpa.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Transferência:</span>
              <span className="font-bold">{lastCompletedGeneralClosure.totalTransfer.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Misto:</span>
              <span className="font-bold">{lastCompletedGeneralClosure.totalMixed.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between font-bold border-t border-dashed border-black pt-0.5">
              <span>Total de Faturas:</span>
              <span>{lastCompletedGeneralClosure.totalInvoices}</span>
            </div>
            <div className="border-t-2 border-black pt-1 flex justify-between font-black text-xs">
              <span>TOTAL DO DIA:</span>
              <span>{lastCompletedGeneralClosure.grandTotal.toLocaleString()} Kz</span>
            </div>
          </div>

          {/* 2. FECHO DO 1º TURNO */}
          {generalClosureTurno1 && (
            <div className="border border-black p-2 my-2 space-y-1 text-[9px]">
              <p className="font-black text-[9px] uppercase border-b border-black pb-0.5">2. FECHO DO 1º TURNO ({generalClosureTurno1.userName})</p>
              <div className="flex justify-between">
                <span>Dinheiro:</span>
                <span className="font-bold">{generalClosureTurno1.totalCash.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between">
                <span>Multicaixa:</span>
                <span className="font-bold">{generalClosureTurno1.totalTpa.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between">
                <span>Transferência:</span>
                <span className="font-bold">{generalClosureTurno1.totalTransfer.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between">
                <span>Misto:</span>
                <span className="font-bold">{generalClosureTurno1.totalMixed.toLocaleString()} Kz</span>
              </div>
              <div className="border-t border-black pt-0.5 flex justify-between font-bold">
                <span>Total 1º Turno ({generalClosureTurno1.totalInvoices} fat):</span>
                <span>{generalClosureTurno1.grandTotal.toLocaleString()} Kz</span>
              </div>
            </div>
          )}

          {/* 3. FECHO DO 2º TURNO */}
          {generalClosureTurno2 && (
            <div className="border border-black p-2 my-2 space-y-1 text-[9px]">
              <p className="font-black text-[9px] uppercase border-b border-black pb-0.5">3. FECHO DO 2º TURNO ({generalClosureTurno2.userName})</p>
              <div className="flex justify-between">
                <span>Dinheiro:</span>
                <span className="font-bold">{generalClosureTurno2.totalCash.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between">
                <span>Multicaixa:</span>
                <span className="font-bold">{generalClosureTurno2.totalTpa.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between">
                <span>Transferência:</span>
                <span className="font-bold">{generalClosureTurno2.totalTransfer.toLocaleString()} Kz</span>
              </div>
              <div className="flex justify-between">
                <span>Misto:</span>
                <span className="font-bold">{generalClosureTurno2.totalMixed.toLocaleString()} Kz</span>
              </div>
              <div className="border-t border-black pt-0.5 flex justify-between font-bold">
                <span>Total 2º Turno ({generalClosureTurno2.totalInvoices} fat):</span>
                <span>{generalClosureTurno2.grandTotal.toLocaleString()} Kz</span>
              </div>
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-dashed border-black text-center text-[9px]">
            <div className="mb-4">
              <p className="border-b border-black w-48 mx-auto pb-1"></p>
              <p className="mt-1 font-bold">Assinatura do Operador</p>
            </div>
            <div>
              <p className="border-b border-black w-48 mx-auto pb-1"></p>
              <p className="mt-1 font-bold">Assinatura do Responsável</p>
            </div>
            <p className="mt-4 italic text-[8px]">Software certificado • PharmaGest Angola</p>
          </div>
        </div>
      )}

    </div>
  );
};

const SummaryCard = ({ label, value, icon: Icon, color }: any) => {
  const colors: any = {
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    orange: 'text-orange-600 bg-orange-50 border-orange-100',
    purple: 'text-purple-600 bg-purple-50 border-purple-100',
  };
  return (
    <div className={`p-3 rounded-xl border shadow-sm ${colors[color]} flex flex-col justify-between`}>
      <span className="text-[8px] font-black uppercase opacity-70">{label}</span>
      <p className="text-sm font-black truncate">{value.toLocaleString()} <span className="text-[8px]">Kz</span></p>
    </div>
  );
};

export default Billing;
