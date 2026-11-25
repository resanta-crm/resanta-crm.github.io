-- Record what happened during a visit separately from verified shipment quantities.
create unique index crm_task_events_visit_sku_once_v1
on public.crm_task_events_v4 (task_id, (payload->>'visit_id'))
where kind='visit_sku_results';

create function public.crm_visit_record_sku_results_v1(
  p_visit public.visits, p_task uuid, p_items jsonb, p_actor uuid
) returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  plan public.crm_task_contracts_v4;
  item jsonb;
  target jsonb;
  sku text;
  result text;
  reason text;
  note text;
  next_date date;
  submitted text[]:='{}';
  items jsonb:='[]';
  previous_items jsonb;
begin
  select * into plan from public.crm_task_contracts_v4 where task_id=p_task;
  if not found or plan.state='cancelled' or plan.client_id is distinct from p_visit.client_id
    or plan.week_start is distinct from date_trunc('week',p_visit.date)::date
    or public.crm_v2264_norm(plan.manager_name) is distinct from public.crm_v2264_norm(p_visit.manager_name)
    or not public.crm_tasks_access_v4(plan.client_id,plan.manager_name) then
    raise exception 'Задача по артикулам больше не относится к этому визиту. Обновите CRM.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Укажите итоги по утверждённым артикулам.';
  end if;
  if jsonb_array_length(p_items)<>jsonb_array_length(plan.targets) then
    raise exception 'Укажите итог по каждому утверждённому артикулу.';
  end if;

  for item in select value from jsonb_array_elements(p_items) order by value->>'sku'
  loop
    sku:=item->>'sku';
    select p.value into target from jsonb_array_elements(plan.targets) p where p.value->>'sku'=sku;
    if not found or sku=any(submitted) then
      raise exception 'Список утверждённых артикулов изменился. Обновите CRM.';
    end if;
    submitted:=array_append(submitted,sku);
    result:=item->>'result';
    reason:=nullif(btrim(item->>'reason'),'');
    note:=nullif(btrim(item->>'comment'),'');
    next_date:=null;

    if result is null or result not in ('sent_to_1c','refused','follow_up') then
      raise exception 'Выберите итог по артикулу %.',sku;
    end if;
    if result='refused' and (reason is null or length(reason)>500) then
      raise exception 'Укажите причину отказа по артикулу % (до 500 знаков).',sku;
    end if;
    if result='follow_up' then
      if coalesce(item->>'next_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Укажите дату следующего контакта по артикулу %.',sku;
      end if;
      next_date:=(item->>'next_date')::date;
      if next_date<p_visit.date then
        raise exception 'Дата следующего контакта по артикулу % не может быть раньше визита.',sku;
      end if;
    end if;
    if length(note)>500 then
      raise exception 'Комментарий по артикулу % должен быть до 500 знаков.',sku;
    end if;

    items:=items||jsonb_build_array(jsonb_build_object(
      'sku',sku,'product',target->>'product','plan',target->'qty','result',result,
      'reason',case when result='refused' then reason end,'next_date',next_date,'comment',note
    ));
  end loop;

  insert into public.crm_task_events_v4 (task_id,kind,actor_id,payload)
  values(p_task,'visit_sku_results',p_actor,jsonb_build_object(
    'visit_id',p_visit.id,'visit_date',p_visit.date,'manager_name',p_visit.manager_name,'items',items
  ))
  on conflict (task_id,(payload->>'visit_id')) where kind='visit_sku_results' do nothing;

  if not found then
    select payload->'items' into previous_items from public.crm_task_events_v4
    where task_id=p_task and kind='visit_sku_results' and payload->>'visit_id'=p_visit.id::text;
    if previous_items is distinct from items then
      raise exception 'По этому визиту уже сохранены другие итоги по артикулам.';
    end if;
  end if;
end;
$$;
revoke all on function public.crm_visit_record_sku_results_v1(public.visits,uuid,jsonb,uuid) from public,anon,authenticated;

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
    if v_decision ? 'sku_outcomes' then
      perform public.crm_visit_record_sku_results_v1(v_visit,(v_decision->>'task_id')::uuid,v_decision->'sku_outcomes',v_uid);
      continue;
    end if;
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

CREATE OR REPLACE FUNCTION public.crm_offline_save_visit_v1(p_request_id uuid, p_visit jsonb, p_task_decisions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  manager text;
  route public.route_plans%rowtype;
  task public.tasks%rowtype;
  receipt crm_offline_private.visit_receipts%rowtype;
  input public.visits%rowtype;
  decision jsonb;
  payload_hash bytea;
  saved jsonb;
  saved_visit_id uuid;
begin
  select u.name into manager
  from public.users u
  where u.id = actor
    and u.access_scope = 'standard'
    and (u.role = 'manager' or
      (u.role = 'boss' and u.id = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc'));
  if manager is null then
    raise exception using errcode = '42501', message = 'OFFLINE_ACCESS_DENIED';
  end if;
  if p_request_id is null
    or jsonb_typeof(p_visit) is distinct from 'object'
    or jsonb_typeof(p_task_decisions) is distinct from 'array'
    or pg_column_size(p_visit) + pg_column_size(p_task_decisions) > 100000 then
    raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
  end if;

  payload_hash := sha256(convert_to(jsonb_build_array(p_visit,p_task_decisions)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_id::text, 0));
  select * into receipt from crm_offline_private.visit_receipts
  where owner_id = actor and request_id = p_request_id;
  if found then
    if receipt.payload_hash is distinct from payload_hash then raise exception 'OFFLINE_REQUEST_CHANGED'; end if;
    return jsonb_build_object('visit_id',receipt.visit_id,'replayed',true);
  end if;

  input := jsonb_populate_record(null::public.visits, p_visit);
  if input.client_id is null or input.date is null or nullif(trim(input.route_plan_id),'') is null
    or not coalesce(length(trim(input.text)) between 1 and 4000, false)
    or not coalesce(input.result in ('✅ Заказ','🤝 Переговоры','❌ Не застал','📦 Мерчендайзинг',
      '📚 Обучение','💬 Работа с ЛПР','📞 Звонок'), false)
    or (input.gps_lat is null) <> (input.gps_lng is null)
    or input.gps_lat not between -90 and 90 or input.gps_lng not between -180 and 180
    or input.gps_accuracy < 0 then
    raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
  end if;
  select * into route from public.route_plans
  where id = input.route_plan_id::uuid
  for update;
  if not found or coalesce(route.removed,false) or route.review_status in ('pending','rejected')
    or route.visit_date is distinct from input.date or route.client_id is distinct from input.client_id
    or route.manager_name is distinct from manager then
    raise exception 'OFFLINE_ROUTE_CHANGED';
  end if;
  if coalesce(route.visited,false) or route.linked_visit_id is not null
    or exists(select 1 from public.visits
      where route_plan_id=input.route_plan_id and not coalesce(is_duplicate,false)) then
    raise exception 'OFFLINE_ROUTE_CLOSED';
  end if;

  -- Lock all submitted tasks in stable order and reject a stale decision.
  for decision in select value from jsonb_array_elements(p_task_decisions) order by value->>'task_id'
  loop
    -- The common visit RPC validates the contract and records the outcome.
    -- 1C can confirm shipment while the offline visit is waiting to sync.
    if decision ? 'sku_outcomes' then
      continue;
    end if;
    if jsonb_typeof(decision->'done') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
    end if;
    select * into task from public.tasks
    where id = (decision->>'task_id')::uuid
    for update;
    if not found or task.client_id is distinct from input.client_id or coalesce(task.done,false)
      or coalesce(nullif(trim(task.manager_name),''), manager) is distinct from manager
      or task.due_date is distinct from (decision->>'expected_due_date')::date
      or task.review_status is distinct from (decision->>'expected_review_status')
      or task.review_status in ('pending','stale_review','rejected','cancelled','superseded') then
      raise exception 'OFFLINE_TASK_CHANGED';
    end if;
  end loop;
  if (select count(distinct value->>'task_id') from jsonb_array_elements(p_task_decisions)) <> jsonb_array_length(p_task_decisions) then
    raise exception using errcode = '22023', message = 'OFFLINE_INVALID_INPUT';
  end if;

  saved := public.crm_v2264_save_visit(jsonb_build_object(
    'client_id',input.client_id, 'route_plan_id',route.id, 'date',input.date,
    'manager_id',actor, 'manager_name',manager, 'text',trim(input.text), 'result',input.result,
    'gps_lat',input.gps_lat, 'gps_lng',input.gps_lng, 'gps_accuracy',input.gps_accuracy
  ),route.id::text,p_task_decisions);
  saved_visit_id := (saved->'visit'->>'id')::uuid;
  if saved_visit_id is null or coalesce((saved->>'duplicate')::boolean,false) then
    raise exception 'OFFLINE_ROUTE_CLOSED';
  end if;
  insert into crm_offline_private.visit_receipts(owner_id,request_id,payload_hash,visit_id)
  values(actor,p_request_id,payload_hash,saved_visit_id);
  return jsonb_build_object('visit_id',saved_visit_id,'replayed',false);
end;
$function$;
