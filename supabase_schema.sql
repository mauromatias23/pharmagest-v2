-- PharmaGest Angola - Supabase PostgreSQL Schema Migration
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

-- 5. CREATE INVOICES TABLE (With ON DELETE SET NULL on users)
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

-- 6. CREATE INVOICE ITEMS TABLE (With ON DELETE CASCADE on invoices, ON DELETE SET NULL on products and batches)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    batch_id TEXT REFERENCES public.batches(id) ON DELETE SET NULL,
    lot_number TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15, 2) NOT NULL,
    subtotal NUMERIC(15, 2) NOT NULL,
    vat_amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Luanda'::text, now())
);

-- 7. CREATE DAILY CLOSURES TABLE (With ON DELETE SET NULL on users)
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

-- 8. UPGRADE EXISTING COLUMNS AND FOREIGN KEYS TO ON DELETE CASCADE / ON DELETE SET NULL
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
    ALTER TABLE IF EXISTS public.invoice_items ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

    -- Fix invoice_items -> batches
    ALTER TABLE IF EXISTS public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_batch_id_fkey;
    ALTER TABLE IF EXISTS public.invoice_items ADD CONSTRAINT invoice_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE SET NULL;

    -- Fix invoices -> users
    ALTER TABLE IF EXISTS public.invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
    ALTER TABLE IF EXISTS public.invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

    -- Fix daily_closures -> users
    ALTER TABLE IF EXISTS public.daily_closures DROP CONSTRAINT IF EXISTS daily_closures_user_id_fkey;
    ALTER TABLE IF EXISTS public.daily_closures ADD CONSTRAINT daily_closures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION
    WHEN OTHERS THEN RAISE NOTICE 'Constraints update error: %', SQLERRM;
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

