-- Additive release. Original client IDs, sales, visits, route plans and GPS remain unchanged.
create schema if not exists crm_private;
revoke all on schema crm_private from public,anon,authenticated;

create table public.crm_client_branches_v1(id uuid primary key default gen_random_uuid(),name text not null unique);
create table public.crm_client_branch_users_v1(user_id uuid primary key references public.users(id),branch_id uuid not null references public.crm_client_branches_v1(id));
create table public.crm_client_branch_links_v1(client_id uuid primary key references public.clients(id),branch_id uuid not null references public.crm_client_branches_v1(id));
create index crm_client_branch_users_branch_idx on public.crm_client_branch_users_v1(branch_id);
create index crm_client_branch_links_branch_idx on public.crm_client_branch_links_v1(branch_id);
insert into public.crm_client_branches_v1(name) values('Витебск');
insert into public.crm_client_branch_users_v1(user_id,branch_id)
select u.id,b.id from public.users u cross join public.crm_client_branches_v1 b
where b.name='Витебск' and u.region='Витебск' and
 (u.role='boss' or (u.role='manager' and u.name in ('Руднев','Ачинович','Шкуран')));
insert into public.crm_client_branch_links_v1(client_id,branch_id)
select c.id,min(bu.branch_id::text)::uuid from public.clients c join public.users u on u.name=c.manager_name
join public.crm_client_branch_users_v1 bu on bu.user_id=u.id group by c.id having count(distinct bu.branch_id)=1;
alter table public.crm_client_branches_v1 enable row level security;
alter table public.crm_client_branch_users_v1 enable row level security;
alter table public.crm_client_branch_links_v1 enable row level security;
revoke all on public.crm_client_branches_v1,public.crm_client_branch_users_v1,public.crm_client_branch_links_v1 from public,anon,authenticated;

create function crm_private.client_actor_v1() returns public.users language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;
begin
 select u.* into a from public.users u join auth.users au on au.id=u.id
 where u.id=auth.uid() and au.email_confirmed_at is not null and lower(au.email)=lower(u.email);
 if a.id is null or a.role not in ('boss','manager') or coalesce(a.access_scope,'standard') in ('service_manager','payment_executor') then
  raise exception 'not_authorized' using errcode='42501'; end if;
 return a;
end $$;
create function crm_private.client_editor_v1() returns void language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;
begin
 a:=crm_private.client_actor_v1();
 if a.role is distinct from 'boss' or not (
  (a.id='544fb1e2-ef70-44de-bc62-e0e1596a4bfc' and lower(a.email)='payushin_ar@resanta.ru') or
  (a.id='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a' and lower(a.email)='sidarovich_kn@resanta.ru')) then
  raise exception 'editor_not_authorized' using errcode='42501'; end if;
end $$;
create function crm_private.client_scope_v1() returns setof uuid language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;
begin
 a:=crm_private.client_actor_v1();
 return query select c.id from public.clients c
 where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false) and
 ((a.role='manager' and c.manager_name=a.name) or
 (a.role='boss' and (a.id in ('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid) or
 exists(select 1 from public.crm_client_branch_links_v1 bc join public.crm_client_branch_users_v1 bu on bu.branch_id=bc.branch_id where bc.client_id=c.id and bu.user_id=a.id) or
 exists(select 1 from public.users m join public.crm_client_branch_users_v1 mu on mu.user_id=m.id
 join public.crm_client_branch_users_v1 bu on bu.branch_id=mu.branch_id where bu.user_id=a.id and m.name=c.manager_name))));
end $$;
revoke all on function crm_private.client_actor_v1(),crm_private.client_editor_v1(),crm_private.client_scope_v1() from public,anon,authenticated;

alter table public.client360_entities_v1 add column tax_id text, add column one_c_code text,
 add column identity_verified_at timestamptz, add column identity_verified_by uuid references auth.users(id);
create unique index client360_verified_tax_id_idx on public.client360_entities_v1(upper(tax_id)) where tax_id is not null;
create index client360_verified_by_idx on public.client360_entities_v1(identity_verified_by);
create table public.crm_client360_audit_v1(
 id bigint generated always as identity primary key,table_name text not null,operation text not null,
 actor_id uuid,created_at timestamptz not null default now(),old_row jsonb,new_row jsonb);
create index crm_client360_audit_created_idx on public.crm_client360_audit_v1(created_at desc);
alter table public.crm_client360_audit_v1 enable row level security;
revoke all on public.crm_client360_audit_v1 from public,anon,authenticated;
create function crm_private.client_audit_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='route_physical_points' and tg_op='UPDATE' and
  old.city is not distinct from new.city and old.address is not distinct from new.address then return new;end if;
 insert into public.crm_client360_audit_v1(table_name,operation,actor_id,old_row,new_row)
 values(tg_table_name,tg_op,auth.uid(),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function crm_private.client_audit_v1() from public,anon,authenticated;
create trigger client360_entities_journal after insert or update or delete on public.client360_entities_v1 for each row execute function crm_private.client_audit_v1();
create trigger client360_links_journal after insert or update or delete on public.client360_entity_clients_v1 for each row execute function crm_private.client_audit_v1();
create trigger client360_points_journal after insert or update on public.route_physical_points for each row execute function crm_private.client_audit_v1();
create trigger client360_requests_journal after insert or update on public.client360_point_requests_v1 for each row execute function crm_private.client_audit_v1();

-- Exact, non-duplicating financial resolution. A non-null imported client_id wins;
-- a name is used only when it resolves to exactly one original card.
create function crm_private.client_sales_v1(p_from date,p_to date) returns table(client_id uuid,month date,revenue numeric,sku text)
language sql stable security definer set search_path='' as $$
 with sc as materialized(select * from crm_private.client_scope_v1()),
 names as (select public.crm_client_key(c.name) k,c.id from public.clients c where not coalesce(c.is_archived,false)
  union all select public.crm_client_key(a.alias_name),a.client_id from public.client_aliases a),
 nm as materialized(select k,min(id::text)::uuid id from names where k<>'' group by k having count(distinct id)=1)
 select coalesce(ph.client_id,nm.id),ph.month,coalesce(ph.revenue,0),ph.sku
 from public.purchase_history ph left join nm on ph.client_id is null and nm.k=public.crm_client_key(ph.client_name)
 where ph.month>=p_from and ph.month<p_to and coalesce(ph.client_id,nm.id) in(select * from sc)
 and public.crm_client_key(ph.client_name)<>public.crm_client_key('Итого');
$$;
revoke all on function crm_private.client_sales_v1(date,date) from public,anon,authenticated;

create function public.crm_clients_registry_v1(p_month text,p_query text default '',p_manager text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;chosen date;out_rows jsonb;totals jsonb;v_total integer;
begin
 a:=crm_private.client_actor_v1();
 if p_month is null or p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or length(coalesce(p_query,''))>120 or p_offset<0 or p_offset>100000 then raise exception 'invalid_filter';end if;
 chosen:=(p_month||'-01')::date;
 with sc as materialized(select * from crm_private.client_scope_v1()),
 all_members as materialized(select c.*,ec.entity_id,e.name entity_name from public.clients c join sc on sc.client_scope_v1=c.id
 left join public.client360_entity_clients_v1 ec on ec.client_id=c.id left join public.client360_entities_v1 e on e.id=ec.entity_id),
 groups as materialized(select coalesce(entity_id,id) key,min(id::text)::uuid client_id,max(entity_id::text)::uuid entity_id,
 coalesce(max(entity_name),max(name)) name,count(*) cards,array_agg(id) ids,
 array_agg(distinct manager_name) managers,jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'city',city,'address',address,'manager_name',manager_name)) members
 from all_members group by coalesce(entity_id,id)),
 filtered as materialized(select * from groups g where
 (coalesce(p_manager,'')='' or p_manager=any(g.managers)) and
 (coalesce(p_query,'')='' or g.name ilike '%'||p_query||'%' or exists(select 1 from all_members m where m.id=any(g.ids) and
 concat_ws(' ',m.name,m.code,m.city,m.address) ilike '%'||p_query||'%'))),
 sales as materialized(select client_id,sum(revenue) amount from crm_private.client_sales_v1(chosen,(chosen+interval '1 month')::date) group by client_id),
 rows as (select g.*, (select count(distinct p.id) from public.route_physical_point_clients l join public.route_physical_points p on p.id=l.point_id and coalesce(p.active,true) where l.client_id=any(g.ids)) points,
 case when exists(select 1 from public.purchase_history where month=chosen) then coalesce((select sum(s.amount) from sales s where s.client_id=any(g.ids)),0) end revenue,
 (select max(v.date) from public.visits v where v.client_id=any(g.ids) and not coalesce(v.is_duplicate,false)) last_visit,
 (select count(*) from public.tasks t where t.client_id=any(g.ids) and not coalesce(t.done,false) and coalesce(t.review_status,'') not in ('rejected','draft','pending','pending_boss')) open_tasks
 from filtered g)
 select (select count(*) from rows),coalesce((select jsonb_agg(to_jsonb(r)-'ids' order by r.name) from(select * from rows order by name,key limit 50 offset p_offset) r),'[]'),
 jsonb_build_object('clients',(select count(*) from rows),'cards',(select count(*) from all_members),
 'points',(select count(distinct p.id) from public.route_physical_points p join public.route_physical_point_clients l on l.point_id=p.id where coalesce(p.active,true) and exists(select 1 from filtered g where l.client_id=any(g.ids))),
 'revenue',(select sum(revenue) from rows),'without_points',(select count(*) from rows where points=0)) into v_total,out_rows,totals;
 return jsonb_build_object('version','clients.unified.1','rows',out_rows,'total',v_total,'offset',p_offset,'limit',50,'month',p_month,'metrics',totals,
 'managers',(select coalesce(jsonb_agg(distinct c.manager_name),'[]') from public.clients c where c.id in(select * from crm_private.client_scope_v1())),
 'branches',(select coalesce(jsonb_agg(b.name),'[]') from public.crm_client_branches_v1 b where a.role='boss' and (a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid) or exists(select 1 from public.crm_client_branch_users_v1 bu where bu.branch_id=b.id and bu.user_id=a.id))),
 'scope',case when a.role='boss' then 'Разрешённые клиенты и филиалы' else 'Мои клиенты и торговые точки' end,
 'can_link',a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid) and a.role='boss',
 'source','Продажи 1С с учётом возвратов; без распределения по ТТ');
end $$;
revoke all on function public.crm_clients_registry_v1(text,text,text,integer) from public,anon;
grant execute on function public.crm_clients_registry_v1(text,text,text,integer) to authenticated;

create function public.crm_control_sales_year_v1(p_year integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;today date:=timezone('Europe/Minsk',now())::date;out_rows jsonb;tri boolean;
begin
 a:=crm_private.client_actor_v1();
 if p_year is null or p_year<2024 or p_year>extract(year from today)::int then raise exception 'invalid_year';end if;
 if not ((a.role='boss' and a.id in ('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid,'a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid))
 or (a.role='manager' and a.region='Витебск' and a.name in('Ачинович','Руднев','Шкуран'))) then raise exception 'not_authorized' using errcode='42501';end if;
 tri:=a.role='boss' and a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid);
 with managers as materialized(select distinct u.name,public.crm_v2263_norm(u.name) mk from public.users u where u.role='manager'
 and u.name in('Ачинович','Руднев','Шкуран') and(a.role='boss' or u.id=a.id)),
 ph as materialized(select * from public.purchase_history where month>=make_date(p_year-1,1,1) and month<make_date(p_year+1,1,1)),
 keys as (select public.crm_client_key(c.name) k,c.id,c.manager_name from public.clients c where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
 union all select public.crm_client_key(x.alias_name),c.id,c.manager_name from public.client_aliases x join public.clients c on c.id=x.client_id where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)),
 nm as materialized(select k,min(id::text)::uuid id,min(manager_name) manager_name from keys where k<>'' group by k having count(distinct id)=1),
 fallback as materialized(select s.client_name,f.manager_name from(select distinct client_name from ph) s left join lateral(
 select x.manager_name from(select c.manager_name,0 priority from public.clients c where public.crm_v2263_norm(c.name)=public.crm_v2263_norm(s.client_name)
 union all select c.manager_name,1 from public.client_aliases x join public.clients c on c.id=x.client_id where public.crm_v2263_norm(x.alias_name)=public.crm_v2263_norm(s.client_name)) x order by priority limit 1) f on true),
 field as materialized(select ph.month,public.crm_v2263_norm(case when extract(year from ph.month)=p_year
 then coalesce(nullif(trim(ph.manager_name),''),f.manager_name) else coalesce(c.manager_name,nm.manager_name) end) mk,
 sum(ph.revenue) amount from ph left join fallback f on f.client_name=ph.client_name
 left join public.clients c on c.id=ph.client_id and not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
 left join nm on c.id is null and nm.k=public.crm_client_key(ph.client_name)
 where (coalesce(ph.revenue,0)>0 or coalesce(ph.qty,0)>0)
 and public.crm_client_key(ph.client_name)<>public.crm_client_key('Итого') group by 1,2),
 shops as materialized(select month,sum(revenue) amount from public.triovist_sales_resolved_cache
 where tri and month>=make_date(p_year-1,1,1) and month<make_date(p_year+1,1,1) group by month),
 months as(select make_date(p_year,i,1) cur,make_date(p_year-1,i,1) prev,i from generate_series(1,12) g(i))
 select jsonb_agg(jsonb_build_object('month',to_char(m.cur,'YYYY-MM'),'previous_month',to_char(m.prev,'YYYY-MM'),
 'partial',m.cur=date_trunc('month',today)::date,'future',m.cur>today,
 'field_available',exists(select 1 from ph where month=m.cur) and m.cur<=today,
 'field_previous_available',exists(select 1 from ph where month=m.prev),
 'tri_available',tri and exists(select 1 from shops where month=m.cur) and m.cur<=today,
 'tri_previous_available',tri and exists(select 1 from shops where month=m.prev),
 'managers',(select jsonb_agg(jsonb_build_object('name',u.name,'current',case when m.cur<=today and exists(select 1 from ph where month=m.cur) then coalesce((select amount from field where month=m.cur and mk=u.mk),0) end,
 'previous',case when exists(select 1 from ph where month=m.prev) then coalesce((select amount from field where month=m.prev and mk=u.mk),0) end) order by u.name) from managers u),
 'tri_current',case when tri and m.cur<=today then (select amount from shops where month=m.cur) end,
 'tri_previous',case when tri then(select amount from shops where month=m.prev) end) order by m.i) into out_rows from months m;
 return jsonb_build_object('version','control.sales.year.1','year',p_year,'previous_year',p_year-1,'today',today,'include_triovist',tri,'months',out_rows,
 'scope',case when a.role='manager' then a.name else 'Команда Витебска'||case when tri then ' и Триовист' else '' end end,
 'as_of',(select max(last_success_at) from public.crm_import_status where source='sales'),
 'tri_as_of',case when tri then(select max(imported_at) from public.triovist_sales_imports) end,
 'method','Текущий год: действующая методика KPI отгрузок; прошлый: действующая база KPI 2025; Триовист — отдельный источник. Только месячные суммы.');
end $$;
revoke all on function public.crm_control_sales_year_v1(integer) from public,anon;
grant execute on function public.crm_control_sales_year_v1(integer) to authenticated;

create function public.crm_clients_detail_v1(p_client_id uuid,p_month text) returns jsonb
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
 (select count(*) from public.visits v join public.route_plans rp on rp.id=v.route_plan_id where rp.physical_point_id=pp.id and v.client_id=any(ids) and not coalesce(v.is_duplicate,false) and v.date>=chosen and v.date<(chosen+interval '1 month')::date) visits,
 (select max(v.date) from public.visits v join public.route_plans rp on rp.id=v.route_plan_id where rp.physical_point_id=pp.id and v.client_id=any(ids) and not coalesce(v.is_duplicate,false)) last_visit,
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
 select au.id,au.table_name,au.operation,au.created_at,u.name actor_name,au.old_row,au.new_row
 from public.crm_client360_audit_v1 au left join public.users u on u.id=au.actor_id where
 (coalesce(au.new_row->>'client_id',au.old_row->>'client_id')=any(select i::text from unnest(ids) i) or
 (au.table_name='route_physical_points' and coalesce(au.new_row->>'id',au.old_row->>'id') in(select l.point_id::text from public.route_physical_point_clients l where l.client_id=any(ids))) or
 (au.table_name='client360_entities_v1' and coalesce(au.new_row->>'id',au.old_row->>'id')=eid::text)) order by au.created_at desc limit 50) e;
 end if;
 return jsonb_build_object('version','clients.detail.1','month',p_month,'entity',(select jsonb_build_object('id',id,'name',name,'tax_id',tax_id,'one_c_code',one_c_code,'verified_at',identity_verified_at) from public.client360_entities_v1 where id=eid),
 'members',members,'points',points,'sales',sales,'debt',debts,'tasks',tasks_out,'visits',visits_out,'audit',coalesce(events,'[]'),
 'partial_scope',exists(select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=eid and not(ec.client_id=any(ids))),
 'unassigned_visits',(select count(*) from public.visits where client_id=any(ids) and route_plan_id is null and not coalesce(is_duplicate,false)),
 'task_total',(select count(*) from public.tasks where client_id=any(ids)),
 'can_edit',a.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid) and a.role='boss');
end $$;
revoke all on function public.crm_clients_detail_v1(uuid,text) from public,anon;
grant execute on function public.crm_clients_detail_v1(uuid,text) to authenticated;

create function public.crm_client360_identity_v1(p_entity_id uuid,p_tax_id text,p_one_c_code text,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform crm_private.client_editor_v1();
 if p_confirmed is distinct from true then raise exception 'identity_confirmation_required';end if;
 if coalesce(length(trim(p_tax_id)),0)>20 or coalesce(length(trim(p_one_c_code)),0)>80 or
 (nullif(trim(p_tax_id),'') is null and nullif(trim(p_one_c_code),'') is null) then raise exception 'identity_invalid';end if;
 if exists(select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=p_entity_id and ec.client_id not in(select * from crm_private.client_scope_v1())) then raise exception 'foreign_branch' using errcode='42501';end if;
 update public.client360_entities_v1 set tax_id=nullif(upper(trim(p_tax_id)),''),one_c_code=nullif(trim(p_one_c_code),''),identity_verified_at=now(),identity_verified_by=auth.uid(),updated_at=now() where id=p_entity_id;
 if not found then raise exception 'entity_not_found';end if;return jsonb_build_object('ok',true);
end $$;
create function public.crm_client360_add_store_v1(p_client_id uuid,p_city text,p_address text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype;pid uuid;
begin
 perform crm_private.client_editor_v1();
 if p_client_id not in(select * from crm_private.client_scope_v1()) then raise exception 'foreign_client' using errcode='42501';end if;
 if length(trim(coalesce(p_city,''))) not between 2 and 100 or length(trim(coalesce(p_address,''))) not between 5 and 220 then raise exception 'invalid_address';end if;
 if exists(select 1 from public.route_physical_points p join public.route_physical_point_clients l on l.point_id=p.id where l.client_id=p_client_id and coalesce(p.active,true) and lower(trim(p.city))=lower(trim(p_city)) and lower(trim(p.address))=lower(trim(p_address))) then raise exception 'store_already_exists';end if;
 select * into c from public.clients where id=p_client_id;
 insert into public.route_physical_points(point_key,manager_name,region,city,address,geocode_status,active,source) values('client360-'||gen_random_uuid()::text,c.manager_name,c.region,trim(p_city),trim(p_address),'pending',true,'client360_director_approved') returning id into pid;
 insert into public.route_physical_point_clients(point_id,client_id,is_primary) values(pid,p_client_id,false);
 return jsonb_build_object('ok',true,'point_id',pid);
end $$;
create function public.crm_client360_restore_link_v1(p_event_id bigint,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;cid uuid;eid uuid;
begin
 perform crm_private.client_editor_v1();if p_confirmed is distinct from true then raise exception 'confirmation_required';end if;
 select old_row into r from public.crm_client360_audit_v1 where id=p_event_id and table_name='client360_entity_clients_v1' and operation='DELETE';
 if r is null then raise exception 'event_not_found';end if;cid:=(r->>'client_id')::uuid;eid:=(r->>'entity_id')::uuid;
 if cid not in(select * from crm_private.client_scope_v1()) then raise exception 'foreign_client' using errcode='42501';end if;
 if exists(select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=eid and ec.client_id not in(select * from crm_private.client_scope_v1())) then raise exception 'foreign_branch' using errcode='42501';end if;
 insert into public.client360_entity_clients_v1(client_id,entity_id,linked_by) values(cid,eid,auth.uid());
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.crm_client360_identity_v1(uuid,text,text,boolean),public.crm_client360_add_store_v1(uuid,text,text),public.crm_client360_restore_link_v1(bigint,boolean) from public,anon;
grant execute on function public.crm_client360_identity_v1(uuid,text,text,boolean),public.crm_client360_add_store_v1(uuid,text,text),public.crm_client360_restore_link_v1(bigint,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.client360_approve_store_v1(p_request_id uuid, p_approve boolean, p_comment text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text;v_role text;v_request public.client360_point_requests_v1%rowtype;v_point uuid;
begin
 perform crm_private.client_editor_v1();
 select lower(a.email),u.role into v_email,v_role from auth.users a join public.users u on u.id=a.id
 where a.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_role<>'boss' or v_email not in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then raise exception 'Только ДФС/ДФ' using errcode='42501';end if;
 select * into v_request from public.client360_point_requests_v1 where id=p_request_id and status='pending' for update;
 if v_request.id is null then raise exception 'Нет заявки на проверке';end if;
 if v_request.client_id not in(select * from crm_private.client_scope_v1()) then raise exception 'foreign_branch' using errcode='42501';end if;
 if p_approve then
  if exists(
    select 1 from public.route_physical_point_clients pc
    join public.route_physical_points p on p.id=pc.point_id
    where pc.client_id=v_request.client_id
      and lower(regexp_replace(coalesce(p.city,''),'\\s+','','g'))=lower(regexp_replace(v_request.city,'\\s+','','g'))
      and lower(regexp_replace(coalesce(p.address,''),'\\s+','','g'))=lower(regexp_replace(v_request.address,'\\s+','','g'))
  ) then raise exception 'У этого клиента уже есть ТТ по данному адресу. Используйте существующую точку.';end if;
  -- Never silently overwrite a potentially conflicting existing GPS point.
  insert into public.route_physical_points(point_key,manager_name,region,city,address,geocode_status,active,source)
  select 'client360-request-'||v_request.id::text,c.manager_name,c.region,v_request.city,v_request.address,
  'pending',true,'client360_director_approved'
  from public.clients c where c.id=v_request.client_id returning id into v_point;
  insert into public.route_physical_point_clients(point_id,client_id,is_primary)
  values(v_point,v_request.client_id,false) on conflict do nothing;
 end if;
 update public.client360_point_requests_v1 set status=case when p_approve then 'approved' else 'rejected' end,
  reviewed_by=auth.uid(),reviewed_at=now(),created_point_id=v_point,comment=left(coalesce(p_comment,''),500)
 where id=p_request_id;
 return jsonb_build_object('ok',true,'approved',p_approve,'point_id',v_point);
end $function$
;

CREATE OR REPLACE FUNCTION public.client360_catalog_v1(p_query text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_out jsonb;
begin
 select u.role into v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_role is distinct from 'boss' then raise exception 'Только руководителю' using errcode='42501';end if;
 if length(coalesce(p_query,''))>120 then raise exception 'Слишком длинный запрос';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_out from (
 select c.id,c.name,c.city,c.address,c.manager_name,c.code,ec.entity_id,e.name legal_name
 from public.clients c left join public.client360_entity_clients_v1 ec on ec.client_id=c.id
 left join public.client360_entities_v1 e on e.id=ec.entity_id
 where c.id in(select * from crm_private.client_scope_v1()) and coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false
 and (trim(coalesce(p_query,''))='' or c.name ilike '%'||trim(p_query)||'%' or c.address ilike '%'||trim(p_query)||'%')
 order by c.name limit 150
 ) x;
 return jsonb_build_object('ok',true,'clients',v_out,'entities',
 (select coalesce(jsonb_agg(to_jsonb(z) order by z.name),'[]'::jsonb)
  from (select id,name from public.client360_entities_v1 e where exists(select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=e.id and ec.client_id in(select * from crm_private.client_scope_v1())) order by name limit 200) z));
end $function$
;

CREATE OR REPLACE FUNCTION public.client360_entity_overview_v1(p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_out jsonb;v_name text;
begin
 select u.role into v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(u.email)=lower(a.email) and a.email_confirmed_at is not null;
 if v_role is distinct from 'boss' then raise exception 'Нет доступа' using errcode='42501';end if;
 select name into v_name from public.client360_entities_v1 where id=p_entity_id;
 if v_name is null then raise exception 'Юрлицо не найдено';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_out from (
 select c.id,c.name,c.city,c.address,c.manager_name,
 (select count(*)::integer from public.visits v where v.client_id=c.id and coalesce(v.is_duplicate,false)=false) visits,
 (select max(v.date) from public.visits v where v.client_id=c.id and coalesce(v.is_duplicate,false)=false) last_visit,
 (select coalesce(jsonb_agg(to_jsonb(p) order by p.city,p.address),'[]'::jsonb) from (
   select pp.id,pp.city,pp.address,pp.lat,pp.lng,pp.geocode_status
   from public.route_physical_point_clients l join public.route_physical_points pp on pp.id=l.point_id
   where l.client_id=c.id and coalesce(pp.active,true)
   order by pp.city,pp.address
 ) p) stores
 from public.client360_entity_clients_v1 ec join public.clients c on c.id=ec.client_id
 where c.id in(select * from crm_private.client_scope_v1()) and ec.entity_id=p_entity_id and coalesce(c.is_archived,false)=false order by c.name
 ) x;
 return jsonb_build_object('ok',true,'entity_id',p_entity_id,'name',v_name,'clients',v_out);
end $function$
;

CREATE OR REPLACE FUNCTION public.client360_group_clients_v1(p_name text, p_client_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text;v_role text;v_entity uuid;v_count int;
begin
 perform crm_private.client_editor_v1();
 select lower(a.email),u.role into v_email,v_role from auth.users a join public.users u on u.id=a.id and lower(a.email)=lower(u.email)
 where a.id=auth.uid() and a.email_confirmed_at is not null;
 if v_email not in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') or v_role<>'boss' then
  raise exception 'Согласование связей только ДФС/ДФ' using errcode='42501';end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 160 then raise exception 'Название 3–160 символов';end if;
 if coalesce(cardinality(p_client_ids),0) not between 2 and 30 then raise exception 'Выберите 2–30 карточек';end if;
 select count(distinct id) into v_count from unnest(p_client_ids) t(id);
 if v_count<>cardinality(p_client_ids) then raise exception 'Повторение карточки';end if;
 if (select count(*) from public.clients c where c.id=any(p_client_ids) and coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false)<>v_count then raise exception 'Карточка не найдена';end if;
 if exists(select 1 from unnest(p_client_ids) x where x not in(select * from crm_private.client_scope_v1())) then raise exception 'foreign_branch' using errcode='42501';end if;
 select id into v_entity from public.client360_entities_v1 where lower(trim(name))=lower(trim(p_name));
 if exists(select 1 from public.client360_entity_clients_v1 ec where ec.client_id=any(p_client_ids) and ec.entity_id is distinct from v_entity)
 then raise exception 'Карточка уже относится к другому юрлицу';end if;
 if exists(select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=v_entity and ec.client_id not in(select * from crm_private.client_scope_v1())) then raise exception 'foreign_branch' using errcode='42501';end if;
 if v_entity is null then
  insert into public.client360_entities_v1(name,created_by) values(trim(p_name),auth.uid()) returning id into v_entity;
 end if;
 insert into public.client360_entity_clients_v1(client_id,entity_id,linked_by)
 select id,v_entity,auth.uid() from unnest(p_client_ids) t(id)
 on conflict (client_id) do nothing;
 return jsonb_build_object('ok',true,'entity_id',v_entity,'linked_cards',
   (select count(*) from public.client360_entity_clients_v1 where entity_id=v_entity));
end $function$
;

CREATE OR REPLACE FUNCTION public.client360_manage_entity_v2(p_entity_id uuid, p_name text, p_unlink_client_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text;v_email text;v_previous text;v_n int:=0;v_new text;
begin
 perform crm_private.client_editor_v1();
 SELECT u.role,lower(a.email) INTO v_role,v_email
 FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email) AND a.email_confirmed_at IS NOT NULL;
 IF v_role<>'boss' OR v_email NOT IN ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru')
 THEN RAISE EXCEPTION 'Только ДФС и ДФ могут изменять связи юрлиц' USING errcode='42501';END IF;
 IF p_entity_id IS NULL THEN RAISE EXCEPTION 'Выберите юрлицо';END IF;
 SELECT name INTO v_previous FROM public.client360_entities_v1 WHERE id=p_entity_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Юрлицо не найдено';END IF;
 v_new:=btrim(coalesce(p_name,''));
 IF length(v_new) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Название: от 3 до 160 символов';END IF;
 IF EXISTS(SELECT 1 FROM public.client360_entities_v1 e WHERE lower(btrim(e.name))=lower(v_new) AND e.id<>p_entity_id)
 THEN RAISE EXCEPTION 'Юрлицо с таким названием уже существует';END IF;
 IF coalesce(array_length(p_unlink_client_ids,1),0)>150 THEN RAISE EXCEPTION 'Слишком много карточек за одну операцию';END IF;
 IF EXISTS(SELECT 1 FROM public.client360_entity_clients_v1 ec WHERE ec.entity_id=p_entity_id AND ec.client_id NOT IN(SELECT * FROM crm_private.client_scope_v1())) THEN RAISE EXCEPTION 'foreign_branch' USING errcode='42501';END IF;
 UPDATE public.client360_entities_v1 SET name=v_new WHERE id=p_entity_id;
 WITH removed AS (
  DELETE FROM public.client360_entity_clients_v1 ec
  WHERE ec.entity_id=p_entity_id AND ec.client_id=ANY(coalesce(p_unlink_client_ids,'{}'::uuid[]))
  RETURNING 1
 ) SELECT count(*)::int INTO v_n FROM removed;
 RETURN jsonb_build_object('ok',true,'entity_id',p_entity_id,'name',v_new,'old_name',v_previous,'unlinked',v_n);
END $function$
;

CREATE OR REPLACE FUNCTION public.client360_points_for_client_v1(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text;v_role text;v_c public.clients%rowtype;v_eid uuid;v_out jsonb;
begin
 select u.name,u.role into v_name,v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_name is null or v_role not in ('boss','manager') then raise exception 'Нет доступа' using errcode='42501';end if;
 if p_client_id not in(select * from crm_private.client_scope_v1()) then raise exception 'foreign_client' using errcode='42501';end if;
 select * into v_c from public.clients where id=p_client_id and coalesce(is_archived,false)=false;
 if v_c.id is null then raise exception 'Клиент не найден';end if;
 if v_role='manager' and lower(trim(v_c.manager_name))<>lower(trim(v_name)) then raise exception 'Нет доступа к клиенту' using errcode='42501';end if;
 select entity_id into v_eid from public.client360_entity_clients_v1 where client_id=p_client_id;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.city,x.address),'[]'::jsonb) into v_out from (
 select distinct on (p.id) p.id,p.city,p.address,p.lat,p.lng,p.geocode_status,c.id route_client_id,c.name client_name
 from public.route_physical_points p join public.route_physical_point_clients l on l.point_id=p.id
 join public.clients c on c.id=l.client_id
 where c.id in(select * from crm_private.client_scope_v1()) and coalesce(p.active,true) and coalesce(c.is_archived,false)=false
 and (c.id=p_client_id or (v_eid is not null and exists(
   select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=v_eid and ec.client_id=c.id)))
 and (v_role='boss' or lower(trim(c.manager_name))=lower(trim(v_name)))
 order by p.id,(c.id=p_client_id) desc
 ) x;
 return jsonb_build_object('ok',true,'client_id',p_client_id,'entity_id',v_eid,'points',v_out);
end $function$
;

CREATE OR REPLACE FUNCTION public.client360_route_labels_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text;v_name text;v_out jsonb;
BEGIN
 SELECT u.role,u.name INTO v_role,v_name FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email) AND a.email_confirmed_at IS NOT NULL;
 IF v_role NOT IN ('boss','manager') THEN RAISE EXCEPTION 'Нет доступа' USING errcode='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_out
 FROM (
  SELECT ec.client_id,ec.entity_id,e.name entity_name
  FROM public.client360_entity_clients_v1 ec
  JOIN public.client360_entities_v1 e ON e.id=ec.entity_id
  JOIN public.clients c ON c.id=ec.client_id
  WHERE c.id IN(SELECT * FROM crm_private.client_scope_v1()) AND (v_role='boss' OR lower(btrim(c.manager_name))=lower(btrim(v_name)))
  ORDER BY e.name,c.name
  LIMIT 2500
 ) x;
 RETURN jsonb_build_object('ok',true,'labels',v_out);
END $function$
;

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
 SELECT * INTO v_old FROM public.route_physical_points WHERE id=p_point_id FOR UPDATE;
 IF NOT FOUND OR coalesce(v_old.active,true)=false THEN RAISE EXCEPTION 'Торговая точка не найдена';END IF;
 IF btrim(v_old.city) IS DISTINCT FROM btrim(p_city) OR btrim(v_old.address) IS DISTINCT FROM btrim(p_address) THEN
  UPDATE public.route_physical_points
  SET city=btrim(p_city), address=btrim(p_address),geocode_status='pending',updated_at=now()
  WHERE id=p_point_id;
 END IF;
 -- Coordinates and historical routes/GPS are preserved; pending means address needs reconfirmation.
 RETURN jsonb_build_object('ok',true,'point_id',p_point_id,'needs_geocode',true);
END $function$
;


-- Keep serving-branch membership in step with explicit manager reassignment.
create function crm_private.client_branch_sync_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 select min(bu.branch_id::text)::uuid into bid from public.users u join public.crm_client_branch_users_v1 bu on bu.user_id=u.id where u.name=new.manager_name having count(distinct bu.branch_id)=1;
 if bid is null then delete from public.crm_client_branch_links_v1 where client_id=new.id;
 else insert into public.crm_client_branch_links_v1(client_id,branch_id) values(new.id,bid) on conflict(client_id) do update set branch_id=excluded.branch_id;end if;
 return new;
end $$;
revoke all on function crm_private.client_branch_sync_v1() from public,anon,authenticated;
create trigger client360_branch_sync after insert or update of manager_name on public.clients for each row execute function crm_private.client_branch_sync_v1();
