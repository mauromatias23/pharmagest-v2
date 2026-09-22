import { Invoice, Product, Batch, InvoiceStatus } from '../types';
import { db, DailyClosure } from './db';

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
      filtered = filtered.filter(i => (i.date || '').slice(0, 10) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(i => (i.date || '').slice(0, 10) <= endDate);
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
        cancelledAmount += Number(inv.totalNet) || 0;
        continue;
      }

      totalInvoicesIssued++;
      totalRevenueGross += Number(inv.totalGross) || 0;
      totalRevenueNet += Number(inv.totalNet) || 0;
      totalVAT += Number(inv.totalVAT) || 0;

      for (const item of (inv.items || [])) {
        const prod = item.productId ? productMap.get(item.productId) : null;
        const unitCost = Number(prod?.costPrice) || 0;
        totalCostOfGoodsSold += unitCost * (Number(item.quantity) || 1);
      }
    }

    const grossProfit = totalRevenueNet - totalCostOfGoodsSold;
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
      const d = (i.date || '').slice(0, 10);
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
        stat.revenue += Number(item.subtotal) || 0;
        salesStats.set(pId, stat);
      }
    }

    const results: ProductMovementAnalysis[] = products.map(prod => {
      const stat = salesStats.get(prod.id) || { unitsSold: 0, invoicesCount: 0, revenue: 0 };
      const unitCost = Number(prod.costPrice) || 0;
      const costIncurred = unitCost * stat.unitsSold;
      const profitGenerated = stat.revenue - costIncurred;
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
        revenueGenerated: stat.revenue,
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
    const dayInvoices = invoices.filter(i => (i.date || '').slice(0, 10) === date);
    const shiftsFound = Array.from(new Set(dayInvoices.map(i => i.shiftNumber || 1))).sort((a, b) => a - b);

    return shiftsFound.map(shiftNum => {
      const sInvs = dayInvoices.filter(i => (i.shiftNumber || 1) === shiftNum);
      const issued = sInvs.filter(i => i.status !== InvoiceStatus.CANCELLED);
      const cancelled = sInvs.filter(i => i.status === InvoiceStatus.CANCELLED);

      const cash = issued
        .filter(i => i.paymentMethod === 'Numerário' || i.paymentMethod === 'Dinheiro')
        .reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
      const tpa = issued
        .filter(i => i.paymentMethod === 'Multicaixa' || i.paymentMethod === 'TPA' || i.paymentMethod === 'Cartão')
        .reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
      const transfer = issued
        .filter(i => i.paymentMethod === 'Transferência')
        .reduce((s, i) => s + (Number(i.totalNet) || 0), 0);
      const mixed = issued
        .filter(i => i.paymentMethod === 'Misto')
        .reduce((s, i) => s + (Number(i.totalNet) || 0), 0);

      const grandTotal = cash + tpa + transfer + mixed;
      const shiftName = sInvs[0]?.shiftName || `${shiftNum}º Turno`;
      const operator = sInvs[sInvs.length - 1]?.userName || 'Operador';

      return {
        shiftNumber: shiftNum,
        shiftName,
        operator,
        issuedCount: issued.length,
        cancelledCount: cancelled.length,
        cashTotal: cash,
        tpaTotal: tpa,
        transferTotal: transfer,
        mixedTotal: mixed,
        grandTotal
      };
    });
  }
};
