create function private.crm_sales_month_breakdown_v1(
  p_month date, p_manager text, p_view text, p_client_key text,
  p_search text, p_limit integer, p_offset integer
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_role text;
  actor_name text;
  manager_filter text := nullif(trim(coalesce(p_manager,'')),'');
  client_filter text := nullif(left(trim(coalesce(p_client_key,'')),300),'');
  search_filter text := lower(left(trim(coalesce(p_search,'')),120));
  page_size integer := least(50,greatest(1,coalesce(p_limit,25)));
  page_start integer := least(10000,greatest(0,coalesce(p_offset,0)));
  response jsonb;
begin
  select u.role,u.name into actor_role,actor_name
  from public.users u
  where u.id=auth.uid() and coalesce(u.access_scope,'standard')='standard';
  if coalesce(actor_role,'') not in ('boss','manager') then
    raise exception 'Нет доступа к продажам' using errcode='42501';
  end if;
  if lower(manager_filter)='all' then manager_filter := null; end if;
  if actor_role='manager' then
    if nullif(trim(actor_name),'') is null
       or (manager_filter is not null and lower(manager_filter)<>lower(trim(actor_name))) then
      raise exception 'Допустимы только продажи своего портфеля' using errcode='42501';
    end if;
    manager_filter := trim(actor_name);
  end if;
  if p_month is null or p_month<date '2023-01-01'
     or p_month>date_trunc('month',now() at time zone 'Europe/Minsk')::date
     or extract(day from p_month)<>1 or p_view is null or p_view not in ('clients','sku') then
    raise exception 'Укажите корректный месяц и разрез' using errcode='22023';
  end if;

  -- Match crm_sales360_clients_v2: known point, unique exact alias, then unique legal entity.
  with active_clients as materialized (
    select id,name,manager_name from public.clients
    where not coalesce(is_archived,false) and not coalesce(to_delete,false)
  ), client_names as materialized (
    select id,name,manager_name from active_clients
    union all
    select c.id,a.alias_name,c.manager_name
    from public.client_aliases a join active_clients c on c.id=a.client_id
  ), names_with_keys as materialized (
    select id,manager_name,public.crm_client_key(name) exact_key,
           public.crm_client_legal_key_v236374(name) legal_key from client_names
  ), exact_names as (
    select exact_key,min(id::text)::uuid id,min(manager_name) manager_name
    from names_with_keys where exact_key<>'' group by exact_key having count(distinct id)=1
  ), legal_names as (
    select legal_key,
           case when count(distinct id)=1 then min(id::text)::uuid end id,
           case when count(distinct manager_name)=1 then min(manager_name) end manager_name
    from names_with_keys where legal_key<>'' group by legal_key
  ), month_sales as materialized (
    select ph.client_id,ph.client_name,ph.manager_name,nullif(trim(ph.sku),'') sku,
           coalesce(nullif(trim(ph.product),''),'Без наименования') product,
           coalesce(ph.qty,0)::numeric quantity,coalesce(ph.revenue,0)::numeric revenue
    from public.purchase_history ph where ph.month=p_month
  ), sale_names as materialized (
    select n.client_name,public.crm_client_key(n.client_name) exact_key,
           public.crm_client_legal_key_v236374(n.client_name) legal_key
    from (select distinct coalesce(client_name,'') client_name from month_sales) n
    where public.crm_client_exact_key_v236204(n.client_name)<>'итого'
  ), resolved as (
    select s.*,coalesce(ac.id,em.id,lm.id) resolved_id,
           coalesce(ac.id::text,em.id::text,lm.id::text,'name:'||sn.exact_key) client_key,
           coalesce(ac.manager_name,em.manager_name,lm.manager_name,nullif(trim(s.manager_name),'')) resolved_manager
    from month_sales s join sale_names sn on sn.client_name=coalesce(s.client_name,'')
    left join active_clients ac on ac.id=s.client_id
    left join exact_names em on ac.id is null and em.exact_key=sn.exact_key
    left join legal_names lm on ac.id is null and em.id is null and lm.legal_key=sn.legal_key
  ), scoped as materialized (
    select r.* from resolved r
    where (manager_filter is null or lower(trim(r.resolved_manager))=lower(manager_filter))
      and (client_filter is null or r.client_key=client_filter)
  ), grouped as (
    select r.client_key item_key,max(r.client_name) label,null::text sku,
           count(distinct r.resolved_id)=0 unallocated,
           round(sum(r.revenue),2) revenue,sum(r.quantity) quantity
    from scoped r where p_view='clients' group by r.client_key
    union all
    select coalesce('sku:'||r.sku,'product:'||r.product),max(r.product),max(r.sku),false,
           round(sum(r.revenue),2),sum(r.quantity)
    from scoped r where p_view='sku' group by coalesce('sku:'||r.sku,'product:'||r.product)
  ), matched as materialized (
    select g.* from grouped g where search_filter=''
      or strpos(lower(coalesce(g.label,'')),search_filter)>0
      or strpos(lower(coalesce(g.sku,'')),search_filter)>0
  ), paged as (
    select * from matched order by revenue desc,label,item_key limit page_size offset page_start
  )
  select jsonb_build_object(
    'month',to_char(p_month,'YYYY-MM'),'partial',p_month=date_trunc('month',now() at time zone 'Europe/Minsk')::date,
    'has_rows',exists(select 1 from scoped),'total',(select count(*) from matched),
    'revenue',coalesce((select round(sum(revenue),2) from scoped),0),
    'items',coalesce((select jsonb_agg(to_jsonb(p) order by p.revenue desc,p.label,p.item_key) from paged p),'[]'::jsonb)
  ) into response;
  return response;
end;
$$;

create function public.crm_sales_month_breakdown_v1(
  p_month date, p_manager text default null, p_view text default 'clients',
  p_client_key text default null, p_search text default '', p_limit integer default 25, p_offset integer default 0
) returns jsonb
language sql stable security invoker set search_path = ''
return private.crm_sales_month_breakdown_v1(p_month,p_manager,p_view,p_client_key,p_search,p_limit,p_offset);

revoke all on function private.crm_sales_month_breakdown_v1(date,text,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.crm_sales_month_breakdown_v1(date,text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function private.crm_sales_month_breakdown_v1(date,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.crm_sales_month_breakdown_v1(date,text,text,text,text,integer,integer) to authenticated;
