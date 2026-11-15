-- Isolated daily evidence. Existing monthly imports and client/route identities
-- remain untouched. Only explicitly enrolled task contracts use automatic close.
create table public.crm_daily_sales_runs_v4 (
 id uuid primary key default gen_random_uuid(), branch text not null check(branch='Витебск'),
 report_day date not null, source_message_at timestamptz not null,
 source_message_id text not null, content_sha256 text not null check(length(content_sha256)=64),
 explicit_empty boolean not null, total_qty numeric not null, total_revenue numeric not null,
 row_count integer not null, unresolved_count integer not null default 0,
 received_at timestamptz not null default now(), parser text not null,
 unique(branch,report_day,source_message_at,content_sha256)
);
create index crm_daily_sales_runs_day_v4 on public.crm_daily_sales_runs_v4(branch,report_day,source_message_at desc);
create table public.crm_daily_sales_rows_v4 (
 run_id uuid not null references public.crm_daily_sales_runs_v4(id) on delete cascade,
 line_no integer not null, client_name text not null, legal_key text,
 sku text not null, product text not null, qty numeric not null, revenue numeric not null,
 primary key(run_id,line_no)
);
create index crm_daily_sales_rows_legal_sku_v4 on public.crm_daily_sales_rows_v4(legal_key,sku,run_id);
create table public.crm_task_contracts_v4 (
 task_id uuid primary key references public.tasks(id), client_id uuid not null references public.clients(id),
 manager_name text not null, branch text not null check(branch='Витебск'), legal_key text not null,
 route_id uuid references public.route_plans(id), route_day date not null,
 week_start date not null, control_at timestamptz not null,
 approved_at timestamptz not null default now(), approved_by uuid not null references public.users(id),
 targets jsonb not null check(jsonb_typeof(targets)='array' and jsonb_array_length(targets) between 1 and 10),
 baseline jsonb not null default '{}', baseline_ready boolean not null,
 state text not null default 'in_progress' check(state in('in_progress','verified','partial','not_achieved','check_error','cancelled')),
 progress jsonb not null default '[]', progress_pct numeric not null default 0,
 checked_at timestamptz, verified_at timestamptz, check_issue text,
 review_at timestamptz, review_decision text, review_by uuid references public.users(id),
 unique(legal_key,week_start)
);
create index crm_task_contracts_manager_v4 on public.crm_task_contracts_v4(manager_name,week_start,control_at);
create index crm_task_contracts_client_v4 on public.crm_task_contracts_v4(client_id);
create index crm_task_contracts_route_v4 on public.crm_task_contracts_v4(route_id) where route_id is not null;
create index crm_task_contracts_approved_by_v4 on public.crm_task_contracts_v4(approved_by);
create index crm_task_contracts_review_by_v4 on public.crm_task_contracts_v4(review_by) where review_by is not null;
create table public.crm_task_events_v4 (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id),
 kind text not null, actor_id uuid references public.users(id), payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create index crm_task_events_task_v4 on public.crm_task_events_v4(task_id,created_at desc);
create index crm_task_events_actor_v4 on public.crm_task_events_v4(actor_id) where actor_id is not null;

alter table public.crm_daily_sales_runs_v4 enable row level security;
alter table public.crm_daily_sales_rows_v4 enable row level security;
alter table public.crm_task_contracts_v4 enable row level security;
alter table public.crm_task_events_v4 enable row level security;
revoke all on public.crm_daily_sales_runs_v4,public.crm_daily_sales_rows_v4,public.crm_task_contracts_v4,public.crm_task_events_v4 from public,anon,authenticated;
grant select on public.crm_task_contracts_v4,public.crm_task_events_v4 to authenticated;
grant all on public.crm_daily_sales_runs_v4,public.crm_daily_sales_rows_v4,public.crm_task_contracts_v4,public.crm_task_events_v4 to service_role;

create function public.crm_tasks_access_v4(p_client uuid,p_manager text default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u join public.clients c on c.id=p_client
 where u.id=(select auth.uid()) and c.region='Витебск'
 and ((u.role='boss' and u.region in('Витебск','Все филиалы')) or
      (u.role='manager' and u.region='Витебск' and u.name=coalesce(p_manager,c.manager_name) and u.name=c.manager_name)))
$$;
revoke all on function public.crm_tasks_access_v4(uuid,text) from public,anon;
grant execute on function public.crm_tasks_access_v4(uuid,text) to authenticated,service_role;
create policy crm_task_contracts_read_v4 on public.crm_task_contracts_v4 for select to authenticated
 using((select public.crm_tasks_access_v4(client_id,manager_name)));
create policy crm_task_events_read_v4 on public.crm_task_events_v4 for select to authenticated
 using(exists(select 1 from public.tasks t where t.id=task_id and public.crm_tasks_access_v4(t.client_id,t.manager_name)));

create function public.crm_tasks_legal_key_v4(p_client uuid)
returns text language sql stable security definer set search_path='' as $$
 select coalesce((select 'entity:'||entity_id from public.client360_entity_clients_v1 where client_id=p_client),'client:'||p_client)
$$;
revoke all on function public.crm_tasks_legal_key_v4(uuid) from public,anon,authenticated;
grant execute on function public.crm_tasks_legal_key_v4(uuid) to service_role;

-- Current daily snapshot is replacement evidence, not an additive mail event.
create function public.crm_tasks_daily_qty_v4(p_legal text,p_sku text,p_day date)
returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(r.qty),0) from public.crm_daily_sales_rows_v4 r
 where r.run_id=(select id from public.crm_daily_sales_runs_v4 s where s.branch='Витебск' and s.report_day=p_day
   order by s.source_message_at desc,s.received_at desc limit 1)
 and r.legal_key=p_legal and r.sku=p_sku
$$;
revoke all on function public.crm_tasks_daily_qty_v4(text,text,date) from public,anon,authenticated;
grant execute on function public.crm_tasks_daily_qty_v4(text,text,date) to service_role;

create function public.crm_tasks_reconcile_v4()
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; item jsonb; rows jsonb; actual numeric; goal numeric; pct numeric; complete boolean;
 verified int:=0; checked int:=0; issue text; new_state text; d date; first_day date; last_day date; old_state text;
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
   update public.tasks set done=false,result_achieved=null,closed_by=null,done_at=null,ai_check='unclear',
    ai_check_note='Повторная сверка: возврат, исправление или отсутствие подтверждения',ai_checked_at=now()
    where id=c.task_id;
  end if;
  if old_state<>new_state then
   insert into public.crm_task_events_v4(task_id,kind,payload)values(c.task_id,'verification',jsonb_build_object('from',old_state,'to',new_state,'progress',rows,'issue',issue));
  end if;
  checked:=checked+1;
 end loop;
 return jsonb_build_object('checked',checked,'verified',verified);
end $$;
revoke all on function public.crm_tasks_reconcile_v4() from public,anon,authenticated;
grant execute on function public.crm_tasks_reconcile_v4() to service_role;

create function public.crm_daily_sales_ingest_v4(p_report jsonb)
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
    where c.region='Витебск' and lower(btrim(c.name))=lower(btrim(line->>'client_name'))
   union select public.crm_tasks_legal_key_v4(c.id) from public.client_aliases a join public.clients c on c.id=a.client_id
    where c.region='Витебск' and lower(btrim(a.alias_name))=lower(btrim(line->>'client_name'))
   union select 'entity:'||e.id from public.client360_entities_v1 e
    where lower(btrim(e.name))=lower(btrim(line->>'client_name')) and exists(
     select 1 from public.client360_entity_clients_v1 ec join public.clients c on c.id=ec.client_id where ec.entity_id=e.id and c.region='Витебск')
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

create function public.crm_task_enroll_v4(p_task uuid,p_route uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks; c public.clients; u public.users; r public.route_plans; item jsonb; target jsonb:='[]';
 base jsonb:='{}'; ready boolean; legal text; day date; control timestamptz; start_day date;
begin
 select * into u from public.users where id=(select auth.uid());
 if not found or u.role<>'boss' or u.region not in('Витебск','Все филиалы') then raise exception 'TASK_APPROVAL_FORBIDDEN' using errcode='42501';end if;
 select * into t from public.tasks where id=p_task for update;
 if not found or t.done or t.review_status<>'approved' then raise exception 'TASK_NOT_APPROVED';end if;
 select * into c from public.clients where id=t.client_id;
 if not public.crm_tasks_access_v4(c.id,t.manager_name) or c.client_status<>'Рабочий' or t.source<>'must_list' then raise exception 'TASK_SCOPE';end if;
 if exists(select 1 from public.crm_task_contracts_v4 where task_id=t.id) then return jsonb_build_object('already_enrolled',true);end if;
 day:=coalesce(t.due_date,(now() at time zone 'Europe/Minsk')::date);
 if p_route is not null then
  select * into r from public.route_plans where id=p_route and manager_name=t.manager_name and not coalesce(removed,false)
   and (client_id=c.id or c.id=any(linked_client_ids)) and (approved or review_status='approved');
  if not found then raise exception 'TASK_ROUTE_MISMATCH';end if;
  day:=r.visit_date;
 end if;
 start_day:=date_trunc('week',day)::date;
 control:=((start_day+4)::text||' 15:00:00')::timestamp at time zone 'Europe/Minsk';
 if control<=now() then raise exception 'TASK_CONTROL_IN_PAST';end if;
 legal:=public.crm_tasks_legal_key_v4(c.id);
 if jsonb_typeof(t.ai_stock_items)<>'array' or jsonb_array_length(t.ai_stock_items) not between 1 and 10 then raise exception 'TASK_SKU_TARGETS_REQUIRED';end if;
 for item in select value from jsonb_array_elements(t.ai_stock_items) loop
  if (item->>'sku') !~ '^\d{1,8}(/\d{1,8}){1,6}$' or coalesce((item->>'qty')::numeric,0)<=0
    or exists(select 1 from jsonb_array_elements(target) x where x->>'sku'=item->>'sku') then raise exception 'TASK_TARGET_INVALID';end if;
  if not exists(select 1 from public.price_list where sku=item->>'sku') then raise exception 'TASK_UNKNOWN_SKU';end if;
  target:=target||jsonb_build_array(jsonb_build_object('sku',item->>'sku','product',left(item->>'product',500),'qty',(item->>'qty')::numeric));
  base:=base||jsonb_build_object(item->>'sku',public.crm_tasks_daily_qty_v4(legal,item->>'sku',(now() at time zone 'Europe/Minsk')::date));
 end loop;
 ready:=start_day>(now() at time zone 'Europe/Minsk')::date or exists(select 1 from public.crm_daily_sales_runs_v4 where branch='Витебск'
  and report_day=(now() at time zone 'Europe/Minsk')::date and source_message_at>=now()-interval '2 hours');
 insert into public.crm_task_contracts_v4(task_id,client_id,manager_name,branch,legal_key,route_id,route_day,week_start,control_at,approved_by,targets,baseline,baseline_ready)
 values(t.id,c.id,t.manager_name,'Витебск',legal,p_route,day,start_day,control,u.id,target,base,ready);
 insert into public.crm_task_events_v4(task_id,kind,actor_id,payload)values(t.id,'enrolled',u.id,jsonb_build_object('targets',target,'baseline_ready',ready,'route_id',p_route));
 return jsonb_build_object('enrolled',true,'baseline_ready',ready);
end $$;
revoke all on function public.crm_task_enroll_v4(uuid,uuid) from public,anon;
grant execute on function public.crm_task_enroll_v4(uuid,uuid) to authenticated;

-- Prevent every legacy UI (including the visit quick-close) from bypassing 1C.
-- SECURITY INVOKER distinguishes a user UPDATE from the internal verifier.
create function public.crm_task_close_guard_v4()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('postgres','service_role','supabase_admin') then return case when TG_OP='DELETE' then old else new end;end if;
 if exists(select 1 from public.crm_task_contracts_v4 where task_id=old.id) then
  if TG_OP='DELETE' then raise exception 'TASK_1C_CONTRACT_PROTECTED' using errcode='42501';end if;
  if (new.done,new.result_achieved,new.done_at,new.client_id,new.manager_name,new.ai_stock_items,new.due_date,new.review_status)
    is distinct from (old.done,old.result_achieved,old.done_at,old.client_id,old.manager_name,old.ai_stock_items,old.due_date,old.review_status)
  then raise exception 'TASK_CLOSED_ONLY_BY_1C' using errcode='42501';end if;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function public.crm_task_close_guard_v4() from public,anon,authenticated;
create trigger crm_task_close_guard_v4 before update or delete on public.tasks for each row execute function public.crm_task_close_guard_v4();

create table public.crm_shelf_scans_v4 (
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id),
 route_id uuid not null references public.route_plans(id),physical_point_id uuid,
 created_by uuid not null references public.users(id),manager_name text not null,
 transcript text not null default '',items jsonb not null,
 merchandising_note text not null default '',photo_paths jsonb not null default '[]',
 created_at timestamptz not null default now(),
 check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100)
);
create index crm_shelf_scans_client_v4 on public.crm_shelf_scans_v4(client_id,created_at desc);
create index crm_shelf_scans_route_v4 on public.crm_shelf_scans_v4(route_id,created_at desc);
create index crm_shelf_scans_actor_v4 on public.crm_shelf_scans_v4(created_by);
alter table public.crm_shelf_scans_v4 enable row level security;
revoke all on public.crm_shelf_scans_v4 from public,anon,authenticated;
grant select on public.crm_shelf_scans_v4 to authenticated;
grant all on public.crm_shelf_scans_v4 to service_role;
create policy crm_shelf_scans_read_v4 on public.crm_shelf_scans_v4 for select to authenticated
 using((select public.crm_tasks_access_v4(client_id,manager_name)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crm-shelf-v4','crm-shelf-v4',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id)do nothing;
create policy crm_shelf_photos_insert_v4 on storage.objects for insert to authenticated with check(
 bucket_id='crm-shelf-v4' and (storage.foldername(name))[1]=(select auth.uid())::text
 and public.crm_tasks_access_v4(((storage.foldername(name))[2])::uuid));
create policy crm_shelf_photos_select_v4 on storage.objects for select to authenticated using(
 bucket_id='crm-shelf-v4' and public.crm_tasks_access_v4(((storage.foldername(name))[2])::uuid));

create function public.crm_shelf_save_v4(p_client uuid,p_route uuid,p_items jsonb,p_transcript text default '',p_note text default '',p_photos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.route_plans;u public.users;item jsonb;seen text[]:='{}';path text;scan uuid;
begin
 select * into u from public.users where id=(select auth.uid());
 select * into r from public.route_plans where id=p_route and not coalesce(removed,false)
  and (client_id=p_client or p_client=any(linked_client_ids));
 if not found or not public.crm_tasks_access_v4(p_client,r.manager_name) then raise exception 'SHELF_SCOPE' using errcode='42501';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100
  or length(p_transcript)>10000 or length(p_note)>2000 or jsonb_typeof(p_photos)<>'array' or jsonb_array_length(p_photos)>6 then raise exception 'SHELF_INVALID';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if (item->>'sku')=any(seen) then raise exception 'SHELF_DUPLICATE_SKU';end if;
  seen:=array_append(seen,item->>'sku');
  if not exists(select 1 from public.price_list where sku=item->>'sku') then raise exception 'SHELF_UNKNOWN_SKU';end if;
  if (item->>'shelf_qty') is null or (item->>'shelf_qty')::numeric<0 or (item->>'shelf_qty')::numeric>100000
    or ((item->>'reserve_qty') is not null and ((item->>'reserve_qty')::numeric<0 or (item->>'reserve_qty')::numeric>100000)) then raise exception 'SHELF_QUANTITY';end if;
 end loop;
 for path in select jsonb_array_elements_text(p_photos) loop
  if not starts_with(path,u.id::text||'/'||p_client::text||'/') or not exists(select 1 from storage.objects where bucket_id='crm-shelf-v4' and name=path)
   then raise exception 'SHELF_PHOTO_SCOPE';end if;
 end loop;
 insert into public.crm_shelf_scans_v4(client_id,route_id,physical_point_id,created_by,manager_name,transcript,items,merchandising_note,photo_paths)
  values(p_client,p_route,r.physical_point_id,u.id,r.manager_name,p_transcript,p_items,p_note,p_photos) returning id into scan;
 return jsonb_build_object('saved',true,'id',scan);
end $$;
revoke all on function public.crm_shelf_save_v4(uuid,uuid,jsonb,text,text,jsonb) from public,anon;
grant execute on function public.crm_shelf_save_v4(uuid,uuid,jsonb,text,text,jsonb) to authenticated;

create function public.crm_task_report_v4(p_task uuid,p_fact text,p_reason text,p_next text,p_next_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tasks;uid uuid:=(select auth.uid());
begin
 select * into t from public.tasks where id=p_task for update;
 if not found or not public.crm_tasks_access_v4(t.client_id,t.manager_name) then raise exception 'TASK_REPORT_FORBIDDEN' using errcode='42501';end if;
 if length(btrim(p_fact))<3 or length(p_fact)>2000 or length(p_reason)>2000 or length(p_next)>1000 then raise exception 'TASK_REPORT_INVALID';end if;
 if nullif(btrim(p_next),'') is null or p_next_date is null then raise exception 'TASK_NEXT_STEP_REQUIRED';end if;
 update public.tasks set fact_result=p_fact,fail_reason=nullif(btrim(p_reason),''),next_action=p_next,next_contact_date=p_next_date where id=t.id;
 insert into public.crm_task_events_v4(task_id,kind,actor_id,payload)values(t.id,'manager_report',uid,jsonb_build_object('fact',p_fact,'reason',p_reason,'next',p_next,'next_date',p_next_date));
 return jsonb_build_object('saved',true,'closed',false);
end $$;
revoke all on function public.crm_task_report_v4(uuid,text,text,text,date) from public,anon;
grant execute on function public.crm_task_report_v4(uuid,text,text,text,date) to authenticated;

create function public.crm_task_review_v4(p_task uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.crm_task_contracts_v4;u public.users;
begin
 select * into u from public.users where id=(select auth.uid());
 select * into c from public.crm_task_contracts_v4 where task_id=p_task for update;
 if u.role<>'boss' or not public.crm_tasks_access_v4(c.client_id,c.manager_name) or now()<c.control_at or length(btrim(p_decision))<5 or length(p_decision)>2000 then raise exception 'TASK_REVIEW_FORBIDDEN' using errcode='42501';end if;
 update public.crm_task_contracts_v4 set review_at=now(),review_by=u.id,review_decision=p_decision where task_id=p_task;
 insert into public.crm_task_events_v4(task_id,kind,actor_id,payload)values(p_task,'meeting_decision',u.id,jsonb_build_object('decision',p_decision));
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.crm_task_review_v4(uuid,text) from public,anon;
grant execute on function public.crm_task_review_v4(uuid,text) to authenticated;

-- Exact local Friday cutoff; no daily/early failure notifications.
select cron.schedule('tasks-friday-review-v4','0 12 * * 5','select public.crm_tasks_reconcile_v4()');
