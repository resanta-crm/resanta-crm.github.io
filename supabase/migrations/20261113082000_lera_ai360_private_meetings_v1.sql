-- Lera AI Agent 360: private planned meetings, not factual GPS visits.
-- Only the authenticated owner can create/read own plans. No public access.
create table if not exists public.crm_ai360_meetings_v1 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('meeting','client_meeting')),
  format text not null check (format in ('in_person','remote','internal')),
  title text not null check (char_length(title) between 8 and 160),
  purpose text not null check (char_length(purpose) between 8 and 800),
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 240),
  location text not null default '',
  participants text[] not null default '{}'::text[],
  source text not null default 'lera_ai360_confirmed_v1',
  created_at timestamptz not null default now(),
  constraint crm_ai360_meetings_client_name_length check (char_length(coalesce(client_name,''))<=180),
  constraint crm_ai360_meetings_location_length check (char_length(location)<=250),
  constraint crm_ai360_meetings_participants_count check (cardinality(participants)<=20)
);
create unique index if not exists crm_ai360_meetings_owner_slot_v1
  on public.crm_ai360_meetings_v1(owner_id,starts_at,title);
create index if not exists crm_ai360_meetings_owner_upcoming_v1
  on public.crm_ai360_meetings_v1(owner_id,starts_at desc);
alter table public.crm_ai360_meetings_v1 enable row level security;
revoke all on public.crm_ai360_meetings_v1 from public,anon,authenticated;
grant select,insert on public.crm_ai360_meetings_v1 to authenticated;
drop policy if exists "Lera meetings read own" on public.crm_ai360_meetings_v1;
create policy "Lera meetings read own" on public.crm_ai360_meetings_v1
for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Lera meetings insert own" on public.crm_ai360_meetings_v1;
create policy "Lera meetings insert own" on public.crm_ai360_meetings_v1
for insert to authenticated with check ((select auth.uid()) = owner_id);
comment on table public.crm_ai360_meetings_v1 is
'Private plans from Lera, not GPS visit evidence or confirmed invitations; explicit two-phase approval at Edge Function';
