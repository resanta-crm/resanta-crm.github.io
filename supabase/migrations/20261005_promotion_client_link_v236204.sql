-- RESANTA CRM v23.6.204
-- Permanent purchase_history -> clients linkage:
-- 1) ignore archived/deleted duplicate cards;
-- 2) strict legal-name match first, canonical unique active-name match second;
-- 3) database trigger protects every future import even if importer sends client_id=null;
-- 4) backfill existing safe null links with a reversible audit trail.

create or replace function public.crm_client_exact_key_v236204(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      lower(replace(coalesce(p_value,''),'ё','е')),
      '[^0-9a-zа-я]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.crm_client_canonical_key_v236204(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(string_agg(t, ' ' order by ord), '')
  from unnest(string_to_array(public.crm_client_exact_key_v236204(p_value), ' '))
       with ordinality as u(t,ord)
  where t <> all(array[
    'ооо','одо','уп','чуп','чтуп','чпуп','чтпуп','ип',
    'оао','зао','учп','чп','тт','головной'
  ]::text[]);
$$;

create index if not exists clients_exact_key_active_v236204_idx
  on public.clients (public.crm_client_exact_key_v236204(name))
  where coalesce(is_archived,false)=false and coalesce(to_delete,false)=false;

create index if not exists clients_canonical_key_active_v236204_idx
  on public.clients (public.crm_client_canonical_key_v236204(name))
  where coalesce(is_archived,false)=false and coalesce(to_delete,false)=false;

create table if not exists public.crm_client_link_audit_v236204 (
  history_id bigint primary key,
  old_client_id uuid,
  new_client_id uuid not null,
  client_name text,
  month date,
  match_mode text not null,
  linked_at timestamptz not null default now()
);

alter table public.crm_client_link_audit_v236204 enable row level security;

create or replace function public.crm_purchase_history_fill_client_id_v236204()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exact text;
  v_canonical text;
  v_id uuid;
  v_count integer;
begin
  if new.client_id is not null then
    return new;
  end if;

  v_exact := public.crm_client_exact_key_v236204(new.client_name);
  if v_exact <> '' then
    select min(c.id::text)::uuid, count(*)
      into v_id, v_count
    from public.clients c
    where coalesce(c.is_archived,false)=false
      and coalesce(c.to_delete,false)=false
      and public.crm_client_exact_key_v236204(c.name)=v_exact;

    if v_count=1 then
      new.client_id := v_id;
      return new;
    end if;
  end if;

  v_canonical := public.crm_client_canonical_key_v236204(new.client_name);
  if v_canonical <> '' then
    select min(c.id::text)::uuid, count(*)
      into v_id, v_count
    from public.clients c
    where coalesce(c.is_archived,false)=false
      and coalesce(c.to_delete,false)=false
      and public.crm_client_canonical_key_v236204(c.name)=v_canonical;

    if v_count=1 then
      new.client_id := v_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_purchase_history_fill_client_id_v236204 on public.purchase_history;
create trigger trg_purchase_history_fill_client_id_v236204
before insert or update of client_name, client_id
on public.purchase_history
for each row
execute function public.crm_purchase_history_fill_client_id_v236204();

with active_exact as (
  select public.crm_client_exact_key_v236204(c.name) as k,
         min(c.id::text)::uuid as client_id
  from public.clients c
  where coalesce(c.is_archived,false)=false
    and coalesce(c.to_delete,false)=false
    and public.crm_client_exact_key_v236204(c.name)<>''
  group by 1
  having count(*)=1
)
insert into public.crm_client_link_audit_v236204
  (history_id, old_client_id, new_client_id, client_name, month, match_mode)
select h.id, h.client_id, a.client_id, h.client_name, h.month, 'exact_active_name'
from public.purchase_history h
join active_exact a
  on public.crm_client_exact_key_v236204(h.client_name)=a.k
where h.client_id is null
on conflict (history_id) do nothing;

with active_canonical as (
  select public.crm_client_canonical_key_v236204(c.name) as k,
         min(c.id::text)::uuid as client_id
  from public.clients c
  where coalesce(c.is_archived,false)=false
    and coalesce(c.to_delete,false)=false
    and public.crm_client_canonical_key_v236204(c.name)<>''
  group by 1
  having count(*)=1
)
insert into public.crm_client_link_audit_v236204
  (history_id, old_client_id, new_client_id, client_name, month, match_mode)
select h.id, h.client_id, a.client_id, h.client_name, h.month, 'canonical_active_name'
from public.purchase_history h
join active_canonical a
  on public.crm_client_canonical_key_v236204(h.client_name)=a.k
where h.client_id is null
  and not exists (
    select 1 from public.crm_client_link_audit_v236204 z where z.history_id=h.id
  )
on conflict (history_id) do nothing;

update public.purchase_history h
set client_id = a.new_client_id
from public.crm_client_link_audit_v236204 a
where h.id=a.history_id
  and h.client_id is null;
