import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, User, UserRole, OtherIncome } from '../../types';
import { FinancialService, FinancialFlowSummary } from '../../services/financialService';
import { COMPANY_INFO } from '../../constants';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Printer, 
  DollarSign, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  X, 
  Save, 
  Briefcase, 
  Layers,
  Scale
} from 'lucide-react';

interface FinancialFlowReportProps {
  invoices: Invoice[];
  user: User;
}

export const FinancialFlowReport: React.FC<FinancialFlowReportProps> = ({ invoices, user }) => {
  // Datas padrão: mês atual
  const now = new Date();
  const firstDayStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstDayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [summary, setSummary] = useState<FinancialFlowSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal para Outras Receitas
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [incomeDescription, setIncomeDescription] = useState('');
  const [incomeCategory, setIncomeCategory] = useState('Outras receitas');
  const [incomeAmount, setIncomeAmount] = useState<number | ''>('');
  const [incomePaymentMethod, setIncomePaymentMethod] = useState('Numerário');
  const [incomeResponsible, setIncomeResponsible] = useState(user.name);
  const [incomeReference, setIncomeReference] = useState('');
  const [incomeNotes, setIncomeNotes] = useState('');

  const loadFlowData = async () => {
    setIsLoading(true);
    try {
      const data = await FinancialService.calculateFinancialFlow(invoices, startDate, endDate);
      setSummary(data);
    } catch (err) {
      console.error('Erro ao calcular fluxo financeiro:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlowData();
  }, [invoices, startDate, endDate]);

  const handleCreateIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incomeDescription.trim()) {
      alert('Por favor, informe a descrição da receita.');
      return;
    }
    if (!incomeAmount || Number(incomeAmount) <= 0) {
      alert('Por favor, informe um valor válido.');
      return;
    }

    setIsSavingIncome(true);
    try {
      await FinancialService.createOtherIncome({
        date: todayStr,
        description: incomeDescription.trim(),
        category: incomeCategory.trim(),
        amount: Number(incomeAmount),
        paymentMethod: incomePaymentMethod,
        responsible: incomeResponsible.trim(),
        reference: incomeReference.trim(),
        notes: incomeNotes.trim(),
        userId: user.id,
        userName: user.name
      });

      setIncomeDescription('');
      setIncomeAmount('');
      setIncomeNotes('');
      setIncomeReference('');
      setIsIncomeModalOpen(false);

      await loadFlowData();
    } catch (err: any) {
      alert(`Erro ao registrar receita: ${err?.message || err}`);
    } finally {
      setIsSavingIncome(false);
    }
  };

  const isPositiveBalance = (summary?.netBalance || 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho de Impressão */}
      <div className="hidden print:block mb-6 p-4 border-b border-slate-300">
        <h2 className="text-xl font-black text-slate-900">{COMPANY_INFO.name}</h2>
        <h3 className="text-sm font-bold text-slate-700">Relatório de Fluxo Financeiro (Entradas vs Saídas)</h3>
        <p className="text-xs text-slate-500">
          Período: {startDate} a {endDate} • Emitido por: {user.name} em {new Date().toLocaleDateString('pt-AO')}
        </p>
      </div>

      {/* Top Banner & Controlos - no-print */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-600" />
              Demonstrativo Financeiro (Entradas vs Saídas)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Controle de Entradas (Vendas e Outras Receitas) contra Saídas (Compras de Medicamentos, Salários, Despesas Administrativas e Operacionais).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsIncomeModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Registar Outra Receita
            </button>

            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir Balanço
            </button>
          </div>
        </div>

        {/* Filtros de Data */}
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

          <button
            onClick={() => {
              setStartDate(firstDayStr);
              setEndDate(todayStr);
            }}
            className="px-3 py-1.5 text-[11px] font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Mês Atual
          </button>

          <button
            onClick={() => {
              const y = new Date().getFullYear();
              setStartDate(`${y}-01-01`);
              setEndDate(`${y}-12-31`);
            }}
            className="px-3 py-1.5 text-[11px] font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Ano Completo
          </button>
        </div>
      </div>

      {/* Cards de Balanço Principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Entradas Card */}
        <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Total de Entradas
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800">
              Receitas
            </span>
          </div>
          <div className="text-3xl font-black text-emerald-700 font-mono">
            {summary ? summary.inflows.totalInflow.toLocaleString() : '...'} Kz
          </div>
          <div className="pt-2 border-t border-emerald-50 text-xs space-y-1 text-slate-600">
            <div className="flex justify-between">
              <span>• Vendas (Faturação):</span>
              <span className="font-bold text-slate-900 font-mono">
                {summary?.inflows.salesNet.toLocaleString()} Kz
              </span>
            </div>
            <div className="flex justify-between">
              <span>• Outras Receitas:</span>
              <span className="font-bold text-slate-900 font-mono">
                {summary?.inflows.otherIncomesTotal.toLocaleString()} Kz
              </span>
            </div>
          </div>
        </div>

        {/* Saídas Card */}
        <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
              Total de Saídas
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800">
              Despesas & Compras
            </span>
          </div>
          <div className="text-3xl font-black text-rose-700 font-mono">
            {summary ? summary.outflows.totalOutflow.toLocaleString() : '...'} Kz
          </div>
          <div className="pt-2 border-t border-rose-50 text-xs space-y-1 text-slate-600">
            <div className="flex justify-between">
              <span>• Compras de Medicamentos:</span>
              <span className="font-bold text-slate-900 font-mono">
                {summary?.outflows.purchasesTotal.toLocaleString()} Kz
              </span>
            </div>
            <div className="flex justify-between">
              <span>• Salários:</span>
              <span className="font-bold text-slate-900 font-mono">
                {summary?.outflows.salariesTotal.toLocaleString()} Kz
              </span>
            </div>
            <div className="flex justify-between">
              <span>• Despesas Administrativas:</span>
              <span className="font-bold text-slate-900 font-mono">
                {summary?.outflows.administrativeTotal.toLocaleString()} Kz
              </span>
            </div>
            <div className="flex justify-between">
              <span>• Despesas Operacionais:</span>
              <span className="font-bold text-slate-900 font-mono">
                {summary?.outflows.operationalTotal.toLocaleString()} Kz
              </span>
            </div>
          </div>
        </div>

        {/* Balanço / Resultado Líquido Card */}
        <div className={`border rounded-2xl p-5 shadow-sm space-y-3 ${
          isPositiveBalance 
            ? 'bg-slate-900 border-slate-800 text-white' 
            : 'bg-rose-950 border-rose-900 text-white'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
              Resultado Líquido (Saldo)
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
              isPositiveBalance ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
            }`}>
              {isPositiveBalance ? 'Superávit' : 'Déficit'}
            </span>
          </div>
          <div className="text-3xl font-black font-mono">
            {summary ? (summary.netBalance >= 0 ? '+' : '') + summary.netBalance.toLocaleString() : '...'} Kz
          </div>
          <div className="pt-2 border-t border-white/10 text-xs space-y-1 text-slate-300">
            <div className="flex justify-between">
              <span>Margem Operacional:</span>
              <span className="font-bold font-mono text-emerald-400">
                {summary && summary.inflows.totalInflow > 0
                  ? ((summary.netBalance / summary.inflows.totalInflow) * 100).toFixed(1) + '%'
                  : '0%'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 pt-1">
              {isPositiveBalance 
                ? 'Operação lucrativa no período selecionado.' 
                : 'Atenção: Os custos ultrapassaram a receita no período.'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabela Detalhada de Comparativo: Entradas e Saídas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Painel Discriminado de Entradas */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Detalhamento de Entradas
            </h3>
            <span className="text-xs font-bold text-emerald-700 font-mono">
              {summary?.inflows.totalInflow.toLocaleString()} Kz
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Vendas (Faturas Emitidas)</div>
                <div className="text-[10px] text-slate-500">
                  {summary?.inflows.salesCount} faturas registradas no balcão
                </div>
              </div>
              <div className="text-right font-black text-emerald-800 font-mono text-sm">
                {summary?.inflows.salesNet.toLocaleString()} Kz
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Outras Receitas</div>
                <div className="text-[10px] text-slate-500">
                  {summary?.inflows.otherIncomesCount} lançamentos extras de receitas
                </div>
              </div>
              <div className="text-right font-black text-slate-900 font-mono text-sm">
                {summary?.inflows.otherIncomesTotal.toLocaleString()} Kz
              </div>
            </div>
          </div>
        </div>

        {/* Painel Discriminado de Saídas */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
              Detalhamento de Saídas
            </h3>
            <span className="text-xs font-bold text-rose-700 font-mono">
              {summary?.outflows.totalOutflow.toLocaleString()} Kz
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Compras de Medicamentos</div>
                <div className="text-[10px] text-slate-500">Aquisição de stock e reposição</div>
              </div>
              <div className="text-right font-black text-rose-800 font-mono">
                {summary?.outflows.purchasesTotal.toLocaleString()} Kz
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Salários</div>
                <div className="text-[10px] text-slate-500">Folha de pagamento e remunerações</div>
              </div>
              <div className="text-right font-black text-slate-900 font-mono">
                {summary?.outflows.salariesTotal.toLocaleString()} Kz
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Despesas Administrativas</div>
                <div className="text-[10px] text-slate-500">Renda/aluguer, Escritório, Impostos, Internet</div>
              </div>
              <div className="text-right font-black text-slate-900 font-mono">
                {summary?.outflows.administrativeTotal.toLocaleString()} Kz
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Despesas Operacionais</div>
                <div className="text-[10px] text-slate-500">Energia, Água, Transporte, Manutenção, Limpeza, etc.</div>
              </div>
              <div className="text-right font-black text-slate-900 font-mono">
                {summary?.outflows.operationalTotal.toLocaleString()} Kz
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal para Registrar Outra Receita */}
      {isIncomeModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Registar Outra Receita (Entrada Extra)
              </h3>
              <button 
                onClick={() => setIsIncomeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncome} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Descrição da Receita *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aplicação de injetáveis, Teste de Malária/Glicemia, Consultoria..."
                  value={incomeDescription}
                  onChange={e => setIncomeDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Valor (Kz) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="0.00"
                    value={incomeAmount}
                    onChange={e => setIncomeAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Categoria da Receita
                  </label>
                  <input
                    type="text"
                    value={incomeCategory}
                    onChange={e => setIncomeCategory(e.target.value)}
                    placeholder="Ex: Serviços de Enfermagem, Outras"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={incomePaymentMethod}
                    onChange={e => setIncomePaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Numerário">Numerário</option>
                    <option value="Multicaixa">Multicaixa</option>
                    <option value="Transferência">Transferência</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Responsável
                  </label>
                  <input
                    type="text"
                    value={incomeResponsible}
                    onChange={e => setIncomeResponsible(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Documento / Referência
                </label>
                <input
                  type="text"
                  placeholder="Nº de recibo, guia ou referência"
                  value={incomeReference}
                  onChange={e => setIncomeReference(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsIncomeModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold uppercase text-[11px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingIncome}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200"
                >
                  <Save className="w-4 h-4" />
                  {isSavingIncome ? 'A Salvar...' : 'Salvar Receita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
