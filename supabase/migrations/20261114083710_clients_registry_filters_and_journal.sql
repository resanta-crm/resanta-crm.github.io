-- Registry filter, current report debt, scoped request history and reversible links.
drop function public.crm_clients_registry_v1(text,text,text,integer);
create function public.crm_clients_registry_v1(p_month text,p_query text default '',p_manager text default '',p_offset integer default 0,p_branch text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;chosen date;out_rows jsonb;totals jsonb;v_total integer;
begin
 a:=crm_private.client_actor_v1();
 if p_month is null or p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or length(coalesce(p_query,''))>120 or p_offset<0 or p_offset>100000 then raise exception 'invalid_filter';end if;
 chosen:=(p_month||'-01')::date;
 with sc as materialized(select * from crm_private.client_scope_v1()),
 all_members as materialized(select c.*,ec.entity_id,e.name entity_name from public.clients c join sc on sc.client_scope_v1=c.id
 left join public.client360_entity_clients_v1 ec on ec.client_id=c.id left join public.client360_entities_v1 e on e.id=ec.entity_id where coalesce(p_branch,'')='' or exists(select 1 from public.crm_client_branch_links_v1 bl join public.crm_client_branches_v1 b on b.id=bl.branch_id where bl.client_id=c.id and b.name=p_branch)),
 groups as materialized(select coalesce(entity_id,id) key,min(id::text)::uuid client_id,max(entity_id::text)::uuid entity_id,
 coalesce(max(entity_name),max(name)) name,count(*) cards,array_agg(id) ids,
 array_agg(distinct manager_name) managers,jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'city',city,'address',address,'manager_name',manager_name)) members
 from all_members group by coalesce(entity_id,id)),
 filtered as materialized(select * from groups g where
 (coalesce(p_manager,'')='' or p_manager=any(g.managers)) and
 (coalesce(p_query,'')='' or g.name ilike '%'||p_query||'%' or exists(select 1 from all_members m where m.id=any(g.ids) and
 concat_ws(' ',m.name,m.code,m.city,m.address) ilike '%'||p_query||'%'))),
 names as(select public.crm_client_key(c.name) k,c.id from public.clients c where not coalesce(c.is_archived,false) union all select public.crm_client_key(x.alias_name),x.client_id from public.client_aliases x), nm as(select k,min(id::text)::uuid id from names group by k having count(distinct id)=1), debts as materialized(select nm.id,sum(d.debt_overdue) amount from public.client_debt d join nm on nm.k=public.crm_client_key(d.client_name) where d.report_date=(select max(report_date) from public.client_debt) group by nm.id),
 sales as materialized(select client_id,sum(revenue) amount from crm_private.client_sales_v1(chosen,(chosen+interval '1 month')::date) group by client_id),
 rows as (select g.*, (select count(distinct p.id) from public.route_physical_point_clients l join public.route_physical_points p on p.id=l.point_id and coalesce(p.active,true) where l.client_id=any(g.ids)) points,
 case when exists(select 1 from public.purchase_history where month=chosen) then coalesce((select sum(s.amount) from sales s where s.client_id=any(g.ids)),0) end revenue,
 (select max(v.date) from public.visits v where v.client_id=any(g.ids) and not coalesce(v.is_duplicate,false)) last_visit,
 (select count(*) from public.tasks t where t.client_id=any(g.ids) and not coalesce(t.done,false) and coalesce(t.review_status,'') not in ('rejected','draft','pending','pending_boss')) open_tasks
 from filtered g)
 select (select count(*) from rows),coalesce((select jsonb_agg(to_jsonb(r)-'ids' order by r.name) from(select * from rows order by name,key limit 50 offset p_offset) r),'[]'),
 jsonb_build_object('clients',(select count(*) from rows),'cards',(select coalesce(sum(cards),0) from filtered),
 'points',(select count(distinct p.id) from public.route_physical_points p join public.route_physical_point_clients l on l.point_id=p.id where coalesce(p.active,true) and exists(select 1 from filtered g where l.client_id=any(g.ids))),
 'debt_report_date',(select max(report_date) from public.client_debt),'debt',case when exists(select 1 from public.client_debt) then coalesce((select sum(amount) from debts d where exists(select 1 from filtered f where d.id=any(f.ids))),0) end,'revenue',(select sum(revenue) from rows),'without_points',(select count(*) from rows where points=0)) into v_total,out_rows,totals;
 return jsonb_build_object('version','clients.unified.1','rows',out_rows,'total',v_total,'offset',p_offset,'limit',50,'month',p_month,'metrics',totals,
 'managers',(select coalesce(jsonb_agg(distinct c.manager_name),'[]') from public.clients c where c.id in(select * from crm_private.client_scope_v1())),
 'branches',(select coalesce(jsonb_agg(b.name),'[]') from public.crm_client_branches_v1 b where a.role='boss' and (a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid) or exists(select 1 from public.crm_client_branch_users_v1 bu where bu.branch_id=b.id and bu.user_id=a.id))),
 'scope',case when a.role='boss' then 'Разрешённые клиенты и филиалы' else 'Мои клиенты и торговые точки' end,
 'can_link',a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid) and a.role='boss',
 'source','Продажи 1С с учётом возвратов; без распределения по ТТ');
end $$;
revoke all on function public.crm_clients_registry_v1(text,text,text,integer,text) from public,anon;
grant execute on function public.crm_clients_registry_v1(text,text,text,integer,text) to authenticated;

-- Existing visits.route_plan_id is text; no historical IDs are changed.
create or replace function public.crm_clients_detail_v1(p_client_id uuid,p_month text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;eid uuid;ids uuid[];chosen date;members jsonb;points jsonb;sales jsonb;events jsonb;debts jsonb;tasks_out jsonb;visits_out jsonb;
begin
 a:=crm_private.client_actor_v1();
 if p_month is null or p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'invalid_month';end if;
 chosen:=(p_month||'-01')::date;
 if not exists(select 1 from crm_private.client_scope_v1() s where s=p_client_id) then raise exception 'client_not_authorized' using errcode='42501';end if;
 select entity_id into eid from public.client360_entity_clients_v1 where client_id=p_client_id;
 select array_agg(c.id) into ids from public.clients c where c.id in(select * from crm_private.client_scope_v1()) and
 (c.id=p_client_id or exists(select 1 from public.client360_entity_clients_v1 l where l.entity_id=eid and l.client_id=c.id));
 select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'code',c.code,'manager_name',c.manager_name,'city',c.city,'address',c.address,
 'contact',c.contact,'phone',c.phone,'email',c.email,'status',c.client_status,'category',c.role_type) order by c.name) into members from public.clients c where c.id=any(ids);
 select coalesce(jsonb_agg(to_jsonb(p) order by p.city,p.address),'[]') into points from(
 select pp.id,pp.city,pp.address,pp.lat,pp.lng,pp.geocode_status,
 (select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'manager_name',c.manager_name)) from public.route_physical_point_clients l join public.clients c on c.id=l.client_id where l.point_id=pp.id and c.id=any(ids)) clients,
 (select count(*) from public.visits v join public.route_plans rp on rp.id::text=v.route_plan_id where rp.physical_point_id=pp.id and v.client_id=any(ids) and not coalesce(v.is_duplicate,false) and v.date>=chosen and v.date<(chosen+interval '1 month')::date) visits,
 (select max(v.date) from public.visits v join public.route_plans rp on rp.id::text=v.route_plan_id where rp.physical_point_id=pp.id and v.client_id=any(ids) and not coalesce(v.is_duplicate,false)) last_visit,
 (select min(r.visit_date) from public.route_plans r where r.physical_point_id=pp.id and r.client_id=any(ids) and r.visit_date>=timezone('Europe/Minsk',now())::date and not coalesce(r.removed,false)) next_visit
 from public.route_physical_points pp where coalesce(pp.active,true) and exists(select 1 from public.route_physical_point_clients l where l.point_id=pp.id and l.client_id=any(ids))) p;
 with hist as materialized(select * from crm_private.client_sales_v1((chosen-interval '11 months')::date,(chosen+interval '1 month')::date) where client_id=any(ids)),
 ms as(select (chosen-(i||' months')::interval)::date m from generate_series(11,0,-1) g(i))
 select jsonb_agg(jsonb_build_object('month',to_char(m,'YYYY-MM'),'revenue',case when exists(select 1 from public.purchase_history ph where ph.month=m) then coalesce((select sum(revenue) from hist where month=m),0) end,
 'sku',(select count(distinct nullif(sku,'')) from hist where month=m)) order by m) into sales from ms;
 with names as(select public.crm_client_key(c.name) k,c.id from public.clients c where not coalesce(c.is_archived,false)
 union all select public.crm_client_key(x.alias_name),x.client_id from public.client_aliases x),
 nm as(select k,min(id::text)::uuid id from names group by k having count(distinct id)=1)
 select jsonb_build_object('report_date',(select max(report_date) from public.client_debt),'amount',case when exists(select 1 from public.client_debt) then coalesce(sum(d.debt_overdue),0) end) into debts
 from public.client_debt d join nm on nm.k=public.crm_client_key(d.client_name) where nm.id=any(ids) and d.report_date=(select max(report_date) from public.client_debt);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.due_date nulls last),'[]') into tasks_out from(
 select id,client_id,manager_name,coalesce(title,text) title,due_date,done,review_status from public.tasks where client_id=any(ids) order by coalesce(done,false),due_date nulls last limit 100) t;
 select coalesce(jsonb_agg(to_jsonb(v) order by v.date desc),'[]') into visits_out from(
 select id,client_id,date,manager_name,result,goal,route_plan_id from public.visits where client_id=any(ids) and not coalesce(is_duplicate,false) order by date desc limit 30) v;
 if a.role='boss' then
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') into events from(
 select au.id,au.table_name,au.operation,au.created_at,u.name actor_name,au.old_row,au.new_row,(select c.name from public.clients c where c.id::text=coalesce(au.new_row->>'client_id',au.old_row->>'client_id')) client_label
 from public.crm_client360_audit_v1 au left join public.users u on u.id=au.actor_id where
 (coalesce(au.new_row->>'client_id',au.old_row->>'client_id')=any(select i::text from unnest(ids) i) or
 (au.table_name='route_physical_points' and coalesce(au.new_row->>'id',au.old_row->>'id') in(select l.point_id::text from public.route_physical_point_clients l where l.client_id=any(ids))) or
 (au.table_name='client360_entity_clients_v1' and coalesce(au.new_row->>'entity_id',au.old_row->>'entity_id')=eid::text and coalesce(au.new_row->>'client_id',au.old_row->>'client_id') in(select s::text from crm_private.client_scope_v1() s)) or
 (au.table_name='client360_entities_v1' and coalesce(au.new_row->>'id',au.old_row->>'id')=eid::text)) order by au.created_at desc limit 50) e;
 end if;
 return jsonb_build_object('version','clients.detail.1','month',p_month,'entity',(select jsonb_build_object('id',id,'name',name,'tax_id',tax_id,'one_c_code',one_c_code,'verified_at',identity_verified_at) from public.client360_entities_v1 where id=eid),
 'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') from(select client_id,city,address,status,created_at,comment from public.client360_point_requests_v1 where client_id=any(ids) and (a.role='boss' or manager_id=a.id) order by created_at desc limit 100) r),'members',members,'points',points,'sales',sales,'debt',debts,'tasks',tasks_out,'visits',visits_out,'audit',coalesce(events,'[]'),
 'partial_scope',exists(select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=eid and not(ec.client_id=any(ids))),
 'unassigned_visits',(select count(*) from public.visits where client_id=any(ids) and route_plan_id is null and not coalesce(is_duplicate,false)),
 'task_total',(select count(*) from public.tasks where client_id=any(ids)),
 'can_edit',a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid) and a.role='boss');
end $$;
CREATE OR REPLACE FUNCTION public.client360_update_store_v2(p_point_id uuid, p_city text, p_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text;v_email text;v_old public.route_physical_points%rowtype;
begin
 perform crm_private.client_editor_v1();
 SELECT u.role,lower(a.email) INTO v_role,v_email
 FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email) AND a.email_confirmed_at IS NOT NULL;
 IF v_role<>'boss' OR v_email NOT IN ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru')
 THEN RAISE EXCEPTION 'Только ДФС и ДФ могут изменять адреса торговых точек' USING errcode='42501';END IF;
 IF length(btrim(coalesce(p_city,''))) NOT BETWEEN 2 AND 100 OR
    length(btrim(coalesce(p_address,''))) NOT BETWEEN 5 AND 220
 THEN RAISE EXCEPTION 'Укажите город и полный адрес торговой точки';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.route_physical_point_clients l WHERE l.point_id=p_point_id AND l.client_id IN(SELECT * FROM crm_private.client_scope_v1())) THEN RAISE EXCEPTION 'foreign_branch' USING errcode='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.route_physical_point_clients l WHERE l.point_id=p_point_id AND l.client_id NOT IN(SELECT * FROM crm_private.client_scope_v1())) THEN RAISE EXCEPTION 'shared_foreign_branch' USING errcode='42501';END IF;
 SELECT * INTO v_old FROM public.route_physical_points WHERE id=p_point_id FOR UPDATE;
 IF NOT FOUND OR coalesce(v_old.active,true)=false THEN RAISE EXCEPTION 'Торговая точка не найдена';END IF;
 IF btrim(v_old.city) IS DISTINCT FROM btrim(p_city) OR btrim(v_old.address) IS DISTINCT FROM btrim(p_address) THEN
  UPDATE public.route_physical_points
  SET city=btrim(p_city), address=btrim(p_address),geocode_status='pending',updated_at=now()
  WHERE id=p_point_id;
 END IF;
 -- Coordinates and historical routes/GPS are preserved; pending means address needs reconfirmation.
 RETURN jsonb_build_object('ok',true,'point_id',p_point_id,'needs_geocode',true);
END $function$;
create or replace function public.client360_review_requests_v1() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;v_out jsonb;begin a:=crm_private.client_actor_v1();if a.role<>'boss' then raise exception 'not_authorized' using errcode='42501';end if;
select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_out from(select r.id,r.client_id,c.name client_name,r.city,r.address,r.created_at,u.name manager_name from public.client360_point_requests_v1 r join public.clients c on c.id=r.client_id join public.users u on u.id=r.manager_id where r.status='pending' and c.id in(select * from crm_private.client_scope_v1()) order by r.created_at desc limit 150) x;return jsonb_build_object('ok',true,'requests',v_out);end $$;
