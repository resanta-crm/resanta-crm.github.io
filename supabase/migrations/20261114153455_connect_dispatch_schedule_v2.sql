-- Per-user chat quiet mode, no changes to shared room membership or permissions.
create table public.connect_preferences_v2(user_id uuid not null references auth.users(id) on delete cascade,room_id uuid not null references public.connect_rooms_v1(id) on delete cascade,muted boolean not null default false,primary key(user_id,room_id));
create index connect_preferences_room_v2 on public.connect_preferences_v2(room_id);
alter table public.connect_preferences_v2 enable row level security;
revoke all on public.connect_preferences_v2 from public,anon,authenticated;
grant select on public.connect_preferences_v2 to authenticated;
grant all on public.connect_preferences_v2 to service_role;
create policy connect_preferences_read_v2 on public.connect_preferences_v2 for select to authenticated using(user_id=(select auth.uid()) and public.connect_is_member_v1(room_id));
create function public.connect_set_mute_v2(p_room_id uuid,p_muted boolean) returns boolean language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.connect_is_member_v1(p_room_id) then raise exception 'CONNECT_MEMBER_REQUIRED' using errcode='42501';end if;
 insert into public.connect_preferences_v2(user_id,room_id,muted) values(auth.uid(),p_room_id,p_muted) on conflict(user_id,room_id) do update set muted=excluded.muted;return true;
end $$;
revoke all on function public.connect_set_mute_v2(uuid,boolean) from public,anon;
grant execute on function public.connect_set_mute_v2(uuid,boolean) to authenticated;
-- Cancels only pending tasks belonging to the user who muted this room.
create function public.connect_mute_pending_v2() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.muted then update public.connect_delivery_v2 set status='cancelled',error_code='CHAT_MUTED' where recipient_id=new.user_id and room_id=new.room_id and status in('pending','failed');end if;return new;
end $$;
revoke all on function public.connect_mute_pending_v2() from public,anon,authenticated;
create trigger connect_mute_pending_v2 after insert or update on public.connect_preferences_v2 for each row execute function public.connect_mute_pending_v2();
-- Worker RPC revalidates mute immediately before claim; retain all existing checks.
create or replace function public.connect_delivery_claim_v2(p_limit int default 12) returns setof public.connect_delivery_v2
language plpgsql security definer set search_path='' as $$ begin
 update public.connect_delivery_v2 set status='unknown',error_code='LEASE_EXPIRED' where status='sending' and lease_at<now()-interval '2 minutes';
 update public.connect_delivery_v2 set status='cancelled',error_code='EXPIRED' where status in('pending','failed') and expires_at<=now();
 update public.connect_delivery_v2 d set status='cancelled',error_code='LEGACY_SENT' where d.status in('pending','failed') and d.channel='fcm' and exists(select 1 from public.connect_push_delivery_v1 old where old.message_id=d.message_id and old.recipient_id=d.recipient_id and old.sent_at is not null);
 -- Revalidate current membership and permission before transport, not just at message creation.
 update public.connect_delivery_v2 d set status='cancelled',error_code='ACCESS_CHANGED' where d.status in('pending','failed') and
 (exists(select 1 from public.connect_preferences_v2 pref where pref.user_id=d.recipient_id and pref.room_id=d.room_id and pref.muted) or not public.connect_active_staff_v1(d.recipient_id) or (d.room_id is not null and not exists(select 1 from public.connect_room_members_v1 m where m.room_id=d.room_id and m.user_id=d.recipient_id))
 or(d.kind='video_call' and (not exists(select 1 from public.connect_permissions_v1 p where p.user_id=d.recipient_id and p.video_enabled)
 or (d.call_id is not null and not exists(select 1 from public.connect_calls_v2 c join public.connect_call_members_v2 cm on cm.call_id=c.id and cm.user_id=d.recipient_id where c.id=d.call_id and c.status in('ringing','active') and c.ring_until>now() and cm.state='invited')))));
 return query with picked as(select id from public.connect_delivery_v2 where status in('pending','failed') and attempts<3 and next_attempt_at<=now() and expires_at>now() order by case when kind='video_call' then 0 else 1 end,created_at for update skip locked limit least(greatest(p_limit,1),12))
 update public.connect_delivery_v2 d set status='sending',attempts=d.attempts+1,lease_at=now() from picked p where d.id=p.id returning d.*;
end $$;
revoke all on function public.connect_delivery_claim_v2(int) from public,anon,authenticated;
grant execute on function public.connect_delivery_claim_v2(int) to service_role;

create or replace function public.connect_message_queue_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;k text;begin
 if new.call_id is not null and not exists(select 1 from public.connect_calls_v2 c where c.id=new.call_id and c.room_id=new.room_id and c.caller_id=new.sender_id) then raise exception 'CONNECT_CALL_MESSAGE_SCOPE';end if;
 k:=case when new.call_id is not null or new.body like '📹 Начался видеозвонок%' then 'video_call' else 'message' end;
 for r in select m.user_id from public.connect_room_members_v1 m join public.connect_permissions_v1 p on p.user_id=m.user_id
 where m.room_id=new.room_id and m.user_id<>new.sender_id and p.chat_enabled and (k<>'video_call' or p.video_enabled) and public.connect_active_staff_v1(m.user_id) and not exists(select 1 from public.connect_preferences_v2 pref where pref.user_id=m.user_id and pref.room_id=m.room_id and pref.muted)
 loop perform public.connect_enqueue_v2('message:'||new.id,new.id,new.room_id,new.call_id,r.user_id,k,now()+case when k='video_call' then interval '90 seconds' else interval '1 day' end);end loop;
 if exists(select 1 from public.connect_delivery_v2 where message_id=new.id and channel<>'none') then
 perform public.connect_dispatch_v2(false);
 end if;
 return new;
end $$;
revoke all on function public.connect_message_queue_v2() from public,anon,authenticated;

select cron.schedule('connect-delivery-v2','* * * * *','select public.connect_dispatch_v2(false)');
