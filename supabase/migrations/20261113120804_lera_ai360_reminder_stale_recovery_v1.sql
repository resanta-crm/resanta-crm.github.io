-- Wake the worker to mark ambiguous sends even when no new reminder is pending.
create or replace function crm_ai360_private.dispatch_reminders_v1()
returns bigint language plpgsql volatile security invoker set search_path='' as $$
declare dispatch_secret text; request_id bigint;
begin
 -- No Edge request (and no message) is made when nothing is due.
 if not exists(select 1 from public.crm_ai360_reminders_v1 where (status='pending' and due_at<=now()) or (status='sending' and attempted_at<now()-interval '10 minutes')) then return null; end if;
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
