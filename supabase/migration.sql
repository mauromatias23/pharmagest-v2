-- PharmaGest Angola - Supabase PostgreSQL Schema Migration
-- Designed for seamless synchronization with offline-first IndexedDB (Dexie)
-- Time Zone: Africa/Luanda (Angola)

-- 1. Enable pgcrypto for UUID generation (optional, as we use client-side IDs)
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

-- 4. CREATE BATCHES TABLE
CREATE TABLE IF NOT EXISTS public.batches (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    lot_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    entry_date TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 5. CREATE INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id TEXT,
    customer_name TEXT,
    customer_nif TEXT,
    user_id TEXT NOT NULL REFERENCES public.users(id),
    user_name TEXT NOT NULL,
    date TEXT NOT NULL,
    total_gross NUMERIC(15, 2) NOT NULL,
    total_vat NUMERIC(15, 2) NOT NULL,
    total_net NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Emitida', 'Anulada')),
    payment_method TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 6. CREATE INVOICE ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.products(id),
    product_name TEXT NOT NULL,
    batch_id TEXT NOT NULL REFERENCES public.batches(id),
    lot_number TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15, 2) NOT NULL,
    subtotal NUMERIC(15, 2) NOT NULL,
    vat_amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 7. CREATE DAILY CLOSURES TABLE
CREATE TABLE IF NOT EXISTS public.daily_closures (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES public.users(id),
    user_name TEXT NOT NULL,
    total_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_tpa NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_transfer NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_mixed NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_invoices INTEGER NOT NULL DEFAULT 0,
    grand_total NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    timestamp TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 8. INDEXES FOR SPEED OPTIMIZATION
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(code);
CREATE INDEX IF NOT EXISTS idx_batches_product_id ON public.batches(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON public.invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_daily_closures_date ON public.daily_closures(date);

-- 9. ROW LEVEL SECURITY (RLS) & POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;

-- Create Permissive Anon Policies
CREATE POLICY "Allow public select on users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert on users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on users" ON public.users FOR UPDATE USING (true);

CREATE POLICY "Allow public select on products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow public insert on products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on products" ON public.products FOR UPDATE USING (true);

CREATE POLICY "Allow public select on batches" ON public.batches FOR SELECT USING (true);
CREATE POLICY "Allow public insert on batches" ON public.batches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on batches" ON public.batches FOR UPDATE USING (true);

CREATE POLICY "Allow public select on invoices" ON public.invoices FOR SELECT USING (true);
CREATE POLICY "Allow public insert on invoices" ON public.invoices FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on invoices" ON public.invoices FOR UPDATE USING (true);

CREATE POLICY "Allow public select on invoice_items" ON public.invoice_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert on invoice_items" ON public.invoice_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select on daily_closures" ON public.daily_closures FOR SELECT USING (true);
CREATE POLICY "Allow public insert on daily_closures" ON public.daily_closures FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on daily_closures" ON public.daily_closures FOR UPDATE USING (true);

-- 10. REAL-TIME PUBLICATION
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.batches;
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.invoice_items;
alter publication supabase_realtime add table public.daily_closures;
