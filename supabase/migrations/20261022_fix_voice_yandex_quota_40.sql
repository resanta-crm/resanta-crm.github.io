-- RESANTA AI 360: synchronize the existing voice usage table constraint with
-- the Yandex SpeechKit 40-segment quota, keeping 5000 characters per day.
-- Transactional, idempotent and refuses to override any unexpected constraint.
do $voice_quota$
declare v_old text;
begin
  select pg_get_constraintdef(oid) into v_old
  from pg_constraint
  where conrelid='public.crm_voice_usage_v1'::regclass
    and conname='crm_voice_usage_v1_tts_requests_check';
  if v_old is null then
    raise exception 'Voice quota constraint missing; migration not applied';
  end if;
  if v_old like '%tts_requests <= 40%' then
    return;
  end if;
  if v_old not like '%tts_requests <= 20%' then
    raise exception 'Unexpected voice quota constraint: %',v_old;
  end if;
  alter table public.crm_voice_usage_v1
    drop constraint crm_voice_usage_v1_tts_requests_check,
    add constraint crm_voice_usage_v1_tts_requests_check
      check (tts_requests >= 0 and tts_requests <= 40);
end
$voice_quota$;