-- Recover a missing 1C baseline from the archived pre-approval snapshot,
-- and protect evidence-managed tasks when a visit is saved by any client.
CREATE OR REPLACE FUNCTION public.crm_tasks_reconcile_v4()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; item jsonb; rows jsonb; actual numeric; goal numeric; pct numeric; complete boolean;
 verified int:=0; checked int:=0; issue text; new_state text; d date; first_day date; last_day date; old_state text; cut_rows jsonb; cut_complete boolean; cut_issue boolean; cut_state text;
 baseline_run_id uuid; baseline_source_at timestamptz; recovered_baseline jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('crm_tasks_reconcile_v4'));
 for c in select * from public.crm_task_contracts_v4 where state<>'cancelled' order by approved_at for update loop
  old_state:=c.state; rows:='[]'; complete:=true; pct:=0; issue:=null;
  first_day:=greatest(c.week_start,(c.approved_at at time zone 'Europe/Minsk')::date);
  last_day:=least((now() at time zone 'Europe/Minsk')::date,coalesce((select min(greatest(n.week_start,(n.approved_at at time zone 'Europe/Minsk')::date))-1 from public.crm_task_contracts_v4 n where n.legal_key=c.legal_key and n.week_start>c.week_start and n.state<>'cancelled'),'infinity'::date));
  if not c.baseline_ready then
   -- The mail can arrive after approval. Only its original timestamp can establish the baseline.
   select s.id,s.source_message_at into baseline_run_id,baseline_source_at
   from public.crm_daily_sales_runs_v4 s
   where s.branch=c.branch and s.report_day=(c.approved_at at time zone 'Europe/Minsk')::date
     and s.source_message_at between c.approved_at-interval '2 hours' and c.approved_at
   order by s.source_message_at desc,s.received_at desc,s.id desc
   limit 1;

   if found then
    select jsonb_object_agg(i->>'sku',coalesce((
     select sum(r.qty) from public.crm_daily_sales_rows_v4 r
     where r.run_id=baseline_run_id and r.legal_key=c.legal_key and r.sku=i->>'sku'
    ),0))
    into recovered_baseline from jsonb_array_elements(c.targets) i;

    update public.crm_task_contracts_v4
    set baseline=recovered_baseline,baseline_ready=true where task_id=c.task_id;
    c.baseline:=recovered_baseline;
    c.baseline_ready:=true;
    insert into public.crm_task_events_v4(task_id,kind,payload)
    values(c.task_id,'baseline_recovered',jsonb_build_object(
     'run_id',baseline_run_id,'source_message_at',baseline_source_at,'baseline',recovered_baseline));
   else
    issue:='Не зафиксирован исходный дневной срез на момент утверждения';
   end if;
  end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.crm_v2264_save_visit(p_visit jsonb, p_route_plan_id text DEFAULT NULL::text, p_task_decisions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_name text;
  v_role text;
  v_input public.visits%rowtype;
  v_visit public.visits%rowtype;
  v_existing public.visits%rowtype;
  v_decision jsonb;
  v_task_id text;
  v_done boolean;
  v_reason text;
  v_new_date date;
  v_task_manager text;
  v_managed_task boolean;
  v_task_rows jsonb:='[]'::jsonb;
  v_updated_task jsonb;
  v_duplicate boolean:=false;
  v_route_linked text;
  v_route_manager text;
  v_route_date date;
  v_route_client uuid;
begin
  select u.name,u.role into v_name,v_role
  from public.users u
  where u.id::text=coalesce(v_uid::text,'') or lower(coalesce(u.email,''))=v_email
  order by case when u.id::text=coalesce(v_uid::text,'') then 0 else 1 end
  limit 1;

  if v_uid is null or v_role not in ('manager','boss') then
    raise exception 'Нет права сохранять визиты';
  end if;

  v_input:=jsonb_populate_record(null::public.visits,coalesce(p_visit,'{}'::jsonb));
  if v_role='manager' then
    v_input:=jsonb_populate_record(v_input,jsonb_build_object('manager_id',v_uid::text,'manager_name',v_name));
  elsif v_input.manager_id is null then
    v_input:=jsonb_populate_record(v_input,jsonb_build_object('manager_id',v_uid::text,'manager_name',coalesce(v_input.manager_name,v_name)));
  end if;
  if coalesce(p_route_plan_id,'')<>'' then
    v_input:=jsonb_populate_record(v_input,jsonb_build_object('route_plan_id',p_route_plan_id));
  end if;

  if v_role='manager' and v_input.client_id is not null and not exists(
    select 1
    from public.clients c
    where c.id::text=v_input.client_id::text
      and public.crm_v2264_norm(c.manager_name)=public.crm_v2264_norm(v_name)
  ) then
    raise exception 'Клиент не закреплён за текущим менеджером';
  end if;

  if v_input.date is null or coalesce(trim(v_input.text),'')='' or coalesce(trim(v_input.result),'')='' then
    raise exception 'Не заполнены дата, описание или результат визита';
  end if;

  /*
   * v23.6.8: route-level idempotency.
   * Mobile networks can lose the successful response after the transaction has
   * already committed. On retry the route point is therefore already linked.
   * If it is linked to the SAME manager/client/date visit, return that visit and
   * continue task processing instead of attempting a second INSERT.
   */
  if coalesce(v_input.route_plan_id::text,'')<>'' then
    select rp.linked_visit_id::text,rp.manager_name,rp.visit_date::date,rp.client_id
      into v_route_linked,v_route_manager,v_route_date,v_route_client
    from public.route_plans rp
    where rp.id::text=v_input.route_plan_id::text
      and coalesce(rp.removed,false)=false
    for update;

    if not found then
      raise exception 'Маршрутная точка % не найдена или удалена',v_input.route_plan_id;
    end if;

    if v_route_date<>v_input.date
       or public.crm_v2264_norm(v_route_manager)<>public.crm_v2264_norm(v_input.manager_name) then
      raise exception 'Визит не соответствует дате или менеджеру маршрутной точки';
    end if;

    if coalesce(v_route_linked,'')<>'' then
      select v.* into v_existing
      from public.visits v
      where v.id::text=v_route_linked
        and coalesce(v.is_duplicate,false)=false
      limit 1;

      if found
         and v_existing.date=v_input.date
         and public.crm_v2264_norm(v_existing.manager_name)=public.crm_v2264_norm(v_input.manager_name)
         and (v_input.client_id is null or v_existing.client_id=v_input.client_id)
         and coalesce(v_existing.route_plan_id,'')=coalesce(v_input.route_plan_id::text,'') then
        v_visit:=v_existing;
        v_duplicate:=true;

        -- A recorded visit is a visit. GPS quality remains a separate review flag.
        update public.route_plans
        set visited=true,
            linked_at=coalesce(linked_at,now()),
            link_status=coalesce(nullif(link_status,''),'verified_visit')
        where id::text=v_input.route_plan_id::text
          and linked_visit_id::text=v_existing.id::text;
      else
        raise exception 'Эта маршрутная точка уже закрыта другим визитом';
      end if;
    end if;
  end if;

  if v_visit.id is null then
    /*
     * Existing retry protection remains for off-route visits. For a route point,
     * route_plan_id itself is the idempotency key, so text/result may differ on a
     * retry without creating a duplicate.
     */
    select v.* into v_existing
    from public.visits v
    where coalesce(v.is_duplicate,false)=false
      and left(coalesce(v.date::text,v.created_at::text),10)=left(v_input.date::text,10)
      and public.crm_v2264_norm(v.manager_name)=public.crm_v2264_norm(v_input.manager_name)
      and coalesce(v.client_id::text,'')=coalesce(v_input.client_id::text,'')
      and (
        (coalesce(v_input.route_plan_id::text,'')<>'' and coalesce(v.route_plan_id::text,'')=coalesce(v_input.route_plan_id::text,''))
        or
        (coalesce(v_input.route_plan_id::text,'')='' and coalesce(v.route_plan_id::text,'')='' and coalesce(v.text,'')=coalesce(v_input.text,'') and coalesce(v.result,'')=coalesce(v_input.result,'') and v.created_at>=now()-interval '15 minutes')
      )
    order by v.created_at desc
    limit 1;

    if found then
      v_visit:=v_existing;
      v_duplicate:=true;
      if coalesce(v_visit.route_plan_id,'')<>'' then
        update public.route_plans
        set visited=true,
            linked_visit_id=v_visit.id::text,
            linked_at=coalesce(linked_at,now()),
            link_status=coalesce(nullif(link_status,''),'verified_visit')
        where id::text=v_visit.route_plan_id
          and (linked_visit_id is null or linked_visit_id::text=v_visit.id::text);
      end if;
    else
      insert into public.visits(
        client_id,date,text,result,manager_id,manager_name,route_plan_id,
        gps_lat,gps_lng,gps_accuracy,gps_distance,gps_status,
        contact_person,goal_achieved,agreements,manager_promise,client_promise,
        objections,order_received,order_amount
      ) values (
        v_input.client_id,v_input.date,v_input.text,v_input.result,v_input.manager_id,v_input.manager_name,v_input.route_plan_id,
        v_input.gps_lat,v_input.gps_lng,v_input.gps_accuracy,v_input.gps_distance,v_input.gps_status,
        v_input.contact_person,v_input.goal_achieved,v_input.agreements,v_input.manager_promise,v_input.client_promise,
        v_input.objections,v_input.order_received,v_input.order_amount
      ) returning * into v_visit;

      if v_visit.gps_lat is not null and v_visit.gps_lng is not null then
        insert into public.gps_points(manager_name,lat,lng,accuracy,source)
        values(v_visit.manager_name,v_visit.gps_lat,v_visit.gps_lng,v_visit.gps_accuracy,'visit_v2264');
      end if;
    end if;
  end if;

  if jsonb_typeof(coalesce(p_task_decisions,'[]'::jsonb))<>'array' then
    raise exception 'Некорректный список решений по задачам';
  end if;

  for v_decision in select value from jsonb_array_elements(coalesce(p_task_decisions,'[]'::jsonb))
  loop
    v_task_id:=nullif(v_decision->>'task_id','');
    v_done:=coalesce((v_decision->>'done')::boolean,false);
    v_reason:=trim(coalesce(v_decision->>'reason',''));
    v_new_date:=nullif(v_decision->>'new_date','')::date;
    if v_task_id is null then raise exception 'Не указан id задачи'; end if;

    select coalesce(nullif(trim(t.manager_name),''),c.manager_name),
           exists(select 1 from public.crm_task_contracts_v4 x where x.task_id=t.id)
           or exists(select 1 from public.crm_task_assignments_v5 a where a.task_id=t.id)
           or coalesce(v_done and t.source='must_list' and c.region='Витебск' and c.client_status='Рабочий',false)
      into v_task_manager,v_managed_task
    from public.tasks t
    left join public.clients c on c.id::text=t.client_id::text
    where t.id::text=v_task_id
    for update of t;

    if not found then raise exception 'Задача % не найдена',v_task_id; end if;
    if v_role='manager' and public.crm_v2264_norm(v_task_manager)<>public.crm_v2264_norm(v_name) then
      raise exception 'Нельзя изменить чужую задачу %',v_task_id;
    end if;

    -- Old online and offline forms may still submit manual decisions with the visit.
    -- A linked sales contract or prospect stage is changed only by its own workflow.
    if v_managed_task then continue; end if;

    if v_done then
      update public.tasks
      set done=true,done_at=coalesce(done_at,now()),closed_by=coalesce(closed_by,v_name),
          done_comment=coalesce(done_comment,'Выполнено во время визита'),
          result_achieved=coalesce(result_achieved,'yes')
      where id::text=v_task_id;
      select to_jsonb(t) into v_updated_task from public.tasks t where t.id::text=v_task_id;
    else
      if v_reason='' or v_new_date is null then
        raise exception 'Для невыполненной задачи % нужны причина и новая дата',v_task_id;
      end if;
      -- Retry-safe: do not append the same visit failure note repeatedly.
      update public.tasks
      set text=case
            when coalesce(text,'') like '%❌ Не выполнено ('||left(v_visit.date::text,10)||'):%'
              then text
            else coalesce(text,'')||' | ❌ Не выполнено ('||left(v_visit.date::text,10)||'): '||v_reason||' → предложен перенос на '||v_new_date::text
          end,
          due_date=v_new_date,review_status='pending'
      where id::text=v_task_id;
      select to_jsonb(t) into v_updated_task from public.tasks t where t.id::text=v_task_id;
    end if;
    v_task_rows:=v_task_rows||jsonb_build_array(v_updated_task);
  end loop;

  return jsonb_build_object(
    'visit',to_jsonb(v_visit),
    'tasks',v_task_rows,
    'route_plan_id',v_visit.route_plan_id,
    'duplicate',v_duplicate,
    'idempotent_retry',v_duplicate
  );
end;
$function$;
