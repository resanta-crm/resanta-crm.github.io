-- STANDS 360 · personal Lera reminders at 08:40 Europe/Minsk on weekdays
-- The delivery is disabled until the controlled pilot confirms Telegram success.
insert into public.crm_telegram_runtime(key,value,updated_at)
values ('stand360_telegram_config','{"enabled":false,"voice":"lera","version":1}'::jsonb,now())
on conflict(key) do nothing;

create or replace function public.crm_run_stands360_telegram_daily_v1()
returns bigint language plpgsql security definer set search_path to '' as $func$
declare s text; request_id bigint;
begin
 select value->>'secret' into s from public.crm_telegram_runtime where key='dispatch_secret';
 if coalesce(s,'')='' then raise exception 'DISPATCH_SECRET_MISSING';end if;
 select net.http_post(
  url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-stands-telegram-v1',
  headers:=jsonb_build_object('Content-Type','application/json','x-crm-dispatch-secret',s),
  body:='{}'::jsonb,
  timeout_milliseconds:=90000
 ) into request_id;
 return request_id;
end
$func$;
revoke all on function public.crm_run_stands360_telegram_daily_v1() from public,anon,authenticated;
grant execute on function public.crm_run_stands360_telegram_daily_v1() to service_role;

do $schedule$
begin
 if not exists(select 1 from cron.job where jobname='stands360-telegram-0840-minsk') then
  perform cron.schedule('stands360-telegram-0840-minsk','40 5 * * 1-5',
   'select public.crm_run_stands360_telegram_daily_v1();');
 end if;
end
$schedule$;
