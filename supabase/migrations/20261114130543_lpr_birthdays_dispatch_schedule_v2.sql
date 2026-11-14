-- Apply only after the v2 Edge Function passes its authenticated dry run.
create or replace function public.crm_lpr_birthday_dispatch_v1() returns bigint language plpgsql security definer set search_path='' as $$
declare s text;request_id bigint;begin
 select value->>'secret' into s from public.crm_telegram_runtime where key='dispatch_secret';
 if nullif(s,'') is null then raise exception 'LPR_DISPATCH_SECRET_MISSING';end if;
 select net.http_post(url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-lpr-birthdays-v1',headers:=jsonb_build_object('content-type','application/json','x-crm-dispatch-secret',s),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function public.crm_lpr_birthday_dispatch_v1() from public,anon,authenticated;
grant execute on function public.crm_lpr_birthday_dispatch_v1() to service_role;
create function public.crm_lpr_birthday_probe_v2() returns bigint language plpgsql security definer set search_path='' as $$
declare s text;request_id bigint;begin
 select value->>'secret' into s from public.crm_telegram_runtime where key='dispatch_secret';
 if nullif(s,'') is null then raise exception 'LPR_DISPATCH_SECRET_MISSING';end if;
 select net.http_post(url:='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-lpr-birthdays-v1',headers:=jsonb_build_object('content-type','application/json','x-crm-dispatch-secret',s),body:='{"action":"dispatch","dry_run":true,"check_telegram":true,"check_profiles":true}'::jsonb,timeout_milliseconds:=30000) into request_id;
 return request_id;
end $$;
revoke all on function public.crm_lpr_birthday_probe_v2() from public,anon,authenticated;
grant execute on function public.crm_lpr_birthday_probe_v2() to service_role;
-- Recheck the current account, owner and date when claiming; stale UI/worker data cannot authorize a send.
create or replace function public.crm_lpr_profiles_v2() returns table(id uuid,name text,role text,region text,email text) language sql stable security definer set search_path='' as $$
 select u.id,u.name,u.role,u.region,u.email from public.users u join auth.users a on a.id=u.id and a.email_confirmed_at is not null and lower(a.email)=lower(u.email)
 join (values
 ('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'Александр Паюшин','boss','Витебск','payushin_ar@resanta.ru'),
 ('ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid,'Сидарович К.Н.','boss','Витебск','sidarovich_kn@resanta.ru'),
 ('19dd9943-99ae-47c4-a39c-4f82a11059a6'::uuid,'Руднев','manager','Витебск',null),
 ('3d935a76-c6fe-44b6-b248-fcbe58c6bf1c'::uuid,'Ачинович','manager','Витебск',null),
 ('4fd79fa0-232d-4768-8099-25f47923cc4f'::uuid,'Шкуран','manager','Витебск',null),
 ('9076ccde-a8cc-47e3-b71e-c31170b693ff'::uuid,'Кришталь','manager','Триовист / 21vek.by',null),
 ('6efa656e-45c6-473b-a853-89eccb9ee43a'::uuid,'Александренко','manager','Триовист / 21vek.by',null)
 ) v(id,name,role,region,email) on u.id=v.id and lower(btrim(u.name))=lower(v.name) and u.role=v.role and u.region=v.region and (v.email is null or lower(u.email)=v.email) where coalesce(u.access_scope,'standard') not in('service_manager','payment_executor');
$$;
revoke all on function public.crm_lpr_profiles_v2() from public,anon,authenticated;
grant execute on function public.crm_lpr_profiles_v2() to service_role;
create or replace function public.crm_lpr_delivery_claim_v2(p_lpr uuid,p_recipient uuid,p_date date,p_kind text,p_bound boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.crm_lpr_birthday_delivery_v1%rowtype;begin
 if p_kind not in('1_day','birthday') then raise exception 'invalid_event';end if;
 if not exists(select 1 from public.crm_lpr_contacts_v1 p join public.crm_lpr_profiles_v2() u on u.id=p_recipient
 where p.id=p_lpr and p.active and p_date=timezone('Europe/Minsk',now())::date+case when p_kind='1_day' then 1 else 0 end
 and make_date(extract(year from p_date)::int,p.birth_month,least(p.birth_day,extract(day from(make_date(extract(year from p_date)::int,p.birth_month,1)+interval '1 month -1 day'))::int))=p_date
 and ((p.organization_key='triovist' and (u.id=p.responsible_user_id or u.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid))) or
 (p.client_id is not null and p.client_id in(select * from public.crm_lpr_client_scope_v2(u.id))))) then return null;end if;
 insert into public.crm_lpr_birthday_delivery_v1(lpr_id,recipient_user_id,event_date,event_kind,status,attempts)
 values(p_lpr,p_recipient,p_date,p_kind,case when p_bound then 'pending' else 'no_binding' end,0)
 on conflict(lpr_id,recipient_user_id,event_date,event_kind) do nothing;
 select * into r from public.crm_lpr_birthday_delivery_v1 where lpr_id=p_lpr and recipient_user_id=p_recipient and event_date=p_date and event_kind=p_kind for update;
 if r.status='sending' and r.lease_at<now()-interval '3 minutes' then
 update public.crm_lpr_birthday_delivery_v1 set status='delivery_unknown',last_error='worker_result_unknown',updated_at=now() where id=r.id;return null;end if;
 if r.status not in('pending','failed','no_binding') or r.attempts>=3 or r.next_attempt_at>now() then return null;end if;
 if not p_bound then update public.crm_lpr_birthday_delivery_v1 set status='no_binding',last_error='telegram_not_bound',updated_at=now() where id=r.id;return null;end if;
 update public.crm_lpr_birthday_delivery_v1 set status='sending',attempts=attempts+1,lease_at=now(),updated_at=now(),last_error=null where id=r.id;
 return r.id;
end $$;
revoke all on function public.crm_lpr_delivery_claim_v2(uuid,uuid,date,text,boolean) from public,anon,authenticated;
grant execute on function public.crm_lpr_delivery_claim_v2(uuid,uuid,date,text,boolean) to service_role;

create index crm_lpr_delivery_sending_lease_v2 on public.crm_lpr_birthday_delivery_v1(lease_at) where status='sending';
-- 07:00 UTC = 10:00 Moscow/Minsk. Later invocations handle new bindings and safe retries.
-- Only this feature's existing job is adjusted, using its name rather than a generated ID.
do $$ declare j bigint;begin select jobid into j from cron.job where jobname='crm_lpr_birthdays_daily_v1';if j is null then perform cron.schedule('crm_lpr_birthdays_daily_v1','*/5 7-20 * * *','select public.crm_lpr_birthday_dispatch_v1()');else perform cron.alter_job(j,schedule:='*/5 7-20 * * *',active:=true);end if;end $$;
