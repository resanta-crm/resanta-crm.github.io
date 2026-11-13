-- Personal, explicitly confirmed Lera reminders. Existing Telegram binding is reused.
create table public.crm_ai360_reminders_v1 (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.users(id) on delete cascade,
 title text not null check(length(title) between 3 and 160),
 details text not null default '' check(length(details)<=800),
 due_at timestamptz not null,
 channel text not null default 'telegram' check(channel='telegram'),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','delivery_unknown','cancelled')),
 source text not null default 'lera_agent360_confirmed_v1' check(source='lera_agent360_confirmed_v1'),
 created_at timestamptz not null default now(), attempted_at timestamptz, delivered_at timestamptz,
 telegram_message_id bigint, error_reason text check(length(error_reason)<=160),
 unique(owner_id,due_at,title)
);
create index crm_ai360_reminders_due_v1 on public.crm_ai360_reminders_v1(due_at) where status='pending';
create index crm_ai360_reminders_owner_v1 on public.crm_ai360_reminders_v1(owner_id,created_at desc);
alter table public.crm_ai360_reminders_v1 enable row level security;
revoke all on public.crm_ai360_reminders_v1 from public,anon,authenticated;
grant select,insert on public.crm_ai360_reminders_v1 to authenticated;
grant update(status) on public.crm_ai360_reminders_v1 to authenticated;
grant all on public.crm_ai360_reminders_v1 to service_role;
create policy reminders_own_read_v1 on public.crm_ai360_reminders_v1 for select to authenticated
 using(owner_id=(select auth.uid()));
create policy reminders_own_insert_v1 on public.crm_ai360_reminders_v1 for insert to authenticated
 with check(owner_id=(select auth.uid()) and status='pending' and due_at>now() and due_at<=now()+interval '90 days'
 and attempted_at is null and delivered_at is null and telegram_message_id is null and error_reason is null);
create policy reminders_own_cancel_v1 on public.crm_ai360_reminders_v1 for update to authenticated
 using(owner_id=(select auth.uid()) and status in ('pending','failed'))
 with check(owner_id=(select auth.uid()) and status='cancelled');

-- Only the internal worker can claim due rows; concurrent runs cannot send one row twice.
create function public.crm_ai360_reminders_claim_v1(p_limit integer default 10)
returns setof public.crm_ai360_reminders_v1 language sql volatile security invoker set search_path='' as $$
 with due as (
  select id from public.crm_ai360_reminders_v1 where status='pending' and due_at<=now()
  order by due_at,id for update skip locked limit least(10,greatest(1,coalesce(p_limit,10)))
 )
 update public.crm_ai360_reminders_v1 r set status='sending',attempted_at=now()
 from due where r.id=due.id returning r.*;
$$;
revoke all on function public.crm_ai360_reminders_claim_v1(integer) from public,anon,authenticated;
grant execute on function public.crm_ai360_reminders_claim_v1(integer) to service_role;

create schema if not exists crm_ai360_private;
revoke all on schema crm_ai360_private from public,anon,authenticated;
grant usage on schema crm_ai360_private to service_role;
create function crm_ai360_private.dispatch_reminders_v1()
returns bigint language plpgsql volatile security invoker set search_path='' as $$
declare dispatch_secret text; request_id bigint;
begin
 -- No Edge request (and no message) is made when nothing is due.
 if not exists(select 1 from public.crm_ai360_reminders_v1 where status='pending' and due_at<=now()) then return null; end if;
 select value->>'secret' into dispatch_secret from public.crm_telegram_runtime where key='dispatch_secret';
 if length(coalesce(dispatch_secret,''))<24 then raise exception 'reminder_dispatch_not_configured'; end if;
 select net.http_post(
  url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-ai360-reminders-v1',
  headers:=jsonb_build_object('Content-Type','application/json','x-crm-dispatch-secret',dispatch_secret),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 ) into request_id;
 return request_id;
end;
$$;
revoke all on function crm_ai360_private.dispatch_reminders_v1() from public,anon,authenticated;
grant execute on function crm_ai360_private.dispatch_reminders_v1() to service_role;
select cron.schedule('lera-private-reminders-v1','* * * * *','select crm_ai360_private.dispatch_reminders_v1();');
