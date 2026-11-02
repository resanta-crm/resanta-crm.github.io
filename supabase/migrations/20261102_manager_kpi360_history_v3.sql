-- KPI360 v3. Read-only six-month ranking and manager history for the approved UI.
-- Historical ranks use the SAME three-plan scoring concept as the original managers KPI,
-- but the clients-for-KPI component uses deduplicated first-or-returned after six full months.
-- Full team is used ONLY inside the server for ranks; MPP receive their own rows.
create or replace function public.crm_manager_kpi360_history_v3(p_month text)
returns jsonb language plpgsql security definer
set search_path to 'public','auth','pg_catalog'
as $fn$
declare
  actor public.users%rowtype;
  chosen date;
  result_json jsonb;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    then raise exception 'invalid_month'; end if;
  chosen := (p_month||'-01')::date;
  select * into actor from public.users where id=auth.uid();
  if actor.id is null then raise exception 'login_required'; end if;
  if not (
    (actor.role='boss' and actor.region='Витебск'
      and public.crm_v2263_norm(actor.name) in ('александр паюшин','сидарович к н'))
    or
    (actor.role='manager' and actor.region='Витебск'
      and public.crm_v2263_norm(actor.name) in ('руднев','ачинович','шкуран'))
  ) then raise exception 'not_authorized'; end if;

  with periods as materialized (
    select g.period::date as sale_month
    from generate_series((chosen-interval '5 months')::date,chosen,interval '1 month') g(period)
  ),
  staff as materialized (
    select u.name::text manager_name, public.crm_v2263_norm(u.name) mk
    from public.users u
    where u.role='manager' and u.region='Витебск'
      and public.crm_v2263_norm(u.name) in ('руднев','ачинович','шкуран')
  ),
  existing_kpi as materialized (
    select p.sale_month,public.crm_v2263_norm(k.manager_name) mk,k.shipment,k.shipment_plan,
      k.akb_plan,k.new_clients_plan,k.manager_name
    from periods p
    cross join lateral public.crm_manager_kpi_leaderboard(to_char(p.sale_month,'YYYY-MM')) k
    where public.crm_v2263_norm(k.manager_name) in ('руднев','ачинович','шкуран')
  ),
  aliases_raw as (
    select public.crm_client_key(c.name) name_key,c.id,c.manager_name
    from public.clients c where not coalesce(c.is_archived,false)
      and not coalesce(c.to_delete,false)
    union all
    select public.crm_client_key(a.alias_name),c.id,c.manager_name
    from public.client_aliases a join public.clients c on c.id=a.client_id
    where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
  ),
  unique_aliases as materialized (
    select name_key,min(id::text)::uuid cid,min(manager_name) manager_name
    from aliases_raw where name_key<>'' group by name_key having count(distinct id)=1
  ),
  history as materialized (
    select ph.month::date sale_month,
      case when coalesce(c.id,al.cid) is not null
        then 'id:'||coalesce(c.id,al.cid)::text
        else 'name:'||public.crm_client_key(ph.client_name) end ck,
      public.crm_v2263_norm(coalesce(c.manager_name,al.manager_name,
        nullif(btrim(ph.manager_name),''))) mk,
      coalesce(ph.revenue,0)::numeric revenue,coalesce(ph.qty,0)::numeric qty
    from public.purchase_history ph
    left join public.clients c on c.id=ph.client_id
      and not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
    left join unique_aliases al on c.id is null
      and al.name_key=public.crm_client_key(ph.client_name)
    where ph.month<=chosen
      and public.crm_client_key(ph.client_name)<>public.crm_client_key('Итого')
  ),
  active_months as materialized (
    select sale_month,ck,mk
    from history where revenue>0 or qty>0 group by sale_month,ck,mk
  ),
  classified as materialized (
    select a.sale_month,a.ck,a.mk,
      case when not exists(
        select 1 from active_months prev
        where prev.ck=a.ck and prev.sale_month<a.sale_month
      ) then 'first'
      when not exists(
        select 1 from active_months recent
        where recent.ck=a.ck
          and recent.sale_month>=(a.sale_month-interval '6 months')::date
          and recent.sale_month<a.sale_month
      ) then 'returned'
      else 'active' end kind
    from active_months a
    join periods p on p.sale_month=a.sale_month
    where a.mk in (select mk from staff)
  ),
  counts as materialized (
    select sale_month,mk,
      count(distinct ck)::int akb,
      count(*) filter(where kind='first')::int first_clients,
      count(*) filter(where kind='returned')::int returned_clients
    from classified group by sale_month,mk
  ),
  facts as materialized (
    select p.sale_month,s.mk,s.manager_name,
      coalesce(k.shipment,0)::numeric shipment,
      coalesce(k.shipment_plan,0)::numeric shipment_plan,
      coalesce(c.akb,0)::int akb,
      coalesce(k.akb_plan,0)::numeric akb_plan,
      coalesce(c.first_clients,0)::int first_clients,
      coalesce(c.returned_clients,0)::int returned_clients,
      (coalesce(c.first_clients,0)+coalesce(c.returned_clients,0))::int bonus,
      coalesce(k.new_clients_plan,0)::numeric bonus_plan
    from periods p cross join staff s
    left join existing_kpi k on k.sale_month=p.sale_month and k.mk=s.mk
    left join counts c on c.sale_month=p.sale_month and c.mk=s.mk
  ),
  scored as materialized (
    select f.*,
      (case when shipment_plan>0 then 1 else 0 end+
       case when akb_plan>0 then 1 else 0 end+
       case when bonus_plan>0 then 1 else 0 end) as plan_fields,
      round((
        case when shipment_plan>0 then round(shipment/shipment_plan*100) else 0 end+
        case when akb_plan>0 then round(akb/akb_plan*100) else 0 end+
        case when bonus_plan>0 then round(bonus/bonus_plan*100) else 0 end
      )/nullif((
        case when shipment_plan>0 then 1 else 0 end+
        case when akb_plan>0 then 1 else 0 end+
        case when bonus_plan>0 then 1 else 0 end
      ),0))::int as overall_score
    from facts f
  ),
  ranked as materialized (
    select x.*,
      row_number() over(partition by sale_month order by overall_score desc nulls last,
        shipment desc,manager_name)::int as position_overall,
      row_number() over(partition by sale_month order by shipment desc,manager_name)::int as position_sales,
      row_number() over(partition by sale_month order by akb desc,shipment desc,manager_name)::int as position_akb,
      row_number() over(partition by sale_month order by bonus desc,shipment desc,manager_name)::int as position_bonus,
      count(*) over(partition by sale_month)::int as team_size
    from scored x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',to_char(r.sale_month,'YYYY-MM'),'manager_name',r.manager_name,
    'sales',r.shipment,'sales_plan',r.shipment_plan,
    'akb',r.akb,'akb_plan',r.akb_plan,
    'bonus',r.bonus,'bonus_plan',r.bonus_plan,
    'first',r.first_clients,'returned',r.returned_clients,
    'overall_score',r.overall_score,
    'rank_overall',case when r.plan_fields>0 then r.position_overall else null end,
    'rank_sales',r.position_sales,'rank_akb',r.position_akb,
    'rank_bonus',r.position_bonus,'team_size',r.team_size
  ) order by r.sale_month,r.manager_name),'[]'::jsonb)
  into result_json
  from ranked r
  where actor.role='boss' or r.mk=public.crm_v2263_norm(actor.name);

  return jsonb_build_object(
    'version','kpi360-history-v3','month',p_month,
    'rows',coalesce(result_json,'[]'::jsonb),
    'rank_rule','overall:mean_of_available_three_plan_percentages;tabs:metric_fact',
    'history_source','1c-sales-current-client-ownership',
    'premium_rule','first_or_six_full_months_absent'
  );
end;
$fn$;
revoke all on function public.crm_manager_kpi360_history_v3(text) from public,anon;
grant execute on function public.crm_manager_kpi360_history_v3(text) to authenticated;