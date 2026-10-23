-- v23.6.449: read-only fast 21vek status hotfix.
-- Narrow verification of missing-price cards uses UUID-indexed run_id.
-- Restores original fast working-card aggregate and retains actor authorization.
-- Re-applying this CREATE OR REPLACE FUNCTION preserves business data, history,
-- snapshots, TOP, MRC, and auth rules. Only the status function is replaced.
CREATE OR REPLACE FUNCTION public.triovist_21vek_status_v236107()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  a record;
  v_cards integer:=0;
  v_in_stock integer:=0;
  v_out_stock integer:=0;
  v_top30 integer:=0;
  v_top60 integer:=0;
  v_nonpositive integer:=0;
  v_live_price_issues integer:=0;
  v_verified_removed_urls integer:=0;
  v_keyword_targets integer:=0;
  v_current_date date;
  v_current_completed timestamptz;
  v_current_source text;
  v_registry_targets integer:=0;
  v_registry_changed boolean:=false;
  v_latest record;
  v_good record;
  v_top record;
  v_req record;
  v_last_req record;
  v_health text:='red';
  v_age numeric;
  v_latest_failed_after_good boolean:=false;
  v_error_text text;
  v_error_explain text;
  v_promotion_pending boolean:=false;
  v_promotion_explain text;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or not (
       (a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'))
       or (a.actor_scope='triovist' and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'))
     ) then
    raise exception 'Нет доступа к статусу 21vek' using errcode='42501';
  end if;

  select count(*)::int,
         count(*) filter(where c.in_stock)::int,
         count(*) filter(where not c.in_stock)::int,
         count(*) filter(where c.listing_position is not null and c.listing_position<=30)::int,
         count(*) filter(where c.listing_position is not null and c.listing_position<=60)::int,
         count(*) filter(where c.price is null or c.price<=0)::int,
         count(*) filter(where nullif(trim(c.keyword),'') is not null)::int,
         max(i.snapshot_date),max(i.completed_at),max(i.source_file)
  into v_cards,v_in_stock,v_out_stock,v_top30,v_top60,v_nonpositive,v_keyword_targets,
       v_current_date,v_current_completed,v_current_source
  from public.triovist_content_imports i
  join public.triovist_content_cards c on c.import_id=i.id
  where private.triovist_pointer_is_current_v236404(i.id) and i.status='complete'
    and i.source_file like 'own-21vek-shadow:%';

  select count(*)::int into v_registry_targets
  from public.triovist_21vek_registry_v236214;

  -- Only missing-price cards need a parser tombstone check. Materialize this
  -- tiny set FIRST, then use the indexed native UUID run_id, avoiding a scan
  -- of all 115k+ historical shadow snapshots on every status page load.
  with candidates as materialized (
    select c.manager_email, c.card_key, c.in_stock,
           split_part(i.source_file,':',2)::uuid as snapshot_run_id
    from public.triovist_content_imports i
    join public.triovist_content_cards c on c.import_id=i.id
    where private.triovist_pointer_is_current_v236404(i.id)
      and i.status='complete'
      and i.source_file like 'own-21vek-shadow:%'
      and (c.price is null or c.price<=0)
  )
  select count(*)::int into v_verified_removed_urls
  from candidates c
  join public.triovist_21vek_shadow_snapshots s
    on s.run_id=c.snapshot_run_id
   and s.manager_email=c.manager_email and s.card_key=c.card_key
  where c.in_stock is false
    and s.in_stock is false and s.current_price is null
    and s.error_text is null
    and (s.parser_payload #>> '{parser_sources,collection_status}')
        in ('unavailable_http_404','unavailable_http_410');
  v_live_price_issues:=greatest(0,v_nonpositive-v_verified_removed_urls);


  select * into v_latest
  from public.triovist_21vek_shadow_runs
  where total_targets>=greatest(1,floor(v_registry_targets*0.90)::int)
  order by started_at desc
  limit 1;

  select * into v_good
  from public.triovist_21vek_shadow_runs
  where status='complete'
    and error_count=0
    and success_count=total_targets
    and total_targets>=greatest(1,floor(v_registry_targets*0.90)::int)
  order by finished_at desc nulls last
  limit 1;

  select * into v_top
  from public.triovist_21vek_top_runs
  where status='complete'
    and error_count=0
    and (v_good.id is null or total_targets=v_good.total_targets)
  order by finished_at desc nulls last
  limit 1;

  select * into v_req
  from public.triovist_21vek_refresh_requests
  where status in ('queued','claimed')
  order by requested_at desc
  limit 1;

  select * into v_last_req
  from public.triovist_21vek_refresh_requests
  order by requested_at desc
  limit 1;

  if v_good.finished_at is not null then
    v_age:=extract(epoch from (now()-v_good.finished_at))/3600.0;
  end if;

  v_registry_changed :=
    v_good.id is not null
    and coalesce(v_registry_targets,0)>0
    and coalesce(v_good.total_targets,0)<>v_registry_targets;

  if v_latest.started_at is not null and v_good.finished_at is not null then
    v_latest_failed_after_good :=
      v_latest.started_at>v_good.finished_at
      and v_latest.status='failed';
  end if;

  v_promotion_pending :=
    v_good.id is not null
    and (
      v_current_source is null
      or position(v_good.id::text in coalesce(v_current_source,''))=0
      or v_current_completed is null
      or v_current_completed < coalesce(v_good.finished_at,v_good.started_at)
    );

  if v_promotion_pending then
    v_promotion_explain:='Сбор 21vek завершён полностью, но свежий снимок ещё не применён в рабочие данные CRM.';
    if v_last_req.status='failed' and v_last_req.completed_at is not null
       and v_last_req.completed_at>=coalesce(v_good.finished_at,v_good.started_at) then
      v_promotion_explain:=v_promotion_explain||' Последняя попытка применения завершилась ошибкой: '||
        coalesce(nullif(trim(v_last_req.note),''),'ошибка workflow.');
    end if;
  end if;

  v_error_text:=nullif(trim(coalesce(v_latest.notes->>'fatal_error','')),'');
  if v_latest.status='failed' then
    if coalesce(v_error_text,'') ilike '%HTTP 429%' then
      v_error_explain:='21vek временно ограничил частоту запросов. Рабочий снимок не заменён.';
    elsif coalesce(v_error_text,'') ilike '%PGRST102%' or coalesce(v_error_text,'') ilike '%All object keys must match%' then
      v_error_explain:='Ошибка пакетной записи данных в CRM. Неполный запуск не был принят в работу.';
    elsif coalesce(v_error_text,'') ilike '%completeness check failed%' then
      v_error_explain:='Не все карточки удалось получить за этот запуск. CRM сохранила предыдущий полностью проверенный снимок.';
    elsif coalesce(v_error_text,'') ilike '%57014%' or coalesce(v_error_text,'') ilike '%statement timeout%' then
      v_error_explain:='CRM не успела записать один из тяжёлых пакетов. Рабочий снимок не заменён.';
    elsif coalesce(v_error_text,'') ilike '%timed out%' then
      v_error_explain:='21vek не ответил вовремя на часть запросов. CRM сохранила предыдущий полностью проверенный снимок.';
    elsif coalesce(v_error_text,'') ilike '%connection reset%' or coalesce(v_error_text,'') ilike '%connection refused%' then
      v_error_explain:='21vek разорвал или отклонил часть соединений. CRM сохранила предыдущий полностью проверенный снимок.';
    else
      v_error_explain:=coalesce(v_error_text,'Сбор завершился с ошибкой. CRM сохранила предыдущий полностью проверенный снимок.');
    end if;
  end if;

  if v_promotion_pending then
    v_health:='red';
  elsif v_good.finished_at is not null
     and v_age<=24
     and not v_registry_changed
     and v_live_price_issues=0 then
    v_health:=case when v_latest_failed_after_good then 'amber' else 'green' end;
  elsif v_good.finished_at is not null
        and v_age<=48
        and v_live_price_issues=0 then
    v_health:='amber';
  else
    v_health:='red';
  end if;

  if v_registry_changed and v_health='green' then
    v_health:='amber';
  end if;

  if v_req.status='claimed' then
    v_health:='running';
  elsif v_req.status='queued' then
    v_health:='queued';
  end if;

  return jsonb_build_object(
    'version','v23.6.403',
    'source','own_21vek',
    'source_label','Собственный парсер 21vek',
    'health',v_health,
    'working',jsonb_build_object(
      'cards',v_cards,'in_stock',v_in_stock,'out_of_stock',v_out_stock,
      'top30',v_top30,'top60',v_top60,'nonpositive_price',v_nonpositive,
      'blocking_price_issues',v_live_price_issues,
      'verified_removed_urls',v_verified_removed_urls,
      'keyword_targets',v_keyword_targets,
      'snapshot_date',v_current_date,'completed_at',v_current_completed,
      'source_file',v_current_source
    ),
    'registry',jsonb_build_object(
      'targets',v_registry_targets,
      'changed_since_last_good',v_registry_changed,
      'last_good_targets',coalesce(v_good.total_targets,0)
    ),
    'parser',case when v_latest.started_at is null then null else jsonb_build_object(
      'status',v_latest.status,'version',v_latest.parser_version,
      'targets',v_latest.total_targets,'success',v_latest.success_count,'errors',v_latest.error_count,
      'started_at',v_latest.started_at,'finished_at',v_latest.finished_at,
      'error_text',v_error_text,'error_explain',v_error_explain
    ) end,
    'last_good',case when v_good.started_at is null then null else jsonb_build_object(
      'run_id',v_good.id,'targets',v_good.total_targets,'success',v_good.success_count,
      'errors',v_good.error_count,'started_at',v_good.started_at,'finished_at',v_good.finished_at,
      'age_hours',round(v_age,2)
    ) end,
    'top',case when v_top.started_at is null then null else jsonb_build_object(
      'run_id',v_top.id,'status',v_top.status,'keywords',v_top.total_keywords,
      'targets',v_top.total_targets,'top30',v_top.top30_count,'top60',v_top.top60_count,
      'errors',v_top.error_count,'started_at',v_top.started_at,'finished_at',v_top.finished_at
    ) end,
    'promotion',jsonb_build_object(
      'pending',v_promotion_pending,
      'working_source',v_current_source,
      'working_completed_at',v_current_completed,
      'latest_good_run_id',v_good.id,
      'latest_good_finished_at',v_good.finished_at,
      'error_explain',v_promotion_explain
    ),
    'refresh_request',case when v_req.id is null then null else jsonb_build_object(
      'id',v_req.id,'status',v_req.status,'requested_at',v_req.requested_at,
      'claimed_at',v_req.claimed_at,'requested_by_name',v_req.requested_by_name
    ) end,
    'last_refresh_request',case when v_last_req.id is null then null else jsonb_build_object(
      'id',v_last_req.id,'status',v_last_req.status,'requested_at',v_last_req.requested_at,
      'claimed_at',v_last_req.claimed_at,'completed_at',v_last_req.completed_at,
      'requested_by_name',v_last_req.requested_by_name,'note',v_last_req.note
    ) end,
    'can_refresh',(a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru')),
    'generated_at',now()
  );
end;
$function$

