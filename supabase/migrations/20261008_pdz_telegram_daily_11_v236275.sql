-- Daily PDZ Telegram digest: 11:00 Europe/Minsk = 08:00 UTC.
create or replace function public.crm_run_pdz_telegram_daily_v1()
returns bigint
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  s text;
  req_id bigint;
begin
  select value->>'secret' into s
  from public.crm_telegram_runtime
  where key='dispatch_secret';

  if coalesce(s,'')='' then
    raise exception 'DISPATCH_SECRET_MISSING';
  end if;

  select net.http_post(
    url := 'https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-pdz-telegram',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-crm-dispatch-secret',s
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into req_id;

  return req_id;
end;
$function$;

do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname='pdz-telegram-daily-11-minsk' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
end $$;

select cron.schedule(
  'pdz-telegram-daily-11-minsk',
  '0 8 * * *',
  'select public.crm_run_pdz_telegram_daily_v1();'
);
