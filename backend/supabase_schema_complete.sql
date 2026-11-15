-- ==============================================================================
-- AI COO (SMEO) - COMPLETE SUPABASE POSTGRESQL SCHEMA WITH PGVECTOR & RLS (24 TABLES)
-- ==============================================================================
-- Compliance: FYP SRS (Chapter 3), SDD (Chapter 4), SEC-4, SEC-5, SEC-8, SEC-10
-- Tables (24):
--   1. businesses             2. users                    3. subscriptions
--   4. ai_usage_logs          5. agent_tasks              6. contacts
--   7. products               8. stock_history            9. reorder_actions
--  10. ledger_entries        11. anomalies               12. financial_recommendations
--  13. communication_drafts  14. dispatch_log            15. employees
--  16. attendance_records    17. leave_requests          18. payroll_runs
--  19. payslips              20. hr_policy_chunks        21. pos_sales
--  22. pos_sale_items        23. whatsapp_message_log    24. audit_logs
--  Plus compatibility tables: workspaces, conversations
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector"; -- pgvector for HR policy RAG

-- ------------------------------------------------------------------------------
-- 2. TENANT BUSINESSES & CONFIGURATION
-- ------------------------------------------------------------------------------
create table if not exists public.businesses (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    industry text default 'Retail',
    currency text default 'PKR',
    tax_rate numeric(5, 2) default 0.00,
    annual_leave_days integer default 14,
    working_days_per_month integer default 26,
    low_stock_threshold_default integer default 20,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Helper function for RLS: extracts current user's business_id from JWT or users table
create or replace function public.get_my_business_id()
returns uuid
language sql stable
as $$
    select coalesce(
        nullif(current_setting('request.jwt.claims', true)::jsonb->>'business_id', '')::uuid,
        (select business_id from public.users where id = nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid limit 1)
    );
$$;

-- ------------------------------------------------------------------------------
-- 3. USERS & FIVE-ROLE RBAC (SEC-4)
-- ------------------------------------------------------------------------------
-- Roles exactly five: owner, manager, hr_officer, cashier, staff
create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    full_name text not null,
    email text unique not null,
    phone_number text unique,
    password_hash text not null,
    role text not null check (role in ('owner', 'manager', 'hr_officer', 'cashier', 'staff')),
    status text not null default 'active' check (status in ('pending_verification', 'active', 'locked', 'suspended')),
    failed_login_count integer default 0,
    plan text not null default 'standard',
    owner_id uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_users_business on public.users(business_id);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_phone on public.users(phone_number);

-- ------------------------------------------------------------------------------
-- 4. SUBSCRIPTIONS & AI USAGE METER (FR-P.5)
-- ------------------------------------------------------------------------------
create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null unique references public.businesses(id) on delete cascade,
    plan text not null default 'standard',
    ai_query_allowance integer not null default 500,
    ai_queries_used integer not null default 0,
    status text not null default 'active',
    current_period_end timestamptz default (now() + interval '30 days'),
    created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_business on public.subscriptions(business_id);

create table if not exists public.ai_usage_logs (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    user_id uuid references public.users(id) on delete set null,
    agent_type text not null,
    model text not null,
    prompt_tokens integer default 0,
    completion_tokens integer default 0,
    total_tokens integer default 0,
    endpoint text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_business on public.ai_usage_logs(business_id);

-- ------------------------------------------------------------------------------
-- 5. AGENT TASKS (GOAL PLANNER FR-1.1 - 1.3)
-- ------------------------------------------------------------------------------
create table if not exists public.agent_tasks (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    title text not null,
    description text,
    agent_type text not null,
    status text not null default 'queued' check (status in ('queued', 'pending_approval', 'running', 'completed')),
    assigned_to uuid references public.users(id) on delete set null,
    payload jsonb default '{}'::jsonb,
    result jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_agent_tasks_biz_status on public.agent_tasks(business_id, status);

-- ------------------------------------------------------------------------------
-- 6. CONTACTS (SUPPLIERS & CUSTOMERS)
-- ------------------------------------------------------------------------------
create table if not exists public.contacts (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    name text not null,
    type text not null check (type in ('supplier', 'customer')),
    contact_person text,
    phone text,
    email text,
    address text,
    debit numeric(14, 2) default 0.00,
    credit_limit numeric(14, 2) default 0.00,
    payment_terms text default 'Net 30 days',
    lead_time_days integer default 3,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_business on public.contacts(business_id);
create index if not exists idx_contacts_type on public.contacts(business_id, type);

-- ------------------------------------------------------------------------------
-- 7. PRODUCTS (INVENTORY FR-3.1)
-- ------------------------------------------------------------------------------
create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    sku text not null,
    barcode text,
    name text not null,
    category text not null default 'General',
    cost_price numeric(12, 2) default 0.00,
    selling_price numeric(12, 2) not null default 0.00,
    stock_units integer not null default 0 check (stock_units >= 0),
    max_capacity integer not null default 200,
    reorder_threshold integer not null default 20,
    lead_time_days integer default 3,
    safety_stock_days integer default 2,
    supplier_id uuid references public.contacts(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(business_id, sku)
);

create index if not exists idx_products_business on public.products(business_id);
create index if not exists idx_products_sku on public.products(sku);

-- ------------------------------------------------------------------------------
-- 8. STOCK HISTORY (APPEND-ONLY SEC-10)
-- ------------------------------------------------------------------------------
create table if not exists public.stock_history (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete cascade,
    change_qty integer not null,
    new_stock integer not null,
    reason text not null,
    reference_id text,
    created_at timestamptz not null default now()
);

create index if not exists idx_stock_history_business on public.stock_history(business_id);
create index if not exists idx_stock_history_product on public.stock_history(product_id, created_at desc);

-- ------------------------------------------------------------------------------
-- 9. REORDER ACTIONS (HITL INVENTORY PURCHASE DRAFT SEC-8)
-- ------------------------------------------------------------------------------
create table if not exists public.reorder_actions (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete cascade,
    supplier_id uuid references public.contacts(id) on delete set null,
    recommended_qty integer not null,
    status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'dispatched', 'cancelled')),
    approved_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_reorder_actions_business on public.reorder_actions(business_id);

-- ------------------------------------------------------------------------------
-- 10. LEDGER ENTRIES (ACCOUNTING FR-2.1)
-- ------------------------------------------------------------------------------
create table if not exists public.ledger_entries (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    entry_date date not null default current_date,
    entry_type text not null check (entry_type in ('revenue', 'expense')),
    category text not null,
    amount numeric(14, 2) not null check (amount > 0),
    contact_id uuid references public.contacts(id) on delete set null,
    description text,
    source text not null check (source in ('manual', 'csv_import', 'pos')),
    is_voided boolean default false,
    voided_reason text,
    created_at timestamptz not null default now()
);

create index if not exists idx_ledger_business_date on public.ledger_entries(business_id, entry_date desc);

-- ------------------------------------------------------------------------------
-- 11. ANOMALIES & FINANCIAL RECOMMENDATIONS (FR-2.2 - 2.4)
-- ------------------------------------------------------------------------------
create table if not exists public.anomalies (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    type text not null, -- 'expense_spike_40', 'duplicate_bill', 'overhead_trend'
    category text,
    description text not null,
    amount numeric(14, 2),
    baseline_amount numeric(14, 2),
    status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
    detected_at timestamptz not null default now()
);

create index if not exists idx_anomalies_business on public.anomalies(business_id);

create table if not exists public.financial_recommendations (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    title text not null,
    detail text not null,
    estimated_saving_pkr numeric(14, 2) default 0.00,
    runway_boost_months numeric(4, 2) default 0.00,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_fin_recs_business on public.financial_recommendations(business_id);

-- ------------------------------------------------------------------------------
-- 12. COMMUNICATIONS & DISPATCH (FR-4.1 - 4.4, HITL SEC-8)
-- ------------------------------------------------------------------------------
create table if not exists public.communication_drafts (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    customer_id uuid references public.contacts(id) on delete set null,
    recipient_name text not null,
    recipient_contact text not null,
    channel text not null default 'email' check (channel in ('email', 'whatsapp')),
    subject text,
    content text not null,
    draft_type text default 'follow_up',
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'deferred', 'sent')),
    created_at timestamptz not null default now()
);

create index if not exists idx_comm_drafts_biz_status on public.communication_drafts(business_id, status);

create table if not exists public.dispatch_log (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    draft_id uuid references public.communication_drafts(id) on delete set null,
    channel text not null check (channel in ('email', 'whatsapp')),
    recipient text not null,
    status text not null check (status in ('sent', 'failed')),
    error_message text,
    dispatched_at timestamptz not null default now()
);

create index if not exists idx_dispatch_log_business on public.dispatch_log(business_id);

-- ------------------------------------------------------------------------------
-- 13. EMPLOYEES & HR MANAGEMENT (FR-5.1)
-- ------------------------------------------------------------------------------
create table if not exists public.employees (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    user_id uuid references public.users(id) on delete set null,
    full_name text not null,
    email text not null,
    phone text,
    role text not null check (role in ('owner', 'manager', 'hr_officer', 'cashier', 'staff')),
    base_salary numeric(12, 2) not null default 0.00,
    employment_status text not null default 'active' check (employment_status in ('active', 'inactive')),
    join_date date not null default current_date,
    department text default 'Operations',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_employees_business on public.employees(business_id);

-- ------------------------------------------------------------------------------
-- 14. ATTENDANCE RECORDS (FR-5.2)
-- ------------------------------------------------------------------------------
create table if not exists public.attendance_records (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    employee_id uuid not null references public.employees(id) on delete cascade,
    work_date date not null default current_date,
    check_in timestamptz,
    check_out timestamptz,
    net_hours numeric(5, 2) default 0.00,
    status text not null default 'incomplete' check (status in ('present', 'incomplete', 'corrected', 'absent')),
    correction_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(employee_id, work_date)
);

create index if not exists idx_attendance_biz_date on public.attendance_records(business_id, work_date);

-- ------------------------------------------------------------------------------
-- 15. LEAVE REQUESTS & WORKFLOW (FR-5.3)
-- ------------------------------------------------------------------------------
create table if not exists public.leave_requests (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    employee_id uuid not null references public.employees(id) on delete cascade,
    start_date date not null,
    end_date date not null,
    leave_type text not null check (leave_type in ('annual', 'sick', 'unpaid', 'casual')),
    reason text,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    is_flagged boolean default false,
    flag_reason text,
    reviewed_by uuid references public.users(id) on delete set null,
    review_comment text,
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_leave_requests_business on public.leave_requests(business_id);

-- ------------------------------------------------------------------------------
-- 16. PAYROLL RUNS & PAYSLIPS (FR-5.4, UC-7, HITL SEC-8)
-- ------------------------------------------------------------------------------
create table if not exists public.payroll_runs (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    payroll_month text not null, -- 'YYYY-MM'
    status text not null default 'draft' check (status in ('draft', 'pending_approval', 'finalised', 'incomplete')),
    total_net_salary numeric(14, 2) default 0.00,
    approved_by uuid references public.users(id) on delete set null,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(business_id, payroll_month)
);

create index if not exists idx_payroll_runs_business on public.payroll_runs(business_id);

create table if not exists public.payslips (
    id uuid primary key default gen_random_uuid(),
    payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
    employee_id uuid not null references public.employees(id) on delete cascade,
    base_salary numeric(12, 2) not null,
    unpaid_leave_days integer default 0,
    leave_deduction numeric(12, 2) default 0.00,
    bonus_overtime numeric(12, 2) default 0.00,
    net_salary numeric(12, 2) not null,
    status text not null default 'complete' check (status in ('complete', 'incomplete', 'finalised')),
    notes text,
    created_at timestamptz not null default now(),
    unique(payroll_run_id, employee_id)
);

create index if not exists idx_payslips_run on public.payslips(payroll_run_id);
create index if not exists idx_payslips_employee on public.payslips(employee_id);

-- ------------------------------------------------------------------------------
-- 17. HR POLICY CHUNKS (PGVECTOR RAG FR-5.5)
-- ------------------------------------------------------------------------------
create table if not exists public.hr_policy_chunks (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    document_name text not null,
    content text not null,
    chunk_index integer default 0,
    embedding vector(1536),
    created_at timestamptz not null default now()
);

create index if not exists idx_hr_policy_business on public.hr_policy_chunks(business_id);
create index if not exists idx_hr_policy_embedding_hnsw
    on public.hr_policy_chunks
    using hnsw (embedding vector_cosine_ops);

-- RAG function for HR policy semantic search
create or replace function public.match_hr_policies (
    query_embedding vector(1536),
    match_threshold float default 0.60,
    match_count int default 4,
    filter_business_id uuid default null
)
returns table (
    id uuid,
    business_id uuid,
    document_name text,
    content text,
    similarity float
)
language sql stable
as $$
    select
        h.id,
        h.business_id,
        h.document_name,
        h.content,
        1 - (h.embedding <=> query_embedding) as similarity
    from public.hr_policy_chunks h
    where
        (filter_business_id is null or h.business_id = filter_business_id)
        and 1 - (h.embedding <=> query_embedding) > match_threshold
    order by h.embedding <=> query_embedding
    limit match_count;
$$;

-- ------------------------------------------------------------------------------
-- 18. POS SALES & SALE ITEMS (FR-6.1 - 6.2)
-- ------------------------------------------------------------------------------
create table if not exists public.pos_sales (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    invoice_number text not null,
    cashier_id uuid references public.users(id) on delete set null,
    customer_id uuid references public.contacts(id) on delete set null,
    customer_name text default 'Walk-in Customer',
    subtotal numeric(12, 2) not null default 0.00,
    discount numeric(12, 2) not null default 0.00,
    tax numeric(12, 2) not null default 0.00,
    total numeric(12, 2) not null default 0.00,
    payment_method text not null check (payment_method in ('cash', 'card', 'raast', 'credit', 'split')),
    status text not null default 'completed' check (status in ('completed', 'voided', 'refunded')),
    created_at timestamptz not null default now()
);

create index if not exists idx_pos_sales_business on public.pos_sales(business_id, created_at desc);

create table if not exists public.pos_sale_items (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid not null references public.pos_sales(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    item_name text not null,
    quantity integer not null check (quantity > 0),
    unit_price numeric(12, 2) not null,
    subtotal numeric(12, 2) not null
);

create index if not exists idx_pos_sale_items_sale on public.pos_sale_items(sale_id);

-- ------------------------------------------------------------------------------
-- 19. WHATSAPP MESSAGE LOG (FR-6.3 - 6.4)
-- ------------------------------------------------------------------------------
create table if not exists public.whatsapp_message_log (
    id uuid primary key default gen_random_uuid(),
    business_id uuid references public.businesses(id) on delete set null,
    sender_phone text not null,
    message_direction text not null check (message_direction in ('inbound', 'outbound')),
    message_text text,
    raw_payload jsonb,
    status text default 'processed',
    created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_sender on public.whatsapp_message_log(sender_phone);

-- ------------------------------------------------------------------------------
-- 20. AUDIT LOGS (APPEND-ONLY SEC-10)
-- ------------------------------------------------------------------------------
create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    user_id uuid references public.users(id) on delete set null,
    action text not null,
    entity_type text not null,
    entity_id text not null,
    channel text not null check (channel in ('web', 'whatsapp')),
    details jsonb default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_business on public.audit_logs(business_id, created_at desc);

-- ------------------------------------------------------------------------------
-- 21. COMPATIBILITY TABLES (REALTIME WORKSPACES & CONVERSATIONS)
-- ------------------------------------------------------------------------------
create table if not exists public.workspaces (
    business_id uuid primary key references public.businesses(id) on delete cascade,
    state jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
    id text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    messages jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 22. ROW LEVEL SECURITY (RLS) POLICIES ON ALL 24 TABLES (SEC-5)
-- ------------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.contacts enable row level security;
alter table public.products enable row level security;
alter table public.stock_history enable row level security;
alter table public.reorder_actions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.anomalies enable row level security;
alter table public.financial_recommendations enable row level security;
alter table public.communication_drafts enable row level security;
alter table public.dispatch_log enable row level security;
alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payslips enable row level security;
alter table public.hr_policy_chunks enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;
alter table public.whatsapp_message_log enable row level security;
alter table public.audit_logs enable row level security;
alter table public.workspaces enable row level security;
alter table public.conversations enable row level security;

-- Tenant Isolation Policies:
-- Users can only read/modify data within their business_id
do $$
declare
    t text;
    tables text[] := array[
        'users', 'subscriptions', 'ai_usage_logs', 'agent_tasks', 'contacts',
        'products', 'reorder_actions', 'ledger_entries', 'anomalies',
        'financial_recommendations', 'communication_drafts', 'dispatch_log',
        'employees', 'attendance_records', 'leave_requests', 'payroll_runs',
        'hr_policy_chunks', 'pos_sales', 'workspaces'
    ];
begin
    foreach t in array tables loop
        execute format('drop policy if exists "%s_tenant_isolation" on public.%I;', t, t);
        execute format('create policy "%s_tenant_isolation" on public.%I for all using (business_id = public.get_my_business_id()) with check (business_id = public.get_my_business_id());', t, t);
    end loop;
end $$;

-- Businesses table: users can read their own business
drop policy if exists "businesses_tenant_isolation" on public.businesses;
create policy "businesses_tenant_isolation" on public.businesses
    for select using (id = public.get_my_business_id());

-- APPEND-ONLY TABLES: stock_history and audit_logs
-- Only SELECT and INSERT are allowed. No UPDATE or DELETE policy exists for any role!
drop policy if exists "stock_history_select" on public.stock_history;
drop policy if exists "stock_history_insert" on public.stock_history;
create policy "stock_history_select" on public.stock_history for select using (business_id = public.get_my_business_id());
create policy "stock_history_insert" on public.stock_history for insert with check (business_id = public.get_my_business_id());

drop policy if exists "audit_logs_select" on public.audit_logs;
drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs for select using (business_id = public.get_my_business_id());
create policy "audit_logs_insert" on public.audit_logs for insert with check (business_id = public.get_my_business_id());

-- Child tables linked via parent:
drop policy if exists "payslips_tenant_isolation" on public.payslips;
create policy "payslips_tenant_isolation" on public.payslips
    for all using (
        payroll_run_id in (select id from public.payroll_runs where business_id = public.get_my_business_id())
    );

drop policy if exists "pos_sale_items_tenant_isolation" on public.pos_sale_items;
create policy "pos_sale_items_tenant_isolation" on public.pos_sale_items
    for all using (
        sale_id in (select id from public.pos_sales where business_id = public.get_my_business_id())
    );

drop policy if exists "conversations_user_isolation" on public.conversations;
create policy "conversations_user_isolation" on public.conversations
    for all using (
        user_id in (select id from public.users where business_id = public.get_my_business_id())
    );

-- WhatsApp message log:
drop policy if exists "whatsapp_log_select" on public.whatsapp_message_log;
create policy "whatsapp_log_select" on public.whatsapp_message_log
    for select using (business_id = public.get_my_business_id() or business_id is null);

-- Grant service role full bypass (so backend service role key can execute all background tasks)
grant all on all tables in schema public to service_role;
grant all on all functions in schema public to service_role;
