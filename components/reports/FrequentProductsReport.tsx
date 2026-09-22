import React, { useState, useMemo } from 'react';
import { Invoice, Product } from '../../types';
import { FinancialService } from '../../services/financialService';
import { COMPANY_INFO } from '../../constants';
import { 
  Search, 
  Printer, 
  Calendar, 
  Activity, 
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Package
} from 'lucide-react';

interface FrequentProductsReportProps {
  invoices: Invoice[];
  products: Product[];
}

export const FrequentProductsReport: React.FC<FrequentProductsReportProps> = ({ invoices, products }) => {
  // Datas padrão: Últimos 30 dias até hoje
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState('');
  const [minFrequency, setMinFrequency] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'frequency' | 'salesDays' | 'units' | 'revenue'>('frequency');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Atalhos de período
  const handleQuickPeriod = (days: number) => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
  };

  const handleMonthPeriod = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const stats = useMemo(() => {
    return FinancialService.calculateFrequentProducts(invoices, products, startDate, endDate);
  }, [invoices, products, startDate, endDate]);

  const filteredItems = useMemo(() => {
    let list = stats.items.filter(item => {
      const matchSearch = 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchFreq = item.frequencyPercentage >= minFrequency;
      return matchSearch && matchFreq;
    });

    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortBy === 'frequency') {
        valA = a.frequencyPercentage;
        valB = b.frequencyPercentage;
      } else if (sortBy === 'salesDays') {
        valA = a.daysWithSales;
        valB = b.daysWithSales;
      } else if (sortBy === 'units') {
        valA = a.totalUnitsSold;
        valB = b.totalUnitsSold;
      } else if (sortBy === 'revenue') {
        valA = a.totalRevenue;
        valB = b.totalRevenue;
      }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    return list;
  }, [stats, searchTerm, minFrequency, sortBy, sortOrder]);

  const toggleSort = (field: 'frequency' | 'salesDays' | 'units' | 'revenue') => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho de Impressão */}
      <div className="hidden print:block mb-6 p-4 border-b border-slate-300">
        <h2 className="text-xl font-black text-slate-900">{COMPANY_INFO.name}</h2>
        <h3 className="text-sm font-bold text-slate-700">Relatório: Produtos com Saída Mais Frequente</h3>
        <p className="text-xs text-slate-500">
          Período analisado: {startDate} a {endDate} • Total de dias analisados: {stats.totalDaysAnalyzed} dias
        </p>
      </div>

      {/* Top Banner & Filtros - no-print */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Produtos com Saída Mais Frequente
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Avalia a consistência de rotação dos medicamentos baseada no número de dias em que foram vendidos no período analisado.
            </p>
          </div>

          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir Relatório
          </button>
        </div>

        {/* Seletores de Período */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-bold text-slate-600">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none"
            />
            <span className="font-bold text-slate-600">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none"
            />
          </div>

          {/* Atalhos Rápidos */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleQuickPeriod(7)}
              className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              7 Dias
            </button>
            <button
              onClick={() => handleQuickPeriod(15)}
              className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              15 Dias
            </button>
            <button
              onClick={() => handleQuickPeriod(30)}
              className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              30 Dias
            </button>
            <button
              onClick={handleMonthPeriod}
              className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
            >
              Mês Atual
            </button>
          </div>

          {/* Badge Informativo de Dias */}
          <div className="ml-auto px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-xl text-xs font-black">
            {stats.totalDaysAnalyzed} {stats.totalDaysAnalyzed === 1 ? 'dia analisado' : 'dias analisados'}
          </div>
        </div>

        {/* Barra de Pesquisa e Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por nome do medicamento, código ou categoria..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={minFrequency}
              onChange={e => setMinFrequency(Number(e.target.value))}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
            >
              <option value="0">Todas as Frequências (≥ 0%)</option>
              <option value="20">Média Frequência (≥ 20%)</option>
              <option value="50">Alta Frequência (≥ 50%)</option>
              <option value="75">Altíssima Rotação (≥ 75%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Produtos Analisados</div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">{products.length}</div>
          <div className="text-xs text-slate-500 mt-1">Total de itens no catálogo</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Com Vendas no Período</div>
          <div className="text-2xl font-black text-indigo-600 font-mono mt-1">
            {stats.items.filter(i => i.daysWithSales > 0).length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {((stats.items.filter(i => i.daysWithSales > 0).length / Math.max(1, products.length)) * 100).toFixed(0)}% do catálogo ativo
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Produto Mais Frequente</div>
          <div className="text-base font-black text-emerald-700 truncate mt-1">
            {stats.items[0]?.daysWithSales > 0 ? stats.items[0].productName : 'Nenhuma venda no período'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.items[0]?.daysWithSales > 0 
              ? `${stats.items[0].daysWithSales} de ${stats.totalDaysAnalyzed} dias (${stats.items[0].frequencyPercentage}%)`
              : 'Sem movimentação'}
          </div>
        </div>
      </div>

      {/* Tabela de Produtos com Saída Mais Frequente */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">#</th>
                <th className="py-3.5 px-4">Produto</th>
                <th className="py-3.5 px-4 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('salesDays')}>
                  <div className="flex items-center gap-1">
                    Dias com venda
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Dias analisados</th>
                <th className="py-3.5 px-4 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('frequency')}>
                  <div className="flex items-center gap-1">
                    Frequência
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 text-right" onClick={() => toggleSort('units')}>
                  <div className="flex items-center justify-end gap-1">
                    Qtd. Vendida
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 text-right" onClick={() => toggleSort('revenue')}>
                  <div className="flex items-center justify-end gap-1">
                    Total Faturado
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center">Stock Atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    Nenhum produto encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const isTop = item.frequencyPercentage >= 50;
                  return (
                    <tr key={item.productId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400 font-bold">{index + 1}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Cód: {item.productCode} • {item.category}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-black text-slate-800 font-mono text-sm">
                          {item.daysWithSales}
                        </span>
                        <span className="text-slate-400 text-[10px] ml-1">
                          {item.daysWithSales === 1 ? 'dia' : 'dias'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 font-medium">
                        {item.totalDaysAnalyzed} dias
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                isTop ? 'bg-emerald-500' : item.frequencyPercentage > 20 ? 'bg-indigo-500' : 'bg-slate-300'
                              }`}
                              style={{ width: `${Math.min(100, item.frequencyPercentage)}%` }}
                            />
                          </div>
                          <span className={`font-mono font-bold text-xs ${
                            isTop ? 'text-emerald-700' : 'text-slate-700'
                          }`}>
                            {item.frequencyPercentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                        {item.totalUnitsSold.toLocaleString()} un
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                        {item.totalRevenue.toLocaleString()} Kz
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          item.currentStock <= 0 
                            ? 'bg-rose-100 text-rose-700' 
                            : item.currentStock <= 10 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {item.currentStock} un
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
