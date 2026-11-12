-- РЕСАНТА CRM · Access 360 / Email invitation and hard read-only company executive
-- 2026-11-12. Existing 12 users are preserved. No legacy sales, stock, GPS or finance data changed.
create table if not exists public.crm_access_invites_v1(
 email text primary key,
 display_name text not null,
 requested_role text not null check (requested_role in ('executive_viewer','manager','office_manager','service_manager','auditor')),
 region text not null,
 access_scope text not null default 'standard',
 status text not null default 'prepared' check (status in ('prepared','auth_created','active','failed','revoked')),
 invited_by uuid not null references auth.users(id),
 auth_user_id uuid references auth.users(id),
 expires_at timestamptz not null default (now()+interval '48 hours'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.crm_access_audit_v1(
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 target_id uuid,
 target_email text not null,
 action text not null,
 old_role text,
 new_role text,
 changes jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.crm_access_invites_v1 enable row level security;
alter table public.crm_access_audit_v1 enable row level security;
revoke all on public.crm_access_invites_v1, public.crm_access_audit_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.crm_access_invites_v1,public.crm_access_audit_v1 to service_role;
grant usage, select on sequence public.crm_access_audit_v1_id_seq to service_role;

-- No newly registered email becomes a manager. The invitation must be staged by
-- a trusted server endpoint, not through user_metadata, which anyone can edit.
create or replace function public.crm_access_require_invitation_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is null or not exists (
  select 1 from public.crm_access_invites_v1 v
  where v.email=lower(btrim(new.email)) and v.status='prepared' and v.expires_at>now()
 ) then
  raise exception 'CRM_INVITATION_REQUIRED' using errcode='28000';
 end if;
 return new;
end $$;
drop trigger if exists crm_access_invite_before_auth_v1 on auth.users;
create trigger crm_access_invite_before_auth_v1 before insert on auth.users
for each row execute function public.crm_access_require_invitation_v1();
revoke all on function public.crm_access_require_invitation_v1() from public,anon,authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare i public.crm_access_invites_v1%rowtype;
begin
 select * into i from public.crm_access_invites_v1
 where email=lower(btrim(new.email)) and status='prepared' and expires_at>now()
 for update;
 if i.email is null then raise exception 'CRM_INVITATION_REQUIRED' using errcode='28000'; end if;
 insert into public.users(id,email,name,role,region,access_scope,access_key)
 values(new.id,lower(btrim(new.email)),i.display_name,'pending',i.region,'pending',null)
 on conflict(id) do nothing;
 update public.crm_access_invites_v1
 set status='auth_created',auth_user_id=new.id,updated_at=now() where email=i.email;
 return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

-- No signed-in-but-unapproved CRM profile is considered active by RLS.
create or replace function public.crm_is_active_user_v1()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.users u
  where u.id=(select auth.uid())
  and u.role not in ('pending','disabled','executive_viewer')
 );
$$;
-- Executive viewer is purposely excluded from the legacy broad CRM permissions;
-- the company view uses its own explicitly audited read-only RPC instead.
revoke all on function public.crm_is_active_user_v1() from public,anon;
grant execute on function public.crm_is_active_user_v1() to authenticated;

-- A real executive account may authenticate but must NEVER write to legacy data,
-- including via security-definer RPCs. This guard runs before table changes,
-- even if a RPC bypasses RLS. Existing staff and server jobs retain behavior.
create or replace function public.crm_access_write_guard_trigger_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare role_text text;
begin
 if (select auth.uid()) is null then
  return case when TG_OP='DELETE' then old else new end;
 end if;
 select role into role_text from public.users where id=(select auth.uid());
 if role_text is null or role_text in ('pending','disabled','executive_viewer') then
  raise exception 'CRM_ACCESS_READ_ONLY' using errcode='42501';
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function public.crm_access_write_guard_trigger_v1() from public,anon,authenticated;

-- Protect even tables without RLS and writes performed by SECURITY DEFINER RPCs.
-- Restrict to tables that currently grant authenticated users direct write access.
do $$
declare t record;
begin
 for t in
  select n.nspname as sch,c.relname as tbl
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r'
    and (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets')))
    and (has_table_privilege('authenticated',c.oid,'INSERT') or
         has_table_privilege('authenticated',c.oid,'UPDATE') or
         has_table_privilege('authenticated',c.oid,'DELETE'))
 loop
  execute format('drop trigger if exists crm_access_readonly_guard_v1 on %I.%I',t.sch,t.tbl);
  execute format('create trigger crm_access_readonly_guard_v1 before insert or update or delete on %I.%I for each row execute function public.crm_access_write_guard_trigger_v1()',t.sch,t.tbl);
 end loop;
end $$;

-- Executive receives aggregated, non-editable, multi-branch metrics only.
-- Access to legacy detail/edit modules is NOT granted by the role.
create or replace function public.crm_company_viewer_summary_v1(p_year integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare role_text text; yr int;
result jsonb;
begin
 select role into role_text from public.users where id=(select auth.uid());
 if (select auth.uid()) is null or
   (role_text <> 'executive_viewer' and (select auth.uid()) <> '544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid)
 then raise exception 'Доступ запрещён' using errcode='42501';end if;
 yr:=least(greatest(coalesce(p_year,extract(year from current_date)::int),2023),2100);
 with base as (
  select ph.month,coalesce(ph.revenue,0) revenue,
   coalesce(nullif(c.region,''),'Не определён') region
  from public.purchase_history ph left join public.clients c on c.id=ph.client_id
  where ph.month>=make_date(yr,1,1) and ph.month<make_date(yr+1,1,1)
 ), regions as(
  select region,round(sum(revenue),2) revenue from base
  group by region order by sum(revenue) desc
 ), months as(
  select to_char(month,'YYYY-MM') month,round(sum(revenue),2) revenue
  from base group by month order by month
 ), pdz as (
  select round(coalesce(sum(debt_overdue),0),2) total,
   max(report_date) last_report
  from public.client_debt
  where report_date=(select max(report_date) from public.client_debt)
 )
 select jsonb_build_object(
  'year',yr,'sales_total',coalesce((select round(sum(revenue),2) from base),0),
  'sales_by_region',coalesce((select jsonb_agg(to_jsonb(regions)) from regions),'[]'::jsonb),
  'sales_by_month',coalesce((select jsonb_agg(to_jsonb(months)) from months),'[]'::jsonb),
  'clients',(select count(*) from public.clients where coalesce(is_archived,false)=false),
  'stands',(select count(*) from public.stand_placements_v236346 where status in ('active','legacy_unreconciled','return_requested')),
  'debt_total',(select total from pdz),
  'debt_report_date',(select last_report from pdz),
  'data_scope','Aggregated 1C shipments to customers by registered client region; not retail or profit'
 ) into result;
 return result;
end $$;
revoke all on function public.crm_company_viewer_summary_v1(integer) from public,anon;
grant execute on function public.crm_company_viewer_summary_v1(integer) to authenticated;

-- Protect legacy user administration while new owner-only panel is introduced.
-- A separate Edge endpoint checks owner identity via Auth, not by editable metadata.
