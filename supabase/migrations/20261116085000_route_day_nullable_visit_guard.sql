create or replace function public.crm_route_day_v1(p_action text,p_manager text,p_date date,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); actor text; before_json jsonb; after_json jsonb; rev text; payload jsonb; item jsonb; v public.route_plans%rowtype; oldrow public.route_plans%rowtype; keep uuid[]:='{}'; rid uuid; req uuid; target date; result jsonb; n int; seen text[]:='{}'; pointkey text;
begin
 select name into actor from public.users where id=uid and role='boss' and email=public.current_user_email();
 if actor is null then raise exception 'ROUTE_FORBIDDEN' using errcode='42501';end if;
 if p_manager not in ('Ачинович','Руднев','Шкуран') or p_date is null then raise exception 'ROUTE_SCOPE';end if;
 if p_action not in ('read','save','move') then raise exception 'ROUTE_ACTION';end if;
 perform pg_advisory_xact_lock(hashtextextended('route-day:'||p_manager,0));
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into before_json from public.route_plans r where manager_name=p_manager and visit_date=p_date;
 rev:=md5(before_json::text);
 if p_action='read' then return jsonb_build_object('rows',before_json,'revision',rev);end if;
 if p_date<(now() at time zone 'Europe/Minsk')::date then raise exception 'ROUTE_PAST_READ_ONLY';end if;
 req:=(p_data->>'request_id')::uuid;if req is null then raise exception 'ROUTE_REQUEST_REQUIRED';end if;
 select c.result into result from public.crm_route_changes_v1 c where c.request_id=req and c.actor_id=uid and c.manager_name=p_manager and c.route_date=p_date and c.action=p_action;
 if found then return result;end if;
 if p_data->>'revision' is distinct from rev then raise exception 'ROUTE_CHANGED_RELOAD';end if;
 if p_action='move' then
  target:=(p_data->>'target_date')::date;
  if target is null or target=p_date or target<(now() at time zone 'Europe/Minsk')::date then raise exception 'ROUTE_TARGET_DATE';end if;
  if exists(select 1 from public.route_plans where manager_name=p_manager and visit_date=target and not coalesce(removed,false)) then raise exception 'ROUTE_TARGET_OCCUPIED';end if;
  if exists(select 1 from public.route_plans where manager_name=p_manager and visit_date=p_date and not coalesce(removed,false) and (coalesce(visited,false) or linked_visit_id is not null or link_status='verified_visit')) then raise exception 'ROUTE_VISITED_DAY_PROTECTED';end if;
  update public.route_plans set visit_date=target,generated_month=to_char(target,'YYYY-MM'),rescheduled_from=p_date,rescheduled_at=now(),rescheduled_by=actor where manager_name=p_manager and visit_date=p_date and not coalesce(removed,false);
  get diagnostics n=row_count;if n=0 then raise exception 'ROUTE_EMPTY';end if;
 else
  payload:=p_data->'rows';if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload)>15 then raise exception 'ROUTE_LIMIT';end if;
  if exists(select 1 from jsonb_array_elements(payload) x where (x->>'is_office_day')::boolean) and jsonb_array_length(payload)<>1 then raise exception 'ROUTE_OFFICE_MIXED';end if;
  for item in select * from jsonb_array_elements(payload) loop
   v:=jsonb_populate_record(null::public.route_plans,item);
   if coalesce(v.is_office_day,false) then pointkey:='office';
   elsif coalesce(v.is_network_point,false) then
    if not exists(select 1 from public.route_network_points where id=v.network_point_id and active is distinct from false and manager_name=p_manager) then raise exception 'ROUTE_NETWORK_INVALID';end if;
    pointkey:='network:'||v.network_point_id;
   else
    if not exists(select 1 from public.clients where id=v.client_id and not coalesce(is_archived,false) and client_status in ('Рабочий','Потенциальный')) then raise exception 'ROUTE_CLIENT_INVALID';end if;
    pointkey:=coalesce(v.physical_point_id::text,v.client_id::text||'|'||coalesce(v.address,''));
   end if;
   if pointkey=any(seen) then raise exception 'ROUTE_DUPLICATE_POINT';end if;seen:=array_append(seen,pointkey);
   select r.* into oldrow from public.route_plans r where r.manager_name=p_manager and r.visit_date=p_date and
    (case when coalesce(v.is_office_day,false) then coalesce(r.is_office_day,false)
     when coalesce(v.is_network_point,false) then r.network_point_id=v.network_point_id and coalesce(r.is_network_point,false)
     else not coalesce(r.is_office_day,false) and not coalesce(r.is_network_point,false) and
       ((v.physical_point_id is not null and r.physical_point_id=v.physical_point_id) or (r.client_id=v.client_id and coalesce(r.address,'')=coalesce(v.address,''))) end)
    order by coalesce(r.removed,false),r.created_at,r.id limit 1;
   if found then
    rid:=oldrow.id;
    if not (coalesce(oldrow.visited,false) or oldrow.linked_visit_id is not null or coalesce(oldrow.link_status='verified_visit',false)) then
     update public.route_plans set client_id=v.client_id,client_name=v.client_name,city=v.city,region=v.region,address=v.address,category=v.category,sort_order=v.sort_order,planned_minutes=v.planned_minutes,planned_start=v.planned_start,planned_end=v.planned_end,is_office_day=v.is_office_day,physical_point_id=v.physical_point_id,physical_point_key=v.physical_point_key,linked_client_ids=v.linked_client_ids,linked_client_names=v.linked_client_names,route_lat=v.route_lat,route_lng=v.route_lng,route_zone=v.route_zone,is_network_point=v.is_network_point,network_point_id=v.network_point_id,network_name=v.network_name,network_category=v.network_category,approved=true,review_status='approved',removed=false,approved_by=actor,approved_at=now(),source='boss_atomic_day_v1',route_version='atomic-v1' where id=rid;
    end if;
   else
    insert into public.route_plans (client_id,client_name,city,region,address,category,sort_order,planned_minutes,planned_start,planned_end,is_office_day,physical_point_id,physical_point_key,linked_client_ids,linked_client_names,route_lat,route_lng,route_zone,is_network_point,network_point_id,network_name,network_category,manager_name,visit_date,generated_month,approved,review_status,removed,approved_by,approved_at,source,route_version,visited)
    values(v.client_id,v.client_name,v.city,v.region,v.address,v.category,v.sort_order,v.planned_minutes,v.planned_start,v.planned_end,v.is_office_day,v.physical_point_id,v.physical_point_key,v.linked_client_ids,v.linked_client_names,v.route_lat,v.route_lng,v.route_zone,v.is_network_point,v.network_point_id,v.network_name,v.network_category,p_manager,p_date,to_char(p_date,'YYYY-MM'),true,'approved',false,actor,now(),'boss_atomic_day_v1','atomic-v1',false) returning id into rid;
   end if;
   keep:=array_append(keep,rid);
  end loop;
  update public.route_plans set removed=true,approved=false,review_status='superseded',source='superseded_atomic_day_v1'
   where manager_name=p_manager and visit_date=p_date and not coalesce(removed,false) and not(id=any(keep)) and not coalesce(visited,false) and linked_visit_id is null and link_status is distinct from 'verified_visit';
  if (select count(*) from public.route_plans where manager_name=p_manager and visit_date=p_date and not coalesce(removed,false))>15 then raise exception 'ROUTE_LIMIT';end if;
  if exists(select 1 from public.route_plans where manager_name=p_manager and visit_date=p_date and not coalesce(removed,false) and is_office_day) and (select count(*) from public.route_plans where manager_name=p_manager and visit_date=p_date and not coalesce(removed,false))>1 then raise exception 'ROUTE_VISITED_DAY_PROTECTED';end if;
  target:=p_date;
 end if;
 insert into public.route_month_workflow(manager_name,route_month,status,office_weekday,max_points_day,updated_at,approved_by,approved_at,boss_comment)
 values(p_manager,to_char(target,'YYYY-MM'),'approved',1,15,now(),actor,now(),'Маршрут сохранён руководителем одной операцией.')
 on conflict(manager_name,route_month) do update set status='approved',updated_at=now(),approved_by=actor,approved_at=now();
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into after_json from public.route_plans r where manager_name=p_manager and visit_date in(p_date,target);
 result:=jsonb_build_object('ok',true,'date',target,'rows',after_json,'count',(select count(*) from public.route_plans where manager_name=p_manager and visit_date=target and not coalesce(removed,false)));
 insert into public.crm_route_changes_v1(request_id,actor_id,manager_name,route_date,action,before_rows,after_rows,result) values(req,uid,p_manager,p_date,p_action,before_json,after_json,result);
 return result;
end $$;
revoke all on function public.crm_route_day_v1(text,text,date,jsonb) from public,anon;
grant execute on function public.crm_route_day_v1(text,text,date,jsonb) to authenticated;
