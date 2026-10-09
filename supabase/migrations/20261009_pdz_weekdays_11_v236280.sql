-- PDZ Telegram: weekdays only, 11:00 Minsk (08:00 UTC).
do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname='pdz-telegram-daily-11-minsk' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
end $$;

select cron.schedule(
  'pdz-telegram-daily-11-minsk',
  '0 8 * * 1-5',
  'select public.crm_run_pdz_telegram_daily_v1();'
);
