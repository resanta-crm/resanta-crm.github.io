-- CLIENT360 v1, 2026-11-02. Non-destructive legal grouping, physical store routes, LPR integration.
-- Records/mappings are initially empty. No user clients, visits, sales or GPS samples are moved.
-- This file mirrors the SQL already deployed through Supabase migrations.

create table if not exists public.client360_entities_v1 (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 3 and 160),created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index if not exists client360_entity_name_idx_v1 on public.client360_entities_v1(lower(trim(name)));
create table if not exists public.client360_entity_clients_v1 (
 client_id uuid primary key references public.clients(id) on delete cascade,entity_id uuid not null references public.client360_entities_v1(id) on delete cascade,
 linked_by uuid references auth.users(id),linked_at timestamptz not null default now());
create index if not exists client360_entity_member_idx_v1 on public.client360_entity_clients_v1(entity_id);
create table if not exists public.client360_point_requests_v1 (
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id),city text not null check(length(trim(city)) between 2 and 100),
 address text not null check(length(trim(address)) between 5 and 220),manager_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,created_point_id uuid references public.route_physical_points(id),comment text);
create index if not exists client360_requests_status_v1 on public.client360_point_requests_v1(status,created_at desc);
create index if not exists client360_entities_created_by_idx on public.client360_entities_v1(created_by);
create index if not exists client360_entity_clients_linked_by_idx on public.client360_entity_clients_v1(linked_by);
create index if not exists client360_requests_client_idx on public.client360_point_requests_v1(client_id);
create index if not exists client360_requests_manager_idx on public.client360_point_requests_v1(manager_id);
create index if not exists client360_requests_reviewer_idx on public.client360_point_requests_v1(reviewed_by);
create index if not exists client360_requests_point_idx on public.client360_point_requests_v1(created_point_id);
alter table public.client360_entities_v1 enable row level security;
alter table public.client360_entity_clients_v1 enable row level security;
alter table public.client360_point_requests_v1 enable row level security;
revoke all on public.client360_entities_v1,public.client360_entity_clients_v1,public.client360_point_requests_v1 from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.client360_points_for_client_v1(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text;v_role text;v_c public.clients%rowtype;v_eid uuid;v_out jsonb;
begin
 select u.name,u.role into v_name,v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_name is null or v_role not in ('boss','manager') then raise exception 'Нет доступа' using errcode='42501';end if;
 select * into v_c from public.clients where id=p_client_id and coalesce(is_archived,false)=false;
 if v_c.id is null then raise exception 'Клиент не найден';end if;
 if v_role='manager' and lower(trim(v_c.manager_name))<>lower(trim(v_name)) then raise exception 'Нет доступа к клиенту' using errcode='42501';end if;
 select entity_id into v_eid from public.client360_entity_clients_v1 where client_id=p_client_id;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.city,x.address),'[]'::jsonb) into v_out from (
 select distinct on (p.id) p.id,p.city,p.address,p.lat,p.lng,p.geocode_status,c.id route_client_id,c.name client_name
 from public.route_physical_points p join public.route_physical_point_clients l on l.point_id=p.id
 join public.clients c on c.id=l.client_id
 where coalesce(p.active,true) and coalesce(c.is_archived,false)=false
 and (c.id=p_client_id or (v_eid is not null and exists(
   select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=v_eid and ec.client_id=c.id)))
 and (v_role='boss' or lower(trim(c.manager_name))=lower(trim(v_name)))
 order by p.id,(c.id=p_client_id) desc
 ) x;
 return jsonb_build_object('ok',true,'client_id',p_client_id,'entity_id',v_eid,'points',v_out);
end $function$


CREATE OR REPLACE FUNCTION public.client360_catalog_v1(p_query text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_out jsonb;
begin
 select u.role into v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_role is distinct from 'boss' then raise exception 'Только руководителю' using errcode='42501';end if;
 if length(coalesce(p_query,''))>120 then raise exception 'Слишком длинный запрос';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_out from (
 select c.id,c.name,c.city,c.address,c.manager_name,c.code,ec.entity_id,e.name legal_name
 from public.clients c left join public.client360_entity_clients_v1 ec on ec.client_id=c.id
 left join public.client360_entities_v1 e on e.id=ec.entity_id
 where coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false
 and (trim(coalesce(p_query,''))='' or c.name ilike '%'||trim(p_query)||'%' or c.address ilike '%'||trim(p_query)||'%')
 order by c.name limit 150
 ) x;
 return jsonb_build_object('ok',true,'clients',v_out,'entities',
 (select coalesce(jsonb_agg(to_jsonb(z) order by z.name),'[]'::jsonb)
  from (select id,name from public.client360_entities_v1 order by name limit 200) z));
end $function$


CREATE OR REPLACE FUNCTION public.client360_group_clients_v1(p_name text, p_client_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text;v_role text;v_entity uuid;v_count int;
begin
 select lower(a.email),u.role into v_email,v_role from auth.users a join public.users u on u.id=a.id and lower(a.email)=lower(u.email)
 where a.id=auth.uid() and a.email_confirmed_at is not null;
 if v_email not in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') or v_role<>'boss' then
  raise exception 'Согласование связей только ДФС/ДФ' using errcode='42501';end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 160 then raise exception 'Название 3–160 символов';end if;
 if coalesce(cardinality(p_client_ids),0) not between 2 and 30 then raise exception 'Выберите 2–30 карточек';end if;
 select count(distinct id) into v_count from unnest(p_client_ids) t(id);
 if v_count<>cardinality(p_client_ids) then raise exception 'Повторение карточки';end if;
 if (select count(*) from public.clients c where c.id=any(p_client_ids) and coalesce(c.is_archived,false)=false and coalesce(c.to_delete,false)=false)<>v_count then raise exception 'Карточка не найдена';end if;
 select id into v_entity from public.client360_entities_v1 where lower(trim(name))=lower(trim(p_name));
 if exists(select 1 from public.client360_entity_clients_v1 ec where ec.client_id=any(p_client_ids) and ec.entity_id is distinct from v_entity)
 then raise exception 'Карточка уже относится к другому юрлицу';end if;
 if v_entity is null then
  insert into public.client360_entities_v1(name,created_by) values(trim(p_name),auth.uid()) returning id into v_entity;
 end if;
 insert into public.client360_entity_clients_v1(client_id,entity_id,linked_by)
 select id,v_entity,auth.uid() from unnest(p_client_ids) t(id)
 on conflict (client_id) do nothing;
 return jsonb_build_object('ok',true,'entity_id',v_entity,'linked_cards',
   (select count(*) from public.client360_entity_clients_v1 where entity_id=v_entity));
end $function$


CREATE OR REPLACE FUNCTION public.client360_create_route_v1(p_client_id uuid, p_point_id uuid, p_visit_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user public.users%rowtype;v_client public.clients%rowtype;
v_point public.route_physical_points%rowtype;
v_member_id uuid;v_entity uuid;v_match int;v_id uuid;v_sort integer;
begin
 select u.* into v_user from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_user.id is null or v_user.role<>'manager' then raise exception 'Только МПП' using errcode='42501';end if;
 if v_user.region<>'Витебск' or v_user.name not in ('Руднев','Ачинович','Шкуран') then raise exception 'Этот маршрут доступен только полевым менеджерам' using errcode='42501';end if;
 if p_visit_date is null or p_visit_date < timezone('Europe/Minsk',now())::date or
    p_visit_date>timezone('Europe/Minsk',now())::date+60 then raise exception 'Дата маршрута вне допустимого диапазона';end if;
 select * into v_client from public.clients where id=p_client_id and manager_name=v_user.name
 and coalesce(is_archived,false)=false and coalesce(to_delete,false)=false;
 if v_client.id is null then raise exception 'Клиент не закреплён за вами' using errcode='42501';end if;
 select entity_id into v_entity from public.client360_entity_clients_v1 where client_id=p_client_id;
 select count(distinct p.id) into v_match
 from public.route_physical_points p join public.route_physical_point_clients pc on pc.point_id=p.id
 join public.clients c on c.id=pc.client_id
 where coalesce(p.active,true) and c.manager_name=v_user.name
 and (pc.client_id=p_client_id or (v_entity is not null and exists(
 select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=v_entity and ec.client_id=pc.client_id)));
 if v_match>0 and p_point_id is null then raise exception 'Обязательно выберите торговую точку';end if;
 if p_point_id is not null then
  select p.* into v_point from public.route_physical_points p where p.id=p_point_id and coalesce(p.active,true);
  if v_point.id is null then raise exception 'ТТ не найдена';end if;
  select pc.client_id into v_member_id from public.route_physical_point_clients pc
   join public.clients c on c.id=pc.client_id and c.manager_name=v_user.name
   where pc.point_id=p_point_id and
   (pc.client_id=p_client_id or (v_entity is not null and exists(
    select 1 from public.client360_entity_clients_v1 ec where ec.entity_id=v_entity and ec.client_id=pc.client_id)))
   order by (pc.client_id=p_client_id) desc limit 1;
  if v_member_id is null then raise exception 'ТТ не привязана к этому клиенту' using errcode='42501';end if;
  select * into v_client from public.clients where id=v_member_id;
 end if;
 if exists(select 1 from public.route_plans r where r.manager_name=v_user.name and r.visit_date=p_visit_date
  and coalesce(r.removed,false)=false and
  ((p_point_id is not null and r.physical_point_id=p_point_id)
  or (p_point_id is null and r.client_id=p_client_id))) then
  raise exception 'Эта торговая точка уже в маршруте на выбранную дату';end if;
 select coalesce(max(r.sort_order),0)+1 into v_sort from public.route_plans r
 where r.manager_name=v_user.name and r.visit_date=p_visit_date and coalesce(r.removed,false)=false;
 insert into public.route_plans(client_id,manager_name,visit_date,client_name,region,city,address,category,
 physical_point_id,physical_point_key,route_lat,route_lng,linked_client_ids,linked_client_names,
 sort_order,generated_month,source,approved,review_status,removed)
 values(v_client.id,v_user.name,p_visit_date,v_client.name,v_client.region,
 coalesce(v_point.city,v_client.city),coalesce(v_point.address,v_client.address),v_client.role_type,
 v_point.id,v_point.point_key,v_point.lat,v_point.lng,
 array[v_client.id]::uuid[],array[v_client.name]::text[],v_sort,to_char(p_visit_date,'YYYY-MM'),
 'manager',false,'pending',false)
 returning id into v_id;
 return jsonb_build_object('ok',true,'route_id',v_id,'client_id',v_client.id,'point_id',v_point.id,
 'coordinate_status',case when v_point.id is null or v_point.lat is null or v_point.lng is null then 'needs_review' else 'provisional' end);
end $function$


CREATE OR REPLACE FUNCTION public.client360_request_store_v1(p_client_id uuid, p_city text, p_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text;v_role text;v_id uuid;
begin
 select u.name,u.role into v_name,v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_role<>'manager' then raise exception 'Только МПП' using errcode='42501';end if;
 if not exists(select 1 from public.clients where id=p_client_id and manager_name=v_name and coalesce(is_archived,false)=false) then raise exception 'Не ваш клиент' using errcode='42501';end if;
 if length(trim(coalesce(p_city,''))) not between 2 and 100 or length(trim(coalesce(p_address,''))) not between 5 and 220 then raise exception 'Укажите город и полный адрес';end if;
 if exists(select 1 from public.client360_point_requests_v1 where client_id=p_client_id and status='pending'
 and lower(trim(city))=lower(trim(p_city)) and lower(trim(address))=lower(trim(p_address))) then raise exception 'Заявка на этот адрес уже ожидает проверки';end if;
 insert into public.client360_point_requests_v1(client_id,city,address,manager_id)
 values(p_client_id,trim(p_city),trim(p_address),auth.uid()) returning id into v_id;
 return jsonb_build_object('ok',true,'request_id',v_id,'status','pending');
end $function$


CREATE OR REPLACE FUNCTION public.client360_review_requests_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_out jsonb;
begin
 select u.role into v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_role is distinct from 'boss' then raise exception 'Нет доступа' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_out from (
 select r.id,r.client_id,c.name client_name,r.city,r.address,r.created_at,u.name manager_name
 from public.client360_point_requests_v1 r join public.clients c on c.id=r.client_id
 join public.users u on u.id=r.manager_id where r.status='pending' order by r.created_at desc limit 150) x;
 return jsonb_build_object('ok',true,'requests',v_out);
end $function$


CREATE OR REPLACE FUNCTION public.client360_approve_store_v1(p_request_id uuid, p_approve boolean, p_comment text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text;v_role text;v_request public.client360_point_requests_v1%rowtype;v_point uuid;
begin
 select lower(a.email),u.role into v_email,v_role from auth.users a join public.users u on u.id=a.id
 where a.id=auth.uid() and lower(a.email)=lower(u.email) and a.email_confirmed_at is not null;
 if v_role<>'boss' or v_email not in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then raise exception 'Только ДФС/ДФ' using errcode='42501';end if;
 select * into v_request from public.client360_point_requests_v1 where id=p_request_id and status='pending' for update;
 if v_request.id is null then raise exception 'Нет заявки на проверке';end if;
 if p_approve then
  if exists(
    select 1 from public.route_physical_point_clients pc
    join public.route_physical_points p on p.id=pc.point_id
    where pc.client_id=v_request.client_id
      and lower(regexp_replace(coalesce(p.city,''),'\\s+','','g'))=lower(regexp_replace(v_request.city,'\\s+','','g'))
      and lower(regexp_replace(coalesce(p.address,''),'\\s+','','g'))=lower(regexp_replace(v_request.address,'\\s+','','g'))
  ) then raise exception 'У этого клиента уже есть ТТ по данному адресу. Используйте существующую точку.';end if;
  -- Never silently overwrite a potentially conflicting existing GPS point.
  insert into public.route_physical_points(point_key,manager_name,region,city,address,geocode_status,active,source)
  select 'client360-request-'||v_request.id::text,c.manager_name,c.region,v_request.city,v_request.address,
  'pending',true,'client360_director_approved'
  from public.clients c where c.id=v_request.client_id returning id into v_point;
  insert into public.route_physical_point_clients(point_id,client_id,is_primary)
  values(v_point,v_request.client_id,false) on conflict do nothing;
 end if;
 update public.client360_point_requests_v1 set status=case when p_approve then 'approved' else 'rejected' end,
  reviewed_by=auth.uid(),reviewed_at=now(),created_point_id=v_point,comment=left(coalesce(p_comment,''),500)
 where id=p_request_id;
 return jsonb_build_object('ok',true,'approved',p_approve,'point_id',v_point);
end $function$


CREATE OR REPLACE FUNCTION public.client360_entity_overview_v1(p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_out jsonb;v_name text;
begin
 select u.role into v_role from public.users u join auth.users a on a.id=u.id
 where u.id=auth.uid() and lower(u.email)=lower(a.email) and a.email_confirmed_at is not null;
 if v_role is distinct from 'boss' then raise exception 'Нет доступа' using errcode='42501';end if;
 select name into v_name from public.client360_entities_v1 where id=p_entity_id;
 if v_name is null then raise exception 'Юрлицо не найдено';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_out from (
 select c.id,c.name,c.city,c.address,c.manager_name,
 (select count(*)::integer from public.visits v where v.client_id=c.id and coalesce(v.is_duplicate,false)=false) visits,
 (select max(v.date) from public.visits v where v.client_id=c.id and coalesce(v.is_duplicate,false)=false) last_visit,
 (select coalesce(jsonb_agg(to_jsonb(p) order by p.city,p.address),'[]'::jsonb) from (
   select pp.id,pp.city,pp.address,pp.lat,pp.lng,pp.geocode_status
   from public.route_physical_point_clients l join public.route_physical_points pp on pp.id=l.point_id
   where l.client_id=c.id and coalesce(pp.active,true)
   order by pp.city,pp.address
 ) p) stores
 from public.client360_entity_clients_v1 ec join public.clients c on c.id=ec.client_id
 where ec.entity_id=p_entity_id and coalesce(c.is_archived,false)=false order by c.name
 ) x;
 return jsonb_build_object('ok',true,'entity_id',p_entity_id,'name',v_name,'clients',v_out);
end $function$


CREATE OR REPLACE FUNCTION public.crm_v2270_manager_add_route_stop(p_client_id uuid, p_visit_date date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
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
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  if v_email='' then
    raise exception 'Не удалось определить вошедшего пользователя. Перезайдите в CRM.';
  end if;

  select u.name,u.role
    into v_actor_name,v_actor_role
  from public.users u
  where lower(coalesce(u.email,''))=v_email
  limit 1;

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
  if public.crm_v2270_norm(v_client.client_status) not in ('рабочий','потенциальный') then
    raise exception 'Можно добавить только рабочего или потенциального клиента.';
  end if;

  -- Активный дубль одного клиента на одну дату запрещён.
  if exists(
    select 1
    from public.route_plans r
    where public.crm_v2270_norm(r.manager_name)=public.crm_v2270_norm(v_actor_name)
      and left(r.visit_date::text,10)::date=p_visit_date
      and coalesce(r.removed,false)=false
      and (
        r.client_id::text=p_client_id::text
        or p_client_id=any(coalesce(r.linked_client_ids,'{}'::uuid[]))
        or public.crm_v2270_norm(r.client_name)=public.crm_v2270_norm(v_client.name)
        or exists(
          select 1 from unnest(coalesce(r.linked_client_names,'{}'::text[])) n
          where public.crm_v2270_norm(n)=public.crm_v2270_norm(v_client.name)
        )
      )
  ) then
    raise exception 'Этот клиент уже есть в маршруте на выбранную дату.';
  end if;

  -- Client360: never silently select an arbitrary store for a multi-store legal entity.
  -- The new route picker requires an explicit physical_point_id.
  if (select count(distinct m.point_id) from public.route_physical_point_clients m
      join public.route_physical_points p on p.id=m.point_id and coalesce(p.active,true)
      where m.client_id=p_client_id)>1
     or exists (
        select 1 from public.client360_entity_clients_v1 x
        join public.client360_entity_clients_v1 y on y.entity_id=x.entity_id
        join public.route_physical_point_clients m on m.client_id=y.client_id
        join public.route_physical_points p on p.id=m.point_id and coalesce(p.active,true)
        where x.client_id=p_client_id
        group by x.entity_id having count(distinct m.point_id)>1
     )
  then
    raise exception 'У клиента несколько торговых точек. Выберите точный адрес через меню маршрута CRM, чтобы избежать ложного GPS-отклонения.';
  end if;

  -- Подтягиваем физическую точку и координаты, если клиент уже связан с ТТ.
  if to_regclass('public.route_physical_point_clients') is not null
     and to_regclass('public.route_physical_points') is not null then
    select
      p.id,p.point_key,p.region,p.city,p.address,p.lat,p.lng
    into v_point_id,v_point_key,v_point_region,v_point_city,v_point_address,v_point_lat,v_point_lng
    from public.route_physical_point_clients m
    join public.route_physical_points p on p.id=m.point_id
    where m.client_id=p_client_id
      and coalesce(p.active,true)=true
    order by m.is_primary desc,p.id
    limit 1;
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
      r.client_id::text=p_client_id::text
      or public.crm_v2270_norm(r.client_name)=public.crm_v2270_norm(v_client.name)
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
      route_lat=coalesce(v_point_lat,r.route_lat,v_client.gps_lat,v_client.lat),
      route_lng=coalesce(v_point_lng,r.route_lng,v_client.gps_lng,v_client.lng),
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
      coalesce(v_point_lat,v_client.gps_lat,v_client.lat),
      coalesce(v_point_lng,v_client.gps_lng,v_client.lng),
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
$function$


CREATE OR REPLACE FUNCTION public.gps_workday_visit_facts_v236421(p_workday_id uuid)
 RETURNS TABLE(workday_id uuid, work_date date, manager_name text, route_plan_id uuid, sort_order integer, client_id uuid, client_name text, city text, address text, planned_start time without time zone, planned_end time without time zone, planned_minutes integer, trusted_lat double precision, trusted_lng double precision, coordinate_source text, coordinate_conflict boolean, visit_id uuid, visit_created_at timestamp with time zone, visit_gps_status text, actual_arrival_at timestamp with time zone, actual_departure_at timestamp with time zone, actual_minutes numeric, arrival_delta_minutes numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
with wd as (
  select w.id,w.work_date,w.manager_name
  from public.gps_workdays w
  where w.id=p_workday_id
    and public.gps_has_control_access()
),
base0 as (
  select
    wd.id workday_id,wd.work_date,wd.manager_name,
    r.id route_plan_id,coalesce(r.sort_order,999999)::integer sort_order,
    r.client_id,r.client_name,coalesce(nullif(r.city,''),c.city) city,
    coalesce(nullif(r.address,''),c.address) address,
    r.planned_start,r.planned_end,r.planned_minutes,
    coalesce(r.is_network_point,false) is_network_point,
    r.network_point_id,
    r.route_lat,r.route_lng,r.physical_point_id,
    coalesce((select pp.lat from public.route_physical_points pp where pp.id=r.physical_point_id),r.route_lat) as physical_lat,
    coalesce((select pp.lng from public.route_physical_points pp where pp.id=r.physical_point_id),r.route_lng) as physical_lng,
    c.lat client_lat,c.lng client_lng,
    c.gps_lat client_gps_lat,c.gps_lng client_gps_lng,
    coalesce(c.gps_samples_cnt,0) client_gps_samples_cnt,c.gps_verified_at client_gps_verified_at,
    n.gps_lat network_gps_lat,n.gps_lng network_gps_lng,
    coalesce(n.gps_samples_cnt,0) network_gps_samples_cnt,n.gps_verified_at network_gps_verified_at,
    r.network_transfer_lat,r.network_transfer_lng,r.network_transfer_accuracy,
    r.network_transfer_completed_at,
    greatest(
      100,
      least(
        350,
        case when coalesce(r.is_network_point,false)
          then coalesce(n.gps_radius,250)
          else coalesce(c.gps_radius,250)
        end
      )
    )::double precision radius_m,
    v.id visit_id,
    coalesce(
      v.created_at,
      case when coalesce(r.is_network_point,false)
             and r.network_transfer_status='completed'
           then r.network_transfer_completed_at end
    ) visit_created_at,
    case
      when v.id is not null then lower(coalesce(v.gps_status,''))
      when coalesce(r.is_network_point,false)
       and r.network_transfer_status='completed'
       and r.network_transfer_lat is not null
       and r.network_transfer_lng is not null then 'confirmed'
      else ''
    end visit_gps_status,
    coalesce(
      v.gps_lat,
      case when coalesce(r.is_network_point,false)
             and r.network_transfer_status='completed'
           then r.network_transfer_lat end
    ) visit_lat,
    coalesce(
      v.gps_lng,
      case when coalesce(r.is_network_point,false)
             and r.network_transfer_status='completed'
           then r.network_transfer_lng end
    ) visit_lng
  from wd
  join public.route_plans r
    on r.visit_date=wd.work_date
   and lower(trim(coalesce(r.manager_name,'')))=lower(trim(coalesce(wd.manager_name,'')))
   and coalesce(r.removed,false)=false
   and coalesce(r.review_status,'approved') not in ('pending','rejected')
  left join public.clients c on c.id=r.client_id
  left join public.route_network_points n on n.id=r.network_point_id
  left join lateral (
    select vv.*
    from public.visits vv
    where vv.route_plan_id=r.id::text
      and coalesce(vv.is_duplicate,false)=false
    order by case when lower(coalesce(vv.gps_status,''))='confirmed' then 0 else 1 end,
             vv.created_at desc
    limit 1
  ) v on true
),
base as (
  select b.*,
    case
      when b.is_network_point
       and b.network_gps_verified_at is not null
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.route_lat is not null and b.route_lng is not null
      then public.gps_haversine_m(b.network_gps_lat,b.network_gps_lng,b.route_lat,b.route_lng)>1000
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and coalesce(b.route_lat,b.client_lat) is not null
       and coalesce(b.route_lng,b.client_lng) is not null
      then public.gps_haversine_m(
        b.client_gps_lat,b.client_gps_lng,
        coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
      )>1000
      else false
    end coordinate_conflict,

    case
      -- Client360: explicit selected store overrides conflicting parent-company GPS.
      -- If this physical point lacks coordinates, never borrow a different store's geo.
      when not b.is_network_point and b.physical_point_id is not null then b.physical_lat
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
       and (
         b.is_network_point
         or coalesce(b.route_lat,b.client_lat) is null
         or b.client_gps_verified_at is not null
         or public.gps_haversine_m(
              b.visit_lat,b.visit_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.visit_lat
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_verified_at is not null
      then b.network_gps_lat
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_samples_cnt>=2
      then b.network_gps_lat
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_verified_at is not null
      then b.client_gps_lat
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_samples_cnt>=2
       and (
         coalesce(b.route_lat,b.client_lat) is null
         or public.gps_haversine_m(
              b.client_gps_lat,b.client_gps_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.client_gps_lat
      when b.route_lat is not null and b.route_lng is not null then b.route_lat
      when b.client_lat is not null and b.client_lng is not null then b.client_lat
      else null
    end trusted_lat,

    case
      -- Client360: explicit selected store overrides conflicting parent-company GPS.
      -- If this physical point lacks coordinates, never borrow a different store's geo.
      when not b.is_network_point and b.physical_point_id is not null then b.physical_lng
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
       and (
         b.is_network_point
         or coalesce(b.route_lat,b.client_lat) is null
         or b.client_gps_verified_at is not null
         or public.gps_haversine_m(
              b.visit_lat,b.visit_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.visit_lng
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_verified_at is not null
      then b.network_gps_lng
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_samples_cnt>=2
      then b.network_gps_lng
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_verified_at is not null
      then b.client_gps_lng
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_samples_cnt>=2
       and (
         coalesce(b.route_lat,b.client_lat) is null
         or public.gps_haversine_m(
              b.client_gps_lat,b.client_gps_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.client_gps_lng
      when b.route_lat is not null and b.route_lng is not null then b.route_lng
      when b.client_lat is not null and b.client_lng is not null then b.client_lng
      else null
    end trusted_lng,

    case
      when not b.is_network_point and b.physical_point_id is not null
      then case when b.physical_lat is not null and b.physical_lng is not null
        then 'selected_physical_store' else 'selected_store_without_coordinates' end
      when b.is_network_point
       and b.visit_lat is not null and b.visit_lng is not null
       and b.visit_gps_status='confirmed'
      then 'network_transfer_gps'
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
      then 'confirmed_visit'
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_verified_at is not null
      then 'verified_network_gps'
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_samples_cnt>=2
      then 'multi_sample_network_gps'
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_verified_at is not null
      then 'verified_client_gps'
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_samples_cnt>=2
      then 'multi_sample_gps'
      when b.route_lat is not null and b.route_lng is not null then 'route_point'
      when b.client_lat is not null and b.client_lng is not null then 'address_point'
      else 'no_trusted_coordinates'
    end coordinate_source
  from base0 b
),
inside0 as (
  select b.route_plan_id,g.recorded_at,g.accuracy,
         public.gps_haversine_m(g.lat,g.lng,b.trusted_lat,b.trusted_lng) distance_m,
         lag(g.recorded_at) over(partition by b.route_plan_id order by g.recorded_at) prev_at
  from base b
  join public.gps_track_points g
    on g.workday_id=b.workday_id
   and coalesce(g.is_mock,false)=false
   and coalesce(g.accuracy,9999)<=250
   and coalesce(g.validation_reason,'') not in (
     'invalid_coordinates','poor_accuracy','gps_jump','impossible_speed',
     'invalid_time','non_monotonic_time','mock_location'
   )
  where b.trusted_lat is not null and b.trusted_lng is not null
    and public.gps_haversine_m(g.lat,g.lng,b.trusted_lat,b.trusted_lng)<=b.radius_m
),
inside1 as (
  select *,
    case when prev_at is null or recorded_at-prev_at>interval '12 minutes' then 1 else 0 end new_session
  from inside0
),
inside2 as (
  select *,
         sum(new_session) over(
           partition by route_plan_id
           order by recorded_at
           rows unbounded preceding
         ) session_no
  from inside1
),
sessions as (
  select route_plan_id,session_no,
         min(recorded_at) start_at,max(recorded_at) end_at,
         count(*)::integer point_count,
         min(distance_m) min_distance_m,
         avg(accuracy) avg_accuracy,
         extract(epoch from(max(recorded_at)-min(recorded_at)))/60.0 minutes
  from inside2
  group by route_plan_id,session_no
),
ranked as (
  select b.route_plan_id,s.start_at,s.end_at,s.point_count,s.min_distance_m,s.avg_accuracy,s.minutes,
         row_number() over(
           partition by b.route_plan_id
           order by
             case
               when b.visit_created_at is not null and b.visit_gps_status='confirmed'
                and b.visit_created_at between s.start_at-interval '30 minutes' and s.end_at+interval '30 minutes' then 0
               when b.visit_created_at is not null
                and b.visit_created_at between s.start_at-interval '30 minutes' and s.end_at+interval '30 minutes' then 1
               else 2
             end,
             case when s.point_count>=2 and s.minutes>=2 then 0 else 1 end,
             s.minutes desc,s.point_count desc
         ) rn
  from base b
  join sessions s on s.route_plan_id=b.route_plan_id
),
chosen0 as (
  select *
  from ranked
  where rn=1 and point_count>=2 and minutes>=2
),
chosen as (
  select c.*
  from chosen0 c
  join base b on b.route_plan_id=c.route_plan_id
  where not (
    b.visit_gps_status<>'confirmed'
    and exists(
      select 1
      from chosen0 c2
      join base b2 on b2.route_plan_id=c2.route_plan_id
      where b2.route_plan_id<>b.route_plan_id
        and b2.visit_gps_status='confirmed'
        and b.trusted_lat is not null and b.trusted_lng is not null
        and b2.trusted_lat is not null and b2.trusted_lng is not null
        and public.gps_haversine_m(b.trusted_lat,b.trusted_lng,b2.trusted_lat,b2.trusted_lng)<=150
        and c2.start_at<=c.end_at+interval '2 minutes'
        and c2.end_at>=c.start_at-interval '2 minutes'
    )
  )
)
select
  b.workday_id,b.work_date,b.manager_name,b.route_plan_id,b.sort_order,
  b.client_id,b.client_name,b.city,b.address,
  b.planned_start,b.planned_end,b.planned_minutes,
  b.trusted_lat,b.trusted_lng,b.coordinate_source,b.coordinate_conflict,
  b.visit_id,b.visit_created_at,b.visit_gps_status,
  c.start_at,c.end_at,
  case when c.start_at is not null and c.end_at is not null
    then round((extract(epoch from(c.end_at-c.start_at))/60.0)::numeric,1)
  end,
  case when c.start_at is not null and b.planned_start is not null
    then round((
      extract(epoch from(
        c.start_at-((b.work_date+b.planned_start) at time zone 'Europe/Minsk')
      ))/60.0
    )::numeric,0)
  end
from base b
left join chosen c on c.route_plan_id=b.route_plan_id
order by b.sort_order,b.client_name;
$function$


revoke execute on function public.client360_points_for_client_v1(uuid),public.client360_catalog_v1(text),public.client360_group_clients_v1(text,uuid[]),public.client360_create_route_v1(uuid,uuid,date),public.client360_request_store_v1(uuid,text,text),public.client360_review_requests_v1(),public.client360_approve_store_v1(uuid,boolean,text),public.client360_entity_overview_v1(uuid) from public,anon;
grant execute on function public.client360_points_for_client_v1(uuid),public.client360_catalog_v1(text),public.client360_group_clients_v1(text,uuid[]),public.client360_create_route_v1(uuid,uuid,date),public.client360_request_store_v1(uuid,text,text),public.client360_review_requests_v1(),public.client360_approve_store_v1(uuid,boolean,text),public.client360_entity_overview_v1(uuid) to authenticated;
