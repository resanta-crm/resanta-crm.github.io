-- Only actual 1C report dates; no interpolation or duplicate allocations.
create or replace function public.crm_clients_detail_v1(p_client_id uuid,p_month text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;eid uuid;ids uuid[];chosen date;members jsonb;points jsonb;sales jsonb;events jsonb;debts jsonb;tasks_out jsonb;visits_out jsonb;debt_history jsonb;
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
 with names as(select public.crm_client_key(c.name) k,c.id from public.clients c where not coalesce(c.is_archived,false) union all select public.crm_client_key(x.alias_name),x.client_id from public.client_aliases x), nm as(select k,min(id::text)::uuid id from names group by k having count(distinct id)=1)
 select coalesce(jsonb_agg(to_jsonb(t) order by t.report_date),'[]') into debt_history from(select d.report_date,sum(d.debt_overdue) amount from public.client_debt d join nm on nm.k=public.crm_client_key(d.client_name) where nm.id=any(ids) and d.report_date>=(select max(report_date)-90 from public.client_debt) group by d.report_date) t;
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
 'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') from(select client_id,city,address,status,created_at,comment from public.client360_point_requests_v1 where client_id=any(ids) and (a.role='boss' or manager_id=a.id) order by created_at desc limit 100) r),'members',members,'points',points,'sales',sales,'debt',debts,'debt_series',debt_history,'tasks',tasks_out,'visits',visits_out,'audit',coalesce(events,'[]'),
 'partial_scope',exists(select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=eid and not(ec.client_id=any(ids))),
 'unassigned_visits',(select count(*) from public.visits where client_id=any(ids) and route_plan_id is null and not coalesce(is_duplicate,false)),
 'task_total',(select count(*) from public.tasks where client_id=any(ids)),
 'can_edit',a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid) and a.role='boss');
end $$;
