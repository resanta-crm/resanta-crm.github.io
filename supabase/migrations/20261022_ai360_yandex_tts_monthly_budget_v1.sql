-- Yandex SpeechKit v3 general: estimated 5000 RUB/month including VAT.
-- Internal per-user reservation guard, not an external provider account spending cap.
create table if not exists public.crm_ai360_yandex_monthly_spend_v1(
 user_id uuid not null,
 month_start date not null,
 requests integer not null default 0 check(requests>=0),
 tts_characters bigint not null default 0 check(tts_characters>=0),
 reserved_rub numeric(12,4) not null default 0 check(reserved_rub>=0 and reserved_rub<=5000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint crm_ai360_yandex_monthly_spend_v1_pk primary key(user_id,month_start)
);
alter table public.crm_ai360_yandex_monthly_spend_v1 enable row level security;
revoke all on table public.crm_ai360_yandex_monthly_spend_v1 from public,anon,authenticated;
grant select,insert,update on table public.crm_ai360_yandex_monthly_spend_v1 to service_role;

-- Conservative carry-forward of the existing pilot's monthly voice usage.
insert into public.crm_ai360_yandex_monthly_spend_v1
(user_id,month_start,requests,tts_characters,reserved_rub)
select user_id,date_trunc('month',usage_date)::date,
       sum(tts_requests)::int,coalesce(sum(tts_characters),0)::bigint,
       least(5000,round(coalesce(sum(tts_requests),0)*0.1626,4))
from public.crm_voice_usage_v1
where usage_date >= date_trunc('month',now() at time zone 'Europe/Moscow')::date
 and usage_date < (date_trunc('month',now() at time zone 'Europe/Moscow')+interval '1 month')::date
 and tts_requests>0
group by user_id,date_trunc('month',usage_date)::date
on conflict(user_id,month_start) do nothing;

CREATE OR REPLACE FUNCTION public.crm_ai360_yandex_monthly_claim_v1(p_user_id uuid, p_characters integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m date := date_trunc('month',now() at time zone 'Europe/Moscow')::date;
 declare cost constant numeric(12,4) := 0.1626;
 declare actual_rub numeric(12,4);
 declare reserved_count int;
 declare allowed boolean := false;
begin
 if p_user_id is null or p_characters is null or p_characters<1 or p_characters>240 then
  return jsonb_build_object('allowed',false,'error','invalid_segment');
 end if;
 insert into public.crm_ai360_yandex_monthly_spend_v1 as q
   (user_id,month_start,requests,tts_characters,reserved_rub)
 values(p_user_id,m,1,p_characters,cost)
 on conflict(user_id,month_start) do update
 set requests=q.requests+1,
     tts_characters=q.tts_characters+p_characters,
     reserved_rub=q.reserved_rub+cost,
     updated_at=now()
 where q.reserved_rub+cost<=5000
 returning reserved_rub,requests into actual_rub,reserved_count;
 allowed:=found;
 if not allowed then
   select reserved_rub,requests into actual_rub,reserved_count
   from public.crm_ai360_yandex_monthly_spend_v1 where user_id=p_user_id and month_start=m;
 end if;
 return jsonb_build_object(
 'allowed',allowed, 'month',to_char(m,'YYYY-MM'),'reserved_rub',coalesce(actual_rub,0),
 'remaining_rub',greatest(0,5000-coalesce(actual_rub,0)),
 'limit_rub',5000,'requests',coalesce(reserved_count,0)
 );
end
$function$
;

CREATE OR REPLACE FUNCTION public.crm_ai360_yandex_monthly_status_v1(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'month',to_char(date_trunc('month',now() at time zone 'Europe/Moscow')::date,'YYYY-MM'),
 'reserved_rub',coalesce(t.reserved_rub,0),
 'remaining_rub',greatest(0,5000-coalesce(t.reserved_rub,0)),
 'limit_rub',5000,
 'requests',coalesce(t.requests,0),
 'currency','RUB',
 'pricing','estimated_Yandex_SpeechKit_v3_general_0.1626_RUB_per_short_request'
)
from (select 1) s
left join public.crm_ai360_yandex_monthly_spend_v1 t on
 t.user_id=p_user_id and t.month_start=date_trunc('month',now() at time zone 'Europe/Moscow')::date
$function$
;

revoke all on function public.crm_ai360_yandex_monthly_claim_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.crm_ai360_yandex_monthly_status_v1(uuid) from public,anon,authenticated;
grant execute on function public.crm_ai360_yandex_monthly_claim_v1(uuid,integer) to service_role;
grant execute on function public.crm_ai360_yandex_monthly_status_v1(uuid) to service_role;
