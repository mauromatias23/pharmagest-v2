import React, { useState } from 'react';
import { Product, Batch, ProductPriceType, User, UserRole, StockMovement, StockMovementType } from '../types';
import { Search, Plus, Package, Calendar, X, Edit2, Trash2, Lock, AlertTriangle, Save, DollarSign, Tag, Truck, Activity, Hash, Sliders, CheckCircle2, RefreshCw, UploadCloud } from 'lucide-react';
import { CATEGORIES, PRODUCT_TYPES } from '../constants';
import { safeUUID } from '../services/supabaseClient';
import { db } from '../services/db';
import { DeviceService } from '../services/deviceService';
import { SyncService } from '../services/syncService';

interface InventoryProps {
  user: User;
  products: Product[];
  batches: Batch[];
  onAddBatch: (batch: Batch) => void;
  onUpdateBatch: (batch: Batch) => void;
  onDeleteBatch: (batchId: string) => void;
  onUpdateProduct: (product: Product) => void;
  onAddProduct: (product: Product, initialBatch?: { lotNumber: string; expiryDate: string; quantity: number }) => void;
  onDeleteProduct?: (productId: string) => void;
}

/**
 * Normaliza datas para o formato ISO YYYY-MM-DD garantindo comparações exatas,
 * mesmo quando introduzidas no formato lusófono DD/MM/YYYY.
 */
const normalizeIsoDate = (dStr?: string): string => {
  if (!dStr) return '';
  const clean = dStr.trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  return clean;
};

const Inventory: React.FC<InventoryProps> = ({ 
  user, products, batches, onAddBatch, onUpdateBatch, onDeleteBatch, onUpdateProduct, onAddProduct, onDeleteProduct
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const isAdmin = user.role === UserRole.ADMIN;
  
  // Modal Lote
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [selectedProductForBatch, setSelectedProductForBatch] = useState<Product | null>(null);
  const [batchLot, setBatchLot] = useState('');
  const [batchQty, setBatchQty] = useState('');
  const [batchExpiry, setBatchExpiry] = useState('');

  // Modal Produto
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<any>({});

  // Modal de Ajuste Rápido de Stock / Acerto de Contagem Física
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [newPhysicalQty, setNewPhysicalQty] = useState<string>('');
  const [stockAdjustmentReason, setStockAdjustmentReason] = useState<string>('Inventário Físico / Acerto de Contagem de Balcão');
  const [stockToast, setStockToast] = useState<string | null>(null);
  const [isSavingStock, setIsSavingStock] = useState<boolean>(false);
  const [isPushingCloud, setIsPushingCloud] = useState<boolean>(false);

  const showFeedback = (msg: string) => {
    setStockToast(msg);
    setTimeout(() => setStockToast(null), 4000);
  };

  const handlePushStockToSupabase = async () => {
    setIsPushingCloud(true);
    try {
      const res = await SyncService.pushAllLocalToSupabase();
      if (res.success) {
        showFeedback(res.message);
      } else {
        alert(res.message || 'Falha ao atualizar dados no Supabase.');
      }
    } catch (err: any) {
      alert(`Erro ao sincronizar com Supabase: ${err?.message || err}`);
    } finally {
      setIsPushingCloud(false);
    }
  };

  // Gera o sucessor automático do maior código numérico
  const generateNextCode = () => {
    if (!products || products.length === 0) return "100001";
    const numericCodes = products
      .map(p => parseInt(p.code))
      .filter(code => !isNaN(code));
    
    if (numericCodes.length === 0) return "100001";
    const maxCode = Math.max(...numericCodes);
    return (maxCode + 1).toString();
  };

  const handleOpenBatchModal = (product: Product, batch?: Batch) => {
    if (!isAdmin) return;
    setSelectedProductForBatch(product);
    if (batch) {
      setEditingBatch(batch);
      setBatchLot(batch.lotNumber);
      setBatchQty(batch.quantity.toString());
      setBatchExpiry(normalizeIsoDate(batch.expiryDate));
    } else {
      setEditingBatch(null);
      setBatchLot('');
      setBatchQty('');
      setBatchExpiry('');
    }
    setShowBatchModal(true);
  };

  const handleSaveBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForBatch || !isAdmin) return;

    const cleanExpiry = normalizeIsoDate(batchExpiry) || new Date(Date.now() + 31536000000).toISOString().split('T')[0];

    const batchData: Batch = {
      id: editingBatch?.id || safeUUID(),
      productId: selectedProductForBatch.id,
      lotNumber: batchLot.trim() || 'LOTE-001',
      quantity: Math.max(0, parseInt(batchQty) || 0),
      expiryDate: cleanExpiry,
      entryDate: editingBatch?.entryDate || new Date().toISOString().split('T')[0]
    };

    if (editingBatch) onUpdateBatch(batchData);
    else onAddBatch(batchData);
    
    setShowBatchModal(false);
    showFeedback(`Lote ${batchData.lotNumber} guardado com sucesso!`);
  };

  const handleOpenProductModal = (product?: Product) => {
    if (!isAdmin) return;
    if (product) {
      setEditingProduct(product);
      setProductForm({
        ...product,
        initialQty: 0,
        initialLot: '',
        initialExpiry: '',
        initialEntryDate: new Date().toISOString().split('T')[0]
      });
    } else {
      setEditingProduct(null);
      setProductForm({
        code: generateNextCode(),
        name: '',
        activeIngredient: '',
        category: CATEGORIES[0],
        type: PRODUCT_TYPES[0], 
        priceType: ProductPriceType.FREE,
        costPrice: 0,
        sellPrice: 0, 
        hasVAT: true,
        supplier: '',
        minStock: 10,
        active: true,
        initialQty: 0,
        initialLot: 'LOTE-001',
        initialExpiry: '',
        initialEntryDate: new Date().toISOString().split('T')[0]
      });
    }
    setShowProductModal(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const productId = editingProduct?.id || safeUUID();
    const initialQty = parseInt(productForm.initialQty) || 0;
    
    const productBatches = editingProduct ? batches.filter(b => b.productId === editingProduct.id) : [];
    const currentBatchTotal = productBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

    // Preserva rigorosamente o stock real do produto caso não existam lotes discriminados
    const finalStock = editingProduct 
      ? (productBatches.length > 0 ? currentBatchTotal : Math.max(0, Number(editingProduct.totalQuantity) || 0))
      : initialQty;

    const finalProduct: Product = {
      id: productId,
      code: productForm.code,
      name: productForm.name,
      activeIngredient: productForm.activeIngredient,
      category: productForm.category,
      type: productForm.type,
      priceType: productForm.priceType,
      costPrice: Number(productForm.costPrice) || 0,
      sellPrice: Number(productForm.sellPrice) || 0,
      hasVAT: productForm.hasVAT,
      supplier: productForm.supplier,
      minStock: Number(productForm.minStock) || 0,
      active: productForm.active,
      totalQuantity: finalStock
    };
    
    if (editingProduct) {
      onUpdateProduct(finalProduct);
      showFeedback(`Medicamento "${finalProduct.name}" atualizado com sucesso!`);
    } else {
      const initialBatch = initialQty > 0 ? {
        lotNumber: productForm.initialLot || 'LOTE-001',
        quantity: initialQty,
        expiryDate: normalizeIsoDate(productForm.initialExpiry) || new Date(Date.now() + 31536000000).toISOString().split('T')[0]
      } : undefined;
      onAddProduct(finalProduct, initialBatch);
      showFeedback(`Medicamento "${finalProduct.name}" cadastrado com sucesso!`);
    }
    setShowProductModal(false);
  };

  // =========================================================================
  // ACERTO DE STOCK / INVENTÁRIO FÍSICO DIRETO
  // =========================================================================

  const handleOpenStockAdjustment = (product: Product) => {
    if (!isAdmin) return;
    setStockProduct(product);
    
    // Obtém o stock físico total atual
    const prodBatches = batches.filter(b => b.productId === product.id);
    const currentTotal = prodBatches.length > 0
      ? prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0)
      : Math.max(0, Number(product.totalQuantity) || 0);

    setNewPhysicalQty(currentTotal.toString());
    setStockAdjustmentReason('Inventário Físico / Acerto de Contagem de Balcão');
    setShowStockModal(true);
  };

  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockProduct || !isAdmin) return;

    const targetQty = Math.max(0, parseInt(newPhysicalQty) || 0);
    const prodBatches = batches.filter(b => b.productId === stockProduct.id);
    const oldQty = prodBatches.length > 0
      ? prodBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0)
      : Math.max(0, Number(stockProduct.totalQuantity) || 0);

    const delta = targetQty - oldQty;
    setIsSavingStock(true);

    try {
      const nowIso = new Date().toISOString();
      const operationId = DeviceService.generateOperationId();
      const deviceId = DeviceService.getDeviceId();

      // 1. Atualizar ou criar lote correspondente
      if (prodBatches.length > 0) {
        // Encontra o lote mais recente ou o primeiro
        const targetBatch = [...prodBatches].sort((a, b) => 
          new Date(b.entryDate || 0).getTime() - new Date(a.entryDate || 0).getTime()
        )[0];

        const otherBatchesSum = prodBatches
          .filter(b => b.id !== targetBatch.id)
          .reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0);

        if (targetQty >= otherBatchesSum) {
          // A quantidade pretendida é suficiente para cobrir os outros lotes: ajusta o targetBatch
          const newTargetBatchQty = targetQty - otherBatchesSum;
          const updatedBatch: Batch = {
            ...targetBatch,
            quantity: newTargetBatchQty
          };
          await SyncService.updateBatch(updatedBatch);
          onUpdateBatch(updatedBatch);
        } else {
          // A quantidade pretendida é menor que a soma dos outros lotes:
          // Coloca targetQty integralmente no targetBatch e zera os outros lotes
          // para que a soma real dos lotes NUNCA exceda nem reverta o acerto feito!
          const updatedBatch: Batch = {
            ...targetBatch,
            quantity: targetQty
          };
          await SyncService.updateBatch(updatedBatch);
          onUpdateBatch(updatedBatch);

          for (const otherB of prodBatches.filter(b => b.id !== targetBatch.id)) {
            if ((Number(otherB.quantity) || 0) > 0) {
              const zeroedB: Batch = {
                ...otherB,
                quantity: 0
              };
              await SyncService.updateBatch(zeroedB);
              onUpdateBatch(zeroedB);
            }
          }
        }
      } else {
        // Cria um lote padrão para o medicamento para permitir rastreio e venda
        const newBatch: Batch = {
          id: safeUUID(),
          productId: stockProduct.id,
          lotNumber: 'LOTE-REAL',
          quantity: targetQty,
          expiryDate: new Date(Date.now() + 63072000000).toISOString().split('T')[0], // 2 anos de validade padrão
          entryDate: new Date().toISOString().split('T')[0]
        };

        await SyncService.createBatch(newBatch);
        onAddBatch(newBatch);
      }

      // 2. Atualizar o registo do produto
      const updatedProduct: Product = {
        ...stockProduct,
        totalQuantity: targetQty
      };
      await SyncService.updateProduct(updatedProduct);
      onUpdateProduct(updatedProduct);

      // 3. Registar o movimento de stock para auditoria
      const movement: StockMovement = {
        id: DeviceService.generateOperationId(),
        operationId,
        deviceId,
        productId: stockProduct.id,
        type: delta >= 0 ? StockMovementType.ENTRADA : StockMovementType.AJUSTE,
        quantity: Math.abs(delta),
        reference: `${stockAdjustmentReason} (De ${oldQty} para ${targetQty} un.)`,
        date: nowIso,
        userId: user.id,
        userName: user.name,
        unitCost: stockProduct.costPrice,
        totalCost: stockProduct.costPrice * Math.abs(delta),
        createdAt: nowIso
      };
      await db.stockMovements.put(movement);

      showFeedback(`Stock de "${stockProduct.name}" corrigido com sucesso para ${targetQty} unidades!`);
      setShowStockModal(false);
    } catch (err: any) {
      console.error('[handleSaveStockAdjustment Error]', err);
      alert(`Erro ao ajustar stock: ${err?.message || err}`);
    } finally {
      setIsSavingStock(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.includes(searchTerm) ||
    p.activeIngredient.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {stockToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 font-bold text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span>{stockToast}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between no-print">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Pesquisar por nome, código ou princípio..."
            className="w-full pl-10 pr-4 py-3 border rounded-xl outline-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-emerald-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {isAdmin ? (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button
              onClick={handlePushStockToSupabase}
              disabled={isPushingCloud}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-amber-600/20 cursor-pointer disabled:opacity-50 transition-all"
              title="Envia e atualiza todos os stocks, lotes e produtos deste computador diretamente no Supabase"
            >
              <UploadCloud className={`w-4 h-4 ${isPushingCloud ? 'animate-bounce' : ''}`} />
              {isPushingCloud ? 'A Atualizar Nuvem...' : 'Atualizar Nuvem c/ Stock Local'}
            </button>
            <button 
              onClick={() => handleOpenProductModal()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-600/20 cursor-pointer transition-all"
            >
              <Plus className="w-5 h-5" /> Novo Produto
            </button>
          </div>
        ) : (
          <div className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest border flex items-center gap-2">
            <Lock className="w-4 h-4" /> Consulta de Stock
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredProducts.map(product => {
          const productBatches = batches.filter(b => b.productId === product.id);
          
          // Stock Físico Total (todas as unidades do medicamento)
          const physicalStock = productBatches.length > 0
            ? productBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0)
            : Math.max(0, Number(product.totalQuantity) || 0);

          // Stock Disponível para Venda (apenas lotes dentro da validade)
          const validBatches = productBatches.filter(b => normalizeIsoDate(b.expiryDate) >= todayStr);
          const sellableStock = productBatches.length > 0
            ? validBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0)
            : physicalStock;

          // Unidades vencidas se existirem
          const expiredBatches = productBatches.filter(b => normalizeIsoDate(b.expiryDate) < todayStr);
          const expiredCount = expiredBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0);

          return (
            <div key={product.id} className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md ${!product.active ? 'opacity-60 grayscale' : ''}`}>
              <div className="p-5 flex items-start justify-between border-b bg-slate-50/50">
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0 shadow-inner">
                    <Package className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-lg leading-tight">{product.name}</h4>
                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-tighter">
                      {product.activeIngredient || 'Genérico'} • {product.category} • {product.type}
                    </p>
                    <span className="text-[9px] font-black uppercase bg-slate-200 px-2 py-0.5 rounded-full text-slate-600 mt-2 inline-block">COD: {product.code}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <p className="text-xl font-black text-emerald-600">{product.sellPrice.toLocaleString()} Kz</p>
                    <p className="text-[9px] font-black uppercase text-slate-400">Preço {product.priceType}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleOpenStockAdjustment(product)}
                        className="p-2.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                        title="Acerto / Correção Rápida de Stock"
                      >
                        <Sliders className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleOpenProductModal(product)} 
                        className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                        title="Editar Medicamento"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      {onDeleteProduct && (
                        <button 
                          onClick={async () => {
                            if (confirm(`Deseja realmente eliminar o produto "${product.name}" e todos os seus lotes associados? Esta acção é irreversível.`)) {
                              await onDeleteProduct(product.id);
                            }
                          }} 
                          className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                          title="Eliminar Produto"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-5">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Stock Real Total</p>
                    <p className={`text-xl font-black ${physicalStock <= product.minStock ? 'text-red-600' : 'text-slate-900'}`}>
                      {physicalStock} <span className="text-xs font-bold text-slate-400">un.</span>
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Disponível Venda</p>
                    <p className={`text-xl font-black ${sellableStock <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {sellableStock} <span className="text-xs font-bold text-slate-400">un.</span>
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Stock Mínimo</p>
                    <p className="text-xl font-black text-slate-400">{product.minStock}</p>
                  </div>
                </div>

                {expiredCount > 0 && (
                  <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs font-bold text-red-700">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      Lotes Vencidos: <strong>{expiredCount} unidades</strong> retidas
                    </span>
                    <span className="text-[10px] uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded-md">Bloqueado p/ venda</span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Lotes e Validades</p>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleOpenStockAdjustment(product)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" /> Acerto de Stock
                      </button>
                      <button 
                        onClick={() => handleOpenBatchModal(product)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Lote
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {productBatches.length > 0 ? (
                    productBatches
                    .sort((a,b) => new Date(normalizeIsoDate(a.expiryDate)).getTime() - new Date(normalizeIsoDate(b.expiryDate)).getTime())
                    .map(batch => {
                      const cleanExp = normalizeIsoDate(batch.expiryDate);
                      const isExpired = cleanExp < todayStr;
                      return (
                        <div key={batch.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isExpired ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isExpired ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {isExpired ? <AlertTriangle className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-700">Lote: {batch.lotNumber}</p>
                              <p className="text-[10px] text-slate-500 font-bold">
                                Validade: <span className={isExpired ? 'text-red-600' : ''}>{cleanExp}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-black text-slate-800">{batch.quantity} <span className="text-[10px]">unid.</span></p>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-1 border-l pl-3 border-slate-200">
                                <button onClick={() => handleOpenBatchModal(product, batch)} className="p-1 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"><Edit2 className="w-4 h-4" /></button>
                                <button 
                                  onClick={async () => {
                                    if (confirm(`Deseja realmente eliminar permanentemente o lote "${batch.lotNumber}"?`)) {
                                      await onDeleteBatch(batch.id);
                                    }
                                  }} 
                                  className="p-1 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                                  title="Eliminar Lote"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-4 text-center border-2 border-dashed rounded-2xl border-slate-100 text-slate-400 text-xs font-medium uppercase tracking-widest flex flex-col items-center gap-2">
                      <span>Sem lotes específicos registados (Stock geral: {product.totalQuantity || 0} un.)</span>
                      {isAdmin && (
                        <button
                          onClick={() => handleOpenStockAdjustment(product)}
                          className="text-[11px] text-emerald-600 font-bold hover:underline uppercase"
                        >
                          + Criar Lote / Corrigir Stock
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE ACERTO RÁPIDO DE STOCK (INVENTÁRIO FÍSICO) */}
      {isAdmin && showStockModal && stockProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-95 animate-in">
            <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Sliders className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">Acerto de Stock Físico</h3>
                  <p className="text-[11px] text-emerald-100 font-medium">{stockProduct.name} ({stockProduct.code})</p>
                </div>
              </div>
              <button onClick={() => setShowStockModal(false)} className="p-2 hover:bg-emerald-700 rounded-full text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSaveStockAdjustment} className="p-6 space-y-5">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Stock Registado Atual</p>
                  <p className="text-xl font-black text-slate-700">
                    {batches.filter(b => b.productId === stockProduct.id).length > 0
                      ? batches.filter(b => b.productId === stockProduct.id).reduce((s, b) => s + (Number(b.quantity) || 0), 0)
                      : (stockProduct.totalQuantity || 0)} un.
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Variação Resultante</p>
                  {(() => {
                    const currentTot = batches.filter(b => b.productId === stockProduct.id).length > 0
                      ? batches.filter(b => b.productId === stockProduct.id).reduce((s, b) => s + (Number(b.quantity) || 0), 0)
                      : (stockProduct.totalQuantity || 0);
                    const parsed = parseInt(newPhysicalQty) || 0;
                    const diff = parsed - currentTot;
                    return (
                      <p className={`text-xl font-black ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {diff > 0 ? `+${diff}` : diff} un.
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  Nova Quantidade Real em Farmácia *
                </label>
                <input 
                  type="number"
                  min="0"
                  required
                  autoFocus
                  value={newPhysicalQty}
                  onChange={e => setNewPhysicalQty(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-center outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-800"
                  placeholder="0"
                />
                <p className="text-[10px] text-slate-400 font-medium text-center">
                  Introduza a contagem física real observada nas prateleiras da empresa.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  Motivo da Atualização de Stock *
                </label>
                <select
                  value={stockAdjustmentReason}
                  onChange={e => setStockAdjustmentReason(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Inventário Físico / Acerto de Contagem de Balcão">Inventário Físico / Acerto de Contagem de Balcão</option>
                  <option value="Entrada Direta de Medicamentos / Fornecedor">Entrada Direta de Medicamentos / Fornecedor</option>
                  <option value="Ajuste de Quebra / Medicamento Danificado">Ajuste de Quebra / Medicamento Danificado</option>
                  <option value="Correção de Venda Anterior">Correção de Venda Anterior</option>
                  <option value="Outro Ajuste Administrativo">Outro Ajuste Administrativo</option>
                </select>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowStockModal(false)}
                  className="flex-1 py-3.5 border border-slate-200 rounded-2xl font-bold text-slate-500 text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingStock}
                  className="flex-[2] py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingStock ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> A Gravar...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Aplicar Contagem Real
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL LOTE INDIVIDUAL */}
      {isAdmin && showBatchModal && selectedProductForBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden scale-in-95 animate-in">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight">{editingBatch ? 'Ajustar Lote' : 'Nova Entrada de Lote'}</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{selectedProductForBatch.name}</p>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="p-2 hover:bg-slate-800 rounded-full text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveBatch} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Identificação do Lote</label>
                <input required value={batchLot} onChange={e => setBatchLot(e.target.value)} className="w-full p-3.5 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ex: L2401" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Quantidade Atual</label>
                  <input type="number" min="0" required value={batchQty} onChange={e => setBatchQty(e.target.value)} className="w-full p-3.5 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Data de Vencimento</label>
                  <input type="date" required value={batchExpiry} onChange={e => setBatchExpiry(e.target.value)} className="w-full p-3.5 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-emerald-700">
                <Save className="w-4 h-4" /> Atualizar Inventário
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO COMPLETO */}
      {isAdmin && showProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden scale-in-95 animate-in">
            <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Package className="w-6 h-6" />
                <h3 className="font-black text-xl uppercase tracking-tight">{editingProduct ? 'Editar Medicamento' : 'Cadastrar Novo Medicamento'}</h3>
              </div>
              <button onClick={() => setShowProductModal(false)} className="p-2 hover:bg-emerald-700 rounded-full text-white cursor-pointer"><X className="w-6 h-6" /></button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[85vh] overflow-y-auto">
              <div className="lg:col-span-3 border-b pb-2">
                <h4 className="text-[11px] font-black uppercase text-emerald-600 tracking-[0.2em] flex items-center gap-2">
                  <Tag className="w-4 h-4" /> Identificação e Técnica
                </h4>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Código Interno *</label>
                <input required value={productForm.code} onChange={e => setProductForm({...productForm, code: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none border-emerald-100" />
              </div>
              
              <div className="space-y-1 lg:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Nome Comercial *</label>
                <input required value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" placeholder="Ex: Paracetamol Generis" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Princípio Ativo</label>
                <input value={productForm.activeIngredient} onChange={e => setProductForm({...productForm, activeIngredient: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" placeholder="Ex: Paracetamol" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Categoria *</label>
                <select required value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Tipo de Forma *</label>
                <select required value={productForm.type} onChange={e => setProductForm({...productForm, type: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none">
                  {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="lg:col-span-3 border-b pb-2 mt-2">
                <h4 className="text-[11px] font-black uppercase text-emerald-600 tracking-[0.2em] flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Financeiro e Fiscal
                </h4>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Tipo de Preço</label>
                <select value={productForm.priceType} onChange={e => setProductForm({...productForm, priceType: e.target.value as ProductPriceType})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none">
                  <option value={ProductPriceType.FREE}>Preço Livre</option>
                  <option value={ProductPriceType.CAPPED}>Preço Tabelado</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Preço de Compra (Kz)</label>
                <input type="number" required value={productForm.costPrice} onChange={e => setProductForm({...productForm, costPrice: parseInt(e.target.value) || 0})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Preço de Venda (Kz)</label>
                <input type="number" required value={productForm.sellPrice} onChange={e => setProductForm({...productForm, sellPrice: parseInt(e.target.value) || 0})} className="w-full p-3 bg-emerald-50 border-emerald-100 border rounded-xl font-black text-emerald-700 outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Aplicar IVA (14%)</label>
                <select value={productForm.hasVAT ? 'sim' : 'não'} onChange={e => setProductForm({...productForm, hasVAT: e.target.value === 'sim'})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none">
                  <option value="sim">Sim (Sempre 14%)</option>
                  <option value="não">Isento (0%)</option>
                </select>
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Fornecedor Principal</label>
                <div className="relative">
                  <Truck className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input value={productForm.supplier} onChange={e => setProductForm({...productForm, supplier: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl font-bold outline-none" placeholder="Ex: Distribuidora Angola" />
                </div>
              </div>

              {!editingProduct && (
                <>
                  <div className="lg:col-span-3 border-b pb-2 mt-2">
                    <h4 className="text-[11px] font-black uppercase text-emerald-600 tracking-[0.2em] flex items-center gap-2">
                      <Hash className="w-4 h-4" /> Stock Inicial e Validade
                    </h4>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Quantidade em Stock *</label>
                    <input type="number" min="0" required value={productForm.initialQty} onChange={e => setProductForm({...productForm, initialQty: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Data de Entrada *</label>
                    <input type="date" required value={productForm.initialEntryDate} onChange={e => setProductForm({...productForm, initialEntryDate: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Data de Validade *</label>
                    <input type="date" required value={productForm.initialExpiry} onChange={e => setProductForm({...productForm, initialExpiry: e.target.value})} className="w-full p-3 bg-red-50 border-red-100 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-red-500" />
                  </div>
                </>
              )}

              {editingProduct && (
                <div className="lg:col-span-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-2">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Stock Registado em Sistema</p>
                      <p className="text-[11px] text-slate-500 font-medium">Quantidade atual: <strong className="text-emerald-700 font-bold">{editingProduct.totalQuantity || 0} unidades</strong></p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProductModal(false);
                        handleOpenStockAdjustment(editingProduct);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <Sliders className="w-4 h-4" /> Acerto de Stock Físico
                    </button>
                  </div>
                </div>
              )}

              <div className="lg:col-span-3 border-b pb-2 mt-2">
                <h4 className="text-[11px] font-black uppercase text-emerald-600 tracking-[0.2em] flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Logística e Alertas
                </h4>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Stock Mínimo (Alerta)</label>
                <input type="number" required value={productForm.minStock} onChange={e => setProductForm({...productForm, minStock: parseInt(e.target.value) || 0})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Estado do Produto</label>
                <select value={productForm.active ? 'ativo' : 'inativo'} onChange={e => setProductForm({...productForm, active: e.target.value === 'ativo'})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none">
                  <option value="ativo">Ativo (Para Venda)</option>
                  <option value="inativo">Inativo (Bloqueado)</option>
                </select>
              </div>

              <div className="lg:col-span-3 pt-6 flex gap-4 no-print">
                <button 
                  type="button" 
                  onClick={() => setShowProductModal(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-400 uppercase text-xs tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-emerald-600/30 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> {editingProduct ? 'Gravar Alterações' : 'Cadastrar Medicamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
