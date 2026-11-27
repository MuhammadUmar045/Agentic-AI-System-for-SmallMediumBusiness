-- ==============================================================================
-- VANTAGE AI COO — IDEMPOTENT COMPLETE SCHEMA MIGRATION FOR SUPABASE
-- Run this in Supabase SQL Editor to add any missing tables & columns safely
-- without dropping or losing existing data.
-- ==============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- 1. EMPLOYEES: ensure department & updated_at exist
alter table if exists public.employees
    add column if not exists department text default 'Operations',
    add column if not exists updated_at timestamptz not null default now();

-- 2. ATTENDANCE RECORDS: ensure correction_reason & updated_at exist
alter table if exists public.attendance_records
    add column if not exists correction_reason text,
    add column if not exists updated_at timestamptz not null default now();

-- 3. LEDGER ENTRIES: ensure modern double-entry / analytics columns exist
alter table if exists public.ledger_entries
    add column if not exists entry_date date,
    add column if not exists entry_type text,
    add column if not exists category text default 'General',
    add column if not exists amount numeric(12, 2),
    add column if not exists contact_id uuid,
    add column if not exists source text default 'manual',
    add column if not exists is_voided boolean not null default false,
    add column if not exists voided_reason text,
    add column if not exists updated_at timestamptz not null default now();

-- 4. USERS: ensure password_hash, plan, owner_id exist
alter table if exists public.users
    add column if not exists password_hash text,
    add column if not exists plan text not null default 'standard',
    add column if not exists owner_id uuid;

-- 5. ANOMALIES
create table if not exists public.anomalies (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    type text not null,
    category text,
    description text not null,
    amount numeric(12, 2),
    baseline_amount numeric(12, 2),
    status text not null default 'open',
    detected_at timestamptz not null default now()
);
create index if not exists idx_anomalies_business on public.anomalies(business_id);

-- 6. FINANCIAL RECOMMENDATIONS
create table if not exists public.financial_recommendations (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    title text not null,
    detail text,
    estimated_saving_pkr numeric(12, 2) default 0.00,
    runway_boost_months numeric(4, 2) default 0.00,
    status text not null default 'pending',
    decided_by uuid,
    decided_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists idx_fin_recs_business on public.financial_recommendations(business_id);

-- 7. POS SALES & ITEMS
create table if not exists public.pos_sales (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    invoice_number text not null,
    cashier_id uuid,
    customer_id uuid,
    customer_name text default 'Walk-in Customer',
    subtotal numeric(12, 2) not null default 0.00,
    discount numeric(12, 2) not null default 0.00,
    tax numeric(12, 2) not null default 0.00,
    total numeric(12, 2) not null default 0.00,
    payment_method text not null default 'cash',
    status text not null default 'completed',
    created_at timestamptz not null default now()
);
create index if not exists idx_pos_sales_business on public.pos_sales(business_id, created_at desc);

create table if not exists public.pos_sale_items (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid not null references public.pos_sales(id) on delete cascade,
    product_id uuid,
    item_name text not null,
    quantity integer not null default 1,
    unit_price numeric(12, 2) not null default 0.00,
    subtotal numeric(12, 2) not null default 0.00
);
create index if not exists idx_pos_sale_items_sale on public.pos_sale_items(sale_id);

-- 8. CONTACTS, REORDER ACTIONS, COMMUNICATION DRAFTS, DISPATCH LOG, WHATSAPP LOG
create table if not exists public.contacts (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    name text not null,
    type text not null check (type in ('customer', 'supplier')),
    phone text,
    email text,
    balance_pkr numeric(12, 2) not null default 0.00,
    reliability_score integer default 95,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.reorder_actions (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    product_id uuid,
    supplier_id uuid,
    quantity integer not null,
    channel text not null default 'email',
    message_sent text,
    status text not null default 'dispatched',
    created_at timestamptz not null default now()
);

create table if not exists public.communication_drafts (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    contact_id uuid,
    channel text not null default 'whatsapp',
    message_text text not null,
    status text not null default 'draft',
    approved_by uuid,
    sent_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.dispatch_log (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    draft_id uuid,
    channel text not null,
    recipient text not null,
    status text not null,
    external_id text,
    error_message text,
    dispatched_at timestamptz not null default now()
);

create table if not exists public.whatsapp_message_log (
    id uuid primary key default gen_random_uuid(),
    business_id uuid,
    sender_phone text not null,
    message_direction text not null check (message_direction in ('inbound', 'outbound')),
    message_text text,
    raw_payload jsonb,
    status text default 'processed',
    created_at timestamptz not null default now()
);

-- Reload PostgREST schema cache so API immediately sees new columns/tables
notify pgrst, 'reload schema';
