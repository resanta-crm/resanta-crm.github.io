-- CONNECT-only, additive. No historical messages are enqueued or rewritten.
create table public.connect_runtime_v2(key text primary key,value jsonb not null);
alter table public.connect_runtime_v2 enable row level security;
revoke all on public.connect_runtime_v2 from public,anon,authenticated;
grant all on public.connect_runtime_v2 to service_role;
insert into public.connect_runtime_v2 values('dispatch',jsonb_build_object('secret',encode(extensions.gen_random_bytes(32),'hex')));
create table public.connect_web_devices_v2(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text unique not null check(length(endpoint)<4096),subscription jsonb not null,
 label text not null default 'Браузер' check(length(label)<=100),created_at timestamptz not null default now(),last_seen_at timestamptz not null default now());
create index connect_web_devices_user_v2 on public.connect_web_devices_v2(user_id);
alter table public.connect_web_devices_v2 enable row level security;
revoke all on public.connect_web_devices_v2 from public,anon,authenticated;
grant all on public.connect_web_devices_v2 to service_role;
create table public.connect_calls_v2(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.connect_rooms_v1(id),
 caller_id uuid not null references auth.users(id),status text not null default 'ringing' check(status in('ringing','active','ended','missed')),
 created_at timestamptz not null default now(),ring_until timestamptz not null default(now()+interval '90 seconds'),ended_at timestamptz);
create index connect_calls_room_v2 on public.connect_calls_v2(room_id,created_at desc);
create index connect_calls_caller_v2 on public.connect_calls_v2(caller_id);
create unique index connect_calls_live_room_v2 on public.connect_calls_v2(room_id) where status in('ringing','active');
create table public.connect_call_members_v2(
 call_id uuid not null references public.connect_calls_v2(id) on delete cascade,user_id uuid not null references auth.users(id),
 state text not null check(state in('invited','accepted','declined','left')),updated_at timestamptz not null default now(),primary key(call_id,user_id));
create index connect_call_members_user_v2 on public.connect_call_members_v2(user_id);
alter table public.connect_calls_v2 enable row level security;
alter table public.connect_call_members_v2 enable row level security;
create policy connect_calls_read_v2 on public.connect_calls_v2 for select to authenticated using(public.connect_is_member_v1(room_id));
create policy connect_call_members_read_v2 on public.connect_call_members_v2 for select to authenticated using(exists(select 1 from public.connect_calls_v2 c where c.id=call_id and public.connect_is_member_v1(c.room_id)));
revoke all on public.connect_calls_v2,public.connect_call_members_v2 from public,anon,authenticated;
grant select on public.connect_calls_v2,public.connect_call_members_v2 to authenticated;
grant all on public.connect_calls_v2,public.connect_call_members_v2 to service_role;
alter table public.connect_messages_v1 add column call_id uuid references public.connect_calls_v2(id);
create index connect_messages_call_v2 on public.connect_messages_v1(call_id) where call_id is not null;
create table public.connect_delivery_v2(
 id uuid primary key default gen_random_uuid(),event_key text not null,message_id uuid references public.connect_messages_v1(id) on delete cascade,
 room_id uuid references public.connect_rooms_v1(id),call_id uuid references public.connect_calls_v2(id),recipient_id uuid not null references auth.users(id),
 channel text not null check(channel in('web','fcm','none')),device_ref text not null,kind text not null check(kind in('message','video_call','test')),
 status text not null default 'pending' check(status in('pending','sending','sent','failed','unknown','no_device','cancelled')),
 attempts integer not null default 0,created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '1 day'),
 next_attempt_at timestamptz not null default now(),lease_at timestamptz,sent_at timestamptz,confirmed_at timestamptz,error_code text,
 unique(event_key,recipient_id,channel,device_ref));
create index connect_delivery_due_v2 on public.connect_delivery_v2(next_attempt_at) where status in('pending','failed','sending');
create index connect_delivery_recipient_v2 on public.connect_delivery_v2(recipient_id,created_at desc);
create index connect_delivery_message_v2 on public.connect_delivery_v2(message_id);
create index connect_delivery_room_v2 on public.connect_delivery_v2(room_id);
create index connect_delivery_call_v2 on public.connect_delivery_v2(call_id);
alter table public.connect_delivery_v2 enable row level security;
revoke all on public.connect_delivery_v2 from public,anon,authenticated;
grant all on public.connect_delivery_v2 to service_role;

-- Called only by trigger/service: snapshot device ownership, never expose tokens.
create function public.connect_enqueue_v2(p_event text,p_message uuid,p_room uuid,p_call uuid,p_recipient uuid,p_kind text,p_expiry timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.connect_delivery_v2(event_key,message_id,room_id,call_id,recipient_id,channel,device_ref,kind,expires_at)
 select p_event,p_message,p_room,p_call,p_recipient,'web',d.id::text,p_kind,p_expiry from public.connect_web_devices_v2 d where d.user_id=p_recipient
 union all select p_event,p_message,p_room,p_call,p_recipient,'fcm',encode(extensions.digest(d.fcm_token,'sha256'),'hex'),p_kind,p_expiry from public.connect_push_devices_v1 d where d.user_id=p_recipient on conflict do nothing;
 if not exists(select 1 from public.connect_web_devices_v2 where user_id=p_recipient) and not exists(select 1 from public.connect_push_devices_v1 where user_id=p_recipient) then
 insert into public.connect_delivery_v2(event_key,message_id,room_id,call_id,recipient_id,channel,device_ref,kind,expires_at,status)
 values(p_event,p_message,p_room,p_call,p_recipient,'none','none',p_kind,p_expiry,'no_device') on conflict do nothing;
 end if;
end $$;
revoke all on function public.connect_enqueue_v2(text,uuid,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.connect_enqueue_v2(text,uuid,uuid,uuid,uuid,text,timestamptz) to service_role;
create function public.connect_message_queue_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;k text;begin
 if new.call_id is not null and not exists(select 1 from public.connect_calls_v2 c where c.id=new.call_id and c.room_id=new.room_id and c.caller_id=new.sender_id) then raise exception 'CONNECT_CALL_MESSAGE_SCOPE';end if;
 k:=case when new.call_id is not null or new.body like '📹 Начался видеозвонок%' then 'video_call' else 'message' end;
 for r in select m.user_id from public.connect_room_members_v1 m join public.connect_permissions_v1 p on p.user_id=m.user_id
 where m.room_id=new.room_id and m.user_id<>new.sender_id and p.chat_enabled and (k<>'video_call' or p.video_enabled) and public.connect_active_staff_v1(m.user_id)
 loop perform public.connect_enqueue_v2('message:'||new.id,new.id,new.room_id,new.call_id,r.user_id,k,now()+case when k='video_call' then interval '90 seconds' else interval '1 day' end);end loop;
 if exists(select 1 from public.connect_delivery_v2 where message_id=new.id and channel<>'none') then
 perform public.connect_dispatch_v2(false);
 end if;
 return new;
end $$;
revoke all on function public.connect_message_queue_v2() from public,anon,authenticated;
create trigger connect_message_queue_v2 after insert on public.connect_messages_v1 for each row execute function public.connect_message_queue_v2();

create function public.connect_delivery_claim_v2(p_limit int default 12) returns setof public.connect_delivery_v2
language plpgsql security definer set search_path='' as $$ begin
 update public.connect_delivery_v2 set status='unknown',error_code='LEASE_EXPIRED' where status='sending' and lease_at<now()-interval '2 minutes';
 update public.connect_delivery_v2 set status='cancelled',error_code='EXPIRED' where status in('pending','failed') and expires_at<=now();
 update public.connect_delivery_v2 d set status='cancelled',error_code='LEGACY_SENT' where d.status in('pending','failed') and d.channel='fcm' and exists(select 1 from public.connect_push_delivery_v1 old where old.message_id=d.message_id and old.recipient_id=d.recipient_id and old.sent_at is not null);
 -- Revalidate current membership and permission before transport, not just at message creation.
 update public.connect_delivery_v2 d set status='cancelled',error_code='ACCESS_CHANGED' where d.status in('pending','failed') and
 (not public.connect_active_staff_v1(d.recipient_id) or (d.room_id is not null and not exists(select 1 from public.connect_room_members_v1 m where m.room_id=d.room_id and m.user_id=d.recipient_id))
 or(d.kind='video_call' and (not exists(select 1 from public.connect_permissions_v1 p where p.user_id=d.recipient_id and p.video_enabled)
 or (d.call_id is not null and not exists(select 1 from public.connect_calls_v2 c join public.connect_call_members_v2 cm on cm.call_id=c.id and cm.user_id=d.recipient_id where c.id=d.call_id and c.status in('ringing','active') and c.ring_until>now() and cm.state='invited')))));
 return query with picked as(select id from public.connect_delivery_v2 where status in('pending','failed') and attempts<3 and next_attempt_at<=now() and expires_at>now() order by case when kind='video_call' then 0 else 1 end,created_at for update skip locked limit least(greatest(p_limit,1),12))
 update public.connect_delivery_v2 d set status='sending',attempts=d.attempts+1,lease_at=now() from picked p where d.id=p.id returning d.*;
end $$;
revoke all on function public.connect_delivery_claim_v2(int) from public,anon,authenticated;
grant execute on function public.connect_delivery_claim_v2(int) to service_role;

create function public.connect_call_action_v2(p_room_id uuid,p_action text,p_call_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c public.connect_calls_v2;r record;begin
 if u is null or not public.connect_is_member_v1(p_room_id) or not exists(select 1 from public.connect_permissions_v1 where user_id=u and chat_enabled and video_enabled) then raise exception 'CONNECT_VIDEO_ACCESS' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_room_id::text,216));
 update public.connect_calls_v2 set status=case when status='ringing' then 'missed' else 'ended' end,ended_at=now() where room_id=p_room_id and ((status='ringing' and ring_until<=now()) or (status='active' and created_at<now()-interval '5 hours'));
 if p_call_id is null then select * into c from public.connect_calls_v2 where room_id=p_room_id and status in('ringing','active') order by created_at desc limit 1;
 else select * into c from public.connect_calls_v2 where id=p_call_id and room_id=p_room_id;end if;
 if p_action='start' and c.id is null then
 insert into public.connect_calls_v2(room_id,caller_id) values(p_room_id,u) returning * into c;
 insert into public.connect_call_members_v2(call_id,user_id,state) select c.id,m.user_id,case when m.user_id=u then 'accepted' else 'invited' end from public.connect_room_members_v1 m join public.connect_permissions_v1 p on p.user_id=m.user_id where m.room_id=p_room_id and p.chat_enabled and p.video_enabled and public.connect_active_staff_v1(m.user_id);
 insert into public.connect_messages_v1(room_id,sender_id,body,call_id) values(p_room_id,u,'📹 Начался видеозвонок. Откройте этот чат и нажмите «Видеозвонок», чтобы присоединиться.',c.id);
 elsif p_action in('accept','decline','leave','end') then
 if c.id is null or c.status not in('ringing','active') then raise exception 'CONNECT_CALL_EXPIRED';end if;
 if p_action='end' and c.caller_id<>u then raise exception 'CONNECT_CALL_OWNER' using errcode='42501';end if;
 if p_action='accept' then
 insert into public.connect_call_members_v2(call_id,user_id,state) values(c.id,u,'accepted') on conflict(call_id,user_id) do update set state='accepted',updated_at=now();
 update public.connect_calls_v2 set status='active' where id=c.id and caller_id<>u;
 else
 update public.connect_call_members_v2 set state=case when p_action='decline' then 'declined' else 'left' end,updated_at=now() where call_id=c.id and user_id=u;
 if c.caller_id=u or not exists(select 1 from public.connect_call_members_v2 where call_id=c.id and state='accepted') then update public.connect_calls_v2 set status='ended',ended_at=now() where id=c.id;end if;
 end if;
 elsif p_action not in('get','start') then raise exception 'CONNECT_CALL_ACTION';end if;
 if c.id is null then return jsonb_build_object('call',null);end if;
 select * into c from public.connect_calls_v2 where id=c.id;
 return jsonb_build_object('call',to_jsonb(c),'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.connect_call_members_v2 m where m.call_id=c.id));
end $$;
revoke all on function public.connect_call_action_v2(uuid,text,uuid) from public,anon;
grant execute on function public.connect_call_action_v2(uuid,text,uuid) to authenticated;

create function public.connect_mark_read_v2(p_room_id uuid,p_message_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$ declare t timestamptz;begin
 if auth.uid() is null or not public.connect_is_member_v1(p_room_id) then raise exception 'CONNECT_READ_ACCESS' using errcode='42501';end if;
 select created_at into t from public.connect_messages_v1 where id=p_message_id and room_id=p_room_id;
 if t is null then return false;end if;
 update public.connect_room_members_v1 set last_read_at=greatest(last_read_at,t) where room_id=p_room_id and user_id=auth.uid();return true;
end $$;
revoke all on function public.connect_mark_read_v2(uuid,uuid) from public,anon;
grant execute on function public.connect_mark_read_v2(uuid,uuid) to authenticated;
-- Existing attachment path checks remain. Fix correlation without widening any policy.
alter policy connect_attachment_insert_v1 on public.connect_attachments_v1 with check(
 sender_id=(select auth.uid()) and public.connect_is_member_v1(room_id)
 and exists(select 1 from public.connect_messages_v1 m where m.id=connect_attachments_v1.message_id and m.room_id=connect_attachments_v1.room_id and m.sender_id=(select auth.uid()))
 and exists(select 1 from storage.objects so where so.bucket_id='crm-connect-media-v1' and so.name=connect_attachments_v1.file_path));
create index if not exists connect_attachments_sender_v2 on public.connect_attachments_v1(sender_id);
create index if not exists connect_push_delivery_message_v2 on public.connect_push_delivery_v1(message_id);
create index if not exists connect_push_delivery_recipient_v2 on public.connect_push_delivery_v1(recipient_id);
create index if not exists connect_permissions_updated_by_v2 on public.connect_permissions_v1(updated_by);

create function public.connect_dispatch_v2(p_dry_run boolean default false) returns bigint language plpgsql security definer set search_path='' as $$
declare s text;r bigint;begin
 select value->>'secret' into s from public.connect_runtime_v2 where key='dispatch';
 select net.http_post(url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/connect-delivery-v2',headers:=jsonb_build_object('content-type','application/json','x-connect-secret',s),body:=jsonb_build_object('action','dispatch','dry_run',p_dry_run),timeout_milliseconds:=120000) into r;return r;
end $$;
revoke all on function public.connect_dispatch_v2(boolean) from public,anon,authenticated;
grant execute on function public.connect_dispatch_v2(boolean) to service_role;
-- Schedule is enabled in a separate migration after transport has been deployed and probed.
create function public.connect_room_previews_v2() returns table(room_id uuid,body text,sender_id uuid,created_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select rm.room_id,m.body,m.sender_id,m.created_at from public.connect_room_members_v1 rm
 left join lateral(select cm.body,cm.sender_id,cm.created_at from public.connect_messages_v1 cm where cm.room_id=rm.room_id order by cm.created_at desc,cm.id desc limit 1)m on true
 where rm.user_id=(select auth.uid()) and public.connect_active_staff_v1((select auth.uid()));
$$;
revoke all on function public.connect_room_previews_v2() from public,anon;
grant execute on function public.connect_room_previews_v2() to authenticated;
