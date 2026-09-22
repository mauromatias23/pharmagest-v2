import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  Copy, 
  Terminal, 
  Database, 
  ChevronRight, 
  Info,
  ExternalLink,
  Key,
  Save,
  Trash2,
  UploadCloud,
  DownloadCloud
} from 'lucide-react';
import { SyncService } from '../services/syncService';
import { DeviceService } from '../services/deviceService';
import { 
  testSupabaseConnection, 
  isSupabaseConfigured,
  getCleanSupabaseUrl,
  getCleanSupabaseAnonKey,
  saveSupabaseCredentials,
  clearSupabaseCredentials
} from '../services/supabaseClient';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess?: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({ 
  isOpen, 
  onClose, 
  onSyncSuccess 
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushingLocal, setIsPushingLocal] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; pushed: number; pulled: number; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'migration' | 'setup'>('status');

  const [inputUrl, setInputUrl] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pendingStats, setPendingStats] = useState<{ totalInvoices: number; unsyncedInvoices: number; periodInvoices: number } | null>(null);

  const configured = isSupabaseConfigured();

  const loadPendingStats = async () => {
    try {
      const stats = await SyncService.getPendingSyncSummary();
      setPendingStats(stats);
    } catch (e) {
      console.warn('Erro ao carregar estatísticas locais:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setInputUrl(getCleanSupabaseUrl());
      setInputKey(getCleanSupabaseAnonKey());
      setSaveMessage(null);
      loadPendingStats();
      if (isSupabaseConfigured()) {
        handleTestConnection();
      }
    }
  }, [isOpen]);

  const handleSaveCredentials = async () => {
    if (!inputUrl.trim() || !inputKey.trim()) {
      alert('Por favor, preencha a URL e a Anon Key do Supabase.');
      return;
    }
    saveSupabaseCredentials(inputUrl.trim(), inputKey.trim());
    setSaveMessage('Credenciais guardadas com sucesso!');
    setTimeout(() => setSaveMessage(null), 3000);
    await handleTestConnection();
    await handleSyncNow();
  };

  const handleClearCredentials = () => {
    if (confirm('Tem certeza que deseja desconectar o Supabase deste navegador?')) {
      clearSupabaseCredentials();
      setInputUrl('');
      setInputKey('');
      setConnectionStatus(null);
      setSyncResult(null);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionStatus(null);
    try {
      const res = await testSupabaseConnection();
      setConnectionStatus(res);
    } catch (err: any) {
      setConnectionStatus({ success: false, message: err?.message || 'Falha desconhecida.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handlePushLocalOnly = async () => {
    setIsPushingLocal(true);
    setSyncResult(null);
    try {
      const res = await SyncService.pushAllLocalToSupabase();
      setSyncResult({
        success: res.success,
        pushed: res.pushed,
        pulled: 0,
        message: res.message
      });
      await loadPendingStats();
      if (res.success && onSyncSuccess) {
        onSyncSuccess();
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        pushed: 0,
        pulled: 0,
        message: err?.message || 'Falha ao enviar faturas locais para o Supabase.'
      });
    } finally {
      setIsPushingLocal(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await SyncService.syncAll();
      setSyncResult(res);
      await loadPendingStats();
      if (res.success && onSyncSuccess) {
        onSyncSuccess();
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        pushed: 0,
        pulled: 0,
        message: err?.message || 'Erro inesperado na sincronização.'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const sqlMigrationCode = `-- PharmaGest Angola - Supabase PostgreSQL Schema Migration
-- Designed for seamless Single Source of Truth architecture
-- Time Zone: Africa/Luanda (Angola)

-- 1. Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CREATE USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Administrador', 'Farmacêutico', 'Operador de Caixa')),
    active BOOLEAN DEFAULT TRUE,
    password TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 3. CREATE PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    active_ingredient TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT,
    price_type TEXT NOT NULL CHECK (price_type IN ('Livre', 'Tabelado')),
    cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    sell_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    has_vat BOOLEAN DEFAULT TRUE,
    supplier TEXT,
    min_stock INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 4. CREATE BATCHES TABLE (With ON DELETE CASCADE)
CREATE TABLE IF NOT EXISTS public.batches (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    lot_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    entry_date TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 5. CREATE INVOICES TABLE (With ON DELETE CASCADE on users)
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id TEXT,
    customer_name TEXT,
    customer_nif TEXT,
    user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    date TEXT NOT NULL,
    total_gross NUMERIC(15, 2) NOT NULL,
    total_vat NUMERIC(15, 2) NOT NULL,
    total_net NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Emitida', 'Anulada')),
    payment_method TEXT NOT NULL,
    closed BOOLEAN DEFAULT FALSE,
    closure_id TEXT,
    shift_number INTEGER DEFAULT 1,
    shift_name TEXT DEFAULT '1º Turno',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 6. CREATE INVOICE ITEMS TABLE (With ON DELETE CASCADE)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    batch_id TEXT REFERENCES public.batches(id) ON DELETE CASCADE,
    lot_number TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15, 2) NOT NULL,
    subtotal NUMERIC(15, 2) NOT NULL,
    vat_amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 7. CREATE DAILY CLOSURES TABLE (With ON DELETE CASCADE on users)
CREATE TABLE IF NOT EXISTS public.daily_closures (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    type TEXT DEFAULT 'SHIFT',
    shift_number INTEGER DEFAULT 1,
    shift_name TEXT DEFAULT '1º Turno',
    total_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_tpa NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_transfer NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_mixed NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_invoices INTEGER NOT NULL DEFAULT 0,
    grand_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    timestamp TEXT NOT NULL,
    shift_breakdowns JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 8. UPGRADE EXISTING COLUMNS AND FOREIGN KEYS TO ON DELETE CASCADE (Safe for existing databases)
DO $$ 
BEGIN
    -- Add missing columns to invoices if they were created earlier
    ALTER TABLE IF EXISTS public.invoices ADD COLUMN IF NOT EXISTS closed BOOLEAN DEFAULT FALSE;
    ALTER TABLE IF EXISTS public.invoices ADD COLUMN IF NOT EXISTS closure_id TEXT;
    ALTER TABLE IF EXISTS public.invoices ADD COLUMN IF NOT EXISTS shift_number INTEGER DEFAULT 1;
    ALTER TABLE IF EXISTS public.invoices ADD COLUMN IF NOT EXISTS shift_name TEXT DEFAULT '1º Turno';

    -- Add missing columns to daily_closures if they were created earlier
    ALTER TABLE IF EXISTS public.daily_closures ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'SHIFT';
    ALTER TABLE IF EXISTS public.daily_closures ADD COLUMN IF NOT EXISTS shift_number INTEGER DEFAULT 1;
    ALTER TABLE IF EXISTS public.daily_closures ADD COLUMN IF NOT EXISTS shift_name TEXT DEFAULT '1º Turno';
    ALTER TABLE IF EXISTS public.daily_closures ADD COLUMN IF NOT EXISTS shift_breakdowns JSONB;

    -- Fix batches -> products
    ALTER TABLE IF EXISTS public.batches DROP CONSTRAINT IF EXISTS batches_product_id_fkey;
    ALTER TABLE IF EXISTS public.batches ADD CONSTRAINT batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

    -- Fix invoice_items -> invoices
    ALTER TABLE IF EXISTS public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
    ALTER TABLE IF EXISTS public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

    -- Fix invoice_items -> products
    ALTER TABLE IF EXISTS public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey;
    ALTER TABLE IF EXISTS public.invoice_items ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

    -- Fix invoice_items -> batches
    ALTER TABLE IF EXISTS public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_batch_id_fkey;
    ALTER TABLE IF EXISTS public.invoice_items ADD CONSTRAINT invoice_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

    -- Fix invoices -> users
    ALTER TABLE IF EXISTS public.invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
    ALTER TABLE IF EXISTS public.invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

    -- Fix daily_closures -> users
    ALTER TABLE IF EXISTS public.daily_closures DROP CONSTRAINT IF EXISTS daily_closures_user_id_fkey;
    ALTER TABLE IF EXISTS public.daily_closures ADD CONSTRAINT daily_closures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION
    WHEN OTHERS THEN RAISE NOTICE 'Constraints already updated or error skipped: %', SQLERRM;
END $$;

-- 9. INDEXES FOR HIGH-SPEED QUERYING
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);
CREATE INDEX IF NOT EXISTS idx_batches_product_id ON public.batches(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON public.invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_daily_closures_date ON public.daily_closures(date);

-- 10. ROW LEVEL SECURITY (RLS) & FULL PERMISSION ACCESS (Ensures DELETE/INSERT/UPDATE never fail)
ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoice_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_closures DISABLE ROW LEVEL SECURITY;

-- Create Universal RLS Policies in case RLS is turned on
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Allow all users" ON public.users;
    CREATE POLICY "Allow all users" ON public.users FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all products" ON public.products;
    CREATE POLICY "Allow all products" ON public.products FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all batches" ON public.batches;
    CREATE POLICY "Allow all batches" ON public.batches FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all invoices" ON public.invoices;
    CREATE POLICY "Allow all invoices" ON public.invoices FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all invoice_items" ON public.invoice_items;
    CREATE POLICY "Allow all invoice_items" ON public.invoice_items FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow all daily_closures" ON public.daily_closures;
    CREATE POLICY "Allow all daily_closures" ON public.daily_closures FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
EXCEPTION
    WHEN OTHERS THEN RAISE NOTICE 'Policies update skipped: %', SQLERRM;
END $$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 11. REAL-TIME PUBLICATION
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.batches;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_items;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_closures;
EXCEPTION
    WHEN OTHERS THEN RAISE NOTICE 'Realtime publication already contains tables: %', SQLERRM;
END $$;
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlMigrationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print" id="supabase-sync-modal">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md ${
              configured ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-slate-300 text-slate-600'
            }`}>
              {configured ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Integração Supabase Cloud</h3>
              <p className="text-[11px] text-slate-500 font-medium">Sincronização redundante offline-first para farmácias</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 px-4">
          <button 
            onClick={() => setActiveTab('status')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'status' 
                ? 'border-emerald-600 text-emerald-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sincronização & Estado
          </button>
          <button 
            onClick={() => setActiveTab('migration')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'migration' 
                ? 'border-emerald-600 text-emerald-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Gerar Migration SQL
          </button>
          <button 
            onClick={() => setActiveTab('setup')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'setup' 
                ? 'border-emerald-600 text-emerald-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Guia de Configuração
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: STATUS AND SYNC */}
          {activeTab === 'status' && (
            <div className="space-y-6">
              
              {/* Configuration Status Card */}
              <div className={`p-5 rounded-2xl border ${
                configured 
                  ? 'bg-emerald-50/60 border-emerald-100 text-emerald-950' 
                  : 'bg-amber-50/60 border-amber-100 text-amber-950'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl border ${
                    configured ? 'bg-emerald-100 border-emerald-200' : 'bg-amber-100 border-amber-200'
                  }`}>
                    {configured ? <Check className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="font-extrabold text-sm uppercase tracking-tight">
                      {configured ? 'Supabase Conectado e Sincronizando' : 'Supabase Desconectado'}
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {configured 
                        ? 'Todas as alterações de faturas, produtos e lotes feitas neste navegador ou em outros navegadores são sincronizadas automaticamente em tempo real.'
                        : 'Preencha abaixo a URL do seu Projeto e a Chave Pública (Anon Key) do Supabase para ativar a sincronização em tempo real entre todos os seus navegadores e dispositivos.'
                      }
                    </p>
                  </div>
                </div>

                {/* Connection Status Banner */}
                {connectionStatus && (
                  <div className={`mt-4 p-3.5 rounded-xl text-xs font-semibold border ${
                    connectionStatus.success 
                      ? 'bg-white/80 border-emerald-200/50 text-emerald-800' 
                      : 'bg-white/80 border-rose-200/50 text-rose-800'
                  }`}>
                    <p className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${connectionStatus.success ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}></span>
                      {connectionStatus.message}
                    </p>
                  </div>
                )}

                {isTesting && (
                  <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    A testar ligação com o Supabase...
                  </div>
                )}
              </div>

              {/* Direct Supabase Credentials Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-400" />
                    <h5 className="font-black text-xs uppercase tracking-wider text-slate-200">
                      Credenciais do Supabase (Multi-Navegador)
                    </h5>
                  </div>
                  {configured && (
                    <button
                      onClick={handleClearCredentials}
                      className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Desconectar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Project URL (ex: https://xyz.supabase.co)
                    </label>
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={e => setInputUrl(e.target.value)}
                      placeholder="https://sua-url-aqui.supabase.co"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Anon Key (Chave Pública)
                    </label>
                    <input
                      type="password"
                      value={inputKey}
                      onChange={e => setInputKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {saveMessage && (
                  <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    {saveMessage}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveCredentials}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Guardar & Conectar
                  </button>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Testar
                  </button>
                </div>
              </div>

              {/* Sync Actions */}
              {configured ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-extrabold text-sm text-slate-800 uppercase tracking-tight">Painel de Sincronização & Lançamento</h5>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Gerir sincronização entre este dispositivo local e o Supabase</p>
                    </div>
                    <button
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                    >
                      Testar Conexão
                    </button>
                  </div>

                  {/* Cartão de Vendas Locais & Recuperação do Período 11/09 a 21/09 */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-black text-amber-900 uppercase tracking-wider">
                          Terminal Local (IndexedDB)
                        </span>
                      </div>
                      <span className="self-start sm:self-auto px-2 py-0.5 bg-amber-500/20 text-amber-800 rounded text-[10px] font-black uppercase tracking-widest font-mono">
                        Terminal: {DeviceService.getDeviceId().slice(0, 15)}...
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-white/80 rounded-xl p-2 border border-amber-200/50">
                        <div className="text-base font-black text-slate-800 font-mono">
                          {pendingStats ? pendingStats.totalInvoices : '...'}
                        </div>
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Total Local</div>
                      </div>
                      <div className="bg-white/80 rounded-xl p-2 border border-amber-200/50">
                        <div className="text-base font-black text-amber-600 font-mono">
                          {pendingStats ? pendingStats.unsyncedInvoices : '...'}
                        </div>
                        <div className="text-[9px] font-bold text-amber-700 uppercase tracking-tight">Faturas Offline</div>
                      </div>
                      <div className="bg-white/80 rounded-xl p-2 border border-amber-200/50">
                        <div className="text-base font-black text-purple-600 font-mono">
                          {(pendingStats as any)?.queuePending ?? 0}
                        </div>
                        <div className="text-[9px] font-bold text-purple-700 uppercase tracking-tight">Fila (Queue)</div>
                      </div>
                      <div className="bg-white/80 rounded-xl p-2 border border-amber-200/50">
                        <div className="text-base font-black text-emerald-600 font-mono">
                          {pendingStats ? pendingStats.periodInvoices : '...'}
                        </div>
                        <div className="text-[9px] font-bold text-emerald-700 uppercase tracking-tight">11/09 a 21/09</div>
                      </div>
                    </div>

                    <p className="text-[11px] text-amber-950/80 leading-relaxed">
                      Se o seu Supabase esteve inacessível ou com limite de quota de tráfego entre 11/09 e 21/09, todas as vendas foram guardadas em segurança no armazenamento local deste navegador. Clique no botão de <strong>Enviar Vendas Locais (Upload)</strong> para lançá-las de imediato no Supabase.
                    </p>
                  </div>

                  {/* Botões de Ação */}
                  {/* Botões de Ação */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={handlePushLocalOnly}
                      disabled={isPushingLocal || isSyncing}
                      className="px-4 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2.5 transition-all disabled:bg-slate-300 disabled:shadow-none cursor-pointer"
                    >
                      <UploadCloud className={`w-4 h-4 ${isPushingLocal ? 'animate-bounce' : ''}`} />
                      {isPushingLocal ? 'A Enviar para Supabase...' : 'Enviar Vendas Locais (Upload)'}
                    </button>

                    <button
                      onClick={handleSyncNow}
                      disabled={isSyncing || isPushingLocal}
                      className="px-4 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2.5 transition-all disabled:bg-slate-300 disabled:shadow-none cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'A Sincronizar Tudo...' : 'Sincronizar Tudo (Upload + Download)'}
                    </button>
                  </div>

                  {/* Transferência entre Computadores / Links Diferentes (Exportar / Importar Backup JSON) */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="text-slate-500 text-[11px] text-center sm:text-left">
                      <span className="font-bold text-slate-700 block">Vendeu noutro link ou computador?</span>
                      Exporte o backup local daquele navegador e importe aqui para lançar na nuvem.
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={async () => {
                          try {
                            const data = await SyncService.exportLocalDataToJSON();
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `backup-vendas-locais-${new Date().toISOString().slice(0, 10)}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch (e: any) {
                            alert('Erro ao exportar backup: ' + (e?.message || e));
                          }
                        }}
                        className="flex-1 sm:flex-initial px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Baixar ficheiro com as faturas deste navegador"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" />
                        Exportar Backup (.json)
                      </button>

                      <label className="flex-1 sm:flex-initial px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
                        <UploadCloud className="w-3.5 h-3.5" />
                        Importar Backup
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const text = await file.text();
                              const json = JSON.parse(text);
                              const res = await SyncService.importLocalDataFromJSON(json);
                              alert(`Backup importado com sucesso! ${res.importedInvoices} faturas prontas para envio.`);
                              await loadPendingStats();
                              if (onSyncSuccess) onSyncSuccess();
                            } catch (err: any) {
                              alert('Erro ao carregar ficheiro de backup: ' + (err?.message || err));
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Sync Result Block */}
                  {syncResult && (
                    <div className={`p-4 rounded-xl border ${
                      syncResult.success 
                        ? 'bg-emerald-50/50 border-emerald-100 text-emerald-950' 
                        : 'bg-rose-50/50 border-rose-100 text-rose-950'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {syncResult.success ? (
                          <Check className="w-4 h-4 text-emerald-600 font-black" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                        )}
                        <span className="text-xs font-black uppercase tracking-wider">
                          {syncResult.success ? 'Sincronização Efetuada!' : 'Falha na Sincronização'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{syncResult.message}</p>
                      {syncResult.success && (
                        <div className="grid grid-cols-2 gap-4 mt-3 bg-white/60 p-3 rounded-lg border border-slate-100 text-[10px] font-black uppercase tracking-wider font-mono">
                          <div className="text-emerald-700">✓ Enviados upstream: {syncResult.pushed} registos</div>
                          <div className="text-blue-700">✓ Recebidos downstream: {syncResult.pulled} registos</div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div className="text-center py-6 bg-slate-50 border border-slate-100 rounded-2xl space-y-4">
                  <div className="w-12 h-12 rounded-full bg-slate-200/50 flex items-center justify-center mx-auto text-slate-400">
                    <Database className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-extrabold text-sm text-slate-800 uppercase tracking-tight">Sem conexão ativa com a Nuvem</h5>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium leading-relaxed">
                      Seus dados de vendas e stock estão guardados localmente com total segurança neste dispositivo.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('setup')}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    Ver Guia de Configuração
                  </button>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: MIGRATION GENERATOR */}
          {activeTab === 'migration' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h5 className="font-extrabold text-sm text-slate-800 uppercase tracking-tight">Script de Migração PostgreSQL</h5>
                  <p className="text-xs text-slate-500 font-medium">Copie e execute este código no SQL Editor do painel do seu Supabase para criar as tabelas correspondentes.</p>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiado!' : 'Copiar SQL'}
                </button>
              </div>

              <div className="relative rounded-2xl border border-slate-200 bg-slate-950 p-4 max-h-72 overflow-y-auto shadow-inner no-print font-mono text-[10px] text-emerald-400 leading-relaxed scrollbar-thin">
                <pre>{sqlMigrationCode}</pre>
              </div>

              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-[11px] text-blue-900 leading-normal font-medium">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  Este script habilita as tabelas <code className="font-bold">users</code>, <code className="font-bold">products</code>, <code className="font-bold">batches</code>, <code className="font-bold">invoices</code>, <code className="font-bold">invoice_items</code> e <code className="font-bold">daily_closures</code> com suporte integrado à fuso horário de Angola (Luanda), índices de performance para relatórios rápidos e políticas RLS de segurança pré-configuradas.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: SETUP INSTRUCTIONS */}
          {activeTab === 'setup' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h5 className="font-extrabold text-sm text-slate-800 uppercase tracking-tight">Como Ativar o Supabase Cloud</h5>
                <p className="text-xs text-slate-500 font-medium">Siga estes 4 passos simples para ativar a redundância em nuvem:</p>
              </div>

              <div className="space-y-4 font-medium text-xs text-slate-700 leading-relaxed">
                
                {/* Step 1 */}
                <div className="flex gap-4 p-4 border border-slate-100 bg-slate-50/50 rounded-2xl">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">1</div>
                  <div className="space-y-1.5">
                    <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider flex items-center gap-1">
                      Criar Conta Supabase 
                      <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-emerald-600 hover:underline gap-0.5 cursor-pointer">
                        (supabase.com) <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                    <p className="text-slate-500">Crie um projeto gratuito e selecione um datacenter adequado à sua localização para otimizar os acessos em Angola.</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4 p-4 border border-slate-100 bg-slate-50/50 rounded-2xl">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">2</div>
                  <div className="space-y-1.5">
                    <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider">Criar Estrutura das Tabelas</p>
                    <p className="text-slate-500">
                      Aceda ao menu <code className="font-bold">SQL Editor</code> do seu projeto Supabase, cole o script disponível na aba <code className="font-bold text-emerald-600 cursor-pointer" onClick={() => setActiveTab('migration')}>"Gerar Migration SQL"</code> e clique em <code className="font-bold">Run</code>.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4 p-4 border border-slate-100 bg-slate-50/50 rounded-2xl">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">3</div>
                  <div className="space-y-1.5">
                    <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider">Obter Chaves de API</p>
                    <p className="text-slate-500">
                      No painel do Supabase, aceda a <code className="font-bold">Settings ➔ API</code> e copie os valores de:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-slate-600 mt-1">
                      <li>Project URL</li>
                      <li>Project API anon public key</li>
                    </ul>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4 p-4 border border-slate-100 bg-slate-50/50 rounded-2xl">
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">4</div>
                  <div className="space-y-1.5">
                    <p className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wider">Colar no ficheiro .env</p>
                    <p className="text-slate-500">
                      Nas definições das suas variáveis de ambiente na AI Studio, adicione as chaves:
                    </p>
                    <div className="bg-slate-950 text-emerald-400 p-2.5 rounded-lg font-mono text-[11px] mt-1.5 select-all">
                      VITE_SUPABASE_URL=sua_url_aqui<br/>
                      VITE_SUPABASE_ANON_KEY=sua_chave_anonima_aqui
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t flex justify-end bg-slate-50">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Fechar Janela
          </button>
        </div>

      </div>
    </div>
  );
};
