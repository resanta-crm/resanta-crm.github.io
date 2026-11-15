-- Exercise the real creation and shelf RPCs under actual profile scopes. No fixtures survive.
begin;
create temp table route_v4_fixture(client_id uuid,route_id uuid,task_id uuid);
insert into route_v4_fixture values(gen_random_uuid(),gen_random_uuid(),null);
insert into public.clients(id,name,region,manager_name,client_status)
 select client_id,'ПРОВЕРКА МАРШРУТА V4 — ОТКАТ','Витебск','Руднев','Рабочий'from route_v4_fixture;
insert into public.route_plans(id,client_id,client_name,manager_name,visit_date,region,approved,review_status)
 select route_id,client_id,'ПРОВЕРКА МАРШРУТА V4 — ОТКАТ','Руднев',date_trunc('week',(now()at time zone'Europe/Minsk')::date)::date+7,'Витебск',true,'approved'from route_v4_fixture;
grant select,update on route_v4_fixture to authenticated;
select set_config('request.jwt.claims',(select json_build_object('sub',id,'email',email,'role','authenticated')::text from public.users where id='544fb1e2-ef70-44de-bc62-e0e1596a4bfc'),true);
set local role authenticated;
update route_v4_fixture set task_id=(public.crm_task_create_v4(route_id,'[{"sku":"75/6/1","qty":2}]')->'task'->>'id')::uuid;
do $$begin
 if not exists(select 1 from public.crm_task_contracts_v4 c join route_v4_fixture t on t.task_id=c.task_id where c.route_id=t.route_id and c.targets->0->>'sku'='75/6/1' and c.targets->0->>'product'=(select min(product)from public.price_list where sku='75/6/1'))then raise exception 'CANONICAL_SKU_CONTRACT_NOT_CREATED';end if;
 if not exists(select 1 from public.crm_shelf_plans_v4 s join route_v4_fixture t on s.task_id=t.task_id where s.route_id=t.route_id and s.scan_id is null)then raise exception 'SHELF_ASSIGNMENT_MISSING';end if;
 begin
  perform public.crm_task_create_v4(route_id,'[{"sku":"75/6/1","qty":2}]')from route_v4_fixture;
  raise exception 'DUPLICATE_WEEK_WAS_ALLOWED';
 exception when unique_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',(select json_build_object('sub',id,'email',email,'role','authenticated')::text from public.users where name='Руднев'and role='manager'limit 1),true);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.tasks t join route_v4_fixture f on f.task_id=t.id where t.manager_name='Руднев'and t.review_status='approved')then raise exception 'MANAGER_DELIVERY_MISSING';end if;
 begin
  perform public.crm_task_create_v4(route_id,'[{"sku":"75/6/1","qty":2}]')from route_v4_fixture;
  raise exception 'MANAGER_CREATED_BOSS_PLAN';
 exception when insufficient_privilege then null;end;
end $$;
select public.crm_shelf_save_v4(client_id,route_id,'[{"sku":"75/6/1","shelf_qty":2,"reserve_qty":null}]','75/6/1 две штуки','Ценник проверить','[]')from route_v4_fixture;
do $$begin
 if not exists(select 1 from public.crm_shelf_plans_v4 s join route_v4_fixture f on f.route_id=s.route_id where s.scan_id is not null)then raise exception 'SHELF_COMPLETION_MISSING';end if;
end $$;
reset role;
select set_config('request.jwt.claims',(select json_build_object('sub',id,'email',email,'role','authenticated')::text from public.users where name='Шкуран'and role='manager'limit 1),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.tasks t join route_v4_fixture f on f.task_id=t.id)or exists(select 1 from public.crm_shelf_plans_v4 s join route_v4_fixture f on f.route_id=s.route_id)then raise exception 'FOREIGN_MANAGER_SEES_CREATED_PLAN';end if;
end $$;
reset role;
select 'PASS: atomic route creation, canonical common price SKU, shelf assignment, duplicate prevention, assigned-manager delivery, shelf save/completion, foreign-manager isolation' result;
rollback;
