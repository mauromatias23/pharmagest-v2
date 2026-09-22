
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

export interface Device {
  deviceId: string;
  name: string;
  lastSeen: string;
  createdAt: string;
}

export enum SyncOperationType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CANCEL = 'CANCEL',
  RESTORE = 'RESTORE',
  STOCK_IN = 'STOCK_IN',
  STOCK_OUT = 'STOCK_OUT'
}

export enum SyncOperationStatus {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  CONFLICT = 'CONFLICT'
}

export interface SyncOperation {
  id?: number;
  operationId: string;
  deviceId: string;
  userId?: string;
  entityType: 'INVOICE' | 'DAILY_CLOSURE' | 'PRODUCT' | 'BATCH' | 'STOCK_MOVEMENT' | 'PURCHASE' | 'EXPENSE' | 'USER';
  entityId: string;
  operationType: SyncOperationType;
  payload: any;
  createdAt: string;
  updatedAt?: string;
  status: SyncOperationStatus;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
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
  costPriceHistorical?: number;
  totalCostHistorical?: number;
  profitMargin?: number;
}

export enum InvoiceStatus {
  ISSUED = 'Emitida',
  CANCELLED = 'Anulada'
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  operationId?: string;
  deviceId?: string;
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
  totalCostCMV?: number;
  isRetroactive?: boolean;
  retroactiveType?: 'RETROATIVA' | 'RECUPERADA' | string;
  createdAt?: string;
  originalSaleDate?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  cancellationOperationId?: string;
}

export enum StockMovementType {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
  AJUSTE = 'AJUSTE',
  DEVOLUCAO = 'DEVOLUCAO',
  PERDA = 'PERDA',
  VENCIMENTO = 'VENCIMENTO',
  COMPRA = 'COMPRA',
  VENDA = 'VENDA',
  CANCELAMENTO_VENDA = 'CANCELAMENTO_VENDA'
}

export interface StockMovement {
  id: string;
  operationId: string;
  deviceId: string;
  productId: string;
  batchId: string;
  type: StockMovementType | 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'DEVOLUCAO' | 'PERDA' | 'VENCIMENTO' | 'COMPRA' | 'VENDA';
  quantity: number;
  reference: string;
  referenceId?: string;
  date: string;
  userId: string;
  userName?: string;
  reason?: string;
  unitCost?: number;
  totalCost?: number;
  createdAt?: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface Purchase {
  id: string;
  operationId: string;
  deviceId: string;
  supplier: string;
  documentNumber: string;
  date: string;
  paymentMethod: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  status: 'COMPLETED' | 'CANCELLED';
  notes?: string;
  userId: string;
  userName?: string;
  items: PurchaseItem[];
  createdAt: string;
}

export type ExpenseCategory = 
  | 'Salários'
  | 'Compra de medicamentos'
  | 'Energia'
  | 'Água'
  | 'Internet'
  | 'Transporte'
  | 'Renda/aluguer'
  | 'Material de escritório'
  | 'Manutenção'
  | 'Impostos/taxas'
  | 'Limpeza'
  | 'Equipamentos'
  | 'Outros';

export interface Expense {
  id: string;
  operationId: string;
  deviceId: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: string;
  responsible?: string;
  notes?: string;
  reference?: string; // Documento/Referência
  userId: string;
  userName?: string;
  status: 'ACTIVE' | 'CANCELLED';
  synchronized?: boolean;
  createdAt: string;
}

export interface OtherIncome {
  id: string;
  operationId: string;
  deviceId: string;
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
  status: 'ACTIVE' | 'CANCELLED';
  synchronized?: boolean;
  createdAt: string;
}
