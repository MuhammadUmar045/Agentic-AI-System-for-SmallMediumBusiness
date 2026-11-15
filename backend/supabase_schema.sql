-- ==============================================================================
-- VANTAGE AI COO - SUPABASE POSTGRESQL SCHEMA WITH PGVECTOR (RAG READY)
-- ==============================================================================
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/_/sql
-- 2. Paste and run this script in the SQL Editor.
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector"; -- Enables pgvector for AI semantic search / RAG

-- ------------------------------------------------------------------------------
-- 2. USERS & ROLE-BASED ACCESS CONTROL (RBAC)
-- ------------------------------------------------------------------------------
-- Roles:
--   - 'owner'   : Full access (finances, team, billing, inventory, POS, AI COO)
--   - 'manager' : Operational access (POS, inventory, analytics, communication)
--   - 'cashier' : Dedicated POS counter only
create table if not exists public.users (
    id text primary key default gen_random_uuid()::text,
    business text not null,
    owner text not null,
    email text unique not null,
    password_hash text not null,
    role text not null check (role in ('owner', 'manager', 'cashier', 'staff', 'admin')),
    plan text not null default 'standard',
    owner_id text references public.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_owner_id on public.users(owner_id);

-- ------------------------------------------------------------------------------
-- 3. SUPPLIERS & VENDORS
-- ------------------------------------------------------------------------------
create table if not exists public.suppliers (
    id text primary key default gen_random_uuid()::text,
    business_id text not null references public.users(id) on delete cascade,
    name text not null,
    contact_person text,
    email text,
    phone text,
    address text,
    categories text[] default '{}',
    payment_terms text default 'Net 30 days',
    lead_time text default '24-48 hours',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_suppliers_business on public.suppliers(business_id);

-- ------------------------------------------------------------------------------
-- 4. INVENTORY & PRODUCT CATALOG
-- ------------------------------------------------------------------------------
create table if not exists public.inventory_items (
    id text primary key default gen_random_uuid()::text,
    business_id text not null references public.users(id) on delete cascade,
    sku text not null,
    barcode text,
    name text not null,
    category text not null default 'General',
    price numeric(12, 2) not null default 0.00,
    cost_price numeric(12, 2) default 0.00,
    stock integer not null default 0,
    threshold integer not null default 20, -- low stock alert threshold
    unit text default 'units',             -- kg, box, unit, pcs
    trend text default 'flat',             -- up, down, flat
    reordered boolean not null default false,
    supplier_id text references public.suppliers(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(business_id, sku)
);

create index if not exists idx_inventory_business on public.inventory_items(business_id);
create index if not exists idx_inventory_sku on public.inventory_items(sku);
create index if not exists idx_inventory_stock on public.inventory_items(business_id, stock);

-- ------------------------------------------------------------------------------
-- 5. CUSTOMERS & KHATA (RECEIVABLES / DEBITS)
-- ------------------------------------------------------------------------------
create table if not exists public.customers (
    id text primary key default gen_random_uuid()::text,
    business_id text not null references public.users(id) on delete cascade,
    name text not null,
    contact_person text,
    phone text,
    email text,
    city text,
    debit numeric(12, 2) not null default 0.00,       -- Pending balance owed
    credit_limit numeric(12, 2) not null default 0.00, -- Max allowed credit
    last_purchase timestamptz,
    status text not null default 'current' check (status in ('current', 'overdue', 'cleared')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_customers_business on public.customers(business_id);
create index if not exists idx_customers_debit on public.customers(business_id, debit);

-- ------------------------------------------------------------------------------
-- 6. POS SALES, INVOICES & LINE ITEMS
-- ------------------------------------------------------------------------------
create table if not exists public.sales (
    id text primary key default gen_random_uuid()::text,
    business_id text not null references public.users(id) on delete cascade,
    invoice_number text not null,
    cashier_id text references public.users(id) on delete set null,
    customer_id text references public.customers(id) on delete set null,
    subtotal numeric(12, 2) not null default 0.00,
    discount numeric(12, 2) not null default 0.00,
    tax numeric(12, 2) not null default 0.00,
    total numeric(12, 2) not null default 0.00,
    payment_method text not null default 'Cash' check (payment_method in ('Cash', 'Card', 'Bank Transfer', 'Credit/Khata', 'Split')),
    status text not null default 'completed' check (status in ('completed', 'refunded', 'voided', 'hold')),
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_sales_business on public.sales(business_id);
create index if not exists idx_sales_created_at on public.sales(business_id, created_at desc);

create table if not exists public.sale_items (
    id text primary key default gen_random_uuid()::text,
    sale_id text not null references public.sales(id) on delete cascade,
    inventory_item_id text references public.inventory_items(id) on delete set null,
    item_name text not null,
    quantity integer not null check (quantity > 0),
    unit_price numeric(12, 2) not null default 0.00,
    subtotal numeric(12, 2) not null default 0.00
);

create index if not exists idx_sale_items_sale on public.sale_items(sale_id);

-- ------------------------------------------------------------------------------
-- 7. FINANCIAL KPIS, REVENUE SERIES & RECOMMENDATIONS
-- ------------------------------------------------------------------------------
create table if not exists public.finance_series (
    id text primary key default gen_random_uuid()::text,
    business_id text not null references public.users(id) on delete cascade,
    month text not null, -- e.g. 'Jan', 'Feb', '2026-03'
    revenue numeric(14, 2) not null default 0.00,
    expenses numeric(14, 2) not null default 0.00,
    forecast numeric(14, 2),
    created_at timestamptz not null default now()
);

create index if not exists idx_finance_series_business on public.finance_series(business_id);

create table if not exists public.finance_recommendations (
    id text primary key default gen_random_uuid()::text,
    business_id text not null references public.users(id) on delete cascade,
    title text not null,
    detail text not null,
    impact_label text,
    impact_value numeric(12, 2) default 0.00,
    runway_boost numeric(4, 2) default 0.00, -- e.g. +0.3 months
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_finance_recs_business on public.finance_recommendations(business_id);

-- ------------------------------------------------------------------------------
-- 8. COMPACT WORKSPACE CACHE (REALTIME STATE SNAPSHOT)
-- ------------------------------------------------------------------------------
create table if not exists public.workspaces (
    business_id text primary key references public.users(id) on delete cascade,
    state jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 9. AI CONVERSATIONS & CHAT HISTORY
-- ------------------------------------------------------------------------------
create table if not exists public.conversations (
    id text primary key,
    user_id text not null references public.users(id) on delete cascade,
    messages jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_user on public.conversations(user_id, updated_at desc);

-- ------------------------------------------------------------------------------
-- 10. PGVECTOR FOR RAG (AI BUSINESS KNOWLEDGE BASE & EMBEDDINGS)
-- ------------------------------------------------------------------------------
-- 1536 dimensions matches standard OpenAI embeddings (text-embedding-3-small, text-embedding-ada-002)
create table if not exists public.business_knowledge (
    id text primary key default gen_random_uuid()::text,
    business_id text not null references public.users(id) on delete cascade,
    category text not null check (category in ('inventory', 'finance', 'policy', 'customer', 'supplier', 'sales', 'general')),
    title text not null,
    content text not null,                       -- The raw context text for the LLM
    metadata jsonb default '{}'::jsonb,          -- Extensible data (sku, customer_id, date, tags, source)
    embedding vector(1536),                      -- pgvector embedding column
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_business on public.business_knowledge(business_id);

-- HNSW Vector Index for ultra-fast approximate nearest neighbor (ANN) cosine distance search
create index if not exists idx_knowledge_embedding_hnsw
    on public.business_knowledge
    using hnsw (embedding vector_cosine_ops);

-- ------------------------------------------------------------------------------
-- 11. RAG SEMANTIC SEARCH FUNCTION (CALLED BY FASTAPI / SUPABASE CLIENT)
-- ------------------------------------------------------------------------------
create or replace function public.match_business_knowledge (
    query_embedding vector(1536),
    match_threshold float default 0.65,
    match_count int default 5,
    filter_business_id text default null,
    filter_category text default null
)
returns table (
    id text,
    business_id text,
    category text,
    title text,
    content text,
    metadata jsonb,
    similarity float
)
language sql stable
as $$
    select
        bk.id,
        bk.business_id,
        bk.category,
        bk.title,
        bk.content,
        bk.metadata,
        1 - (bk.embedding <=> query_embedding) as similarity
    from public.business_knowledge bk
    where
        (filter_business_id is null or bk.business_id = filter_business_id)
        and (filter_category is null or bk.category = filter_category)
        and 1 - (bk.embedding <=> query_embedding) > match_threshold
    order by bk.embedding <=> query_embedding
    limit match_count;
$$;

-- ------------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.finance_series enable row level security;
alter table public.finance_recommendations enable row level security;
alter table public.workspaces enable row level security;
alter table public.conversations enable row level security;
alter table public.business_knowledge enable row level security;

-- Enable API access for backend service_role and anon tokens
do $$
declare
    t text;
begin
    for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('drop policy if exists "Enable API full access on %I" on public.%I;', t, t);
        execute format('create policy "Enable API full access on %I" on public.%I for all using (true) with check (true);', t, t);
    end loop;
end $$;
