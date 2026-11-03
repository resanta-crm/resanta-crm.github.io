-- AIR3 stage link: only an already authenticated owner can project live CRM.
-- The stage stores navigation intent only, never CRM data or device tokens.
create table if not exists public.crm_air3_stage_v1 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique references public.crm_air3_sessions_v1(id) on delete cascade,
  status text not null default 'active' check (status in ('active','closed')),
  page_id text,
  command_id uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_air3_stage_owner_active_idx on public.crm_air3_stage_v1(owner_id, status, expires_at desc);
alter table public.crm_air3_stage_v1 enable row level security;
revoke all on public.crm_air3_stage_v1 from public, anon, authenticated;
grant all on public.crm_air3_stage_v1 to service_role;
comment on table public.crm_air3_stage_v1 is 'Presentation-only navigation commands for owner-authorized AIR3 active sessions; no customer data.';
