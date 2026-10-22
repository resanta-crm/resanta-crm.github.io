-- Yandex full-answer speech: more short, sequential segments without raising the 5000 character/day safety cap.
-- Existing crm_voice_tts_claim_v1 and other voices are NOT changed.
create or replace function public.crm_voice_yandex_tts_claim_v2(p_user_id uuid,p_characters integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare n integer;
begin
  if p_user_id is null or p_characters is null or p_characters < 1 or p_characters > 240 then return false; end if;
  insert into public.crm_voice_usage_v1 as c(user_id,usage_date,requests,tts_requests,tts_characters)
  values(p_user_id,(now() at time zone 'utc')::date,0,1,p_characters)
  on conflict(user_id,usage_date) do update
    set tts_requests=c.tts_requests+1,
        tts_characters=c.tts_characters+p_characters,
        updated_at=now()
    where c.tts_requests < 40 and c.tts_characters+p_characters <= 5000
  returning tts_requests into n;
  return n is not null;
end
$function$;
revoke all on function public.crm_voice_yandex_tts_claim_v2(uuid,integer) from public,anon,authenticated;
grant execute on function public.crm_voice_yandex_tts_claim_v2(uuid,integer) to service_role;