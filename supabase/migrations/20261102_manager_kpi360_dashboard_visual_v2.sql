-- KPI360 visual dashboard v2. Read-only. Canonical links by verified CRM alias and existing active IDs.
-- Previous-year comparison uses the same current client ownership and six-full-month rule.
create or replace function public.crm_manager_kpi360_dashboard_v2(p_month text)
returns jsonb language plpgsql security definer
set search_path='public','auth','pg_catalog'
as $fn$
declare
  actor public.users%rowtype;
  chosen date;
  previous date;
  last_period text;
  sales_rows jsonb;
  older_rows jsonb;
  summary jsonb;
  rows_out jsonb;
  clients_out jsonb;
  trend_out jsonb;
  prior_snapshot jsonb;
  count_rows jsonb;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    then raise exception 'invalid_month'; end if;
  chosen := (p_month||'-01')::date;
  previous := (chosen-interval '1 year')::date;
  select * into actor from public.users where id=auth.uid();
  if actor.id is null then raise exception 'login_required'; end if;
  if not (
    (actor.role='boss' and actor.region='Витебск' and
      public.crm_v2263_norm(actor.name) in ('александр паюшин','сидарович к.н.'))
    or
    (actor.role='manager' and actor.region='Витебск' and
      public.crm_v2263_norm(actor.name) in ('руднев','ачинович','шкуран'))
  ) then raise exception 'not_authorized'; end if;

  select to_char(max(month),'YYYY-MM') into last_period from public.purchase_history;
  -- Reuse the existing sales KPI calculation and plans: no change of selling methodology.
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into sales_rows
  from public.crm_manager_kpi_leaderboard(p_month) x
  where actor.role='boss' or
    public.crm_v2263_norm(x.manager_name)=public.crm_v2263_norm(actor.name);
  -- Preserve the previously published sales 2025 baseline, not a new incompatible price base.
  prior_snapshot := public.crm_manager_kpi360_yoy_v1(p_month);
  older_rows := coalesce(prior_snapshot->'rows','[]'::jsonb);

  with allowed_managers as materialized (
    select public.crm_v2263_norm(u.name) mk, u.name
    from public.users u
    where u.role='manager' and u.region='Витебск'
      and public.crm_v2263_norm(u.name) in ('руднев','ачинович','шкуран')
      and (actor.role='boss' or public.crm_v2263_norm(u.name)=public.crm_v2263_norm(actor.name))
  ),
  names_raw as (
    select public.crm_client_key(c.name) k,c.id,c.manager_name from public.clients c
    where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
    union all
    select public.crm_client_key(a.alias_name) k,c.id,c.manager_name
    from public.client_aliases a join public.clients c on c.id=a.client_id
    where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
  ),
  name_map as materialized (
    select k,min(id::text)::uuid canonical_id,min(manager_name) owner_name
    from names_raw where k<>''
    group by k having count(distinct id)=1
  ),
  history as materialized (
    select ph.month::date period,
      case when coalesce(c.id,n.canonical_id) is not null
        then 'id:'||coalesce(c.id,n.canonical_id)::text
        else 'name:'||public.crm_client_key(ph.client_name) end client_key,
      public.crm_v2263_norm(coalesce(c.manager_name,n.owner_name,
        nullif(btrim(ph.manager_name),''))) mk,
      coalesce(c.name,ph.client_name) label,
      coalesce(ph.revenue,0)::numeric revenue,
      coalesce(ph.qty,0)::numeric qty
    from public.purchase_history ph
    left join public.clients c on c.id=ph.client_id
      and not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
    left join name_map n on c.id is null and n.k=public.crm_client_key(ph.client_name)
    where ph.month<=chosen
      and public.crm_client_key(ph.client_name)<>public.crm_client_key('Итого')
  ),
  monthly as materialized (
    select period,client_key,mk,
      max(label) label,
      bool_or(revenue>0 or qty>0) positive,
      sum(revenue) filter(where revenue>0 or qty>0) positive_sales
    from history group by period,client_key,mk
  ),
  classified as materialized (
    select m.period,m.client_key,m.mk,m.label,
      coalesce(m.positive_sales,0) sales,
      (select max(prior.period) from monthly prior
        where prior.client_key=m.client_key and prior.period<m.period and prior.positive) last_period
    from monthly m
    join allowed_managers a on a.mk=m.mk
    where m.period in (chosen,previous) and m.positive
  ),
  categorized as materialized (
    select c.*,
      case when last_period is null then 'first'
           when last_period<(period-interval '6 months')::date then 'returned'
           else 'active' end client_type
    from classified c
  ),
  stats as materialized (
    select period,mk,
      count(distinct client_key)::int akb,
      count(*) filter(where client_type='first')::int first_count,
      count(*) filter(where client_type='returned')::int returned_count
    from categorized group by period,mk
  ),
  network as (
    select period,count(distinct client_key)::int unique_akb,
      count(distinct client_key) filter(where client_type in ('first','returned'))::int bonus_clients,
      count(distinct client_key) filter(where client_type='first')::int first_count,
      count(distinct client_key) filter(where client_type='returned')::int returned_count
    from categorized group by period
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'manager_name',am.name,
        'akb',coalesce(now_stats.akb,0),'first',coalesce(now_stats.first_count,0),
        'returned',coalesce(now_stats.returned_count,0),
        'bonus',coalesce(now_stats.first_count,0)+coalesce(now_stats.returned_count,0),
        'akb_previous',coalesce(before_stats.akb,0),
        'first_previous',coalesce(before_stats.first_count,0),
        'returned_previous',coalesce(before_stats.returned_count,0),
        'bonus_previous',coalesce(before_stats.first_count,0)+coalesce(before_stats.returned_count,0)
      ) order by am.name)
      from allowed_managers am
      left join stats now_stats on now_stats.mk=am.mk and now_stats.period=chosen
      left join stats before_stats on before_stats.mk=am.mk and before_stats.period=previous
    ),'[]'::jsonb),
    coalesce((
      select jsonb_build_object(
        'akb',coalesce(max(unique_akb) filter(where period=chosen),0),
        'akb_previous',coalesce(max(unique_akb) filter(where period=previous),0),
        'bonus',coalesce(max(bonus_clients) filter(where period=chosen),0),
        'bonus_previous',coalesce(max(bonus_clients) filter(where period=previous),0),
        'first',coalesce(max(first_count) filter(where period=chosen),0),
        'returned',coalesce(max(returned_count) filter(where period=chosen),0),
        'first_previous',coalesce(max(first_count) filter(where period=previous),0),
        'returned_previous',coalesce(max(returned_count) filter(where period=previous),0)
      ) from network
    ),'{}'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'manager_name',am.name,
        'client_key',c.client_key,'client_name',c.label,
        'type',c.client_type,'last_sale',to_char(c.last_period,'YYYY-MM'),
        'shipment',round(c.sales,2)
      ) order by am.name,c.client_type,c.sales desc,c.label)
      from categorized c join allowed_managers am on am.mk=c.mk
      where c.period=chosen
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'month',to_char(m.month,'YYYY-MM'),
        'current',coalesce((
          select sum(x.positive_sales) from monthly x
          join allowed_managers a on a.mk=x.mk where x.period=m.month and x.positive
        ),0),
        'previous',coalesce((
          select sum(x.positive_sales) from monthly x
          join allowed_managers a on a.mk=x.mk
          where x.period=(m.month-interval '1 year')::date and x.positive
        ),0)
      ) order by m.month)
      from (select (chosen-(gs.idx||' months')::interval)::date month
        from generate_series(5,0,-1) as gs(idx)) m
    ),'[]'::jsonb)
  into rows_out,summary,clients_out,trend_out;

  return jsonb_build_object(
    'version','kpi360-visual-v2','month',p_month,
    'previous_month',to_char(previous,'YYYY-MM'),
    'latest_sales_month',last_period,
    'last_import',prior_snapshot->'last_sales_import',
    'scope',case when actor.role='boss' then 'director' else 'manager' end,
    'sales',sales_rows,'prior_sales',older_rows,
    'managers',rows_out,'summary',summary,
    'clients',clients_out,'trend',trend_out,
    'method','one_canonical_client_history_2023_onwards_six_full_months'
  );
end;
$fn$;
revoke all on function public.crm_manager_kpi360_dashboard_v2(text) from public,anon;
grant execute on function public.crm_manager_kpi360_dashboard_v2(text) to authenticated;
