-- Calendar-only invitations. Recipients receive scheduling fields, never the
-- organizer's analytical agenda, minutes, client access or other CRM privileges.
alter table public.crm_ai360_meetings_v1 drop constraint crm_ai360_meetings_v1_title_check;
alter table public.crm_ai360_meetings_v1 add constraint crm_ai360_meetings_v1_title_check check(char_length(trim(title)) between 3 and 160);
alter table public.crm_ai360_meetings_v1 drop constraint crm_ai360_meetings_v1_purpose_check;
alter table public.crm_ai360_meetings_v1 add constraint crm_ai360_meetings_v1_purpose_check check(char_length(purpose)<=800);
alter table public.crm_ai360_meetings_v1 add column participant_ids uuid[] not null default '{}' check(cardinality(participant_ids)<=20);
alter table public.crm_ai360_meetings_v1 add column reminder_minutes integer not null default 0 check(reminder_minutes in(0,15,30,60,1440));
grant update(participant_ids,reminder_minutes) on public.crm_ai360_meetings_v1 to authenticated;

create table public.crm_calendar_invites_v3(
 meeting_id uuid not null references public.crm_ai360_meetings_v1(id) on delete cascade,
 recipient_id uuid not null references public.users(id),organizer_id uuid not null references public.users(id),
 state text not null check(state in('invited','accepted','declined','withdrawn')),
 seen_at timestamptz,updated_at timestamptz not null default now(),primary key(meeting_id,recipient_id));
create index crm_calendar_invites_recipient_v3 on public.crm_calendar_invites_v3(recipient_id,meeting_id);
alter table public.crm_calendar_invites_v3 enable row level security;
revoke all on public.crm_calendar_invites_v3 from public,anon,authenticated;
grant select on public.crm_calendar_invites_v3 to authenticated;
grant all on public.crm_calendar_invites_v3 to service_role;
create policy calendar_invites_read_v3 on public.crm_calendar_invites_v3 for select to authenticated
 using((recipient_id=(select auth.uid()) or organizer_id=(select auth.uid())) and (select public.crm_calendar_access_v2()));

create table public.crm_calendar_events_v3(
 id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.crm_ai360_meetings_v1(id) on delete cascade,
 recipient_id uuid not null references public.users(id),kind text not null check(kind in('invitation','changed','cancelled','reminder')),
 revision timestamptz not null,starts_at timestamptz not null,due_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','sending','sent','partial','failed','unknown','no_channel','cancelled')),
 results jsonb not null default '[]',created_at timestamptz not null default now(),attempted_at timestamptz,seen_at timestamptz,
 unique(meeting_id,recipient_id,kind,revision));
create index crm_calendar_events_due_v3 on public.crm_calendar_events_v3(due_at) where status='pending';
create index crm_calendar_events_recipient_v3 on public.crm_calendar_events_v3(recipient_id,created_at desc);
alter table public.crm_calendar_events_v3 enable row level security;
revoke all on public.crm_calendar_events_v3 from public,anon,authenticated;
grant all on public.crm_calendar_events_v3 to service_role;

create function public.crm_calendar_directory_v3() returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if not public.crm_calendar_access_v2() then raise exception 'calendar_not_allowed' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'telegram',exists(select 1 from public.crm_telegram_bindings b where b.user_id=u.id and b.active)) order by u.name),'[]') from public.users u where u.role<>'auditor_pending' and u.id<>'bcc330b8-9100-4c60-b87f-22a36988fc97'::uuid);
end $$;
revoke all on function public.crm_calendar_directory_v3() from public,anon;
grant execute on function public.crm_calendar_directory_v3() to authenticated;

create function public.crm_calendar_invite_guard_v3() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if cardinality(new.participant_ids)>20 or cardinality(new.participant_ids)<>(select count(distinct x) from unnest(new.participant_ids) x) or exists(select 1 from unnest(new.participant_ids) x where not exists(select 1 from public.users u where u.id=x and u.role<>'auditor_pending' and u.id<>'bcc330b8-9100-4c60-b87f-22a36988fc97'::uuid)) then raise exception 'invalid_calendar_participants';end if;
 if cardinality(new.participant_ids)>0 or (tg_op='UPDATE' and cardinality(old.participant_ids)>0) then
 new.participants:=array(select u.name from public.users u where u.id=any(new.participant_ids) order by u.id);
 end if;
 return new;
end $$;
revoke all on function public.crm_calendar_invite_guard_v3() from public,anon,authenticated;
create trigger crm_calendar_invite_guard_v3 before insert or update of participant_ids on public.crm_ai360_meetings_v1 for each row execute function public.crm_calendar_invite_guard_v3();

create function public.crm_calendar_dispatch_v3() returns bigint
language plpgsql security definer set search_path='' as $$ declare s text;r bigint;begin
 select value->>'secret' into s from public.crm_telegram_runtime where key='dispatch_secret';
 select net.http_post(url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-calendar-delivery-v3',headers:=jsonb_build_object('content-type','application/json','x-crm-dispatch-secret',s),body:='{}'::jsonb,timeout_milliseconds:=120000) into r;return r;
end $$;
revoke all on function public.crm_calendar_dispatch_v3() from public,anon,authenticated;
grant execute on function public.crm_calendar_dispatch_v3() to service_role;

create function public.crm_calendar_queue_v3() returns trigger
language plpgsql security definer set search_path='' as $$ declare p uuid;was boolean;k text;begin
 if tg_op='UPDATE' and row(new.title,new.purpose,new.starts_at,new.duration_minutes,new.status,new.participant_ids,new.reminder_minutes) is not distinct from row(old.title,old.purpose,old.starts_at,old.duration_minutes,old.status,old.participant_ids,old.reminder_minutes) then return new;end if;
 update public.crm_calendar_events_v3 set status='cancelled' where meeting_id=new.id and status='pending';
 update public.crm_calendar_events_v3 set seen_at=coalesce(seen_at,now()) where meeting_id=new.id;
 for p in select recipient_id from public.crm_calendar_invites_v3 where meeting_id=new.id and state<>'withdrawn' and (new.status='cancelled' or not(recipient_id=any(new.participant_ids))) loop
  update public.crm_calendar_invites_v3 set state='withdrawn',seen_at=null,updated_at=new.updated_at where meeting_id=new.id and recipient_id=p;
  insert into public.crm_calendar_events_v3(meeting_id,recipient_id,kind,revision,starts_at,due_at) values(new.id,p,'cancelled',new.updated_at,new.starts_at,now()) on conflict do nothing;
 end loop;
 if new.status='scheduled' then
  foreach p in array new.participant_ids loop
   select exists(select 1 from public.crm_calendar_invites_v3 where meeting_id=new.id and recipient_id=p and state<>'withdrawn') into was;
   k:=case when was then 'changed' else 'invitation' end;
   insert into public.crm_calendar_invites_v3(meeting_id,recipient_id,organizer_id,state,updated_at) values(new.id,p,new.owner_id,'invited',new.updated_at)
   on conflict(meeting_id,recipient_id) do update set state='invited',seen_at=null,updated_at=excluded.updated_at;
   insert into public.crm_calendar_events_v3(meeting_id,recipient_id,kind,revision,starts_at,due_at) values(new.id,p,k,new.updated_at,new.starts_at,now()) on conflict do nothing;
  end loop;
  if new.reminder_minutes>0 and new.starts_at>now() then
   for p in select distinct x from unnest(array_append(new.participant_ids,new.owner_id)) x loop
    insert into public.crm_calendar_events_v3(meeting_id,recipient_id,kind,revision,starts_at,due_at) values(new.id,p,'reminder',new.updated_at,new.starts_at,greatest(now(),new.starts_at-make_interval(mins=>new.reminder_minutes))) on conflict do nothing;
   end loop;
  end if;
 end if;
 if exists(select 1 from public.crm_calendar_events_v3 where meeting_id=new.id and status='pending' and due_at<=now()) then perform public.crm_calendar_dispatch_v3();end if;
 return new;
end $$;
revoke all on function public.crm_calendar_queue_v3() from public,anon,authenticated;
create trigger crm_calendar_queue_v3 after insert or update on public.crm_ai360_meetings_v1 for each row execute function public.crm_calendar_queue_v3();

-- A fixed projection: invited users cannot query organizer analytics or minutes.
create function public.crm_calendar_list_v3(p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if not public.crm_calendar_access_v2() or p_to<=p_from or p_to-p_from>interval '65 days' then raise exception 'calendar_not_allowed' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(j order by j->>'starts_at',j->>'id'),'[]') from (
 select to_jsonb(m)||jsonb_build_object('is_owner',true) as j from public.crm_ai360_meetings_v1 m where m.owner_id=auth.uid() and m.status='scheduled' and m.starts_at>=p_from and m.starts_at<p_to
 union all
 select jsonb_build_object('id',m.id,'owner_id',m.owner_id,'title',m.title,'purpose',m.purpose,'starts_at',m.starts_at,'duration_minutes',m.duration_minutes,'format',m.format,'location',m.location,'participants',m.participants,'status',m.status,'updated_at',m.updated_at,'agenda','{}'::jsonb,'minutes','','is_owner',false,'invitation_state',i.state,'organizer',u.name)
 from public.crm_calendar_invites_v3 i join public.crm_ai360_meetings_v1 m on m.id=i.meeting_id join public.users u on u.id=m.owner_id
 where i.recipient_id=auth.uid() and m.owner_id<>auth.uid() and i.state in('invited','accepted') and m.status='scheduled' and m.starts_at>=p_from and m.starts_at<p_to
 ) q);
end $$;
revoke all on function public.crm_calendar_list_v3(timestamptz,timestamptz) from public,anon;
grant execute on function public.crm_calendar_list_v3(timestamptz,timestamptz) to authenticated;

create function public.crm_calendar_inbox_v3() returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if not public.crm_calendar_access_v2() then return '[]';end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select e.id,e.meeting_id,e.kind,e.starts_at,m.title,u.name as organizer from public.crm_calendar_events_v3 e join public.crm_ai360_meetings_v1 m on m.id=e.meeting_id join public.users u on u.id=m.owner_id
 where e.recipient_id=auth.uid() and e.seen_at is null and e.due_at<=now() and e.due_at>now()-interval '1 day' and e.status<>'cancelled' order by e.due_at desc limit 20) q);
end $$;
revoke all on function public.crm_calendar_inbox_v3() from public,anon;
grant execute on function public.crm_calendar_inbox_v3() to authenticated;
create function public.crm_calendar_ack_v3(p_event uuid) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if not public.crm_calendar_access_v2() then return false;end if;
 update public.crm_calendar_events_v3 set seen_at=now() where id=p_event and recipient_id=auth.uid();return found;
end $$;
revoke all on function public.crm_calendar_ack_v3(uuid) from public,anon;
grant execute on function public.crm_calendar_ack_v3(uuid) to authenticated;

create function public.crm_calendar_delivery_status_v3(p_meeting uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if not public.crm_calendar_access_v2() or not exists(select 1 from public.crm_ai360_meetings_v1 where id=p_meeting and owner_id=auth.uid()) then raise exception 'calendar_not_allowed' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('name',u.name,'state',i.state,'seen_at',(select max(e.seen_at) from public.crm_calendar_events_v3 e where e.meeting_id=i.meeting_id and e.recipient_id=i.recipient_id),'delivery',(select jsonb_build_object('status',e.status,'channels',e.results) from public.crm_calendar_events_v3 e where e.meeting_id=i.meeting_id and e.recipient_id=i.recipient_id and e.kind<>'reminder' order by e.created_at desc,e.revision desc limit 1)) order by u.name),'[]') from public.crm_calendar_invites_v3 i join public.users u on u.id=i.recipient_id where i.meeting_id=p_meeting);
end $$;
revoke all on function public.crm_calendar_delivery_status_v3(uuid) from public,anon;
grant execute on function public.crm_calendar_delivery_status_v3(uuid) to authenticated;

create function public.crm_calendar_events_claim_v3() returns setof public.crm_calendar_events_v3
language plpgsql security definer set search_path='' as $$ begin
 update public.crm_calendar_events_v3 set status='unknown' where status='sending' and attempted_at<now()-interval '5 minutes';
 update public.crm_calendar_events_v3 e set status='cancelled' where e.status='pending' and (not exists(select 1 from public.users u where u.id=e.recipient_id and u.role<>'auditor_pending' and u.id<>'bcc330b8-9100-4c60-b87f-22a36988fc97'::uuid) or (e.kind<>'cancelled' and not exists(select 1 from public.crm_ai360_meetings_v1 m where m.id=e.meeting_id and m.status='scheduled' and m.starts_at=e.starts_at and (m.owner_id=e.recipient_id or exists(select 1 from public.crm_calendar_invites_v3 i where i.meeting_id=m.id and i.recipient_id=e.recipient_id and i.state in('invited','accepted'))))) or (e.kind='reminder' and e.starts_at<=now()));
 return query with picked as(select id from public.crm_calendar_events_v3 where status='pending' and due_at<=now() order by due_at for update skip locked limit 10)
 update public.crm_calendar_events_v3 e set status='sending',attempted_at=now() from picked p where e.id=p.id returning e.*;
end $$;
revoke all on function public.crm_calendar_events_claim_v3() from public,anon,authenticated;
grant execute on function public.crm_calendar_events_claim_v3() to service_role;

select cron.schedule('calendar-delivery-v3','* * * * *','select public.crm_calendar_dispatch_v3()');

create or replace function public.crm_calendar_update_v2(p_id uuid,p_expected timestamptz,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set statement_timeout='8s' as $$
declare m public.crm_ai360_meetings_v1;
begin
 if not public.crm_calendar_access_v2() then raise exception 'calendar_not_allowed'; end if;
 if jsonb_typeof(p_patch)<>'object' or p_patch-'title'-'purpose'-'starts_at'-'duration_minutes'-'status'-'agenda'-'minutes'-'participant_ids'-'reminder_minutes'<>'{}'::jsonb then raise exception 'invalid_patch'; end if;
 select * into m from public.crm_ai360_meetings_v1 where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'meeting_not_found'; end if;
 if p_expected is null or m.updated_at<>p_expected then raise exception 'meeting_changed_refresh'; end if;
 update public.crm_ai360_meetings_v1 set
 title=case when p_patch?'title' then p_patch->>'title' else title end,
 purpose=case when p_patch?'purpose' then p_patch->>'purpose' else purpose end,
 starts_at=case when p_patch?'starts_at' then (p_patch->>'starts_at')::timestamptz else starts_at end,
 duration_minutes=case when p_patch?'duration_minutes' then (p_patch->>'duration_minutes')::integer else duration_minutes end,
 participant_ids=case when p_patch?'participant_ids' then array(select jsonb_array_elements_text(p_patch->'participant_ids'))::uuid[] else participant_ids end,
 reminder_minutes=case when p_patch?'reminder_minutes' then (p_patch->>'reminder_minutes')::int else reminder_minutes end,
 status=coalesce(p_patch->>'status',status),agenda=coalesce(p_patch->'agenda',agenda),minutes=coalesce(p_patch->>'minutes',minutes)
 where id=p_id and owner_id=auth.uid() returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.crm_calendar_update_v2(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.crm_calendar_update_v2(uuid,timestamptz,jsonb) to authenticated;

