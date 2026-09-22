import { db } from './db';
import { 
  Invoice, 
  InvoiceItem, 
  InvoiceStatus, 
  StockMovement, 
  StockMovementType, 
  SyncOperationType, 
  SyncOperationStatus 
} from '../types';
import { DeviceService } from './deviceService';
import { SyncService } from './syncService';

export interface CartItemInput {
  product: {
    id: string;
    name: string;
    sellPrice: number;
    costPrice?: number;
    hasVAT?: boolean;
    totalQuantity: number;
  };
  quantity: number;
  batches: Array<{
    batch: {
      id: string;
      lotNumber: string;
      expiryDate: string;
      quantity: number;
      entryDate?: string;
    };
    quantityToTake: number;
  }>;
}

export interface CreateSaleInput {
  invoiceId?: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  customerNif?: string;
  userId: string;
  userName: string;
  paymentMethod: string;
  shiftNumber?: number;
  shiftName?: string;
  items: (CartItemInput | InvoiceItem)[] | any[];
  date?: string;
  createdAt?: string;
  isRetroactive?: boolean;
  retroactiveType?: string;
  originalSaleDate?: string;
}

export class SaleService {
  /**
   * Finalizes a sale using a single atomic Dexie transaction.
   * Completely offline-first, finishes in < 50ms without waiting for Supabase.
   */
  static async completeSale(input: CreateSaleInput): Promise<{ success: boolean; invoice: Invoice; message?: string }> {
    const operationId = DeviceService.generateOperationId();
    const deviceId = DeviceService.getDeviceId();
    const invoiceId = input.invoiceId || operationId;
    const nowIso = input.date || new Date().toISOString();

    const flattenedItems: InvoiceItem[] = [];
    const stockMovementsToCreate: StockMovement[] = [];
    const batchUpdates: Array<{ id: string; newQty: number }> = [];
    const productDeltas: Record<string, number> = {};

    let totalGross = 0;
    let totalVAT = 0;
    let totalCostCMV = 0;

    // Check if input.items contains InvoiceItem objects directly
    const isDirectInvoiceItems = Array.isArray(input.items) && input.items.length > 0 && ('productId' in input.items[0]);

    if (isDirectInvoiceItems) {
      for (const rawItem of (input.items as InvoiceItem[])) {
        const qty = Number(rawItem.quantity) || 0;
        if (qty <= 0) continue;

        const unitPrice = Number(rawItem.unitPrice) || 0;
        const subtotal = rawItem.subtotal ?? (unitPrice * qty);
        const vatAmount = rawItem.vatAmount ?? 0;
        const costPriceHist = rawItem.costPriceHistorical ?? 0;
        const totalCostHist = rawItem.totalCostHistorical ?? (costPriceHist * qty);

        totalGross += (subtotal - vatAmount);
        totalVAT += vatAmount;
        totalCostCMV += totalCostHist;

        flattenedItems.push(rawItem);

        // Track stock movement for audit
        stockMovementsToCreate.push({
          id: DeviceService.generateOperationId(),
          operationId,
          deviceId,
          productId: rawItem.productId,
          batchId: rawItem.batchId,
          type: StockMovementType.VENDA,
          quantity: qty,
          reference: `Venda ${input.invoiceNumber}`,
          referenceId: invoiceId,
          date: nowIso,
          userId: input.userId,
          userName: input.userName,
          unitCost: costPriceHist,
          totalCost: totalCostHist,
          createdAt: input.createdAt || nowIso
        });

        if (rawItem.batchId) {
          const currentBatch = await db.batches.get(rawItem.batchId);
          if (currentBatch) {
            batchUpdates.push({
              id: rawItem.batchId,
              newQty: Math.max(0, (currentBatch.quantity || 0) - qty)
            });
          }
        }

        productDeltas[rawItem.productId] = (productDeltas[rawItem.productId] || 0) + qty;
      }
    } else {
      // 1. Process cart items and apportion batches
      for (const item of (input.items as CartItemInput[])) {
        const p = item.product;
        if (!p) continue;
        const unitPrice = p.sellPrice;
        const vatRate = p.hasVAT ? 0.14 : 0;

        for (const bAlloc of (item.batches || [])) {
          if (bAlloc.quantityToTake <= 0) continue;
          const b = bAlloc.batch;
          const qty = bAlloc.quantityToTake;
          const subtotal = unitPrice * qty;
          const vatAmount = subtotal * (vatRate / (1 + vatRate));
          const costPriceHist = p.costPrice || 0;
          const totalCostHist = costPriceHist * qty;

          totalGross += (subtotal - vatAmount);
          totalVAT += vatAmount;
          totalCostCMV += totalCostHist;

          const itemId = `${invoiceId}_${b.id}_${flattenedItems.length}`;
          flattenedItems.push({
            id: itemId,
            productId: p.id,
            productName: p.name,
            batchId: b.id,
            lotNumber: b.lotNumber,
            quantity: qty,
            unitPrice: unitPrice,
            subtotal: subtotal,
            vatAmount: vatAmount,
            costPriceHistorical: costPriceHist,
            totalCostHistorical: totalCostHist,
            profitMargin: subtotal > 0 ? ((subtotal - totalCostHist) / subtotal) * 100 : 0
          });

          // Track stock movement for audit
          stockMovementsToCreate.push({
            id: DeviceService.generateOperationId(),
            operationId,
            deviceId,
            productId: p.id,
            batchId: b.id,
            type: StockMovementType.VENDA,
            quantity: qty,
            reference: `Venda ${input.invoiceNumber}`,
            referenceId: invoiceId,
            date: nowIso,
            userId: input.userId,
            userName: input.userName,
            unitCost: costPriceHist,
            totalCost: totalCostHist,
            createdAt: input.createdAt || nowIso
          });

          batchUpdates.push({
            id: b.id,
            newQty: Math.max(0, (b.quantity || 0) - qty)
          });

          productDeltas[p.id] = (productDeltas[p.id] || 0) + qty;
        }
      }
    }

    const totalNet = totalGross + totalVAT;

    const newInvoice: Invoice & { synchronized?: boolean } = {
      id: invoiceId,
      invoiceNumber: input.invoiceNumber,
      operationId,
      deviceId,
      customerId: input.customerId,
      customerName: input.customerName || 'Consumidor Final',
      customerNif: input.customerNif || 'Consumidor Final',
      userId: input.userId,
      userName: input.userName,
      date: nowIso,
      createdAt: input.createdAt || new Date().toISOString(),
      isRetroactive: input.isRetroactive || false,
      retroactiveType: input.retroactiveType || (input.isRetroactive ? 'RETROATIVA / RECUPERADA' : undefined),
      originalSaleDate: input.originalSaleDate || nowIso,
      totalGross,
      totalVAT,
      totalNet,
      totalCostCMV,
      status: InvoiceStatus.ISSUED,
      paymentMethod: input.paymentMethod,
      items: flattenedItems,
      shiftNumber: input.shiftNumber,
      shiftName: input.shiftName,
      closed: false,
      synchronized: false
    };

    // 2. Execute Atomic Dexie Transaction
    await db.transaction('rw', [db.invoices, db.batches, db.products, db.stockMovements, db.syncQueue], async () => {
      // a) Save invoice
      await db.invoices.put(newInvoice);

      // b) Update batches
      for (const bu of batchUpdates) {
        await db.batches.update(bu.id, { quantity: bu.newQty });
      }

      // c) Update products total quantity
      for (const [prodId, qtySub] of Object.entries(productDeltas)) {
        const existingProd = await db.products.get(prodId);
        if (existingProd) {
          const updatedQty = Math.max(0, (existingProd.totalQuantity || 0) - qtySub);
          await db.products.update(prodId, { totalQuantity: updatedQty });
        }
      }

      // d) Record audit stock movements
      if (stockMovementsToCreate.length > 0) {
        await db.stockMovements.bulkPut(stockMovementsToCreate);
      }

      // e) Add to syncQueue
      await db.syncQueue.add({
        operationId,
        deviceId,
        userId: input.userId,
        entityType: 'INVOICE',
        entityId: invoiceId,
        operationType: SyncOperationType.CREATE,
        payload: newInvoice,
        createdAt: nowIso,
        status: SyncOperationStatus.PENDING,
        attempts: 0
      });
    });

    // 3. Broadcast local change to other tabs
    SyncService.broadcastLocalChange();

    // 4. Trigger non-blocking background push to Supabase
    setTimeout(() => {
      SyncService.processQueue().catch(err => {
        console.warn('[SaleService] Background sync warning:', err?.message || err);
      });
    }, 100);

    return {
      success: true,
      invoice: newInvoice,
      message: 'Venda registada com sucesso localmente.'
    };
  }

  /**
   * Idempotent cancellation of an invoice.
   * Restores exact quantities to original batches, creates audit movements, and enqueues CANCEL operation.
   */
  static async cancelInvoice(
    invoiceId: string, 
    userId: string, 
    userName: string, 
    reason: string = 'Anulação solicitada'
  ): Promise<{ success: boolean; message: string }> {
    const existing = await db.invoices.get(invoiceId);
    if (!existing) {
      return { success: false, message: 'Fatura não encontrada.' };
    }

    if (existing.status === InvoiceStatus.CANCELLED) {
      return { success: true, message: 'Esta fatura já se encontra anulada.' };
    }

    const cancelOpId = DeviceService.generateOperationId();
    const deviceId = DeviceService.getDeviceId();
    const nowIso = new Date().toISOString();

    const movementsToCreate: StockMovement[] = [];

    await db.transaction('rw', [db.invoices, db.batches, db.products, db.stockMovements, db.syncQueue], async () => {
      // 1. Mark invoice as CANCELLED
      await db.invoices.update(invoiceId, {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: nowIso,
        cancelledBy: userName,
        cancellationReason: reason,
        cancellationOperationId: cancelOpId,
        synchronized: false
      });

      // 2. Restore stock for each item
      const productDeltas: Record<string, number> = {};
      for (const item of (existing.items || [])) {
        if (!item.batchId || item.quantity <= 0) continue;

        // Restore to batch
        const batch = await db.batches.get(item.batchId);
        if (batch) {
          await db.batches.update(item.batchId, {
            quantity: (batch.quantity || 0) + item.quantity
          });
        }

        productDeltas[item.productId] = (productDeltas[item.productId] || 0) + item.quantity;

        // Create return stock movement
        movementsToCreate.push({
          id: DeviceService.generateOperationId(),
          operationId: cancelOpId,
          deviceId,
          productId: item.productId,
          batchId: item.batchId,
          type: StockMovementType.CANCELAMENTO_VENDA,
          quantity: item.quantity,
          reference: `Anulação da fatura ${existing.invoiceNumber}`,
          referenceId: invoiceId,
          date: nowIso,
          userId,
          userName,
          reason,
          unitCost: item.costPriceHistorical || 0,
          totalCost: (item.costPriceHistorical || 0) * item.quantity,
          createdAt: nowIso
        });
      }

      // Restore product totalQuantity
      for (const [prodId, qtyAdd] of Object.entries(productDeltas)) {
        const prod = await db.products.get(prodId);
        if (prod) {
          await db.products.update(prodId, {
            totalQuantity: (prod.totalQuantity || 0) + qtyAdd
          });
        }
      }

      if (movementsToCreate.length > 0) {
        await db.stockMovements.bulkPut(movementsToCreate);
      }

      // 3. Enqueue cancellation in syncQueue
      await db.syncQueue.add({
        operationId: cancelOpId,
        deviceId,
        userId,
        entityType: 'INVOICE',
        entityId: invoiceId,
        operationType: SyncOperationType.CANCEL,
        payload: {
          invoiceId,
          reason,
          cancelledBy: userName,
          cancelledAt: nowIso
        },
        createdAt: nowIso,
        status: SyncOperationStatus.PENDING,
        attempts: 0
      });
    });

    SyncService.broadcastLocalChange();

    setTimeout(() => {
      SyncService.processQueue().catch(console.warn);
    }, 100);

    return { success: true, message: 'Fatura anulada e stock devolvido com sucesso.' };
  }
}
