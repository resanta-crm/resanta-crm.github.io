-- KPI 360: same-month previous-year baseline for the CURRENT client assignments.
-- Independent of the main KPI calculation and does not change original history or plans.
create or replace function public.crm_manager_kpi360_yoy_v1(p_month text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_catalog'
as $fn$
declare
  actor public.users%rowtype;
  target_month date;
  previous_month date;
  last_sales_month text;
  last_import_date text;
  previous_available boolean;
  comparison_rows jsonb;
  unassigned_rows bigint;
  unassigned_positive numeric;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_month';
  end if;
  target_month := (p_month || '-01')::date;
  previous_month := (target_month - interval '1 year')::date;
  select * into actor from public.users where id=auth.uid();
  if actor.id is null then raise exception 'login_required'; end if;
  if not (
    (actor.role='boss' and actor.region='Витебск') or
    (actor.role='manager' and actor.region='Витебск' and
      public.crm_v2263_norm(actor.name) in ('руднев','ачинович','шкуран'))
  ) then raise exception 'not_authorized'; end if;

  select to_char(max(month),'YYYY-MM') into last_sales_month
    from public.purchase_history where month<=current_date;
  select to_char(max(report_date),'DD.MM.YYYY') into last_import_date
    from public.crm_import_status where source='sales' and status='ok';
  select exists(select 1 from public.purchase_history
    where month>=previous_month and month<(previous_month+interval '1 month')::date)
    into previous_available;

  with staff as (
    select u.name::text manager_name,public.crm_v2263_norm(u.name) mgr_key
    from public.users u where u.role='manager'
      and public.crm_v2263_norm(u.name) in ('руднев','ачинович','шкуран')
      and (actor.role='boss' or public.crm_v2263_norm(u.name)=public.crm_v2263_norm(actor.name))
  ),
  name_sources as (
    select public.crm_client_key(c.name) k,c.id,c.manager_name
    from public.clients c
    where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
      and public.crm_client_key(c.name)<>''
    union all
    select public.crm_client_key(a.alias_name) k,c.id,c.manager_name
    from public.client_aliases a join public.clients c on c.id=a.client_id
    where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
      and public.crm_client_key(a.alias_name)<>''
  ),
  unique_names as materialized (
    select k,min(id::text)::uuid client_id,min(manager_name) manager_name
    from name_sources group by k having count(distinct id)=1
  ),
  activity as materialized (
    select ph.month::date sale_month,
      public.crm_v2263_norm(coalesce(c.manager_name,n.manager_name)) mgr_key,
      case when coalesce(c.id,n.client_id) is not null
        then 'id:'||coalesce(c.id,n.client_id)::text
        else 'name:'||public.crm_client_key(ph.client_name) end client_key,
      public.crm_v2263_norm(ph.client_name) name_key,
      coalesce(ph.revenue,0)::numeric revenue,
      coalesce(ph.qty,0)::numeric qty
    from public.purchase_history ph
    left join public.clients c on c.id=ph.client_id
      and not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
    left join unique_names n on c.id is null and n.k=public.crm_client_key(ph.client_name)
    where ph.month>=(previous_month-interval '6 months')::date
      and ph.month<(previous_month+interval '1 month')::date
      and public.crm_client_key(ph.client_name)<>public.crm_client_key('Итого')
  ),
  this_month as materialized (
    select * from activity where sale_month=previous_month
      and (revenue>0 or qty>0)
  ),
  totals as (
    select m.mgr_key,
      coalesce(sum(m.revenue),0)::numeric previous_sales,
      count(distinct m.name_key)::bigint previous_akb,
      count(distinct m.client_key) filter(where not exists(
        select 1 from activity a where a.client_key=m.client_key
          and a.sale_month>= (previous_month-interval '6 months')::date
          and a.sale_month<previous_month and (a.revenue>0 or a.qty>0)
      ))::bigint previous_new
    from this_month m where m.mgr_key in ('руднев','ачинович','шкуран')
    group by m.mgr_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_name',s.manager_name,
    'sales_2025',coalesce(t.previous_sales,0),
    'akb_2025',coalesce(t.previous_akb,0),
    'new_2025',coalesce(t.previous_new,0)
  ) order by s.manager_name),'[]'::jsonb)
  into comparison_rows from staff s left join totals t on t.mgr_key=s.mgr_key;

  -- Flag, but never silently attribute, previous-year sales lacking a current CRM match.
  if actor.role='boss' then
    with name_sources as (
      select public.crm_client_key(c.name) k,c.id from public.clients c
      where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
      union all
      select public.crm_client_key(a.alias_name),c.id
      from public.client_aliases a join public.clients c on c.id=a.client_id
      where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
    ), unique_names as (
      select k,min(id::text)::uuid client_id from name_sources
      group by k having count(distinct id)=1
    )
    select count(*)::bigint,coalesce(sum(ph.revenue),0)::numeric
      into unassigned_rows,unassigned_positive
    from public.purchase_history ph
    left join public.clients c on c.id=ph.client_id
      and not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
    left join unique_names n on c.id is null and n.k=public.crm_client_key(ph.client_name)
    where ph.month>=previous_month and ph.month<(previous_month+interval '1 month')::date
      and (coalesce(ph.revenue,0)>0 or coalesce(ph.qty,0)>0)
      and public.crm_client_key(ph.client_name)<>public.crm_client_key('Итого')
      and coalesce(c.id,n.client_id) is null;
  end if;

  return jsonb_build_object(
    'version','kpi360-v1',
    'month',to_char(target_month,'YYYY-MM'),
    'previous_month',to_char(previous_month,'YYYY-MM'),
    'latest_sales_month',last_sales_month,
    'last_sales_import',last_import_date,
    'previous_available',previous_available,
    'scope',case when actor.role='boss' then 'director' else 'manager' end,
    'rows',comparison_rows,
    'unassigned_2025_rows',case when actor.role='boss' then unassigned_rows else null end,
    'unassigned_2025_positive',case when actor.role='boss' then unassigned_positive else null end
  );
end;
$fn$;
revoke all on function public.crm_manager_kpi360_yoy_v1(text) from public, anon;
grant execute on function public.crm_manager_kpi360_yoy_v1(text) to authenticated;
