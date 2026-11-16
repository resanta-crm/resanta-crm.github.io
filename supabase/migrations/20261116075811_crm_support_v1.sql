-- Isolated support module. No business tables are changed.
create table public.crm_support_acl_v1(user_id uuid primary key references auth.users(id), allowed boolean not null, approver boolean not null default false);
insert into public.crm_support_acl_v1 select id,false,false from public.users where id='bcc330b8-9100-4c60-b87f-22a36988fc97' or lower(email)='nesterov_py@resanta.ru';
insert into public.crm_support_acl_v1 select id,true,true from public.users where id='544fb1e2-ef70-44de-bc62-e0e1596a4bfc' and lower(email)='payushin_ar@resanta.ru';
alter table public.crm_support_acl_v1 enable row level security;
revoke all on public.crm_support_acl_v1 from public,anon,authenticated;
grant all on public.crm_support_acl_v1 to service_role;
create function private.crm_support_allowed_v1() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.users u join auth.users a on a.id=u.id where u.id=auth.uid() and lower(u.email)=lower(a.email) and u.role not in('auditor_pending') and (a.banned_until is null or a.banned_until<now())) and not exists(select 1 from public.crm_support_acl_v1 where user_id=auth.uid() and not allowed)
$$;
create function private.crm_support_approver_v1() returns boolean language sql stable security definer set search_path='' as $$ select private.crm_support_allowed_v1() and exists(select 1 from public.crm_support_acl_v1 where user_id=auth.uid() and allowed and approver) $$;
revoke all on function private.crm_support_allowed_v1(),private.crm_support_approver_v1() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.crm_support_allowed_v1(),private.crm_support_approver_v1() to authenticated;
create table public.crm_support_tickets_v1(
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 reporter_id uuid not null references auth.users(id), reporter_name text not null,
 section text not null check(char_length(section) between 1 and 100), description text not null check(char_length(description) between 5 and 6000),
 context jsonb not null default '{}' check(octet_length(context::text)<5000), blocking boolean not null default false,
 status text not null default 'new' check(status in('new','review','needs_info','awaiting_approval','approved','in_progress','resolved','closed','deferred')),
 revision int not null default 1, analyzed_revision int not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_support_reporter_v1 on public.crm_support_tickets_v1(reporter_id,created_at desc);
create index crm_support_pending_v1 on public.crm_support_tickets_v1(status,updated_at);
create table public.crm_support_events_v1(id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.crm_support_tickets_v1(id),actor_id uuid references auth.users(id),kind text not null,body text not null check(char_length(body)<=12000),created_at timestamptz not null default now());
create index crm_support_events_ticket_v1 on public.crm_support_events_v1(ticket_id,created_at);
create table public.crm_support_plans_v1(id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.crm_support_tickets_v1(id),revision int not null,summary text not null,proposal text not null,verification text not null,questions text not null default '',related_ids uuid[] not null default '{}',state text not null default 'pending' check(state in('pending','approved','deferred','superseded')),approved_by uuid references auth.users(id),approved_at timestamptz,created_at timestamptz not null default now(),unique(ticket_id,revision));
create index crm_support_plans_ticket_v1 on public.crm_support_plans_v1(ticket_id);
create table public.crm_support_reports_v1(id uuid primary key default gen_random_uuid(),report_date date not null unique,body text not null,delivery text not null default 'pending' check(delivery in('pending','sending','sent','failed','unknown')),error text,created_at timestamptz not null default now(),sent_at timestamptz);
create table public.crm_support_runs_v1(id uuid primary key default gen_random_uuid(),mode text not null,started_at timestamptz not null default now(),finished_at timestamptz,status text not null default 'running',details jsonb not null default '{}');
create function private.crm_support_ticket_v1(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.crm_support_allowed_v1() and exists(select 1 from public.crm_support_tickets_v1 where id=p_id and (reporter_id=auth.uid() or private.crm_support_approver_v1())) $$;
revoke all on function private.crm_support_ticket_v1(uuid) from public,anon;
grant execute on function private.crm_support_ticket_v1(uuid) to authenticated;
alter table public.crm_support_tickets_v1 enable row level security;
alter table public.crm_support_events_v1 enable row level security;
alter table public.crm_support_plans_v1 enable row level security;
alter table public.crm_support_reports_v1 enable row level security;
alter table public.crm_support_runs_v1 enable row level security;
revoke all on public.crm_support_tickets_v1,public.crm_support_events_v1,public.crm_support_plans_v1,public.crm_support_reports_v1,public.crm_support_runs_v1 from public,anon,authenticated;
grant select on public.crm_support_tickets_v1,public.crm_support_events_v1,public.crm_support_plans_v1,public.crm_support_reports_v1,public.crm_support_runs_v1 to authenticated;
grant all on public.crm_support_tickets_v1,public.crm_support_events_v1,public.crm_support_plans_v1,public.crm_support_reports_v1,public.crm_support_runs_v1 to service_role;
grant usage,select on sequence public.crm_support_tickets_v1_number_seq to service_role;
create policy support_tickets_read on public.crm_support_tickets_v1 for select to authenticated using(private.crm_support_allowed_v1() and (reporter_id=(select auth.uid()) or private.crm_support_approver_v1()));
create policy support_events_read on public.crm_support_events_v1 for select to authenticated using(private.crm_support_ticket_v1(ticket_id));
create policy support_plans_read on public.crm_support_plans_v1 for select to authenticated using(private.crm_support_ticket_v1(ticket_id));
create policy support_reports_read on public.crm_support_reports_v1 for select to authenticated using(private.crm_support_approver_v1());
create policy support_runs_read on public.crm_support_runs_v1 for select to authenticated using(private.crm_support_approver_v1());
-- RPC is the only browser mutation path; all state transitions recheck caller and revision.
create function public.crm_support_action_v1(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.crm_support_tickets_v1; p public.crm_support_plans_v1; result jsonb; txt text; boss boolean;begin
 if not private.crm_support_allowed_v1() then raise exception 'SUPPORT_FORBIDDEN' using errcode='42501';end if;
 boss:=private.crm_support_approver_v1();
 if p_action='access' then return jsonb_build_object('allowed',true,'approver',boss);end if;
 if octet_length(p_data::text)>15000 then raise exception 'SUPPORT_TOO_LARGE';end if;
 if p_action='create' then
  if (select count(*) from public.crm_support_tickets_v1 where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'SUPPORT_RATE_LIMIT';end if;
  insert into public.crm_support_tickets_v1(id,reporter_id,reporter_name,section,description,context,blocking) values(coalesce(p_id,gen_random_uuid()),auth.uid(),(select name from public.users where id=auth.uid()),left(coalesce(nullif(trim(p_data->>'section'),''),'Другое'),100),trim(p_data->>'description'),coalesce(p_data->'context','{}'),coalesce((p_data->>'blocking')::boolean,false)) returning * into t;
  insert into public.crm_support_events_v1(ticket_id,actor_id,kind,body) values(t.id,auth.uid(),'created','Обращение принято');return to_jsonb(t);
 end if;
 if not private.crm_support_ticket_v1(p_id) then raise exception 'SUPPORT_FORBIDDEN' using errcode='42501';end if;
 select * into t from public.crm_support_tickets_v1 where id=p_id for update;
 txt:=trim(coalesce(p_data->>'body',''));
 if p_action='comment' then
  if char_length(txt) not between 1 and 6000 then raise exception 'SUPPORT_TEXT_REQUIRED';end if;
  if t.status in('approved','in_progress') then
   -- Scope changes cannot silently alter an approved plan.
   insert into public.crm_support_events_v1(ticket_id,actor_id,kind,body) values(t.id,auth.uid(),'comment',txt);
  else
   update public.crm_support_tickets_v1 set revision=revision+1,status=case when status='needs_info' then 'review' else status end,updated_at=now() where id=t.id;
   insert into public.crm_support_events_v1(ticket_id,actor_id,kind,body) values(t.id,auth.uid(),'comment',txt);
  end if;
 elsif p_action in('approve','defer') then
  if not boss then raise exception 'SUPPORT_APPROVER_REQUIRED' using errcode='42501';end if;
  select * into p from public.crm_support_plans_v1 where id=(p_data->>'plan_id')::uuid and ticket_id=t.id for update;
  if p.id is null or p.revision<>t.revision or p.state<>'pending' then raise exception 'SUPPORT_PLAN_CHANGED';end if;
  update public.crm_support_plans_v1 set state=case when p_action='approve' then 'approved' else 'deferred' end,approved_by=auth.uid(),approved_at=now() where id=p.id;
  update public.crm_support_tickets_v1 set status=case when p_action='approve' then 'approved' else 'deferred' end,updated_at=now() where id=t.id;
  insert into public.crm_support_events_v1(ticket_id,actor_id,kind,body) values(t.id,auth.uid(),p_action,case when p_action='approve' then 'Александр согласовал план: ' else 'План отложен: ' end||p.proposal||E'\nПроверка: '||p.verification);
 elsif p_action='confirm' then
  if t.reporter_id<>auth.uid() or t.status<>'resolved' then raise exception 'SUPPORT_CONFIRM_STATE';end if;
  update public.crm_support_tickets_v1 set status='closed',updated_at=now() where id=t.id;
  insert into public.crm_support_events_v1(ticket_id,actor_id,kind,body) values(t.id,auth.uid(),'closed','Сотрудник подтвердил: всё работает');
 elsif p_action='reopen' then
  if t.status not in('resolved','closed','deferred','awaiting_approval') or char_length(txt)<5 then raise exception 'SUPPORT_REOPEN_REASON';end if;
  update public.crm_support_tickets_v1 set status='review',revision=revision+1,updated_at=now() where id=t.id;
  update public.crm_support_plans_v1 set state='superseded' where ticket_id=t.id and state='pending';
  insert into public.crm_support_events_v1(ticket_id,actor_id,kind,body) values(t.id,auth.uid(),'reopen',txt);
 elsif p_action='resolve' then
  if not boss or t.status not in('approved','in_progress') or char_length(txt)<20 then raise exception 'SUPPORT_APPROVED_RESULT_REQUIRED';end if;
  update public.crm_support_tickets_v1 set status='resolved',updated_at=now() where id=t.id;
  insert into public.crm_support_events_v1(ticket_id,actor_id,kind,body) values(t.id,auth.uid(),'resolved',txt);
 else raise exception 'SUPPORT_UNKNOWN_ACTION';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.crm_support_action_v1(text,uuid,jsonb) from public,anon;
grant execute on function public.crm_support_action_v1(text,uuid,jsonb) to authenticated;
-- Private attachments use an authenticated edge proxy: no bearerless signed URLs.
-- Existing global storage role restrictions remain unchanged.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('crm-support-v1','crm-support-v1',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']);
create function public.crm_support_save_analysis_v1(p_ticket uuid,p_revision int,p_analysis jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare t public.crm_support_tickets_v1;begin
 select * into t from public.crm_support_tickets_v1 where id=p_ticket for update;
 if t.id is null or t.revision<>p_revision or t.analyzed_revision>=p_revision or t.status in('approved','in_progress','resolved','closed','deferred') then return false;end if;
 update public.crm_support_plans_v1 set state='superseded' where ticket_id=t.id and state='pending';
 insert into public.crm_support_plans_v1(ticket_id,revision,summary,proposal,verification,questions) values(t.id,t.revision,left(p_analysis->>'summary',500),left(p_analysis->>'proposal',3000),left(p_analysis->>'verification',2000),left(coalesce(p_analysis->>'questions',''),2000));
 update public.crm_support_tickets_v1 set analyzed_revision=t.revision,status=case when coalesce(p_analysis->>'questions','')<>'' then 'needs_info' else 'awaiting_approval' end,updated_at=now() where id=t.id;
 insert into public.crm_support_events_v1(ticket_id,kind,body) values(t.id,'analysis',case when coalesce(p_analysis->>'questions','')<>'' then 'Нужно уточнение: '||(p_analysis->>'questions') else 'Подготовлен план. Ожидает согласования Александра.' end);return true;
end $$;
revoke all on function public.crm_support_save_analysis_v1(uuid,int,jsonb) from public,anon,authenticated;
grant execute on function public.crm_support_save_analysis_v1(uuid,int,jsonb) to service_role;
create function public.crm_support_dispatch_v1(p_mode text default 'triage',p_dry_run boolean default false) returns bigint language plpgsql security definer set search_path='' as $$ declare s text;rid bigint;begin
 if p_mode not in('triage','digest','health') then raise exception 'SUPPORT_MODE';end if;
 select value->>'secret' into s from public.crm_telegram_runtime where key='dispatch_secret';
 if length(s)<24 or s is null then raise exception 'SUPPORT_SECRET_MISSING';end if;
 select net.http_post(url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-support-worker-v1',headers:=jsonb_build_object('content-type','application/json','x-support-secret',s),body:=jsonb_build_object('action',p_mode,'dry_run',p_dry_run),timeout_milliseconds:=120000) into rid;return rid;
end $$;
revoke all on function public.crm_support_dispatch_v1(text,boolean) from public,anon,authenticated;
grant execute on function public.crm_support_dispatch_v1(text,boolean) to service_role;
create function public.crm_support_claim_run_v1(p_mode text) returns uuid language plpgsql security definer set search_path='' as $$ declare r uuid;begin
 perform pg_advisory_xact_lock(hashtext('crm-support:'||p_mode));
 update public.crm_support_runs_v1 set status='failed',finished_at=now(),details='{"error":"lease_expired"}' where mode=p_mode and status='running' and started_at<now()-interval '10 minutes';
 if exists(select 1 from public.crm_support_runs_v1 where mode=p_mode and status='running') then return null;end if;
 insert into public.crm_support_runs_v1(mode) values(p_mode) returning id into r;return r;
end $$;
revoke all on function public.crm_support_claim_run_v1(text) from public,anon,authenticated;
grant execute on function public.crm_support_claim_run_v1(text) to service_role;
