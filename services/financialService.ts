import { db } from './db';
import { Expense, ExpenseCategory, OtherIncome, Invoice, Product, InvoiceStatus } from '../types';
import { DeviceService } from './deviceService';

export interface FinancialFlowSummary {
  periodLabel: string;
  startDate: string;
  endDate: string;
  
  // Entradas
  inflows: {
    salesGross: number;
    salesNet: number;
    salesCount: number;
    otherIncomesTotal: number;
    otherIncomesCount: number;
    totalInflow: number;
  };

  // Saídas
  outflows: {
    purchasesTotal: number; // Compra de medicamentos
    purchasesCount: number;
    salariesTotal: number;  // Salários
    salariesCount: number;
    administrativeTotal: number; // Renda, Material escritório, Impostos, Internet
    administrativeCount: number;
    operationalTotal: number; // Energia, Água, Transporte, Manutenção, Limpeza, Equipamentos, Outros
    operationalCount: number;
    totalOutflow: number;
  };

  // Balanço / Resultado Líquido
  netBalance: number; // totalInflow - totalOutflow
}

export interface FrequentProductStat {
  productId: string;
  productCode: string;
  productName: string;
  category: string;
  currentStock: number;
  daysWithSales: number;   // Dias com venda
  totalDaysAnalyzed: number; // Dias analisados
  frequencyPercentage: number; // Frequência %
  totalUnitsSold: number;
  totalRevenue: number;
}

export const FinancialService = {
  // =========================================================================
  // GESTÃO DE DESPESAS / GASTOS
  // =========================================================================

  /**
   * Cria uma nova despesa com garantia offline-first, identificação de terminal e fila de sincronização.
   */
  async createExpense(data: {
    date: string;
    category: ExpenseCategory;
    description: string;
    amount: number;
    paymentMethod: string;
    responsible?: string;
    notes?: string;
    reference?: string;
    userId: string;
    userName?: string;
  }): Promise<Expense> {
    const expenseId = DeviceService.generateOperationId();
    const operationId = DeviceService.generateOperationId();
    const deviceId = DeviceService.getDeviceId();
    const createdAt = new Date().toISOString();

    const newExpense: Expense = {
      id: expenseId,
      operationId,
      deviceId,
      date: data.date || createdAt.slice(0, 10),
      category: data.category,
      description: data.description.trim(),
      amount: Math.max(0, Number(data.amount) || 0),
      paymentMethod: data.paymentMethod || 'Numerário',
      responsible: data.responsible?.trim() || '',
      notes: data.notes?.trim() || '',
      reference: data.reference?.trim() || '',
      userId: data.userId,
      userName: data.userName || 'Utilizador',
      status: 'ACTIVE',
      synchronized: false,
      createdAt
    };

    // 1. Grava no banco local Dexie
    await db.expenses.put(newExpense);

    // 2. Coloca na fila de sincronização
    try {
      await db.syncQueue.add({
        operationId,
        deviceId,
        entityType: 'expenses',
        entityId: expenseId,
        operationType: 'CREATE',
        payload: newExpense,
        status: 'PENDING',
        retryCount: 0,
        createdAt: Date.now()
      });
    } catch (qErr) {
      console.warn('[FinancialService createExpense queue warning]', qErr);
    }

    return newExpense;
  },

  /**
   * Obtém todas as despesas registradas com filtros opcionais.
   */
  async getExpenses(filter?: {
    startDate?: string;
    endDate?: string;
    category?: string;
  }): Promise<Expense[]> {
    let all = await db.expenses.toArray();
    
    // Ordena da mais recente para a mais antiga
    all.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));

    if (filter?.startDate) {
      all = all.filter(e => (e.date || '').slice(0, 10) >= filter.startDate!);
    }
    if (filter?.endDate) {
      all = all.filter(e => (e.date || '').slice(0, 10) <= filter.endDate!);
    }
    if (filter?.category && filter.category !== 'TODAS') {
      all = all.filter(e => e.category === filter.category);
    }

    return all;
  },

  /**
   * Anula uma despesa.
   */
  async cancelExpense(expenseId: string): Promise<void> {
    const expense = await db.expenses.get(expenseId);
    if (!expense) throw new Error('Despesa não encontrada.');

    expense.status = 'CANCELLED';
    expense.synchronized = false;
    await db.expenses.put(expense);

    try {
      const cancelOpId = DeviceService.generateOperationId();
      await db.syncQueue.add({
        operationId: cancelOpId,
        deviceId: DeviceService.getDeviceId(),
        entityType: 'expenses',
        entityId: expenseId,
        operationType: 'CANCEL',
        payload: { id: expenseId, status: 'CANCELLED' },
        status: 'PENDING',
        retryCount: 0,
        createdAt: Date.now()
      });
    } catch (e) {
      console.warn('[FinancialService cancelExpense queue warning]', e);
    }
  },

  /**
   * Remove fisicamente uma despesa.
   */
  async deleteExpense(expenseId: string): Promise<void> {
    await db.expenses.delete(expenseId);
  },

  // =========================================================================
  // GESTÃO DE OUTRAS RECEITAS (ENTRADAS)
  // =========================================================================

  /**
   * Registra uma outra receita (Entrada não decorrente de venda de balcão).
   */
  async createOtherIncome(data: {
    date: string;
    description: string;
    category: string;
    amount: number;
    paymentMethod: string;
    responsible?: string;
    notes?: string;
    reference?: string;
    userId: string;
    userName?: string;
  }): Promise<OtherIncome> {
    const id = DeviceService.generateOperationId();
    const operationId = DeviceService.generateOperationId();
    const deviceId = DeviceService.getDeviceId();
    const createdAt = new Date().toISOString();

    const income: OtherIncome = {
      id,
      operationId,
      deviceId,
      date: data.date || createdAt.slice(0, 10),
      description: data.description.trim(),
      category: data.category || 'Outras receitas',
      amount: Math.max(0, Number(data.amount) || 0),
      paymentMethod: data.paymentMethod || 'Numerário',
      responsible: data.responsible?.trim() || '',
      notes: data.notes?.trim() || '',
      reference: data.reference?.trim() || '',
      userId: data.userId,
      userName: data.userName || 'Utilizador',
      status: 'ACTIVE',
      synchronized: false,
      createdAt
    };

    await db.otherIncomes.put(income);

    try {
      await db.syncQueue.add({
        operationId,
        deviceId,
        entityType: 'other_incomes',
        entityId: id,
        operationType: 'CREATE',
        payload: income,
        status: 'PENDING',
        retryCount: 0,
        createdAt: Date.now()
      });
    } catch (qErr) {
      console.warn('[FinancialService createOtherIncome queue warning]', qErr);
    }

    return income;
  },

  /**
   * Obtém outras receitas.
   */
  async getOtherIncomes(filter?: { startDate?: string; endDate?: string }): Promise<OtherIncome[]> {
    let all = await db.otherIncomes.toArray();
    all.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));

    if (filter?.startDate) {
      all = all.filter(i => (i.date || '').slice(0, 10) >= filter.startDate!);
    }
    if (filter?.endDate) {
      all = all.filter(i => (i.date || '').slice(0, 10) <= filter.endDate!);
    }
    return all;
  },

  /**
   * Anula outra receita.
   */
  async cancelOtherIncome(incomeId: string): Promise<void> {
    const inc = await db.otherIncomes.get(incomeId);
    if (!inc) throw new Error('Receita não encontrada.');
    inc.status = 'CANCELLED';
    inc.synchronized = false;
    await db.otherIncomes.put(inc);
  },

  /**
   * Elimina outra receita.
   */
  async deleteOtherIncome(incomeId: string): Promise<void> {
    await db.otherIncomes.delete(incomeId);
  },

  // =========================================================================
  // FLUXO FINANCEIRO: ENTRADAS VS SAÍDAS
  // =========================================================================

  /**
   * Calcula o resumo do fluxo financeiro:
   * Entradas: Vendas, Outras receitas.
   * Saídas: Compras (medicamentos), Salários, Despesas administrativas, Despesas operacionais.
   */
  async calculateFinancialFlow(
    invoices: Invoice[],
    startDate: string,
    endDate: string
  ): Promise<FinancialFlowSummary> {
    // 1. Filtrar Vendas do período (não anuladas)
    const periodInvoices = invoices.filter(inv => {
      if (inv.status === InvoiceStatus.CANCELLED) return false;
      const d = (inv.date || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    });

    const salesGross = periodInvoices.reduce((acc, i) => acc + (Number(i.totalGross) || 0), 0);
    const salesNet = periodInvoices.reduce((acc, i) => acc + (Number(i.totalNet) || 0), 0);
    const salesCount = periodInvoices.length;

    // 2. Filtrar Outras Receitas
    const allOtherIncomes = await this.getOtherIncomes({ startDate, endDate });
    const activeOtherIncomes = allOtherIncomes.filter(i => i.status !== 'CANCELLED');
    const otherIncomesTotal = activeOtherIncomes.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
    const otherIncomesCount = activeOtherIncomes.length;

    const totalInflow = salesNet + otherIncomesTotal;

    // 3. Filtrar Despesas do período
    const allExpenses = await this.getExpenses({ startDate, endDate });
    const activeExpenses = allExpenses.filter(e => e.status !== 'CANCELLED');

    // Categorias de Saídas solicitadas:
    // Compras
    const purchasesExpenses = activeExpenses.filter(e => e.category === 'Compra de medicamentos');
    const purchasesTotal = purchasesExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const purchasesCount = purchasesExpenses.length;

    // Salários
    const salariesExpenses = activeExpenses.filter(e => e.category === 'Salários');
    const salariesTotal = salariesExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const salariesCount = salariesExpenses.length;

    // Despesas administrativas: Renda/aluguer, Material de escritório, Impostos/taxas, Internet
    const adminCategories: ExpenseCategory[] = ['Renda/aluguer', 'Material de escritório', 'Impostos/taxas', 'Internet'];
    const adminExpenses = activeExpenses.filter(e => adminCategories.includes(e.category));
    const administrativeTotal = adminExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const administrativeCount = adminExpenses.length;

    // Despesas operacionais: Energia, Água, Transporte, Manutenção, Limpeza, Equipamentos, Outros
    const operationalCategories: ExpenseCategory[] = ['Energia', 'Água', 'Transporte', 'Manutenção', 'Limpeza', 'Equipamentos', 'Outros'];
    const operationalExpenses = activeExpenses.filter(e => operationalCategories.includes(e.category));
    const operationalTotal = operationalExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const operationalCount = operationalExpenses.length;

    const totalOutflow = purchasesTotal + salariesTotal + administrativeTotal + operationalTotal;
    const netBalance = totalInflow - totalOutflow;

    return {
      periodLabel: `${startDate} a ${endDate}`,
      startDate,
      endDate,
      inflows: {
        salesGross,
        salesNet,
        salesCount,
        otherIncomesTotal,
        otherIncomesCount,
        totalInflow
      },
      outflows: {
        purchasesTotal,
        purchasesCount,
        salariesTotal,
        salariesCount,
        administrativeTotal,
        administrativeCount,
        operationalTotal,
        operationalCount,
        totalOutflow
      },
      netBalance
    };
  },

  // =========================================================================
  // PRODUTOS COM SAÍDA MAIS FREQUENTE
  // (Produto, Dias com venda, Dias analisados, Frequência)
  // =========================================================================

  /**
   * Calcula os produtos com saída mais frequente:
   * Para cada produto:
   * - Dias com venda: Quantidade de dias diferentes no período em que houve venda do produto.
   * - Dias analisados: Número total de dias no intervalo analisado.
   * - Frequência: (Dias com venda / Dias analisados) * 100%.
   */
  calculateFrequentProducts(
    invoices: Invoice[],
    products: Product[],
    startDate: string,
    endDate: string
  ): {
    totalDaysAnalyzed: number;
    items: FrequentProductStat[];
  } {
    // 1. Determinar todos os dias únicos no intervalo analisado
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDaysAnalyzed = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);

    // 2. Filtrar faturas válidas do período
    const periodInvoices = invoices.filter(inv => {
      if (inv.status === InvoiceStatus.CANCELLED) return false;
      const d = (inv.date || '').slice(0, 10);
      return d >= startDate && d <= endDate;
    });

    // 3. Mapear para cada produto o conjunto de dias com venda (Set<string>)
    const productDaysMap = new Map<string, Set<string>>();
    const productUnitsMap = new Map<string, number>();
    const productRevenueMap = new Map<string, number>();

    for (const inv of periodInvoices) {
      const dayStr = (inv.date || '').slice(0, 10);
      if (!dayStr) continue;

      for (const item of (inv.items || [])) {
        const pId = item.productId;
        if (!pId) continue;

        if (!productDaysMap.has(pId)) {
          productDaysMap.set(pId, new Set<string>());
          productUnitsMap.set(pId, 0);
          productRevenueMap.set(pId, 0);
        }

        productDaysMap.get(pId)!.add(dayStr);
        productUnitsMap.set(pId, (productUnitsMap.get(pId) || 0) + (Number(item.quantity) || 1));
        productRevenueMap.set(pId, (productRevenueMap.get(pId) || 0) + (Number(item.subtotal) || 0));
      }
    }

    // 4. Montar a lista de estatísticas para os produtos
    const result: FrequentProductStat[] = products.map(prod => {
      const daysSet = productDaysMap.get(prod.id);
      const daysWithSales = daysSet ? daysSet.size : 0;
      const frequencyPercentage = (daysWithSales / totalDaysAnalyzed) * 100;
      const totalUnitsSold = productUnitsMap.get(prod.id) || 0;
      const totalRevenue = productRevenueMap.get(prod.id) || 0;

      return {
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        category: prod.category,
        currentStock: prod.totalQuantity,
        daysWithSales,
        totalDaysAnalyzed,
        frequencyPercentage: parseFloat(frequencyPercentage.toFixed(1)),
        totalUnitsSold,
        totalRevenue
      };
    });

    // 5. Ordenar por dias com venda decrescente (e depois por unidades)
    result.sort((a, b) => {
      if (b.daysWithSales !== a.daysWithSales) {
        return b.daysWithSales - a.daysWithSales;
      }
      return b.totalUnitsSold - a.totalUnitsSold;
    });

    return {
      totalDaysAnalyzed,
      items: result
    };
  }
};
