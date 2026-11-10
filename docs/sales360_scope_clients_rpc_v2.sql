-- Sales360 v2: read-only annual scope without Triovist; no changes to v1 or source sales.
-- Exclude verified Triovist legal entity/aliases and source names, never generic 21vek products.
create or replace function public.crm_sales360_annual_v2(p_year integer default null, p_manager text default null, p_exclude_triovist boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth','pg_catalog'
as $fn$
declare
 v_role text;
 v_name text;
 v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_manager text;
 v_year int := coalesce(p_year,extract(year from (now() at time zone 'Europe/Minsk'))::int);
 v_current_year int := extract(year from (now() at time zone 'Europe/Minsk'))::int;
 v_current_month int := extract(month from (now() at time zone 'Europe/Minsk'))::int;
 v_closed int;
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
 v_closed:=case when v_year<v_current_year then 12 else greatest(0,v_current_month-1) end;

 with active_clients as materialized (
  select c.id,c.name,c.manager_name
  from public.clients c
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
 sales as materialized (
  select ph.month::date as month,
   coalesce(ph.revenue,0)::numeric revenue,
   ph.client_name as client_name,
   coalesce(nullif(trim(ph.category),''),'Без категории') category,
   coalesce(ac.manager_name,em.manager_name,lm.manager_name,nullif(trim(ph.manager_name),'')) manager_name,
   coalesce(ac.id,em.client_id,lm.client_id) resolved_client_id,
   coalesce(ac.id::text,em.client_id::text,lm.client_id::text,
      'name:'||public.crm_client_key(ph.client_name)) client_key
  from public.purchase_history ph
  left join active_clients ac on ac.id=ph.client_id
  left join exact_map em on ac.id is null and em.k=public.crm_client_key(ph.client_name)
  left join legal_map lm on ac.id is null and em.client_id is null and lm.k=public.crm_client_legal_key_v236374(ph.client_name)
  where ph.month>=make_date(v_year-1,1,1)
   and ph.month<make_date(v_year+1,1,1)
   and public.crm_client_exact_key_v236204(ph.client_name)<>'итого'
 ),
 triovist_ids as materialized (
  select c.id from public.clients c
  where lower(coalesce(c.name,'')) like '%триовист%' or lower(coalesce(c.name,'')) like '%triovist%'
 ),
 scoped as materialized (
  select s.*,
    (s.resolved_client_id in (select id from triovist_ids)
      or lower(coalesce(s.client_name,'')) like '%триовист%'
      or lower(coalesce(s.client_name,'')) like '%triovist%'
      or public.crm_client_key(s.client_name) in (
        select public.crm_client_key(a.alias_name) from public.client_aliases a
        where a.client_id in (select id from triovist_ids))
    ) as is_triovist
  from sales s
  where v_manager is null or lower(trim(coalesce(s.manager_name,'')))=lower(v_manager)
 ),
 filtered as materialized (
  select * from scoped s where not coalesce(p_exclude_triovist,false) or not s.is_triovist
 ),
 sums as materialized (
  select extract(month from f.month)::int mn,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year),0),2) current_revenue,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year-1),0),2) previous_revenue,
   count(*) filter(where extract(year from f.month)::int=v_year)::int current_rows,
   count(*) filter(where extract(year from f.month)::int=v_year-1)::int previous_rows
  from filtered f group by 1
 ),
 manager_sum as materialized (
  select coalesce(nullif(trim(f.manager_name),''),'Не распределено') name,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed),0),2) current_revenue,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year-1 and extract(month from f.month)::int<=v_closed),0),2) previous_revenue,
   count(distinct f.client_key) filter(where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed and f.revenue>0)::int client_count
  from filtered f group by 1
 ),
 cats as materialized (
  select f.category,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed),0),2) current_revenue,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year-1 and extract(month from f.month)::int<=v_closed),0),2) previous_revenue,
   count(distinct f.client_key) filter(where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed and f.revenue>0)::int clients
  from filtered f group by 1
 ),
 matrix as materialized (
  select coalesce(nullif(trim(f.manager_name),''),'Не распределено') manager_name, f.category,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed),0),2) revenue,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year-1 and extract(month from f.month)::int<=v_closed),0),2) previous_revenue,
   count(distinct f.client_key) filter(where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed and f.revenue>0)::int clients
  from filtered f group by 1,2
 )
 select jsonb_build_object(
  'version','sales360.2',
  'exclude_triovist',coalesce(p_exclude_triovist,false),
  'triovist_revenue_ytd',round(coalesce((select sum(s.revenue) from scoped s where s.is_triovist and extract(year from s.month)::int=v_year and extract(month from s.month)::int<=v_closed),0),2),
  'year',v_year,'previous_year',v_year-1,'closed_month',v_closed,
  'manager',v_manager,'scope_role',v_role,
  'kpi_month',case when v_year=v_current_year then to_char((now() at time zone 'Europe/Minsk')::date,'YYYY-MM') else null end,
  'kpi',case when v_year=v_current_year then coalesce((
    select jsonb_agg(jsonb_build_object('manager_name',k.manager_name,'actual',k.shipment,'plan',k.shipment_plan,'akb',k.akb) order by k.manager_name)
    from public.crm_manager_kpi_leaderboard(to_char((now() at time zone 'Europe/Minsk')::date,'YYYY-MM')) k
    where v_manager is null or lower(trim(k.manager_name))=lower(v_manager)
  ),'[]'::jsonb) else '[]'::jsonb end,
  'months',coalesce((select jsonb_agg(jsonb_build_object(
      'month',to_char(make_date(v_year,m.mn,1),'YYYY-MM'),
      'current',coalesce(s.current_revenue,0),
      'previous',coalesce(s.previous_revenue,0),
      'has_current',coalesce(s.current_rows,0)>0,
      'has_previous',coalesce(s.previous_rows,0)>0,
      'closed',m.mn<=v_closed,
      'partial',v_year=v_current_year and m.mn=v_current_month
    ) order by m.mn)
    from generate_series(1,12) m(mn) left join sums s on s.mn=m.mn),'[]'::jsonb),
  'managers',coalesce((select jsonb_agg(to_jsonb(m) order by m.current_revenue desc,m.name) from manager_sum m),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.current_revenue desc,c.category) from cats c),'[]'::jsonb),
  'matrix',coalesce((select jsonb_agg(to_jsonb(x) order by x.manager_name,x.category) from matrix x),'[]'::jsonb),
  'active_clients_ytd',(select count(distinct f.client_key)::int from filtered f where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed and f.revenue>0),
  'top_clients',coalesce((
    select jsonb_agg(to_jsonb(t) order by t.revenue desc,t.client_name)
    from (
      select f.client_key, max(f.client_name) as client_name,
       max(f.resolved_client_id::text) as client_id,
       max(f.manager_name) as manager_name,
       bool_or(f.resolved_client_id is null) as is_unallocated,
       round(sum(f.revenue),2) as revenue
      from filtered f
      where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed
      group by f.client_key order by sum(f.revenue) desc, max(f.client_name) limit 15
    ) t),'[]'::jsonb),
  'unallocated_manager_revenue',round(coalesce((select sum(f.revenue) from filtered f where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed and f.manager_name is null),0),2),
  'unallocated_client_revenue',round(coalesce((select sum(f.revenue) from filtered f where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed and f.resolved_client_id is null),0),2),
  'freshness',(select jsonb_build_object('status',s.status,'last_success_at',s.last_success_at,'report_period',s.report_period,'report_date',s.report_date,'row_count',s.row_count)
    from public.crm_import_status s where s.source='sales' limit 1)
 ) into v_out;
 return v_out;
end;
$fn$;
revoke all on function public.crm_sales360_annual_v2(integer,text,boolean) from public,anon;
grant execute on function public.crm_sales360_annual_v2(integer,text,boolean) to authenticated,service_role;