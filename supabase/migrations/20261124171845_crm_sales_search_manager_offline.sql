-- Normalize each distinct 1C customer name once per report. Preserve scoped attribution, totals and pagination.
CREATE OR REPLACE FUNCTION public.crm_sales360_clients_v2(p_year integer DEFAULT NULL::integer, p_manager text DEFAULT NULL::text, p_exclude_triovist boolean DEFAULT false, p_search text DEFAULT ''::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_client_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
 v_role text;
 v_name text;
 v_email text := lower(coalesce(auth.jwt()->>'email',''));
 v_manager text;
 v_year int := coalesce(p_year,extract(year from (now() at time zone 'Europe/Minsk'))::int);
 v_current_year int := extract(year from (now() at time zone 'Europe/Minsk'))::int;
 v_current_month int := extract(month from (now() at time zone 'Europe/Minsk'))::int;
 v_closed int;
 v_search text := left(trim(coalesce(p_search,'')),120);
 v_key text := nullif(left(trim(coalesce(p_client_key,'')),300),'');
 v_limit int := least(50,greatest(1,coalesce(p_limit,20)));
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
 triovist_ids as materialized (
  select c.id from public.clients c where
   lower(coalesce(c.name,'')) like '%триовист%' or lower(coalesce(c.name,'')) like '%triovist%'
 ),
 distinct_names as materialized (
  select distinct coalesce(ph.client_name,'') as client_name from public.purchase_history ph
  where ph.month>=make_date(v_year-1,1,1) and ph.month<make_date(v_year+1,1,1)
 ),
 sale_names as materialized (
  select coalesce(d.client_name,'') client_name,public.crm_client_key(d.client_name) exact_key,
   public.crm_client_legal_key_v236374(d.client_name) legal_key
  from distinct_names d
  where public.crm_client_exact_key_v236204(d.client_name)<>'итого'
 ),
 sales as materialized (
  select ph.month::date as month,coalesce(ph.revenue,0)::numeric as revenue,
   ph.client_name,coalesce(nullif(trim(ph.category),''),'Без категории') category,
   coalesce(nullif(trim(ph.subgroup),''),'Без подгруппы') subgroup,
   coalesce(ac.manager_name,em.manager_name,lm.manager_name,nullif(trim(ph.manager_name),'')) manager_name,
   coalesce(ac.id,em.client_id,lm.client_id) resolved_client_id,
   coalesce(ac.id::text,em.client_id::text,lm.client_id::text,'name:'||sn.exact_key) client_key,
   sn.exact_key
  from public.purchase_history ph
  join sale_names sn on sn.client_name=coalesce(ph.client_name,'')
  left join active_clients ac on ac.id=ph.client_id
  left join exact_map em on ac.id is null and em.k=sn.exact_key
  left join legal_map lm on ac.id is null and em.client_id is null and lm.k=sn.legal_key
  where ph.month>=make_date(v_year-1,1,1)
   and ph.month<make_date(v_year+1,1,1)
 ),
 scoped as materialized (
  select s.*,
   (coalesce(s.resolved_client_id in (select id from triovist_ids),false)
      or lower(coalesce(s.client_name,'')) like '%триовист%'
      or lower(coalesce(s.client_name,'')) like '%triovist%'
      or s.exact_key in (
       select public.crm_client_key(a.alias_name) from public.client_aliases a
       where a.client_id in (select id from triovist_ids))
   ) as is_triovist
  from sales s where v_manager is null or lower(trim(coalesce(s.manager_name,'')))=lower(v_manager)
 ),
 filtered as materialized (
  select * from scoped s where not coalesce(p_exclude_triovist,false) or not s.is_triovist
 ),
 totals as materialized (
  select f.client_key,max(f.client_name) client_name,
   max(f.resolved_client_id::text) client_id,max(f.manager_name) manager_name,
   bool_or(f.resolved_client_id is null) is_unallocated,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year and extract(month from f.month)::int<=v_closed),0),2) current_revenue,
   round(coalesce(sum(f.revenue) filter(where extract(year from f.month)::int=v_year-1 and extract(month from f.month)::int<=v_closed),0),2) previous_revenue
  from filtered f
  group by f.client_key
 ),
 matched as materialized (
  select t.* from totals t where
  v_search='' or t.client_name ilike '%'||v_search||'%' or
  coalesce(t.manager_name,'') ilike '%'||v_search||'%'
 ),
 paged as materialized (
  select client_key,client_name,client_id,manager_name,is_unallocated,current_revenue,previous_revenue
  from matched order by current_revenue desc,client_name,client_key limit v_limit offset v_offset
 ),
 selected_sales as materialized (
  select * from filtered f where v_key is not null and f.client_key=v_key
 )
 select jsonb_build_object(
  'version','sales360.clients.2','year',v_year,'previous_year',v_year-1,
  'closed_month',v_closed,'manager',v_manager,
  'exclude_triovist',coalesce(p_exclude_triovist,false),
  'total',(select count(*) from matched),
  'limit',v_limit,'offset',v_offset,
  'items',coalesce((select jsonb_agg(to_jsonb(p) order by p.current_revenue desc,p.client_name,p.client_key) from paged p),'[]'::jsonb),
  'detail',(
   select jsonb_build_object(
    'client',to_jsonb(t),
    'months',coalesce((
      select jsonb_agg(jsonb_build_object(
       'month',to_char(make_date(v_year,g.mn,1),'YYYY-MM'),
       'current',coalesce(ms.current_revenue,0),'previous',coalesce(ms.previous_revenue,0),
       'closed',g.mn<=v_closed,
       'partial',v_year=v_current_year and g.mn=v_current_month,
       'has_current',coalesce(ms.current_rows,0)>0,
       'has_previous',coalesce(ms.previous_rows,0)>0
      ) order by g.mn)
      from generate_series(1,12) g(mn) left join (
        select extract(month from s.month)::int mn,
         round(coalesce(sum(s.revenue) filter(where extract(year from s.month)::int=v_year),0),2) current_revenue,
         round(coalesce(sum(s.revenue) filter(where extract(year from s.month)::int=v_year-1),0),2) previous_revenue,
         count(*) filter(where extract(year from s.month)::int=v_year)::int current_rows,
         count(*) filter(where extract(year from s.month)::int=v_year-1)::int previous_rows
        from selected_sales s group by 1
      ) ms on ms.mn=g.mn
    ),'[]'::jsonb),
    'categories',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.current_revenue desc,q.category)
      from (
       select s.category,
        round(coalesce(sum(s.revenue) filter(where extract(year from s.month)::int=v_year and extract(month from s.month)::int<=v_closed),0),2) current_revenue,
        round(coalesce(sum(s.revenue) filter(where extract(year from s.month)::int=v_year-1 and extract(month from s.month)::int<=v_closed),0),2) previous_revenue
       from selected_sales s group by s.category
      ) q
    ),'[]'::jsonb)
   ) from totals t where v_key is not null and t.client_key=v_key limit 1
  )
 ) into v_out;
 return v_out;
end;
$function$;

-- Allow field managers to sync their own ordinary route visits using the same atomic transaction.
CREATE OR REPLACE FUNCTION public.crm_offline_save_visit_v1(p_request_id uuid, p_visit jsonb, p_task_decisions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  manager text;
  route public.route_plans%rowtype;
  task public.tasks%rowtype;
  receipt crm_offline_private.visit_receipts%rowtype;
  input public.visits%rowtype;
  decision jsonb;
  payload_hash bytea;
  saved jsonb;
  saved_visit_id uuid;
begin
  select u.name into manager
  from public.users u
  where u.id = actor
    and u.access_scope = 'standard'
    and (u.role = 'manager' or
      (u.role = 'boss' and u.id = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc'));
  if manager is null then
    raise exception using errcode = '42501', message = 'OFFLINE_ACCESS_DENIED';
  end if;
  if p_request_id is null
    or jsonb_typeof(p_visit) is distinct from 'object'
    or jsonb_typeof(p_task_decisions) is distinct from 'array'
    or pg_column_size(p_visit) + pg_column_size(p_task_decisions) > 100000 then
    raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
  end if;

  payload_hash := sha256(convert_to(jsonb_build_array(p_visit,p_task_decisions)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_id::text, 0));
  select * into receipt from crm_offline_private.visit_receipts
  where owner_id = actor and request_id = p_request_id;
  if found then
    if receipt.payload_hash is distinct from payload_hash then raise exception 'OFFLINE_REQUEST_CHANGED'; end if;
    return jsonb_build_object('visit_id',receipt.visit_id,'replayed',true);
  end if;

  input := jsonb_populate_record(null::public.visits, p_visit);
  if input.client_id is null or input.date is null or nullif(trim(input.route_plan_id),'') is null
    or not coalesce(length(trim(input.text)) between 1 and 4000, false)
    or not coalesce(input.result in ('✅ Заказ','🤝 Переговоры','❌ Не застал','📦 Мерчендайзинг',
      '📚 Обучение','💬 Работа с ЛПР','📞 Звонок'), false)
    or (input.gps_lat is null) <> (input.gps_lng is null)
    or input.gps_lat not between -90 and 90 or input.gps_lng not between -180 and 180
    or input.gps_accuracy < 0 then
    raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
  end if;
  select * into route from public.route_plans
  where id = input.route_plan_id::uuid
  for update;
  if not found or coalesce(route.removed,false) or route.review_status in ('pending','rejected')
    or route.visit_date is distinct from input.date or route.client_id is distinct from input.client_id
    or route.manager_name is distinct from manager then
    raise exception 'OFFLINE_ROUTE_CHANGED';
  end if;
  if coalesce(route.visited,false) or route.linked_visit_id is not null
    or exists(select 1 from public.visits
      where route_plan_id=input.route_plan_id and not coalesce(is_duplicate,false)) then
    raise exception 'OFFLINE_ROUTE_CLOSED';
  end if;

  -- Lock all submitted tasks in stable order and reject a stale decision.
  for decision in select value from jsonb_array_elements(p_task_decisions) order by value->>'task_id'
  loop
    if jsonb_typeof(decision->'done') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
    end if;
    select * into task from public.tasks
    where id = (decision->>'task_id')::uuid
    for update;
    if not found or task.client_id is distinct from input.client_id or coalesce(task.done,false)
      or coalesce(nullif(trim(task.manager_name),''), manager) is distinct from manager
      or task.due_date is distinct from (decision->>'expected_due_date')::date
      or task.review_status is distinct from (decision->>'expected_review_status')
      or task.review_status in ('pending','stale_review','rejected','cancelled','superseded') then
      raise exception 'OFFLINE_TASK_CHANGED';
    end if;
  end loop;
  if (select count(distinct value->>'task_id') from jsonb_array_elements(p_task_decisions)) <> jsonb_array_length(p_task_decisions) then
    raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
  end if;

  saved := public.crm_v2264_save_visit(jsonb_build_object(
    'client_id',input.client_id, 'route_plan_id',route.id, 'date',input.date,
    'manager_id',actor, 'manager_name',manager, 'text',trim(input.text), 'result',input.result,
    'gps_lat',input.gps_lat, 'gps_lng',input.gps_lng, 'gps_accuracy',input.gps_accuracy
  ),route.id::text,p_task_decisions);
  saved_visit_id := (saved->'visit'->>'id')::uuid;
  if saved_visit_id is null or coalesce((saved->>'duplicate')::boolean,false) then
    raise exception 'OFFLINE_ROUTE_CLOSED';
  end if;
  insert into crm_offline_private.visit_receipts(owner_id,request_id,payload_hash,visit_id)
  values(actor,p_request_id,payload_hash,saved_visit_id);
  return jsonb_build_object('visit_id',saved_visit_id,'replayed',false);
end;
$function$;
