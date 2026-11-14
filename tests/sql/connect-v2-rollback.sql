begin;
-- All rooms, calls, queue rows and pg_net requests below roll back. No notifications are sent.
select set_config('request.jwt.claim.sub','544fb1e2-ef70-44de-bc62-e0e1596a4bfc',true);
do $$ declare r uuid;other_r uuid;c jsonb;first_call uuid;m uuid;d uuid;f uuid;before_read timestamptz;
begin
 insert into public.connect_rooms_v1(kind,title,created_by) values('group','CONNECT rollback-only test',auth.uid()) returning id into r;
 insert into public.connect_room_members_v1(room_id,user_id,role) values(r,auth.uid(),'owner'),(r,'19dd9943-99ae-47c4-a39c-4f82a11059a6','member');
 c:=public.connect_call_action_v2(r,'start');first_call:=(c->'call'->>'id')::uuid;
 assert first_call is not null,'call created';
 c:=public.connect_call_action_v2(r,'start');assert (c->'call'->>'id')::uuid=first_call,'second click reuses call';
 assert (select count(*)=1 from public.connect_messages_v1 where call_id=first_call),'one invitation only';
 c:=public.connect_call_action_v2(r,'accept',first_call);assert c->'call'->>'status'='ringing','caller alone does not accept own invitation';
 perform set_config('request.jwt.claim.sub','19dd9943-99ae-47c4-a39c-4f82a11059a6',true);
 c:=public.connect_call_action_v2(r,'accept',first_call);assert c->'call'->>'status'='active','recipient accepts';
 begin perform public.connect_call_action_v2(r,'end',first_call);raise exception 'nonowner ended call';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','544fb1e2-ef70-44de-bc62-e0e1596a4bfc',true);
 c:=public.connect_call_action_v2(r,'leave',first_call);assert c->'call'->>'status'='ended','caller leave ends session';
 insert into public.connect_messages_v1(room_id,sender_id,body,created_at) values(r,auth.uid(),'rollback read bound',now()-interval '2 seconds') returning id into m;
 perform set_config('request.jwt.claim.sub','19dd9943-99ae-47c4-a39c-4f82a11059a6',true);
 update public.connect_room_members_v1 set last_read_at=now()-interval '10 seconds' where room_id=r and user_id=auth.uid();
 perform public.connect_mark_read_v2(r,m);
 select last_read_at into before_read from public.connect_room_members_v1 where room_id=r and user_id=auth.uid();
 assert before_read=(select created_at from public.connect_messages_v1 where id=m),'read bound is shown message, not server now';
 perform set_config('request.jwt.claim.sub','4fd79fa0-232d-4768-8099-25f47923cc4f',true);
 begin perform public.connect_mark_read_v2(r,m);raise exception 'nonmember read';exception when insufficient_privilege then null;end;
 begin perform public.connect_call_action_v2(r,'get',first_call);raise exception 'nonmember call';exception when insufficient_privilege then null;end;
 -- Lease expiry becomes unknown and cannot be claimed repeatedly.
 select id into d from public.connect_delivery_v2 where message_id=m and channel='fcm' limit 1;
 assert d is not null,'message trigger enqueued native recipient';
 update public.connect_delivery_v2 set status='sending',lease_at=now()-interval '3 minutes',attempts=1 where id=d;
 perform public.connect_delivery_claim_v2(12);
 assert (select status='unknown' from public.connect_delivery_v2 where id=d),'uncertain delivery no blind retry';
 -- Private tables: authenticated role never has SELECT on tokens or queue.
 assert not has_table_privilege('authenticated','public.connect_web_devices_v2','select'),'private web subscriptions';
 assert not has_table_privilege('authenticated','public.connect_runtime_v2','select'),'private VAPID/dispatch secrets';
 assert not has_function_privilege('authenticated','public.connect_delivery_claim_v2(integer)','execute'),'service-only claim';
end $$;
rollback;
select 'PASS: calls, ownership, read boundary, queue, leases and private grants; transaction rolled back' result;
