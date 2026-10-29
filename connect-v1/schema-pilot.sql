-- RESANTA CONNECT 360: isolated Vitebsk pilot schema
-- DRAFT. Run ONLY in a separate Supabase development project after security review.
-- This file is NOT automatically executed by GitHub Pages.
-- No existing CRM tables, triggers, functions or policies are altered.

create table if not exists public.connect_rooms_v1 (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('direct','group','channel')),
  title text not null default '',
  direct_key text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint connect_room_title_v1 check (char_length(title)<=100),
  constraint connect_direct_key_v1 check ((kind='direct') = (direct_key is not null))
);
create table if not exists public.connect_room_members_v1 (
  room_id uuid not null references public.connect_rooms_v1(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
create table if not exists public.connect_messages_v1 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.connect_rooms_v1(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text not null check(char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists connect_members_by_user_v1 on public.connect_room_members_v1(user_id,room_id);
create index if not exists connect_messages_by_room_v1 on public.connect_messages_v1(room_id,created_at desc);

-- The current CRM's public.users is the authoritative employee roster.
-- NEVER authorize using editable user_metadata, email supplied by the browser, or a client-provided role.
create or replace function public.connect_active_staff_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, auth
as $$
  select p_user_id is not null and exists(
    select 1 from public.users u
    join auth.users a on a.id=u.id
    where u.id=p_user_id and a.id=p_user_id and lower(u.email)=lower(a.email)
  );
$$;

create or replace function public.connect_is_member_v1(p_room_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, auth
as $$
  select public.connect_active_staff_v1(auth.uid()) and exists(
    select 1 from public.connect_room_members_v1 m
    where m.room_id=p_room_id and m.user_id=auth.uid()
  );
$$;

revoke all on function public.connect_active_staff_v1(uuid) from public, anon;
revoke all on function public.connect_is_member_v1(uuid) from public, anon;
grant execute on function public.connect_active_staff_v1(uuid) to authenticated;
grant execute on function public.connect_is_member_v1(uuid) to authenticated;

alter table public.connect_rooms_v1 enable row level security;
alter table public.connect_room_members_v1 enable row level security;
alter table public.connect_messages_v1 enable row level security;

revoke all on public.connect_rooms_v1,public.connect_room_members_v1,public.connect_messages_v1 from anon;
revoke all on public.connect_rooms_v1,public.connect_room_members_v1,public.connect_messages_v1 from authenticated;
grant select on public.connect_rooms_v1,public.connect_room_members_v1,public.connect_messages_v1 to authenticated;
grant insert on public.connect_messages_v1 to authenticated;

create policy connect_room_read_v1 on public.connect_rooms_v1
for select to authenticated using (public.connect_is_member_v1(id));
create policy connect_members_read_v1 on public.connect_room_members_v1
for select to authenticated using (public.connect_is_member_v1(room_id));
create policy connect_messages_read_v1 on public.connect_messages_v1
for select to authenticated using (public.connect_is_member_v1(room_id));
create policy connect_messages_write_v1 on public.connect_messages_v1
for insert to authenticated
with check (
  sender_id=auth.uid()
  and public.connect_is_member_v1(room_id)
  and public.connect_active_staff_v1(auth.uid())
);

-- SECDEF is deliberately used only for tightly scoped room creation and invitation.
-- Direct writes to memberships/rooms are blocked for authenticated clients.
create or replace function public.connect_create_room_v1(
  p_kind text, p_title text, p_other_members uuid[]
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_me uuid:=auth.uid();
  v_role text;
  v_members uuid[];
  v_id uuid;
  v_key text;
  v_count int;
begin
  if not public.connect_active_staff_v1(v_me) then
    raise exception 'CONNECT: active CRM account required' using errcode='42501';
  end if;
  if p_kind not in ('direct','group','channel') then
    raise exception 'CONNECT: invalid room kind' using errcode='22023';
  end if;
  select u.role into v_role from public.users u where u.id=v_me;
  if p_kind='channel' and v_role<>'boss' then
    raise exception 'CONNECT: only directors may create official channels' using errcode='42501';
  end if;
  select coalesce(array_agg(distinct x),array[]::uuid[]) into v_members
    from unnest(coalesce(p_other_members,array[]::uuid[])) as t(x)
    where x is not null and x<>v_me;
  v_count:=coalesce(array_length(v_members,1),0);
  if (p_kind='direct' and v_count<>1) or (p_kind<>'direct' and (v_count<1 or v_count>49)) then
    raise exception 'CONNECT: invalid member count' using errcode='22023';
  end if;
  if exists(select 1 from unnest(v_members) as x(user_id)
            where not public.connect_active_staff_v1(x.user_id)) then
    raise exception 'CONNECT: only registered CRM employees may join' using errcode='42501';
  end if;
  if p_kind<>'direct' and char_length(btrim(coalesce(p_title,''))) not between 3 and 100 then
    raise exception 'CONNECT: group name must be 3-100 characters' using errcode='22023';
  end if;
  if p_kind='direct' then
    v_key:=least(v_me::text,v_members[1]::text)||':'||greatest(v_me::text,v_members[1]::text);
  end if;
  insert into public.connect_rooms_v1(kind,title,direct_key,created_by)
  values(p_kind,case when p_kind='direct' then '' else btrim(p_title) end,v_key,v_me)
  on conflict(direct_key) do nothing returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.connect_rooms_v1 r
    where r.direct_key=v_key and r.kind='direct';
    if v_id is null then
      raise exception 'CONNECT: direct room resolution failed';
    end if;
    -- Existing 1:1 room: never overwrite its title or members.
    return v_id;
  end if;
  insert into public.connect_room_members_v1(room_id,user_id,role)
  values(v_id,v_me,'owner');
  insert into public.connect_room_members_v1(room_id,user_id,role)
  select v_id,x.user_id,'member' from unnest(v_members) as x(user_id);
  return v_id;
end;
$$;

create or replace function public.connect_invite_member_v1(p_room_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_me uuid:=auth.uid(); v_role text; v_kind text;
begin
  if not public.connect_active_staff_v1(v_me)
     or not public.connect_active_staff_v1(p_user_id) then
    raise exception 'CONNECT: active CRM employees only' using errcode='42501';
  end if;
  select r.kind,m.role into v_kind,v_role
  from public.connect_rooms_v1 r
  join public.connect_room_members_v1 m on m.room_id=r.id
  where r.id=p_room_id and m.user_id=v_me;
  if v_role is distinct from 'owner' or v_kind='direct' or v_kind is null then
    raise exception 'CONNECT: only the group owner may invite' using errcode='42501';
  end if;
  if (select count(*) from public.connect_room_members_v1 where room_id=p_room_id)>=50 then
    raise exception 'CONNECT: room is full' using errcode='22023';
  end if;
  insert into public.connect_room_members_v1(room_id,user_id,role)
  values(p_room_id,p_user_id,'member') on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.connect_create_room_v1(text,text,uuid[]) from public, anon;
revoke all on function public.connect_invite_member_v1(uuid,uuid) from public, anon;
grant execute on function public.connect_create_room_v1(text,text,uuid[]) to authenticated;
grant execute on function public.connect_invite_member_v1(uuid,uuid) to authenticated;

-- Real-time INSERT events still require message-table RLS. This is a DEVELOPMENT
-- project operation; do not apply to the current production project.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables where pubname='supabase_realtime'
        and schemaname='public' and tablename='connect_messages_v1'
     ) then
    alter publication supabase_realtime add table public.connect_messages_v1;
  end if;
end $$;

-- Deployment requirements: audit policies under multiple real test identities
-- and run Supabase security advisors BEFORE a separately approved prod rollout.
