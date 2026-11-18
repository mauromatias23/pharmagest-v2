import { Invoice, InvoiceItem, InvoiceStatus } from '../types';

export const ANGOLA_TIMEZONE = 'Africa/Luanda';

export type PaymentBucket = 'CASH' | 'TPA' | 'TRANSFER' | 'MIXED';

export function roundMoney(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Classifica qualquer variante textual de método de pagamento num balde canónico único,
 * garantindo que Multicaixa / TPA / Cartão e Dinheiro / Numerário nunca sejam omitidos.
 */
export function classifyPaymentMethod(method?: string): PaymentBucket {
  const normalized = (method || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (
    normalized.includes('multicaixa') ||
    normalized.includes('tpa') ||
    normalized.includes('cartao') ||
    normalized.includes('card') ||
    normalized.includes('pos')
  ) {
    return 'TPA';
  }

  if (normalized.includes('transfer')) {
    return 'TRANSFER';
  }

  if (normalized.includes('misto') || normalized.includes('mixed')) {
    return 'MIXED';
  }

  return 'CASH';
}

export function getCanonicalPaymentLabel(method?: string): string {
  const bucket = classifyPaymentMethod(method);
  switch (bucket) {
    case 'TPA':
      return 'Multicaixa (TPA)';
    case 'TRANSFER':
      return 'Transferência';
    case 'MIXED':
      return 'Misto';
    case 'CASH':
    default:
      return 'Dinheiro';
  }
}

export function summarizeInvoicesByPayment(
  invoices: Array<Pick<Invoice, 'paymentMethod' | 'totalNet' | 'status'>>,
  includeCancelled: boolean = false
): { cash: number; tpa: number; transfer: number; mixed: number; total: number } {
  let cash = 0;
  let tpa = 0;
  let transfer = 0;
  let mixed = 0;

  for (const inv of invoices) {
    if (!includeCancelled && inv.status === InvoiceStatus.CANCELLED) continue;
    const net = roundMoney(inv.totalNet);
    const bucket = classifyPaymentMethod(inv.paymentMethod);
    if (bucket === 'CASH') cash += net;
    else if (bucket === 'TPA') tpa += net;
    else if (bucket === 'TRANSFER') transfer += net;
    else mixed += net;
  }

  cash = roundMoney(cash);
  tpa = roundMoney(tpa);
  transfer = roundMoney(transfer);
  mixed = roundMoney(mixed);
  const total = roundMoney(cash + tpa + transfer + mixed);

  return { cash, tpa, transfer, mixed, total };
}

/**
 * Converte qualquer data ou timestamp ISO para a data civil YYYY-MM-DD em Angola (Africa/Luanda, UTC+1).
 * Datas já no formato simples YYYY-MM-DD são preservadas exatamente sem deslocamento de fuso.
 */
export function getAngolaDateKey(dateInput?: string | Date): string {
  if (!dateInput) {
    return getAngolaDateKey(new Date());
  }

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    if (typeof dateInput === 'string' && dateInput.length >= 10) {
      return dateInput.slice(0, 10);
    }
    return '';
  }

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ANGOLA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);

    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback para UTC+1 manual
  }

  const angolaMs = d.getTime() + 60 * 60 * 1000;
  return new Date(angolaMs).toISOString().slice(0, 10);
}

export function getTodayAngolaDateKey(): string {
  return getAngolaDateKey(new Date());
}

export function getAngolaMonthKey(dateInput?: string | Date): string {
  const key = getAngolaDateKey(dateInput);
  return key.length >= 7 ? key.slice(0, 7) : '';
}

export function getAngolaYear(dateInput?: string | Date): number {
  const key = getAngolaDateKey(dateInput);
  const year = parseInt(key.slice(0, 4), 10);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

export function isSameAngolaDay(dateStr?: string, refDateKey?: string): boolean {
  if (!dateStr) return false;
  const target = refDateKey ? getAngolaDateKey(refDateKey) : getTodayAngolaDateKey();
  return getAngolaDateKey(dateStr) === target;
}

export function formatAngolaTime(dateInput?: string | Date, withSeconds: boolean = false): string {
  if (!dateInput) return 'N/D';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return 'N/D';
  try {
    return d.toLocaleTimeString('pt-AO', {
      timeZone: ANGOLA_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {})
    });
  } catch {
    return d.toLocaleTimeString('pt-AO', {
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {})
    });
  }
}

export function formatAngolaDateTime(dateInput?: string | Date): string {
  if (!dateInput) return 'N/D';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  try {
    return d.toLocaleString('pt-AO', { timeZone: ANGOLA_TIMEZONE });
  } catch {
    return d.toLocaleString('pt-AO');
  }
}

export function calculateItemTotals(quantity: number, unitPrice: number, hasVAT: boolean, vatRate: number): {
  subtotal: number;
  vatAmount: number;
  lineTotal: number;
} {
  const qty = Math.max(0, Number(quantity) || 0);
  const price = Math.max(0, Number(unitPrice) || 0);
  const subtotal = roundMoney(qty * price);
  const vatAmount = hasVAT ? roundMoney(subtotal * vatRate) : 0;
  const lineTotal = roundMoney(subtotal + vatAmount);
  return { subtotal, vatAmount, lineTotal };
}

export function calculateInvoiceTotalsFromItems(
  items: Array<Pick<InvoiceItem, 'quantity' | 'unitPrice' | 'subtotal' | 'vatAmount'>>
): { totalGross: number; totalVAT: number; totalNet: number } {
  let totalGross = 0;
  let totalVAT = 0;

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const subtotal = item.subtotal !== undefined ? roundMoney(item.subtotal) : roundMoney(qty * unitPrice);
    const vatAmount = roundMoney(item.vatAmount);
    totalGross += subtotal;
    totalVAT += vatAmount;
  }

  totalGross = roundMoney(totalGross);
  totalVAT = roundMoney(totalVAT);
  const totalNet = roundMoney(totalGross + totalVAT);
  return { totalGross, totalVAT, totalNet };
}
