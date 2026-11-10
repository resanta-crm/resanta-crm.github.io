-- Sales360 v3 additive, read-only drilldown. Based on real purchase_history group/subgroup/SKU.
-- Preserves manager authorization and current client-name/alias matching used by Sales360 v2.
create or replace function public.crm_sales360_product_drill_v3(
 p_year integer default null,
 p_manager text default null,
 p_client_key text default null,
 p_category text default null,
 p_subgroup text default null,
 p_level text default 'subgroups',
 p_search text default '',
 p_limit integer default 50,
 p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth','pg_catalog'
as $drill$
declare
 v_role text;
 v_name text;
 v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_manager text;
 v_year int := coalesce(p_year,extract(year from (now() at time zone 'Europe/Minsk'))::int);
 v_current_year int := extract(year from (now() at time zone 'Europe/Minsk'))::int;
 v_closed int;
 v_category text := nullif(left(trim(coalesce(p_category,'')),200),'');
 v_subgroup text := nullif(left(trim(coalesce(p_subgroup,'')),250),'');
 v_key text := nullif(left(trim(coalesce(p_client_key,'')),300),'');
 v_level text := coalesce(nullif(trim(p_level),''),'subgroups');
 v_search text := left(trim(coalesce(p_search,'')),120);
 v_limit int := least(100,greatest(1,coalesce(p_limit,50)));
 v_offset int := least(10000,greatest(0,coalesce(p_offset,0)));
 v_out jsonb;
begin
 if auth.uid() is null then raise exception 'Требуется авторизация' using errcode='42501'; end if;
 select u.role,u.name into v_role,v_name
 from public.users u where u.id=auth.uid() or lower(coalesce(u.email,''))=v_email
 order by case when u.id=auth.uid() then 0 else 1 end limit 1;
 if coalesce(v_role,'') not in ('boss','manager') then
  raise exception 'Нет доступа к аналитике продаж' using errcode='42501';
 end if;
 if v_year<2023 or v_year>v_current_year then
  raise exception 'Неподдерживаемый год' using errcode='22023';
 end if;
 if v_level not in ('subgroups','sku') or v_category is null or (v_level='sku' and v_subgroup is null) then
  raise exception 'Укажите группу, подгруппу и корректный уровень детализации' using errcode='22023';
 end if;
 if v_role='manager' then
  v_manager:=nullif(trim(coalesce(v_name,'')),'');
  if v_manager is null then raise exception 'Не определён менеджер' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_manager,'')),'') is not null
   and lower(trim(p_manager)) not in ('all',lower(v_manager)) then
   raise exception 'Менеджер может просматривать только собственные данные' using errcode='42501';
  end if;
 else
  v_manager:=nullif(trim(coalesce(p_manager,'')),'');
  if lower(coalesce(v_manager,''))='all' then v_manager:=null;end if;
 end if;
 v_closed:=case when v_year<v_current_year then 12
  else greatest(0,extract(month from (now() at time zone 'Europe/Minsk'))::int-1) end;

 with active_clients as materialized (
  select c.id,c.name,c.manager_name from public.clients c
  where coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false
 ),
 exact_sources as materialized (
  select public.crm_client_key(c.name) k,c.id,c.manager_name from active_clients c
  where public.crm_client_key(c.name)<>''
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
  select public.crm_client_legal_key_v236374(c.name) k,c.id,c.manager_name
  from active_clients c where public.crm_client_legal_key_v236374(c.name)<>''
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
 scoped_sales as materialized (
  select ph.month::date month,
   coalesce(ph.revenue,0)::numeric revenue,
   coalesce(ph.qty,0)::numeric quantity,
   coalesce(nullif(trim(ph.subgroup),''),'Без подгруппы') subgroup,
   nullif(trim(ph.sku),'') sku,
   coalesce(nullif(trim(ph.product),''),'Без наименования') product,
   coalesce(ac.manager_name,em.manager_name,lm.manager_name,nullif(trim(ph.manager_name),'')) manager_name,
   coalesce(ac.id::text,em.client_id::text,lm.client_id::text,'name:'||public.crm_client_key(ph.client_name)) client_key
  from public.purchase_history ph
  left join active_clients ac on ac.id=ph.client_id
  left join exact_map em on ac.id is null and em.k=public.crm_client_key(ph.client_name)
  left join legal_map lm on ac.id is null and em.client_id is null and lm.k=public.crm_client_legal_key_v236374(ph.client_name)
  where ph.month>=make_date(v_year-1,1,1)
   and ph.month<make_date(v_year+1,1,1)
   and extract(month from ph.month)::int<=v_closed
   and coalesce(nullif(trim(ph.category),''),'Без категории')=v_category
   and (v_level='subgroups' or coalesce(nullif(trim(ph.subgroup),''),'Без подгруппы')=v_subgroup)
   and public.crm_client_exact_key_v236204(ph.client_name)<>'итого'
 ),
 filtered as materialized (
  select * from scoped_sales s
  where (v_manager is null or lower(trim(coalesce(s.manager_name,'')))=lower(v_manager))
   and (v_key is null or s.client_key=v_key)
 ),
 grouped as materialized (
  select
   case when v_level='subgroups' then 'subgroup:'||f.subgroup
    when f.sku is not null then 'sku:'||f.sku
    else 'product:'||f.product end item_key,
   case when v_level='subgroups' then f.subgroup
    else max(f.product) end item_name,
   case when v_level='sku' then max(f.sku) else null end sku,
   case when v_level='sku' then max(f.product) else null end product,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year),0),2) current_revenue,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year-1),0),2) previous_revenue,
   round(coalesce(sum(f.quantity) filter(where extract(year from f.month)::int=v_year),0),2) current_qty,
   round(coalesce(sum(f.quantity) filter(where extract(year from f.month)::int=v_year-1),0),2) previous_qty
  from filtered f
  group by 1,case when v_level='subgroups' then f.subgroup else null end
 ),
 matched as materialized (
  select * from grouped g where v_search=''
   or g.item_name ilike '%'||v_search||'%'
   or coalesce(g.sku,'') ilike '%'||v_search||'%'
 ),
 paged as materialized (
  select * from matched order by current_revenue desc,item_name,item_key
  limit v_limit offset v_offset
 )
 select jsonb_build_object(
  'version','sales360.product.3','year',v_year,'previous_year',v_year-1,'closed_month',v_closed,
  'manager',v_manager,'client_key',v_key,'category',v_category,'subgroup',v_subgroup,
  'level',v_level,'total',(select count(*) from matched),'limit',v_limit,'offset',v_offset,
  'current_revenue',coalesce((select round(sum(current_revenue),2) from grouped),0),
  'previous_revenue',coalesce((select round(sum(previous_revenue),2) from grouped),0),
  'items',coalesce((select jsonb_agg(to_jsonb(p) order by p.current_revenue desc,p.item_name,p.item_key) from paged p),'[]'::jsonb)
 ) into v_out;
 return v_out;
end;
$drill$;
revoke all on function public.crm_sales360_product_drill_v3(integer,text,text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.crm_sales360_product_drill_v3(integer,text,text,text,text,text,text,integer,integer) to authenticated,service_role;
