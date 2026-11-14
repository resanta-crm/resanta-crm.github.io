-- Structured calls only. Plain text can no longer spoof an incoming call.
create or replace function public.connect_message_queue_v2() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;k text;begin
 if new.call_id is not null and not exists(select 1 from public.connect_calls_v2 c where c.id=new.call_id and c.room_id=new.room_id and c.caller_id=new.sender_id) then raise exception 'CONNECT_CALL_MESSAGE_SCOPE';end if;
 k:=case when new.call_id is not null then 'video_call' else 'message' end;
 for r in select m.user_id from public.connect_room_members_v1 m join public.connect_permissions_v1 p on p.user_id=m.user_id
 where m.room_id=new.room_id and m.user_id<>new.sender_id and p.chat_enabled and (k<>'video_call' or p.video_enabled) and public.connect_active_staff_v1(m.user_id) and not exists(select 1 from public.connect_preferences_v2 pref where pref.user_id=m.user_id and pref.room_id=m.room_id and pref.muted)
 loop perform public.connect_enqueue_v2('message:'||new.id,new.id,new.room_id,new.call_id,r.user_id,k,now()+case when k='video_call' then interval '90 seconds' else interval '1 day' end);end loop;
 if exists(select 1 from public.connect_delivery_v2 where message_id=new.id and channel<>'none') then
 perform public.connect_dispatch_v2(false);
 end if;
 return new;
end $$;
revoke all on function public.connect_message_queue_v2() from public,anon,authenticated;

