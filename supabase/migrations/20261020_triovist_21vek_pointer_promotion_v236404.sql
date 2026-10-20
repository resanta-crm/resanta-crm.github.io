-- RESANTA CRM v23.6.404
-- Triovist / 21vek: pointer-based atomic promotion + parser-free recovery.
-- Critical publication changes only manager pointers; legacy is_current is compatibility state.

create table if not exists private.triovist_content_current_pointer_v236404 (
  manager_email text primary key,
  import_id uuid not null references public.triovist_content_imports(id) on delete restrict,
  source_file text not null,
  run_id uuid,
  top_run_id uuid,
  activated_at timestamptz not null default now(),
  post_processed_at timestamptz,
  legacy_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists triovist_content_current_pointer_v236404_import_uidx
  on private.triovist_content_current_pointer_v236404(import_id);

comment on table private.triovist_content_current_pointer_v236404 is
  'Authoritative Triovist working snapshot pointer. Critical publication changes only these manager rows.';

insert into private.triovist_content_current_pointer_v236404(
  manager_email,import_id,source_file,run_id,top_run_id,activated_at,post_processed_at,legacy_synced_at,updated_at
)
select
  lower(i.manager_email),i.id,i.source_file,
  case when substring(i.source_file from 'own-21vek-shadow:([0-9a-fA-F-]{36})') is not null
       then substring(i.source_file from 'own-21vek-shadow:([0-9a-fA-F-]{36})')::uuid end,
  case when substring(i.source_file from 'top:([0-9a-fA-F-]{36})$') is not null
       then substring(i.source_file from 'top:([0-9a-fA-F-]{36})$')::uuid end,
  coalesce(i.completed_at,i.created_at,now()),now(),now(),now()
from public.triovist_content_imports i
where i.is_current and i.status='complete'
on conflict(manager_email) do nothing;

CREATE OR REPLACE FUNCTION private.triovist_pointer_is_current_v236404(p_import_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_catalog'
AS $function$
  select exists(
    select 1
    from private.triovist_content_current_pointer_v236404 p
    where p.import_id=p_import_id
  );
$function$;

CREATE OR REPLACE FUNCTION private.triovist_refresh_position_metrics_trigger_v236351()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
begin
  if coalesce(current_setting('app.triovist_pointer_legacy_sync',true),'')='1' then
    return new;
  end if;

  if new.is_current and new.status='complete' then
    if tg_op='INSERT'
       or old.is_current is distinct from new.is_current
       or old.status is distinct from new.status
       or old.source_file is distinct from new.source_file then
      begin
        perform private.triovist_refresh_position_metrics_v236351(new.manager_email);
      exception when others then
        raise warning 'TRIOVIST_POSITION_METRICS_REFRESH_FAILED manager=% error=%',new.manager_email,sqlerrm;
      end;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_tasks_after_import()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
begin
  if coalesce(current_setting('app.triovist_pointer_legacy_sync',true),'')='1' then
    return new;
  end if;

  if new.status='complete' and new.is_current
     and (old.status is distinct from new.status or old.is_current is distinct from new.is_current) then
    perform public.triovist_tasks_reconcile_import(new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_promotion_plan_v236404()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_base jsonb;
  v_source text;
  v_manager_count integer:=0;
  v_pointer_count integer:=0;
  v_stage_ready integer:=0;
  v_post_pending integer:=0;
  v_legacy_pending integer:=0;
begin
  v_base:=public.triovist_21vek_promotion_plan_v236403();
  if not coalesce((v_base->>'ok')::boolean,false) then
    raise exception 'Base promotion plan is not safe';
  end if;

  v_source:=v_base->>'source_file';
  v_manager_count:=coalesce((v_base->>'manager_count')::integer,0);

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

  return v_base || jsonb_build_object(
    'version','v23.6.404',
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
    'working_mode','manager_pointer'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_activate_shadow_v236404(p_run_id uuid, p_top_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
  v_source text;
  v_expected integer:=0;
  v_ready integer:=0;
  v_results jsonb;
begin
  v_plan:=public.triovist_21vek_promotion_plan_v236404();

  if (v_plan->>'run_id')::uuid is distinct from p_run_id
     or (v_plan->>'top_run_id')::uuid is distinct from p_top_run_id then
    raise exception 'Activation blocked: requested run is not the latest fully validated run';
  end if;

  v_source:=v_plan->>'source_file';
  v_expected:=coalesce((v_plan->>'manager_count')::integer,0);

  if coalesce((v_plan->>'already_promoted')::boolean,false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'manager_email',p.manager_email,
      'manager_name',i.manager_name,
      'import_id',p.import_id,
      'cards',i.loaded_cards,
      'post_processed',(p.post_processed_at is not null),
      'legacy_synced',(p.legacy_synced_at is not null)
    ) order by p.manager_email),'[]'::jsonb)
    into v_results
    from private.triovist_content_current_pointer_v236404 p
    join public.triovist_content_imports i on i.id=p.import_id
    where p.source_file=v_source;

    return jsonb_build_object(
      'ok',true,'skipped',true,'already_promoted',true,
      'source_file',v_source,'run_id',p_run_id,'top_run_id',p_top_run_id,
      'results',v_results
    );
  end if;

  create temporary table tmp_triovist_pointer_activate_v236404(
    id uuid primary key,
    manager_email text not null,
    manager_name text,
    cards integer not null
  ) on commit drop;

  insert into tmp_triovist_pointer_activate_v236404(id,manager_email,manager_name,cards)
  select id,lower(manager_email),manager_name,loaded_cards
  from (
    select distinct on (lower(i.manager_email))
      i.id,i.manager_email,i.manager_name,i.loaded_cards,i.expected_cards,i.created_at
    from public.triovist_content_imports i
    where i.source_file=v_source
      and i.status in ('loading','complete')
      and not private.triovist_pointer_is_current_v236404(i.id)
    order by lower(i.manager_email),i.created_at desc
  ) s
  where s.expected_cards>0
    and s.loaded_cards=s.expected_cards
    and (select count(*) from public.triovist_content_cards c where c.import_id=s.id)=s.expected_cards;

  select count(*)::int into v_ready
  from tmp_triovist_pointer_activate_v236404;

  if v_ready<>v_expected or v_expected<1 then
    raise exception 'Pointer activation blocked: ready managers %, expected %',v_ready,v_expected;
  end if;

  -- Cheap status transition only. Staged rows have is_current=false, so legacy
  -- heavy triggers do not execute here.
  update public.triovist_content_imports i
  set status='complete',
      completed_at=coalesce(i.completed_at,now()),
      error_text=null
  from tmp_triovist_pointer_activate_v236404 x
  where i.id=x.id;

  -- Authoritative publication: exactly one upsert row per manager.
  insert into private.triovist_content_current_pointer_v236404(
    manager_email,import_id,source_file,run_id,top_run_id,
    activated_at,post_processed_at,legacy_synced_at,updated_at
  )
  select x.manager_email,x.id,v_source,p_run_id,p_top_run_id,
         now(),null,null,now()
  from tmp_triovist_pointer_activate_v236404 x
  on conflict(manager_email) do update set
    import_id=excluded.import_id,
    source_file=excluded.source_file,
    run_id=excluded.run_id,
    top_run_id=excluded.top_run_id,
    activated_at=excluded.activated_at,
    post_processed_at=case
      when private.triovist_content_current_pointer_v236404.import_id=excluded.import_id
        then private.triovist_content_current_pointer_v236404.post_processed_at
      else null end,
    legacy_synced_at=case
      when private.triovist_content_current_pointer_v236404.import_id=excluded.import_id
        then private.triovist_content_current_pointer_v236404.legacy_synced_at
      else null end,
    updated_at=now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_email',x.manager_email,'manager_name',x.manager_name,
    'import_id',x.id,'cards',x.cards,
    'post_processed',false,'legacy_synced',false
  ) order by x.manager_email),'[]'::jsonb)
  into v_results
  from tmp_triovist_pointer_activate_v236404 x;

  return jsonb_build_object(
    'ok',true,'skipped',false,'activated',true,
    'source_file',v_source,'run_id',p_run_id,'top_run_id',p_top_run_id,
    'results',v_results,'working_mode','manager_pointer'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_post_activate_v236404(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
 SET statement_timeout TO '55s'
AS $function$
declare
  v_manager text;
  v_done timestamptz;
  v_issues jsonb;
  v_tasks jsonb;
begin
  select p.manager_email,p.post_processed_at
    into v_manager,v_done
  from private.triovist_content_current_pointer_v236404 p
  where p.import_id=p_import_id
  for update;

  if v_manager is null then
    raise exception 'Post-processing blocked: import is not the active pointer';
  end if;

  if v_done is not null then
    return jsonb_build_object(
      'ok',true,'skipped',true,'import_id',p_import_id,
      'manager_email',v_manager,'post_processed_at',v_done
    );
  end if;

  v_issues:=public.triovist_21vek_rebuild_issues_v236403(p_import_id);
  v_tasks:=public.triovist_tasks_reconcile_import(p_import_id);
  perform private.triovist_refresh_position_metrics_v236351(v_manager);

  update private.triovist_content_current_pointer_v236404
  set post_processed_at=now(),updated_at=now()
  where import_id=p_import_id;

  return jsonb_build_object(
    'ok',true,'skipped',false,'import_id',p_import_id,
    'manager_email',v_manager,'issues',v_issues,'tasks',v_tasks
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_sync_legacy_current_v236404()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_managers integer:=0;
begin
  perform set_config('app.triovist_pointer_legacy_sync','1',true);

  update public.triovist_content_imports i
  set is_current=false
  where i.is_current
    and exists(
      select 1
      from private.triovist_content_current_pointer_v236404 p
      where p.manager_email=lower(i.manager_email)
        and p.import_id<>i.id
    );

  update public.triovist_content_imports i
  set is_current=true
  from private.triovist_content_current_pointer_v236404 p
  where i.id=p.import_id
    and not i.is_current
    and i.status='complete';

  update private.triovist_content_current_pointer_v236404 p
  set legacy_synced_at=now(),updated_at=now()
  where exists(
    select 1
    from public.triovist_content_imports i
    where i.id=p.import_id and i.is_current and i.status='complete'
  );

  select count(*)::int into v_managers
  from private.triovist_content_current_pointer_v236404
  where legacy_synced_at is not null;

  return jsonb_build_object('ok',true,'synced_managers',v_managers,'working_mode','manager_pointer');
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_recovery_gate_v236404()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_run public.triovist_21vek_shadow_runs%rowtype;
  v_top public.triovist_21vek_top_runs%rowtype;
  v_source text;
  v_managers integer:=0;
  v_stage integer:=0;
  v_pointer integer:=0;
  v_post integer:=0;
  v_legacy integer:=0;
begin
  select * into v_run
  from public.triovist_21vek_shadow_runs
  where status='complete'
    and coalesce(error_count,0)=0
    and coalesce(success_count,0)=coalesce(total_targets,0)
    and coalesce(total_targets,0)>0
  order by finished_at desc nulls last
  limit 1;

  if v_run.id is null then
    return jsonb_build_object('ok',true,'recovery_needed',false,'reason','no_complete_shadow');
  end if;

  select * into v_top
  from public.triovist_21vek_top_runs
  where status='complete'
    and coalesce(error_count,0)=0
    and total_targets=v_run.total_targets
  order by
    case when started_at>=v_run.started_at then 0 else 1 end,
    finished_at desc nulls last
  limit 1;

  if v_top.id is null then
    return jsonb_build_object('ok',true,'recovery_needed',false,'reason','no_complete_top');
  end if;

  v_source:='own-21vek-shadow:'||v_run.id::text||':top:'||v_top.id::text;

  select count(distinct manager_email)::int into v_managers
  from public.triovist_21vek_registry_v236214;

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
    'manager_count',v_managers,
    'staging_ready',(v_stage=v_managers and v_managers>0),
    'already_promoted',(v_pointer=v_managers and v_managers>0),
    'post_pending',v_post,
    'legacy_pending',v_legacy,
    'recovery_needed',(
      ((v_pointer<>v_managers) and v_stage=v_managers and v_managers>0)
      or v_post>0
      or v_legacy>0
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.triovist_own_listing_metrics_v236351(p_manager_filter text DEFAULT ''::text)
 RETURNS TABLE(manager_email text, manager_name text, card_key text, sku text, donor_article text, product_name text, category text, subgroup text, keyword text, current_position integer, current_exact boolean, current_top60 boolean, current_label text, current_observed_at timestamp with time zone, previous_position integer, previous_label text, previous_observed_at timestamp with time zone, position_delta integer, movement text, pos_1d text, pos_3d text, pos_7d text, pos_14d text, pos_30d text, best_30d integer, worst_30d text, changed_at timestamp with time zone, price_21vek numeric, mrc_byn numeric, in_stock boolean, search_total integer, current_error text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
with curr as materialized (
  select
    c.manager_email,
    c.manager_name,
    c.card_key,
    c.sku,
    c.donor_article,
    c.product_name,
    c.category,
    c.subgroup,
    coalesce(nullif(btrim(t.keyword),''),nullif(btrim(tc.keyword),''),c.keyword,'') keyword,
    coalesce(t.position,tc.position) current_position,
    coalesce(t.position_exact,tc.position_exact,false) current_exact,
    coalesce(t.top60,tc.top60) current_top60,
    private.triovist_position_label_v236351(
      coalesce(t.position,tc.position),
      coalesce(t.position_exact,tc.position_exact,false),
      coalesce(t.top60,tc.top60),
      coalesce(t.error_text,tc.error_text)
    ) current_label,
    coalesce(t.observed_at,tc.observed_at,ci.completed_at,ci.created_at) current_observed_at,
    c.price price_21vek,
    m.mrc_byn,
    c.in_stock,
    coalesce(t.search_total,tc.search_total) search_total,
    coalesce(t.error_text,tc.error_text) current_error
  from public.triovist_content_imports ci
  join public.triovist_content_cards c on c.import_id=ci.id
  left join public.triovist_21vek_top_snapshots t
    on t.run_id=(
      case
        when substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$') is not null
        then substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$')::uuid
        else null
      end
    )
   and t.manager_email=c.manager_email
   and t.card_key=c.card_key
  left join public.triovist_21vek_top_current tc
    on t.id is null
   and tc.manager_email=c.manager_email
   and tc.card_key=c.card_key
  left join public.triovist_mrc_current m on btrim(m.sku)=btrim(c.sku)
  where private.triovist_pointer_is_current_v236404(ci.id) and ci.status='complete'
    and (coalesce(p_manager_filter,'')='' or lower(c.manager_email)=lower(p_manager_filter))
),
hist as materialized (
  select
    c.manager_email,
    c.card_key,
    c.current_label,
    c.current_observed_at,
    s.observed_at,
    s.position,
    s.position_exact,
    s.top60,
    s.error_text,
    private.triovist_position_label_v236351(s.position,s.position_exact,s.top60,s.error_text) state_label
  from curr c
  join public.triovist_21vek_top_snapshots s
    on s.manager_email=c.manager_email
   and s.card_key=c.card_key
   and s.observed_at<=c.current_observed_at
  join public.triovist_21vek_top_runs r
    on r.id=s.run_id
   and r.status='complete'
),
ranked0 as (
  select
    h.*,
    row_number() over(partition by h.manager_email,h.card_key order by h.observed_at desc) rn
  from hist h
),
ranked as (
  select
    r0.*,
    min(case when r0.state_label is distinct from r0.current_label then r0.rn end)
      over(partition by r0.manager_email,r0.card_key) first_diff_rn
  from ranked0 r0
),
agg as (
  select
    c.manager_email,c.card_key,
    (array_agg(r.position order by r.observed_at desc) filter(where r.rn=2))[1] previous_position,
    (array_agg(r.state_label order by r.observed_at desc) filter(where r.rn=2))[1] previous_label,
    (array_agg(r.observed_at order by r.observed_at desc) filter(where r.rn=2))[1] previous_observed_at,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '1 day'))[1] pos_1d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '3 days'))[1] pos_3d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '7 days'))[1] pos_7d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '14 days'))[1] pos_14d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '30 days'))[1] pos_30d,
    min(r.position) filter(
      where r.position_exact and r.position between 1 and 60
        and r.observed_at>=c.current_observed_at-interval '30 days'
    ) best_30d,
    case
      when bool_or(r.top60 is false) filter(where r.observed_at>=c.current_observed_at-interval '30 days') then '>60'
      else max(r.position) filter(
        where r.position_exact and r.position between 1 and 60
          and r.observed_at>=c.current_observed_at-interval '30 days'
      )::text
    end worst_30d,
    min(r.observed_at) filter(
      where r.rn < coalesce(r.first_diff_rn,2147483647)
    ) changed_at
  from curr c
  left join ranked r
    on r.manager_email=c.manager_email and r.card_key=c.card_key
  group by c.manager_email,c.card_key,c.current_observed_at
)
select
  c.manager_email,
  c.manager_name,
  c.card_key,
  c.sku,
  c.donor_article,
  c.product_name,
  c.category,
  c.subgroup,
  c.keyword,
  c.current_position,
  c.current_exact,
  c.current_top60,
  c.current_label,
  c.current_observed_at,
  a.previous_position,
  coalesce(a.previous_label,'—') previous_label,
  a.previous_observed_at,
  case
    when c.current_exact and a.previous_position between 1 and 60
      then a.previous_position-c.current_position
    else null
  end position_delta,
  case
    when a.previous_label is null then 'new'
    when c.current_label='Ошибка' then 'error'
    when c.current_exact and a.previous_position between 1 and 60 and c.current_position<a.previous_position then 'up'
    when c.current_exact and a.previous_position between 1 and 60 and c.current_position>a.previous_position then 'down'
    when c.current_exact and a.previous_position between 1 and 60 and c.current_position=a.previous_position then 'same'
    when c.current_exact and a.previous_label='>60' then 'entered'
    when c.current_label='>60' and a.previous_position between 1 and 60 then 'exited'
    when c.current_label='>60' and a.previous_label='>60' then 'outside'
    else 'unknown'
  end movement,
  coalesce(a.pos_1d,'—') pos_1d,
  coalesce(a.pos_3d,'—') pos_3d,
  coalesce(a.pos_7d,'—') pos_7d,
  coalesce(a.pos_14d,'—') pos_14d,
  coalesce(a.pos_30d,'—') pos_30d,
  a.best_30d,
  coalesce(a.worst_30d,'—') worst_30d,
  coalesce(a.changed_at,c.current_observed_at) changed_at,
  c.price_21vek,
  c.mrc_byn,
  c.in_stock,
  c.search_total,
  c.current_error
from curr c
left join agg a on a.manager_email=c.manager_email and a.card_key=c.card_key
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_mrc_dashboard_v236220()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  a record;
  result jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru',
    'sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru',
    'krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к контролю МРЦ 21vek' using errcode='42501';
  end if;

  with registry_meta as (
    select count(*)::int targets
    from public.triovist_21vek_registry_v236214
  ), latest_run as (
    select r.id,r.finished_at,r.started_at
    from public.triovist_21vek_shadow_runs r
    cross join registry_meta g
    where r.status='complete'
      and coalesce(r.error_count,0)=0
      and coalesce(r.success_count,0)=coalesce(r.total_targets,0)
      and r.total_targets=g.targets
      and g.targets>0
    order by r.finished_at desc nulls last
    limit 1
  ), shadow_cards as (
    select distinct on (trim(s.sku))
      trim(s.sku) sku,s.product_name,s.manager_email,
      coalesce(r.manager_name,'—') manager_name,
      s.category,s.subgroup,s.product_url,s.current_price price,s.in_stock,s.observed_at
    from latest_run lr
    join public.triovist_21vek_shadow_snapshots s on s.run_id=lr.id and s.error_text is null
    left join public.triovist_21vek_registry_v236214 r
      on r.manager_email=s.manager_email and r.card_key=s.card_key
    where nullif(trim(s.sku),'') is not null
    order by trim(s.sku),s.observed_at desc
  ), working_cards as (
    select distinct on (trim(c.sku))
      trim(c.sku) sku,c.product_name,c.manager_email,c.manager_name,
      c.category,c.subgroup,c.product_url,c.price,c.in_stock,c.created_at observed_at
    from public.triovist_content_imports i
    join public.triovist_content_cards c on c.import_id=i.id
    where private.triovist_pointer_is_current_v236404(i.id) and i.status='complete'
      and i.source_file like 'own-21vek-shadow:%'
      and nullif(trim(c.sku),'') is not null
    order by trim(c.sku),c.created_at desc
  ), cards as (
    select * from shadow_cards
    union all
    select * from working_cards
    where not exists(select 1 from latest_run)
  ), joined as (
    select c.*,m.mrc_byn,
      case when m.mrc_byn>0 and c.price is not null then round(c.price-m.mrc_byn,2) end delta_byn,
      case when m.mrc_byn>0 and c.price is not null then round((c.price-m.mrc_byn)/m.mrc_byn*100,2) end delta_pct
    from cards c
    left join public.triovist_mrc_current m on trim(m.sku)=c.sku
  ), deviations as (
    select *
    from joined
    where mrc_byn is not null and price is not null and abs(coalesce(delta_pct,0))>=0.01
    order by
      case when in_stock and delta_pct<0 then 0
           when not coalesce(in_stock,false) and delta_pct<0 then 1
           else 2 end,
      delta_pct asc,sku
    limit 120
  ), missing as (
    select *
    from joined
    where mrc_byn is null
    order by coalesce(in_stock,false) desc,sku
    limit 80
  )
  select jsonb_build_object(
    'version','v23.6.404',
    'source_file','РБ МРЦ 06.10.2026.xlsx',
    'effective_date',(select max(effective_date) from public.triovist_mrc_current where source_file='РБ МРЦ 06.10.2026.xlsx'),
    'price_source',case when exists(select 1 from latest_run) then 'latest_complete_own_parser' else 'working_snapshot_fallback' end,
    'price_run_id',(select id from latest_run),
    'price_observed_at',(select max(observed_at) from cards),
    'summary',jsonb_build_object(
      'mrc_rows',(select count(*) from public.triovist_mrc_current where source_file='РБ МРЦ 06.10.2026.xlsx'),
      'cards',(select count(*) from joined),
      'with_mrc',(select count(*) from joined where mrc_byn is not null),
      'missing_mrc',(select count(*) from joined where mrc_byn is null),
      'below_mrc',(select count(*) from joined where delta_pct<0),
      'below_mrc_in_stock',(select count(*) from joined where in_stock is true and delta_pct<0),
      'critical_below_mrc',(select count(*) from joined where in_stock is true and delta_pct < -5),
      'below_mrc_out_stock',(select count(*) from joined where coalesce(in_stock,false)=false and delta_pct<0),
      'above_mrc',(select count(*) from joined where delta_pct>0),
      'at_mrc',(select count(*) from joined where mrc_byn is not null and abs(coalesce(delta_pct,0))<0.01)
    ),
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku',sku,'product_name',product_name,'manager_email',manager_email,'manager_name',manager_name,
        'category',category,'subgroup',subgroup,'product_url',product_url,'price',price,'mrc_byn',mrc_byn,
        'delta_byn',delta_byn,'delta_pct',delta_pct,'in_stock',in_stock,'observed_at',observed_at,
        'status',case
          when coalesce(in_stock,false)=false and delta_pct<0 then 'inactive_below'
          when delta_pct < -5 then 'critical'
          when delta_pct < -2 then 'warning'
          when delta_pct < 0 then 'slight'
          when delta_pct > 0 then 'above'
          else 'ok' end
      ) order by
        case when in_stock and delta_pct<0 then 0
             when not coalesce(in_stock,false) and delta_pct<0 then 1
             else 2 end,
        delta_pct asc,sku)
      from deviations
    ),'[]'::jsonb),
    'missing_mrc_rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku',sku,'product_name',product_name,'manager_email',manager_email,'manager_name',manager_name,
        'product_url',product_url,'price',price,'in_stock',in_stock,'observed_at',observed_at,
        'status','missing_mrc'
      ) order by coalesce(in_stock,false) desc,sku)
      from missing
    ),'[]'::jsonb),
    'generated_at',now()
  ) into result;

  return result;
end;
$function$;

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
     and v_nonpositive=0 then
    v_health:=case when v_latest_failed_after_good then 'amber' else 'green' end;
  elsif v_good.finished_at is not null
        and v_age<=48
        and v_nonpositive=0 then
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
$function$;

CREATE OR REPLACE FUNCTION public.triovist_content_export_v236110(p_manager_email text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_limit integer:=least(greatest(coalesce(p_limit,1000),1),1000);
  v_rows jsonb;
  v_total integer:=0;
  v_snapshot date;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден'; end if;

  if a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер';
    end if;
  elsif a.actor_scope='triovist'
        and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к выгрузке 21vek';
  end if;

  select count(*),max(i.snapshot_date)
    into v_total,v_snapshot
  from public.triovist_content_cards c
  join public.triovist_content_imports i on i.id=c.import_id
  where private.triovist_pointer_is_current_v236404(i.id) and i.status='complete'
    and (v_filter='' or i.manager_email=v_filter);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.manager_name,x.category,x.subgroup,x.product_name),'[]'::jsonb)
    into v_rows
  from (
    select
      c.import_id,
      c.manager_name,
      c.manager_email,
      c.sku,
      c.donor_article,
      c.product_name,
      c.category,
      c.subgroup,
      c.product_url,
      c.price,
      c.description_present,
      c.warranty_present,
      coalesce(nullif(trim(t.keyword),''),c.keyword) as keyword,
      case
        when coalesce(t.position_exact,false) then t.position::numeric
        else c.listing_position
      end as listing_position,
      t.position as top_position,
      t.position_exact as top_position_exact,
      coalesce(
        t.top30,
        case when c.listing_position is not null then c.listing_position<=30 else null end
      ) as top30,
      coalesce(
        t.top60,
        case when c.listing_position is not null then c.listing_position<=60 else null end
      ) as top60,
      t.search_total as top_search_total,
      t.error_text as top_error,
      case
        when t.error_text is not null then 'Ошибка'
        when t.top30 is true then 'TOP-30'
        when t.top60 is true then 'TOP-60'
        when t.top60 is false then 'Вне TOP-60'
        when c.listing_position is not null and c.listing_position<=30 then 'TOP-30'
        when c.listing_position is not null and c.listing_position<=60 then 'TOP-60'
        when c.listing_position is not null and c.listing_position>60 then 'Вне TOP-60'
        else 'Не проверено'
      end as top_status,
      c.product_rating,
      c.last_review_rating,
      c.review_count,
      c.photo_count,
      c.video_count,
      c.in_stock,
      c.negative_reviews,
      c.unanswered_negative_reviews,
      c.latest_review_date,
      c.latest_review_text,
      c.latest_review_answered,
      i.snapshot_date
    from public.triovist_content_cards c
    join public.triovist_content_imports i on i.id=c.import_id
    left join public.triovist_21vek_top_snapshots t
      on t.run_id=(
           case
             when substring(i.source_file from 'top:([0-9a-fA-F-]{36})$') is not null
             then substring(i.source_file from 'top:([0-9a-fA-F-]{36})$')::uuid
             else null
           end
         )
     and t.manager_email=c.manager_email
     and t.card_key=c.card_key
    where private.triovist_pointer_is_current_v236404(i.id) and i.status='complete'
      and (v_filter='' or i.manager_email=v_filter)
    order by c.manager_name,c.category,c.subgroup,c.product_name
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'rows',v_rows,
    'total',v_total,
    'offset',v_offset,
    'limit',v_limit,
    'has_more',(v_offset + jsonb_array_length(v_rows) < v_total),
    'snapshot_date',v_snapshot,
    'manager_filter',nullif(v_filter,'')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_content_export_v236221(p_manager_email text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  a record;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_limit integer:=least(greatest(coalesce(p_limit,500),1),500);
  v_rows jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_snapshot date;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then
    raise exception 'Пользователь не найден' using errcode='42501';
  end if;

  if a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер' using errcode='22023';
    end if;
  elsif a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к выгрузке 21vek' using errcode='42501';
  end if;

  with ci as materialized (
    select id,manager_email,snapshot_date,source_file
    from public.triovist_content_imports
    where private.triovist_pointer_is_current_v236404(id) and status='complete'
      and (v_filter='' or manager_email=v_filter)
  )
  select count(*),max(ci.snapshot_date)
  into v_total,v_snapshot
  from ci
  join public.triovist_content_cards c on c.import_id=ci.id;

  with ci as materialized (
    select id,manager_email,snapshot_date,source_file
    from public.triovist_content_imports
    where private.triovist_pointer_is_current_v236404(id) and status='complete'
      and (v_filter='' or manager_email=v_filter)
  ),
  page_rows as (
    select
      c.manager_name,
      c.manager_email,
      c.sku,
      c.donor_article,
      c.product_name,
      c.category,
      c.subgroup,
      c.product_url,
      c.price,
      m.mrc_byn,
      case when m.mrc_byn>0 and c.price is not null
           then round(c.price-m.mrc_byn,2) end as mrc_delta_byn,
      case when m.mrc_byn>0 and c.price is not null
           then round((c.price-m.mrc_byn)/m.mrc_byn*100,2) end as mrc_delta_pct,
      case
        when m.mrc_byn is null then 'Нет МРЦ'
        when c.price is null then 'Нет цены'
        when coalesce(c.in_stock,false)=false and c.price<m.mrc_byn then 'Ниже МРЦ · нет в наличии'
        when c.price<m.mrc_byn*0.95 then 'Ниже МРЦ >5%'
        when c.price<m.mrc_byn*0.98 then 'Ниже МРЦ 2–5%'
        when c.price<m.mrc_byn then 'Ниже МРЦ <2%'
        when c.price=m.mrc_byn then 'МРЦ'
        else 'Выше МРЦ'
      end as mrc_status,
      c.description_present,
      c.warranty_present,
      coalesce(pm.keyword,nullif(trim(t.keyword),''),c.keyword) as keyword,

      -- Старые поля оставлены для обратной совместимости.
      case
        when coalesce(t.position_exact,false) then t.position::numeric
        else c.listing_position
      end as listing_position,
      t.position as top_position,
      t.position_exact as top_position_exact,
      coalesce(t.top30,case when c.listing_position is not null then c.listing_position<=30 else null end) as top30,
      coalesce(t.top60,case when c.listing_position is not null then c.listing_position<=60 else null end) as top60,
      t.search_total as top_search_total,
      t.error_text as top_error,
      case
        when t.error_text is not null then 'Ошибка'
        when t.top30 is true then 'TOP-30'
        when t.top60 is true then 'TOP-60'
        when t.top60 is false then 'Вне TOP-60'
        when c.listing_position between 1 and 30 then 'TOP-30'
        when c.listing_position between 31 and 60 then 'TOP-60'
        when c.listing_position>60 then 'Вне TOP-60'
        else 'Не проверено'
      end as top_status,

      -- v23.6.351: позиционный листинг.
      pm.current_label as position_now,
      pm.current_position as position_now_numeric,
      pm.previous_label as position_previous,
      pm.previous_position as position_previous_numeric,
      pm.position_delta,
      pm.movement as position_movement,
      pm.pos_1d as position_1d,
      pm.pos_3d as position_3d,
      pm.pos_7d as position_7d,
      pm.pos_14d as position_14d,
      pm.pos_30d as position_30d,
      pm.best_30d as position_best_30d,
      pm.worst_30d as position_worst_30d,
      pm.changed_at as position_changed_at,
      pm.current_observed_at as position_checked_at,

      c.product_rating,
      c.last_review_rating,
      c.review_count,
      c.photo_count,
      c.video_count,
      c.in_stock,
      c.negative_reviews,
      c.unanswered_negative_reviews,
      c.latest_review_date,
      c.latest_review_text,
      c.latest_review_answered,
      ci.snapshot_date
    from ci
    join public.triovist_content_cards c on c.import_id=ci.id
    left join public.triovist_21vek_top_snapshots t
      on t.run_id=(
           case
             when substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$') is not null
             then substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$')::uuid
             else null
           end
         )
     and t.manager_email=c.manager_email
     and t.card_key=c.card_key
    left join public.triovist_21vek_position_metrics_v236351 pm
      on pm.manager_email=c.manager_email and pm.card_key=c.card_key
    left join public.triovist_mrc_current m on trim(m.sku)=trim(c.sku)
    order by c.manager_name,c.category,c.subgroup,c.product_name,c.sku
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows)),'[]'::jsonb)
  into v_rows
  from page_rows;

  return jsonb_build_object(
    'version','v23.6.351',
    'rows',v_rows,
    'total',v_total,
    'offset',v_offset,
    'limit',v_limit,
    'has_more',(v_offset + jsonb_array_length(v_rows) < v_total),
    'snapshot_date',v_snapshot,
    'manager_filter',nullif(v_filter,''),
    'listing_mode','position_history'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_content_get_dashboard(p_manager_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  a record;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_managers jsonb;
  v_issues jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден'; end if;

  if a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер';
    end if;
  elsif a.actor_scope='triovist'
        and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к контролю карточек 21vek';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.manager_name),'[]'::jsonb)
  into v_managers
  from (
    select i.id as import_id,i.manager_email,i.manager_name,i.source_file,
           i.snapshot_date,i.created_at,i.completed_at,i.summary
    from public.triovist_content_imports i
    where private.triovist_pointer_is_current_v236404(i.id) and i.status='complete'
      and (v_filter='' or i.manager_email=v_filter)
  ) x;

  with base as materialized (
    select i.id,i.manager_email,i.manager_name,i.card_key,i.issue_type,i.issue_title,
           i.severity,i.status,i.current_value,i.previous_value,i.details,
           i.missing_from_latest,i.first_seen_at,i.last_seen_at,i.resolved_at,
           (i.first_seen_import_id=ci.id) as is_new_latest,
           (i.resolved_import_id=ci.id) as is_resolved_latest,
           ci.id as current_import_id,ci.snapshot_date
    from public.triovist_content_issues i
    join public.triovist_content_imports ci
      on ci.manager_email=i.manager_email
     and private.triovist_pointer_is_current_v236404(ci.id)
     and ci.status='complete'
    where (v_filter='' or i.manager_email=v_filter)
      and (i.status in ('open','needs_review') or i.resolved_import_id=ci.id)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.status when 'open' then 0 when 'needs_review' then 1 else 2 end,
    case x.severity when 'critical' then 0 when 'warning' then 1 else 2 end,
    x.manager_name,x.issue_title,x.product_name),'[]'::jsonb)
  into v_issues
  from (
    select b.id,b.manager_email,b.manager_name,b.card_key,b.issue_type,b.issue_title,
           b.severity,b.status,b.current_value,b.previous_value,b.details,
           b.missing_from_latest,b.first_seen_at,b.last_seen_at,b.resolved_at,
           b.is_new_latest,b.is_resolved_latest,
           c.sku,c.donor_article,c.product_name,c.category,c.subgroup,c.product_url,
           c.keyword,c.listing_position,c.product_rating,c.last_review_rating,
           c.review_count,c.question_count,c.photo_count,c.video_count,c.in_stock,
           c.unanswered_negative_reviews,c.unanswered_questions,
           c.latest_review_date,c.latest_review_text,
           c.hd_uploadable,c.yt_uploadable,b.snapshot_date,b.current_import_id
    from base b
    left join lateral (
      select c.sku,c.donor_article,c.product_name,c.category,c.subgroup,c.product_url,
             c.keyword,c.listing_position,c.product_rating,c.last_review_rating,
             c.review_count,c.question_count,c.photo_count,c.video_count,c.in_stock,
             c.unanswered_negative_reviews,c.unanswered_questions,
             c.latest_review_date,c.latest_review_text,c.hd_uploadable,c.yt_uploadable
      from public.triovist_content_cards c
      where c.import_id=b.current_import_id
        and c.card_key=b.card_key
      limit 1
    ) c on true
  ) x;

  return jsonb_build_object(
    'managers',v_managers,
    'issues',v_issues,
    'generated_at',now(),
    'runtime_version','v23.6.378'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_content_stage_commit(p_import_id uuid, p_expected_cards integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_import public.triovist_content_imports%rowtype;
  v_count integer;
  v_open integer;
  v_new integer;
  v_resolved integer;
  v_review integer;
  v_summary jsonb;
  v_has_own_parser boolean:=false;
  v_working_source text;
begin
  select * into v_import
  from public.triovist_content_imports
  where id=p_import_id
  for update;

  if not found or v_import.status<>'loading' then
    raise exception 'Загрузка не найдена или уже завершена';
  end if;
  if not public.triovist_content_can_access(v_import.manager_email,true) then
    raise exception 'Нет права завершать загрузку';
  end if;

  select count(*) into v_count
  from public.triovist_content_cards where import_id=p_import_id;

  if v_count<1 then raise exception 'В загрузке нет карточек'; end if;
  if coalesce(p_expected_cards,v_import.expected_cards)>0
     and v_count<>coalesce(p_expected_cards,v_import.expected_cards) then
    raise exception 'Загружено % карточек вместо %',v_count,coalesce(p_expected_cards,v_import.expected_cards);
  end if;

  -- После перехода на собственный парсер ручной Excel обновляет только реестр целей.
  -- Рабочий снимок, проблемы карточек и TOP он больше не подменяет.
  select exists(
    select 1 from public.triovist_content_imports i
    where lower(i.manager_email)=lower(v_import.manager_email)
      and i.status='complete' and private.triovist_pointer_is_current_v236404(i.id)
      and i.source_file like 'own-21vek-shadow:%'
  ), max(i.source_file) filter(where i.status='complete' and private.triovist_pointer_is_current_v236404(i.id) and i.source_file like 'own-21vek-shadow:%')
  into v_has_own_parser,v_working_source
  from public.triovist_content_imports i
  where lower(i.manager_email)=lower(v_import.manager_email);

  if v_has_own_parser and coalesce(v_import.source_file,'') not like 'own-21vek-shadow:%' then
    select jsonb_build_object(
      'cards',v_count,
      'registry_only',true,
      'working_source','own_21vek',
      'working_source_file',v_working_source,
      'in_stock',count(*) filter(where in_stock),
      'out_of_stock',count(*) filter(where not in_stock),
      'top30',count(*) filter(where listing_position is not null and listing_position<=30),
      'top60',count(*) filter(where listing_position is not null and listing_position<=60)
    ) into v_summary
    from public.triovist_content_cards
    where import_id=p_import_id;

    update public.triovist_content_imports
    set status='complete',loaded_cards=v_count,summary=v_summary,
        is_current=false,completed_at=now(),error_text=null
    where id=p_import_id;

    return jsonb_build_object(
      'import_id',p_import_id,'manager_email',v_import.manager_email,
      'manager_name',v_import.manager_name,'snapshot_date',v_import.snapshot_date,
      'summary',v_summary,'registry_only',true,
      'message','Файл принят в реестр целей. Рабочие карточки остаются от собственного парсера 21vek.'
    );
  end if;

  create temporary table tmp_triovist_issues(
    card_key text,issue_type text,issue_title text,severity text,current_value text,details jsonb
  ) on commit drop;

  -- Листинг: позиция отсутствует или карточка за пределами ТОП-60.
  insert into tmp_triovist_issues
  select card_key,'listing_outside_top60','Карточка вне ТОП-60','critical',
         coalesce(listing_position::text,'позиция не найдена'),
         jsonb_build_object('listing_position',listing_position,'keyword',keyword)
  from public.triovist_content_cards
  where import_id=p_import_id and (listing_position is null or listing_position>60);

  insert into tmp_triovist_issues
  select card_key,'listing_31_60','Карточка ниже ТОП-30','warning',listing_position::text,
         jsonb_build_object('listing_position',listing_position,'keyword',keyword)
  from public.triovist_content_cards
  where import_id=p_import_id and listing_position>30 and listing_position<=60;

  insert into tmp_triovist_issues
  select card_key,'out_of_stock','Товара нет в наличии','critical','Нет в наличии','{}'::jsonb
  from public.triovist_content_cards where import_id=p_import_id and not in_stock;

  insert into tmp_triovist_issues
  select card_key,'no_reviews','На карточке нет отзывов','info','0','{}'::jsonb
  from public.triovist_content_cards where import_id=p_import_id and review_count=0;

  insert into tmp_triovist_issues
  select card_key,'no_questions','На карточке нет вопросов','info','0','{}'::jsonb
  from public.triovist_content_cards where import_id=p_import_id and question_count=0;

  insert into tmp_triovist_issues
  select card_key,'no_video','На карточке нет видео','warning',video_count::text,
         jsonb_build_object('video_count',video_count)
  from public.triovist_content_cards where import_id=p_import_id and video_count=0;

  insert into tmp_triovist_issues
  select card_key,'video_available_not_uploaded','Есть видео, которое можно загрузить','warning',
         (hd_uploadable+yt_uploadable)::text,
         jsonb_build_object('hd_uploadable',hd_uploadable,'yt_uploadable',yt_uploadable)
  from public.triovist_content_cards
  where import_id=p_import_id and hd_uploadable+yt_uploadable>0;

  insert into tmp_triovist_issues
  select card_key,'few_photos','На карточке меньше 3 фотографий','warning',photo_count::text,
         jsonb_build_object('photo_count',photo_count)
  from public.triovist_content_cards where import_id=p_import_id and photo_count<3;

  insert into tmp_triovist_issues
  select card_key,'no_description','Нет описания товара','critical','Нет описания','{}'::jsonb
  from public.triovist_content_cards where import_id=p_import_id and not description_present;

  insert into tmp_triovist_issues
  select card_key,'no_warranty','Не указан срок гарантии','warning','Гарантия не указана','{}'::jsonb
  from public.triovist_content_cards c
  where c.import_id=p_import_id and not c.warranty_present
    and exists(select 1 from public.triovist_content_cards w where w.import_id=p_import_id and w.warranty_present);

  insert into tmp_triovist_issues
  select card_key,'low_product_rating','Рейтинг карточки ниже 4','critical',product_rating::text,
         jsonb_build_object('product_rating',product_rating)
  from public.triovist_content_cards
  where import_id=p_import_id and product_rating is not null and product_rating<4;

  insert into tmp_triovist_issues
  select card_key,'low_last_review','Последний отзыв ниже 4','critical',last_review_rating::text,
         jsonb_build_object('last_review_rating',last_review_rating,'latest_review_date',latest_review_date,'latest_review_text',latest_review_text)
  from public.triovist_content_cards
  where import_id=p_import_id and last_review_rating is not null and last_review_rating<4;

  insert into tmp_triovist_issues
  select card_key,'negative_review_unanswered','Отрицательный отзыв без ответа','critical',
         unanswered_negative_reviews::text,
         jsonb_build_object('count',unanswered_negative_reviews,'latest_review_date',latest_review_date,'latest_review_text',latest_review_text)
  from public.triovist_content_cards
  where import_id=p_import_id and unanswered_negative_reviews>0;

  insert into tmp_triovist_issues
  select card_key,'question_unanswered','Есть вопрос без ответа','warning',unanswered_questions::text,
         jsonb_build_object('count',unanswered_questions)
  from public.triovist_content_cards
  where import_id=p_import_id and unanswered_questions>0;

  insert into tmp_triovist_issues
  select card_key,'delivery_minsk_slow','Доставка по Минску дольше 1 дня','info',delivery_minsk_days::text,
         jsonb_build_object('delivery_minsk_days',delivery_minsk_days)
  from public.triovist_content_cards
  where import_id=p_import_id and delivery_minsk_days is not null and delivery_minsk_days>1;

  -- Проблема присутствует в новом снимке: открыть, переоткрыть или обновить.
  insert into public.triovist_content_issues(
    manager_email,manager_name,card_key,issue_type,issue_title,severity,status,
    first_seen_import_id,last_seen_import_id,current_value,details,
    missing_from_latest,first_seen_at,last_seen_at,resolved_import_id,resolved_at
  )
  select v_import.manager_email,v_import.manager_name,t.card_key,t.issue_type,t.issue_title,
         t.severity,'open',p_import_id,p_import_id,t.current_value,t.details,
         false,now(),now(),null,null
  from tmp_triovist_issues t
  on conflict(manager_email,card_key,issue_type) do update set
    manager_name=excluded.manager_name,
    issue_title=excluded.issue_title,
    severity=excluded.severity,
    status='open',
    first_seen_import_id=case when public.triovist_content_issues.status='resolved' then p_import_id else public.triovist_content_issues.first_seen_import_id end,
    first_seen_at=case when public.triovist_content_issues.status='resolved' then now() else public.triovist_content_issues.first_seen_at end,
    previous_value=public.triovist_content_issues.current_value,
    current_value=excluded.current_value,
    details=excluded.details,
    last_seen_import_id=p_import_id,
    last_seen_at=now(),
    missing_from_latest=false,
    resolved_import_id=null,
    resolved_at=null;

  -- Карточка есть в новом файле, а старая проблема исчезла: исправлено.
  update public.triovist_content_issues i
  set status='resolved',resolved_import_id=p_import_id,resolved_at=now(),
      missing_from_latest=false,previous_value=i.current_value,current_value='Исправлено',last_seen_at=now()
  where i.manager_email=v_import.manager_email
    and i.status in ('open','needs_review')
    and exists(
      select 1 from public.triovist_content_cards c
      where c.import_id=p_import_id and c.card_key=i.card_key
    )
    and not exists(
      select 1 from tmp_triovist_issues t
      where t.card_key=i.card_key and t.issue_type=i.issue_type
    );

  -- Карточка пропала из отчёта: не закрываем, а требуем проверку.
  update public.triovist_content_issues i
  set status='needs_review',missing_from_latest=true,last_seen_at=now(),
      details=coalesce(i.details,'{}'::jsonb)||jsonb_build_object('missing_from_import_id',p_import_id)
  where i.manager_email=v_import.manager_email
    and i.status in ('open','needs_review')
    and not exists(
      select 1 from public.triovist_content_cards c
      where c.import_id=p_import_id and c.card_key=i.card_key
    );

  update public.triovist_content_imports
  set is_current=false
  where manager_email=v_import.manager_email and id<>p_import_id and is_current;

  select count(*) into v_open
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and status='open';

  select count(*) into v_new
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and first_seen_import_id=p_import_id;

  select count(*) into v_resolved
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and resolved_import_id=p_import_id;

  select count(*) into v_review
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and status='needs_review';

  select jsonb_build_object(
    'cards',v_count,
    'top30',count(*) FILTER (WHERE listing_position is not null and listing_position<=30),
    'top60',count(*) FILTER (WHERE listing_position is not null and listing_position<=60),
    'in_stock',count(*) FILTER (WHERE in_stock),
    'out_of_stock',count(*) FILTER (WHERE not in_stock),
    'without_video',count(*) FILTER (WHERE video_count=0),
    'video_uploadable',count(*) FILTER (WHERE hd_uploadable+yt_uploadable>0),
    'without_reviews',count(*) FILTER (WHERE review_count=0),
    'without_questions',count(*) FILTER (WHERE question_count=0),
    'open_issues',v_open,'new_issues',v_new,'resolved_issues',v_resolved,
    'needs_review',v_review
  ) into v_summary
  from public.triovist_content_cards where import_id=p_import_id;

  update public.triovist_content_imports
  set status='complete',loaded_cards=v_count,summary=v_summary,
      is_current=true,completed_at=now(),error_text=null
  where id=p_import_id;

  return jsonb_build_object(
    'import_id',p_import_id,'manager_email',v_import.manager_email,
    'manager_name',v_import.manager_name,'snapshot_date',v_import.snapshot_date,
    'summary',v_summary
  );
exception when others then
  update public.triovist_content_imports
  set status='failed',completed_at=now(),error_text=sqlerrm
  where id=p_import_id and status='loading';
  raise;
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_tasks_get_dashboard(p_manager_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_tasks jsonb;
  v_summary jsonb;
  v_groups jsonb;
  v_managers jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден'; end if;

  if a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер';
    end if;
  elsif a.actor_scope='triovist' and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к задачам 21vek';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.status when 'pending_approval' then 0 when 'overdue' then 1 when 'partial' then 2
      when 'new' then 3 when 'accepted' then 4 when 'in_progress' then 5
      when 'waiting_21vek' then 6 when 'awaiting_check' then 7 when 'verified' then 8 else 9 end,
    x.priority_score desc,x.due_date,x.manager_name,x.group_name),'[]'::jsonb)
  into v_tasks
  from (
    select t.*,
      coalesce((
        select jsonb_agg(to_jsonb(y) order by
          case y.item_status when 'open' then 0 when 'missing' then 1 when 'verified' then 2 else 3 end,
          y.product_name,y.sku,y.issue_title)
        from (
          select ti.id,ti.card_key,ti.issue_type,ti.issue_title,ti.sku,ti.donor_article,
                 ti.product_name,ti.product_url,ti.baseline_value,ti.target_value,
                 ti.current_value,ti.item_status,ti.verified_at
          from public.triovist_ai_task_items ti
          where ti.task_id=t.id
        ) y
      ),'[]'::jsonb) as items,
      (select count(*) from public.triovist_ai_task_items ti where ti.task_id=t.id) as item_count,
      (select count(*) from public.triovist_ai_task_items ti where ti.task_id=t.id and ti.item_status='verified') as verified_item_count
    from public.triovist_ai_tasks t
    where v_filter='' or t.manager_email=v_filter
  ) x;

  select jsonb_build_object(
    'total',count(*),
    'pending_approval',count(*) filter(where status='pending_approval'),
    'active',count(*) filter(where status in ('new','accepted','in_progress','waiting_21vek','awaiting_check')),
    'partial',count(*) filter(where status='partial'),
    'overdue',count(*) filter(where status='overdue'),
    'not_achieved',count(*) filter(where status='not_achieved'),
    'verified',count(*) filter(where status='verified'),
    'ai_pending',count(*) filter(where ai_state<>'generated' and status not in ('verified','cancelled','not_relevant'))
  ) into v_summary
  from public.triovist_ai_tasks
  where v_filter='' or manager_email=v_filter;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.manager_name,g.group_name),'[]'::jsonb)
  into v_groups
  from (
    with card_groups as (
      select ci.manager_email,ci.manager_name,
             coalesce(nullif(c.category,''),nullif(c.subgroup,''),'Прочее') as group_name,
             count(*)::integer as cards,
             count(*) filter(where c.listing_position is not null and c.listing_position<=30)::integer as top30,
             count(*) filter(where c.listing_position is not null and c.listing_position<=60)::integer as top60,
             count(*) filter(where c.in_stock)::integer as in_stock,
             count(*) filter(where not c.in_stock)::integer as out_of_stock
      from public.triovist_content_imports ci
      join public.triovist_content_cards c on c.import_id=ci.id
      where private.triovist_pointer_is_current_v236404(ci.id) and ci.status='complete'
        and (v_filter='' or ci.manager_email=v_filter)
      group by ci.manager_email,ci.manager_name,
               coalesce(nullif(c.category,''),nullif(c.subgroup,''),'Прочее')
    ), task_groups as (
      select manager_email,group_name,
             count(*) filter(where status in ('pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'))::integer as active_tasks,
             count(*) filter(where status='verified')::integer as verified_tasks
      from public.triovist_ai_tasks
      where v_filter='' or manager_email=v_filter
      group by manager_email,group_name
    )
    select cg.manager_email,cg.manager_name,cg.group_name,cg.cards,cg.top30,cg.top60,
           cg.in_stock,cg.out_of_stock,
           coalesce(tg.active_tasks,0)::integer as active_tasks,
           coalesce(tg.verified_tasks,0)::integer as verified_tasks
    from card_groups cg
    left join task_groups tg
      on tg.manager_email=cg.manager_email and tg.group_name=cg.group_name
  ) g;

  -- Общий рейтинг видят оба менеджера, но детальные задачи и карточки
  -- второго менеджера по-прежнему не раскрываются.
  select coalesce(jsonb_agg(to_jsonb(m) order by m.manager_name),'[]'::jsonb)
  into v_managers
  from (
    select x.manager_email,x.manager_name,
           count(*) filter(where t.status in ('pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'))::integer as active_tasks,
           count(*) filter(where t.status='verified')::integer as verified_tasks,
           count(*) filter(where t.status='overdue')::integer as overdue_tasks,
           count(*) filter(where t.status='not_achieved')::integer as not_achieved_tasks,
           count(*) filter(where t.status='pending_approval')::integer as pending_tasks,
           coalesce((select count(*) from public.triovist_content_imports ci
                     join public.triovist_content_cards c on c.import_id=ci.id
                     where private.triovist_pointer_is_current_v236404(ci.id) and ci.status='complete' and ci.manager_email=x.manager_email),0)::integer as cards,
           coalesce((select count(*) from public.triovist_content_imports ci
                     join public.triovist_content_cards c on c.import_id=ci.id
                     where private.triovist_pointer_is_current_v236404(ci.id) and ci.status='complete' and ci.manager_email=x.manager_email
                       and c.listing_position is not null and c.listing_position<=30),0)::integer as top30,
           coalesce((select count(*) from public.triovist_content_imports ci
                     join public.triovist_content_cards c on c.import_id=ci.id
                     where private.triovist_pointer_is_current_v236404(ci.id) and ci.status='complete' and ci.manager_email=x.manager_email
                       and c.listing_position is not null and c.listing_position<=60),0)::integer as top60
    from (values
      ('aleksandrenko_av@resanta.ru','Александренко'),
      ('krishtal_na@resanta.ru','Кришталь')
    ) as x(manager_email,manager_name)
    left join public.triovist_ai_tasks t on t.manager_email=x.manager_email
    group by x.manager_email,x.manager_name
  ) m;

  return jsonb_build_object(
    'tasks',v_tasks,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'groups',v_groups,
    'managers',v_managers,
    'generated_at',now()
  );
end;
$function$;

revoke all on function public.triovist_21vek_promotion_plan_v236404() from public,anon,authenticated;
grant execute on function public.triovist_21vek_promotion_plan_v236404() to service_role;

revoke all on function public.triovist_21vek_activate_shadow_v236404(uuid,uuid) from public,anon,authenticated;
grant execute on function public.triovist_21vek_activate_shadow_v236404(uuid,uuid) to service_role;

revoke all on function public.triovist_21vek_post_activate_v236404(uuid) from public,anon,authenticated;
grant execute on function public.triovist_21vek_post_activate_v236404(uuid) to service_role;

revoke all on function public.triovist_21vek_sync_legacy_current_v236404() from public,anon,authenticated;
grant execute on function public.triovist_21vek_sync_legacy_current_v236404() to service_role;

revoke all on function public.triovist_21vek_recovery_gate_v236404() from public,anon,authenticated;
grant execute on function public.triovist_21vek_recovery_gate_v236404() to service_role;
