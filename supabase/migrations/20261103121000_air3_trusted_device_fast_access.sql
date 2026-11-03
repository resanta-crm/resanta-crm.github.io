-- AIR3 device registration is a non-exportable Android Keystore key pair,
-- not a CRM login, refresh token or long-lived CRM session.
create table if not exists public.crm_air3_trusted_devices_v1 (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 first_pairing_id uuid not null unique references public.crm_air3_pairings_v1(id) on delete cascade,
 public_key_spki text not null,
 label text not null default 'INMO AIR3',
 created_at timestamptz not null default now(),
 last_seen_at timestamptz,
 revoked_at timestamptz
);
create index if not exists crm_air3_trusted_owner_idx on public.crm_air3_trusted_devices_v1(owner_id,revoked_at);
alter table public.crm_air3_trusted_devices_v1 enable row level security;
revoke all on public.crm_air3_trusted_devices_v1 from public,anon,authenticated;
grant all on public.crm_air3_trusted_devices_v1 to service_role;
create table if not exists public.crm_air3_fast_challenges_v1 (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references public.crm_air3_trusted_devices_v1(id) on delete cascade,
 nonce text not null,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists crm_air3_fast_challenge_expire_idx on public.crm_air3_fast_challenges_v1(expires_at);
alter table public.crm_air3_fast_challenges_v1 enable row level security;
revoke all on public.crm_air3_fast_challenges_v1 from public,anon,authenticated;
grant all on public.crm_air3_fast_challenges_v1 to service_role;
