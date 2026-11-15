-- Read status belongs to the latest invitation/update, not an older event.
create or replace function public.crm_calendar_delivery_status_v3(p_meeting uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if not public.crm_calendar_access_v2() or not exists(select 1 from public.crm_ai360_meetings_v1 where id=p_meeting and owner_id=auth.uid()) then raise exception 'calendar_not_allowed' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('name',u.name,'state',i.state,'seen_at',(select e.seen_at from public.crm_calendar_events_v3 e where e.meeting_id=i.meeting_id and e.recipient_id=i.recipient_id and e.kind<>'reminder' order by e.revision desc limit 1),'delivery',(select jsonb_build_object('status',e.status,'channels',e.results) from public.crm_calendar_events_v3 e where e.meeting_id=i.meeting_id and e.recipient_id=i.recipient_id and e.kind<>'reminder' order by e.created_at desc,e.revision desc limit 1)) order by u.name),'[]') from public.crm_calendar_invites_v3 i join public.users u on u.id=i.recipient_id where i.meeting_id=p_meeting);
end $$;
revoke all on function public.crm_calendar_delivery_status_v3(uuid) from public,anon;
grant execute on function public.crm_calendar_delivery_status_v3(uuid) to authenticated;

