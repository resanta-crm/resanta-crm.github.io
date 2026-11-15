alter table public.crm_task_contracts_v4 add column cutoff_state text;
alter table public.crm_task_contracts_v4 add column cutoff_progress jsonb;
alter table public.crm_task_contracts_v4 add column cutoff_checked_at timestamptz;
create table public.crm_shelf_plans_v4(
 route_id uuid primary key references public.route_plans(id),client_id uuid not null references public.clients(id),
 task_id uuid not null references public.tasks(id),manager_name text not null,route_day date not null,
 scan_id uuid references public.crm_shelf_scans_v4(id),created_at timestamptz not null default now()
);
create index crm_shelf_plans_client_v4 on public.crm_shelf_plans_v4(client_id);
create index crm_shelf_plans_task_v4 on public.crm_shelf_plans_v4(task_id);
create index crm_shelf_plans_scan_v4 on public.crm_shelf_plans_v4(scan_id) where scan_id is not null;
alter table public.crm_shelf_plans_v4 enable row level security;
revoke all on public.crm_shelf_plans_v4 from public,anon,authenticated;
grant select on public.crm_shelf_plans_v4 to authenticated;
grant all on public.crm_shelf_plans_v4 to service_role;
create policy crm_shelf_plans_read_v4 on public.crm_shelf_plans_v4 for select to authenticated
 using((select public.crm_tasks_access_v4(client_id,manager_name)));
create function public.crm_shelf_plan_enroll_v4()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.route_id is not null then
 insert into public.crm_shelf_plans_v4(route_id,client_id,task_id,manager_name,route_day)
 values(new.route_id,new.client_id,new.task_id,new.manager_name,new.route_day)on conflict(route_id)do nothing;
 end if;return new;
end $$;
revoke all on function public.crm_shelf_plan_enroll_v4() from public,anon,authenticated;
create trigger crm_shelf_plan_enroll_v4 after insert on public.crm_task_contracts_v4 for each row execute function public.crm_shelf_plan_enroll_v4();
create function public.crm_shelf_plan_complete_v4()returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.crm_shelf_plans_v4 set scan_id=new.id where route_id=new.route_id and client_id=new.client_id and new.created_at>=created_at;
 return new;
end $$;
revoke all on function public.crm_shelf_plan_complete_v4() from public,anon,authenticated;
create trigger crm_shelf_plan_complete_v4 after insert on public.crm_shelf_scans_v4 for each row execute function public.crm_shelf_plan_complete_v4();

create function public.crm_tasks_daily_qty_asof_v4(p_legal text,p_sku text,p_day date,p_asof timestamptz)
returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(r.qty),0) from public.crm_daily_sales_rows_v4 r
 where r.run_id=(select id from public.crm_daily_sales_runs_v4 s where s.branch='Витебск' and s.report_day=p_day and s.source_message_at<=p_asof
  order by s.source_message_at desc,s.received_at desc limit 1)
 and r.legal_key=p_legal and r.sku=p_sku
$$;
revoke all on function public.crm_tasks_daily_qty_asof_v4(text,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_tasks_daily_qty_asof_v4(text,text,date,timestamptz) to service_role;

create function public.crm_task_cancel_v4(p_task uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.crm_task_contracts_v4;u public.users;
begin
 select * into u from public.users where id=(select auth.uid());
 select * into c from public.crm_task_contracts_v4 where task_id=p_task for update;
 if u.role<>'boss' or not public.crm_tasks_access_v4(c.client_id,c.manager_name) or length(btrim(p_reason))<5 or length(p_reason)>2000 then raise exception 'TASK_CANCEL_FORBIDDEN'using errcode='42501';end if;
 update public.crm_task_contracts_v4 set state='cancelled',review_by=u.id,review_at=now(),review_decision=p_reason where task_id=p_task;
 update public.tasks set done=false,result_achieved=null,review_status='stale_review',review_comment='Отменена: '||p_reason where id=p_task;
 insert into public.crm_task_events_v4(task_id,kind,actor_id,payload)values(p_task,'cancelled',u.id,jsonb_build_object('reason',p_reason));
 return jsonb_build_object('cancelled',true);
end $$;
revoke all on function public.crm_task_cancel_v4(uuid,text) from public,anon;
grant execute on function public.crm_task_cancel_v4(uuid,text) to authenticated;

create or replace function public.crm_tasks_reconcile_v4()
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; item jsonb; rows jsonb; actual numeric; goal numeric; pct numeric; complete boolean;
 verified int:=0; checked int:=0; issue text; new_state text; d date; first_day date; last_day date; old_state text; cut_rows jsonb; cut_complete boolean; cut_issue boolean; cut_state text;
begin
 perform pg_advisory_xact_lock(hashtext('crm_tasks_reconcile_v4'));
 for c in select * from public.crm_task_contracts_v4 where state<>'cancelled' order by approved_at for update loop
  old_state:=c.state; rows:='[]'; complete:=true; pct:=0; issue:=null;
  first_day:=greatest(c.week_start,(c.approved_at at time zone 'Europe/Minsk')::date);
  last_day:=least((now() at time zone 'Europe/Minsk')::date,(c.control_at at time zone 'Europe/Minsk')::date);
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
