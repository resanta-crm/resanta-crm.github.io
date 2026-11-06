-- Reactivate only the selected physical store; preserve other removed stops.
CREATE OR REPLACE FUNCTION public.crm_manager_add_route_stop_v3(p_client_id uuid, p_visit_date date, p_reason text, p_point_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text;
  v_actor_name text;
  v_actor_role text;
  v_client public.clients%rowtype;
  v_route public.route_plans%rowtype;
  v_removed public.route_plans%rowtype;
  v_point_id uuid;
  v_point_key text;
  v_point_region text;
  v_point_city text;
  v_point_address text;
  v_point_lat double precision;
  v_point_lng double precision;
  v_reason text;
  v_today date;
  v_sort integer;
  v_count integer;
  v_action text := 'inserted';
begin
  select lower(a.email),u.name,u.role into v_email,v_actor_name,v_actor_role
  from public.users u join auth.users a on a.id=u.id
  where u.id=auth.uid() and lower(u.email)=lower(a.email) and a.email_confirmed_at is not null;
  if auth.uid() is null then raise exception 'Нет доступа' using errcode='42501';end if;
  if v_actor_name is null then
    raise exception 'Профиль пользователя не найден в таблице users.';
  end if;
  if public.crm_v2270_norm(v_actor_role)<>'manager' then
    raise exception 'Добавлять клиентов в маршрут может только менеджер.';
  end if;
  if public.crm_v2270_norm(v_actor_name) not in ('руднев','ачинович','шкуран') then
    raise exception 'Добавление разрешено только полевым менеджерам.';
  end if;

  v_today := timezone('Europe/Minsk',now())::date;
  if p_visit_date is null or p_visit_date<v_today then
    raise exception 'Клиента можно добавить только на сегодня или будущую дату.';
  end if;

  v_reason := trim(coalesce(p_reason,''));
  if char_length(v_reason)<3 then
    raise exception 'Укажите причину добавления клиента.';
  end if;
  if char_length(v_reason)>300 then
    raise exception 'Причина не должна превышать 300 символов.';
  end if;

  select * into v_client
  from public.clients c
  where c.id=p_client_id;

  if not found then
    raise exception 'Карточка клиента не найдена.';
  end if;
  if public.crm_v2270_norm(v_client.manager_name)<>public.crm_v2270_norm(v_actor_name) then
    raise exception 'Нельзя добавить клиента другого менеджера.';
  end if;
  if coalesce(v_client.is_archived,false) or coalesce(v_client.to_delete,false) then raise exception 'Клиент закрыт';end if;
  if public.crm_v2270_norm(v_client.client_status) not in ('рабочий','потенциальный') then
    raise exception 'Можно добавить только рабочего или потенциального клиента.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor_name||p_visit_date::text,0));

  -- Require an explicit store when physical stores exist. Never choose LIMIT 1.
  if p_point_id is null and exists(select 1 from public.route_physical_point_clients pc
    join public.route_physical_points p on p.id=pc.point_id and coalesce(p.active,true)
    where pc.client_id=p_client_id) then
    raise exception 'Выберите точный адрес торговой точки';
  end if;
  if p_point_id is not null then
    select p.id,p.point_key,p.region,p.city,p.address,p.lat,p.lng
      into v_point_id,v_point_key,v_point_region,v_point_city,v_point_address,v_point_lat,v_point_lng
    from public.route_physical_points p
    where p.id=p_point_id and coalesce(p.active,true) and exists(
      select 1 from public.route_physical_point_clients pc join public.clients c on c.id=pc.client_id
      where pc.point_id=p.id and c.manager_name=v_actor_name and not coalesce(c.is_archived,false)
      and (c.id=p_client_id or exists(select 1 from public.client360_entity_clients_v1 a
       join public.client360_entity_clients_v1 b on b.entity_id=a.entity_id
       where a.client_id=p_client_id and b.client_id=c.id)));
    if v_point_id is null then raise exception 'ТТ не принадлежит вашему клиенту' using errcode='42501';end if;
  end if;
  if exists(select 1 from public.route_plans r
   where r.manager_name=v_actor_name and r.visit_date=p_visit_date and not coalesce(r.removed,false)
   and ((p_point_id is not null and r.physical_point_id=p_point_id)
    or ((r.client_id=p_client_id or p_client_id=any(coalesce(r.linked_client_ids,'{}'::uuid[]))
     or exists(select 1 from public.client360_entity_clients_v1 a
      join public.client360_entity_clients_v1 b on b.entity_id=a.entity_id
      where a.client_id=p_client_id and b.client_id=r.client_id))
     and lower(btrim(coalesce(r.city,'')))=lower(btrim(coalesce(v_point_city,v_client.city,'')))
     and lower(btrim(coalesce(r.address,'')))=lower(btrim(coalesce(v_point_address,v_client.address,'')))))) then
    raise exception 'Эта торговая точка уже есть в маршруте на выбранную дату';
  end if;

  select coalesce(max(coalesce(r.sort_order,0)),0)+1
    into v_sort
  from public.route_plans r
  where public.crm_v2270_norm(r.manager_name)=public.crm_v2270_norm(v_actor_name)
    and left(r.visit_date::text,10)::date=p_visit_date
    and coalesce(r.removed,false)=false;

  -- Если раньше такая строка была убрана, не создаём дубль: возвращаем её в работу.
  select * into v_removed
  from public.route_plans r
  where public.crm_v2270_norm(r.manager_name)=public.crm_v2270_norm(v_actor_name)
    and left(r.visit_date::text,10)::date=p_visit_date
    and coalesce(r.removed,false)=true
    and (
      (p_point_id is not null and r.physical_point_id=p_point_id)
      or (p_point_id is null and r.physical_point_id is null
        and r.client_id=p_client_id
        and lower(btrim(coalesce(r.city,'')))=lower(btrim(coalesce(v_client.city,'')))
        and lower(btrim(coalesce(r.address,'')))=lower(btrim(coalesce(v_client.address,''))))
    )
  order by r.id
  limit 1;

  if found then
    update public.route_plans r
    set
      client_id=p_client_id,
      client_name=v_client.name,
      manager_name=v_actor_name,
      visit_date=p_visit_date,
      region=coalesce(nullif(v_point_region,''),nullif(v_client.region,''),r.region),
      city=coalesce(nullif(v_point_city,''),nullif(v_client.city,''),r.city),
      address=coalesce(nullif(v_point_address,''),nullif(v_client.address,''),r.address),
      category=coalesce(nullif(v_client.role_type,''),r.category,'C'),
      physical_point_id=coalesce(v_point_id,r.physical_point_id),
      physical_point_key=coalesce(v_point_key,r.physical_point_key),
      route_lat=v_point_lat,
      route_lng=v_point_lng,
      linked_client_ids=array[p_client_id]::uuid[],
      linked_client_names=array[v_client.name]::text[],
      sort_order=v_sort,
      generated_month=to_char(p_visit_date,'YYYY-MM'),
      source='manager_added',
      approved=true,
      review_status='approved',
      removed=false,
      manager_suggested=true,
      manager_added=true,
      manager_add_reason=v_reason,
      manager_added_at=now(),
      manager_added_by=v_actor_name
    where r.id=v_removed.id
    returning r.* into v_route;
    v_action := 'reactivated';
  else
    insert into public.route_plans(
      client_id,manager_name,visit_date,client_name,region,city,address,category,
      physical_point_id,physical_point_key,route_lat,route_lng,
      linked_client_ids,linked_client_names,sort_order,generated_month,
      source,approved,review_status,removed,manager_suggested,
      manager_added,manager_add_reason,manager_added_at,manager_added_by
    ) values (
      p_client_id,v_actor_name,p_visit_date,v_client.name,
      coalesce(nullif(v_point_region,''),v_client.region),
      coalesce(nullif(v_point_city,''),v_client.city),
      coalesce(nullif(v_point_address,''),v_client.address),
      coalesce(nullif(v_client.role_type,''),'C'),
      v_point_id,v_point_key,
      v_point_lat,
      v_point_lng,
      array[p_client_id]::uuid[],array[v_client.name]::text[],v_sort,to_char(p_visit_date,'YYYY-MM'),
      'manager_added',true,'approved',false,true,
      true,v_reason,now(),v_actor_name
    )
    returning * into v_route;
  end if;

  select count(*) into v_count
  from public.route_plans r
  where public.crm_v2270_norm(r.manager_name)=public.crm_v2270_norm(v_actor_name)
    and left(r.visit_date::text,10)::date=p_visit_date
    and coalesce(r.removed,false)=false;

  insert into public.crm_v2270_manager_route_add_audit(
    actor_email,actor_name,client_id,client_name,visit_date,
    route_plan_id,action_taken,reason,day_points_after
  ) values (
    v_email,v_actor_name,p_client_id,v_client.name,p_visit_date,
    v_route.id::text,v_action,v_reason,v_count
  );

  return jsonb_build_object(
    'action',v_action,
    'row',to_jsonb(v_route),
    'day_points_after',v_count
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.crm_manager_add_route_stop_v3(uuid,date,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_manager_add_route_stop_v3(uuid,date,text,uuid) TO authenticated;
