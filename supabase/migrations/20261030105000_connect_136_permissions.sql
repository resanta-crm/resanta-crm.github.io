-- CONNECT #136: user-scoped chat and video access. Additive and independent of legacy CRM.
-- The sign-in/accounts remain intact; other CRM pages do not use these rights.
create table if not exists public.connect_permissions_v1 (
 user_id uuid primary key references auth.users(id) on delete cascade,
 chat_enabled boolean not null default false,
 video_enabled boolean not null default false,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 constraint connect_video_requires_chat_v1 check (not video_enabled or chat_enabled)
);
alter table public.connect_permissions_v1 enable row level security;
revoke all on public.connect_permissions_v1 from public,anon,authenticated;
grant select on public.connect_permissions_v1 to authenticated;

-- Seed the *current* ten CRM profiles by matching the approved names,
-- never by generated ids or fragile role inference.
insert into public.connect_permissions_v1(user_id,chat_enabled,video_enabled)
select u.id, (u.name <> 'Нестеров П.Ю.'),
  (u.name not in ('Нестеров П.Ю.','Офис-менеджер Витебск','Менеджер сервисного центра'))
from public.users u join auth.users a on a.id=u.id
where u.name in (
 'Александр Паюшин','Сидарович К.Н.','Руднев','Ачинович','Шкуран',
 'Александренко','Кришталь','Офис-менеджер Витебск',
 'Менеджер сервисного центра','Нестеров П.Ю.'
)
on conflict(user_id) do nothing;

-- Explicit owner: the director who approved the CONNECT rollout.
create or replace function public.connect_access_admin_v1()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.users u join auth.users a on a.id=u.id
  where u.id=auth.uid() and u.role='boss' and u.name='Александр Паюшин'
    and lower(u.email)=lower(a.email)
 );
$$;
revoke all on function public.connect_access_admin_v1() from public,anon;
grant execute on function public.connect_access_admin_v1() to authenticated;

create policy connect_permission_read_v1 on public.connect_permissions_v1
 for select to authenticated
 using(user_id=(select auth.uid()) or (select public.connect_access_admin_v1()));

-- Existing CONNECT RLS policies call this helper; tightening it revokes
-- all chat, attachments, storage and realtime read/write for disabled staff.
create or replace function public.connect_active_staff_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select p_user_id is not null and exists(
  select 1 from public.users u
  join auth.users a on a.id=u.id
  join public.connect_permissions_v1 p on p.user_id=u.id
  where u.id=p_user_id and lower(u.email)=lower(a.email)
    and p.chat_enabled is true
 );
$$;
revoke all on function public.connect_active_staff_v1(uuid) from public,anon;
grant execute on function public.connect_active_staff_v1(uuid) to authenticated;

-- Return only eligible employees for new rooms/invitations.
create or replace function public.connect_directory_v1()
returns table(id uuid,name text,email text,role text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.connect_active_staff_v1(auth.uid()) then
  raise exception 'CONNECT: chat access denied' using errcode='42501';
 end if;
 return query
 select u.id,u.name::text,u.email::text,u.role::text from public.users u
 join auth.users a on a.id=u.id
 join public.connect_permissions_v1 p on p.user_id=u.id and p.chat_enabled
 where lower(u.email)=lower(a.email)
 order by u.name;
end;
$$;
revoke all on function public.connect_directory_v1() from public,anon;
grant execute on function public.connect_directory_v1() to authenticated;

-- Director's read-only listing and narrow, audited mutation function.
create or replace function public.connect_admin_permissions_v1()
returns table(user_id uuid,name text,role text,chat_enabled boolean,video_enabled boolean)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.connect_access_admin_v1() then
  raise exception 'CONNECT: director only' using errcode='42501';
 end if;
 return query
 select u.id,u.name::text,u.role::text,coalesce(p.chat_enabled,false),
        coalesce(p.video_enabled,false)
 from public.users u join auth.users a on a.id=u.id
 left join public.connect_permissions_v1 p on p.user_id=u.id
 where lower(u.email)=lower(a.email)
 order by u.name;
end;
$$;
revoke all on function public.connect_admin_permissions_v1() from public,anon;
grant execute on function public.connect_admin_permissions_v1() to authenticated;

create or replace function public.connect_set_permission_v1(
 p_user_id uuid,p_chat_enabled boolean,p_video_enabled boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if not public.connect_access_admin_v1() then
  raise exception 'CONNECT: director only' using errcode='42501';
 end if;
 if p_user_id is null or p_chat_enabled is null or p_video_enabled is null
    or (p_video_enabled and not p_chat_enabled) then
  raise exception 'CONNECT: invalid permissions' using errcode='22023';
 end if;
 if p_user_id=auth.uid() and not p_chat_enabled then
  raise exception 'CONNECT: director cannot disable own chat administration' using errcode='42501';
 end if;
 if not exists(
  select 1 from public.users u join auth.users a on a.id=u.id
  where u.id=p_user_id and lower(u.email)=lower(a.email)
 ) then
  raise exception 'CONNECT: unknown CRM employee' using errcode='22023';
 end if;
 insert into public.connect_permissions_v1(user_id,chat_enabled,video_enabled,updated_by,updated_at)
 values (p_user_id,p_chat_enabled,p_video_enabled,auth.uid(),now())
 on conflict(user_id) do update
 set chat_enabled=excluded.chat_enabled,video_enabled=excluded.video_enabled,
     updated_by=excluded.updated_by,updated_at=now();
 return true;
end;
$$;
revoke all on function public.connect_set_permission_v1(uuid,boolean,boolean) from public,anon;
grant execute on function public.connect_set_permission_v1(uuid,boolean,boolean) to authenticated;

-- Video-only entitlement: read via client RLS when issuing LiveKit tokens.
-- For disabled employees, RLS prevents access to rooms and files already.
