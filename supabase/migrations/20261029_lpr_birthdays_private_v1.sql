-- New independent feature only: no modifications to clients, VIP membership, GPS or CRM roles.
-- LPR birth day/month deliberately excludes year and personal phone, with explicit user ownership.
create table if not exists public.crm_lpr_contacts_v1(
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 full_name text not null check(length(btrim(full_name)) between 2 and 120),
 position_title text not null default '' check(length(position_title)<=120),
 birth_month smallint not null check(birth_month between 1 and 12),
 birth_day smallint not null check(birth_day between 1 and 31),
 note text not null default '' check(length(note)<=200),
 created_by uuid not null,
 updated_by uuid not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (make_date(2000,birth_month,birth_day) is not null)
);
create index if not exists crm_lpr_contacts_v1_client_idx on public.crm_lpr_contacts_v1(client_id) where active;
create unique index if not exists crm_lpr_contacts_v1_person_unique on public.crm_lpr_contacts_v1(client_id,lower(btrim(full_name))) where active;
alter table public.crm_lpr_contacts_v1 enable row level security;
revoke all on public.crm_lpr_contacts_v1 from anon,authenticated;

-- Telegram idempotency: one recipient per person, event and occurrence date.
-- Service-role dispatcher only. No unsafe public write endpoint.
create table if not exists public.crm_lpr_birthday_delivery_v1(
 id uuid primary key default gen_random_uuid(),
 lpr_id uuid not null references public.crm_lpr_contacts_v1(id) on delete cascade,
 recipient_user_id uuid not null,
 event_date date not null,
 event_kind text not null check(event_kind in ('3_days','birthday')),
 status text not null default 'pending' check(status in ('pending','sent','failed','no_binding')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 last_error text,
 delivered_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(lpr_id,recipient_user_id,event_date,event_kind)
);
create index if not exists crm_lpr_birthday_delivery_v1_status_idx on public.crm_lpr_birthday_delivery_v1(event_date,status);
alter table public.crm_lpr_birthday_delivery_v1 enable row level security;
revoke all on public.crm_lpr_birthday_delivery_v1 from anon,authenticated;

create or replace function public.crm_lpr_birthday_dispatch_v1()
returns bigint
language plpgsql security definer
set search_path=public,extensions,pg_catalog
as $$
declare s text; request_id bigint;
begin
 if current_user not in ('postgres','service_role') then
   raise exception 'LPR_DISPATCH_FORBIDDEN' using errcode='42501';
 end if;
 select value->>'secret' into s from public.crm_telegram_runtime where key='dispatch_secret';
 if nullif(s,'') is null then raise exception 'LPR_DISPATCH_SECRET_MISSING'; end if;
 select net.http_post(
   url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-lpr-birthdays-v1',
   headers:=jsonb_build_object('content-type','application/json','x-crm-dispatch-secret',s),
   body:='{"action":"dispatch"}'::jsonb,
   timeout_milliseconds:=15000
 ) into request_id;
 return request_id;
end;
$$;
revoke all on function public.crm_lpr_birthday_dispatch_v1() from public,anon,authenticated;
-- At 10:00 Minsk (07:00 UTC); no messages sent if no contacts exist.
-- The scheduled job is installed explicitly during deployment after edge verification.
