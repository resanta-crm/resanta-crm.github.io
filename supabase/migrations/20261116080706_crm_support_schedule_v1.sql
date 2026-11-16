select cron.schedule('crm-support-triage-3h-v1','0 */3 * * *', $$select public.crm_support_dispatch_v1('triage',false)$$);
select cron.schedule('crm-support-digest-18-msk-v1','0 15 * * *', $$select public.crm_support_dispatch_v1('digest',false)$$);
