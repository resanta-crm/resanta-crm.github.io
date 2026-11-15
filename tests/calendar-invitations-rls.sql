-- Transactional verification. ROLLBACK also discards queued HTTP notifications.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','544fb1e2-ef70-44de-bc62-e0e1596a4bfc',true);
do $$ declare m uuid;begin
 insert into public.crm_ai360_meetings_v1(owner_id,kind,format,title,purpose,starts_at,duration_minutes,participant_ids,reminder_minutes,agenda,minutes)
 values(auth.uid(),'meeting','internal','Тест','',date_trunc('day',now())+interval '20 days 3 hours',30,array['19dd9943-99ae-47c4-a39c-4f82a11059a6'::uuid],15,'{"private":"never_share"}','private organizer minutes') returning id into m;
 perform set_config('calendar.test.id',m::text,true);
 if (select count(*) from public.crm_calendar_invites_v3 where meeting_id=m)<>1 then raise exception 'invite_missing';end if;
 perform public.crm_calendar_update_v2(m,(select updated_at from public.crm_ai360_meetings_v1 where id=m),jsonb_build_object('starts_at',date_trunc('day',now())+interval '20 days 4 hours'));
end $$;
select set_config('request.jwt.claim.sub','19dd9943-99ae-47c4-a39c-4f82a11059a6',true);
do $$ declare m uuid:=current_setting('calendar.test.id')::uuid;r jsonb;begin
 if exists(select 1 from public.crm_ai360_meetings_v1 where id=m) then raise exception 'organizer_row_leaked';end if;
 select x into r from jsonb_array_elements(public.crm_calendar_list_v3(date_trunc('day',now())+interval '20 days',date_trunc('day',now())+interval '21 days')) x where x->>'id'=m::text;
 if r is null or r->'agenda'<>'{}'::jsonb or r->>'minutes'<>'' or r->>'is_owner'<>'false' then raise exception 'invitation_projection_failed';end if;
 begin perform public.crm_calendar_update_v2(m,now(),'{"status":"cancelled"}');raise exception 'foreign_update_allowed';exception when others then if sqlerrm<>'meeting_not_found' then raise;end if;end;
 if jsonb_array_length(public.crm_calendar_inbox_v3())<1 then raise exception 'inbox_missing';end if;
end $$;
do $$ declare e jsonb;begin
 select x into e from jsonb_array_elements(public.crm_calendar_inbox_v3()) x where x->>'meeting_id'=current_setting('calendar.test.id') limit 1;
 if not public.crm_calendar_ack_v3((e->>'id')::uuid) then raise exception 'ack_failed';end if;
 perform set_config('calendar.test.event',e->>'id',true);
end $$;
select set_config('request.jwt.claim.sub','544fb1e2-ef70-44de-bc62-e0e1596a4bfc',true);
do $$ declare m uuid:=current_setting('calendar.test.id')::uuid;begin
 perform public.crm_calendar_update_v2(m,(select updated_at from public.crm_ai360_meetings_v1 where id=m),jsonb_build_object('starts_at',date_trunc('day',now())+interval '20 days 5 hours'));
 if public.crm_calendar_delivery_status_v3(m)->0->>'seen_at' is not null then raise exception 'old_read_receipt_reused';end if;
end $$;
select set_config('request.jwt.claim.sub','3d935a76-c6fe-44b6-b248-fcbe58c6bf1c',true);
do $$ begin
 if exists(select 1 from public.crm_calendar_invites_v3 where meeting_id=current_setting('calendar.test.id')::uuid) then raise exception 'uninvited_user_saw_invite';end if;
 if public.crm_calendar_ack_v3(current_setting('calendar.test.event')::uuid) then raise exception 'foreign_event_ack_allowed';end if;
end $$;
select set_config('request.jwt.claim.sub','bcc330b8-9100-4c60-b87f-22a36988fc97',true);
do $$ begin
 begin perform public.crm_calendar_list_v3(now(),now()+interval '1 day');raise exception 'excluded_user_allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','544fb1e2-ef70-44de-bc62-e0e1596a4bfc',true);
do $$ declare m uuid:=current_setting('calendar.test.id')::uuid;begin
 begin perform public.crm_calendar_update_v2(m,(select updated_at from public.crm_ai360_meetings_v1 where id=m),jsonb_build_object('participant_ids',jsonb_build_array('bcc330b8-9100-4c60-b87f-22a36988fc97')));raise exception 'excluded_participant_allowed';exception when others then if sqlerrm<>'invalid_calendar_participants' then raise;end if;end;
 perform public.crm_calendar_update_v2(m,(select updated_at from public.crm_ai360_meetings_v1 where id=m),'{"status":"cancelled"}');
 if exists(select 1 from public.crm_calendar_invites_v3 where meeting_id=m and state<>'withdrawn') then raise exception 'cancel_did_not_withdraw_invites';end if;
end $$;
reset role;
select jsonb_build_object('passed',true,'invites',(select count(*) from public.crm_calendar_invites_v3 where meeting_id=current_setting('calendar.test.id')::uuid),'pending_reminders',(select count(*) from public.crm_calendar_events_v3 where meeting_id=current_setting('calendar.test.id')::uuid and kind='reminder' and status='pending')) as verification;
rollback;
