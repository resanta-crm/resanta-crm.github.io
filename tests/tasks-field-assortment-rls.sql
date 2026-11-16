begin;
create temp table workspace_fixture(kind text,client_id uuid,route_id uuid,task_id uuid);
insert into workspace_fixture values('work',gen_random_uuid(),gen_random_uuid(),null),('potential',gen_random_uuid(),gen_random_uuid(),null);
insert into public.clients(id,name,region,manager_name,client_status)
select client_id,'ПРОВЕРКА V5 ОТКАТ '||kind,'Могилёвская область','Руднев',case when kind='work' then 'Рабочий' else 'Потенциальный' end from workspace_fixture;
insert into public.route_plans(id,client_id,client_name,manager_name,visit_date,region,approved,review_status)
select route_id,client_id,'ПРОВЕРКА V5 ОТКАТ '||kind,'Руднев',date_trunc('week',(now()at time zone'Europe/Minsk')::date)::date+7,'Витебск',true,'approved'from workspace_fixture;
grant select,update on workspace_fixture to authenticated;
select set_config('request.jwt.claims',(select json_build_object('sub',id,'email',email,'role','authenticated')::text from public.users where id='544fb1e2-ef70-44de-bc62-e0e1596a4bfc'),true);
set local role authenticated;
do $$declare sku text; f record;begin
 select p.sku into sku from public.price_list p where p.product ilike '%сварочный аппарат инверторный%' limit 1;
 if sku is null then raise exception 'INVERTER_FIXTURE_MISSING';end if;
 select * into f from workspace_fixture where kind='work';
 begin
  perform public.crm_task_create_v5(f.route_id,f.client_id,jsonb_build_array(jsonb_build_object('sku',sku,'qty',1)), 'Тест запрета инвертора','История покупок клиента','Отгрузить выбранную позицию','shipment');
  raise exception 'INVERTER_WAS_ALLOWED';
 exception when raise_exception then if sqlerrm<>'TASK_FIELD_INVERTER_FORBIDDEN' then raise;end if;end;
end$$;
update workspace_fixture set task_id=(public.crm_task_create_v5(route_id,client_id,case when kind='work' then '[{"sku":"75/6/1","qty":2}]'::jsonb else '[]'::jsonb end,case when kind='work' then 'Отгрузить 2 шт.' else 'Подтвердить профиль клиента' end,'Основание тестового визита','Зафиксировать согласованный результат',case when kind='work' then 'shipment' else 'profile' end)->'task'->>'id')::uuid;
do $$begin
 if (select count(*)from public.crm_task_assignments_v5 a join workspace_fixture f using(task_id))<>2 then raise exception 'ASSIGNMENTS_MISSING';end if;
 if (select count(*)from public.crm_shelf_plans_v4 a join workspace_fixture f using(task_id))<>2 then raise exception 'SHELF_PLANS_MISSING';end if;
end$$;
reset role;
select set_config('request.jwt.claims',(select json_build_object('sub',id,'email',email,'role','authenticated')::text from public.users where name='Руднев'and role='manager'limit 1),true);
set local role authenticated;
do $$begin
 begin
 update public.tasks set done=true where id=(select task_id from workspace_fixture where kind='work');
 raise exception 'MANUAL_SHIPMENT_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
 perform public.crm_task_complete_potential_v5(task_id,'Обсудили ассортимент точки','Предложить ассортимент',current_date+7,true)from workspace_fixture where kind='potential';
 raise exception 'UNCONFIRMED_PROFILE_ALLOWED';
 exception when raise_exception then if sqlerrm<>'TASK_PROFILE_REQUIRED' then raise;end if;end;
end$$;
select public.crm_task_profile_v5(task_id,'{"role_type":"C","assortment":"Электроинструмент и садовая техника","sku_count":40,"sku_our":2}')from workspace_fixture where kind='potential';
select public.crm_shelf_save_v4(client_id,route_id,'[{"sku":"75/6/1","shelf_qty":2,"reserve_qty":null}]','75/6/1 две штуки','','[]')from workspace_fixture;
select public.crm_task_complete_potential_v5(task_id,'Подтверждены категория C и ассортимент','Согласовать первое предложение',current_date+7,true)from workspace_fixture where kind='potential';
do $$begin
 if not exists(select 1 from public.clients c join workspace_fixture f on c.id=f.client_id where f.kind='potential'and c.sku_count=40 and c.assortment='Электроинструмент и садовая техника')then raise exception 'PROFILE_NOT_PERSISTED';end if;
 if not exists(select 1 from public.tasks t join workspace_fixture f on t.id=f.task_id where f.kind='potential'and t.done)then raise exception 'POTENTIAL_NOT_COMPLETED';end if;
 if exists(select 1 from public.tasks t join workspace_fixture f on t.id=f.task_id where f.kind='work'and t.done)then raise exception 'SHELF_CLOSED_SHIPMENT';end if;
end$$;
reset role;
select set_config('request.jwt.claims',(select json_build_object('sub',id,'email',email,'role','authenticated')::text from public.users where name='Шкуран'and role='manager'limit 1),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.crm_task_assignments_v5 a join workspace_fixture f using(task_id)) then raise exception 'FOREIGN_MANAGER_ACCESS';end if;
end$$;
reset role;
select 'PASS: work/potential route creation; regional geography; profile save; shelf; potential completion; no manual shipment; manager isolation; all fixtures rolled back' result;
rollback;
