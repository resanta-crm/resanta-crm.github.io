begin;
do $$
declare boss_id uuid;r record;scope jsonb;coverage jsonb;other_route uuid;denied boolean:=false;constraint_name text;
begin
 if not(select relrowsecurity from pg_class where oid='public.crm_task_route_drafts_v1'::regclass)then raise exception 'draft RLS disabled';end if;
 if has_table_privilege('anon','public.crm_task_route_drafts_v1','SELECT,INSERT,UPDATE,DELETE')or has_table_privilege('authenticated','public.crm_task_route_drafts_v1','SELECT,INSERT,UPDATE,DELETE')then raise exception 'draft table exposed';end if;
 if not has_table_privilege('service_role','public.crm_task_route_drafts_v1','SELECT,INSERT,UPDATE')then raise exception 'draft service grants missing';end if;
 if has_function_privilege('anon','public.crm_task_route_existing_v1(uuid,uuid)','EXECUTE')or has_function_privilege('anon','public.crm_task_route_coverage_v1(text,date)','EXECUTE')then raise exception 'coverage exposed to anon';end if;
 if(select prosecdef from pg_proc where oid='public.crm_task_route_existing_v1(uuid,uuid)'::regprocedure)or(select prosecdef from pg_proc where oid='public.crm_task_route_coverage_v1(text,date)'::regprocedure)then raise exception 'public wrapper must be invoker';end if;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.crm_task_route_coverage_v1(null,current_date);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'unauthenticated coverage did not deny';end if;
 select id into boss_id from public.users where role='boss' and region in('Витебск','Все филиалы')limit 1;
 if boss_id is null then raise exception 'fixture boss missing';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',boss_id,'role','authenticated')::text,true);
 select rp.*,c.id as fixture_client into r from public.route_plans rp join public.clients c on c.id=rp.client_id
 where not coalesce(rp.removed,false)and(rp.approved or rp.review_status='approved')and not coalesce(rp.is_network_point,false)and rp.network_point_id is null
 and c.client_status='Рабочий'and c.manager_name=rp.manager_name and public.crm_tasks_access_v4(c.id,rp.manager_name)
 and not exists(select 1 from public.crm_task_route_drafts_v1 d where(d.route_id=rp.id and d.client_id=c.id)or(d.kind='work'and d.legal_key=public.crm_tasks_legal_key_v4(c.id)and d.week_start=date_trunc('week',rp.visit_date)::date))limit 1;
 if r.id is null then raise exception 'fixture route missing';end if;
 coverage:=public.crm_task_route_existing_v1(r.id,r.fixture_client);scope:=coverage->'scope';
 if scope->>'legal_key' is distinct from public.crm_tasks_legal_key_v4(r.fixture_client)then raise exception 'coverage legal policy mismatch';end if;
 if(scope->>'week_start')::date is distinct from date_trunc('week',r.visit_date)::date then raise exception 'coverage week mismatch';end if;
 if jsonb_typeof(public.crm_task_route_coverage_v1(r.manager_name,r.visit_date))is distinct from'array'then raise exception 'bulk coverage shape';end if;
 insert into public.crm_task_route_drafts_v1(route_id,client_id,kind,legal_key,week_start,route_day,manager_name,state,request_id,request,request_fingerprint,created_by,updated_by)
 values(r.id,r.fixture_client,'work',scope->>'legal_key',(scope->>'week_start')::date,r.visit_date,r.manager_name,'preparing',gen_random_uuid(),'{}',repeat('0',64),boss_id,boss_id);
 begin
  insert into public.crm_task_route_drafts_v1(route_id,client_id,kind,legal_key,week_start,route_day,manager_name,state,request_id,request,request_fingerprint,created_by,updated_by)
  values(r.id,r.fixture_client,'work',scope->>'legal_key',(scope->>'week_start')::date,r.visit_date,r.manager_name,'preparing',gen_random_uuid(),'{}',repeat('0',64),boss_id,boss_id);
  raise exception 'same route/client draft duplicated';
 exception when unique_violation then null;end;
 select id into other_route from public.route_plans where id<>r.id limit 1;
 if other_route is not null then
  begin
   insert into public.crm_task_route_drafts_v1(route_id,client_id,kind,legal_key,week_start,route_day,manager_name,state,request_id,request,request_fingerprint,created_by,updated_by)
   values(other_route,r.fixture_client,'work',scope->>'legal_key',(scope->>'week_start')::date,r.visit_date,r.manager_name,'preparing',gen_random_uuid(),'{}',repeat('0',64),boss_id,boss_id);
   raise exception 'same legal/week draft duplicated';
  exception when unique_violation then get stacked diagnostics constraint_name=constraint_name;if constraint_name<>'crm_task_route_drafts_legal_week_v1'then raise exception 'wrong legal-week constraint';end if;end;
 end if;
 if public.crm_task_route_existing_v1(r.id,r.fixture_client)->'draft_ref'->>'route_id'is distinct from r.id::text then raise exception 'durable draft coverage missing';end if;
end $$;
rollback;
