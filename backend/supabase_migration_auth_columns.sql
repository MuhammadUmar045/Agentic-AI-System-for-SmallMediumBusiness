-- Safe additive migration for existing Supabase projects.
-- New registration requires these columns on public.users.
-- Existing rows are preserved; new registrations provide password_hash.

alter table public.users
    add column if not exists password_hash text;

alter table public.users
    add column if not exists plan text not null default 'standard';

alter table public.users
    add column if not exists owner_id uuid;
