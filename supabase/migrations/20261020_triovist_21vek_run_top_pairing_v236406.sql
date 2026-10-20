-- RESANTA CRM v23.6.406
-- 21vek: bind production TOP to the full card run that immediately preceded it.
-- Later partial/test workflows cannot silently replace the TOP half of an already published pair.

CREATE OR REPLACE FUNCTION public.triovist_21vek_promotion_plan_v236404()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_run public.triovist_21vek_shadow_runs%rowtype;
  v_top public.triovist_21vek_top_runs%rowtype;
  v_next_shadow timestamptz;
  v_registry integer:=0;
  v_manager_count integer:=0;
  v_matched integer:=0;
  v_url_diff integer:=0;
  v_top_matched integer:=0;
  v_source text;
  v_pointer_count integer:=0;
  v_stage_ready integer:=0;
  v_post_pending integer:=0;
  v_legacy_pending integer:=0;
  v_managers jsonb;
begin
  select count(*)::int,count(distinct manager_email)::int
    into v_registry,v_manager_count
  from public.triovist_21vek_registry_v236214;

  if v_registry<1 or v_manager_count<1 then
    raise exception '21vek registry is empty';
  end if;

  select * into v_run
  from public.triovist_21vek_shadow_runs
  where status='complete'
    and coalesce(error_count,0)=0
    and coalesce(success_count,0)=coalesce(total_targets,0)
    and total_targets=v_registry
  order by finished_at desc nulls last
  limit 1;

  if v_run.id is null then
    raise exception 'No complete full-size own 21vek card run available for % targets',v_registry;
  end if;

  select min(started_at) into v_next_shadow
  from public.triovist_21vek_shadow_runs
  where started_at>v_run.started_at;

  select * into v_top
  from public.triovist_21vek_top_runs
  where status='complete'
    and coalesce(error_count,0)=0
    and total_targets=v_registry
    and started_at>=coalesce(v_run.finished_at,v_run.started_at)
    and (v_next_shadow is null or started_at<v_next_shadow)
  order by finished_at desc nulls last
  limit 1;

  if v_top.id is null then
    raise exception 'No paired complete full-size TOP run available for card run %',v_run.id;
  end if;

  select count(*)::int,
         count(*) filter(where s.product_url is distinct from r.product_url)::int
    into v_matched,v_url_diff
  from public.triovist_21vek_registry_v236214 r
  join public.triovist_21vek_shadow_snapshots s
    on s.run_id=v_run.id
   and s.manager_email=r.manager_email
   and s.card_key=r.card_key
   and s.error_text is null;

  if v_matched<>v_registry or v_url_diff<>0 then
    raise exception 'Shadow mapping unsafe: matched %, expected %, url_diff %',
      v_matched,v_registry,v_url_diff;
  end if;

  select count(*)::int into v_top_matched
  from public.triovist_21vek_registry_v236214 r
  join public.triovist_21vek_top_snapshots t
    on t.run_id=v_top.id
   and t.manager_email=r.manager_email
   and t.card_key=r.card_key
   and nullif(trim(t.keyword),'') is not null
   and t.error_text is null;

  if v_top_matched<>v_registry then
    raise exception 'TOP mapping unsafe: matched %, expected %',v_top_matched,v_registry;
  end if;

  v_source:='own-21vek-shadow:'||v_run.id::text||':top:'||v_top.id::text;

  select count(*)::int,
         count(*) filter(where p.post_processed_at is null)::int,
         count(*) filter(where p.legacy_synced_at is null)::int
    into v_pointer_count,v_post_pending,v_legacy_pending
  from private.triovist_content_current_pointer_v236404 p
  join public.triovist_content_imports i on i.id=p.import_id
  where p.source_file=v_source
    and i.status='complete';

  with latest_stage as (
    select distinct on (lower(i.manager_email))
      i.id,lower(i.manager_email) manager_email,i.expected_cards,i.loaded_cards
    from public.triovist_content_imports i
    where i.source_file=v_source
      and i.status in ('loading','complete')
    order by lower(i.manager_email),
             case when private.triovist_pointer_is_current_v236404(i.id) then 0 else 1 end,
             i.created_at desc
  )
  select count(*)::int into v_stage_ready
  from latest_stage s
  where s.expected_cards>0
    and s.loaded_cards=s.expected_cards
    and (select count(*) from public.triovist_content_cards c where c.import_id=s.id)=s.expected_cards;

  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_email',x.manager_email,
    'manager_name',x.manager_name,
    'cards',x.cards
  ) order by x.manager_email),'[]'::jsonb)
  into v_managers
  from (
    select manager_email,max(manager_name) manager_name,count(*)::int cards
    from public.triovist_21vek_registry_v236214
    group by manager_email
  ) x;

  return jsonb_build_object(
    'ok',true,
    'version','v23.6.406',
    'run_id',v_run.id,
    'top_run_id',v_top.id,
    'source_file',v_source,
    'snapshot_date',(coalesce(v_run.finished_at,v_run.started_at,now()) at time zone 'Europe/Minsk')::date,
    'targets',v_registry,
    'manager_count',v_manager_count,
    'managers',v_managers,
    'already_promoted',(v_pointer_count=v_manager_count and v_manager_count>0),
    'staging_ready',(v_stage_ready=v_manager_count and v_manager_count>0),
    'staging_ready_managers',v_stage_ready,
    'post_pending',v_post_pending,
    'legacy_pending',v_legacy_pending,
    'recovery_needed',(
      ((v_pointer_count<>v_manager_count) and v_stage_ready=v_manager_count and v_manager_count>0)
      or v_post_pending>0
      or v_legacy_pending>0
    ),
    'working_mode','manager_pointer',
    'full_run_required',true,
    'top_pairing','before_next_shadow_run'
  );
end;
$function$\n\nCREATE OR REPLACE FUNCTION public.triovist_21vek_recovery_gate_v236404()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_run public.triovist_21vek_shadow_runs%rowtype;
  v_top public.triovist_21vek_top_runs%rowtype;
  v_next_shadow timestamptz;
  v_source text;
  v_targets integer:=0;
  v_managers integer:=0;
  v_stage integer:=0;
  v_pointer integer:=0;
  v_post integer:=0;
  v_legacy integer:=0;
begin
  select count(*)::int,count(distinct manager_email)::int
    into v_targets,v_managers
  from public.triovist_21vek_registry_v236214;

  if v_targets<1 or v_managers<1 then
    return jsonb_build_object('ok',true,'recovery_needed',false,'reason','empty_registry');
  end if;

  select * into v_run
  from public.triovist_21vek_shadow_runs
  where status='complete'
    and coalesce(error_count,0)=0
    and coalesce(success_count,0)=coalesce(total_targets,0)
    and total_targets=v_targets
  order by finished_at desc nulls last
  limit 1;

  if v_run.id is null then
    return jsonb_build_object('ok',true,'recovery_needed',false,'reason','no_full_complete_shadow');
  end if;

  select min(started_at) into v_next_shadow
  from public.triovist_21vek_shadow_runs
  where started_at>v_run.started_at;

  select * into v_top
  from public.triovist_21vek_top_runs
  where status='complete'
    and coalesce(error_count,0)=0
    and total_targets=v_targets
    and started_at>=coalesce(v_run.finished_at,v_run.started_at)
    and (v_next_shadow is null or started_at<v_next_shadow)
  order by finished_at desc nulls last
  limit 1;

  if v_top.id is null then
    return jsonb_build_object(
      'ok',true,'recovery_needed',false,'reason','no_paired_full_top',
      'run_id',v_run.id,'targets',v_targets
    );
  end if;

  v_source:='own-21vek-shadow:'||v_run.id::text||':top:'||v_top.id::text;

  with s as (
    select distinct on (lower(manager_email))
      id,lower(manager_email) manager_email,expected_cards,loaded_cards
    from public.triovist_content_imports
    where source_file=v_source and status in ('loading','complete')
    order by lower(manager_email),created_at desc
  )
  select count(*)::int into v_stage
  from s
  where expected_cards>0 and expected_cards=loaded_cards;

  select count(*)::int,
         count(*) filter(where post_processed_at is null)::int,
         count(*) filter(where legacy_synced_at is null)::int
    into v_pointer,v_post,v_legacy
  from private.triovist_content_current_pointer_v236404
  where source_file=v_source;

  return jsonb_build_object(
    'ok',true,
    'run_id',v_run.id,
    'top_run_id',v_top.id,
    'source_file',v_source,
    'targets',v_targets,
    'manager_count',v_managers,
    'staging_ready',(v_stage=v_managers and v_managers>0),
    'already_promoted',(v_pointer=v_managers and v_managers>0),
    'post_pending',v_post,
    'legacy_pending',v_legacy,
    'recovery_needed',(
      ((v_pointer<>v_managers) and v_stage=v_managers and v_managers>0)
      or v_post>0
      or v_legacy>0
    ),
    'top_pairing','before_next_shadow_run'
  );
end;
$function$
