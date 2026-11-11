-- Read-only PDZ Telegram re-check after the 11:00 daily digest.
-- Minsk is UTC+3 on these dates; pg_cron uses UTC in this project.
-- Do not alter the existing 11:00 job. Same Edge endpoint reuses its secret
-- and checks source report_date/imported_at against the last delivered snapshot.
do $$
begin
 if not exists(select 1 from cron.job where jobname='pdz-telegram-refresh-1230-minsk') then
  perform cron.schedule('pdz-telegram-refresh-1230-minsk','30 9 * * 1-5',
   'select public.crm_run_pdz_telegram_daily_v1();');
 end if;
 if not exists(select 1 from cron.job where jobname='pdz-telegram-refresh-1530-minsk') then
  perform cron.schedule('pdz-telegram-refresh-1530-minsk','30 12 * * 1-5',
   'select public.crm_run_pdz_telegram_daily_v1();');
 end if;
end $$;
