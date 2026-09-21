
import Dexie, { type Table } from 'dexie';
import { User, Product, Batch, Invoice } from '../types';
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

/**
 * PharmaDatabase handles local storage via IndexedDB (Dexie).
 */
export class PharmaDatabase extends Dexie {
  // Use '!' to tell TypeScript these will be initialized by Dexie
  users!: Table<User, string>;
  products!: Table<Product, string>;
  batches!: Table<Batch, string>;
  invoices!: Table<Invoice & { synchronized?: boolean }, string>;
  dailyClosures!: Table<DailyClosure, string>;
  deletedRecords!: Table<DeletedRecord, string>;

  constructor() {
    super('PharmaGestDB');
    
    // Explicitly defining the schema for the database.
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
  }

  async populate() {
    // Garante que existem sempre utilizadores base caso a tabela local esteja vazia
    try {
      const userCount = await this.users.count();
      if (userCount === 0) {
        await this.users.bulkAdd(INITIAL_USERS);
      }
    } catch (err) {
      console.warn('[db.populate Warning]', err);
    }
  }
}

export const db = new PharmaDatabase();
