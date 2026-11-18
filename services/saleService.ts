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
import { VAT_RATE } from '../constants';
import {
  roundMoney,
  getCanonicalPaymentLabel,
  calculateItemTotals
} from '../utils/financeUtils';
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
  id?: string;
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
  closed?: boolean;
  closureId?: string;
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
    const invoiceId = input.invoiceId || input.id || operationId;

    // Guard de idempotência: se esta fatura já foi gravada localmente, nunca deduzir stock duas vezes
    const existingInvoice = await db.invoices.get(invoiceId);
    if (existingInvoice) {
      return {
        success: true,
        invoice: existingInvoice,
        message: 'Venda já registrada anteriormente.'
      };
    }

    const nowIso = input.date || new Date().toISOString();
    const canonicalPayment = getCanonicalPaymentLabel(input.paymentMethod);

    const flattenedItems: InvoiceItem[] = [];
    const stockMovementsToCreate: StockMovement[] = [];
    const batchDeltas: Record<string, number> = {};
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
        const subtotal = rawItem.subtotal !== undefined ? roundMoney(rawItem.subtotal) : roundMoney(unitPrice * qty);
        const vatAmount = rawItem.vatAmount !== undefined ? roundMoney(rawItem.vatAmount) : 0;
        const costPriceHist = Number(rawItem.costPriceHistorical) || 0;
        const totalCostHist = rawItem.totalCostHistorical !== undefined ? roundMoney(rawItem.totalCostHistorical) : roundMoney(costPriceHist * qty);

        // subtotal é a base tributável (sem IVA); totalNet = totalGross + totalVAT = soma(subtotal + vatAmount)
        totalGross += subtotal;
        totalVAT += vatAmount;
        totalCostCMV += totalCostHist;

        flattenedItems.push({
          ...rawItem,
          quantity: qty,
          unitPrice,
          subtotal,
          vatAmount
        });

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

        if (rawItem.batchId && !rawItem.batchId.startsWith('virtual-')) {
          batchDeltas[rawItem.batchId] = (batchDeltas[rawItem.batchId] || 0) + qty;
        }

        if (rawItem.productId) {
          productDeltas[rawItem.productId] = (productDeltas[rawItem.productId] || 0) + qty;
        }
      }
    } else {
      // 1. Process cart items and apportion batches
      for (const item of (input.items as CartItemInput[])) {
        const p = item.product;
        if (!p) continue;
        const unitPrice = Number(p.sellPrice) || 0;

        for (const bAlloc of (item.batches || [])) {
          if (bAlloc.quantityToTake <= 0) continue;
          const b = bAlloc.batch;
          const qty = Number(bAlloc.quantityToTake) || 0;
          const { subtotal, vatAmount } = calculateItemTotals(qty, unitPrice, p.hasVAT !== false, VAT_RATE);
          const costPriceHist = Number(p.costPrice) || 0;
          const totalCostHist = roundMoney(costPriceHist * qty);

          totalGross += subtotal;
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

          if (b.id && !b.id.startsWith('virtual-')) {
            batchDeltas[b.id] = (batchDeltas[b.id] || 0) + qty;
          }

          productDeltas[p.id] = (productDeltas[p.id] || 0) + qty;
        }
      }
    }

    totalGross = roundMoney(totalGross);
    totalVAT = roundMoney(totalVAT);
    totalCostCMV = roundMoney(totalCostCMV);
    const totalNet = roundMoney(totalGross + totalVAT);

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
      paymentMethod: canonicalPayment,
      items: flattenedItems,
      shiftNumber: input.shiftNumber,
      shiftName: input.shiftName,
      closed: Boolean(input.closed),
      closureId: input.closureId,
      synchronized: false
    };

    // 2. Execute Atomic Dexie Transaction
    await db.transaction('rw', [db.invoices, db.batches, db.products, db.stockMovements, db.syncQueue], async () => {
      // a) Save invoice
      await db.invoices.put(newInvoice);

      // b) Update batches atomically using accumulated deltas
      const updatedBatchIds: string[] = [];
      for (const [batchId, qtySub] of Object.entries(batchDeltas)) {
        const currentBatch = await db.batches.get(batchId);
        if (currentBatch) {
          const newQty = Math.max(0, (Number(currentBatch.quantity) || 0) - qtySub);
          await db.batches.update(batchId, { quantity: newQty });
          updatedBatchIds.push(batchId);
        }
      }

      // c) Update products total quantity from actual batches (source of truth)
      for (const [prodId, qtySub] of Object.entries(productDeltas)) {
        const existingProd = await db.products.get(prodId);
        if (existingProd) {
          const prodBatches = await db.batches.where('productId').equals(prodId).toArray();
          const updatedQty = prodBatches.length > 0
            ? Math.max(0, prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0))
            : Math.max(0, (Number(existingProd.totalQuantity) || 0) - qtySub);
          await db.products.update(prodId, { totalQuantity: updatedQty });
        }
      }

      // d) Record audit stock movements
      if (stockMovementsToCreate.length > 0) {
        await db.stockMovements.bulkPut(stockMovementsToCreate);
      }

      // e) Add to syncQueue (Fatura)
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

      // f) Add to syncQueue (Lotes atualizados pela venda para propagação na nuvem)
      for (const batchId of updatedBatchIds) {
        const batchObj = await db.batches.get(batchId);
        if (batchObj) {
          await db.syncQueue.add({
            operationId: DeviceService.generateOperationId(),
            deviceId,
            userId: input.userId,
            entityType: 'BATCH',
            entityId: batchId,
            operationType: SyncOperationType.UPDATE,
            payload: batchObj,
            createdAt: nowIso,
            status: SyncOperationStatus.PENDING,
            attempts: 0
          });
        }
      }

      // g) Add to syncQueue (Produtos com stock recalculado para a nuvem)
      for (const prodId of Object.keys(productDeltas)) {
        const prodObj = await db.products.get(prodId);
        if (prodObj) {
          await db.syncQueue.add({
            operationId: DeviceService.generateOperationId(),
            deviceId,
            userId: input.userId,
            entityType: 'PRODUCT',
            entityId: prodId,
            operationType: SyncOperationType.UPDATE,
            payload: prodObj,
            createdAt: nowIso,
            status: SyncOperationStatus.PENDING,
            attempts: 0
          });
        }
      }
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

      // 2. Accumulate stock restoration per batch and product
      const batchRestores: Record<string, number> = {};
      const productDeltas: Record<string, number> = {};

      for (const item of (existing.items || [])) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        if (item.batchId && !item.batchId.startsWith('virtual-')) {
          batchRestores[item.batchId] = (batchRestores[item.batchId] || 0) + qty;
        }
        if (item.productId) {
          productDeltas[item.productId] = (productDeltas[item.productId] || 0) + qty;
        }

        // Create return stock movement
        movementsToCreate.push({
          id: DeviceService.generateOperationId(),
          operationId: cancelOpId,
          deviceId,
          productId: item.productId,
          batchId: item.batchId,
          type: StockMovementType.CANCELAMENTO_VENDA,
          quantity: qty,
          reference: `Anulação da fatura ${existing.invoiceNumber}`,
          referenceId: invoiceId,
          date: nowIso,
          userId,
          userName,
          reason,
          unitCost: item.costPriceHistorical || 0,
          totalCost: (item.costPriceHistorical || 0) * qty,
          createdAt: nowIso
        });
      }

      const restoredBatchIds: string[] = [];
      for (const [batchId, qtyAdd] of Object.entries(batchRestores)) {
        const batch = await db.batches.get(batchId);
        if (batch) {
          await db.batches.update(batchId, {
            quantity: Math.max(0, (Number(batch.quantity) || 0) + qtyAdd)
          });
          restoredBatchIds.push(batchId);
        }
      }

      // Restore product totalQuantity from actual batches when present
      for (const [prodId, qtyAdd] of Object.entries(productDeltas)) {
        const prod = await db.products.get(prodId);
        if (prod) {
          const prodBatches = await db.batches.where('productId').equals(prodId).toArray();
          const newTotal = prodBatches.length > 0
            ? Math.max(0, prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0))
            : Math.max(0, (Number(prod.totalQuantity) || 0) + qtyAdd);
          await db.products.update(prodId, { totalQuantity: newTotal });
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

      // 4. Propagate restored batches and products to syncQueue
      for (const batchId of restoredBatchIds) {
        const bObj = await db.batches.get(batchId);
        if (bObj) {
          await db.syncQueue.add({
            operationId: DeviceService.generateOperationId(),
            deviceId,
            userId,
            entityType: 'BATCH',
            entityId: batchId,
            operationType: SyncOperationType.UPDATE,
            payload: bObj,
            createdAt: nowIso,
            status: SyncOperationStatus.PENDING,
            attempts: 0
          });
        }
      }

      for (const prodId of Object.keys(productDeltas)) {
        const pObj = await db.products.get(prodId);
        if (pObj) {
          await db.syncQueue.add({
            operationId: DeviceService.generateOperationId(),
            deviceId,
            userId,
            entityType: 'PRODUCT',
            entityId: prodId,
            operationType: SyncOperationType.UPDATE,
            payload: pObj,
            createdAt: nowIso,
            status: SyncOperationStatus.PENDING,
            attempts: 0
          });
        }
      }
    });

    SyncService.broadcastLocalChange();

    setTimeout(() => {
      SyncService.processQueue().catch(console.warn);
    }, 100);

    return { success: true, message: 'Fatura anulada e stock devolvido com sucesso.' };
  }
}
