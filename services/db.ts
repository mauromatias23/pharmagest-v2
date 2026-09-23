
import Dexie, { type Table } from 'dexie';
import { User, Product, Batch, Invoice, SyncOperation, StockMovement, Purchase, PurchaseItem, Expense, OtherIncome } from '../types';
import { INITIAL_USERS } from './mockData';
import { isSupabaseConfigured } from './supabaseClient';

export interface ShiftBreakdown {
  shiftNumber: number;
  shiftName: string;
  userId?: string;
  userName: string;
  totalCash: number;
  totalTpa: number;
  totalTransfer: number;
  totalMixed: number;
  totalInvoices: number;
  grandTotal: number;
  closedAt: string;
}

export interface DailyClosure {
  id: string;
  operationId?: string;
  deviceId?: string;
  date: string;
  userId: string;
  userName: string;
  type?: 'SHIFT' | 'GENERAL';
  shiftNumber?: number;
  shiftName?: string;
  totalCash: number;
  totalTpa: number;
  totalTransfer: number;
  totalMixed: number;
  totalInvoices: number;
  grandTotal: number;
  timestamp: string;
  shiftBreakdowns?: ShiftBreakdown[];
  synchronized?: boolean;
}

export interface DeletedRecord {
  id: string;
  table: string;
  timestamp: number;
}

export interface AppSetting {
  key: string;
  value: any;
  updatedAt: string;
}

/**
 * PharmaDatabase handles local storage via IndexedDB (Dexie).
 */
export class PharmaDatabase extends Dexie {
  users!: Table<User, string>;
  products!: Table<Product, string>;
  batches!: Table<Batch, string>;
  invoices!: Table<Invoice & { synchronized?: boolean }, string>;
  dailyClosures!: Table<DailyClosure, string>;
  deletedRecords!: Table<DeletedRecord, string>;
  syncQueue!: Table<SyncOperation, number>;
  stockMovements!: Table<StockMovement, string>;
  purchases!: Table<Purchase, string>;
  purchaseItems!: Table<PurchaseItem, string>;
  expenses!: Table<Expense, string>;
  otherIncomes!: Table<OtherIncome, string>;
  appSettings!: Table<AppSetting, string>;

  constructor() {
    super('PharmaGestDB');
    
    // Explicitly defining progressive non-destructive schema versions
    this.version(6).stores({
      users: 'id, name, role',
      products: 'id, code, name, category',
      batches: 'id, productId, lotNumber, expiryDate',
      invoices: 'id, invoiceNumber, date, customerNif, synchronized',
      dailyClosures: 'id, date, userId, synchronized'
    });

    this.version(7).stores({
      users: 'id, name, role',
      products: 'id, code, name, category',
      batches: 'id, productId, lotNumber, expiryDate',
      invoices: 'id, invoiceNumber, date, customerNif, synchronized',
      dailyClosures: 'id, date, userId, synchronized',
      deletedRecords: 'id, table, timestamp'
    });

    this.version(8).stores({
      users: 'id, name, role',
      products: 'id, code, name, category',
      batches: 'id, productId, lotNumber, expiryDate',
      invoices: 'id, invoiceNumber, date, customerNif, closed, closureId, synchronized',
      dailyClosures: 'id, date, userId, synchronized',
      deletedRecords: 'id, table, timestamp'
    });

    this.version(9).stores({
      users: 'id, name, role',
      products: 'id, code, name, category',
      batches: 'id, productId, lotNumber, expiryDate',
      invoices: 'id, invoiceNumber, date, customerNif, closed, closureId, shiftNumber, synchronized',
      dailyClosures: 'id, date, userId, type, shiftNumber, synchronized',
      deletedRecords: 'id, table, timestamp'
    });

    // Version 95: Offline-First queue, stock movements, expenses, purchases, idempotency
    this.version(95).stores({
      users: 'id, name, role',
      products: 'id, code, name, category',
      batches: 'id, productId, lotNumber, expiryDate',
      invoices: 'id, invoiceNumber, date, customerNif, closed, closureId, shiftNumber, synchronized, operationId, deviceId',
      dailyClosures: 'id, date, userId, type, shiftNumber, synchronized, operationId, deviceId',
      deletedRecords: 'id, table, timestamp',
      syncQueue: '++id, operationId, deviceId, entityType, entityId, operationType, status, createdAt',
      stockMovements: 'id, operationId, deviceId, productId, batchId, type, date, referenceId',
      purchases: 'id, operationId, deviceId, date, status, supplier',
      purchaseItems: 'id, purchaseId, productId, batchId',
      expenses: 'id, operationId, deviceId, date, category, status',
      appSettings: 'key'
    });

    // Version 96: Add otherIncomes for complete financial flow (Entradas / Saídas)
    this.version(96).stores({
      users: 'id, name, role',
      products: 'id, code, name, category',
      batches: 'id, productId, lotNumber, expiryDate',
      invoices: 'id, invoiceNumber, date, customerNif, closed, closureId, shiftNumber, synchronized, operationId, deviceId',
      dailyClosures: 'id, date, userId, type, shiftNumber, synchronized, operationId, deviceId',
      deletedRecords: 'id, table, timestamp',
      syncQueue: '++id, operationId, deviceId, entityType, entityId, operationType, status, createdAt',
      stockMovements: 'id, operationId, deviceId, productId, batchId, type, date, referenceId',
      purchases: 'id, operationId, deviceId, date, status, supplier',
      purchaseItems: 'id, purchaseId, productId, batchId',
      expenses: 'id, operationId, deviceId, date, category, status, synchronized',
      otherIncomes: 'id, operationId, deviceId, date, category, status, synchronized',
      appSettings: 'key'
    });
  }

  async populate() {
    // Garante que existem sempre utilizadores base caso a tabela local esteja vazia
    try {
      const userCount = await this.users.count();
      if (userCount === 0) {
        await this.users.bulkAdd(INITIAL_USERS);
      } else {
        // Assegurar que nenhum utilizador fica sem senha válida ou com valor nulo
        const allUsers = await this.users.toArray();
        for (const u of allUsers) {
          const pass = (u.password && String(u.password).trim() !== '') ? String(u.password).trim() : null;
          if (!pass) {
            const norm = (u.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            let defaultPass = 'admin123';
            if (u.role === UserRole.ADMIN || norm.includes('admin') || u.id === 'u-admin') {
              defaultPass = '1111';
            } else if (norm.includes('1') || u.id === 'u-f1') {
              defaultPass = '2222';
            } else if (norm.includes('2') || u.id === 'u-f2') {
              defaultPass = '3333';
            }
            await this.users.update(u.id, { password: defaultPass, active: true });
          }
        }

        // Garante que existe pelo menos uma conta de Administrador
        const hasAdmin = (await this.users.toArray()).some(u => u.role === UserRole.ADMIN);
        if (!hasAdmin) {
          await this.users.put({ id: 'u-admin', name: 'Administrador', role: UserRole.ADMIN, active: true, password: '1111' });
        }
      }
    } catch (err) {
      console.warn('[db.populate Warning]', err);
    }
  }
}

export const db = new PharmaDatabase();
