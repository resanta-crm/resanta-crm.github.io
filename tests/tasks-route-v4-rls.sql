-- Transactional production-schema verification. Every fixture is rolled back.
begin;
create temp table tasks_v4_test_ids(task_id uuid,client_id uuid,legal_key text,manager_id uuid,other_id uuid);
insert into tasks_v4_test_ids
 select gen_random_uuid(),gen_random_uuid(),'test:'||gen_random_uuid(),
 (select id from public.users where name='Руднев' and role='manager' limit 1),
 (select id from public.users where name='Шкуран' and role='manager' limit 1);
insert into public.clients(id,name,region,manager_name,client_status)
 select client_id,'ПРОВЕРКА V4 — ОТКАТ','Витебск','Руднев','Рабочий' from tasks_v4_test_ids;
insert into public.tasks(id,client_id,manager_id,manager_name,text,title,done,review_status,source,due_date)
 select task_id,client_id,manager_id,'Руднев','ТЕСТ V4 — ОТКАТ','Тест SKU',false,'approved','must_list',(now()at time zone'Europe/Minsk')::date from tasks_v4_test_ids;
insert into public.crm_task_contracts_v4(task_id,client_id,manager_name,branch,legal_key,route_day,week_start,control_at,approved_by,targets,baseline_ready,approved_at)
 select task_id,client_id,'Руднев','Витебск',legal_key,(now()at time zone'Europe/Minsk')::date,
 (now()at time zone'Europe/Minsk')::date,now()+interval'1 hour',
 (select id from public.users where name='Александр Паюшин' limit 1),
 '[{"sku":"75/6/1","product":"Тестовый SKU","qty":2}]',true,date_trunc('day',now()) from tasks_v4_test_ids;
create temp table tasks_v4_test_runs(id uuid);
with r as(insert into public.crm_daily_sales_runs_v4(branch,report_day,source_message_at,source_message_id,content_sha256,explicit_empty,total_qty,total_revenue,row_count,parser)
 values('Витебск',(now()at time zone'Europe/Minsk')::date,now(),'TEST-ROLLBACK',repeat('a',64),false,1,10,1,'daily-sales-v4.1') returning id)
insert into tasks_v4_test_runs select id from r;
insert into public.crm_daily_sales_rows_v4(run_id,line_no,client_name,legal_key,sku,product,qty,revenue)
select r.id,1,'ПРОВЕРКА V4 — ОТКАТ',t.legal_key,'75/6/1','Тестовый SKU',1,10 from tasks_v4_test_runs r cross join tasks_v4_test_ids t;
select public.crm_tasks_reconcile_v4();
do $$begin
 if not exists(select 1 from public.crm_task_contracts_v4 where task_id=(select task_id from tasks_v4_test_ids)and state='in_progress'and progress_pct=50)then raise exception 'EARLY_PARTIAL_MUST_STAY_IN_PROGRESS';end if;
 if exists(select 1 from public.tasks where id=(select task_id from tasks_v4_test_ids)and done)then raise exception 'PARTIAL_MUST_NOT_CLOSE';end if;
end $$;
update public.crm_daily_sales_rows_v4 set qty=2 where run_id in(select id from tasks_v4_test_runs);
select public.crm_tasks_reconcile_v4();
do $$begin
 if not exists(select 1 from public.tasks where id=(select task_id from tasks_v4_test_ids)and done and closed_by='Проверка 1С')then raise exception 'FULL_SHIPMENT_MUST_CLOSE';end if;
end $$;
update public.crm_daily_sales_rows_v4 set qty=1 where run_id in(select id from tasks_v4_test_runs);
select public.crm_tasks_reconcile_v4();
do $$begin
 if exists(select 1 from public.tasks where id=(select task_id from tasks_v4_test_ids)and done)then raise exception 'RETURN_MUST_REOPEN';end if;
end $$;
-- Cutoff moves this outstanding task into partial, not into fulfilled.
update public.crm_task_contracts_v4 set control_at=now()-interval'1 minute' where task_id=(select task_id from tasks_v4_test_ids);
select public.crm_tasks_reconcile_v4();
do $$begin
 if not exists(select 1 from public.crm_task_contracts_v4 where task_id=(select task_id from tasks_v4_test_ids)and state='partial')then raise exception 'CUTOFF_PARTIAL_MISSING';end if;
end $$;
grant select on tasks_v4_test_ids to authenticated;
select set_config('request.jwt.claims',(select json_build_object('sub',manager_id,'email',(select email from public.users where id=manager_id),'role','authenticated')::text from tasks_v4_test_ids),true);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.crm_task_contracts_v4 where task_id=(select task_id from tasks_v4_test_ids))then raise exception 'ASSIGNED_MANAGER_CANNOT_SEE_TASK';end if;
 begin
  update public.tasks set done=true where id=(select task_id from tasks_v4_test_ids);
  raise exception 'MANUAL_CLOSE_WAS_ALLOWED';
 exception when insufficient_privilege then null;end;
 begin
  update public.tasks set ai_stock_items='[{"sku":"75/6/1","qty":999}]' where id=(select task_id from tasks_v4_test_ids);
  raise exception 'TARGET_EDIT_WAS_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',(select json_build_object('sub',other_id,'email',(select email from public.users where id=other_id),'role','authenticated')::text from tasks_v4_test_ids),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.crm_task_contracts_v4 where task_id=(select task_id from tasks_v4_test_ids))then raise exception 'FOREIGN_MANAGER_DATA_EXPOSED';end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.crm_daily_sales_ingest_v4(jsonb)','execute')
 or has_function_privilege('authenticated','public.crm_daily_sales_ingest_v4(jsonb)','execute')
 or has_function_privilege('authenticated','public.crm_tasks_reconcile_v4()','execute')then raise exception 'SERVICE_FUNCTION_EXPOSED';end if;
end $$;
select 'PASS: partial, full shipment, return, cutoff, manager delivery, manual-close guard, target guard, foreign-manager isolation, service-only ingestion' result;
rollback;
