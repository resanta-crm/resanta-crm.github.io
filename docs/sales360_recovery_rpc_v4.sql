-- Sales 360 Recovery v4: identical read-only evidence for director UI and Lera.
-- Source: imported monthly 1C purchase_history, never daily transactions.
-- Role scope is enforced in the server; do not trust browser identity or manager label.
create or replace function public.crm_sales360_recovery_v4(
 p_year integer default null,
 p_manager text default null,
 p_period text default 'last3',
 p_client_key text default null,
 p_category text default null,
 p_subgroup text default null
) returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth','pg_catalog'
as $recovery$
declare
 v_role text;
 v_name text;
 v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_manager text;
 v_year int := coalesce(p_year,extract(year from (now() at time zone 'Europe/Minsk'))::int);
 v_today_year int := extract(year from (now() at time zone 'Europe/Minsk'))::int;
 v_closed int;
 v_start int;
 v_end int;
 v_period text:=coalesce(p_period,'last3');
 v_client text:=nullif(left(trim(coalesce(p_client_key,'')),300),'');
 v_cat text:=nullif(left(trim(coalesce(p_category,'')),200),'');
 v_sub text:=nullif(left(trim(coalesce(p_subgroup,'')),250),'');
 v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Требуется авторизация' using errcode='42501';end if;
 select u.role,u.name into v_role,v_name from public.users u
 where u.id=auth.uid() or lower(coalesce(u.email,''))=v_email
 order by case when u.id=auth.uid() then 0 else 1 end limit 1;
 if coalesce(v_role,'') not in ('boss','manager') then
  raise exception 'Нет доступа к аналитике продаж' using errcode='42501';
 end if;
 if v_year<2024 or v_year>v_today_year then
  raise exception 'Неподдерживаемый год сравнения' using errcode='22023';
 end if;
 if v_period not in ('last3','ytd','quarter') then
  raise exception 'Неизвестный режим сравнения' using errcode='22023';
 end if;
 if v_role='manager' then
  v_manager:=nullif(trim(coalesce(v_name,'')),'');
  if v_manager is null then raise exception 'Менеджер не определён' using errcode='42501';end if;
  if nullif(trim(coalesce(p_manager,'')),'') is not null
   and lower(trim(p_manager)) not in ('all',lower(v_manager)) then
   raise exception 'Менеджер может просматривать только собственные данные' using errcode='42501';
  end if;
 else
  v_manager:=nullif(trim(coalesce(p_manager,'')),'');
  if lower(coalesce(v_manager,''))='all' then v_manager:=null;end if;
 end if;
 v_closed:=case when v_year<v_today_year then 12 else greatest(0,extract(month from (now() at time zone 'Europe/Minsk'))::int-1) end;
 if v_period='last3' then
  v_end:=v_closed; v_start:=greatest(1,v_closed-2);
 elsif v_period='quarter' then
  v_end:=(v_closed/3)*3;v_start:=greatest(1,v_end-2);
 else
  v_end:=v_closed;v_start:=1;
 end if;
 if v_end<v_start then
  return jsonb_build_object('version','sales360.recovery.4','period',v_period,'year',v_year,
   'previous_year',v_year-1,'complete',false,'reason','Нет завершённого квартала или месяца',
   'groups','[]'::jsonb,'subgroups','[]'::jsonb,'skus','[]'::jsonb,'clients','[]'::jsonb,
   'growing_subgroups','[]'::jsonb,'growing_clients','[]'::jsonb);
 end if;

 with active_clients as materialized (
  select c.id,c.name,c.manager_name from public.clients c
  where coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false
 ),
 exact_sources as materialized (
  select public.crm_client_key(c.name) k,c.id,c.manager_name from active_clients c where public.crm_client_key(c.name)<>''
  union all
  select public.crm_client_key(a.alias_name),c.id,c.manager_name
  from public.client_aliases a join active_clients c on c.id=a.client_id
  where public.crm_client_key(a.alias_name)<>''
 ),
 exact_map as materialized (
  select k,min(id::text)::uuid client_id,min(manager_name) manager_name from exact_sources
  group by k having count(distinct id)=1
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
  select k,case when count(distinct id)=1 then min(id::text)::uuid end client_id,
   case when count(distinct manager_name)=1 then min(manager_name) end manager_name
  from legal_sources group by k
 ),
 scoped as materialized (
  select ph.month::date sales_month,coalesce(ph.revenue,0)::numeric revenue,
   coalesce(nullif(trim(ph.category),''),'Без категории') category,
   coalesce(nullif(trim(ph.subgroup),''),'Без подгруппы') subgroup,
   nullif(trim(ph.sku),'') sku,
   coalesce(nullif(trim(ph.product),''),'Без наименования') product,
   ph.client_name,
   coalesce(ac.manager_name,em.manager_name,lm.manager_name,nullif(trim(ph.manager_name),'')) manager_name,
   coalesce(ac.id::text,em.client_id::text,lm.client_id::text,'name:'||public.crm_client_key(ph.client_name)) client_key
  from public.purchase_history ph
  left join active_clients ac on ac.id=ph.client_id
  left join exact_map em on ac.id is null and em.k=public.crm_client_key(ph.client_name)
  left join legal_map lm on ac.id is null and em.client_id is null
   and lm.k=public.crm_client_legal_key_v236374(ph.client_name)
  where ph.month>=make_date(v_year-1,v_start,1)
   and ph.month<make_date(v_year,v_end,1)+interval '1 month'
   and extract(month from ph.month)::int between v_start and v_end
   and public.crm_client_exact_key_v236204(ph.client_name)<>'итого'
 ),
 filtered as materialized (
  select * from scoped s where
   (v_manager is null or lower(trim(coalesce(s.manager_name,'')))=lower(v_manager))
   and (v_client is null or s.client_key=v_client)
   and (v_cat is null or s.category=v_cat)
   and (v_sub is null or s.subgroup=v_sub)
 ),
 keyed as materialized (
  select s.*,
   case when s.sku is not null then 'sku:'||s.sku
     else 'product:'||s.product end as product_key
  from filtered s
 ),
 grouped as materialized (
  select 'group' kind,max(s.category) category,null::text subgroup,null::text sku,null::text product,
   null::text client_key,null::text client_name,null::text manager_name,
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year),0),2) current_revenue,
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year-1),0),2) previous_revenue
  from keyed s group by s.category
  union all
  select 'subgroup',s.category,s.subgroup,null,null,null,null,null,
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year),0),2),
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year-1),0),2)
  from keyed s group by s.category,s.subgroup
  union all
  select 'sku',s.category,s.subgroup,max(s.sku),max(s.product),null,null,null,
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year),0),2),
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year-1),0),2)
  from keyed s group by s.category,s.subgroup,s.product_key
  union all
  select 'client',null,null,null,null,s.client_key,max(s.client_name),max(s.manager_name),
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year),0),2),
   round(coalesce(sum(s.revenue) filter(where extract(year from s.sales_month)::int=v_year-1),0),2)
  from keyed s group by s.client_key
 ),
 signals as materialized (
  select g.*,round((g.current_revenue-g.previous_revenue),2) delta_byn,
   case when g.previous_revenue>0 then round(100*(g.current_revenue-g.previous_revenue)/g.previous_revenue,1)
    else null end as delta_pct,
   greatest(0,g.previous_revenue-g.current_revenue) loss_byn,
   case when g.previous_revenue=0 and g.current_revenue>0 then 'new'
    when g.previous_revenue>0 and g.current_revenue=0 then 'stopped'
    when g.current_revenue<g.previous_revenue then 'decline'
    when g.current_revenue>g.previous_revenue then 'growth' else 'flat' end as status
  from grouped g
 ),
 source_stamp as materialized (
  select last_success_at,row_count,status from public.crm_import_status where source='sales'
  order by last_success_at desc nulls last limit 1
 )
 select jsonb_build_object(
  'version','sales360.recovery.4','year',v_year,'previous_year',v_year-1,
  'period',v_period,'from_month',v_start,'to_month',v_end,'closed',true,
  'manager',v_manager,'client_key',v_client,'category_filter',v_cat,'subgroup_filter',v_sub,
  'sales_imported_at',(select last_success_at from source_stamp),
  'source_status',(select status from source_stamp),
  'month_granularity',true,'partial_current_month_excluded',v_year=v_today_year,
  'baseline_complete',not(v_year=2024 and v_start<=2),
  'data_quality_note',case when v_year=2024 and v_start<=2 then 'История 2023 года начинается с марта: сравнение января–февраля неполное' else null end,
  'groups',coalesce((select jsonb_agg(to_jsonb(x) order by x.loss_byn desc) from (
     select * from signals where kind='group' and previous_revenue>=5000 and loss_byn>=2500
     order by loss_byn desc limit 30) x),'[]'::jsonb),
  'subgroups',coalesce((select jsonb_agg(to_jsonb(x) order by x.loss_byn desc) from (
     select * from signals where kind='subgroup' and ((v_cat is null and v_client is null and previous_revenue>=5000 and loss_byn>=2500) or ((v_cat is not null or v_client is not null) and previous_revenue>0 and loss_byn>0))
     order by loss_byn desc limit 60) x),'[]'::jsonb),
  'skus',coalesce((select jsonb_agg(to_jsonb(x) order by x.loss_byn desc) from (
     select * from signals where kind='sku' and ((v_cat is null and v_client is null and previous_revenue>=3000 and loss_byn>=1500) or ((v_cat is not null or v_client is not null) and previous_revenue>0 and loss_byn>0))
     order by loss_byn desc limit 60) x),'[]'::jsonb),
  'clients',coalesce((select jsonb_agg(to_jsonb(x) order by x.loss_byn desc) from (
     select * from signals where kind='client' and ((v_cat is null and previous_revenue>=5000 and loss_byn>=2500) or (v_cat is not null and previous_revenue>0 and loss_byn>0))
     order by loss_byn desc limit 60) x),'[]'::jsonb),
  'growing_subgroups',coalesce((select jsonb_agg(to_jsonb(x) order by x.delta_byn desc) from (
     select * from signals where kind='subgroup' and current_revenue>previous_revenue
      and delta_byn>=5000 order by delta_byn desc limit 25) x),'[]'::jsonb),
  'growing_clients',coalesce((select jsonb_agg(to_jsonb(x) order by x.delta_byn desc) from (
     select * from signals where kind='client' and current_revenue>previous_revenue
      and delta_byn>=5000 order by delta_byn desc limit 25) x),'[]'::jsonb),
  'client_drop_30_count',(select count(*) from signals where kind='client' and previous_revenue>=5000 and current_revenue<=previous_revenue*0.7),
  'client_drop_30_gap',(select coalesce(sum(loss_byn),0) from signals where kind='client' and previous_revenue>=5000 and current_revenue<=previous_revenue*0.7),
  'current_revenue',(select coalesce(sum(revenue),0) from keyed where extract(year from sales_month)::int=v_year),
  'previous_revenue',(select coalesce(sum(revenue),0) from keyed where extract(year from sales_month)::int=v_year-1)
 ) into v_result;
 return v_result;
end;
$recovery$;
revoke all on function public.crm_sales360_recovery_v4(integer,text,text,text,text,text) from public,anon;
grant execute on function public.crm_sales360_recovery_v4(integer,text,text,text,text,text) to authenticated,service_role;
