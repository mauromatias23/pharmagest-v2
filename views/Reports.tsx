import React, { useState, useMemo } from 'react';
import { Invoice, Product, Batch, InvoiceStatus, InvoiceItem, User, UserRole } from '../types';
import { COMPANY_INFO } from '../constants';
import { 
  Search, 
  FileText, 
  Download, 
  Calendar, 
  Ban, 
  Printer as PrinterIcon, 
  X, 
  Eye, 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  TrendingDown, 
  Layers, 
  Activity, 
  CheckCircle,
  FileSpreadsheet,
  Trash2
} from 'lucide-react';

interface ReportsProps {
  user: User;
  invoices: Invoice[];
  products: Product[];
  batches: Batch[];
  onCancelInvoice: (invoiceId: string) => Promise<void>;
  onCancelInvoiceItem: (invoiceId: string, itemIndex: number) => Promise<void>;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
  onDeleteInvoicesBatch?: (invoiceIds: string[]) => Promise<void>;
  onDeleteProduct?: (productId: string) => Promise<void>;
}

type ReportType = 
  | 'HISTORY' 
  | 'VAT_MAP' 
  | 'SALES_DAILY' 
  | 'SALES_MONTHLY' 
  | 'SALES_YEARLY' 
  | 'STOCK' 
  | 'STOCK_ALL'
  | 'STOCK_ALTERED'
  | 'PRODUCTS' 
  | 'INVOICE_REPRINT' 
  | 'DAILY_DETAIL'
  | 'MONTHLY_DETAIL'
  | 'YEARLY_DETAIL'
  | 'MOST_LEAST'
  | null;

type ViewMode = 'INVOICES' | 'ITEMS' | 'SALES_REPORT' | 'STOCK_REPORT' | 'PRODUCTS_REPORT' | 'MOST_LEAST_REPORT';
type SalesSubTab = 'DAILY' | 'MONTHLY' | 'YEARLY';
type ProductPeriod = 'SEMANA' | 'MES' | 'TRIMESTRE' | 'SEMESTRE' | 'ANO';

const Reports: React.FC<ReportsProps> = ({ 
  user,
  invoices, 
  products, 
  batches,
  onCancelInvoice,
  onCancelInvoiceItem,
  onDeleteInvoice,
  onDeleteInvoicesBatch,
  onDeleteProduct
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeReport, setActiveReport] = useState<ReportType>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('INVOICES');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Multi-selection for batch invoice operations
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  // Date-range bulk elimination modal state
  const [isRangeDeleteModalOpen, setIsRangeDeleteModalOpen] = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState('2026-07-19');
  const [rangeEndDate, setRangeEndDate] = useState('2026-08-23');
  const [isProcessingRangeDelete, setIsProcessingRangeDelete] = useState(false);
  
  // Sub-navigation states
  const [salesSubTab, setSalesSubTab] = useState<SalesSubTab>('DAILY');
  const [productPeriod, setProductPeriod] = useState<ProductPeriod>('MES');
  const [stockSubTab, setStockSubTab] = useState<'ALL' | 'ALTERED'>('ALL');
  const [selectedIndividualProduct, setSelectedIndividualProduct] = useState<Product | null>(null);
  const [selectedDailySalesDetail, setSelectedDailySalesDetail] = useState<{ date: string; invoices: Invoice[] } | null>(null);
  const [selectedMonthlySalesDetail, setSelectedMonthlySalesDetail] = useState<{ month: string; invoices: Invoice[] } | null>(null);
  const [selectedYearlySalesDetail, setSelectedYearlySalesDetail] = useState<{ year: string; invoices: Invoice[] } | null>(null);

  // Custom cancellation modal states to avoid window.confirm
  const [invoiceToCancel, setInvoiceToCancel] = useState<Invoice | null>(null);
  const [itemToCancel, setItemToCancel] = useState<{ 
    invoiceId: string; 
    invoiceNumber: string; 
    itemIndex: number; 
    productName: string; 
    quantity: number; 
  } | null>(null);

  // STATE FOR YEAR FILTERING (ANGOLA TIME ZONE CURRENT YEAR DEFAULT)
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat('pt-AO', {
        timeZone: 'Africa/Luanda',
        year: 'numeric'
      });
      return parseInt(formatter.format(now), 10);
    } catch (e) {
      return now.getFullYear();
    }
  });

  // State options for product periods
  const [selectedWeekMonth, setSelectedWeekMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number>(1);
  const [selectedProductMonth, setSelectedProductMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedSemester, setSelectedSemester] = useState<number>(() => new Date().getMonth() < 6 ? 1 : 2);

  // Available continuous years list
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(2026); // Default active fiscal year
    invoices.forEach(inv => {
      const y = new Date(inv.date).getFullYear();
      if (!isNaN(y)) {
        yearsSet.add(y);
      }
    });
    const currentYear = new Date().getFullYear();
    yearsSet.add(currentYear);
    yearsSet.add(currentYear - 1);
    yearsSet.add(currentYear + 1);
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [invoices]);

  // BASE INVOICES FILTERED BY ACTIVE SELECTED YEAR (Continuous data storage support)
  const yearFilteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const invYear = new Date(inv.date).getFullYear();
      return invYear === selectedYear;
    });
  }, [invoices, selectedYear]);

  // WEEK PERIOD SELECTOR RANGE
  const weekRange = useMemo(() => {
    const yearStr = selectedYear.toString();
    const monthStr = selectedWeekMonth.toString().padStart(2, '0');
    const startDay = (selectedWeekNumber - 1) * 7 + 1;
    let endDay = selectedWeekNumber * 7;
    const lastDay = new Date(selectedYear, selectedWeekMonth, 0).getDate();
    if (selectedWeekNumber === 5 || endDay > lastDay) {
      endDay = lastDay;
    }
    const startDayStr = startDay.toString().padStart(2, '0');
    const endDayStr = endDay.toString().padStart(2, '0');
    return {
      startDate: `${yearStr}-${monthStr}-${startDayStr}T00:00:00`,
      endDate: `${yearStr}-${monthStr}-${endDayStr}T23:59:59`,
      label: `Semana ${selectedWeekNumber} (${startDayStr}/${monthStr} a ${endDayStr}/${monthStr})`
    };
  }, [selectedYear, selectedWeekMonth, selectedWeekNumber]);

  // MONTH PERIOD SELECTOR RANGE
  const monthRange = useMemo(() => {
    const yearStr = selectedYear.toString();
    const monthStr = selectedProductMonth.toString().padStart(2, '0');
    const lastDay = new Date(selectedYear, selectedProductMonth, 0).getDate();
    return {
      startDate: `${yearStr}-${monthStr}-01T00:00:00`,
      endDate: `${yearStr}-${monthStr}-${lastDay.toString().padStart(2, '0')}T23:59:59`,
      label: `Mês de ${new Date(selectedYear, selectedProductMonth - 1, 2).toLocaleDateString('pt-AO', { month: 'long' })}`
    };
  }, [selectedYear, selectedProductMonth]);

  // QUARTER PERIOD SELECTOR RANGE
  const quarterRange = useMemo(() => {
    const yearStr = selectedYear.toString();
    if (selectedQuarter === 1) {
      return { startDate: `${yearStr}-01-01T00:00:00`, endDate: `${yearStr}-03-31T23:59:59`, label: '1º Trimestre (Jan - Mar)' };
    } else if (selectedQuarter === 2) {
      return { startDate: `${yearStr}-04-01T00:00:00`, endDate: `${yearStr}-06-30T23:59:59`, label: '2º Trimestre (Abr - Jun)' };
    } else if (selectedQuarter === 3) {
      return { startDate: `${yearStr}-07-01T00:00:00`, endDate: `${yearStr}-09-30T23:59:59`, label: '3º Trimestre (Jul - Set)' };
    } else {
      return { startDate: `${yearStr}-10-01T00:00:00`, endDate: `${yearStr}-12-31T23:59:59`, label: '4º Trimestre (Out - Dez)' };
    }
  }, [selectedYear, selectedQuarter]);

  // SEMESTER PERIOD SELECTOR RANGE
  const semesterRange = useMemo(() => {
    const yearStr = selectedYear.toString();
    if (selectedSemester === 1) {
      return { startDate: `${yearStr}-01-01T00:00:00`, endDate: `${yearStr}-06-30T23:59:59`, label: '1º Semestre (Jan - Jun)' };
    } else {
      return { startDate: `${yearStr}-07-01T00:00:00`, endDate: `${yearStr}-12-31T23:59:59`, label: '2º Semestre (Jul - Dez)' };
    }
  }, [selectedYear, selectedSemester]);

  // YEAR PERIOD SELECTOR RANGE
  const yearRange = useMemo(() => {
    const yearStr = selectedYear.toString();
    return {
      startDate: `${yearStr}-01-01T00:00:00`,
      endDate: `${yearStr}-12-31T23:59:59`,
      label: `Ano Civil de ${selectedYear}`
    };
  }, [selectedYear]);

  // Dynamic Range for product sales report
  const activeProductRange = useMemo(() => {
    if (productPeriod === 'SEMANA') return weekRange;
    if (productPeriod === 'MES') return monthRange;
    if (productPeriod === 'TRIMESTRE') return quarterRange;
    if (productPeriod === 'SEMESTRE') return semesterRange;
    return yearRange;
  }, [productPeriod, weekRange, monthRange, quarterRange, semesterRange, yearRange]);

  // Search filter for general invoices/items
  const filteredInvoices = useMemo(() => {
    return yearFilteredInvoices.filter(inv => 
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.customerName && inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [yearFilteredInvoices, searchTerm]);

  // Flattened sold items with invoice info
  const allSoldItems = useMemo(() => {
    const items: (InvoiceItem & { 
      invoiceId: string; 
      invoiceNumber: string; 
      date: string; 
      paymentMethod: string; 
      customerName?: string; 
      invoiceStatus: InvoiceStatus;
      index: number;
    })[] = [];
    
    filteredInvoices.forEach(inv => {
      inv.items.forEach((item, idx) => {
        items.push({
          ...item,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          date: inv.date,
          paymentMethod: inv.paymentMethod,
          customerName: inv.customerName,
          invoiceStatus: inv.status,
          index: idx
        });
      });
    });
    return items;
  }, [filteredInvoices]);

  // SALES REPORT GROUPING
  // 1. Daily Sales
  const dailySales = useMemo(() => {
    const groups: { [key: string]: { date: string; count: number; gross: number; vat: number; net: number; invoices: Invoice[] } } = {};
    yearFilteredInvoices.forEach(inv => {
      const day = inv.date.split('T')[0];
      if (!groups[day]) {
        groups[day] = { date: day, count: 0, gross: 0, vat: 0, net: 0, invoices: [] };
      }
      groups[day].invoices.push(inv);
      if (inv.status === InvoiceStatus.ISSUED) {
        groups[day].count++;
        groups[day].gross += inv.totalGross;
        groups[day].vat += inv.totalVAT;
        groups[day].net += inv.totalNet;
      }
    });
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [yearFilteredInvoices]);

  // 2. Monthly Sales
  const monthlySales = useMemo(() => {
    const groups: { [key: string]: { month: string; count: number; gross: number; vat: number; net: number; invoices: Invoice[] } } = {};
    yearFilteredInvoices.forEach(inv => {
      const month = inv.date.substring(0, 7); // YYYY-MM
      if (!groups[month]) {
        groups[month] = { month, count: 0, gross: 0, vat: 0, net: 0, invoices: [] };
      }
      groups[month].invoices.push(inv);
      if (inv.status === InvoiceStatus.ISSUED) {
        groups[month].count++;
        groups[month].gross += inv.totalGross;
        groups[month].vat += inv.totalVAT;
        groups[month].net += inv.totalNet;
      }
    });
    return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
  }, [yearFilteredInvoices]);

  // 3. Yearly Sales
  const yearlySales = useMemo(() => {
    const groups: { [key: string]: { year: string; count: number; gross: number; vat: number; net: number; invoices: Invoice[] } } = {};
    yearFilteredInvoices.forEach(inv => {
      const year = inv.date.substring(0, 4); // YYYY
      if (!groups[year]) {
        groups[year] = { year, count: 0, gross: 0, vat: 0, net: 0, invoices: [] };
      }
      groups[year].invoices.push(inv);
      if (inv.status === InvoiceStatus.ISSUED) {
        groups[year].count++;
        groups[year].gross += inv.totalGross;
        groups[year].vat += inv.totalVAT;
        groups[year].net += inv.totalNet;
      }
    });
    return Object.values(groups).sort((a, b) => b.year.localeCompare(a.year));
  }, [yearFilteredInvoices]);

  // INVOICES IN SELECTED DATE RANGE FOR PERMANENT BULK DELETION
  const rangeMatchingInvoices = useMemo(() => {
    if (!rangeStartDate || !rangeEndDate) return [];
    const start = rangeStartDate + 'T00:00:00';
    const end = rangeEndDate + 'T23:59:59';
    return invoices.filter(inv => {
      const d = inv.date;
      return d >= start && d <= end;
    });
  }, [invoices, rangeStartDate, rangeEndDate]);

  // STOCK REPORT CALCULATIONS
  // Total quantity sold per product (across active invoices)
  const totalSold = useMemo(() => {
    const counts: { [productId: string]: number } = {};
    yearFilteredInvoices.forEach(inv => {
      if (inv.status === InvoiceStatus.ISSUED) {
        inv.items.forEach(item => {
          counts[item.productId] = (counts[item.productId] || 0) + item.quantity;
        });
      }
    });
    return counts;
  }, [yearFilteredInvoices]);

  // Quantity sold per batch (for individual report calculations)
  const soldByBatch = useMemo(() => {
    const map: { [batchId: string]: number } = {};
    yearFilteredInvoices.forEach(inv => {
      if (inv.status === InvoiceStatus.ISSUED) {
        inv.items.forEach(item => {
          map[item.batchId] = (map[item.batchId] || 0) + item.quantity;
        });
      }
    });
    return map;
  }, [yearFilteredInvoices]);

  const batchesByProduct = useMemo(() => {
    const map: { [productId: string]: Batch[] } = {};
    batches.forEach(b => {
      if (!map[b.productId]) {
        map[b.productId] = [];
      }
      map[b.productId].push(b);
    });
    return map;
  }, [batches]);

  // Combined stock reports data: contains totalEntryStock, activeStock, and soldQty
  const stockReportsCombined = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return products.map(prod => {
      const pBatches = batchesByProduct[prod.id] || [];
      const validBatches = pBatches.filter(b => b.expiryDate >= todayStr);
      const soldQty = totalSold[prod.id] || 0;
      const batchStockSum = validBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      const activeStock = pBatches.length > 0 ? batchStockSum : (Number(prod.totalQuantity) || 0);
      const totalEntryStock = activeStock + soldQty;

      return {
        product: prod,
        soldQty,
        activeStock,
        totalEntryStock,
        batches: pBatches.sort((a, b) => b.entryDate.localeCompare(a.entryDate))
      };
    });
  }, [products, batchesByProduct, totalSold]);

  // Filter lists based on search term
  const filteredStockReportsCombined = useMemo(() => {
    return stockReportsCombined.filter(item => 
      item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [stockReportsCombined, searchTerm]);

  // List 1: All registered products
  const allStockProductsList = filteredStockReportsCombined;

  // List 2: Only products whose stocks have been modified by sales (i.e. soldQty > 0)
  const alteredStockProductsList = useMemo(() => {
    return filteredStockReportsCombined.filter(item => item.soldQty > 0);
  }, [filteredStockReportsCombined]);

  // Maintain stockReportData for compatibility
  const stockReportData = useMemo(() => {
    return allStockProductsList;
  }, [allStockProductsList]);


  // PRODUCTS SALES REPORT CALCULATIONS
  const productsSalesReport = useMemo(() => {
    const salesCounts: { [productId: string]: number } = {};
    
    // Init all products with 0
    products.forEach(p => {
      salesCounts[p.id] = 0;
    });

    yearFilteredInvoices.forEach(inv => {
      if (inv.status === InvoiceStatus.ISSUED) {
        if (inv.date >= activeProductRange.startDate && inv.date <= activeProductRange.endDate) {
          inv.items.forEach(item => {
            if (salesCounts[item.productId] !== undefined) {
              salesCounts[item.productId] += item.quantity;
            } else {
              salesCounts[item.productId] = item.quantity;
            }
          });
        }
      }
    });

    const list = products.map(p => ({
      product: p,
      soldQuantity: salesCounts[p.id] || 0
    }));

    // Most sold (Mais Saídas)
    const mostSold = [...list]
      .filter(item => item.soldQuantity > 0)
      .sort((a, b) => b.soldQuantity - a.soldQuantity);
      
    // Least sold (Menos Saídas - including 0 sales)
    const leastSold = [...list]
      .sort((a, b) => a.soldQuantity - b.soldQuantity);

    return { mostSold, leastSold };
  }, [products, yearFilteredInvoices, activeProductRange]);


  // NEW: MOST TO LEAST PRODUCTS LIST FOR "RELATÓRIO MAIS E MENOS"
  const mostToLeastProductsList = useMemo(() => {
    const salesCounts: { [productId: string]: number } = {};
    
    // Init all products with 0
    products.forEach(p => {
      salesCounts[p.id] = 0;
    });

    yearFilteredInvoices.forEach(inv => {
      if (inv.status === InvoiceStatus.ISSUED) {
        inv.items.forEach(item => {
          if (salesCounts[item.productId] !== undefined) {
            salesCounts[item.productId] += item.quantity;
          }
        });
      }
    });

    return products.map(p => ({
      product: p,
      soldQuantity: salesCounts[p.id] || 0
    })).sort((a, b) => b.soldQuantity - a.soldQuantity);
  }, [products, yearFilteredInvoices]);


  // SALES DETAIL MEMOIZED CALCULATIONS FOR POPUPS/REPORTS
  const dailyItems = useMemo(() => {
    if (!selectedDailySalesDetail) return [];
    const items: {
      productName: string;
      productCode: string;
      quantity: number;
      unitPrice: number;
      paymentMethod: string;
      totalLine: number;
      hour: string;
    }[] = [];
    
    selectedDailySalesDetail.invoices.forEach(inv => {
      if (inv.status !== InvoiceStatus.ISSUED) return;
      const hour = new Date(inv.date).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' });
      inv.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        items.push({
          productName: item.productName,
          productCode: prod ? prod.code : '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          paymentMethod: inv.paymentMethod,
          totalLine: item.subtotal + item.vatAmount,
          hour
        });
      });
    });
    return items;
  }, [selectedDailySalesDetail, products]);

  const dailyPaymentTotals = useMemo(() => {
    if (!selectedDailySalesDetail) return {};
    const totals: { [method: string]: number } = {};
    selectedDailySalesDetail.invoices.forEach(inv => {
      if (inv.status !== InvoiceStatus.ISSUED) return;
      totals[inv.paymentMethod] = (totals[inv.paymentMethod] || 0) + inv.totalNet;
    });
    return totals;
  }, [selectedDailySalesDetail]);

  const dailyTotalNet = useMemo(() => {
    if (!selectedDailySalesDetail) return 0;
    return selectedDailySalesDetail.invoices
      .filter(inv => inv.status === InvoiceStatus.ISSUED)
      .reduce((sum, inv) => sum + inv.totalNet, 0);
  }, [selectedDailySalesDetail]);

  const monthlyDaysList = useMemo(() => {
    if (!selectedMonthlySalesDetail) return [];
    const groups: {
      [day: string]: {
        date: string;
        invoiceCount: number;
        productCount: number;
        totalNet: number;
        paymentTotals: { [method: string]: number };
      }
    } = {};
    
    selectedMonthlySalesDetail.invoices.forEach(inv => {
      if (inv.status !== InvoiceStatus.ISSUED) return;
      const day = inv.date.split('T')[0];
      if (!groups[day]) {
        groups[day] = {
          date: day,
          invoiceCount: 0,
          productCount: 0,
          totalNet: 0,
          paymentTotals: {}
        };
      }
      groups[day].invoiceCount++;
      groups[day].totalNet += inv.totalNet;
      groups[day].paymentTotals[inv.paymentMethod] = (groups[day].paymentTotals[inv.paymentMethod] || 0) + inv.totalNet;
      
      inv.items.forEach(item => {
        groups[day].productCount += item.quantity;
      });
    });
    
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedMonthlySalesDetail]);

  const monthlyTotalNet = useMemo(() => {
    if (!selectedMonthlySalesDetail) return 0;
    return selectedMonthlySalesDetail.invoices
      .filter(inv => inv.status === InvoiceStatus.ISSUED)
      .reduce((sum, inv) => sum + inv.totalNet, 0);
  }, [selectedMonthlySalesDetail]);

  const yearlyMonthsList = useMemo(() => {
    if (!selectedYearlySalesDetail) return [];
    const groups: {
      [month: string]: {
        month: string;
        invoiceCount: number;
        productCount: number;
        totalNet: number;
        paymentTotals: { [method: string]: number };
      }
    } = {};
    
    selectedYearlySalesDetail.invoices.forEach(inv => {
      if (inv.status !== InvoiceStatus.ISSUED) return;
      const month = inv.date.substring(0, 7); // YYYY-MM
      if (!groups[month]) {
        groups[month] = {
          month,
          invoiceCount: 0,
          productCount: 0,
          totalNet: 0,
          paymentTotals: {}
        };
      }
      groups[month].invoiceCount++;
      groups[month].totalNet += inv.totalNet;
      groups[month].paymentTotals[inv.paymentMethod] = (groups[month].paymentTotals[inv.paymentMethod] || 0) + inv.totalNet;
      
      inv.items.forEach(item => {
        groups[month].productCount += item.quantity;
      });
    });
    
    return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
  }, [selectedYearlySalesDetail]);

  const yearlyTotalNet = useMemo(() => {
    if (!selectedYearlySalesDetail) return 0;
    return selectedYearlySalesDetail.invoices
      .filter(inv => inv.status === InvoiceStatus.ISSUED)
      .reduce((sum, inv) => sum + inv.totalNet, 0);
  }, [selectedYearlySalesDetail]);


  // Print Handler
  const handlePrintReport = (type: ReportType) => {
    setActiveReport(type);
    const onAfterPrint = () => {
      window.removeEventListener('afterprint', onAfterPrint);
      setActiveReport(null);
    };
    window.addEventListener('afterprint', onAfterPrint);
    setTimeout(() => {
      window.print();
    }, 350);
  };

  // Reprint Single Invoice
  const handleReprintSingleInvoice = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setTimeout(() => {
      handlePrintReport('INVOICE_REPRINT');
    }, 100);
  };

  const executeCancelInvoice = async () => {
    if (user.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para anular faturas.");
      setInvoiceToCancel(null);
      return;
    }
    if (!invoiceToCancel) return;
    await onCancelInvoice(invoiceToCancel.id);
    setInvoiceToCancel(null);
    if (selectedInvoice && selectedInvoice.id === invoiceToCancel.id) {
      setSelectedInvoice(null);
    }
  };

  const executeCancelItem = async () => {
    if (user.role !== UserRole.ADMIN) {
      alert("Apenas o Administrador tem permissão para anular itens de faturas.");
      setItemToCancel(null);
      return;
    }
    if (!itemToCancel) return;
    await onCancelInvoiceItem(itemToCancel.invoiceId, itemToCancel.itemIndex);
    setItemToCancel(null);
  };

  // General statistics
  const totalIVA = filteredInvoices.filter(inv => inv.status === InvoiceStatus.ISSUED).reduce((sum, inv) => sum + inv.totalVAT, 0);
  const totalGeral = filteredInvoices.filter(inv => inv.status === InvoiceStatus.ISSUED).reduce((sum, inv) => sum + inv.totalNet, 0);

  return (
    <div className="space-y-6">
      {/* Styles for standard A4 formatting during print */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print, aside, header, nav {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          @page {
            size: A4 portrait;
            margin: 1.2cm 1cm 1.2cm 1cm;
          }
          html, body, #root, #root > div, main {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            position: static !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* CABEÇALHO - no-print */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center no-print border-b pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Centro de Relatórios</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">Gestão de faturamento, stock, entradas de lote e popularidade de produtos.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <button 
            onClick={() => handlePrintReport('HISTORY')}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-slate-700 text-xs font-bold uppercase tracking-wider shadow-xs"
          >
            <Download className="w-4 h-4 text-slate-500" /> Historial faturas A4
          </button>
          <button 
            onClick={() => handlePrintReport('VAT_MAP')}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/20"
          >
            <FileSpreadsheet className="w-4 h-4" /> Mapa de IVA A4
          </button>
        </div>
      </div>

      {/* SIDEBAR NAVIGATION + CONTENT GRID - no-print */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-3 mb-2">Seções de Relatório</h3>
          
          <button 
            onClick={() => { setViewMode('INVOICES'); setSearchTerm(''); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${
              viewMode === 'INVOICES' 
                ? 'bg-slate-900 text-white font-black shadow-md' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Lista de Faturas
          </button>

          <button 
            onClick={() => { setViewMode('ITEMS'); setSearchTerm(''); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${
              viewMode === 'ITEMS' 
                ? 'bg-slate-900 text-white font-black shadow-md' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-4 h-4" />
            Vendas por Item
          </button>

          <button 
            onClick={() => { setViewMode('SALES_REPORT'); setSearchTerm(''); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${
              viewMode === 'SALES_REPORT' 
                ? 'bg-slate-900 text-white font-black shadow-md' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Relatório de Venda
          </button>

          <button 
            onClick={() => { setViewMode('STOCK_REPORT'); setSearchTerm(''); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${
              viewMode === 'STOCK_REPORT' 
                ? 'bg-slate-900 text-white font-black shadow-md' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Package className="w-4 h-4" />
            Relatório de Stock
          </button>

          <button 
            onClick={() => { setViewMode('PRODUCTS_REPORT'); setSearchTerm(''); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${
              viewMode === 'PRODUCTS_REPORT' 
                ? 'bg-slate-900 text-white font-black shadow-md' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-4 h-4" />
            Relatório de Produtos
          </button>

          <button 
            onClick={() => { setViewMode('MOST_LEAST_REPORT'); setSearchTerm(''); }}
            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${
              viewMode === 'MOST_LEAST_REPORT' 
                ? 'bg-slate-900 text-white font-black shadow-md' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Relatório Mais e Menos
          </button>
        </div>

        {/* Dynamic Details Content Panel */}
        <div className="lg:col-span-3 space-y-6">
          {/* GENERALIZED YEAR SELECTOR (Visible above functions of each individual section) */}
          <div className="bg-slate-950 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="px-2.5 py-0.5 bg-slate-800 text-[9px] font-black uppercase text-emerald-400 rounded font-mono">
                Exercício Fiscal Ativo
              </span>
              <h4 className="font-black text-sm uppercase tracking-tight mt-1.5">
                Ano de Análise: <span className="text-emerald-400 font-extrabold">{selectedYear}</span>
              </h4>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                Todos os dados e relatórios serão filtrados de acordo com o ano civil em vigor em Angola.
              </p>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-full sm:w-auto">
              <span className="text-[9px] font-black text-slate-400 uppercase px-2">Trocar Ano:</span>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-black text-white focus:outline-none focus:border-emerald-500 w-full sm:w-32 cursor-pointer"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
          </div>
          {/* BARRA DE PESQUISA INTELIGENTE (Visible on compatible modes) */}
          {(viewMode === 'INVOICES' || viewMode === 'ITEMS' || viewMode === 'STOCK_REPORT') && (
            <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3 shadow-xs">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder={
                    viewMode === 'INVOICES' ? "Filtrar por nº fatura ou nome do cliente..." :
                    viewMode === 'ITEMS' ? "Filtrar vendas por nome do produto..." :
                    "Filtrar por nome ou código do produto..."
                  }
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* TAB 1: LISTA DE FATURAS */}
          {viewMode === 'INVOICES' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <h4 className="font-bold text-sm text-slate-800">Historial Completo de Faturas</h4>
                  <span className="text-xs bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-full">{filteredInvoices.length} Faturas</span>
                </div>

                {user.role === UserRole.ADMIN && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {selectedInvoiceIds.size > 0 && onDeleteInvoicesBatch && (
                      <button
                        onClick={async () => {
                          if (confirm(`Tem a certeza que deseja ELIMINAR PERMANENTEMENTE as ${selectedInvoiceIds.size} faturas selecionadas? Esta ação é definitiva no Supabase e em todos os navegadores.`)) {
                            const ids = Array.from(selectedInvoiceIds);
                            await onDeleteInvoicesBatch(ids);
                            setSelectedInvoiceIds(new Set());
                          }
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar Selecionadas ({selectedInvoiceIds.size})
                      </button>
                    )}

                    {onDeleteInvoicesBatch && (
                      <button
                        onClick={() => setIsRangeDeleteModalOpen(true)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        Limpar por Intervalo de Datas
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50/80 border-b tracking-wider">
                    <tr>
                      {user.role === UserRole.ADMIN && (
                        <th className="px-4 py-3.5 w-10 text-center">
                          <input 
                            type="checkbox"
                            checked={filteredInvoices.length > 0 && selectedInvoiceIds.size === filteredInvoices.length}
                            onChange={() => {
                              if (selectedInvoiceIds.size === filteredInvoices.length && filteredInvoices.length > 0) {
                                setSelectedInvoiceIds(new Set());
                              } else {
                                setSelectedInvoiceIds(new Set(filteredInvoices.map(i => i.id)));
                              }
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="px-5 py-3.5">Data / Hora</th>
                      <th className="px-5 py-3.5">Fatura Nº</th>
                      <th className="px-5 py-3.5">Cliente</th>
                      <th className="px-5 py-3.5 text-right">Valor Total</th>
                      <th className="px-5 py-3.5">Pagamento / Turno</th>
                      <th className="px-5 py-3.5">Estado</th>
                      <th className="px-5 py-3.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={user.role === UserRole.ADMIN ? 8 : 7} className="px-6 py-16 text-center text-slate-400 font-medium text-xs">Nenhuma fatura encontrada.</td>
                      </tr>
                    ) : (
                      filteredInvoices.map(inv => (
                        <tr key={inv.id} className={`hover:bg-slate-50/60 transition-colors ${selectedInvoiceIds.has(inv.id) ? 'bg-emerald-50/40' : ''}`}>
                          {user.role === UserRole.ADMIN && (
                            <td className="px-4 py-3.5 text-center">
                              <input 
                                type="checkbox"
                                checked={selectedInvoiceIds.has(inv.id)}
                                onChange={() => {
                                  const next = new Set(selectedInvoiceIds);
                                  if (next.has(inv.id)) next.delete(inv.id);
                                  else next.add(inv.id);
                                  setSelectedInvoiceIds(next);
                                }}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-5 py-3.5">
                            <p className="font-bold text-slate-700">{new Date(inv.date).toLocaleDateString('pt-AO')}</p>
                            <p className="text-[10px] text-slate-400">{new Date(inv.date).toLocaleTimeString('pt-AO').substring(0, 5)}</p>
                          </td>
                          <td className="px-5 py-3.5 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                          <td className="px-5 py-3.5 font-semibold text-slate-700">{inv.customerName || 'Consumidor Final'}</td>
                          <td className="px-5 py-3.5 text-right font-black text-slate-900">{inv.totalNet.toLocaleString()} Kz</td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border uppercase w-fit">{inv.paymentMethod}</span>
                              {inv.shiftName && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase w-fit">{inv.shiftName}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                              inv.status === InvoiceStatus.ISSUED 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-red-50 text-red-700 border-red-100'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button 
                                onClick={() => setSelectedInvoice(inv)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                                title="Visualizar Detalhes"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleReprintSingleInvoice(inv)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Reimprimir Fatura"
                              >
                                <PrinterIcon className="w-4 h-4" />
                              </button>
                              {inv.status === InvoiceStatus.ISSUED && user.role === UserRole.ADMIN && (
                                <button 
                                  onClick={() => setInvoiceToCancel(inv)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  title="Anular Fatura"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                              {user.role === UserRole.ADMIN && onDeleteInvoice && (
                                <button 
                                  onClick={() => {
                                    if (confirm(`Deseja ELIMINAR permanentemente a fatura nº ${inv.invoiceNumber}? Esta acção irá remover o registo do sistema e do Supabase.`)) {
                                      onDeleteInvoice(inv.id);
                                    }
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-100 rounded-lg transition-all cursor-pointer"
                                  title="Eliminar Fatura Permanentemente"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: VENDAS POR ITEM */}
          {viewMode === 'ITEMS' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50/50">
                <h4 className="font-bold text-sm text-slate-800">Vendas Detalhadas de Artigos</h4>
                <span className="text-xs bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-full">{allSoldItems.length} Artigos vendidos</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50/80 border-b tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Data</th>
                      <th className="px-5 py-3.5">Medicamento / Lote</th>
                      <th className="px-5 py-3.5">Fatura</th>
                      <th className="px-5 py-3.5 text-center">Qtd</th>
                      <th className="px-5 py-3.5 text-right">P. Unitário</th>
                      <th className="px-5 py-3.5 text-right">IVA (14%)</th>
                      <th className="px-5 py-3.5 text-right">Subtotal</th>
                      <th className="px-5 py-3.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allSoldItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-16 text-center text-slate-400 font-medium text-xs">Nenhum item vendido encontrado.</td>
                      </tr>
                    ) : (
                      allSoldItems.map((item, idx) => (
                        <tr key={`${item.invoiceNumber}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-3.5 text-xs text-slate-500">
                            {new Date(item.date).toLocaleDateString('pt-AO')}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-bold text-slate-800">{item.productName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">Lote: {item.lotNumber}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-xs text-slate-500">{item.invoiceNumber}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center font-black text-slate-900">{item.quantity}</td>
                          <td className="px-5 py-3.5 text-right text-slate-500">{item.unitPrice.toLocaleString()} Kz</td>
                          <td className="px-5 py-3.5 text-right text-emerald-600 font-bold">{(item.vatAmount).toLocaleString()} Kz</td>
                          <td className="px-5 py-3.5 text-right font-black text-slate-900">{(item.subtotal + item.vatAmount).toLocaleString()} Kz</td>
                          <td className="px-5 py-3.5 text-center">
                            {item.invoiceStatus === InvoiceStatus.ISSUED ? (
                              user.role === UserRole.ADMIN ? (
                                <button 
                                  onClick={() => setItemToCancel({
                                    invoiceId: item.invoiceId,
                                    invoiceNumber: item.invoiceNumber,
                                    itemIndex: item.index,
                                    productName: item.productName,
                                    quantity: item.quantity
                                  })}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  title="Anular Item Vendido"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium">Emitida</span>
                              )
                            ) : (
                              <span className="text-[9px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-black uppercase">Fatura Anulada</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: RELATÓRIO DE VENDA (DAILY, MONTHLY, YEARLY) */}
          {viewMode === 'SALES_REPORT' && (
            <div className="space-y-6">
              {/* Sales report tab selector */}
              <div className="bg-white border border-slate-200 rounded-2xl p-2 flex gap-1 shadow-xs">
                <button 
                  onClick={() => setSalesSubTab('DAILY')}
                  className={`flex-1 py-2.5 text-center rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    salesSubTab === 'DAILY' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Vendas Diárias
                </button>
                <button 
                  onClick={() => setSalesSubTab('MONTHLY')}
                  className={`flex-1 py-2.5 text-center rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    salesSubTab === 'MONTHLY' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Vendas Mensais
                </button>
                <button 
                  onClick={() => setSalesSubTab('YEARLY')}
                  className={`flex-1 py-2.5 text-center rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    salesSubTab === 'YEARLY' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Vendas Anuais
                </button>
              </div>

              {/* Helpful tip about double-click */}
              <div className="px-6 py-3 bg-amber-50/70 border border-amber-100/50 flex items-center gap-2 text-amber-800 text-[11px] font-semibold rounded-2xl shadow-2xs">
                <span className="text-amber-500 font-bold text-sm">💡</span>
                <span>Dica: Dê duplo clique (dois cliques rápidos) em qualquer linha abaixo para abrir o seu relatório individual detalhado com opção de baixar/imprimir em A4.</span>
              </div>

              {/* Subtab Content: Daily Sales list */}
              {salesSubTab === 'DAILY' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                  <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Faturação por Dia</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Lista de receitas e faturas emitidas diariamente.</p>
                    </div>
                    <button 
                      onClick={() => handlePrintReport('SALES_DAILY')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" /> Imprimir A4
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50/80 border-b tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Data</th>
                          <th className="px-6 py-4 text-center">Faturas Ativas</th>
                          <th className="px-6 py-4 text-right">Base Incidência</th>
                          <th className="px-6 py-4 text-right">IVA Liquidado</th>
                          <th className="px-6 py-4 text-right font-black">Faturamento Líquido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dailySales.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Nenhum registo diário encontrado.</td>
                          </tr>
                        ) : (
                          dailySales.map(day => (
                            <tr 
                              key={day.date} 
                              onDoubleClick={() => setSelectedDailySalesDetail(day)}
                              className="hover:bg-slate-50/60 transition-colors cursor-pointer select-none"
                              title="Duplo clique para abrir o relatório detalhado deste dia"
                            >
                              <td className="px-6 py-4 font-bold text-slate-800">
                                {new Date(day.date + 'T00:00:00').toLocaleDateString('pt-AO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                              </td>
                              <td className="px-6 py-4 text-center font-bold text-slate-600">{day.count}</td>
                              <td className="px-6 py-4 text-right text-slate-500">{day.gross.toLocaleString()} Kz</td>
                              <td className="px-6 py-4 text-right text-emerald-600 font-bold">{day.vat.toLocaleString()} Kz</td>
                              <td className="px-6 py-4 text-right font-black text-slate-900">{day.net.toLocaleString()} Kz</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Subtab Content: Monthly Sales list */}
              {salesSubTab === 'MONTHLY' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                  <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Faturação por Mês</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Lista de receitas e impostos consolidados mensalmente.</p>
                    </div>
                    <button 
                      onClick={() => handlePrintReport('SALES_MONTHLY')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" /> Imprimir A4
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50/80 border-b tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Mês de Referência</th>
                          <th className="px-6 py-4 text-center">Faturas Ativas</th>
                          <th className="px-6 py-4 text-right">Base Incidência</th>
                          <th className="px-6 py-4 text-right">IVA Liquidado</th>
                          <th className="px-6 py-4 text-right font-black">Faturamento Líquido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monthlySales.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Nenhum registo mensal encontrado.</td>
                          </tr>
                        ) : (
                          monthlySales.map(m => (
                            <tr 
                              key={m.month} 
                              onDoubleClick={() => setSelectedMonthlySalesDetail(m)}
                              className="hover:bg-slate-50/60 transition-colors cursor-pointer select-none"
                              title="Duplo clique para abrir o relatório detalhado deste mês"
                            >
                              <td className="px-6 py-4 font-black text-slate-800 uppercase tracking-wide">
                                {new Date(m.month + '-02').toLocaleDateString('pt-AO', { year: 'numeric', month: 'long' })}
                              </td>
                              <td className="px-6 py-4 text-center font-bold text-slate-600">{m.count}</td>
                              <td className="px-6 py-4 text-right text-slate-500">{m.gross.toLocaleString()} Kz</td>
                              <td className="px-6 py-4 text-right text-emerald-600 font-bold">{m.vat.toLocaleString()} Kz</td>
                              <td className="px-6 py-4 text-right font-black text-slate-900">{m.net.toLocaleString()} Kz</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Subtab Content: Yearly Sales list */}
              {salesSubTab === 'YEARLY' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                  <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Faturação por Ano</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Relatório de desempenho e volumes de venda anuais.</p>
                    </div>
                    <button 
                      onClick={() => handlePrintReport('SALES_YEARLY')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" /> Imprimir A4
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50/80 border-b tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Ano Civil</th>
                          <th className="px-6 py-4 text-center">Faturas Ativas</th>
                          <th className="px-6 py-4 text-right">Base Incidência</th>
                          <th className="px-6 py-4 text-right">IVA Liquidado</th>
                          <th className="px-6 py-4 text-right font-black">Faturamento Líquido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {yearlySales.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Nenhum registo anual encontrado.</td>
                          </tr>
                        ) : (
                          yearlySales.map(y => (
                            <tr 
                              key={y.year} 
                              onDoubleClick={() => setSelectedYearlySalesDetail(y)}
                              className="hover:bg-slate-50/60 transition-colors cursor-pointer select-none"
                              title="Duplo clique para abrir o relatório detalhado deste ano"
                            >
                              <td className="px-6 py-4 font-black text-slate-900 text-lg">
                                {y.year}
                              </td>
                              <td className="px-6 py-4 text-center font-bold text-slate-600">{y.count}</td>
                              <td className="px-6 py-4 text-right text-slate-500">{y.gross.toLocaleString()} Kz</td>
                              <td className="px-6 py-4 text-right text-emerald-600 font-bold">{y.vat.toLocaleString()} Kz</td>
                              <td className="px-6 py-4 text-right font-black text-slate-900">{y.net.toLocaleString()} Kz</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RELATÓRIO DE STOCK (PRODUCT TOTALS + DAILY ENTRY RECORDS) */}
          {viewMode === 'STOCK_REPORT' && (
            <div className="space-y-6">
              {/* Sub-tabs selector for the two lists */}
              <div className="bg-white border border-slate-200 rounded-2xl p-2 flex gap-1 shadow-xs">
                <button 
                  onClick={() => setStockSubTab('ALL')}
                  className={`flex-1 py-2.5 text-center rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    stockSubTab === 'ALL' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Todos os Produtos Registados
                </button>
                <button 
                  onClick={() => setStockSubTab('ALTERED')}
                  className={`flex-1 py-2.5 text-center rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    stockSubTab === 'ALTERED' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Produtos Alterados por Vendas
                </button>
              </div>

              {/* Subtab Content: List Container */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">
                      {stockSubTab === 'ALL' ? 'Todos os Produtos Registados no Sistema' : 'Produtos com Stock Alterado no Processo das Vendas'}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                      {stockSubTab === 'ALL' 
                        ? 'Lista de todos os medicamentos cadastrados com respetivas entradas, stock ativo e quantidades vendidas.' 
                        : 'Lista exclusiva de medicamentos que registaram saídas no processo de faturamento.'}
                    </p>
                  </div>
                  
                  {/* Separate print buttons for each list to print separately */}
                  <button 
                    onClick={() => handlePrintReport(stockSubTab === 'ALL' ? 'STOCK_ALL' : 'STOCK_ALTERED')}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 self-stretch sm:self-auto justify-center"
                  >
                    <PrinterIcon className="w-4 h-4" /> Imprimir A4 PDF
                  </button>
                </div>

                {/* Helpful tip about double-click */}
                <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-100/50 flex items-center gap-2 text-amber-800 text-[11px] font-semibold">
                  <span className="text-amber-500 font-bold text-sm">💡</span>
                  <span>Dica: Dê duplo clique (dois cliques rápidos) em qualquer produto para visualizar o seu relatório individual com datas e quantidades de entrada.</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50/80 border-b tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Nome do Produto</th>
                        <th className="px-6 py-4 text-right">Total de Stocks de Entrada</th>
                        <th className="px-6 py-4 text-right">Stock Total Ativo</th>
                        <th className="px-6 py-4 text-right">Total de Quantidade Vendida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const activeList = stockSubTab === 'ALL' ? allStockProductsList : alteredStockProductsList;
                        if (activeList.length === 0) {
                          return (
                            <tr>
                              <td colSpan={4} className="px-6 py-16 text-center text-slate-400 font-medium text-xs">
                                Nenhum medicamento correspondente encontrado.
                              </td>
                            </tr>
                          );
                        }
                        return activeList.map(item => (
                          <tr 
                            key={item.product.id} 
                            onDoubleClick={() => setSelectedIndividualProduct(item.product)}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer select-none"
                            title="Duplo clique para abrir o relatório individual"
                          >
                            <td className="px-6 py-4">
                              <span className="px-1.5 py-0.5 bg-slate-100 border text-[8px] font-black uppercase text-slate-500 rounded font-mono">
                                {item.product.code}
                              </span>
                              <p className="font-extrabold text-slate-800 mt-1 text-sm">{item.product.name}</p>
                              <p className="text-[10px] text-slate-400 font-semibold">
                                Categoria: {item.product.category} | Substância: {item.product.activeIngredient || 'N/A'}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-slate-700 text-sm">
                              {item.totalEntryStock}
                            </td>
                            <td className="px-6 py-4 text-right text-sm">
                              <span className={`font-black ${
                                item.activeStock === 0 ? 'text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-100' :
                                item.activeStock <= item.product.minStock ? 'text-orange-500 bg-orange-50 px-2 py-1 rounded-md border border-orange-100' :
                                'text-slate-900 font-black'
                              }`}>
                                {item.activeStock}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-black text-slate-900 text-sm">
                              <span className={item.soldQty > 0 ? 'text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100' : 'text-slate-400'}>
                                {item.soldQty}
                              </span>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: RELATÓRIO DE PRODUTOS (MOST / LEAST SOLD BY TIME PERIODS) */}
          {viewMode === 'PRODUCTS_REPORT' && (
            <div className="space-y-6">
              {/* Product period selectors: Semana, mês, trimestre, semestre, ano */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">Desempenho de Medicamentos por Período</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Compare os produtos com maior e menor volume de saída.</p>
                  </div>
                  <button 
                    onClick={() => handlePrintReport('PRODUCTS')}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    <PrinterIcon className="w-4 h-4" /> Imprimir Relatório A4
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                  {(['SEMANA', 'MES', 'TRIMESTRE', 'SEMESTRE', 'ANO'] as ProductPeriod[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setProductPeriod(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all border ${
                        productPeriod === p 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p === 'SEMANA' && 'Semana'}
                      {p === 'MES' && 'Mês'}
                      {p === 'TRIMESTRE' && 'Trimestre'}
                      {p === 'SEMESTRE' && 'Semestre'}
                      {p === 'ANO' && 'Ano'}
                    </button>
                  ))}
                </div>

                {/* PERIOD SUB-SELECTORS DROPDOWN FILTERS */}
                <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 font-mono">Filtro Ativo:</span>
                    <span className="px-2.5 py-1 bg-slate-200 text-slate-800 text-xs font-black rounded-lg">
                      {activeProductRange.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* 1. SEMANA SELECTOR */}
                    {productPeriod === 'SEMANA' && (
                      <>
                        {/* Month Selector for week */}
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Mês:</span>
                          <select
                            value={selectedWeekMonth}
                            onChange={(e) => setSelectedWeekMonth(parseInt(e.target.value, 10))}
                            className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                              <option key={m} value={m}>
                                {new Date(selectedYear, m - 1, 2).toLocaleDateString('pt-AO', { month: 'long' })}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Week selection */}
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Semana:</span>
                          <select
                            value={selectedWeekNumber}
                            onChange={(e) => setSelectedWeekNumber(parseInt(e.target.value, 10))}
                            className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                          >
                            <option value={1}>1ª Semana (Dia 1 a 7)</option>
                            <option value={2}>2ª Semana (Dia 8 a 14)</option>
                            <option value={3}>3ª Semana (Dia 15 a 21)</option>
                            <option value={4}>4ª Semana (Dia 22 a 28)</option>
                            <option value={5}>5ª Semana (Restante do Mês)</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* 2. MES SELECTOR */}
                    {productPeriod === 'MES' && (
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 w-full sm:w-auto">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Escolher Mês:</span>
                        <select
                          value={selectedProductMonth}
                          onChange={(e) => setSelectedProductMonth(parseInt(e.target.value, 10))}
                          className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer w-full sm:w-auto"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>
                              {new Date(selectedYear, m - 1, 2).toLocaleDateString('pt-AO', { month: 'long' })}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 3. TRIMESTRE SELECTOR */}
                    {productPeriod === 'TRIMESTRE' && (
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 w-full sm:w-auto">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Trimestre:</span>
                        <select
                          value={selectedQuarter}
                          onChange={(e) => setSelectedQuarter(parseInt(e.target.value, 10))}
                          className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer w-full sm:w-auto"
                        >
                          <option value={1}>1º Trimestre (Jan - Mar)</option>
                          <option value={2}>2º Trimestre (Abr - Jun)</option>
                          <option value={3}>3º Trimestre (Jul - Set)</option>
                          <option value={4}>4º Trimestre (Out - Dez)</option>
                        </select>
                      </div>
                    )}

                    {/* 4. SEMESTRE SELECTOR */}
                    {productPeriod === 'SEMESTRE' && (
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 w-full sm:w-auto">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Semestre:</span>
                        <select
                          value={selectedSemester}
                          onChange={(e) => setSelectedSemester(parseInt(e.target.value, 10))}
                          className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer w-full sm:w-auto"
                        >
                          <option value={1}>1º Semestre (Janeiro - Junho)</option>
                          <option value={2}>2º Semestre (Julho - Dezembro)</option>
                        </select>
                      </div>
                    )}

                    {/* 5. ANO SELECTOR */}
                    {productPeriod === 'ANO' && (
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase">
                        Vendas consolidadas do ano civil de {selectedYear}.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Side-by-side Top/Bottom sold lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. MOST SOLD (Mais Saídas) */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                  <div className="px-5 py-3.5 border-b bg-emerald-50/50 flex items-center gap-2.5">
                    <div className="p-1 rounded-md bg-emerald-100 text-emerald-600">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <h4 className="font-black text-xs text-emerald-900 uppercase tracking-wider">Produtos com Mais Saída</h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {productsSalesReport.mostSold.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">Nenhuma venda registrada neste período.</div>
                    ) : (
                      productsSalesReport.mostSold.slice(0, 15).map((item, idx) => (
                        <div key={item.product.id} className="p-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-slate-400 w-5 text-center">#{idx + 1}</span>
                            <div>
                              <p className="font-extrabold text-xs text-slate-800">{item.product.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold">{item.product.category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-black text-xs rounded-full">
                              {item.soldQuantity} saídas
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2. LEAST SOLD (Menos Saídas) */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                  <div className="px-5 py-3.5 border-b bg-rose-50/50 flex items-center gap-2.5">
                    <div className="p-1 rounded-md bg-rose-100 text-rose-600">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <h4 className="font-black text-xs text-rose-900 uppercase tracking-wider">Produtos com Menos Saída</h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {productsSalesReport.leastSold.slice(0, 15).map((item, idx) => (
                      <div key={item.product.id} className="p-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-slate-400 w-5 text-center">#{idx + 1}</span>
                          <div>
                            <p className="font-extrabold text-xs text-slate-800">{item.product.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold">{item.product.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2.5 py-1 font-black text-xs rounded-full ${
                            item.soldQuantity === 0 
                              ? 'bg-slate-100 text-slate-500' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.soldQuantity} saídas
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: RELATÓRIO MAIS E MENOS */}
          {viewMode === 'MOST_LEAST_REPORT' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                <div className="px-6 py-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                  <div>
                    <h4 className="font-extrabold text-base text-slate-900 uppercase tracking-tight">Relatório Mais e Menos</h4>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Produtos ordenados por volume de saídas decrescente (do mais vendido ao menos vendido) para o ano de {selectedYear}.
                    </p>
                  </div>
                  <button 
                    onClick={() => handlePrintReport('MOST_LEAST')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-xs font-bold uppercase tracking-wider transition-all shadow-md"
                  >
                    <PrinterIcon className="w-4 h-4" /> Exportar / Imprimir A4
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-slate-400 font-black uppercase bg-slate-50/80 border-b tracking-wider">
                      <tr>
                        <th className="px-6 py-4 text-center w-16">Posição</th>
                        <th className="px-6 py-4">Nome do Produto</th>
                        <th className="px-6 py-4">Categoria</th>
                        <th className="px-6 py-4">Tipo de Forma</th>
                        <th className="px-6 py-4 text-right">Quantidade Vendida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mostToLeastProductsList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Nenhum produto cadastrado no sistema.</td>
                        </tr>
                      ) : (
                        mostToLeastProductsList.map((item, idx) => {
                          const bgBadgeClass = 
                            idx === 0 ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            idx === 1 ? 'bg-slate-100 text-slate-800 border-slate-200' :
                            idx === 2 ? 'bg-orange-100 text-orange-800 border-orange-200' :
                            'bg-slate-50 text-slate-500 border-slate-100';

                          return (
                            <tr key={item.product.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-center">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black border ${bgBadgeClass}`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-mono font-bold text-slate-500 border rounded">
                                  {item.product.code}
                                </span>
                                <p className="font-extrabold text-slate-800 mt-1">{item.product.name}</p>
                              </td>
                              <td className="px-6 py-4 text-slate-600 font-medium">
                                {item.product.category}
                              </td>
                              <td className="px-6 py-4 text-slate-500 font-semibold text-xs uppercase">
                                {item.product.type || 'N/A'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className={`px-3 py-1 font-black text-xs rounded-full ${
                                  item.soldQuantity > 0 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/50' 
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {item.soldQuantity} unidades
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
          )}
        </div>
      </div>

      {/* CONFIRMATION MODAL: ANULAÇÃO DE FATURA */}
      {invoiceToCancel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-slate-900 uppercase">Confirmar Anulação</h4>
            <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
              Tem a certeza de que deseja anular a fatura <strong className="font-mono text-slate-800">{invoiceToCancel.invoiceNumber}</strong>?
            </p>
            <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
              Esta operação irá repor todas as quantidades vendidas nos respetivos lotes de medicamentos de volta ao stock. Esta ação é irreversível.
            </p>
            
            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setInvoiceToCancel(null)}
                className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase text-xs tracking-widest"
              >
                Cancelar
              </button>
              <button 
                onClick={executeCancelInvoice}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-600/30 transition-all uppercase text-xs tracking-widest"
              >
                Anular Fatura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: ANULAÇÃO DE ITEM VENDIDO */}
      {itemToCancel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-slate-900 uppercase">Confirmar Anulação de Item</h4>
            <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
              Deseja realmente anular o item vendido <strong className="text-slate-800">{itemToCancel.productName}</strong> (Qtd: {itemToCancel.quantity}) na fatura <strong className="font-mono text-slate-800">{itemToCancel.invoiceNumber}</strong>?
            </p>
            <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
              As unidades vendidas serão devolvidas ao respetivo lote de medicamento e os totais e impostos da fatura serão recalculados automaticamente.
            </p>
            
            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setItemToCancel(null)}
                className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase text-xs tracking-widest"
              >
                Voltar
              </button>
              <button 
                onClick={executeCancelItem}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-600/30 transition-all uppercase text-xs tracking-widest"
              >
                Anular Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RELATÓRIO INDIVIDUAL DE PRODUTO */}
      {selectedIndividualProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="px-2 py-0.5 bg-slate-800 text-[10px] font-black uppercase text-slate-300 rounded font-mono">
                  {selectedIndividualProduct.code}
                </span>
                <h3 className="font-black text-lg uppercase tracking-tight mt-1">
                  Relatório Individual de Stock
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {selectedIndividualProduct.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {user.role === UserRole.ADMIN && onDeleteProduct && (
                  <button 
                    onClick={async () => {
                      if (confirm(`Deseja realmente eliminar o produto "${selectedIndividualProduct.name}" e todos os seus lotes associados? Esta acção é irreversível.`)) {
                        await onDeleteProduct(selectedIndividualProduct.id);
                        setSelectedIndividualProduct(null);
                      }
                    }} 
                    className="p-1.5 hover:bg-red-600 rounded-full transition-colors text-slate-400 hover:text-white"
                    title="Eliminar Produto"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedIndividualProduct(null)} 
                  className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Product Information Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 border border-slate-100 rounded-xl">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Substância Ativa</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">{selectedIndividualProduct.activeIngredient || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 p-3 border border-slate-100 rounded-xl">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Categoria</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">{selectedIndividualProduct.category}</p>
                </div>
                <div className="bg-slate-50 p-3 border border-slate-100 rounded-xl">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Preço de Venda</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">{selectedIndividualProduct.sellPrice.toLocaleString()} Kz</p>
                </div>
                <div className="bg-slate-50 p-3 border border-slate-100 rounded-xl">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Fornecedor</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">{selectedIndividualProduct.supplier || 'N/A'}</p>
                </div>
              </div>

              {/* Stats Summary Panel */}
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const soldQty = totalSold[selectedIndividualProduct.id] || 0;
                const pBatches = batchesByProduct[selectedIndividualProduct.id] || [];
                const validBatches = pBatches.filter(b => b.expiryDate >= todayStr);
                const batchStockSum = validBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
                const activeStock = pBatches.length > 0 ? batchStockSum : (Number(selectedIndividualProduct.totalQuantity) || 0);
                const totalEntryStock = activeStock + soldQty;
                return (
                  <div className="grid grid-cols-3 gap-4 bg-slate-900 text-white p-5 rounded-2xl">
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-blue-400">Total Entrada</p>
                      <span className="text-xl font-black block mt-1 text-blue-400">{totalEntryStock}</span>
                    </div>
                    <div className="text-center border-x border-slate-800">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-emerald-400">Stock Ativo</p>
                      <span className="text-xl font-black block mt-1 text-emerald-400">{activeStock}</span>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-orange-400">Qtd. Vendida</p>
                      <span className="text-xl font-black block mt-1 text-orange-400">{soldQty}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Batches / Entries List */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Historial de Entradas de Lotes (Por Dia)
                </h4>
                {(() => {
                  const prodBatches = batchesByProduct[selectedIndividualProduct.id] || [];
                  if (prodBatches.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        Nenhum lote ou entrada de stock registrada para este produto.
                      </p>
                    );
                  }
                  return (
                    <div className="border rounded-2xl overflow-hidden shadow-xs">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 border-b">
                          <tr className="text-slate-400 font-black uppercase tracking-wider text-[9px]">
                            <th className="px-4 py-3">Dia do Registo</th>
                            <th className="px-4 py-3">Número de Lote</th>
                            <th className="px-4 py-3 text-center">Data de Validade</th>
                            <th className="px-4 py-3 text-right">Qtd. de Entrada</th>
                            <th className="px-4 py-3 text-right">Qtd. Atual Restante</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y bg-white">
                          {prodBatches.map(b => {
                            const soldFromB = soldByBatch[b.id] || 0;
                            const entryQty = b.quantity + soldFromB;
                            const isExpired = new Date(b.expiryDate) < new Date();
                            return (
                              <tr key={b.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-semibold text-slate-700">
                                  {new Date(b.entryDate + 'T00:00:00').toLocaleDateString('pt-AO')}
                                </td>
                                <td className="px-4 py-3 font-mono font-bold text-slate-600">
                                  {b.lotNumber}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`font-semibold ${isExpired ? 'text-red-500 font-black' : 'text-slate-600'}`}>
                                    {new Date(b.expiryDate + 'T00:00:00').toLocaleDateString('pt-AO')}
                                  </span>
                                  {isExpired && (
                                    <span className="block text-[8px] text-red-500 uppercase font-black tracking-widest">Expirado</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right font-black text-slate-900">
                                  {entryQty} un.
                                </td>
                                <td className="px-4 py-3 text-right font-black text-slate-700">
                                  {b.quantity} un.
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t flex justify-end shrink-0">
              <button 
                onClick={() => setSelectedIndividualProduct(null)}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-slate-800 transition-all shadow-md shadow-slate-900/10"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RELATÓRIO DETALHADO DE VENDAS DIÁRIAS (DOUBLE CLICK) */}
      {selectedDailySalesDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[180] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="px-2.5 py-0.5 bg-slate-800 text-[10px] font-black uppercase text-slate-300 rounded font-mono">
                  Relatório Diário Detalhado
                </span>
                <h3 className="font-black text-lg uppercase tracking-tight mt-1.5">
                  Vendas do Dia: {new Date(selectedDailySalesDetail.date + 'T00:00:00').toLocaleDateString('pt-AO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Visualização individual de todos os produtos e formas de pagamento registadas.
                </p>
              </div>
              <button 
                onClick={() => setSelectedDailySalesDetail(null)} 
                className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Main table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-slate-400 font-black uppercase tracking-wider text-[9px]">
                      <th className="px-4 py-3">Hora</th>
                      <th className="px-4 py-3">Medicamento / Produto</th>
                      <th className="px-4 py-3 text-center">Quantidade</th>
                      <th className="px-4 py-3 text-right">Preço Unitário</th>
                      <th className="px-4 py-3 text-center">Forma Pagamento</th>
                      <th className="px-4 py-3 text-right">Total Pago (Líquido)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-white">
                    {dailyItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                          Nenhum produto vendido registado nas faturas ativas deste dia.
                        </td>
                      </tr>
                    ) : (
                      dailyItems.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-mono font-semibold text-slate-500">
                            {item.hour}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-800">{item.productName}</p>
                            {item.productCode && (
                              <span className="text-[9px] text-slate-400 font-mono">Cód: {item.productCode}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-black text-slate-900">
                            {item.quantity} un.
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-600">
                            {item.unitPrice.toLocaleString()} Kz
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-bold uppercase tracking-wide border">
                              {item.paymentMethod}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-950">
                            {item.totalLine.toLocaleString()} Kz
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payment methods totals */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">
                    Totais por Forma de Pagamento
                  </h4>
                  <div className="space-y-2">
                    {Object.keys(dailyPaymentTotals).length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Nenhum pagamento registrado.</p>
                    ) : (
                      Object.entries(dailyPaymentTotals).map(([method, val]) => (
                        <div key={method} className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-600 uppercase bg-white border px-2 py-0.5 rounded text-[10px]">{method}</span>
                          <span className="font-black text-slate-900">{val.toLocaleString()} Kz</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* General total */}
                <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Geral de Faturação</span>
                  <div className="mt-4">
                    <span className="text-3xl font-black text-emerald-400 block tracking-tight">
                      {dailyTotalNet.toLocaleString()} Kz
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium block mt-1">Consolidação de faturamento diário líquido com impostos.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t flex gap-3 shrink-0">
              <button 
                onClick={() => handlePrintReport('DAILY_DETAIL')}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
              >
                <PrinterIcon className="w-4 h-4" /> Baixar / Imprimir PDF (A4)
              </button>
              <button 
                onClick={() => setSelectedDailySalesDetail(null)}
                className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold uppercase text-xs text-slate-500 tracking-widest hover:bg-slate-100 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RELATÓRIO DETALHADO DE VENDAS MENSAIS (DOUBLE CLICK) */}
      {selectedMonthlySalesDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[180] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="px-2.5 py-0.5 bg-slate-800 text-[10px] font-black uppercase text-slate-300 rounded font-mono">
                  Relatório Mensal Detalhado
                </span>
                <h3 className="font-black text-lg uppercase tracking-tight mt-1.5">
                  Vendas do Mês: {new Date(selectedMonthlySalesDetail.month + '-02').toLocaleDateString('pt-AO', { year: 'numeric', month: 'long' })}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Consolidação diária de faturas, volumes de artigos vendidos e totais financeiros.
                </p>
              </div>
              <button 
                onClick={() => setSelectedMonthlySalesDetail(null)} 
                className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Days Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-slate-400 font-black uppercase tracking-wider text-[9px]">
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3 text-center">Faturas Geradas</th>
                      <th className="px-4 py-3 text-center">Produtos Vendidos</th>
                      <th className="px-4 py-3">Total por Forma de Pagamento</th>
                      <th className="px-4 py-3 text-right">Total do Dia (Líquido)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-white">
                    {monthlyDaysList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                          Nenhuma venda ativa registada neste mês de referência.
                        </td>
                      </tr>
                    ) : (
                      monthlyDaysList.map((day, index) => (
                        <tr key={index} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-800">
                            {new Date(day.date + 'T00:00:00').toLocaleDateString('pt-AO', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-600">
                            {day.invoiceCount} faturas
                          </td>
                          <td className="px-4 py-3 text-center font-black text-slate-900">
                            {day.productCount} un.
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5 max-w-sm">
                              {Object.entries(day.paymentTotals).map(([method, val]) => (
                                <span key={method} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 border text-slate-700 text-[9px] font-semibold rounded uppercase font-mono">
                                  {method}: <strong className="text-slate-900">{val.toLocaleString()} Kz</strong>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-950">
                            {day.totalNet.toLocaleString()} Kz
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Monthly Totals Block */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Faturado no Mês</span>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Consolidação da soma total líquida de faturas ativas no período.</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-emerald-400 tracking-tight">
                    {monthlyTotalNet.toLocaleString()} Kz
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t flex gap-3 shrink-0">
              <button 
                onClick={() => handlePrintReport('MONTHLY_DETAIL')}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
              >
                <PrinterIcon className="w-4 h-4" /> Baixar / Imprimir PDF (A4)
              </button>
              <button 
                onClick={() => setSelectedMonthlySalesDetail(null)}
                className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold uppercase text-xs text-slate-500 tracking-widest hover:bg-slate-100 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RELATÓRIO DETALHADO DE VENDAS ANUAIS (DOUBLE CLICK) */}
      {selectedYearlySalesDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[180] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="px-2.5 py-0.5 bg-slate-800 text-[10px] font-black uppercase text-slate-300 rounded font-mono">
                  Relatório Anual Detalhado
                </span>
                <h3 className="font-black text-lg uppercase tracking-tight mt-1.5">
                  Vendas do Ano Civil: {selectedYearlySalesDetail.year}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Consolidação mensal de faturas, volumes de medicamentos vendidos e totais faturados por pagamento.
                </p>
              </div>
              <button 
                onClick={() => setSelectedYearlySalesDetail(null)} 
                className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Months Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-slate-400 font-black uppercase tracking-wider text-[9px]">
                      <th className="px-4 py-3">Mês</th>
                      <th className="px-4 py-3 text-center">Faturas Geradas</th>
                      <th className="px-4 py-3 text-center">Medicamentos Vendidos</th>
                      <th className="px-4 py-3">Total por Forma de Pagamento</th>
                      <th className="px-4 py-3 text-right">Total do Mês (Líquido)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-white">
                    {yearlyMonthsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                          Nenhuma venda registrada no ano de {selectedYearlySalesDetail.year}.
                        </td>
                      </tr>
                    ) : (
                      yearlyMonthsList.map((m, index) => (
                        <tr key={index} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-black text-slate-800 uppercase tracking-wide">
                            {new Date(m.month + '-02').toLocaleDateString('pt-AO', { year: 'numeric', month: 'long' })}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-600">
                            {m.invoiceCount} faturas
                          </td>
                          <td className="px-4 py-3 text-center font-black text-slate-900">
                            {m.productCount} un.
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5 max-w-sm">
                              {Object.entries(m.paymentTotals).map(([method, val]) => (
                                <span key={method} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 border text-slate-700 text-[9px] font-semibold rounded uppercase font-mono">
                                  {method}: <strong className="text-slate-900">{val.toLocaleString()} Kz</strong>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-950">
                            {m.totalNet.toLocaleString()} Kz
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Yearly Totals Block */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Faturado no Ano Civil</span>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Consolidação anual líquida de todos os meses consolidados.</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-emerald-400 tracking-tight">
                    {yearlyTotalNet.toLocaleString()} Kz
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t flex gap-3 shrink-0">
              <button 
                onClick={() => handlePrintReport('YEARLY_DETAIL')}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
              >
                <PrinterIcon className="w-4 h-4" /> Baixar / Imprimir PDF (A4)
              </button>
              <button 
                onClick={() => setSelectedYearlySalesDetail(null)}
                className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold uppercase text-xs text-slate-500 tracking-widest hover:bg-slate-100 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DE FATURA - no-print */}
      {selectedInvoice && !activeReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[150] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-base uppercase tracking-tight">Detalhes do Documento</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedInvoice.invoiceNumber}</p>
              </div>
              <button 
                onClick={() => setSelectedInvoice(null)} 
                className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div>
                  <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1.5">Informações do Cliente</h4>
                  <p className="font-bold text-slate-800 text-sm">{selectedInvoice.customerName || 'Consumidor Final'}</p>
                  <p className="text-slate-500 mt-0.5">NIF: {selectedInvoice.customerNif || '999999999'}</p>
                </div>
                <div className="text-right">
                  <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1.5">Data e Pagamento</h4>
                  <p className="font-bold text-slate-800">{new Date(selectedInvoice.date).toLocaleString('pt-AO')}</p>
                  <p className="text-emerald-600 font-black uppercase text-[10px] mt-1">{selectedInvoice.paymentMethod}</p>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-slate-400 font-black uppercase tracking-wider text-[9px]">
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3 text-center">Qtd</th>
                      <th className="px-4 py-3 text-right">Preço Unitário</th>
                      <th className="px-4 py-3 text-right">IVA (14%)</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-white">
                    {selectedInvoice.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400 italic">Esta fatura não tem itens ou foi esvaziada.</td>
                      </tr>
                    ) : (
                      selectedInvoice.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-700">
                            {item.productName}
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">Lote: {item.lotNumber}</p>
                          </td>
                          <td className="px-4 py-3 text-center font-black text-slate-900">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{item.unitPrice.toLocaleString()} Kz</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-bold">{(item.vatAmount).toLocaleString()} Kz</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{(item.subtotal + item.vatAmount).toLocaleString()} Kz</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <div className="w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-xs text-slate-500 font-bold uppercase">
                    <span>Base Tributável</span>
                    <span>{selectedInvoice.totalGross.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-600 font-bold uppercase">
                    <span>IVA Liquidado (14%)</span>
                    <span>{selectedInvoice.totalVAT.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-lg font-black text-slate-900 pt-2 border-t border-slate-200 border-dashed">
                    <span>VALOR TOTAL</span>
                    <span>{selectedInvoice.totalNet.toLocaleString()} Kz</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex gap-3 shrink-0">
              <button 
                onClick={() => handleReprintSingleInvoice(selectedInvoice)}
                className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-md shadow-slate-900/10"
              >
                <PrinterIcon className="w-4 h-4" /> Reimprimir Fatura
              </button>
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold uppercase text-xs text-slate-500 tracking-widest hover:bg-slate-100 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}


      {/* MODAL: ELIMINAÇÃO DE FATURAS POR INTERVALO DE DATAS (ADMIN) */}
      {isRangeDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[160] flex items-center justify-center p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base uppercase tracking-tight">Expurgar Faturas por Período</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Eliminação permanente e definitiva no Supabase</p>
                </div>
              </div>
              <button 
                onClick={() => setIsRangeDeleteModalOpen(false)} 
                disabled={isProcessingRangeDelete}
                className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-800 space-y-1">
                  <p className="font-bold">Atenção: Ação Definitiva e Irreversível</p>
                  <p className="text-[11px] leading-relaxed text-rose-700">
                    Todas as faturas emitidas no intervalo selecionado serão permanentemente apagadas da base de dados Supabase e do armazenamento local. As faturas eliminadas não voltarão a aparecer em nenhum navegador.
                  </p>
                </div>
              </div>

              {/* Date pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Data Inicial</label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input 
                      type="date"
                      value={rangeStartDate}
                      onChange={(e) => setRangeStartDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Data Final</label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input 
                      type="date"
                      value={rangeEndDate}
                      onChange={(e) => setRangeEndDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Summary of matching invoices */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Faturas no Intervalo:</span>
                  <span className="font-black text-slate-900 text-sm px-2.5 py-0.5 rounded-full bg-slate-200">
                    {rangeMatchingInvoices.length} fatura(s)
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Valor Total das Faturas:</span>
                  <span className="font-black text-emerald-600">
                    {rangeMatchingInvoices.reduce((acc, curr) => acc + curr.totalNet, 0).toLocaleString()} Kz
                  </span>
                </div>

                {rangeMatchingInvoices.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 max-h-32 overflow-y-auto space-y-1">
                    {rangeMatchingInvoices.slice(0, 10).map(inv => (
                      <div key={inv.id} className="text-[10px] flex justify-between text-slate-600">
                        <span className="font-mono font-bold">{inv.invoiceNumber} ({new Date(inv.date).toLocaleDateString('pt-AO')})</span>
                        <span className="font-bold">{inv.totalNet.toLocaleString()} Kz</span>
                      </div>
                    ))}
                    {rangeMatchingInvoices.length > 10 && (
                      <p className="text-[9px] text-slate-400 text-center italic">...e mais {rangeMatchingInvoices.length - 10} faturas</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t flex gap-3 shrink-0">
              <button 
                onClick={async () => {
                  if (rangeMatchingInvoices.length === 0) {
                    alert('Nenhuma fatura encontrada no período selecionado.');
                    return;
                  }
                  if (!onDeleteInvoicesBatch) return;

                  if (confirm(`ATENÇÃO: Confirma a eliminação permanente de ${rangeMatchingInvoices.length} faturas entre ${new Date(rangeStartDate + 'T00:00:00').toLocaleDateString('pt-AO')} e ${new Date(rangeEndDate + 'T00:00:00').toLocaleDateString('pt-AO')}?\n\nEsta operação é definitiva e apagará os dados no Supabase e em todos os navegadores.`)) {
                    setIsProcessingRangeDelete(true);
                    try {
                      const ids = rangeMatchingInvoices.map(i => i.id);
                      await onDeleteInvoicesBatch(ids);
                      setIsRangeDeleteModalOpen(false);
                    } catch (e: any) {
                      alert(`Erro ao eliminar faturas: ${e.message || e}`);
                    } finally {
                      setIsProcessingRangeDelete(false);
                    }
                  }
                }}
                disabled={rangeMatchingInvoices.length === 0 || isProcessingRangeDelete}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {isProcessingRangeDelete ? 'A eliminar...' : `Eliminar ${rangeMatchingInvoices.length} Faturas`}
              </button>
              <button 
                onClick={() => setIsRangeDeleteModalOpen(false)}
                disabled={isProcessingRangeDelete}
                className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold uppercase text-xs text-slate-500 tracking-wider hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AREA DE IMPRESSAO A4 EM PDF (OCULTA NO BROWSER, APENAS VISÍVEL EM PRINT:BLOCK) */}
      {activeReport && (
        <div className="hidden print:block p-8 bg-white text-black text-xs font-sans leading-relaxed">
          {/* Header Comum de Documento Angolano */}
          <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight">{COMPANY_INFO.name}</h1>
              <p className="font-bold text-[10px]">{COMPANY_INFO.address}</p>
              <p className="text-[10px]">NIF: {COMPANY_INFO.nif} | Alvará: {COMPANY_INFO.license}</p>
              <p className="text-[10px]">Telefone: {COMPANY_INFO.phone} | Email: {COMPANY_INFO.email}</p>
            </div>
            <div className="text-right">
              <h2 className="text-sm font-black uppercase tracking-widest border border-black px-3 py-1 bg-slate-50">
                {activeReport === 'HISTORY' && 'Histórico de Faturação'}
                {activeReport === 'VAT_MAP' && 'Mapa de IVA Periódico'}
                {activeReport === 'SALES_DAILY' && 'Relatório de Faturação Diária'}
                {activeReport === 'SALES_MONTHLY' && 'Relatório de Faturação Mensal'}
                {activeReport === 'SALES_YEARLY' && 'Relatório de Faturação Anual'}
                {activeReport === 'STOCK' && 'Relatório de Stocks e Entradas'}
                {activeReport === 'STOCK_ALL' && 'Relatório de Stocks - Todos os Produtos'}
                {activeReport === 'STOCK_ALTERED' && 'Relatório de Stocks - Produtos Vendidos'}
                {activeReport === 'PRODUCTS' && `Faturação de Produtos (${productPeriod})`}
                {activeReport === 'INVOICE_REPRINT' && 'Reimpressão de Fatura'}
                {activeReport === 'DAILY_DETAIL' && 'Relatório Diário de Vendas Detalhado'}
                {activeReport === 'MONTHLY_DETAIL' && 'Relatório Mensal de Vendas Detalhado'}
                {activeReport === 'YEARLY_DETAIL' && 'Relatório Anual de Vendas Detalhado'}
              </h2>
              <p className="text-[9px] font-bold text-slate-600 mt-1.5">Data de Emissão: {new Date().toLocaleString('pt-AO')}</p>
              {activeReport === 'INVOICE_REPRINT' && selectedInvoice && (
                <p className="text-[9px] font-mono mt-1 text-slate-700">Documento: {selectedInvoice.invoiceNumber}</p>
              )}
            </div>
          </div>

          {/* DYNAMIC CONTENTS BASED ON REPORT TYPE */}

          {/* REPORT A4: HISTORIAL DE FATURAÇÃO */}
          {activeReport === 'HISTORY' && (
            <div className="space-y-4">
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-[9px] font-black uppercase">
                    <th className="p-2 border">Data</th>
                    <th className="p-2 border">Nº Fatura</th>
                    <th className="p-2 border">Cliente</th>
                    <th className="p-2 border">Operador</th>
                    <th className="p-2 border">Estado</th>
                    <th className="p-2 border text-right">Subtotal</th>
                    <th className="p-2 border text-right">IVA</th>
                    <th className="p-2 border text-right">Total Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} className="border-b border-slate-200 text-[9px]">
                      <td className="p-2 border">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="p-2 border font-mono font-bold">{inv.invoiceNumber}</td>
                      <td className="p-2 border">{inv.customerName || 'Consumidor Final'}</td>
                      <td className="p-2 border">{inv.userName}</td>
                      <td className="p-2 border font-bold">{inv.status}</td>
                      <td className="p-2 border text-right">{inv.totalGross.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right">{inv.totalVAT.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right font-bold">{inv.totalNet.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-black text-[10px] uppercase">
                    <td colSpan={5} className="p-2 text-right border font-bold">Totais Ativos:</td>
                    <td className="p-2 text-right border">
                      {filteredInvoices.filter(i => i.status === InvoiceStatus.ISSUED).reduce((s, i) => s + i.totalGross, 0).toLocaleString()} Kz
                    </td>
                    <td className="p-2 text-right border text-emerald-700">
                      {filteredInvoices.filter(i => i.status === InvoiceStatus.ISSUED).reduce((s, i) => s + i.totalVAT, 0).toLocaleString()} Kz
                    </td>
                    <td className="p-2 text-right border text-black underline decoration-double">
                      {totalGeral.toLocaleString()} Kz
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* REPORT A4: MAPA DE IVA */}
          {activeReport === 'VAT_MAP' && (
            <div className="space-y-4">
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-[9px] font-black uppercase">
                    <th className="p-2 border">Data</th>
                    <th className="p-2 border">Nº Fatura</th>
                    <th className="p-2 border">NIF Cliente</th>
                    <th className="p-2 border text-right">Base Incidência (14%)</th>
                    <th className="p-2 border text-right">IVA Liquidado</th>
                    <th className="p-2 border text-right">Total Fatura</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.filter(inv => inv.status === InvoiceStatus.ISSUED).map(inv => (
                    <tr key={inv.id} className="border-b border-slate-200 text-[9px]">
                      <td className="p-2 border">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="p-2 border font-mono font-bold">{inv.invoiceNumber}</td>
                      <td className="p-2 border">{inv.customerNif || '999999999'}</td>
                      <td className="p-2 border text-right">{inv.totalGross.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right font-bold text-emerald-800">{inv.totalVAT.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right font-black">{inv.totalNet.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-black text-[10px] uppercase">
                    <td colSpan={3} className="p-2 text-right border">Totais Acumulados:</td>
                    <td className="p-2 text-right border">
                      {filteredInvoices.filter(inv => inv.status === InvoiceStatus.ISSUED).reduce((sum, inv) => sum + inv.totalGross, 0).toLocaleString()} Kz
                    </td>
                    <td className="p-2 text-right border text-emerald-700 underline">
                      {totalIVA.toLocaleString()} Kz
                    </td>
                    <td className="p-2 text-right border underline decoration-double">
                      {totalGeral.toLocaleString()} Kz
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* REPORT A4: DAILY SALES */}
          {activeReport === 'SALES_DAILY' && (
            <div className="space-y-4">
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-[9px] font-black uppercase">
                    <th className="p-2 border">Dia Civil</th>
                    <th className="p-2 border text-center">Faturas Ativas</th>
                    <th className="p-2 border text-right">Incidência IVA</th>
                    <th className="p-2 border text-right">Imposto (14%)</th>
                    <th className="p-2 border text-right font-black">Faturamento Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySales.map(day => (
                    <tr key={day.date} className="border-b border-slate-200 text-[9px]">
                      <td className="p-2 border font-bold">{day.date}</td>
                      <td className="p-2 border text-center">{day.count}</td>
                      <td className="p-2 border text-right">{day.gross.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right text-emerald-700 font-bold">{day.vat.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right font-black">{day.net.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* REPORT A4: MONTHLY SALES */}
          {activeReport === 'SALES_MONTHLY' && (
            <div className="space-y-4">
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-[9px] font-black uppercase">
                    <th className="p-2 border">Mês de Referência</th>
                    <th className="p-2 border text-center">Faturas Ativas</th>
                    <th className="p-2 border text-right">Incidência IVA</th>
                    <th className="p-2 border text-right">Imposto (14%)</th>
                    <th className="p-2 border text-right font-black">Faturamento Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySales.map(m => (
                    <tr key={m.month} className="border-b border-slate-200 text-[9px]">
                      <td className="p-2 border font-black uppercase">{m.month}</td>
                      <td className="p-2 border text-center">{m.count}</td>
                      <td className="p-2 border text-right">{m.gross.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right text-emerald-700 font-bold">{m.vat.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right font-black">{m.net.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* REPORT A4: YEARLY SALES */}
          {activeReport === 'SALES_YEARLY' && (
            <div className="space-y-4">
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-black text-[9px] font-black uppercase">
                    <th className="p-2 border">Ano Civil</th>
                    <th className="p-2 border text-center">Faturas Ativas</th>
                    <th className="p-2 border text-right">Incidência IVA</th>
                    <th className="p-2 border text-right">Imposto (14%)</th>
                    <th className="p-2 border text-right font-black">Faturamento Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlySales.map(y => (
                    <tr key={y.year} className="border-b border-slate-200 text-[9px]">
                      <td className="p-2 border font-black text-sm">{y.year}</td>
                      <td className="p-2 border text-center">{y.count}</td>
                      <td className="p-2 border text-right">{y.gross.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right text-emerald-700 font-bold">{y.vat.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right font-black">{y.net.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* REPORT A4: RELATÓRIO DE STOCK - TODOS OS PRODUTOS REGISTADOS */}
          {activeReport === 'STOCK_ALL' && (
            <div className="space-y-4">
              <div className="mb-4 bg-slate-50 p-4 border border-black rounded-sm print-avoid-break">
                <p className="text-xs font-black uppercase">Relatório de Stock - Todos os Produtos Registados</p>
                <p className="text-[9px] text-slate-600">Este relatório apresenta a totalidade dos medicamentos cadastrados no sistema ({stockReportsCombined.length} produtos), com respetivos stocks e saídas.</p>
              </div>
              <table className="w-full text-left border-collapse border border-black text-[9px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-black font-black uppercase">
                    <th className="p-2 border border-black">Código</th>
                    <th className="p-2 border border-black">Nome do Produto</th>
                    <th className="p-2 border border-black text-right">Total de Stocks de Entrada</th>
                    <th className="p-2 border border-black text-right">Stock Total Ativo</th>
                    <th className="p-2 border border-black text-right font-black">Total de Quantidade Vendida</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReportsCombined.map(item => (
                    <tr key={item.product.id} className="border-b border-slate-300">
                      <td className="p-2 border border-black font-mono font-bold">{item.product.code}</td>
                      <td className="p-2 border border-black font-bold">{item.product.name}</td>
                      <td className="p-2 border border-black text-right font-bold">{item.totalEntryStock}</td>
                      <td className="p-2 border border-black text-right font-bold">{item.activeStock}</td>
                      <td className="p-2 border border-black text-right font-bold">{item.soldQty}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-black text-[10px] uppercase border-t-2 border-black">
                    <td colSpan={2} className="p-2 border border-black font-black">
                      Total ({stockReportsCombined.length} Medicamentos Registados):
                    </td>
                    <td className="p-2 border border-black text-right font-black">
                      {stockReportsCombined.reduce((sum, item) => sum + item.totalEntryStock, 0)}
                    </td>
                    <td className="p-2 border border-black text-right font-black">
                      {stockReportsCombined.reduce((sum, item) => sum + item.activeStock, 0)}
                    </td>
                    <td className="p-2 border border-black text-right font-black">
                      {stockReportsCombined.reduce((sum, item) => sum + item.soldQty, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* REPORT A4: RELATÓRIO DE STOCK - PRODUTOS ALTERADOS POR VENDAS */}
          {activeReport === 'STOCK_ALTERED' && (
            <div className="space-y-4">
              <div className="mb-4 bg-slate-50 p-4 border border-black rounded-sm print-avoid-break">
                <p className="text-xs font-black uppercase">Relatório de Stock - Produtos com Stock Alterado por Vendas</p>
                <p className="text-[9px] text-slate-600">Este relatório apresenta os medicamentos que sofreram alteração de stock no processo de vendas (com quantidades vendidas maiores que zero).</p>
              </div>
              <table className="w-full text-left border-collapse border border-black text-[9px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-black font-black uppercase">
                    <th className="p-2 border border-black">Código</th>
                    <th className="p-2 border border-black">Nome do Produto</th>
                    <th className="p-2 border border-black text-right">Total de Stocks de Entrada</th>
                    <th className="p-2 border border-black text-right">Stock Total Ativo</th>
                    <th className="p-2 border border-black text-right font-black">Total de Quantidade Vendida</th>
                  </tr>
                </thead>
                <tbody>
                  {alteredStockProductsList.map(item => (
                    <tr key={item.product.id} className="border-b border-slate-300">
                      <td className="p-2 border border-black font-mono font-bold">{item.product.code}</td>
                      <td className="p-2 border border-black font-bold">{item.product.name}</td>
                      <td className="p-2 border border-black text-right font-bold">{item.totalEntryStock}</td>
                      <td className="p-2 border border-black text-right font-bold">{item.activeStock}</td>
                      <td className="p-2 border border-black text-right font-bold">{item.soldQty}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-black text-[10px] uppercase border-t-2 border-black">
                    <td colSpan={2} className="p-2 border border-black font-black">
                      Total ({alteredStockProductsList.length} Medicamentos com Vendas):
                    </td>
                    <td className="p-2 border border-black text-right font-black">
                      {alteredStockProductsList.reduce((sum, item) => sum + item.totalEntryStock, 0)}
                    </td>
                    <td className="p-2 border border-black text-right font-black">
                      {alteredStockProductsList.reduce((sum, item) => sum + item.activeStock, 0)}
                    </td>
                    <td className="p-2 border border-black text-right font-black">
                      {alteredStockProductsList.reduce((sum, item) => sum + item.soldQty, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* REPORT A4: POPULARIDADE DE PRODUTOS */}
          {activeReport === 'PRODUCTS' && (
            <div className="space-y-6">
              <div className="border p-4 rounded-md bg-slate-50">
                <p className="text-[10px] font-black uppercase text-slate-500">Período de Análise</p>
                <p className="text-sm font-bold text-slate-900 uppercase mt-0.5">
                  {productPeriod === 'SEMANA' && 'Últimos 7 dias (Semana)'}
                  {productPeriod === 'MES' && 'Últimos 30 dias (Mês)'}
                  {productPeriod === 'TRIMESTRE' && 'Últimos 90 dias (Trimestre)'}
                  {productPeriod === 'SEMESTRE' && 'Últimos 180 dias (Semestre)'}
                  {productPeriod === 'ANO' && 'Últimos 365 dias (Ano)'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Most Sold Printable */}
                <div>
                  <h3 className="text-xs font-black uppercase border-b-2 border-emerald-500 pb-1 mb-3 text-emerald-800">Mais Saídas</h3>
                  <table className="w-full text-left border">
                    <thead>
                      <tr className="bg-slate-100 text-[8px] uppercase font-black">
                        <th className="p-2 border">Medicamento</th>
                        <th className="p-2 border text-right">Qtd Saídas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsSalesReport.mostSold.length === 0 ? (
                        <tr><td colSpan={2} className="p-4 text-center text-[10px] text-slate-400">Nenhuma saída registrada.</td></tr>
                      ) : (
                        productsSalesReport.mostSold.map(item => (
                          <tr key={item.product.id} className="text-[9px] border-b">
                            <td className="p-2 border">{item.product.name}</td>
                            <td className="p-2 border text-right font-bold text-emerald-700">{item.soldQuantity} un.</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Least Sold Printable */}
                <div>
                  <h3 className="text-xs font-black uppercase border-b-2 border-red-500 pb-1 mb-3 text-red-800">Menos Saídas</h3>
                  <table className="w-full text-left border">
                    <thead>
                      <tr className="bg-slate-100 text-[8px] uppercase font-black">
                        <th className="p-2 border">Medicamento</th>
                        <th className="p-2 border text-right">Qtd Saídas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsSalesReport.leastSold.map(item => (
                        <tr key={item.product.id} className="text-[9px] border-b">
                          <td className="p-2 border">{item.product.name}</td>
                          <td className="p-2 border text-right font-bold text-red-700">{item.soldQuantity} un.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* REPORT A4: INVOICE REPRINT RECEIPT */}
          {activeReport === 'INVOICE_REPRINT' && selectedInvoice && (
            <div className="space-y-6 max-w-[15cm] mx-auto border p-6 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-4 text-[10px]">
                <div>
                  <p className="font-bold text-slate-500 uppercase text-[8px]">Adquirente</p>
                  <p className="font-black text-slate-800 text-xs">{selectedInvoice.customerName || 'Consumidor Final'}</p>
                  <p className="text-slate-600 mt-0.5">NIF: {selectedInvoice.customerNif || '999999999'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-500 uppercase text-[8px]">Dados do Documento</p>
                  <p className="font-bold text-slate-800">{new Date(selectedInvoice.date).toLocaleString('pt-AO')}</p>
                  <p className="font-black text-emerald-600 uppercase mt-0.5">{selectedInvoice.paymentMethod}</p>
                  <p className="text-slate-600 font-bold mt-0.5">Operador: {selectedInvoice.userName}</p>
                </div>
              </div>

              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-[8px] uppercase font-black">
                    <th className="p-2 border">Produto</th>
                    <th className="p-2 border text-center">Qtd</th>
                    <th className="p-2 border text-right">Unitário</th>
                    <th className="p-2 border text-right">Taxa</th>
                    <th className="p-2 border text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={idx} className="text-[9px] border-b">
                      <td className="p-2 border">
                        <span className="font-bold">{item.productName}</span>
                        <span className="block text-[8px] text-slate-500 font-mono">Lote: {item.lotNumber}</span>
                      </td>
                      <td className="p-2 border text-center font-bold">{item.quantity}</td>
                      <td className="p-2 border text-right">{item.unitPrice.toLocaleString()} Kz</td>
                      <td className="p-2 border text-right text-emerald-700">14%</td>
                      <td className="p-2 border text-right font-black">{(item.subtotal + item.vatAmount).toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end pt-2">
                <div className="w-1/2 space-y-1.5 text-[10px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Tributável (14%):</span>
                    <span className="font-bold">{selectedInvoice.totalGross.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>IVA Liquidado (14%):</span>
                    <span>{selectedInvoice.totalVAT.toLocaleString()} Kz</span>
                  </div>
                  <div className="flex justify-between text-xs font-black text-slate-900 border-t border-black pt-1">
                    <span>Valor Total Geral:</span>
                    <span>{selectedInvoice.totalNet.toLocaleString()} Kz</span>
                  </div>
                </div>
              </div>

              {/* Legal Angolan signature text */}
              <div className="text-center text-[8px] text-slate-500 border-t pt-4 space-y-1">
                <p className="font-bold">Processado por programa validado nº 00/AGT/2026 PharmaGest</p>
                <p>Os bens/serviços foram colocados à disposição do adquirente na data e local do documento.</p>
                <p className="font-black text-slate-700">Obrigado pela sua preferência!</p>
              </div>
            </div>
          )}

          {/* REPORT A4: DETALHES DE VENDAS DIÁRIAS */}
          {activeReport === 'DAILY_DETAIL' && selectedDailySalesDetail && (
            <div className="space-y-6">
              <div className="border-b pb-2">
                <h3 className="text-sm font-black uppercase text-slate-800">Relatório de Vendas Diárias Detalhado</h3>
                <p className="text-[10px] text-slate-600 font-bold mt-1">
                  Dia de Referência: {new Date(selectedDailySalesDetail.date + 'T00:00:00').toLocaleDateString('pt-AO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-[8px] uppercase font-black">
                    <th className="p-2 border">Hora</th>
                    <th className="p-2 border">Medicamento / Artigo Vendido</th>
                    <th className="p-2 border text-center">Quantidade</th>
                    <th className="p-2 border text-right">Preço Unitário</th>
                    <th className="p-2 border text-center">Forma Pagamento</th>
                    <th className="p-2 border text-right">Total Pago (Líquido)</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyItems.map((item, idx) => (
                    <tr key={idx} className="text-[9px] border-b">
                      <td className="p-2 border font-mono text-slate-500">{item.hour}</td>
                      <td className="p-2 border font-bold">
                        {item.productName}
                        {item.productCode && <span className="block text-[8px] text-slate-400 font-normal">Cód: {item.productCode}</span>}
                      </td>
                      <td className="p-2 border text-center font-bold">{item.quantity} un.</td>
                      <td className="p-2 border text-right">{item.unitPrice.toLocaleString()} Kz</td>
                      <td className="p-2 border text-center uppercase text-[8px] font-bold">{item.paymentMethod}</td>
                      <td className="p-2 border text-right font-black">{item.totalLine.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-8 pt-4">
                <div className="border p-3 space-y-2 rounded">
                  <p className="font-black text-[8px] uppercase text-slate-400 border-b pb-1">Divisão por Forma de Pagamento</p>
                  <div className="space-y-1 text-[9px]">
                    {Object.entries(dailyPaymentTotals).map(([method, val]) => (
                      <div key={method} className="flex justify-between">
                        <span className="font-bold text-slate-600 uppercase">{method}:</span>
                        <span className="font-black">{val.toLocaleString()} Kz</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-right flex flex-col justify-end space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Total Geral do Dia</p>
                  <p className="text-xl font-black text-slate-900 border-t border-black pt-1">
                    {dailyTotalNet.toLocaleString()} Kz
                  </p>
                  <p className="text-[8px] text-slate-500 italic">Total líquido consolidado de faturas emitidas.</p>
                </div>
              </div>

              <div className="text-center text-[8px] text-slate-500 border-t pt-4">
                <p className="font-bold">Processado por programa validado nº 00/AGT/2026 PharmaGest</p>
                <p>Os bens/serviços foram colocados à disposição do adquirente na data e local do documento.</p>
              </div>
            </div>
          )}

          {/* REPORT A4: DETALHES DE VENDAS MENSAIS */}
          {activeReport === 'MONTHLY_DETAIL' && selectedMonthlySalesDetail && (
            <div className="space-y-6">
              <div className="border-b pb-2">
                <h3 className="text-sm font-black uppercase text-slate-800">Relatório de Vendas Mensais Detalhado</h3>
                <p className="text-[10px] text-slate-600 font-bold mt-1">
                  Mês de Referência: {new Date(selectedMonthlySalesDetail.month + '-02').toLocaleDateString('pt-AO', { year: 'numeric', month: 'long' })}
                </p>
              </div>

              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-[8px] uppercase font-black">
                    <th className="p-2 border">Data</th>
                    <th className="p-2 border text-center">Faturas Ativas</th>
                    <th className="p-2 border text-center">Medicamentos Vendidos</th>
                    <th className="p-2 border">Total por Forma de Pagamento</th>
                    <th className="p-2 border text-right">Total Líquido do Dia</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyDaysList.map((day, idx) => (
                    <tr key={idx} className="text-[9px] border-b">
                      <td className="p-2 border font-bold">
                        {new Date(day.date + 'T00:00:00').toLocaleDateString('pt-AO', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </td>
                      <td className="p-2 border text-center">{day.invoiceCount} faturas</td>
                      <td className="p-2 border text-center font-bold">{day.productCount} un.</td>
                      <td className="p-2 border">
                        <div className="flex flex-col gap-0.5">
                          {Object.entries(day.paymentTotals).map(([method, val]) => (
                            <span key={method} className="text-[8px] font-semibold text-slate-600 uppercase">
                              {method}: {val.toLocaleString()} Kz
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 border text-right font-black">{day.totalNet.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-right flex flex-col items-end space-y-1 pt-4">
                <p className="text-[8px] font-black text-slate-400 uppercase">Total Geral do Mês</p>
                <p className="text-xl font-black text-slate-900 border-t border-black pt-1">
                  {monthlyTotalNet.toLocaleString()} Kz
                </p>
                <p className="text-[8px] text-slate-500 italic">Consolidação de todas as faturas emitidas neste mês.</p>
              </div>

              <div className="text-center text-[8px] text-slate-500 border-t pt-4">
                <p className="font-bold">Processado por programa validado nº 00/AGT/2026 PharmaGest</p>
                <p>Os bens/serviços foram colocados à disposição do adquirente na data e local do documento.</p>
              </div>
            </div>
          )}

          {/* REPORT A4: DETALHES DE VENDAS ANUAIS */}
          {activeReport === 'YEARLY_DETAIL' && selectedYearlySalesDetail && (
            <div className="space-y-6">
              <div className="border-b pb-2">
                <h3 className="text-sm font-black uppercase text-slate-800">Relatório de Vendas Anuais Detalhado</h3>
                <p className="text-[10px] text-slate-600 font-bold mt-1">
                  Ano Civil de Referência: {selectedYearlySalesDetail.year}
                </p>
              </div>

              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-[8px] uppercase font-black">
                    <th className="p-2 border">Mês</th>
                    <th className="p-2 border text-center">Faturas Ativas</th>
                    <th className="p-2 border text-center">Medicamentos Vendidos</th>
                    <th className="p-2 border">Total por Forma de Pagamento</th>
                    <th className="p-2 border text-right">Total Líquido do Mês</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyMonthsList.map((m, idx) => (
                    <tr key={idx} className="text-[9px] border-b">
                      <td className="p-2 border font-bold uppercase">
                        {new Date(m.month + '-02').toLocaleDateString('pt-AO', { year: 'numeric', month: 'long' })}
                      </td>
                      <td className="p-2 border text-center">{m.invoiceCount} faturas</td>
                      <td className="p-2 border text-center font-bold">{m.productCount} un.</td>
                      <td className="p-2 border">
                        <div className="flex flex-col gap-0.5">
                          {Object.entries(m.paymentTotals).map(([method, val]) => (
                            <span key={method} className="text-[8px] font-semibold text-slate-600 uppercase">
                              {method}: {val.toLocaleString()} Kz
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 border text-right font-black">{m.totalNet.toLocaleString()} Kz</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-right flex flex-col items-end space-y-1 pt-4">
                <p className="text-[8px] font-black text-slate-400 uppercase">Total Geral do Ano Civil</p>
                <p className="text-xl font-black text-slate-900 border-t border-black pt-1">
                  {yearlyTotalNet.toLocaleString()} Kz
                </p>
                <p className="text-[8px] text-slate-500 italic">Consolidação anual completa de faturas emitidas.</p>
              </div>

              <div className="text-center text-[8px] text-slate-500 border-t pt-4">
                <p className="font-bold">Processado por programa validado nº 00/AGT/2026 PharmaGest</p>
                <p>Os bens/serviços foram colocados à disposição do adquirente na data e local do documento.</p>
              </div>
            </div>
          )}

          {/* REPORT A4: RELATÓRIO MAIS E MENOS */}
          {activeReport === 'MOST_LEAST' && (
            <div className="space-y-6">
              <div className="border-b pb-2">
                <h3 className="text-sm font-black uppercase text-slate-800">Relatório Mais e Menos</h3>
                <p className="text-[10px] text-slate-600 font-bold mt-1">
                  Ordenação de produtos por volume decrescente de vendas (Exercício Fiscal: {selectedYear})
                </p>
              </div>

              <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[8px] uppercase font-black">
                    <th className="p-2 border text-center w-12">Pos.</th>
                    <th className="p-2 border">Código</th>
                    <th className="p-2 border">Nome do Medicamento</th>
                    <th className="p-2 border">Categoria</th>
                    <th className="p-2 border">Forma Farmacêutica</th>
                    <th className="p-2 border text-right">Qtd. Vendida</th>
                  </tr>
                </thead>
                <tbody>
                  {mostToLeastProductsList.map((item, idx) => (
                    <tr key={item.product.id} className="text-[9px] border-b">
                      <td className="p-2 border text-center font-bold">#{idx + 1}</td>
                      <td className="p-2 border font-mono">{item.product.code}</td>
                      <td className="p-2 border font-bold text-slate-900">{item.product.name}</td>
                      <td className="p-2 border text-slate-700">{item.product.category}</td>
                      <td className="p-2 border text-[8px] uppercase font-semibold text-slate-600">{item.product.type || 'N/A'}</td>
                      <td className="p-2 border text-right font-black text-black">{item.soldQuantity} un.</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-center text-[8px] text-slate-500 border-t pt-4">
                <p className="font-bold">Processado por programa validado nº 00/AGT/2026 PharmaGest</p>
                <p>Os bens/serviços foram colocados à disposição do adquirente na data e local do documento.</p>
              </div>
            </div>
          )}

          {/* Legal Document Signatures */}
          <div className="mt-12 pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 text-[10px] text-center">
            <div>
              <p className="font-black uppercase text-slate-400">Responsável pela Emissão</p>
              <div className="h-10 border-b border-black w-2/3 mx-auto mt-4"></div>
              <p className="text-[8px] text-slate-500 mt-1">PharmaGest Assinatura Digital</p>
            </div>
            <div>
              <p className="font-black uppercase text-slate-400">Data e Assinatura do Diretor</p>
              <div className="h-10 border-b border-black w-2/3 mx-auto mt-4"></div>
              <p className="text-[8px] text-slate-500 mt-1">Visto Técnico</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
