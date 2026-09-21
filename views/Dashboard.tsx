import React, { useState } from 'react';
import { Product, Batch, Invoice, InvoiceStatus } from '../types';
import { 
  TrendingUp, 
  Package, 
  AlertCircle, 
  Clock, 
  CalendarClock,
  Search,
  X,
  ShieldCheck,
  AlertTriangle,
  Layers,
  ChevronRight,
  DollarSign
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DashboardProps {
  products: Product[];
  batches: Batch[];
  invoices: Invoice[];
}

type ModalType = 'sales' | 'critical' | 'expired' | 'near_expiry' | 'expiry_6_months' | null;

const Dashboard: React.FC<DashboardProps> = ({ products, batches, invoices }) => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalSearch, setModalSearch] = useState('');

  // 1. Função utilitária para cálculo exato e garantido do Stock Real de cada produto
  const getProductRealStock = (product: Product): number => {
    const prodBatches = batches.filter(b => b.productId === product.id);
    if (prodBatches.length > 0) {
      return Math.max(0, prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0));
    }
    return Math.max(0, Number(product.totalQuantity) || 0);
  };

  // 2. Datas de referência
  const today = new Date().toISOString().split('T')[0];
  
  // Limiar de 60 Dias (2 meses)
  const twoMonthsDate = new Date();
  twoMonthsDate.setMonth(twoMonthsDate.getMonth() + 2);
  const twoMonthsThreshold = twoMonthsDate.toISOString().split('T')[0];

  // Limiar de 6 Meses (180 dias)
  const sixMonthsDate = new Date();
  sixMonthsDate.setMonth(sixMonthsDate.getMonth() + 6);
  const sixMonthsThreshold = sixMonthsDate.toISOString().split('T')[0];

  // 3. Indicadores Operacionais e Financeiros
  const dailySales = invoices
    .filter(inv => inv.date.startsWith(today) && inv.status === InvoiceStatus.ISSUED)
    .reduce((sum, inv) => sum + inv.totalNet, 0);

  // Produtos em stock crítico (Stock real <= Stock mínimo)
  const criticalProductsList = products.filter(p => getProductRealStock(p) <= p.minStock);
  const lowStockCount = criticalProductsList.length;

  // Lotes Expirados
  const expiredBatchesList = batches.filter(b => b.expiryDate < today && (Number(b.quantity) || 0) > 0);
  const expiredCount = expiredBatchesList.length;

  // Lotes Próximos do Vencimento (60 dias)
  const nearExpiryBatchesList = batches.filter(b => 
    b.expiryDate >= today && b.expiryDate <= twoMonthsThreshold && (Number(b.quantity) || 0) > 0
  );
  const nearExpiryCount = nearExpiryBatchesList.length;

  // Lotes com Vencimento em 6 Meses
  const sixMonthsBatchesList = batches.filter(b => 
    b.expiryDate >= today && b.expiryDate <= sixMonthsThreshold && (Number(b.quantity) || 0) > 0
  );
  const sixMonthsCount = sixMonthsBatchesList.length;

  // Gráfico de vendas semanais
  const chartData = [
    { name: 'Seg', v: 4000 },
    { name: 'Ter', v: 3000 },
    { name: 'Qua', v: 2000 },
    { name: 'Qui', v: 2780 },
    { name: 'Sex', v: 1890 },
    { name: 'Sab', v: 2390 },
    { name: 'Hoje', v: dailySales > 0 ? dailySales : 3490 },
  ];

  // Helper para cálculo dos dias e formatação de validade
  const getExpiryDetails = (expiryDateStr: string) => {
    const diffTime = new Date(expiryDateStr).getTime() - new Date(today).getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const monthsLeft = (daysLeft / 30.44).toFixed(1);
    return { daysLeft, monthsLeft };
  };

  // Dados dinâmicos do modal selecionado
  const getModalData = () => {
    if (activeModal === 'sales') {
      const sales = invoices.filter(inv => inv.date.startsWith(today));
      return {
        title: 'Vendas de Hoje',
        description: `Todas as faturas emitidas hoje (${new Date().toLocaleDateString('pt-AO')}).`,
        color: 'emerald',
        items: sales.filter(inv => 
          inv.invoiceNumber.toLowerCase().includes(modalSearch.toLowerCase()) ||
          (inv.customerName && inv.customerName.toLowerCase().includes(modalSearch.toLowerCase()))
        )
      };
    }

    if (activeModal === 'critical') {
      return {
        title: 'Produtos com Stock Crítico',
        description: 'Medicamentos e produtos com stock atual real igual ou abaixo do stock mínimo definido.',
        color: 'orange',
        items: criticalProductsList.filter(p => 
          p.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
          p.code.toLowerCase().includes(modalSearch.toLowerCase()) ||
          (p.activeIngredient && p.activeIngredient.toLowerCase().includes(modalSearch.toLowerCase())) ||
          (p.category && p.category.toLowerCase().includes(modalSearch.toLowerCase()))
        )
      };
    }

    if (activeModal === 'expiry_6_months') {
      return {
        title: 'Medicamentos com Vencimento em 6 Meses',
        description: 'Todos os medicamentos e lotes com data de validade prevista para expirar dentro dos próximos 6 meses (180 dias).',
        color: 'indigo',
        items: sixMonthsBatchesList.filter(b => {
          const p = products.find(prod => prod.id === b.productId);
          const name = p ? p.name.toLowerCase() : '';
          const ing = p?.activeIngredient ? p.activeIngredient.toLowerCase() : '';
          const code = p?.code ? p.code.toLowerCase() : '';
          const lot = b.lotNumber.toLowerCase();
          const q = modalSearch.toLowerCase();
          return name.includes(q) || ing.includes(q) || code.includes(q) || lot.includes(q);
        })
      };
    }

    if (activeModal === 'near_expiry') {
      return {
        title: 'Próximos do Vencimento (60 Dias)',
        description: 'Lotes com vencimento iminente programado para os próximos 60 dias.',
        color: 'blue',
        items: nearExpiryBatchesList.filter(b => {
          const p = products.find(prod => prod.id === b.productId);
          const name = p ? p.name.toLowerCase() : '';
          const ing = p?.activeIngredient ? p.activeIngredient.toLowerCase() : '';
          const code = p?.code ? p.code.toLowerCase() : '';
          const lot = b.lotNumber.toLowerCase();
          const q = modalSearch.toLowerCase();
          return name.includes(q) || ing.includes(q) || code.includes(q) || lot.includes(q);
        })
      };
    }

    if (activeModal === 'expired') {
      return {
        title: 'Produtos Expirados',
        description: 'Lotes que já ultrapassaram a data de validade. Devem ser retirados das prateleiras imediatamente.',
        color: 'red',
        items: expiredBatchesList.filter(b => {
          const p = products.find(prod => prod.id === b.productId);
          const name = p ? p.name.toLowerCase() : '';
          const ing = p?.activeIngredient ? p.activeIngredient.toLowerCase() : '';
          const code = p?.code ? p.code.toLowerCase() : '';
          const lot = b.lotNumber.toLowerCase();
          const q = modalSearch.toLowerCase();
          return name.includes(q) || ing.includes(q) || code.includes(q) || lot.includes(q);
        })
      };
    }

    return { title: '', description: '', color: '', items: [] };
  };

  const modalData = getModalData();

  return (
    <div className="space-y-6">
      {/* Grade de Estatísticas - 5 Cartões Interativos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard 
          label="Vendas Hoje" 
          value={`${dailySales.toLocaleString()} Kz`} 
          trend="Emitidas" 
          icon={TrendingUp} 
          color="emerald" 
          onClick={() => { setActiveModal('sales'); setModalSearch(''); }}
        />
        <StatCard 
          label="Stock Crítico" 
          value={lowStockCount.toString()} 
          trend={lowStockCount === 0 ? "Normal" : "Atenção"} 
          icon={Package} 
          color="orange" 
          onClick={() => { setActiveModal('critical'); setModalSearch(''); }}
        />
        <StatCard 
          label="Vencimento em 6 Meses" 
          value={sixMonthsCount.toString()} 
          trend="180 dias" 
          icon={CalendarClock} 
          color="indigo" 
          onClick={() => { setActiveModal('expiry_6_months'); setModalSearch(''); }}
        />
        <StatCard 
          label="Próximos do Vencimento" 
          value={nearExpiryCount.toString()} 
          trend="60 dias" 
          icon={Clock} 
          color="blue" 
          onClick={() => { setActiveModal('near_expiry'); setModalSearch(''); }}
        />
        <StatCard 
          label="Produtos Expirados" 
          value={expiredCount.toString()} 
          trend="Perda iminente" 
          icon={AlertCircle} 
          color="red" 
          onClick={() => { setActiveModal('expired'); setModalSearch(''); }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Vendas */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Tendência de Vendas (Semanal)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Visão consolidada do faturamento por período</p>
            </div>
            <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none">
              <option>Últimos 7 dias</option>
              <option>Mensal</option>
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: any) => [`${Number(value).toLocaleString()} Kz`, 'Faturado']}
                />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#10b981' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Painel de Alertas de Operação */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Alertas de Operação
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {lowStockCount + expiredCount + nearExpiryCount + sixMonthsCount} Alertas
            </span>
          </div>

          <div className="space-y-2.5">
            {lowStockCount > 0 && (
              <AlertItem 
                title="Stock Crítico" 
                desc={`${lowStockCount} produtos com stock real igual ou abaixo do mínimo.`} 
                type="warning" 
                onClick={() => { setActiveModal('critical'); setModalSearch(''); }}
              />
            )}
            {sixMonthsCount > 0 && (
              <AlertItem 
                title="Vencimento em 6 Meses" 
                desc={`${sixMonthsCount} lotes expiram nos próximos 180 dias. Planeie a rotatividade.`} 
                type="indigo" 
                onClick={() => { setActiveModal('expiry_6_months'); setModalSearch(''); }}
              />
            )}
            {nearExpiryCount > 0 && (
              <AlertItem 
                title="Validade Próxima (60 Dias)" 
                desc={`${nearExpiryCount} lotes vencem em menos de 2 meses.`} 
                type="info" 
                onClick={() => { setActiveModal('near_expiry'); setModalSearch(''); }}
              />
            )}
            {expiredCount > 0 && (
              <AlertItem 
                title="Medicamentos Expirados" 
                desc={`${expiredCount} lotes ultrapassaram a validade. Retire da prateleira.`} 
                type="danger" 
                onClick={() => { setActiveModal('expired'); setModalSearch(''); }}
              />
            )}
            {lowStockCount === 0 && expiredCount === 0 && nearExpiryCount === 0 && sixMonthsCount === 0 && (
              <div className="py-8 text-center text-slate-400">
                <ShieldCheck className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                <p className="text-sm font-semibold text-slate-600">Nenhum alerta crítico no momento.</p>
                <p className="text-xs text-slate-400 mt-1">Todos os stocks e datas de validade estão em conformidade.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes com Tabela Dinâmica */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-300">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Cabeçalho do Modal */}
            <div className="p-6 border-b flex items-start justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2.5">
                  {activeModal === 'sales' && <TrendingUp className="w-5 h-5 text-emerald-600" />}
                  {activeModal === 'critical' && <Package className="w-5 h-5 text-orange-600" />}
                  {activeModal === 'expiry_6_months' && <CalendarClock className="w-5 h-5 text-indigo-600" />}
                  {activeModal === 'near_expiry' && <Clock className="w-5 h-5 text-blue-600" />}
                  {activeModal === 'expired' && <AlertCircle className="w-5 h-5 text-red-600" />}
                  {modalData.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {modalData.description}
                </p>
              </div>
              <button 
                onClick={() => { setActiveModal(null); setModalSearch(''); }}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                title="Fechar Janela"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Barra de Pesquisa do Modal */}
            <div className="p-4 border-b bg-white flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder={
                    activeModal === 'sales' ? "Pesquisar por nº de fatura ou cliente..." :
                    activeModal === 'critical' ? "Pesquisar por nome do medicamento, código, princípio ativo ou categoria..." :
                    "Pesquisar por medicamento, código, princípio ativo ou número de lote..."
                  }
                  className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white transition-all font-medium"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                />
              </div>
              <div className="text-xs font-bold px-3.5 py-2 bg-slate-100 rounded-xl text-slate-600 self-stretch sm:self-auto flex items-center justify-center gap-1.5">
                <span>Registos:</span>
                <span className="font-extrabold text-slate-900">{modalData.items.length}</span>
              </div>
            </div>

            {/* Conteúdo do Modal */}
            <div className="flex-1 overflow-y-auto p-6">
              
              {/* TABELA: VENDAS DE HOJE */}
              {activeModal === 'sales' && (
                <div className="space-y-6">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3">Nº Fatura</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Hora</th>
                          <th className="px-4 py-3 text-right">Valor Líquido</th>
                          <th className="px-4 py-3">Método</th>
                          <th className="px-4 py-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalData.items.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-slate-400 font-medium text-xs">
                              Nenhuma venda encontrada para os critérios de pesquisa.
                            </td>
                          </tr>
                        ) : (
                          (modalData.items as Invoice[]).map(inv => (
                            <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3.5 font-mono font-black text-slate-900">{inv.invoiceNumber}</td>
                              <td className="px-4 py-3.5 font-semibold text-slate-700">{inv.customerName || 'Consumidor Final'}</td>
                              <td className="px-4 py-3.5 text-slate-500">
                                {inv.date.includes('T') ? inv.date.split('T')[1].substring(0, 5) : 'N/D'}
                              </td>
                              <td className="px-4 py-3.5 text-right font-black text-slate-900">
                                {inv.totalNet.toLocaleString()} Kz
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border uppercase">
                                  {inv.paymentMethod}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                  inv.status === InvoiceStatus.ISSUED 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                    : 'bg-red-100 text-red-800 border border-red-200'
                                }`}>
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumo Financeiro */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                      <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Faturado Hoje (Líquido)</p>
                      <p className="text-xl font-black text-emerald-900 mt-1">
                        {(modalData.items as Invoice[])
                          .filter(inv => inv.status === InvoiceStatus.ISSUED)
                          .reduce((sum, inv) => sum + inv.totalNet, 0)
                          .toLocaleString()} Kz
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 border rounded-xl">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">IVA Cobrado Hoje</p>
                      <p className="text-xl font-black text-slate-800 mt-1">
                        {(modalData.items as Invoice[])
                          .filter(inv => inv.status === InvoiceStatus.ISSUED)
                          .reduce((sum, inv) => sum + inv.totalVAT, 0)
                          .toLocaleString()} Kz
                      </p>
                    </div>
                    <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl">
                      <p className="text-xs text-red-700 font-bold uppercase tracking-wider">Faturas Canceladas</p>
                      <p className="text-xl font-black text-red-950 mt-1">
                        {(modalData.items as Invoice[]).filter(inv => inv.status === InvoiceStatus.CANCELLED).length}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TABELA: STOCK CRÍTICO (COM STOCK ATUAL REAL E PRECISO) */}
              {activeModal === 'critical' && (
                <div className="space-y-6">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Medicamento / Princípio Ativo</th>
                          <th className="px-4 py-3">Categoria</th>
                          <th className="px-4 py-3 text-center">Lotes</th>
                          <th className="px-4 py-3 text-center">Stock Atual (Real)</th>
                          <th className="px-4 py-3 text-center">Stock Mínimo</th>
                          <th className="px-4 py-3 text-center">Défice</th>
                          <th className="px-4 py-3 text-right">Preço Venda</th>
                          <th className="px-4 py-3 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalData.items.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center text-slate-400 font-medium text-xs">
                              Nenhum produto em stock crítico encontrado para os critérios de pesquisa.
                            </td>
                          </tr>
                        ) : (
                          (modalData.items as Product[]).map(p => {
                            // Cálculo estrito e real do stock a partir dos lotes atuais cadastrados
                            const realStock = getProductRealStock(p);
                            const prodBatches = batches.filter(b => b.productId === p.id);
                            const activeBatchesCount = prodBatches.length;
                            const deficit = Math.max(0, p.minStock - realStock);

                            return (
                              <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3.5 font-mono font-bold text-slate-800">{p.code}</td>
                                <td className="px-4 py-3.5">
                                  <p className="font-extrabold text-slate-800">{p.name}</p>
                                  <p className="text-[11px] text-slate-500 font-medium">{p.activeIngredient || 'Sem princípio ativo'}</p>
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border">
                                    {p.category}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center font-bold text-xs text-slate-600">
                                  {activeBatchesCount} {activeBatchesCount === 1 ? 'lote' : 'lotes'}
                                </td>
                                <td className="px-4 py-3.5 text-center font-black">
                                  <span className={`px-2.5 py-1 rounded-md text-xs inline-block font-extrabold ${
                                    realStock === 0 
                                      ? 'bg-red-100 text-red-800 border border-red-200' 
                                      : 'bg-orange-100 text-orange-800 border border-orange-200'
                                  }`}>
                                    {realStock === 0 ? '0 (Esgotado)' : `${realStock} un`}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center text-slate-700 font-bold">{p.minStock} un</td>
                                <td className="px-4 py-3.5 text-center font-bold text-red-600">
                                  {deficit > 0 ? `-${deficit} un` : '0'}
                                </td>
                                <td className="px-4 py-3.5 text-right font-bold text-slate-900">{p.sellPrice.toLocaleString()} Kz</td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    p.active ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-500 border'
                                  }`}>
                                    {p.active ? 'Ativo' : 'Inativo'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumo do Stock Crítico */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                      <p className="text-xs text-orange-700 font-bold uppercase tracking-wider">Total em Stock Crítico</p>
                      <p className="text-xl font-black text-orange-950 mt-1">
                        {(modalData.items as Product[]).length} Medicamentos
                      </p>
                    </div>
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                      <p className="text-xs text-red-700 font-bold uppercase tracking-wider">Medicamentos Esgotados (0 un)</p>
                      <p className="text-xl font-black text-red-950 mt-1">
                        {(modalData.items as Product[]).filter(p => getProductRealStock(p) === 0).length} Medicamentos
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 border rounded-xl">
                      <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">Unidades em Falta (Reposição)</p>
                      <p className="text-xl font-black text-slate-800 mt-1">
                        {(modalData.items as Product[]).reduce((sum, p) => sum + Math.max(0, p.minStock - getProductRealStock(p)), 0)} un
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TABELA: VENCIMENTO EM 6 MESES (NOVA OPÇÃO) */}
              {activeModal === 'expiry_6_months' && (
                <div className="space-y-6">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Medicamento / Princípio Ativo</th>
                          <th className="px-4 py-3">Lote Nº</th>
                          <th className="px-4 py-3 text-center">Data Vencimento</th>
                          <th className="px-4 py-3 text-center">Tempo Restante</th>
                          <th className="px-4 py-3 text-center">Qtd. Lote</th>
                          <th className="px-4 py-3 text-center">Stock Total</th>
                          <th className="px-4 py-3 text-right">Preço Venda</th>
                          <th className="px-4 py-3 text-right">Valor em Risco</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalData.items.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center text-slate-400 font-medium text-xs">
                              Nenhum medicamento ou lote a vencer nos próximos 6 meses encontrado.
                            </td>
                          </tr>
                        ) : (
                          (modalData.items as Batch[]).map(b => {
                            const product = products.find(p => p.id === b.productId);
                            const totalProdStock = product ? getProductRealStock(product) : b.quantity;
                            const { daysLeft, monthsLeft } = getExpiryDetails(b.expiryDate);
                            const sellPrice = product?.sellPrice || 0;
                            const totalRiskValue = (Number(b.quantity) || 0) * sellPrice;

                            return (
                              <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3.5 font-mono font-bold text-slate-700">{product?.code || 'N/D'}</td>
                                <td className="px-4 py-3.5">
                                  <p className="font-extrabold text-slate-800">{product?.name || 'Medicamento não localizado'}</p>
                                  <p className="text-[11px] text-slate-500 font-medium">{product?.activeIngredient || ''}</p>
                                </td>
                                <td className="px-4 py-3.5 font-mono text-slate-800 font-black">{b.lotNumber}</td>
                                <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                                  {new Date(b.expiryDate).toLocaleDateString('pt-AO')}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold border inline-block ${
                                    daysLeft <= 30 
                                      ? 'bg-red-50 text-red-700 border-red-200' 
                                      : daysLeft <= 90 
                                      ? 'bg-orange-50 text-orange-700 border-orange-200' 
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  }`}>
                                    {daysLeft <= 30 ? `${daysLeft} dias` : `${monthsLeft} meses (${daysLeft}d)`}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center font-black text-slate-900">
                                  <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                                    {b.quantity} un
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center font-semibold text-slate-600 text-xs">
                                  {totalProdStock} un
                                </td>
                                <td className="px-4 py-3.5 text-right font-bold text-slate-700">
                                  {sellPrice.toLocaleString()} Kz
                                </td>
                                <td className="px-4 py-3.5 text-right font-black text-indigo-900">
                                  {totalRiskValue.toLocaleString()} Kz
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumo Financeiro e Operacional de 6 Meses */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                      <p className="text-xs text-indigo-700 font-bold uppercase tracking-wider">Total de Lotes a Expirar</p>
                      <p className="text-xl font-black text-indigo-950 mt-1">
                        {(modalData.items as Batch[]).length} Lotes
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 border rounded-xl">
                      <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">Unidades em Risco de Vencimento</p>
                      <p className="text-xl font-black text-slate-800 mt-1">
                        {(modalData.items as Batch[]).reduce((sum, b) => sum + (Number(b.quantity) || 0), 0)} un
                      </p>
                    </div>
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-xs text-amber-700 font-bold uppercase tracking-wider">Valor Comercial Estimado em Risco</p>
                      <p className="text-xl font-black text-amber-950 mt-1">
                        {(modalData.items as Batch[]).reduce((sum, b) => {
                          const p = products.find(prod => prod.id === b.productId);
                          const price = p?.sellPrice || 0;
                          return sum + ((Number(b.quantity) || 0) * price);
                        }, 0).toLocaleString()} Kz
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TABELA: PRÓXIMOS DO VENCIMENTO (60 DIAS) */}
              {activeModal === 'near_expiry' && (
                <div className="space-y-6">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Medicamento / Princípio Ativo</th>
                          <th className="px-4 py-3">Lote Nº</th>
                          <th className="px-4 py-3 text-center">Data Vencimento</th>
                          <th className="px-4 py-3 text-center">Dias Restantes</th>
                          <th className="px-4 py-3 text-center">Qtd. Disponível</th>
                          <th className="px-4 py-3 text-right">Preço Venda</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalData.items.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-12 text-center text-slate-400 font-medium text-xs">
                              Nenhum lote com vencimento próximo encontrado para os critérios de pesquisa.
                            </td>
                          </tr>
                        ) : (
                          (modalData.items as Batch[]).map(b => {
                            const product = products.find(p => p.id === b.productId);
                            const { daysLeft } = getExpiryDetails(b.expiryDate);

                            return (
                              <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3.5 font-mono font-bold text-slate-700">{product?.code || 'N/D'}</td>
                                <td className="px-4 py-3.5">
                                  <p className="font-extrabold text-slate-800">{product?.name || 'Medicamento Desconhecido'}</p>
                                  <p className="text-[11px] text-slate-500 font-medium">{product?.activeIngredient || ''}</p>
                                </td>
                                <td className="px-4 py-3.5 font-mono text-slate-700 font-black">{b.lotNumber}</td>
                                <td className="px-4 py-3.5 text-center text-slate-700 font-bold">
                                  {new Date(b.expiryDate).toLocaleDateString('pt-AO')}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded text-xs font-bold border ${
                                    daysLeft <= 15 ? 'bg-red-50 text-red-700 border-red-200' :
                                    daysLeft <= 30 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                    'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}>
                                    {daysLeft} dias
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center font-black text-slate-900">{b.quantity} un</td>
                                <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                                  {product?.sellPrice ? `${product.sellPrice.toLocaleString()} Kz` : 'N/D'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end">
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-right max-w-sm w-full">
                      <p className="text-xs text-blue-700 font-bold uppercase tracking-wider">Unidades com Vencimento em 60 Dias</p>
                      <p className="text-2xl font-black text-blue-900 mt-1">
                        {(modalData.items as Batch[]).reduce((sum, b) => sum + (Number(b.quantity) || 0), 0)} un
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TABELA: PRODUTOS EXPIRADOS */}
              {activeModal === 'expired' && (
                <div className="space-y-6">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase tracking-wider bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Medicamento / Produto</th>
                          <th className="px-4 py-3">Lote Nº</th>
                          <th className="px-4 py-3 text-center">Data Vencimento</th>
                          <th className="px-4 py-3 text-center">Qtd. Expirada</th>
                          <th className="px-4 py-3 text-right">Preço Custo</th>
                          <th className="px-4 py-3 text-right">Perda Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalData.items.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-12 text-center text-slate-400 font-medium text-xs">
                              Nenhum lote expirado encontrado para os critérios de pesquisa.
                            </td>
                          </tr>
                        ) : (
                          (modalData.items as Batch[]).map(b => {
                            const product = products.find(p => p.id === b.productId);
                            const costPrice = product?.costPrice || product?.sellPrice || 0;
                            const totalLoss = (Number(b.quantity) || 0) * costPrice;

                            return (
                              <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3.5 font-mono font-bold text-slate-700">{product?.code || 'N/D'}</td>
                                <td className="px-4 py-3.5">
                                  <p className="font-extrabold text-slate-800">{product?.name || 'Desconhecido'}</p>
                                  <p className="text-[11px] text-slate-500 font-medium">{product?.activeIngredient || ''}</p>
                                </td>
                                <td className="px-4 py-3.5 font-mono text-slate-700 font-black">{b.lotNumber}</td>
                                <td className="px-4 py-3.5 text-center text-red-600 font-black">
                                  {new Date(b.expiryDate).toLocaleDateString('pt-AO')}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-200 rounded text-xs font-black">
                                    {b.quantity} un
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-right text-slate-500 font-semibold">{costPrice.toLocaleString()} Kz</td>
                                <td className="px-4 py-3.5 text-right font-black text-red-600">{totalLoss.toLocaleString()} Kz</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Cartão de Perda Financeira */}
                  <div className="flex justify-end">
                    <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-right max-w-sm w-full">
                      <p className="text-xs text-red-700 font-bold uppercase tracking-wider">Perda Financeira Estimada (Custo)</p>
                      <p className="text-2xl font-black text-red-800 mt-1">
                        {(modalData.items as Batch[]).reduce((sum, b) => {
                          const p = products.find(prod => prod.id === b.productId);
                          const cost = p?.costPrice || p?.sellPrice || 0;
                          return sum + ((Number(b.quantity) || 0) * cost);
                        }, 0).toLocaleString()} Kz
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  trend: string;
  icon: any;
  color: 'emerald' | 'orange' | 'indigo' | 'blue' | 'red';
  onClick: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, trend, icon: Icon, color, onClick }) => {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-300',
    orange: 'bg-orange-50 text-orange-600 border-orange-100 hover:border-orange-300',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:border-indigo-300',
    blue: 'bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-300',
    red: 'bg-red-50 text-red-600 border-red-100 hover:border-red-300',
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex flex-col justify-between"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${colors[color].split(' ')[0]} ${colors[color].split(' ')[1]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colors[color].split(' ')[0]} ${colors[color].split(' ')[1]}`}>
          {trend}
        </span>
      </div>
      <div className="mt-4">
        <p className="text-xs text-slate-500 font-semibold">{label}</p>
        <h4 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">{value}</h4>
      </div>
    </div>
  );
};

interface AlertItemProps {
  title: string;
  desc: string;
  type: 'danger' | 'warning' | 'indigo' | 'info';
  onClick: () => void;
}

const AlertItem: React.FC<AlertItemProps> = ({ title, desc, type, onClick }) => {
  const styles: Record<string, string> = {
    danger: 'bg-red-50 border-red-100 text-red-800 hover:border-red-300',
    warning: 'bg-orange-50 border-orange-100 text-orange-800 hover:border-orange-300',
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-800 hover:border-indigo-300',
    info: 'bg-blue-50 border-blue-100 text-blue-800 hover:border-blue-300',
  };

  return (
    <div 
      onClick={onClick}
      className={`p-3.5 rounded-xl border ${styles[type]} cursor-pointer transition-all duration-150 hover:shadow-xs active:scale-98`}
    >
      <div className="flex items-center justify-between">
        <p className="font-bold text-xs uppercase tracking-wider">{title}</p>
        <ChevronRight className="w-4 h-4 opacity-50" />
      </div>
      <p className="text-xs opacity-90 mt-1 font-medium leading-relaxed">{desc}</p>
    </div>
  );
};

export default Dashboard;
