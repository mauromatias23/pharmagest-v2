
export enum UserRole {
  ADMIN = 'Administrador',
  PHARMACIST = 'Farmacêutico',
  CASHIER = 'Operador de Caixa'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  password?: string;
}

export enum ProductPriceType {
  FREE = 'Livre',
  CAPPED = 'Tabelado'
}

export interface Batch {
  id: string;
  productId: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  entryDate: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  activeIngredient: string;
  category: string;
  type: string;
  priceType: ProductPriceType;
  costPrice: number;
  sellPrice: number;
  hasVAT: boolean;
  supplier: string;
  minStock: number;
  totalQuantity: number;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  nif: string;
  type: 'Individual' | 'Institucional';
  contact: string;
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  batchId: string;
  lotNumber: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  vatAmount: number;
}

export enum InvoiceStatus {
  ISSUED = 'Emitida',
  CANCELLED = 'Anulada'
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  customerNif?: string;
  userId: string;
  userName: string;
  date: string;
  totalGross: number;
  totalVAT: number;
  totalNet: number;
  status: InvoiceStatus;
  paymentMethod: string;
  items: InvoiceItem[];
  closed?: boolean;
  closureId?: string;
  closedAt?: string;
  shiftNumber?: number;
  shiftName?: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  batchId: string;
  type: 'ENTRADA' | 'SAIDA' | 'AJUSTE';
  quantity: number;
  reference: string;
  date: string;
  userId: string;
}
