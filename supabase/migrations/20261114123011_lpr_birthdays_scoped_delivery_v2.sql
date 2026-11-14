-- LPR-only metadata. No financial client, global VIP, budget, route or GPS records change.
alter table public.crm_lpr_contacts_v1 alter column client_id drop not null;
alter table public.crm_lpr_contacts_v1 add column organization_key text,add column responsible_user_id uuid references public.users(id);
alter table public.crm_lpr_contacts_v1 add constraint crm_lpr_contact_account_v2 check (
 (client_id is not null and organization_key is null and responsible_user_id is null) or
 (client_id is null and organization_key is not null and responsible_user_id is not null and organization_key='triovist' and responsible_user_id in('9076ccde-a8cc-47e3-b71e-c31170b693ff'::uuid,'6efa656e-45c6-473b-a853-89eccb9ee43a'::uuid)));
create unique index crm_lpr_triovist_person_v2 on public.crm_lpr_contacts_v1(organization_key,lower(btrim(full_name))) where active and organization_key is not null;
create index crm_lpr_responsible_v2 on public.crm_lpr_contacts_v1(responsible_user_id) where responsible_user_id is not null;
create table public.crm_lpr_vip_links_v2(vip_name text primary key,client_id uuid not null references public.clients(id),updated_by uuid not null references public.users(id),updated_at timestamptz not null default now());
create index crm_lpr_vip_links_client_v2 on public.crm_lpr_vip_links_v2(client_id);
create index crm_lpr_vip_links_actor_v2 on public.crm_lpr_vip_links_v2(updated_by);
alter table public.crm_lpr_vip_links_v2 enable row level security;
revoke all on public.crm_lpr_vip_links_v2 from public,anon,authenticated;
grant all on public.crm_lpr_vip_links_v2 to service_role;
create table public.crm_lpr_worker_state_v2(id boolean primary key default true check(id),started_at timestamptz,finished_at timestamptz,status text not null default 'not_run',sent integer not null default 0,failed integer not null default 0,unknown integer not null default 0,no_binding integer not null default 0,error_code text);
insert into public.crm_lpr_worker_state_v2(id) values(true);
alter table public.crm_lpr_worker_state_v2 enable row level security;
revoke all on public.crm_lpr_worker_state_v2 from public,anon,authenticated;
grant all on public.crm_lpr_worker_state_v2 to service_role;
alter table public.crm_lpr_birthday_delivery_v1 drop constraint crm_lpr_birthday_delivery_v1_event_kind_check;
alter table public.crm_lpr_birthday_delivery_v1 add constraint crm_lpr_birthday_event_v2 check(event_kind in('3_days','1_day','birthday'));
alter table public.crm_lpr_birthday_delivery_v1 drop constraint crm_lpr_birthday_delivery_v1_status_check;
alter table public.crm_lpr_birthday_delivery_v1 add constraint crm_lpr_birthday_status_v2 check(status in('pending','sending','sent','failed','no_binding','delivery_unknown','cancelled'));
alter table public.crm_lpr_birthday_delivery_v1 add column next_attempt_at timestamptz,add column telegram_message_id text,add column lease_at timestamptz;
-- A service-only scope lookup is called after Edge auth.getUser + immutable profile checks.
create function public.crm_lpr_client_scope_v2(p_user_id uuid) returns setof uuid language sql stable security definer set search_path='' as $$
 select c.id from public.clients c join public.users u on u.id=p_user_id join auth.users au on au.id=u.id and au.email_confirmed_at is not null and lower(au.email)=lower(u.email)
 where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
 and ((u.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid) and u.role='boss' and u.region='Витебск') or
 (u.role='manager' and u.region='Витебск' and c.manager_name=u.name and
 ((u.id='19dd9943-99ae-47c4-a39c-4f82a11059a6' and u.name='Руднев') or (u.id='3d935a76-c6fe-44b6-b248-fcbe58c6bf1c' and u.name='Ачинович') or (u.id='4fd79fa0-232d-4768-8099-25f47923cc4f' and u.name='Шкуран'))))
 and (exists(select 1 from public.crm_client_branch_links_v1 l join public.crm_client_branches_v1 b on b.id=l.branch_id where l.client_id=c.id and b.name='Витебск') or
 (not exists(select 1 from public.crm_client_branch_links_v1 l where l.client_id=c.id) and c.manager_name in('Ачинович','Руднев','Шкуран')));
$$;
revoke all on function public.crm_lpr_client_scope_v2(uuid) from public,anon,authenticated;
grant execute on function public.crm_lpr_client_scope_v2(uuid) to service_role;
-- Claim commits before Telegram. Unknown delivery is never retried blindly.
create function public.crm_lpr_delivery_claim_v2(p_lpr uuid,p_recipient uuid,p_date date,p_kind text,p_bound boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.crm_lpr_birthday_delivery_v1%rowtype;begin
 if p_kind not in('1_day','birthday') then raise exception 'invalid_event';end if;
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
-- Existing LPR sender authenticates its protected dispatch secret inside the function.
-- Schedule changes are applied in a separate release migration after function verification.

create function public.crm_lpr_profiles_v2() returns table(id uuid,name text,role text,region text,email text) language sql stable security definer set search_path='' as $$
 select u.id,u.name,u.role,u.region,u.email from public.users u join auth.users a on a.id=u.id and a.email_confirmed_at is not null and lower(a.email)=lower(u.email)
 where u.id in('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid,'19dd9943-99ae-47c4-a39c-4f82a11059a6'::uuid,'3d935a76-c6fe-44b6-b248-fcbe58c6bf1c'::uuid,'4fd79fa0-232d-4768-8099-25f47923cc4f'::uuid,'9076ccde-a8cc-47e3-b71e-c31170b693ff'::uuid,'6efa656e-45c6-473b-a853-89eccb9ee43a'::uuid);
$$;
revoke all on function public.crm_lpr_profiles_v2() from public,anon,authenticated;
grant execute on function public.crm_lpr_profiles_v2() to service_role;
create function public.crm_lpr_delivery_recover_v2() returns void language sql security definer set search_path='' as $$
 update public.crm_lpr_birthday_delivery_v1 set status='delivery_unknown',last_error='worker_result_unknown',updated_at=now() where status='sending' and lease_at<now()-interval '3 minutes';
$$;
revoke all on function public.crm_lpr_delivery_recover_v2() from public,anon,authenticated;
grant execute on function public.crm_lpr_delivery_recover_v2() to service_role;
