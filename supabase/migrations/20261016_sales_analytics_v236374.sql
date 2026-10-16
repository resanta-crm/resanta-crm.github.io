-- Resanta CRM v23.6.374: server-first Sales analytics and complete manager AKB comparison

CREATE OR REPLACE FUNCTION public.crm_client_legal_key_v236374(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select public.crm_client_canonical_key_v236204(
    regexp_replace(coalesce(p_value,''), '\s*\([^)]*\)\s*$', '', 'g')
  );
$function$;

CREATE OR REPLACE FUNCTION public.crm_sales_month_dashboard_v236374(p_month date DEFAULT NULL::date, p_manager text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_role text;
  v_name text;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_effective_manager text;
  v_month date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Требуется авторизация'; end if;

  select u.role,u.name into v_role,v_name
  from public.users u
  where u.id=auth.uid() or lower(coalesce(u.email,''))=v_email
  order by case when u.id=auth.uid() then 0 else 1 end
  limit 1;

  if coalesce(v_role,'') not in ('boss','manager') then raise exception 'Нет доступа к аналитике продаж'; end if;

  if v_role='manager' then
    v_effective_manager:=nullif(trim(coalesce(v_name,'')),'');
    if v_effective_manager is null then raise exception 'Для пользователя не задано имя менеджера'; end if;
    if nullif(trim(coalesce(p_manager,'')),'') is not null
       and lower(trim(p_manager))<>lower(v_effective_manager) then
      raise exception 'Менеджер может просматривать только свою аналитику';
    end if;
  else
    v_effective_manager:=nullif(trim(coalesce(p_manager,'')),'');
  end if;

  v_month:=coalesce(date_trunc('month',p_month)::date,(select max(month) from public.purchase_history));
  if v_month is null then
    return jsonb_build_object('version','v23.6.374','month',null,'manager',v_effective_manager,'clients_total',0,'active_clients',0,'total_revenue',0,'regions','[]'::jsonb,'categories','[]'::jsonb,'top_clients','[]'::jsonb,'available_months','[]'::jsonb,'diagnostics',jsonb_build_object('unallocated_revenue',0,'unallocated_rows',0,'unallocated_entities',0));
  end if;

  with
  active_clients as materialized (
    select c.id,c.name,c.manager_name,c.region,c.city,c.role_type
    from public.clients c
    where coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false
  ),
  exact_sources as materialized (
    select public.crm_client_key(c.name) k,c.id,c.manager_name,c.region,c.city from active_clients c where public.crm_client_key(c.name)<>''
    union all
    select public.crm_client_key(a.alias_name),c.id,c.manager_name,c.region,c.city
    from public.client_aliases a join active_clients c on c.id=a.client_id
    where public.crm_client_key(a.alias_name)<>''
  ),
  exact_map as materialized (
    select k,min(id::text)::uuid client_id,min(manager_name) manager_name,min(region) region,min(city) city
    from exact_sources group by k having count(distinct id)=1
  ),
  legal_sources as materialized (
    select public.crm_client_legal_key_v236374(c.name) k,c.id,c.manager_name from active_clients c
    where public.crm_client_legal_key_v236374(c.name)<>''
    union all
    select public.crm_client_legal_key_v236374(a.alias_name),c.id,c.manager_name
    from public.client_aliases a join active_clients c on c.id=a.client_id
    where public.crm_client_legal_key_v236374(a.alias_name)<>''
  ),
  legal_map as materialized (
    select k,
           count(distinct id)::int client_count,
           count(distinct manager_name)::int manager_count,
           case when count(distinct id)=1 then min(id::text)::uuid end client_id,
           case when count(distinct manager_name)=1 then min(manager_name) end manager_name
    from legal_sources group by k
  ),
  raw as materialized (
    select ph.id,ph.month,coalesce(ph.revenue,0)::numeric revenue,
           coalesce(nullif(trim(ph.category),''),'Без категории') category,
           ph.client_id source_client_id,ph.client_name,ph.manager_name source_manager,
           ac.id active_id,ac.manager_name active_manager,ac.region active_region,ac.city active_city,
           em.client_id exact_id,em.manager_name exact_manager,em.region exact_region,em.city exact_city,
           lm.client_id legal_id,lm.manager_name legal_manager,lm.client_count legal_client_count,lm.manager_count legal_manager_count,
           public.crm_client_legal_key_v236374(ph.client_name) legal_key
    from public.purchase_history ph
    left join active_clients ac on ac.id=ph.client_id
    left join exact_map em on ac.id is null and em.k=public.crm_client_key(ph.client_name)
    left join legal_map lm on ac.id is null and em.client_id is null and lm.k=public.crm_client_legal_key_v236374(ph.client_name)
    where ph.month=v_month
      and public.crm_client_exact_key_v236204(ph.client_name)<>'итого'
  ),
  resolved as materialized (
    select r.*,
      coalesce(r.active_id,r.exact_id,r.legal_id) resolved_client_id,
      coalesce(r.active_manager,r.exact_manager,r.legal_manager,nullif(trim(r.source_manager),'')) resolved_manager,
      case when coalesce(r.active_id,r.exact_id,r.legal_id) is null then true else false end is_unallocated,
      case
        when r.active_id is not null then 'client_id'
        when r.exact_id is not null then 'exact_name'
        when r.legal_id is not null then 'legal_unique'
        when r.legal_client_count>1 and r.legal_manager_count=1 then 'legal_multi_tt'
        when nullif(trim(r.source_manager),'') is not null then 'manager_only'
        else 'unresolved'
      end resolution_mode
    from raw r
  ),
  filtered as materialized (
    select * from resolved
    where v_effective_manager is null
       or lower(trim(coalesce(resolved_manager,'')))=lower(trim(v_effective_manager))
  ),
  per_entity as materialized (
    select
      coalesce(f.resolved_client_id::text,'name:'||coalesce(nullif(f.legal_key,''),public.crm_client_key(f.client_name),lower(trim(f.client_name)))) entity_key,
      case when count(f.resolved_client_id)>0 then min(f.resolved_client_id::text)::uuid else null end resolved_client_id,
      case when count(f.resolved_client_id)>0 then max(ac.name)
           else max(f.client_name)||' · не распределено по ТТ' end display_name,
      case when count(f.resolved_client_id)>0 then coalesce(max(ac.region),'Не определён')
           else 'Не распределено' end region,
      case when count(f.resolved_client_id)>0 then max(ac.city) else null end city,
      sum(f.revenue)::numeric revenue,
      bool_or(f.is_unallocated) is_unallocated
    from filtered f
    left join active_clients ac on ac.id=f.resolved_client_id
    group by coalesce(f.resolved_client_id::text,'name:'||coalesce(nullif(f.legal_key,''),public.crm_client_key(f.client_name),lower(trim(f.client_name))))
  ),
  regions as (
    select coalesce(nullif(region,''),'Не определён') region,
           round(sum(revenue),2) revenue,
           count(*) filter(where revenue>0)::int clients
    from per_entity group by 1
  ),
  cats as (
    select category,round(sum(revenue),2) revenue
    from filtered group by category order by sum(revenue) desc,category limit 20
  ),
  topc as (
    select resolved_client_id client_id,display_name client_name,region,city,round(revenue,2) revenue,is_unallocated
    from per_entity order by revenue desc,display_name limit 15
  ),
  months as (
    select distinct to_char(month,'YYYY-MM') ym
    from public.purchase_history where month is not null order by ym desc limit 36
  ),
  diag as (
    select
      round(coalesce(sum(revenue) filter(where is_unallocated),0),2) unallocated_revenue,
      count(*) filter(where is_unallocated)::int unallocated_rows,
      count(distinct coalesce(nullif(legal_key,''),public.crm_client_key(client_name),lower(trim(client_name)))) filter(where is_unallocated)::int unallocated_entities,
      count(*) filter(where resolution_mode='legal_multi_tt')::int multi_tt_rows,
      round(coalesce(sum(revenue) filter(where resolution_mode='legal_multi_tt'),0),2) multi_tt_revenue,
      count(*) filter(where resolution_mode='manager_only')::int manager_only_rows,
      round(coalesce(sum(revenue) filter(where resolution_mode='manager_only'),0),2) manager_only_revenue
    from filtered
  ),
  freshness as (
    select jsonb_build_object('status',s.status,'last_success_at',s.last_success_at,'report_period',s.report_period,'report_date',s.report_date,'row_count',s.row_count,'details',s.details) j
    from public.crm_import_status s where s.source='sales' limit 1
  )
  select jsonb_build_object(
    'version','v23.6.374',
    'month',to_char(v_month,'YYYY-MM'),
    'manager',v_effective_manager,
    'clients_total',(select count(*) from active_clients c where v_effective_manager is null or lower(trim(c.manager_name))=lower(trim(v_effective_manager))),
    'active_clients',(select count(*) from per_entity where revenue>0),
    'total_revenue',round(coalesce((select sum(revenue) from filtered),0),2),
    'regions',coalesce((select jsonb_agg(jsonb_build_object('region',region,'revenue',revenue,'clients',clients) order by revenue desc,region) from regions),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('category',category,'revenue',revenue) order by revenue desc,category) from cats),'[]'::jsonb),
    'top_clients',coalesce((select jsonb_agg(to_jsonb(topc) order by revenue desc,client_name) from topc),'[]'::jsonb),
    'available_months',coalesce((select jsonb_agg(ym order by ym desc) from months),'[]'::jsonb),
    'diagnostics',coalesce((select to_jsonb(diag) from diag),'{}'::jsonb),
    'freshness',coalesce((select j from freshness),'{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_manager_sales_yoy_v236374(p_period_type text DEFAULT 'month'::text, p_year integer DEFAULT NULL::integer, p_period integer DEFAULT NULL::integer, p_manager text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_role text;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_user_name text;
  v_effective_manager text;
  v_mode text := lower(trim(coalesce(p_period_type,'month')));
  v_year integer;
  v_period integer;
  v_latest_year integer;
  v_latest_month integer;
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Требуется авторизация'; end if;

  select u.role,u.name into v_role,v_user_name
  from public.users u
  where u.id=auth.uid() or lower(coalesce(u.email,''))=v_email
  order by case when u.id=auth.uid() then 0 else 1 end
  limit 1;

  if coalesce(v_role,'') not in ('boss','manager') then
    raise exception 'Нет доступа к сравнению продаж менеджеров';
  end if;

  if v_role='manager' then
    v_effective_manager:=nullif(trim(coalesce(v_user_name,'')),'');
    if v_effective_manager is null then raise exception 'Для пользователя не задано имя менеджера'; end if;
    if nullif(trim(coalesce(p_manager,'')),'') is not null
       and lower(trim(p_manager))<>lower(v_effective_manager) then
      raise exception 'Менеджер может просматривать только свою аналитику';
    end if;
  else
    v_effective_manager:=nullif(trim(coalesce(p_manager,'')),'');
  end if;

  select extract(year from max(month))::int,extract(month from max(month))::int
    into v_latest_year,v_latest_month
  from public.purchase_history where month is not null;

  v_year:=coalesce(p_year,v_latest_year,extract(year from current_date)::int);
  if v_year<2023 or v_year>2100 then raise exception 'Некорректный год'; end if;
  if v_mode not in ('month','quarter','ytd') then raise exception 'Некорректный период'; end if;

  if v_mode='month' then
    v_period:=coalesce(p_period,case when v_year=v_latest_year then v_latest_month else 12 end);
    if v_period<1 or v_period>12 then raise exception 'Некорректный месяц'; end if;
    v_start:=make_date(v_year,v_period,1);
    v_end:=(v_start+interval '1 month - 1 day')::date;
  elsif v_mode='quarter' then
    v_period:=coalesce(p_period,case when v_year=v_latest_year then ceil(v_latest_month/3.0)::int else 4 end);
    if v_period<1 or v_period>4 then raise exception 'Некорректный квартал'; end if;
    v_start:=make_date(v_year,(v_period-1)*3+1,1);
    v_end:=(v_start+interval '3 months - 1 day')::date;
  else
    v_period:=case when v_year=v_latest_year then coalesce(v_latest_month,12) else 12 end;
    v_start:=make_date(v_year,1,1);
    v_end:=(make_date(v_year,v_period,1)+interval '1 month - 1 day')::date;
  end if;
  v_prev_start:=(v_start-interval '1 year')::date;
  v_prev_end:=(v_end-interval '1 year')::date;

  with
  active_clients as materialized (
    select c.id,c.name,c.manager_name,c.region,c.city,c.role_type,c.client_status
    from public.clients c
    where coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false
      and nullif(trim(coalesce(c.manager_name,'')),'') is not null
  ),
  exact_sources as materialized (
    select public.crm_client_key(c.name) k,c.id,c.manager_name from active_clients c where public.crm_client_key(c.name)<>''
    union all
    select public.crm_client_key(a.alias_name),c.id,c.manager_name
    from public.client_aliases a join active_clients c on c.id=a.client_id
    where public.crm_client_key(a.alias_name)<>''
  ),
  exact_map as materialized (
    select k,min(id::text)::uuid client_id,min(manager_name) manager_name
    from exact_sources group by k having count(distinct id)=1
  ),
  legal_sources as materialized (
    select public.crm_client_legal_key_v236374(c.name) k,c.id,c.manager_name from active_clients c
    where public.crm_client_legal_key_v236374(c.name)<>''
    union all
    select public.crm_client_legal_key_v236374(a.alias_name),c.id,c.manager_name
    from public.client_aliases a join active_clients c on c.id=a.client_id
    where public.crm_client_legal_key_v236374(a.alias_name)<>''
  ),
  legal_map as materialized (
    select k,
           count(distinct id)::int client_count,
           count(distinct manager_name)::int manager_count,
           case when count(distinct id)=1 then min(id::text)::uuid end client_id,
           case when count(distinct manager_name)=1 then min(manager_name) end manager_name
    from legal_sources group by k
  ),
  raw as materialized (
    select ph.id,ph.month,coalesce(ph.revenue,0)::numeric revenue,
           ph.client_id source_client_id,ph.client_name,ph.manager_name source_manager,
           ac.id active_id,ac.manager_name active_manager,
           em.client_id exact_id,em.manager_name exact_manager,
           lm.client_id legal_id,lm.manager_name legal_manager,lm.client_count legal_client_count,lm.manager_count legal_manager_count,
           public.crm_client_legal_key_v236374(ph.client_name) legal_key
    from public.purchase_history ph
    left join active_clients ac on ac.id=ph.client_id
    left join exact_map em on ac.id is null and em.k=public.crm_client_key(ph.client_name)
    left join legal_map lm on ac.id is null and em.client_id is null and lm.k=public.crm_client_legal_key_v236374(ph.client_name)
    where ((ph.month between v_start and v_end) or (ph.month between v_prev_start and v_prev_end))
      and public.crm_client_exact_key_v236204(ph.client_name)<>'итого'
  ),
  resolved as materialized (
    select r.*,
      coalesce(r.active_id,r.exact_id,r.legal_id) resolved_client_id,
      coalesce(r.active_manager,r.exact_manager,r.legal_manager,nullif(trim(r.source_manager),'')) resolved_manager,
      case
        when r.active_id is not null then 'client_id'
        when r.exact_id is not null then 'exact_name'
        when r.legal_id is not null then 'legal_unique'
        when r.legal_client_count>1 and r.legal_manager_count=1 then 'legal_multi_tt'
        when nullif(trim(r.source_manager),'') is not null then 'manager_only'
        else 'unresolved'
      end resolution_mode
    from raw r
  ),
  per_client as materialized (
    select resolved_client_id client_id,
      coalesce(sum(revenue) filter(where month between v_start and v_end),0)::numeric cur_rev,
      coalesce(sum(revenue) filter(where month between v_prev_start and v_prev_end),0)::numeric prev_rev
    from resolved
    where resolved_client_id is not null
    group by resolved_client_id
  ),
  unallocated_entity as materialized (
    select
      coalesce(nullif(legal_key,''),public.crm_client_key(client_name),lower(trim(client_name))) entity_key,
      coalesce(max(nullif(trim(client_name),'')),'Не распределено') client_name,
      resolved_manager manager_name,
      coalesce(sum(revenue) filter(where month between v_start and v_end),0)::numeric cur_rev,
      coalesce(sum(revenue) filter(where month between v_prev_start and v_prev_end),0)::numeric prev_rev,
      max(resolution_mode) resolution_mode
    from resolved
    where resolved_client_id is null
    group by coalesce(nullif(legal_key,''),public.crm_client_key(client_name),lower(trim(client_name))),resolved_manager
  ),
  client_rows as materialized (
    select c.id client_id,c.name client_name,c.manager_name,c.region,c.city,c.client_status,c.role_type,
           coalesce(pc.cur_rev,0)::numeric cur_rev,coalesce(pc.prev_rev,0)::numeric prev_rev
    from active_clients c
    left join per_client pc on pc.client_id=c.id
  ),
  manager_names as materialized (
    select distinct manager_name from active_clients
  ),
  manager_client_stats as materialized (
    select cr.manager_name,
      count(*)::int clients_total,
      count(*) filter(where cur_rev<>0 or prev_rev<>0)::int clients_with_movement,
      count(*) filter(where cur_rev=0 and prev_rev=0)::int no_sales_both,
      coalesce(sum(cur_rev),0)::numeric resolved_cur,
      coalesce(sum(prev_rev),0)::numeric resolved_prev,
      count(*) filter(where prev_rev>0 and cur_rev>0 and cur_rev>prev_rev)::int growing,
      count(*) filter(where prev_rev>0 and cur_rev>0 and cur_rev<prev_rev)::int falling,
      count(*) filter(where prev_rev=0 and cur_rev>0)::int new_clients,
      count(*) filter(where prev_rev>0 and cur_rev=0)::int lost_clients,
      count(*) filter(where prev_rev<0 or cur_rev<0)::int adjustments
    from client_rows cr
    group by cr.manager_name
  ),
  manager_unallocated as materialized (
    select ue.manager_name,
      coalesce(sum(cur_rev),0)::numeric unallocated_cur,
      coalesce(sum(prev_rev),0)::numeric unallocated_prev,
      count(*) filter(where cur_rev<>0 or prev_rev<>0)::int unallocated_entities
    from unallocated_entity ue
    where nullif(trim(coalesce(ue.manager_name,'')),'') is not null
    group by ue.manager_name
  ),
  manager_rows as materialized (
    select m.manager_name,
      coalesce(cs.clients_total,0)::int clients_total,
      coalesce(cs.clients_with_movement,0)::int clients_with_movement,
      coalesce(cs.no_sales_both,0)::int no_sales_both,
      (coalesce(cs.resolved_cur,0)+coalesce(mu.unallocated_cur,0))::numeric current_revenue,
      (coalesce(cs.resolved_prev,0)+coalesce(mu.unallocated_prev,0))::numeric previous_revenue,
      coalesce(cs.growing,0)::int growing,coalesce(cs.falling,0)::int falling,
      coalesce(cs.new_clients,0)::int new_clients,coalesce(cs.lost_clients,0)::int lost_clients,
      coalesce(cs.adjustments,0)::int adjustments,
      coalesce(mu.unallocated_cur,0)::numeric unallocated_current_revenue,
      coalesce(mu.unallocated_prev,0)::numeric unallocated_previous_revenue,
      coalesce(mu.unallocated_entities,0)::int unallocated_entities
    from manager_names m
    left join manager_client_stats cs on cs.manager_name=m.manager_name
    left join manager_unallocated mu on mu.manager_name=m.manager_name
  ),
  selected_clients as (
    select cr.*,
      case
        when cr.prev_rev<0 or cr.cur_rev<0 then 'adjustment'
        when cr.prev_rev=0 and cr.cur_rev=0 then 'no_sales'
        when cr.prev_rev=0 and cr.cur_rev>0 then 'new'
        when cr.prev_rev>0 and cr.cur_rev=0 then 'lost'
        when cr.prev_rev>0 and cr.cur_rev>0 and cr.cur_rev>cr.prev_rev then 'growth'
        when cr.prev_rev>0 and cr.cur_rev>0 and cr.cur_rev<cr.prev_rev then 'fall'
        else 'same'
      end trend
    from client_rows cr
    where v_effective_manager is not null
      and lower(trim(cr.manager_name))=lower(trim(v_effective_manager))
  ),
  selected_unallocated as (
    select ue.*
    from unallocated_entity ue
    where v_effective_manager is not null
      and lower(trim(coalesce(ue.manager_name,'')))=lower(trim(v_effective_manager))
      and (ue.cur_rev<>0 or ue.prev_rev<>0)
  ),
  global_diag as (
    select
      round(coalesce(sum(revenue) filter(where resolved_client_id is null and nullif(trim(coalesce(resolved_manager,'')),'') is null and month between v_start and v_end),0),2) fully_unassigned_current_revenue,
      round(coalesce(sum(revenue) filter(where resolved_client_id is null and nullif(trim(coalesce(resolved_manager,'')),'') is null and month between v_prev_start and v_prev_end),0),2) fully_unassigned_previous_revenue,
      count(*) filter(where resolved_client_id is null and nullif(trim(coalesce(resolved_manager,'')),'') is null and month between v_start and v_end)::int fully_unassigned_current_rows,
      count(*) filter(where resolved_client_id is null and nullif(trim(coalesce(resolved_manager,'')),'') is null and month between v_prev_start and v_prev_end)::int fully_unassigned_previous_rows
    from resolved
  ),
  freshness as (
    select jsonb_build_object('status',s.status,'last_success_at',s.last_success_at,'report_period',s.report_period,'report_date',s.report_date,'row_count',s.row_count,'details',s.details) j
    from public.crm_import_status s where s.source='sales' limit 1
  )
  select jsonb_build_object(
    'version','v23.6.374',
    'period_type',v_mode,'year',v_year,'previous_year',v_year-1,'period',v_period,
    'start_date',v_start,'end_date',v_end,'previous_start_date',v_prev_start,'previous_end_date',v_prev_end,
    'selected_manager',v_effective_manager,
    'managers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'manager_name',mr.manager_name,
        'current_revenue',round(mr.current_revenue,2),
        'previous_revenue',round(mr.previous_revenue,2),
        'delta',round(mr.current_revenue-mr.previous_revenue,2),
        'growth_pct',case when mr.previous_revenue>0 then round(((mr.current_revenue-mr.previous_revenue)/mr.previous_revenue*100)::numeric,1) else null end,
        'clients_total',mr.clients_total,
        'clients_any',mr.clients_with_movement,
        'no_sales_both',mr.no_sales_both,
        'growing',mr.growing,'falling',mr.falling,'new_clients',mr.new_clients,'lost_clients',mr.lost_clients,'adjustments',mr.adjustments,
        'unallocated_current_revenue',round(mr.unallocated_current_revenue,2),
        'unallocated_previous_revenue',round(mr.unallocated_previous_revenue,2),
        'unallocated_entities',mr.unallocated_entities
      ) order by mr.current_revenue desc,mr.manager_name)
      from manager_rows mr
      where v_role='boss' or lower(trim(mr.manager_name))=lower(trim(v_effective_manager))
    ),'[]'::jsonb),
    'clients',coalesce((
      select jsonb_agg(jsonb_build_object(
        'client_id',sc.client_id,'client_name',sc.client_name,'manager_name',sc.manager_name,'region',sc.region,'city',sc.city,
        'client_status',sc.client_status,'category',sc.role_type,
        'current_revenue',round(sc.cur_rev,2),'previous_revenue',round(sc.prev_rev,2),
        'delta',round(sc.cur_rev-sc.prev_rev,2),
        'growth_pct',case when sc.prev_rev>0 and sc.cur_rev>=0 then round(((sc.cur_rev-sc.prev_rev)/sc.prev_rev*100)::numeric,1) else null end,
        'trend',sc.trend
      ) order by
        case when sc.trend='no_sales' then 1 else 0 end,
        (sc.cur_rev-sc.prev_rev) asc,sc.client_name)
      from selected_clients sc
    ),'[]'::jsonb),
    'unallocated',coalesce((
      select jsonb_agg(jsonb_build_object(
        'client_name',su.client_name||' · не распределено по ТТ',
        'manager_name',su.manager_name,
        'current_revenue',round(su.cur_rev,2),'previous_revenue',round(su.prev_rev,2),
        'delta',round(su.cur_rev-su.prev_rev,2),
        'growth_pct',case when su.prev_rev>0 and su.cur_rev>=0 then round(((su.cur_rev-su.prev_rev)/su.prev_rev*100)::numeric,1) else null end,
        'resolution_mode',su.resolution_mode
      ) order by abs(su.cur_rev-su.prev_rev) desc,su.client_name)
      from selected_unallocated su
    ),'[]'::jsonb),
    'diagnostics',coalesce((select to_jsonb(global_diag) from global_diag),'{}'::jsonb),
    'freshness',coalesce((select j from freshness),'{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke execute on function public.crm_sales_month_dashboard_v236374(date,text) from public,anon;
grant execute on function public.crm_sales_month_dashboard_v236374(date,text) to authenticated,service_role;

revoke execute on function public.crm_manager_sales_yoy_v236374(text,integer,integer,text) from public,anon;
grant execute on function public.crm_manager_sales_yoy_v236374(text,integer,integer,text) to authenticated,service_role;
