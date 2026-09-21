
import React, { useState } from 'react';
import { Product, Batch, ProductPriceType, User, UserRole } from '../types';
import { Search, Plus, Package, Calendar, X, Edit2, Trash2, Lock, AlertTriangle, Save, DollarSign, Tag, Truck, Activity, Hash } from 'lucide-react';
import { CATEGORIES, PRODUCT_TYPES } from '../constants';
import { safeUUID } from '../services/supabaseClient';

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
      setBatchExpiry(batch.expiryDate);
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

    const batchData: Batch = {
      id: editingBatch?.id || safeUUID(),
      productId: selectedProductForBatch.id,
      lotNumber: batchLot,
      quantity: parseInt(batchQty) || 0,
      expiryDate: batchExpiry,
      entryDate: editingBatch?.entryDate || new Date().toISOString().split('T')[0]
    };

    if (editingBatch) onUpdateBatch(batchData);
    else onAddBatch(batchData);
    
    setShowBatchModal(false);
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
        code: generateNextCode(), // Sucessor automático
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
      totalQuantity: editingProduct ? currentBatchTotal : 0
    };
    
    if (editingProduct) {
      onUpdateProduct(finalProduct);
    } else {
      const initialBatch = initialQty > 0 ? {
        lotNumber: productForm.initialLot || 'LOTE-001',
        quantity: initialQty,
        expiryDate: productForm.initialExpiry || new Date(Date.now() + 31536000000).toISOString().split('T')[0]
      } : undefined;
      onAddProduct(finalProduct, initialBatch);
    }
    setShowProductModal(false);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.includes(searchTerm) ||
    p.activeIngredient.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
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
          <button 
            onClick={() => handleOpenProductModal()}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" /> Novo Produto
          </button>
        ) : (
          <div className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest border flex items-center gap-2">
            <Lock className="w-4 h-4" /> Consulta de Stock
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredProducts.map(product => {
          const todayStr = new Date().toISOString().split('T')[0];
          const productBatches = batches.filter(b => b.productId === product.id);
          const validBatches = productBatches.filter(b => b.expiryDate >= todayStr);
          const stockFromBatches = Math.max(0, productBatches.length > 0
            ? validBatches.reduce((sum, b) => sum + Math.max(0, Number(b.quantity) || 0), 0)
            : Math.max(0, Number(product.totalQuantity) || 0));
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
                        onClick={() => handleOpenProductModal(product)} 
                        className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                        title="Editar Produto"
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
                          className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
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
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Stock Atual</p>
                    <p className={`text-xl font-black ${stockFromBatches <= product.minStock ? 'text-red-600' : 'text-slate-900'}`}>
                      {stockFromBatches}
                    </p>
                  </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Mínimo</p>
                  <p className="text-xl font-black text-slate-400">{product.minStock}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">IVA (14%)</p>
                  <p className="text-xl font-black text-slate-400">{product.hasVAT ? 'Sim' : 'Não'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Lotes e Validades</p>
                {isAdmin && (
                  <button 
                    onClick={() => handleOpenBatchModal(product)}
                    className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Lote
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {batches.filter(b => b.productId === product.id).length > 0 ? (
                  batches.filter(b => b.productId === product.id)
                  .sort((a,b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                  .map(batch => {
                    const isExpired = batch.expiryDate < todayStr;
                    return (
                      <div key={batch.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isExpired ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isExpired ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {isExpired ? <AlertTriangle className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-700">Lote: {batch.lotNumber}</p>
                            <p className="text-[10px] text-slate-500 font-bold">
                              Validade: <span className={isExpired ? 'text-red-600' : ''}>{new Date(batch.expiryDate).toLocaleDateString('pt-AO')}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-800">{batch.quantity} <span className="text-[10px]">unid.</span></p>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 border-l pl-3 border-slate-200">
                              <button onClick={() => handleOpenBatchModal(product, batch)} className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                              <button 
                                onClick={async () => {
                                  if (confirm(`Deseja realmente eliminar permanentemente o lote "${batch.lotNumber}"?`)) {
                                    await onDeleteBatch(batch.id);
                                  }
                                }} 
                                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
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
                  <div className="py-4 text-center border-2 border-dashed rounded-2xl border-slate-100 text-slate-400 text-xs font-medium uppercase tracking-widest">
                    Sem stock disponível
                  </div>
                )}
              </div>
            </div>
          </div>
        )})}
      </div>

      {/* MODAL LOTE INDIVIDUAL */}
      {isAdmin && showBatchModal && selectedProductForBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden scale-in-95 animate-in">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight">{editingBatch ? 'Ajustar Lote' : 'Nova Entrada'}</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{selectedProductForBatch.name}</p>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="p-2 hover:bg-slate-800 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveBatch} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Identificação do Lote</label>
                <input required value={batchLot} onChange={e => setBatchLot(e.target.value)} className="w-full p-3.5 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Quantidade Atual</label>
                  <input type="number" required value={batchQty} onChange={e => setBatchQty(e.target.value)} className="w-full p-3.5 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Data de Vencimento</label>
                  <input type="date" required value={batchExpiry} onChange={e => setBatchExpiry(e.target.value)} className="w-full p-3.5 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2">
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
              <button onClick={() => setShowProductModal(false)} className="p-2 hover:bg-emerald-700 rounded-full"><X className="w-6 h-6" /></button>
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
                <input type="number" required value={productForm.costPrice} onChange={e => setProductForm({...productForm, costPrice: parseInt(e.target.value)})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Preço de Venda (Kz)</label>
                <input type="number" required value={productForm.sellPrice} onChange={e => setProductForm({...productForm, sellPrice: parseInt(e.target.value)})} className="w-full p-3 bg-emerald-50 border-emerald-100 border rounded-xl font-black text-emerald-700 outline-none" />
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
                    <input type="number" required value={productForm.initialQty} onChange={e => setProductForm({...productForm, initialQty: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
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

              <div className="lg:col-span-3 border-b pb-2 mt-2">
                <h4 className="text-[11px] font-black uppercase text-emerald-600 tracking-[0.2em] flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Logística e Alertas
                </h4>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Stock Mínimo (Alerta)</label>
                <input type="number" required value={productForm.minStock} onChange={e => setProductForm({...productForm, minStock: parseInt(e.target.value)})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none" />
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
                  className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-400 uppercase text-xs tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-emerald-600/30 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
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
