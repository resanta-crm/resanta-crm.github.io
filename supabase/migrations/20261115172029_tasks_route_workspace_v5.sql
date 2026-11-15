-- Route identities and business evidence are preserved separately from legacy tasks.
create or replace function public.crm_tasks_access_v4(p_client uuid,p_manager text default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u join public.clients c on c.id=p_client
 join public.users owner on owner.name=c.manager_name and owner.role='manager' and owner.region='Витебск'
 where u.id=(select auth.uid()) and (p_manager is null or p_manager=c.manager_name)
 and ((u.role='boss' and u.region in('Витебск','Все филиалы')) or
 (u.role='manager' and u.region='Витебск' and u.name=c.manager_name)))
$$;

create table public.crm_task_assignments_v5(
 task_id uuid primary key references public.tasks(id),route_id uuid not null references public.route_plans(id),
 client_id uuid not null references public.clients(id),manager_name text not null,
 week_start date not null,route_day date not null,kind text not null check(kind in('work','potential')),
 stage text not null check(stage in('shipment','profile','proposal','decision')),
 cancelled boolean not null default false,profile_confirmed_at timestamptz,profile_evidence jsonb,
 created_at timestamptz not null default now(),completed_at timestamptz,
 unique(route_id,client_id)
);
create index crm_task_assignments_week_v5 on public.crm_task_assignments_v5(week_start,manager_name);
create index crm_task_assignments_client_v5 on public.crm_task_assignments_v5(client_id);
alter table public.crm_task_assignments_v5 enable row level security;
revoke all on public.crm_task_assignments_v5 from public,anon,authenticated;
grant select on public.crm_task_assignments_v5 to authenticated;
grant all on public.crm_task_assignments_v5 to service_role;
create policy crm_task_assignments_read_v5 on public.crm_task_assignments_v5 for select to authenticated
 using((select public.crm_tasks_access_v4(client_id,manager_name)));

-- A physical point may contain several explicitly linked legal clients.
alter table public.crm_shelf_plans_v4 drop constraint crm_shelf_plans_v4_pkey;
alter table public.crm_shelf_plans_v4 add primary key(route_id,client_id);
create or replace function public.crm_shelf_plan_enroll_v4()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.route_id is not null then
 insert into public.crm_shelf_plans_v4(route_id,client_id,task_id,manager_name,route_day)
 values(new.route_id,new.client_id,new.task_id,new.manager_name,new.route_day)
 on conflict(route_id,client_id)do nothing;
 end if;return new;
end $$;

create function public.crm_task_profile_v5(p_task uuid,p_profile jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.crm_task_assignments_v5;category text;assortment text;total integer;ours integer;
begin
 select * into a from public.crm_task_assignments_v5 where task_id=p_task for update;
 if not found or a.cancelled or not public.crm_tasks_access_v4(a.client_id,a.manager_name) then raise exception 'TASK_PROFILE_FORBIDDEN' using errcode='42501';end if;
 category:=p_profile->>'role_type';assortment:=btrim(p_profile->>'assortment');
 total:=(p_profile->>'sku_count')::integer;ours:=(p_profile->>'sku_our')::integer;
 if category is null or category not in('A','B','C') or coalesce(length(assortment),0) not between 2 and 1000
 or total is null or ours is null or total<0 or ours<0 or ours>total then raise exception 'TASK_PROFILE_INVALID';end if;
 update public.clients set role_type=category,assortment=assortment,sku_count=total,sku_our=ours where id=a.client_id;
 update public.crm_task_assignments_v5 set profile_confirmed_at=now(),profile_evidence=p_profile where task_id=p_task;
 insert into public.crm_task_events_v4(task_id,kind,actor_id,payload) values(p_task,'profile_confirmed',auth.uid(),p_profile);
 return jsonb_build_object('saved',true,'client_id',a.client_id);
end $$;
revoke all on function public.crm_task_profile_v5(uuid,jsonb) from public,anon;
grant execute on function public.crm_task_profile_v5(uuid,jsonb) to authenticated;

create function public.crm_task_complete_potential_v5(p_task uuid,p_fact text,p_next text,p_date date,p_achieved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.crm_task_assignments_v5;t public.tasks;
begin
 select * into a from public.crm_task_assignments_v5 where task_id=p_task for update;
 if not found or a.kind<>'potential' or a.cancelled or not public.crm_tasks_access_v4(a.client_id,a.manager_name) then raise exception 'TASK_COMPLETE_FORBIDDEN' using errcode='42501';end if;
 if p_achieved is not true or coalesce(length(btrim(p_fact)),0)<10 or length(p_fact)>2000
 or coalesce(length(btrim(p_next)),0)<3 or length(p_next)>1000 or p_date is null then raise exception 'TASK_RESULT_REQUIRED';end if;
 if a.stage='profile' and a.profile_confirmed_at is null then raise exception 'TASK_PROFILE_REQUIRED';end if;
 if not exists(select 1 from public.crm_shelf_plans_v4 where task_id=p_task and scan_id is not null)then raise exception 'TASK_SHELF_REQUIRED';end if;
 perform public.crm_task_report_v4(p_task,p_fact,'',p_next,p_date);
 update public.tasks set done=true,result_achieved='yes',done_at=coalesce(done_at,now()),closed_by=(select name from public.users where id=auth.uid()) where id=p_task returning * into t;
 update public.crm_task_assignments_v5 set completed_at=coalesce(completed_at,now()) where task_id=p_task;
 insert into public.crm_task_events_v4(task_id,kind,actor_id,payload)values(p_task,'potential_stage_completed',auth.uid(),jsonb_build_object('fact',p_fact,'next',p_next,'date',p_date));
 return jsonb_build_object('task',to_jsonb(t),'closed',true,'sale_confirmed',false);
end $$;
revoke all on function public.crm_task_complete_potential_v5(uuid,text,text,date,boolean) from public,anon;
grant execute on function public.crm_task_complete_potential_v5(uuid,text,text,date,boolean) to authenticated;

-- Prevent old forms and direct API calls bypassing completion criteria.
create function public.crm_task_assignment_guard_v5() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('postgres','service_role','supabase_admin') then return case when TG_OP='DELETE' then old else new end;end if;
 if TG_OP='INSERT' then
  if new.source='route_v5' then raise exception 'TASK_CREATE_USE_RPC' using errcode='42501';end if;return new;
 end if;
 if exists(select 1 from public.crm_task_assignments_v5 where task_id=old.id)then
  if TG_OP='DELETE' then raise exception 'TASK_ASSIGNMENT_PROTECTED' using errcode='42501';end if;
  if (new.done,new.result_achieved,new.done_at,new.client_id,new.manager_name,new.ai_stock_items,new.due_date,new.review_status,new.source,new.title,new.expected_result,new.criteria)
   is distinct from(old.done,old.result_achieved,old.done_at,old.client_id,old.manager_name,old.ai_stock_items,old.due_date,old.review_status,old.source,old.title,old.expected_result,old.criteria)
  then raise exception 'TASK_ASSIGNMENT_USE_RPC' using errcode='42501';end if;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function public.crm_task_assignment_guard_v5() from public,anon,authenticated;
create trigger crm_task_assignment_guard_v5 before insert or update or delete on public.tasks for each row execute function public.crm_task_assignment_guard_v5();

create function public.crm_task_create_v5(p_route uuid,p_client uuid,p_items jsonb,p_title text,p_basis text,p_expected text,p_stage text default 'shipment')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users;r public.route_plans;c public.clients;t public.tasks;item jsonb;
 targets jsonb:='[]';qty numeric;product text;available numeric;latest date;control_day date;enrolled jsonb;
begin
 select * into u from public.users where id=(select auth.uid());
 if not found or u.role<>'boss' or u.region not in('Витебск','Все филиалы') then raise exception 'TASK_CREATE_FORBIDDEN' using errcode='42501';end if;
 select * into r from public.route_plans where id=p_route and not coalesce(removed,false) and (approved or review_status='approved');
 if not found or coalesce(r.is_network_point,false) or r.network_point_id is not null then raise exception 'TASK_ROUTE_REQUIRED';end if;
 if p_client is null or not(p_client=r.client_id or p_client=any(coalesce(r.linked_client_ids,'{}'::uuid[]))) then raise exception 'TASK_ROUTE_MISMATCH';end if;
 select * into c from public.clients where id=p_client;
 if not found or not public.crm_tasks_access_v4(c.id,r.manager_name) or c.manager_name<>r.manager_name then raise exception 'TASK_CLIENT_SCOPE';end if;
 if c.client_status not in('Рабочий','Потенциальный') then raise exception 'TASK_CLIENT_STATUS';end if;
 if coalesce(length(btrim(p_title)),0) not between 3 and 160 or coalesce(length(btrim(p_expected)),0) not between 5 and 1000 or coalesce(length(btrim(p_basis)),0) not between 3 and 2000 then raise exception 'TASK_PLAN_REQUIRED';end if;
 if p_stage is null or (c.client_status='Рабочий' and p_stage<>'shipment') or (c.client_status='Потенциальный' and p_stage not in('profile','proposal','decision')) then raise exception 'TASK_STAGE_INVALID';end if;
 control_day:=date_trunc('week',r.visit_date)::date+4;
 if control_day<(now()at time zone'Europe/Minsk')::date then raise exception 'TASK_WEEK_IN_PAST';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>10 then raise exception 'TASK_TARGETS_INVALID';end if;
 if c.client_status='Рабочий' then
  if jsonb_array_length(p_items)=0 then raise exception 'TASK_SKU_TARGETS_REQUIRED';end if;
  select max(report_date)into latest from public.stock_balances where warehouse='Витебск';
  if latest is null or latest<(now()at time zone'Europe/Minsk')::date-1 or latest>(now()at time zone'Europe/Minsk')::date then raise exception 'TASK_STOCK_STALE';end if;
  for item in select value from jsonb_array_elements(p_items) loop
   qty:=(item->>'qty')::numeric;
   select min(p.product) into product from public.price_list p where p.sku=item->>'sku' having count(distinct p.product)=1;
   if product is null or qty is null or qty<=0 or qty>100000 or exists(select 1 from jsonb_array_elements(targets)x where x->>'sku'=item->>'sku') then raise exception 'TASK_TARGETS_INVALID';end if;
   select coalesce(sum(s.qty_avail),0)into available from public.stock_balances s where s.warehouse='Витебск' and s.report_date=latest and s.sku=item->>'sku';
   if available<qty then raise exception 'TASK_INSUFFICIENT_STOCK: %',item->>'sku';end if;
   targets:=targets||jsonb_build_array(jsonb_build_object('sku',item->>'sku','product',product,'qty',qty));
  end loop;
 end if;
 insert into public.tasks(client_id,manager_name,manager_id,text,title,due_date,done,auto_generated,review_status,reviewed_at,reviewed_by,source,ai_stock_items,expected_result,criteria,basis)
 values(c.id,r.manager_name,(select id from public.users where name=r.manager_name and role='manager' and region='Витебск' limit 1),
  p_expected,
  p_title,
  control_day,false,false,'approved',now(),u.name,'must_list',targets,
  p_expected,
  case when c.client_status='Рабочий' then 'Автоматическая сверка SKU и количеств с дневными реализациями 1С' else 'Содержательный результат переговоров и конкретный следующий шаг' end,
  p_basis)returning * into t;
 if c.client_status='Рабочий' then enrolled:=public.crm_task_enroll_v4(t.id,r.id);end if;
 insert into public.crm_task_assignments_v5(task_id,route_id,client_id,manager_name,week_start,route_day,kind,stage) values(t.id,r.id,c.id,r.manager_name,date_trunc('week',r.visit_date)::date,r.visit_date,case when c.client_status='Рабочий' then 'work' else 'potential' end,p_stage);
 insert into public.crm_shelf_plans_v4(route_id,client_id,task_id,manager_name,route_day) values(r.id,c.id,t.id,r.manager_name,r.visit_date) on conflict(route_id,client_id) do nothing;
 return jsonb_build_object('task',to_jsonb(t),'verification',enrolled);
end $$;
revoke all on function public.crm_task_create_v5(uuid,uuid,jsonb,text,text,text,text) from public,anon;
grant execute on function public.crm_task_create_v5(uuid,uuid,jsonb,text,text,text,text) to authenticated;

create or replace function public.crm_task_create_v4(p_route uuid,p_items jsonb default '[]') returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.route_plans;c public.clients;
begin
 select * into r from public.route_plans where id=p_route;
 select * into c from public.clients where id=r.client_id;
 return public.crm_task_create_v5(p_route,c.id,p_items,
 case when c.client_status='Рабочий' then 'Отгрузка по SKU' else 'Уточнить профиль и следующий контакт' end,
 'План по утверждённому визиту',
 case when c.client_status='Рабочий' then 'Отгрузить каждую утверждённую позицию в заданном количестве' else 'Подтвердить недостающий профиль, сверить полку и согласовать следующий контакт' end,
 case when c.client_status='Рабочий' then 'shipment' else 'profile' end);
end $$;

create or replace function public.crm_daily_sales_ingest_v4(p_report jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run uuid; line jsonb; n int:=0; bad int:=0; candidates text[]; legal text;
 v_day date; source_at timestamptz; q numeric; revenue numeric; totals record;
begin
 if p_report->>'branch'<>'Витебск' or p_report->>'parser'<>'daily-sales-v4.1' then raise exception 'DAILY_REPORT_SCOPE'; end if;
 v_day:=(p_report->>'report_day')::date; source_at:=(p_report->>'source_message_at')::timestamptz;
 if v_day<>(source_at at time zone 'Europe/Minsk')::date or source_at>now()+interval '5 minutes'
 or v_day<(now() at time zone 'Europe/Minsk')::date-7 then raise exception 'DAILY_REPORT_DATE';end if;
 if jsonb_typeof(p_report->'rows')<>'array' or jsonb_array_length(p_report->'rows')>50000 then raise exception 'DAILY_REPORT_ROWS';end if;
 if jsonb_array_length(p_report->'rows')=0 and (p_report->>'explicit_empty')::boolean is not true then raise exception 'DAILY_REPORT_EMPTY';end if;
 perform pg_advisory_xact_lock(hashtext('crm_daily_sales_v4:'||v_day::text));
 if exists(select 1 from public.crm_daily_sales_runs_v4 where branch='Витебск' and report_day=v_day
  and source_message_at=source_at and content_sha256=p_report->>'content_sha256') then
  return jsonb_build_object('duplicate',true);end if;
 if exists(select 1 from public.crm_daily_sales_runs_v4 s where s.branch='Витебск' and s.report_day=v_day and s.source_message_at>=source_at) then
  return jsonb_build_object('older_snapshot',true);end if;
 insert into public.crm_daily_sales_runs_v4(branch,report_day,source_message_at,source_message_id,content_sha256,
  explicit_empty,total_qty,total_revenue,row_count,parser)
 values('Витебск',v_day,source_at,left(p_report->>'source_message_id',500),p_report->>'content_sha256',
  (p_report->>'explicit_empty')::boolean,(p_report->>'total_qty')::numeric,(p_report->>'total_revenue')::numeric,
  jsonb_array_length(p_report->'rows'),p_report->>'parser') returning id into run;
 for line in select value from jsonb_array_elements(p_report->'rows') loop
  n:=n+1;
  if (line->>'sku') !~ '^\d{1,8}(/\d{1,8}){1,6}$' or nullif(btrim(line->>'client_name'),'') is null then raise exception 'DAILY_REPORT_LINE';end if;
  -- Resolve exact existing names/aliases and explicitly linked legal entities.
  -- Ambiguous clients stay unresolved; no fuzzy assignment and no CRM identity writes.
  select array_agg(distinct k) into candidates from (
   select public.crm_tasks_legal_key_v4(c.id) k from public.clients c
    where exists(select 1 from public.users u where u.name=c.manager_name and u.role='manager' and u.region='Витебск') and lower(btrim(c.name))=lower(btrim(line->>'client_name'))
   union select public.crm_tasks_legal_key_v4(c.id) from public.client_aliases a join public.clients c on c.id=a.client_id
    where exists(select 1 from public.users u where u.name=c.manager_name and u.role='manager' and u.region='Витебск') and lower(btrim(a.alias_name))=lower(btrim(line->>'client_name'))
   union select 'entity:'||e.id from public.client360_entities_v1 e
    where lower(btrim(e.name))=lower(btrim(line->>'client_name')) and exists(
     select 1 from public.client360_entity_clients_v1 ec join public.clients c on c.id=ec.client_id where ec.entity_id=e.id and exists(select 1 from public.users u where u.name=c.manager_name and u.role='manager' and u.region='Витебск'))
  ) matches;
  legal:=case when cardinality(candidates)=1 then candidates[1] else null end;
  if legal is null then bad:=bad+1;end if;
  insert into public.crm_daily_sales_rows_v4(run_id,line_no,client_name,legal_key,sku,product,qty,revenue)
   values(run,n,left(line->>'client_name',500),legal,line->>'sku',left(line->>'product',500),(line->>'qty')::numeric,(line->>'revenue')::numeric);
 end loop;
 select coalesce(sum(r.qty),0) qty,coalesce(sum(r.revenue),0) revenue into totals from public.crm_daily_sales_rows_v4 r where r.run_id=run;
 if abs(totals.qty-(p_report->>'total_qty')::numeric)>.0001 or abs(totals.revenue-(p_report->>'total_revenue')::numeric)>.02 then raise exception 'DAILY_REPORT_TOTALS';end if;
 update public.crm_daily_sales_runs_v4 set unresolved_count=bad where id=run;
 return jsonb_build_object('run_id',run,'rows',n,'unresolved',bad,'verification',public.crm_tasks_reconcile_v4());
end $$;
revoke all on function public.crm_daily_sales_ingest_v4(jsonb) from public,anon,authenticated;
grant execute on function public.crm_daily_sales_ingest_v4(jsonb) to service_role;


create or replace function public.crm_tasks_reconcile_v4()
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; item jsonb; rows jsonb; actual numeric; goal numeric; pct numeric; complete boolean;
 verified int:=0; checked int:=0; issue text; new_state text; d date; first_day date; last_day date; old_state text; cut_rows jsonb; cut_complete boolean; cut_issue boolean; cut_state text;
begin
 perform pg_advisory_xact_lock(hashtext('crm_tasks_reconcile_v4'));
 for c in select * from public.crm_task_contracts_v4 where state<>'cancelled' order by approved_at for update loop
  old_state:=c.state; rows:='[]'; complete:=true; pct:=0; issue:=null;
  first_day:=greatest(c.week_start,(c.approved_at at time zone 'Europe/Minsk')::date);
  last_day:=least((now() at time zone 'Europe/Minsk')::date,coalesce((select min(greatest(n.week_start,(n.approved_at at time zone 'Europe/Minsk')::date))-1 from public.crm_task_contracts_v4 n where n.legal_key=c.legal_key and n.week_start>c.week_start and n.state<>'cancelled'),'infinity'::date));
  if not c.baseline_ready then issue:='Не зафиксирован исходный дневной срез на момент утверждения'; end if;
  for d in select generate_series(first_day,last_day,interval '1 day')::date loop
   if not exists(select 1 from public.crm_daily_sales_runs_v4 where branch=c.branch and report_day=d) then
    issue:=coalesce(issue,'Не поступил дневной отчёт за '||d::text);
   end if;
  end loop;
  -- Keep technical verification failures distinct from manager nonexecution.
  if now()>=c.control_at and not exists(select 1 from public.crm_daily_sales_runs_v4
   where branch=c.branch and report_day=(c.control_at at time zone 'Europe/Minsk')::date
   and source_message_at>=c.control_at-interval '2 hours') then
   issue:=coalesce(issue,'Нет контрольного отчёта перед пятницей 15:00');
  end if;
  for item in select value from jsonb_array_elements(c.targets) loop
   goal:=(item->>'qty')::numeric; actual:=0;
   for d in select generate_series(first_day,last_day,interval '1 day')::date loop
    actual:=actual+public.crm_tasks_daily_qty_v4(c.legal_key,item->>'sku',d);
   end loop;
   actual:=greatest(0,actual-case when first_day=(c.approved_at at time zone 'Europe/Minsk')::date then coalesce((c.baseline->>(item->>'sku'))::numeric,0) else 0 end);
   pct:=pct+least(1,actual/goal);
   if actual<goal then complete:=false; end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('sku',item->>'sku','product',item->>'product',
     'target',goal,'actual',actual,'remaining',greatest(0,goal-actual)));
  end loop;
  pct:=round(pct/jsonb_array_length(c.targets)*100,2);
  new_state:=case when issue is null and complete then 'verified'
    when now()<c.control_at then 'in_progress'
    when issue is not null then 'check_error'
    when pct>0 then 'partial' else 'not_achieved' end;
  update public.crm_task_contracts_v4 set state=new_state,progress=rows,progress_pct=pct,checked_at=now(),check_issue=issue,
   verified_at=case when new_state='verified' then coalesce(verified_at,now()) else null end where task_id=c.task_id;
  if new_state='verified' then
   update public.tasks set done=true,result_achieved='yes',closed_by='Проверка 1С',done_at=coalesce(done_at,now()),
    fact_result='Все утверждённые SKU подтверждены дневными отчётами 1С',
    proof='Дневные срезы 1С: '||first_day::text||' — '||last_day::text,ai_check='achieved',ai_checked_at=now()
    where id=c.task_id;
   verified:=verified+1;
  elsif old_state='verified' then
   update public.tasks set done=false,result_achieved=null,closed_by=null,done_at=null,ai_check='unclear',fact_result='Повторная проверка: количество больше не подтверждает полный план',
    ai_check_note='Повторная сверка: возврат, исправление или отсутствие подтверждения',ai_checked_at=now()
    where id=c.task_id;
  end if;
  if now()>=c.control_at then
   cut_rows:='[]';cut_complete:=true;cut_issue:=not c.baseline_ready;
   for d in select generate_series(first_day,(c.control_at at time zone 'Europe/Minsk')::date,interval '1 day')::date loop
    if not exists(select 1 from public.crm_daily_sales_runs_v4 where branch=c.branch and report_day=d and source_message_at<=c.control_at)then cut_issue:=true;end if;
   end loop;
   if not exists(select 1 from public.crm_daily_sales_runs_v4 where branch=c.branch and report_day=(c.control_at at time zone 'Europe/Minsk')::date and source_message_at between c.control_at-interval '2 hours' and c.control_at)then cut_issue:=true;end if;
   for item in select value from jsonb_array_elements(c.targets)loop
    goal:=(item->>'qty')::numeric;actual:=0;
    for d in select generate_series(first_day,(c.control_at at time zone 'Europe/Minsk')::date,interval '1 day')::date loop
     actual:=actual+public.crm_tasks_daily_qty_asof_v4(c.legal_key,item->>'sku',d,c.control_at);
    end loop;
    actual:=greatest(0,actual-case when first_day=(c.approved_at at time zone 'Europe/Minsk')::date then coalesce((c.baseline->>(item->>'sku'))::numeric,0)else 0 end);
    if actual<goal then cut_complete:=false;end if;
    cut_rows:=cut_rows||jsonb_build_array(jsonb_build_object('sku',item->>'sku','product',item->>'product','target',goal,'actual',actual,'remaining',greatest(0,goal-actual)));
   end loop;
   cut_state:=case when cut_issue then 'check_error' when cut_complete then 'verified'
    when exists(select 1 from jsonb_array_elements(cut_rows)x where(x->>'actual')::numeric>0)then 'partial'else 'not_achieved'end;
   update public.crm_task_contracts_v4 set cutoff_state=cut_state,cutoff_progress=cut_rows,cutoff_checked_at=now()where task_id=c.task_id;
  end if;
  if old_state<>new_state then
   insert into public.crm_task_events_v4(task_id,kind,payload)values(c.task_id,'verification',jsonb_build_object('from',old_state,'to',new_state,'progress',rows,'issue',issue));
  end if;
  checked:=checked+1;
 end loop;
 return jsonb_build_object('checked',checked,'verified',verified);
end $$;
