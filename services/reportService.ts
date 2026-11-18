import { Invoice, Product, Batch, InvoiceStatus } from '../types';
import { db, DailyClosure } from './db';
import { roundMoney, getAngolaDateKey, summarizeInvoicesByPayment } from '../utils/financeUtils';

export interface CMVProfitabilityResult {
  totalRevenueGross: number;
  totalRevenueNet: number;
  totalVAT: number;
  totalCostOfGoodsSold: number; // CMV
  grossProfit: number;          // Lucro Bruto
  grossMarginPercentage: number; // Margem %
  totalInvoicesIssued: number;
  totalInvoicesCancelled: number;
  cancelledAmount: number;
}

export interface ProductMovementAnalysis {
  productId: string;
  code: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unitsSold: number;
  invoicesCount: number;
  revenueGenerated: number;
  costIncurred: number;
  profitGenerated: number;
  isLowStock: boolean;
  isNoMovement: boolean;
}

export interface ShiftDetailReport {
  shiftNumber: number;
  shiftName: string;
  operator: string;
  issuedCount: number;
  cancelledCount: number;
  cashTotal: number;
  tpaTotal: number;
  transferTotal: number;
  mixedTotal: number;
  grandTotal: number;
}

export const ReportService = {
  /**
   * Calcula o CMV (Custo das Mercadorias Vendidas) e Rentabilidade Real (Regra 29).
   */
  calculateCMVAndProfitability(
    invoices: Invoice[],
    products: Product[],
    startDate?: string,
    endDate?: string
  ): CMVProfitabilityResult {
    const productMap = new Map<string, Product>();
    products.forEach(p => productMap.set(p.id, p));

    let filtered = invoices;
    if (startDate) {
      filtered = filtered.filter(i => getAngolaDateKey(i.date) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(i => getAngolaDateKey(i.date) <= endDate);
    }

    let totalRevenueGross = 0;
    let totalRevenueNet = 0;
    let totalVAT = 0;
    let totalCostOfGoodsSold = 0;
    let totalInvoicesIssued = 0;
    let totalInvoicesCancelled = 0;
    let cancelledAmount = 0;

    for (const inv of filtered) {
      if (inv.status === InvoiceStatus.CANCELLED) {
        totalInvoicesCancelled++;
        cancelledAmount += roundMoney(inv.totalNet);
        continue;
      }

      totalInvoicesIssued++;
      totalRevenueGross += roundMoney(inv.totalGross);
      totalRevenueNet += roundMoney(inv.totalNet);
      totalVAT += roundMoney(inv.totalVAT);

      for (const item of (inv.items || [])) {
        const prod = item.productId ? productMap.get(item.productId) : null;
        const unitCost = Number(prod?.costPrice) || 0;
        totalCostOfGoodsSold += unitCost * (Number(item.quantity) || 1);
      }
    }

    totalRevenueGross = roundMoney(totalRevenueGross);
    totalRevenueNet = roundMoney(totalRevenueNet);
    totalVAT = roundMoney(totalVAT);
    totalCostOfGoodsSold = roundMoney(totalCostOfGoodsSold);
    cancelledAmount = roundMoney(cancelledAmount);

    const grossProfit = roundMoney(totalRevenueNet - totalCostOfGoodsSold);
    const grossMarginPercentage = totalRevenueNet > 0 
      ? (grossProfit / totalRevenueNet) * 100 
      : 0;

    return {
      totalRevenueGross,
      totalRevenueNet,
      totalVAT,
      totalCostOfGoodsSold,
      grossProfit,
      grossMarginPercentage,
      totalInvoicesIssued,
      totalInvoicesCancelled,
      cancelledAmount
    };
  },

  /**
   * Análise de giro de estoque, frequência de vendas e estoque crítico (Regra 30).
   */
  analyzeProductMovements(
    invoices: Invoice[],
    products: Product[],
    startDate?: string,
    endDate?: string
  ): {
    allProducts: ProductMovementAnalysis[];
    topSellers: ProductMovementAnalysis[];
    noMovement: ProductMovementAnalysis[];
    lowStockAlerts: ProductMovementAnalysis[];
  } {
    const validInvoices = invoices.filter(i => {
      if (i.status === InvoiceStatus.CANCELLED) return false;
      const d = getAngolaDateKey(i.date);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    const salesStats = new Map<string, { unitsSold: number; invoicesCount: number; revenue: number }>();

    for (const inv of validInvoices) {
      for (const item of (inv.items || [])) {
        const pId = item.productId;
        if (!pId) continue;
        const stat = salesStats.get(pId) || { unitsSold: 0, invoicesCount: 0, revenue: 0 };
        stat.unitsSold += Number(item.quantity) || 1;
        stat.invoicesCount += 1;
        stat.revenue += roundMoney((Number(item.subtotal) || 0) + (Number(item.vatAmount) || 0));
        salesStats.set(pId, stat);
      }
    }

    const results: ProductMovementAnalysis[] = products.map(prod => {
      const stat = salesStats.get(prod.id) || { unitsSold: 0, invoicesCount: 0, revenue: 0 };
      const unitCost = Number(prod.costPrice) || 0;
      const costIncurred = roundMoney(unitCost * stat.unitsSold);
      const revenueGenerated = roundMoney(stat.revenue);
      const profitGenerated = roundMoney(revenueGenerated - costIncurred);
      const isLowStock = prod.totalQuantity <= (prod.minStock || 0);
      const isNoMovement = stat.unitsSold === 0;

      return {
        productId: prod.id,
        code: prod.code,
        name: prod.name,
        category: prod.category,
        currentStock: prod.totalQuantity,
        minStock: prod.minStock,
        unitsSold: stat.unitsSold,
        invoicesCount: stat.invoicesCount,
        revenueGenerated,
        costIncurred,
        profitGenerated,
        isLowStock,
        isNoMovement
      };
    });

    const topSellers = [...results]
      .filter(r => r.unitsSold > 0)
      .sort((a, b) => b.unitsSold - a.unitsSold);

    const noMovement = results.filter(r => r.isNoMovement);
    const lowStockAlerts = results.filter(r => r.isLowStock);

    return {
      allProducts: results,
      topSellers,
      noMovement,
      lowStockAlerts
    };
  },

  /**
   * Relatório analítico de turnos e operadores com fechamento diário (Regra 31).
   */
  generateShiftReport(
    invoices: Invoice[],
    date: string
  ): ShiftDetailReport[] {
    const targetDate = getAngolaDateKey(date);
    const dayInvoices = invoices.filter(i => getAngolaDateKey(i.date) === targetDate);
    const shiftsFound = Array.from(new Set(dayInvoices.map(i => i.shiftNumber || 1))).sort((a, b) => a - b);

    return shiftsFound.map(shiftNum => {
      const sInvs = dayInvoices.filter(i => (i.shiftNumber || 1) === shiftNum);
      const issued = sInvs.filter(i => i.status !== InvoiceStatus.CANCELLED);
      const cancelled = sInvs.filter(i => i.status === InvoiceStatus.CANCELLED);
      const summary = summarizeInvoicesByPayment(issued, false);

      const shiftName = sInvs[0]?.shiftName || `${shiftNum}º Turno`;
      const operator = sInvs[sInvs.length - 1]?.userName || 'Operador';

      return {
        shiftNumber: shiftNum,
        shiftName,
        operator,
        issuedCount: issued.length,
        cancelledCount: cancelled.length,
        cashTotal: summary.cash,
        tpaTotal: summary.tpa,
        transferTotal: summary.transfer,
        mixedTotal: summary.mixed,
        grandTotal: summary.total
      };
    });
  }
};
