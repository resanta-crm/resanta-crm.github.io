-- CONNECT #138 FCM preparation. Does not enable delivery or modify existing CRM auth.
-- Private device registration; no direct browser access to token storage.
create table if not exists public.connect_push_devices_v1(
 fcm_token text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 constraint connect_push_token_size_v1 check (length(fcm_token) between 50 and 4096)
);
create index if not exists connect_push_devices_user_v1 on public.connect_push_devices_v1(user_id);
alter table public.connect_push_devices_v1 enable row level security;
revoke all on public.connect_push_devices_v1 from public, anon, authenticated;

create or replace function public.connect_push_register_v1(p_token text)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or not public.connect_active_staff_v1(v_user) then
  raise exception 'CONNECT push: account not allowed' using errcode='42501';
 end if;
 if p_token is null or length(p_token) not between 50 and 4096
     or p_token ~ '[[:space:]]' then
  raise exception 'CONNECT push: invalid FCM token' using errcode='22023';
 end if;
 insert into public.connect_push_devices_v1(fcm_token,user_id)
 values(p_token,v_user)
 on conflict(fcm_token) do update set user_id=excluded.user_id,last_seen_at=now();
 return true;
end;
$$;
revoke all on function public.connect_push_register_v1(text) from public,anon;
grant execute on function public.connect_push_register_v1(text) to authenticated;

create or replace function public.connect_push_unregister_v1(p_token text)
returns boolean
language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'CONNECT push: not signed in' using errcode='42501'; end if;
 delete from public.connect_push_devices_v1 where fcm_token=p_token and user_id=auth.uid();
 return true;
end;
$$;
revoke all on function public.connect_push_unregister_v1(text) from public,anon;
grant execute on function public.connect_push_unregister_v1(text) to authenticated;

-- Outbox is a durable queue. The future FCM sender must use a server-only service
-- credential and re-check rights before each send. No public API access.
create table if not exists public.connect_push_outbox_v1(
 id bigint generated always as identity primary key,
 message_id uuid not null references public.connect_messages_v1(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 room_id uuid not null references public.connect_rooms_v1(id) on delete cascade,
 kind text not null check(kind in ('message','video_call')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 attempts smallint not null default 0,
 unique(message_id,recipient_id)
);
create index if not exists connect_push_outbox_pending_v1 on public.connect_push_outbox_v1(created_at) where sent_at is null;
alter table public.connect_push_outbox_v1 enable row level security;
revoke all on public.connect_push_outbox_v1 from public,anon,authenticated;

-- No trigger is enabled until FCM credentials and authenticated dispatch are installed.
-- This avoids accumulating undeliverable notifications or affecting message writes.
