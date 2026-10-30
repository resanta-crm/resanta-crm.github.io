-- RESANTA CONNECT 360 / unread counters and in-app notifications (Vitebsk).
-- Additive change to CONNECT-owned table ONLY. No CRM task/client/GPS/Lera changes.

alter table public.connect_room_members_v1
  add column if not exists last_read_at timestamptz not null default now();

create index if not exists connect_messages_room_time_sender_v1
  on public.connect_messages_v1(room_id,created_at,sender_id);

-- A user's unread count is computed exclusively from chat rooms they already belong to.
create or replace function public.connect_unread_counts_v1()
returns table(room_id uuid,unread_count bigint,last_message_at timestamptz)
language sql stable security invoker
set search_path=pg_catalog,public,auth,pg_temp
as $$
  select rm.room_id,
    count(cm.id) filter (
      where cm.sender_id is distinct from (select auth.uid())
        and cm.created_at>rm.last_read_at
    )::bigint as unread_count,
    max(cm.created_at) as last_message_at
  from public.connect_room_members_v1 rm
  left join public.connect_messages_v1 cm on cm.room_id=rm.room_id
  where rm.user_id=(select auth.uid())
    and public.connect_active_staff_v1((select auth.uid()))
  group by rm.room_id,rm.last_read_at;
$$;

-- No direct UPDATE permission on membership rows: a narrowly scoped RPC only
-- changes the authenticated user's read timestamp, never user_id / room / role.
create or replace function public.connect_mark_read_v1(p_room_id uuid)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
declare v_user uuid:=(select auth.uid());
begin
  if v_user is null or not public.connect_active_staff_v1(v_user) then
    raise exception 'CONNECT: active CRM account required' using errcode='42501';
  end if;
  update public.connect_room_members_v1 rm
  set last_read_at=clock_timestamp()
  where rm.user_id=v_user and rm.room_id=p_room_id;
  if not found then
    raise exception 'CONNECT: not a member of this chat' using errcode='42501';
  end if;
  return true;
end;
$$;

revoke all on function public.connect_unread_counts_v1() from public,anon;
revoke all on function public.connect_mark_read_v1(uuid) from public,anon;
grant execute on function public.connect_unread_counts_v1() to authenticated;
grant execute on function public.connect_mark_read_v1(uuid) to authenticated;
