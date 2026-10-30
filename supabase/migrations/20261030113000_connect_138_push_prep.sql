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

-- Per-device delivery deduplication and audit. Readable only by service role.
create table if not exists public.connect_push_delivery_v1(
 delivery_id text primary key,
 message_id uuid not null references public.connect_messages_v1(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 constraint connect_push_delivery_sha256_v1 check (length(delivery_id)=64)
);
create index if not exists connect_push_delivery_cleanup_v1
 on public.connect_push_delivery_v1(created_at);
alter table public.connect_push_delivery_v1 enable row level security;
revoke all on public.connect_push_delivery_v1 from public,anon,authenticated;

-- Chat writes are left unchanged. No DB trigger is used:
-- the sender explicitly requests delivery *after* an authorized message INSERT.
-- Failure to send notification never rolls back a chat message.
