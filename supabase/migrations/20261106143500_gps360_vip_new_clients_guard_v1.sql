-- GPS360 / 1C 2026-11-06: prevent VIP contractor from becoming new field client.
-- Changes ONLY manager new/reactivated client attribution, NOT purchase_history or revenue.
-- Sales 517.10 BYN must be verified against original 1C report before financial reattribution.

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
      -- Protected 21vek/VIP contractor must not be awarded as a new field customer.
      and public.crm_client_key(ph.client_name)<>public.crm_client_key('Триовист ООО')
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

-- Reversible cleanup of the accidental client-card created automatically on 04.11.
-- Do not delete any historical sales, visits, tasks or original 1C documents.
-- Rerunnable: conditions match only the known erroneous, unreviewed card.
UPDATE public.clients c
SET manager_name=NULL,
    is_archived=TRUE
WHERE c.id='ebd97062-a51a-4716-818d-7477934c14fd'::uuid
  AND c.name='Триовист ООО'
  AND c.manager_name='Руднев'
  AND c.auto_created IS TRUE
  AND c.reviewed IS FALSE
  AND c.created_from='1С: продажи'
  AND NOT EXISTS (SELECT 1 FROM public.visits v WHERE v.client_id=c.id)
  AND NOT EXISTS (SELECT 1 FROM public.route_plans r WHERE r.client_id=c.id);

-- Rollback of only the card cleanup if required (do not execute automatically):
-- UPDATE public.clients SET manager_name='Руднев',is_archived=FALSE
-- WHERE id='ebd97062-a51a-4716-818d-7477934c14fd'::uuid AND name='Триовист ООО';
