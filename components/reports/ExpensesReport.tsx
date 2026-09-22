import React, { useState, useEffect, useMemo } from 'react';
import { Expense, ExpenseCategory, User, UserRole } from '../../types';
import { FinancialService } from '../../services/financialService';
import { DeviceService } from '../../services/deviceService';
import { COMPANY_INFO } from '../../constants';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Printer, 
  DollarSign, 
  Trash2, 
  X, 
  Save, 
  FileText, 
  Tag, 
  User as UserIcon, 
  CreditCard, 
  Monitor, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';

interface ExpensesReportProps {
  user: User;
}

const CATEGORIES: ExpenseCategory[] = [
  'Salários',
  'Compra de medicamentos',
  'Energia',
  'Água',
  'Internet',
  'Transporte',
  'Renda/aluguer',
  'Material de escritório',
  'Manutenção',
  'Impostos/taxas',
  'Limpeza',
  'Equipamentos',
  'Outros'
];

const PAYMENT_METHODS = [
  'Numerário',
  'Multicaixa',
  'Transferência',
  'Misto'
];

export const ExpensesReport: React.FC<ExpensesReportProps> = ({ user }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  
  // Datas padrão: mês atual
  const now = new Date();
  const firstDayStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstDayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // Modal para Nova Despesa
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formDate, setFormDate] = useState(todayStr);
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Outros');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('Numerário');
  const [formResponsible, setFormResponsible] = useState(user.name);
  const [formNotes, setFormNotes] = useState('');
  const [formReference, setFormReference] = useState('');

  // Carrega as despesas
  const loadExpenses = async () => {
    setIsLoading(true);
    try {
      const data = await FinancialService.getExpenses({ startDate, endDate });
      setExpenses(data);
    } catch (err) {
      console.error('Erro ao carregar despesas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [startDate, endDate]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescription.trim()) {
      alert('Por favor, informe a descrição da despesa.');
      return;
    }
    if (!formAmount || Number(formAmount) <= 0) {
      alert('Por favor, informe um valor válido para a despesa.');
      return;
    }

    setIsSaving(true);
    try {
      await FinancialService.createExpense({
        date: formDate,
        category: formCategory,
        description: formDescription.trim(),
        amount: Number(formAmount),
        paymentMethod: formPaymentMethod,
        responsible: formResponsible.trim(),
        notes: formNotes.trim(),
        reference: formReference.trim(),
        userId: user.id,
        userName: user.name
      });

      // Limpa o formulário
      setFormDescription('');
      setFormAmount('');
      setFormNotes('');
      setFormReference('');
      setIsModalOpen(false);

      await loadExpenses();
    } catch (err: any) {
      alert(`Erro ao registrar despesa: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (user.role !== UserRole.ADMIN) {
      alert('Apenas o Administrador tem permissão para eliminar despesas.');
      return;
    }
    if (confirm('Tem certeza que deseja anular esta despesa?')) {
      try {
        await FinancialService.cancelExpense(id);
        await loadExpenses();
      } catch (err: any) {
        alert(`Erro ao anular despesa: ${err?.message || err}`);
      }
    }
  };

  // Filtragem
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchCategory = selectedCategory === 'TODAS' || exp.category === selectedCategory;
      const search = searchTerm.toLowerCase();
      const matchSearch = 
        exp.description.toLowerCase().includes(search) ||
        (exp.responsible || '').toLowerCase().includes(search) ||
        (exp.reference || '').toLowerCase().includes(search) ||
        (exp.notes || '').toLowerCase().includes(search) ||
        exp.category.toLowerCase().includes(search);

      return matchCategory && matchSearch;
    });
  }, [expenses, selectedCategory, searchTerm]);

  // Totais
  const activeExpenses = useMemo(() => filteredExpenses.filter(e => e.status !== 'CANCELLED'), [filteredExpenses]);
  const totalAmount = useMemo(() => activeExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), [activeExpenses]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho de Impressão */}
      <div className="hidden print:block mb-6 p-4 border-b border-slate-300">
        <h2 className="text-xl font-black text-slate-900">{COMPANY_INFO.name}</h2>
        <h3 className="text-sm font-bold text-slate-700">Relatório de Despesas / Gastos</h3>
        <p className="text-xs text-slate-500">
          Período: {startDate} a {endDate} • Total Registrado: {totalAmount.toLocaleString()} Kz
        </p>
      </div>

      {/* Top Banner & Controlos - no-print */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-rose-600" />
              Gestão de Despesas & Gastos
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Registo auditável de custos operacionais, administrativos e aquisições com controle de terminal de origem e estado de sincronização.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Despesa
            </button>

            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          </div>
        </div>

        {/* Filtros de Data e Categoria */}
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

          {/* Atalho Mês Atual */}
          <button
            onClick={() => {
              setStartDate(firstDayStr);
              setEndDate(todayStr);
            }}
            className="px-3 py-1.5 text-[11px] font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Mês Corrente
          </button>

          {/* Categoria */}
          <div className="flex items-center gap-2 ml-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:border-rose-500"
            >
              <option value="TODAS">Todas as Categorias</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Busca por texto */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por descrição, responsável, documento ou referência..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total de Despesas</div>
          <div className="text-2xl font-black text-rose-600 font-mono mt-1">
            {totalAmount.toLocaleString()} Kz
          </div>
          <div className="text-xs text-slate-500 mt-1">{activeExpenses.length} registos ativos</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Média por Registo</div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">
            {activeExpenses.length > 0 
              ? Math.round(totalAmount / activeExpenses.length).toLocaleString() 
              : 0} Kz
          </div>
          <div className="text-xs text-slate-500 mt-1">Custo médio por lançamento</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Terminal Atual</div>
          <div className="text-xs font-mono font-bold text-slate-800 truncate mt-1">
            {DeviceService.getDeviceId()}
          </div>
          <div className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Armazenamento Local Ativo
          </div>
        </div>
      </div>

      {/* Tabela de Despesas */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Categoria</th>
                <th className="py-3 px-3">Descrição</th>
                <th className="py-3 px-3 text-right">Valor</th>
                <th className="py-3 px-3">Forma Pagto</th>
                <th className="py-3 px-3">Responsável</th>
                <th className="py-3 px-3">Doc / Ref</th>
                <th className="py-3 px-3">Observação</th>
                <th className="py-3 px-3">Computador Origem</th>
                <th className="py-3 px-3 text-center">Estado Sync</th>
                <th className="py-3 px-3 text-center no-print">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400 text-xs">
                    {isLoading ? 'A carregar despesas...' : 'Nenhuma despesa encontrada para o período selecionado.'}
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const isCancelled = exp.status === 'CANCELLED';
                  const syncStatus = exp.synchronized;
                  return (
                    <tr 
                      key={exp.id} 
                      className={`hover:bg-slate-50/70 transition-colors ${isCancelled ? 'opacity-50 line-through bg-slate-50' : ''}`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {exp.date}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 max-w-xs truncate" title={exp.description}>
                        {exp.description}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-rose-700 whitespace-nowrap">
                        {exp.amount.toLocaleString()} Kz
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {exp.paymentMethod}
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-medium whitespace-nowrap">
                        {exp.responsible || exp.userName || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {exp.reference || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-500 max-w-[150px] truncate" title={exp.notes}>
                        {exp.notes || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-slate-400 whitespace-nowrap" title={exp.deviceId}>
                        {exp.deviceId ? exp.deviceId.slice(0, 10) + '...' : '—'}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {syncStatus ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Sincronizado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap no-print">
                        {!isCancelled && user.role === UserRole.ADMIN && (
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Anular Despesa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Lançamento de Nova Despesa */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-rose-600" />
                Registar Nova Despesa / Gasto
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Data da Despesa *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Categoria *
                  </label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-rose-500"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Descrição do Gasto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pagamento da conta de energia da loja, Compra de papel..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-rose-500"
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
                    step="any"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Forma de Pagamento *
                  </label>
                  <select
                    value={formPaymentMethod}
                    onChange={e => setFormPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-rose-500"
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Responsável
                  </label>
                  <input
                    type="text"
                    placeholder="Nome de quem efetuou o pagamento"
                    value={formResponsible}
                    onChange={e => setFormResponsible(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Documento / Referência
                  </label>
                  <input
                    type="text"
                    placeholder="Nº da fatura, recibo ou comprovativo"
                    value={formReference}
                    onChange={e => setFormReference(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Observações Adicionais
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalhes opcionais..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold uppercase text-[11px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black uppercase text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-rose-200"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'A Registar...' : 'Salvar Despesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
