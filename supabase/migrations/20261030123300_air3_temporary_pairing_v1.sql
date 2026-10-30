-- AIR3 isolated pilot: shared glasses never receive Supabase user credentials.
-- The Edge gateway uses service_role. No anon/authenticated SQL access is granted.
create table if not exists public.crm_air3_pairings_v1 (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 code_salt text not null,
 code_hash text not null,
 status text not null default 'created' check (status in ('created','pending_approval','approved','redeemed','rejected','revoked')),
 device_secret_hash text,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 paired_at timestamptz,
 approved_at timestamptz,
 redeemed_at timestamptz
);
create index if not exists crm_air3_pairings_owner_idx on public.crm_air3_pairings_v1(owner_id,created_at desc);
create index if not exists crm_air3_pairings_open_idx on public.crm_air3_pairings_v1(expires_at) where status='created';
alter table public.crm_air3_pairings_v1 enable row level security;
revoke all on public.crm_air3_pairings_v1 from public, anon, authenticated;
grant all on public.crm_air3_pairings_v1 to service_role;

create table if not exists public.crm_air3_sessions_v1 (
 id uuid primary key default gen_random_uuid(),
 pairing_id uuid not null unique references public.crm_air3_pairings_v1(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique,
 issued_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index if not exists crm_air3_sessions_owner_idx on public.crm_air3_sessions_v1(owner_id,issued_at desc);
alter table public.crm_air3_sessions_v1 enable row level security;
revoke all on public.crm_air3_sessions_v1 from public, anon, authenticated;
grant all on public.crm_air3_sessions_v1 to service_role;

create table if not exists public.crm_air3_rate_limits_v1 (
 bucket text primary key,
 window_start timestamptz not null default now(),
 hits int not null default 0
);
alter table public.crm_air3_rate_limits_v1 enable row level security;
revoke all on public.crm_air3_rate_limits_v1 from public, anon, authenticated;
grant all on public.crm_air3_rate_limits_v1 to service_role;

-- Atomic abuse throttle. Invoker = service role; never publicly callable.
create or replace function public.crm_air3_rate_limit_v1(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_hits integer;
begin
 if length(p_bucket)>160 or p_limit<1 or p_limit>100 or p_window_seconds<1 or p_window_seconds>3600 then return false; end if;
 insert into public.crm_air3_rate_limits_v1(bucket,window_start,hits)
 values(p_bucket,now(),1)
 on conflict(bucket) do update set
   window_start = case when public.crm_air3_rate_limits_v1.window_start < now()-make_interval(secs=>p_window_seconds) then now() else public.crm_air3_rate_limits_v1.window_start end,
   hits = case when public.crm_air3_rate_limits_v1.window_start < now()-make_interval(secs=>p_window_seconds) then 1 else public.crm_air3_rate_limits_v1.hits+1 end
 returning hits into v_hits;
 return v_hits<=p_limit;
end $$;
revoke all on function public.crm_air3_rate_limit_v1(text,integer,integer) from public,anon,authenticated;
grant execute on function public.crm_air3_rate_limit_v1(text,integer,integer) to service_role;
