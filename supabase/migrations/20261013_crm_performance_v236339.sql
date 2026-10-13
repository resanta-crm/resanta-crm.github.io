-- RESANTA CRM performance package · 2026-10-13 · v23.6.339
-- Safe performance-only package. No business data deletion or recalculation.
-- Captures live production optimizations made after KPI/CRM timeout incident.

-- Planner freshness after frequent 1C/GPS/task imports.
alter table public.purchase_history set (autovacuum_analyze_scale_factor=0.02,autovacuum_analyze_threshold=50);
alter table public.route_plans set (autovacuum_analyze_scale_factor=0.03,autovacuum_analyze_threshold=50);
alter table public.tasks set (autovacuum_analyze_scale_factor=0.03,autovacuum_analyze_threshold=50);
alter table public.visits set (autovacuum_analyze_scale_factor=0.03,autovacuum_analyze_threshold=50);
alter table public.clients set (autovacuum_analyze_scale_factor=0.03,autovacuum_analyze_threshold=25);
alter table public.client_aliases set (autovacuum_analyze_scale_factor=0.03,autovacuum_analyze_threshold=25);

-- Core relationship/RLS lookup indexes.
create index if not exists clients_manager_name_v236329_idx on public.clients(manager_name);
create index if not exists clients_manager_id_v236329_idx on public.clients(manager_id);
create index if not exists tasks_client_id_v236329_idx on public.tasks(client_id);
create index if not exists tasks_manager_id_v236329_idx on public.tasks(manager_id);
create index if not exists tasks_visit_id_v236329_idx on public.tasks(visit_id);
create index if not exists visits_manager_id_v236329_idx on public.visits(manager_id);

-- Promotion effectiveness indexes: same output, far fewer scans.
create index if not exists purchase_history_promo_client_month_sku_v236333_idx
on public.purchase_history(client_id,month,trim(coalesce(sku,''))) include(revenue,qty);
create index if not exists purchase_history_promo_name_month_sku_v236333_idx
on public.purchase_history(
  lower(regexp_replace(trim(coalesce(client_name,'')),'\s+',' ','g')),
  month,
  trim(coalesce(sku,''))
) include(client_id,revenue,qty);

-- Canonical client key for analytic fallbacks.
create index if not exists purchase_history_month_client_key_v236337_idx
on public.purchase_history(month,public.crm_client_key(client_name))
include(client_id,manager_name,revenue,category);

-- RLS InitPlan optimization: same access semantics, helper functions evaluated once/query.
alter policy clients_delete_boss_v236136 on public.clients
  using ((select public.is_boss()));
alter policy clients_insert_scoped_v236136 on public.clients
  with check ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or btrim(manager_name)='');
alter policy clients_select_scoped on public.clients
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or manager_name='');
alter policy clients_update_scoped_v236136 on public.clients
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or btrim(manager_name)='')
  with check ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or btrim(manager_name)='');

alter policy route_plans_delete_scoped_v236136 on public.route_plans
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()));
alter policy route_plans_insert_scoped_v236136 on public.route_plans
  with check ((select public.is_boss()) or manager_name=(select public.current_user_name()));
alter policy route_plans_select_scoped on public.route_plans
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()));
alter policy route_plans_update_scoped_v236136 on public.route_plans
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()))
  with check ((select public.is_boss()) or manager_name=(select public.current_user_name()));

alter policy tasks_boss_insert_v2273210 on public.tasks with check ((select public.crm_is_boss()));
alter policy tasks_boss_select_v2273210 on public.tasks using ((select public.crm_is_boss()));
alter policy tasks_boss_update_v2273210 on public.tasks
  using ((select public.crm_is_boss())) with check ((select public.crm_is_boss()));
alter policy tasks_delete_scoped_v236136 on public.tasks
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or btrim(manager_name)='');
alter policy tasks_insert_scoped_v236136 on public.tasks
  with check ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or btrim(manager_name)='');
alter policy tasks_select_scoped on public.tasks
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or manager_name='');
alter policy tasks_update_scoped_v236136 on public.tasks
  using ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or btrim(manager_name)='')
  with check ((select public.is_boss()) or manager_name=(select public.current_user_name()) or manager_name is null or btrim(manager_name)='');

alter policy visits_select_scoped on public.visits
  using ((select public.is_boss()) or manager_id=(select public.current_user_id()));

-- Optimized RPC definitions follow.

-- crm_manager_new_clients_detail_v236135(text,text)
CREATE OR REPLACE FUNCTION public.crm_manager_new_clients_detail_v236135(p_month text, p_manager text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_actor public.users%rowtype;
  v_month date:=date_trunc('month',(left(p_month,7)||'-01')::date)::date;
  v_manager text:=nullif(trim(coalesce(p_manager,'')),'');
  v_rows jsonb;
begin
  select * into v_actor from public.users where id=auth.uid();
  if v_actor.id is null then raise exception 'Требуется вход в CRM'; end if;
  if coalesce(v_actor.role,'') not in ('boss','manager') then raise exception 'Нет доступа'; end if;
  if v_actor.role='manager' then
    if v_manager is not null and public.crm_v2263_norm(v_manager)<>public.crm_v2263_norm(v_actor.name) then
      raise exception 'Можно смотреть только своих клиентов';
    end if;
    v_manager:=v_actor.name;
  end if;

  with key_sources as (
    select public.crm_client_key(c.name) k,c.id,c.name,c.manager_name
    from public.clients c
    where public.crm_client_key(c.name)<>''
    union all
    select public.crm_client_key(a.alias_name),c.id,c.name,c.manager_name
    from public.client_aliases a
    join public.clients c on c.id=a.client_id
    where public.crm_client_key(a.alias_name)<>''
  ),
  key_map as materialized (
    select k,min(id::text)::uuid client_id,min(name) client_name,min(manager_name) manager_name
    from key_sources
    group by k
    having count(distinct id)=1
  ),
  activity as materialized (
    select
      ph.month::date sale_month,
      case
        when ph.client_id is not null then 'id:'||ph.client_id::text
        when km.client_id is not null then 'id:'||km.client_id::text
        else 'name:'||public.crm_client_key(ph.client_name)
      end client_key,
      coalesce(ph.client_id,km.client_id) client_id,
      coalesce(c.name,km.client_name,ph.client_name) client_name,
      coalesce(nullif(trim(ph.manager_name),''),c.manager_name,km.manager_name) manager_name,
      sum(coalesce(ph.revenue,0))::numeric revenue_all,
      coalesce(sum(coalesce(ph.revenue,0))
        filter(where coalesce(ph.revenue,0)>0 or coalesce(ph.qty,0)>0),0)::numeric revenue_positive,
      coalesce(sum(coalesce(ph.qty,0))
        filter(where coalesce(ph.revenue,0)>0 or coalesce(ph.qty,0)>0),0)::numeric qty_positive,
      bool_or(coalesce(ph.revenue,0)>0 or coalesce(ph.qty,0)>0) has_positive
    from public.purchase_history ph
    left join public.clients c
      on c.id=ph.client_id
    left join key_map km
      on c.id is null
     and km.k=public.crm_client_key(ph.client_name)
    where ph.month < (v_month+interval '4 months')::date
      and btrim(coalesce(ph.client_name,''))<>'Итого'
    group by
      ph.month::date,
      case
        when ph.client_id is not null then 'id:'||ph.client_id::text
        when km.client_id is not null then 'id:'||km.client_id::text
        else 'name:'||public.crm_client_key(ph.client_name)
      end,
      coalesce(ph.client_id,km.client_id),
      coalesce(c.name,km.client_name,ph.client_name),
      coalesce(nullif(trim(ph.manager_name),''),c.manager_name,km.manager_name)
  ),
  current_clients as (
    select
      public.crm_v2263_norm(a.manager_name) mgr_key,
      max(a.manager_name) manager_name,
      a.client_key,
      max(a.client_id::text)::uuid client_id,
      max(a.client_name) client_name,
      sum(a.revenue_positive)::numeric current_revenue,
      sum(a.qty_positive)::numeric current_qty
    from activity a
    where a.sale_month=v_month
      and a.has_positive
      and (v_manager is null or public.crm_v2263_norm(a.manager_name)=public.crm_v2263_norm(v_manager))
    group by public.crm_v2263_norm(a.manager_name),a.client_key
  ),
  rolled as (
    select
      cc.mgr_key,cc.manager_name,cc.client_key,cc.client_id,cc.client_name,
      cc.current_revenue,cc.current_qty,
      max(a.sale_month) filter(where a.sale_month<v_month and a.has_positive) last_sale_month,
      count(*) filter(
        where a.sale_month between (v_month-interval '6 months')::date
                               and (v_month-interval '1 month')::date
          and a.has_positive
      ) prev6_hits,
      coalesce(sum(a.revenue_all)
        filter(where a.sale_month=(v_month+interval '1 month')::date),0)::numeric next1_revenue,
      coalesce(sum(a.revenue_all)
        filter(where a.sale_month=(v_month+interval '2 months')::date),0)::numeric next2_revenue,
      coalesce(sum(a.revenue_all)
        filter(where a.sale_month=(v_month+interval '3 months')::date),0)::numeric next3_revenue
    from current_clients cc
    left join activity a on a.client_key=cc.client_key
    group by cc.mgr_key,cc.manager_name,cc.client_key,cc.client_id,cc.client_name,cc.current_revenue,cc.current_qty
  ),
  enriched as (
    select r.*,
      case when r.last_sale_month is null then 'new' else 'reactivated' end client_type,
      case when r.last_sale_month is null then null
           else ((extract(year from v_month)::int*12+extract(month from v_month)::int)
                -(extract(year from r.last_sale_month)::int*12+extract(month from r.last_sale_month)::int)-1) end inactive_months
    from rolled r
    where r.prev6_hits=0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_name',manager_name,
    'client_id',client_id,
    'client_name',client_name,
    'type',client_type,
    'last_sale_month',last_sale_month,
    'inactive_months',inactive_months,
    'current_month',to_char(v_month,'YYYY-MM'),
    'current_revenue',round(current_revenue,2),
    'next1_month',to_char(v_month+interval '1 month','YYYY-MM'),
    'next1_revenue',round(next1_revenue,2),
    'next2_month',to_char(v_month+interval '2 months','YYYY-MM'),
    'next2_revenue',round(next2_revenue,2),
    'next3_month',to_char(v_month+interval '3 months','YYYY-MM'),
    'next3_revenue',round(next3_revenue,2)
  ) order by manager_name,current_revenue desc,client_name),'[]'::jsonb)
  into v_rows
  from enriched;

  return jsonb_build_object(
    'version','v23.6.332',
    'month',to_char(v_month,'YYYY-MM'),
    'rule','shipment_after_6_full_inactive_months',
    'rows',v_rows
  );
end;
$function$;

-- crm_sales_dashboard_v236336(integer,text)
CREATE OR REPLACE FUNCTION public.crm_sales_dashboard_v236336(p_year integer, p_manager text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
 SET enable_nestloop TO 'off'
AS $function$
with params as (
  select greatest(2020,least(2100,coalesce(p_year,extract(year from current_date)::int))) y,
         nullif(trim(coalesce(p_manager,'')),'') mgr
),
key_sources as (
  select public.crm_client_key(c.name) k,c.id,c.manager_name,c.region
  from public.clients c
  where public.crm_client_key(c.name)<>''
  union all
  select public.crm_client_key(a.alias_name),c.id,c.manager_name,c.region
  from public.client_aliases a
  join public.clients c on c.id=a.client_id
  where public.crm_client_key(a.alias_name)<>''
),
key_map as materialized (
  select k,min(id::text)::uuid client_id,min(manager_name) manager_name,min(region) region
  from key_sources
  group by k
  having count(distinct id)=1
),
valid_linked as (
  select
    ph.month::date as sale_month,
    coalesce(ph.revenue,0)::numeric as revenue,
    coalesce(nullif(trim(ph.category),''),'Без категории') as category,
    coalesce(nullif(trim(ph.manager_name),''),c.manager_name) as manager_name,
    ph.client_id as client_id,
    ph.client_name as client_name,
    coalesce(nullif(trim(c.region),''),'Не определён') as region
  from public.purchase_history ph
  cross join params p
  join public.clients c on c.id=ph.client_id
  where ph.month>=make_date(p.y,1,1)
    and ph.month<make_date(p.y+1,1,1)
),
unlinked as (
  select
    ph.month::date as sale_month,
    coalesce(ph.revenue,0)::numeric as revenue,
    coalesce(nullif(trim(ph.category),''),'Без категории') as category,
    coalesce(nullif(trim(ph.manager_name),''),km.manager_name) as manager_name,
    km.client_id as client_id,
    ph.client_name as client_name,
    coalesce(nullif(trim(km.region),''),'Не определён') as region
  from public.purchase_history ph
  cross join params p
  left join public.clients c on c.id=ph.client_id
  left join key_map km on km.k=public.crm_client_key(ph.client_name)
  where ph.month>=make_date(p.y,1,1)
    and ph.month<make_date(p.y+1,1,1)
    and c.id is null
),
base as materialized (
  select * from valid_linked
  union all
  select * from unlinked
),
filtered as materialized (
  select b.*
  from base b
  cross join params p
  where p.mgr is null or b.manager_name=p.mgr
),
m as (
  select sale_month,round(sum(revenue),2) as revenue,
         count(distinct coalesce(client_id::text,'name:'||public.crm_client_key(client_name)))::integer as akb
  from filtered
  group by sale_month
),
cats as (
  select category,round(sum(revenue),2) as revenue
  from filtered
  group by category
  order by sum(revenue) desc,category
  limit 10
),
regs as (
  select region,
         round(sum(revenue),2) as revenue,
         count(distinct coalesce(client_id::text,'name:'||public.crm_client_key(client_name)))::integer as clients
  from filtered
  group by region
)
select jsonb_build_object(
  'year',(select y from params),
  'manager',(select mgr from params),
  'months',coalesce((select jsonb_agg(jsonb_build_object('month',to_char(sale_month,'YYYY-MM'),'revenue',revenue,'akb',akb) order by sale_month) from m),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('category',category,'revenue',revenue) order by revenue desc,category) from cats),'[]'::jsonb),
  'regions',coalesce((select jsonb_agg(jsonb_build_object('region',region,'revenue',revenue,'clients',clients) order by revenue desc,region) from regs),'[]'::jsonb),
  'total_revenue',coalesce((select round(sum(revenue),2) from filtered),0),
  'rows',coalesce((select count(*) from filtered),0)
)
$function$;

-- triovist_get_dashboard(text,text,text)
CREATE OR REPLACE FUNCTION public.triovist_get_dashboard(p_end_month text DEFAULT NULL::text, p_mode text DEFAULT 'month'::text, p_start_month text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_end date;
  v_cur_from date;
  v_cur_to date;
  v_prev_from date;
  v_prev_to date;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_full boolean:=(auth.uid() is null) or public.triovist_is_boss();
  v_items jsonb;
  v_months jsonb;
  v_period_plans jsonb;
  v_selected_month_plans jsonb;
  v_history jsonb;
  v_last_import jsonb;
begin
  if auth.uid() is not null and not (public.triovist_is_boss() or public.triovist_is_member()) then
    raise exception 'Нет доступа к разделу Триовист' using errcode='42501';
  end if;

  if p_mode not in ('month','ytd','custom') then
    raise exception 'Некорректный режим периода: %',p_mode using errcode='22023';
  end if;

  if coalesce(left(p_end_month,7),'') ~ '^[0-9]{4}-[0-9]{2}$' then
    v_end:=to_date(left(p_end_month,7)||'-01','YYYY-MM-DD');
  else
    select max(month) into v_end from public.triovist_sales_resolved_cache;
  end if;

  v_end:=coalesce(v_end,date_trunc('month',current_date)::date);
  v_cur_to:=v_end;

  if p_mode='month' then
    v_cur_from:=v_end;
  elsif p_mode='ytd' then
    v_cur_from:=make_date(extract(year from v_end)::int,1,1);
  else
    if coalesce(left(p_start_month,7),'') !~ '^[0-9]{4}-[0-9]{2}$' then
      raise exception 'Для произвольного периода укажите месяц начала' using errcode='22007';
    end if;
    v_cur_from:=to_date(left(p_start_month,7)||'-01','YYYY-MM-DD');
  end if;

  if v_cur_from>v_cur_to then
    raise exception 'Месяц начала позже месяца окончания' using errcode='22007';
  end if;
  if v_cur_to>v_cur_from+interval '59 months' then
    raise exception 'Диапазон не может превышать 60 месяцев' using errcode='22023';
  end if;

  v_prev_from:=(v_cur_from-interval '1 year')::date;
  v_prev_to:=(v_cur_to-interval '1 year')::date;

  with accessible_all as materialized (
    select
      c.month,c.category,c.subgroup,c.product,c.sku,c.qty,c.revenue,
      c.assigned_group,
      a.manager_email,
      coalesce(a.manager_name,'Не распределено') manager_name
    from public.triovist_sales_resolved_cache c
    left join public.triovist_group_assignments a
      on a.active
     and public.triovist_norm(a.group_name)=c.assigned_group_norm
    where v_full or lower(coalesce(a.manager_email,''))=v_email
  ),
  period_rows as (
    select *
    from accessible_all
    where month between v_cur_from and v_cur_to
       or month between v_prev_from and v_prev_to
  ),
  aggregated as (
    select
      coalesce(manager_email,'') manager_email,
      manager_name,assigned_group,category,subgroup,product,sku,
      round(coalesce(sum(qty) filter(where month between v_cur_from and v_cur_to),0),3) current_qty,
      round(coalesce(sum(qty) filter(where month between v_prev_from and v_prev_to),0),3) previous_qty,
      round(coalesce(sum(revenue) filter(where month between v_cur_from and v_cur_to),0),2) current_revenue,
      round(coalesce(sum(revenue) filter(where month between v_prev_from and v_prev_to),0),2) previous_revenue
    from period_rows
    group by manager_email,manager_name,assigned_group,category,subgroup,product,sku
    having coalesce(sum(qty),0)<>0 or coalesce(sum(revenue),0)<>0
  ),
  months_distinct as (
    select distinct month from accessible_all
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'manager_email',manager_email,
        'manager_name',manager_name,
        'assigned_group',assigned_group,
        'category',category,
        'subgroup',subgroup,
        'product',product,
        'sku',sku,
        'current_qty',current_qty,
        'previous_qty',previous_qty,
        'current_revenue',current_revenue,
        'previous_revenue',previous_revenue
      ) order by manager_name,assigned_group,product,sku)
      from aggregated
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(to_char(month,'YYYY-MM') order by month)
      from months_distinct
    ),'[]'::jsonb),
    (
      select jsonb_build_object(
        'first_month',to_char(min(month),'YYYY-MM'),
        'last_month',to_char(max(month),'YYYY-MM'),
        'months',count(distinct month),
        'groups',count(distinct public.triovist_norm(assigned_group)),
        'qty',round(coalesce(sum(qty),0),3),
        'revenue',round(coalesce(sum(revenue),0),2)
      )
      from accessible_all
    )
  into v_items,v_months,v_history;

  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_email',x.manager_email,
    'manager_name',x.manager_name,
    'plan_amount',x.plan_amount
  ) order by x.manager_name),'[]'::jsonb)
  into v_period_plans
  from (
    select p.manager_email,p.manager_name,round(sum(p.plan_amount),2) plan_amount
    from public.triovist_plans p
    where p.period_month between v_cur_from and v_cur_to
      and (v_full or lower(p.manager_email)=v_email)
    group by p.manager_email,p.manager_name
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_email',p.manager_email,
    'manager_name',p.manager_name,
    'plan_amount',round(p.plan_amount,2)
  ) order by p.manager_name),'[]'::jsonb)
  into v_selected_month_plans
  from public.triovist_plans p
  where p.period_month=v_end
    and (v_full or lower(p.manager_email)=v_email);

  select coalesce((
    select jsonb_build_object(
      'month',to_char(i.month,'YYYY-MM'),
      'source_file',i.source_file,
      'row_count',i.row_count,
      'qty',i.qty,
      'revenue',i.revenue,
      'imported_at',i.imported_at
    )
    from public.triovist_sales_imports i
    order by i.imported_at desc
    limit 1
  ),'{}'::jsonb)
  into v_last_import;

  return jsonb_build_object(
    'ok',true,
    'mode',p_mode,
    'end_month',to_char(v_end,'YYYY-MM'),
    'current_from',to_char(v_cur_from,'YYYY-MM'),
    'current_to',to_char(v_cur_to,'YYYY-MM'),
    'previous_from',to_char(v_prev_from,'YYYY-MM'),
    'previous_to',to_char(v_prev_to,'YYYY-MM'),
    'access',case when v_full then 'full' else v_email end,
    'items',v_items,
    'available_months',v_months,
    'period_plans',v_period_plans,
    'selected_month_plans',v_selected_month_plans,
    'history',v_history,
    'last_import',v_last_import
  );
end;
$function$;

-- triovist_get_stock_dashboard(integer)
CREATE OR REPLACE FUNCTION public.triovist_get_stock_dashboard(p_target_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_full boolean:=(auth.uid() is null) or public.triovist_is_boss();
  v_days integer; v_items jsonb; v_imports jsonb; v_own_date date;
begin
  if auth.uid() is not null and not (public.triovist_is_boss() or public.triovist_is_member()) then
    raise exception 'Нет доступа к остаткам Триовиста' using errcode='42501';
  end if;

  select coalesce(p_target_days,target_days,45)
    into v_days
  from public.triovist_recommendation_settings
  where id=1;

  v_days:=greatest(1,least(365,coalesce(v_days,45)));

  with group_map as materialized (
    select
      public.triovist_norm(group_name) group_norm,
      group_name,manager_email,manager_name,priority
    from public.triovist_group_assignments
    where active
  ),
  partner as (
    select sku,max(product) product,max(brand) brand,max(kind) kind,
      round(sum(sales_m1),3) sales_m1,
      round(sum(sales_m2),3) sales_m2,
      round(sum(sales_m3),3) sales_m3,
      max(sales_m1_label) sales_m1_label,
      max(sales_m2_label) sales_m2_label,
      max(sales_m3_label) sales_m3_label,
      round(sum(qty_total),3) partner_total,
      round(sum(qty_free),3) partner_free,
      round(sum(qty_transit_reserve),3) partner_transit,
      round(sum(qty_orders),3) partner_orders,
      count(*) listing_count,
      max(snapshot_date) snapshot_date,
      max(imported_at) imported_at
    from public.triovist_partner_stock
    where not excluded
    group by sku
  ),
  latest_product as (
    select distinct on(o.sku)
      o.sku,o.category,o.subgroup,o.product,o.month
    from public.triovist_sales_override o
    where trim(coalesce(o.sku,''))<>''
    order by o.sku,o.month desc,o.imported_at desc
  ),
  last_month as (
    select sku,max(month) last_month
    from public.triovist_sales_override
    where qty<>0 or revenue<>0
    group by sku
  ),
  last_ship as (
    select o.sku,l.last_month,round(sum(o.qty),3) last_qty
    from public.triovist_sales_override o
    join last_month l on l.sku=o.sku and l.last_month=o.month
    group by o.sku,l.last_month
  ),
  own as (
    select trim(sku) sku,
           round(sum(coalesce(qty_avail,0)),3) own_qty,
           max(report_date) report_date
    from public.stock_balances
    group by trim(sku)
  ),
  resolved as (
    select
      p.*,
      lp.category,lp.subgroup,
      coalesce(lp.product,p.product) resolved_product,
      case
        when public.triovist_norm(lp.category) like '%сельскохозяйственныемашины%'
          or public.triovist_norm(lp.subgroup) like '%сельскохозяйственныемашины%'
          then 'Сельскохозяйственные машины'
        else coalesce(gcat.group_name,nullif(trim(coalesce(lp.category,'')),''),'Не распределено')
      end assigned_group
    from partner p
    left join latest_product lp on lp.sku=p.sku
    left join group_map gcat
      on gcat.group_norm=public.triovist_norm(lp.category)
  ),
  rows as (
    select
      r.sku,r.resolved_product product,r.brand,r.kind,
      r.assigned_group,
      a.manager_email,
      coalesce(a.manager_name,'Не распределено') manager_name,
      r.sales_m1,r.sales_m2,r.sales_m3,
      round(r.sales_m1+r.sales_m2+r.sales_m3,3) sales_90,
      r.sales_m1_label,r.sales_m2_label,r.sales_m3_label,
      r.partner_total,r.partner_free,r.partner_transit,r.partner_orders,
      coalesce(own.own_qty,0) own_qty,
      coalesce(c.qty_total,0) chekhov_qty,
      coalesce(c.qty_stock,0) chekhov_stock,
      coalesce(c.qty_nearby,0) chekhov_nearby,
      ls.last_month,coalesce(ls.last_qty,0) last_qty,
      r.listing_count,r.snapshot_date partner_date,
      c.snapshot_date chekhov_date,own.report_date own_date,
      greatest(
        ceil(((r.sales_m1+r.sales_m2+r.sales_m3)/92.0)*v_days)
          +r.partner_orders-r.partner_total,
        0
      )::numeric(18,3) recommended
    from resolved r
    left join group_map a
      on a.group_norm=public.triovist_norm(r.assigned_group)
    left join own on own.sku=r.sku
    left join public.triovist_chekhov_stock c on c.sku=r.sku
    left join last_ship ls on ls.sku=r.sku
    where v_full or lower(coalesce(a.manager_email,''))=v_email
  ),
  calc as (
    select r.*,
      least(recommended,own_qty) ship_own,
      least(greatest(recommended-own_qty,0),chekhov_qty) order_chekhov,
      greatest(recommended-own_qty-chekhov_qty,0) uncovered,
      case
        when sales_90>0
          then round(greatest(partner_total-partner_orders,0)/(sales_90/92.0),1)
        else null
      end stock_days
    from rows r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sku',sku,'product',product,'brand',brand,'kind',kind,
    'assigned_group',assigned_group,'manager_email',manager_email,'manager_name',manager_name,
    'sales_m1',sales_m1,'sales_m2',sales_m2,'sales_m3',sales_m3,'sales_90',sales_90,
    'sales_m1_label',sales_m1_label,'sales_m2_label',sales_m2_label,'sales_m3_label',sales_m3_label,
    'partner_total',partner_total,'partner_free',partner_free,'partner_transit',partner_transit,
    'partner_orders',partner_orders,'partner_net',greatest(partner_total-partner_orders,0),
    'stock_days',stock_days,'own_qty',own_qty,'chekhov_qty',chekhov_qty,
    'chekhov_stock',chekhov_stock,'chekhov_nearby',chekhov_nearby,
    'recommended',recommended,'ship_own',ship_own,'order_chekhov',order_chekhov,'uncovered',uncovered,
    'last_shipment_month',case when last_month is null then null else to_char(last_month,'YYYY-MM') end,
    'last_shipment_qty',last_qty,'listing_count',listing_count,'partner_date',partner_date,
    'chekhov_date',chekhov_date,'own_date',own_date
  ) order by recommended desc,sales_90 desc,product),'[]'::jsonb)
  into v_items
  from calc;

  select max(report_date) into v_own_date from public.stock_balances;

  select jsonb_build_object(
    'partner',coalesce((
      select jsonb_build_object('source_file',source_file,'snapshot_date',snapshot_date,'row_count',row_count,'imported_at',imported_at)
      from public.triovist_stock_import_log
      where source='partner'
      order by imported_at desc
      limit 1
    ),'{}'::jsonb),
    'chekhov',coalesce((
      select jsonb_build_object('source_file',source_file,'snapshot_date',snapshot_date,'row_count',row_count,'imported_at',imported_at)
      from public.triovist_stock_import_log
      where source='chekhov'
      order by imported_at desc
      limit 1
    ),'{}'::jsonb),
    'own',jsonb_build_object('report_date',v_own_date)
  )
  into v_imports;

  return jsonb_build_object(
    'ok',true,
    'target_days',v_days,
    'items',v_items,
    'imports',v_imports,
    'last_shipment_precision','month'
  );
end;
$function$;

-- triovist_tasks_get_dashboard_month_v23648(text,date)
CREATE OR REPLACE FUNCTION public.triovist_tasks_get_dashboard_month_v23648(p_manager_email text, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_tasks jsonb;
  v_summary jsonb;
  v_groups jsonb;
  v_managers jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден'; end if;

  if a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер';
    end if;
  elsif a.actor_scope='triovist' and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к задачам 21vek';
  end if;

  with item_agg as materialized (
    select
      ti.task_id,
      jsonb_agg(
        jsonb_build_object(
          'id',ti.id,
          'card_key',ti.card_key,
          'issue_type',ti.issue_type,
          'issue_title',ti.issue_title,
          'sku',ti.sku,
          'donor_article',ti.donor_article,
          'product_name',ti.product_name,
          'product_url',ti.product_url,
          'baseline_value',ti.baseline_value,
          'target_value',ti.target_value,
          'current_value',ti.current_value,
          'item_status',ti.item_status,
          'verified_at',ti.verified_at
        )
        order by
          case ti.item_status when 'open' then 0 when 'missing' then 1 when 'verified' then 2 else 3 end,
          ti.product_name,ti.sku,ti.issue_title
      ) items,
      count(*)::integer item_count,
      count(*) filter(where ti.item_status='verified')::integer verified_item_count
    from public.triovist_ai_task_items ti
    group by ti.task_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.status
      when 'pending_approval' then 0
      when 'in_progress' then 1
      when 'accepted' then 2
      when 'waiting_21vek' then 3
      when 'awaiting_check' then 4
      when 'partial' then 5
      when 'overdue' then 6
      when 'new' then 7
      when 'verified' then 8
      when 'not_achieved' then 9
      when 'not_relevant' then 10
      when 'cancelled' then 11
      else 12 end,
    x.priority_score desc,x.due_date,x.manager_name,x.group_name),'[]'::jsonb)
  into v_tasks
  from (
    select
      t.*,
      coalesce(ia.items,'[]'::jsonb) as items,
      coalesce(ia.item_count,0) as item_count,
      coalesce(ia.verified_item_count,0) as verified_item_count
    from public.triovist_ai_tasks t
    left join item_agg ia on ia.task_id=t.id
    where (v_filter='' or t.manager_email=v_filter)
      and t.period_month=v_month
  ) x;

  select jsonb_build_object(
    'total',count(*),
    'pending_approval',count(*) filter(where status='pending_approval'),
    'active',count(*) filter(where status in ('new','accepted','in_progress','waiting_21vek','awaiting_check')),
    'partial',count(*) filter(where status='partial'),
    'overdue',count(*) filter(where status='overdue'),
    'not_achieved',count(*) filter(where status='not_achieved'),
    'verified',count(*) filter(where status='verified'),
    'cancelled',count(*) filter(where status='cancelled'),
    'not_relevant',count(*) filter(where status='not_relevant'),
    'ai_pending',count(*) filter(where ai_state<>'generated' and status not in ('verified','cancelled','not_relevant'))
  )
  into v_summary
  from public.triovist_ai_tasks
  where (v_filter='' or manager_email=v_filter)
    and period_month=v_month;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.manager_name,g.group_name),'[]'::jsonb)
  into v_groups
  from (
    select
      manager_email,manager_name,group_name,
      count(*)::integer as tasks_total,
      count(*) filter(where status in ('pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'))::integer as active_tasks,
      count(*) filter(where status='verified')::integer as verified_tasks,
      count(*) filter(where status='not_achieved')::integer as not_achieved_tasks
    from public.triovist_ai_tasks
    where (v_filter='' or manager_email=v_filter)
      and period_month=v_month
    group by manager_email,manager_name,group_name
  ) g;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.manager_name),'[]'::jsonb)
  into v_managers
  from (
    select
      x.manager_email,x.manager_name,
      count(t.id)::integer as total_tasks,
      count(t.id) filter(where t.status in ('pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'))::integer as active_tasks,
      count(t.id) filter(where t.status='verified')::integer as verified_tasks,
      count(t.id) filter(where t.status='overdue')::integer as overdue_tasks,
      count(t.id) filter(where t.status='not_achieved')::integer as not_achieved_tasks,
      count(t.id) filter(where t.status='pending_approval')::integer as pending_tasks
    from (values
      ('aleksandrenko_av@resanta.ru','Александренко'),
      ('krishtal_na@resanta.ru','Кришталь')
    ) as x(manager_email,manager_name)
    left join public.triovist_ai_tasks t
      on t.manager_email=x.manager_email
     and t.period_month=v_month
    where v_filter='' or x.manager_email=v_filter
    group by x.manager_email,x.manager_name
  ) m;

  return jsonb_build_object(
    'tasks',v_tasks,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'groups',v_groups,
    'managers',v_managers,
    'period_month',v_month,
    'generated_at',now()
  );
end;
$function$;

-- Sales aggregate deliberately uses hash joins for legacy unlinked client names.
alter function public.crm_sales_dashboard_v236336(integer,text) set enable_nestloop=off;
revoke all on function public.crm_sales_dashboard_v236336(integer,text) from public,anon;
grant execute on function public.crm_sales_dashboard_v236336(integer,text) to authenticated;

analyze public.purchase_history;
analyze public.clients;
analyze public.client_aliases;
analyze public.tasks;
analyze public.visits;
analyze public.route_plans;
analyze public.triovist_group_assignments;
analyze public.triovist_partner_stock;
analyze public.stock_balances;
analyze public.triovist_chekhov_stock;
analyze public.triovist_ai_tasks;
analyze public.triovist_ai_task_items;
analyze public.triovist_sales_resolved_cache;
analyze public.triovist_plans;


-- v23.6.340 · finish RLS InitPlan optimization across user-facing modules.
alter policy client_aliases_write_boss on public.client_aliases
  using (exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='boss'))
  with check (exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='boss'));
alter policy client_debt_write_service_role on public.client_debt using ((select auth.role())='service_role');
alter policy client_photos_delete_authenticated on public.client_photos using ((select auth.role())='authenticated');
alter policy client_photos_write_authenticated on public.client_photos with check ((select auth.role())='authenticated');
alter policy authenticated_select_client_purchase_items on public.client_purchase_items using ((select auth.role())='authenticated');
alter policy authenticated_select_client_purchases on public.client_purchases using ((select auth.role())='authenticated');
alter policy falling_client_notes_boss_all on public.falling_client_notes
  using (exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='boss'))
  with check (exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='boss'));
alter policy gps_points_own_insert on public.gps_track_points with check (user_id=(select auth.uid()));
alter policy authenticated_all_negotiations on public.negotiations
  using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
alter policy pdz_legal_actions_write_service_role on public.pdz_legal_actions
  using ((select auth.role())='service_role') with check ((select auth.role())='service_role');
alter policy route_network_points_update_boss on public.route_network_points
  using (exists(select 1 from public.users u where lower(coalesce(u.email,''))=lower(coalesce(((select auth.jwt())->>'email'),'')) and public.crm_v2271_norm(u.role)='boss'))
  with check (exists(select 1 from public.users u where lower(coalesce(u.email,''))=lower(coalesce(((select auth.jwt())->>'email'),'')) and public.crm_v2271_norm(u.role)='boss'));
alter policy route_physical_point_clients_write_boss on public.route_physical_point_clients
  using (exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='boss'))
  with check (exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='boss'));
alter policy triovist_assignments_select on public.triovist_group_assignments
  using ((select public.triovist_is_boss()) or ((select public.triovist_is_member()) and lower(manager_email)=lower(coalesce(((select auth.jwt())->>'email'),''))));
alter policy triovist_plans_select on public.triovist_plans
  using ((select public.triovist_is_boss()) or ((select public.triovist_is_member()) and lower(manager_email)=lower(coalesce(((select auth.jwt())->>'email'),''))));
alter policy vip_promotions_select_authenticated on public.vip_promotions using ((select auth.role())='authenticated');
alter policy vip_promotions_write_authenticated on public.vip_promotions
  using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
alter policy vip_sales_select_authenticated on public.vip_sales using ((select auth.role())='authenticated');
alter policy visits_delete_authenticated on public.visits using ((select auth.role())='authenticated');
alter policy visits_update_authenticated on public.visits
  using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
alter policy visits_write_authenticated on public.visits with check ((select auth.role())='authenticated');

-- Cover only active/non-trivial FK paths reported by Performance Advisor.
create index if not exists triovist_content_issues_first_import_v236340_idx on public.triovist_content_issues(first_seen_import_id);
create index if not exists triovist_content_issues_last_import_v236340_idx on public.triovist_content_issues(last_seen_import_id);
create index if not exists triovist_market_products_run_v236340_idx on public.triovist_market_products_current_v1(run_id);
create index if not exists triovist_top_current_run_v236340_idx on public.triovist_21vek_top_current(run_id);
create index if not exists warehouse_pick_scan_item_v236340_idx on public.warehouse_pick_scan_events_v1(item_id);
create index if not exists triovist_ai_item_baseline_import_v236340_idx on public.triovist_ai_task_items(baseline_import_id);
create index if not exists triovist_ai_item_check_import_v236340_idx on public.triovist_ai_task_items(last_check_import_id);
create index if not exists triovist_ai_task_check_import_v236340_idx on public.triovist_ai_tasks(last_check_import_id);
create index if not exists triovist_ai_task_source_import_v236340_idx on public.triovist_ai_tasks(source_import_id);
create index if not exists warehouse_pick_tg_order_v236340_idx on public.warehouse_pick_telegram_queue_v2(order_id);
