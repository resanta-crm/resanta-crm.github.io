-- RESANTA CRM v23.6.404
-- 21vek own parser: safe staged promotion + fresh FULL-run MRC source + honest promotion status.
-- Applied to Supabase on 2026-10-20.

CREATE OR REPLACE FUNCTION public.triovist_21vek_promotion_plan_v236403()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_run public.triovist_21vek_shadow_runs%rowtype;
  v_top public.triovist_21vek_top_runs%rowtype;
  v_registry integer:=0;
  v_matched integer:=0;
  v_url_diff integer:=0;
  v_top_matched integer:=0;
  v_manager_count integer:=0;
  v_source text;
  v_current_count integer:=0;
  v_managers jsonb;
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
    raise exception 'No complete own 21vek card run available';
  end if;

  select * into v_top
  from public.triovist_21vek_top_runs
  where status='complete'
    and coalesce(error_count,0)=0
    and total_targets=v_run.total_targets
    and started_at>=v_run.started_at
  order by finished_at desc nulls last
  limit 1;

  if v_top.id is null then
    select * into v_top
    from public.triovist_21vek_top_runs
    where status='complete'
      and coalesce(error_count,0)=0
      and total_targets=v_run.total_targets
    order by finished_at desc nulls last
    limit 1;
  end if;

  if v_top.id is null then
    raise exception 'No complete own 21vek TOP run available';
  end if;

  select count(*)::int,count(distinct manager_email)::int
    into v_registry,v_manager_count
  from public.triovist_21vek_registry_v236214;

  if v_registry<>v_run.total_targets then
    raise exception 'Registry mismatch: current %, shadow %',v_registry,v_run.total_targets;
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

  select count(*)::int into v_current_count
  from public.triovist_content_imports
  where source_file=v_source and status='complete' and is_current;

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
    'version','v23.6.403',
    'run_id',v_run.id,
    'top_run_id',v_top.id,
    'source_file',v_source,
    'snapshot_date',(coalesce(v_run.finished_at,v_run.started_at,now()) at time zone 'Europe/Minsk')::date,
    'targets',v_registry,
    'manager_count',v_manager_count,
    'managers',v_managers,
    'already_promoted',(v_current_count=v_manager_count)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_stage_shadow_v236403(p_run_id uuid, p_top_run_id uuid, p_manager_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_run public.triovist_21vek_shadow_runs%rowtype;
  v_top public.triovist_21vek_top_runs%rowtype;
  v_prev_import uuid;
  v_manager_name text;
  v_expected integer:=0;
  v_new_import uuid;
  v_existing uuid;
  v_count integer:=0;
  v_snapshot_date date;
  v_source text;
  v_summary jsonb;
begin
  select * into v_run from public.triovist_21vek_shadow_runs where id=p_run_id;
  select * into v_top from public.triovist_21vek_top_runs where id=p_top_run_id;

  if v_run.id is null or v_run.status<>'complete'
     or coalesce(v_run.error_count,0)<>0
     or coalesce(v_run.success_count,0)<>coalesce(v_run.total_targets,0)
     or coalesce(v_run.total_targets,0)<1 then
    raise exception '21vek shadow run is not safe for staging';
  end if;
  if v_top.id is null or v_top.status<>'complete'
     or coalesce(v_top.error_count,0)<>0
     or v_top.total_targets<>v_run.total_targets then
    raise exception '21vek TOP run is not safe for staging';
  end if;

  select r.registry_import_id,r.manager_name,count(*) over()::int
    into v_prev_import,v_manager_name,v_expected
  from public.triovist_21vek_registry_v236214 r
  where lower(r.manager_email)=lower(trim(p_manager_email))
  order by r.registry_import_id
  limit 1;

  if v_prev_import is null or v_expected<1 then
    raise exception 'Manager % is absent from the 21vek registry',p_manager_email;
  end if;

  v_snapshot_date:=(coalesce(v_run.finished_at,v_run.started_at,now()) at time zone 'Europe/Minsk')::date;
  v_source:='own-21vek-shadow:'||v_run.id::text||':top:'||v_top.id::text;

  select id into v_existing
  from public.triovist_content_imports
  where lower(manager_email)=lower(trim(p_manager_email))
    and source_file=v_source
    and status='complete'
    and is_current
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok',true,'skipped',true,'already_current',true,
      'manager_email',lower(trim(p_manager_email)),
      'import_id',v_existing,'source_file',v_source,
      'run_id',v_run.id,'top_run_id',v_top.id
    );
  end if;

  select i.id into v_existing
  from public.triovist_content_imports i
  where lower(i.manager_email)=lower(trim(p_manager_email))
    and i.source_file=v_source
    and i.status='loading'
    and not i.is_current
    and i.loaded_cards=i.expected_cards
    and i.expected_cards=v_expected
    and (select count(*) from public.triovist_content_cards c where c.import_id=i.id)=v_expected
  order by i.created_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok',true,'skipped',true,'staged',true,
      'manager_email',lower(trim(p_manager_email)),
      'import_id',v_existing,'source_file',v_source,
      'run_id',v_run.id,'top_run_id',v_top.id
    );
  end if;

  update public.triovist_content_imports
  set status='aborted',error_text='Superseded by safe staged promotion v23.6.403'
  where lower(manager_email)=lower(trim(p_manager_email))
    and source_file=v_source
    and status='loading'
    and not is_current;

  insert into public.triovist_content_imports(
    manager_email,manager_name,source_file,snapshot_date,status,
    expected_cards,loaded_cards,summary,error_text,is_current,
    created_by_email,created_by_name,created_at,completed_at
  ) values(
    lower(trim(p_manager_email)),v_manager_name,v_source,v_snapshot_date,'loading',
    v_expected,0,'{}'::jsonb,null,false,
    'system@resanta-crm.by','Собственный парсер 21vek · safe stage',now(),null
  ) returning id into v_new_import;

  insert into public.triovist_content_cards(
    import_id,manager_email,manager_name,card_key,sku,donor_article,
    product_name,category,subgroup,product_url,price,
    description_present,warranty_present,sale_flag,keyword,listing_position,
    product_rating,last_review_rating,review_count,question_count,photo_count,
    video_count,in_stock,delivery_minsk_days,pickup_minsk_days,mdc_value,sale_value,
    negative_reviews,unanswered_negative_reviews,unanswered_questions,
    latest_review_date,latest_review_text,latest_review_answered,
    hd_available,hd_on_site,hd_uploadable,yt_available,yt_on_site,yt_uploadable,source_row
  )
  select
    v_new_import,p.manager_email,p.manager_name,p.card_key,p.sku,
    coalesce(nullif(s.donor_article,''),p.donor_article),
    coalesce(nullif(s.product_name,''),p.product_name),
    p.category,p.subgroup,p.product_url,
    coalesce(nullif(s.current_price,0),p.price),
    coalesce(s.description_present,false),coalesce(s.warranty_present,false),
    null,coalesce(nullif(trim(t.keyword),''),p.keyword),
    case when t.position_exact then t.position::numeric else null end,
    s.product_rating,s.last_review_rating,greatest(coalesce(s.review_count,0),0),
    greatest(coalesce(p.question_count,0),0),
    greatest(coalesce(s.photo_count,0),0),greatest(coalesce(s.video_count,0),0),
    coalesce(s.in_stock,false),
    p.delivery_minsk_days,p.pickup_minsk_days,p.mdc_value,null,
    greatest(coalesce(s.negative_reviews,0),0),
    greatest(coalesce(s.unanswered_negative_reviews,0),0),
    greatest(coalesce(p.unanswered_questions,0),0),
    s.latest_review_date,nullif(left(s.latest_review_text,2000),''),s.latest_review_answered,
    greatest(coalesce(p.hd_available,0),0),greatest(coalesce(p.hd_on_site,0),0),greatest(coalesce(p.hd_uploadable,0),0),
    greatest(coalesce(p.yt_available,0),0),greatest(coalesce(p.yt_on_site,0),0),greatest(coalesce(p.yt_uploadable,0),0),
    p.source_row
  from public.triovist_content_cards p
  join public.triovist_21vek_shadow_snapshots s
    on s.run_id=v_run.id
   and s.manager_email=p.manager_email
   and s.card_key=p.card_key
   and s.error_text is null
  left join public.triovist_21vek_top_snapshots t
    on t.run_id=v_top.id
   and t.manager_email=p.manager_email
   and t.card_key=p.card_key
   and t.error_text is null
  where p.import_id=v_prev_import;

  select count(*)::int into v_count
  from public.triovist_content_cards
  where import_id=v_new_import;

  if v_count<>v_expected then
    raise exception 'Manager %: staged % cards instead of %',p_manager_email,v_count,v_expected;
  end if;

  select jsonb_build_object(
    'cards',count(*),
    'top30',count(*) filter(where listing_position is not null and listing_position<=30),
    'top60',count(*) filter(where listing_position is not null and listing_position<=60),
    'in_stock',count(*) filter(where in_stock),
    'out_of_stock',count(*) filter(where not in_stock),
    'without_video',count(*) filter(where video_count=0),
    'without_reviews',count(*) filter(where review_count=0),
    'source','own_21vek',
    'promotion_mode','safe_stage_v236403',
    'shadow_run_id',v_run.id,'top_run_id',v_top.id,
    'previous_import_id',v_prev_import,
    'phase1_legacy_fields',jsonb_build_array('delivery_minsk_days','pickup_minsk_days','question_count','unanswered_questions','hd_*','yt_*')
  ) into v_summary
  from public.triovist_content_cards
  where import_id=v_new_import;

  update public.triovist_content_imports
  set loaded_cards=v_count,summary=v_summary,error_text=null
  where id=v_new_import;

  return jsonb_build_object(
    'ok',true,'skipped',false,'staged',true,
    'manager_email',lower(trim(p_manager_email)),
    'manager_name',v_manager_name,
    'import_id',v_new_import,'cards',v_count,
    'source_file',v_source,'run_id',v_run.id,'top_run_id',v_top.id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_activate_shadow_v236403(p_run_id uuid, p_top_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_source text;
  v_expected_managers integer:=0;
  v_ready_managers integer:=0;
  v_already integer:=0;
  v_results jsonb;
begin
  v_source:='own-21vek-shadow:'||p_run_id::text||':top:'||p_top_run_id::text;

  select count(distinct manager_email)::int into v_expected_managers
  from public.triovist_21vek_registry_v236214;

  select count(*)::int into v_already
  from public.triovist_content_imports
  where source_file=v_source and status='complete' and is_current;

  if v_already=v_expected_managers and v_expected_managers>0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'manager_email',manager_email,'manager_name',manager_name,'import_id',id,
      'cards',loaded_cards
    ) order by manager_email),'[]'::jsonb)
    into v_results
    from public.triovist_content_imports
    where source_file=v_source and status='complete' and is_current;

    return jsonb_build_object('ok',true,'skipped',true,'already_promoted',true,
      'source_file',v_source,'results',v_results);
  end if;

  with latest_stage as (
    select distinct on (lower(manager_email))
      id,lower(manager_email) manager_email,manager_name,expected_cards,loaded_cards
    from public.triovist_content_imports
    where source_file=v_source and status='loading' and not is_current
    order by lower(manager_email),created_at desc
  )
  select count(*)::int into v_ready_managers
  from latest_stage
  where expected_cards>0 and loaded_cards=expected_cards
    and (select count(*) from public.triovist_content_cards c where c.import_id=latest_stage.id)=expected_cards;

  if v_ready_managers<>v_expected_managers or v_expected_managers<1 then
    raise exception 'Safe activation blocked: ready managers %, expected %',v_ready_managers,v_expected_managers;
  end if;

  create temporary table tmp_triovist_activate_v236403(
    id uuid primary key,
    manager_email text,
    manager_name text,
    cards integer
  ) on commit drop;

  insert into tmp_triovist_activate_v236403(id,manager_email,manager_name,cards)
  select id,lower(manager_email),manager_name,loaded_cards
  from (
    select distinct on (lower(manager_email))
      id,manager_email,manager_name,loaded_cards,created_at
    from public.triovist_content_imports
    where source_file=v_source and status='loading' and not is_current
    order by lower(manager_email),created_at desc
  ) x;

  update public.triovist_content_imports i
  set is_current=false
  where i.is_current
    and exists(
      select 1 from tmp_triovist_activate_v236403 x
      where lower(i.manager_email)=x.manager_email
    );

  update public.triovist_content_imports i
  set status='complete',is_current=true,completed_at=now(),error_text=null
  from tmp_triovist_activate_v236403 x
  where i.id=x.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_email',x.manager_email,'manager_name',x.manager_name,'import_id',x.id,'cards',x.cards
  ) order by x.manager_email),'[]'::jsonb)
  into v_results
  from tmp_triovist_activate_v236403 x;

  return jsonb_build_object(
    'ok',true,'skipped',false,'activated',true,
    'source_file',v_source,'run_id',p_run_id,'top_run_id',p_top_run_id,
    'results',v_results
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_21vek_rebuild_issues_v236403(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_import public.triovist_content_imports%rowtype;
  v_open integer:=0;
  v_new integer:=0;
  v_resolved integer:=0;
  v_review integer:=0;
begin
  select * into v_import
  from public.triovist_content_imports
  where id=p_import_id and status='complete';

  if v_import.id is null then
    raise exception 'Complete 21vek import not found';
  end if;

  create temporary table tmp_triovist_own_issues_v236403(
    card_key text,
    issue_type text,
    issue_title text,
    severity text,
    current_value text,
    details jsonb
  ) on commit drop;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'listing_outside_top60','Карточка вне ТОП-60','critical',
         coalesce(listing_position::text,'позиция не найдена'),
         jsonb_build_object('listing_position',listing_position,'keyword',keyword,'source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and (listing_position is null or listing_position>60);

  insert into tmp_triovist_own_issues_v236403
  select card_key,'listing_31_60','Карточка ниже ТОП-30','warning',listing_position::text,
         jsonb_build_object('listing_position',listing_position,'keyword',keyword,'source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and listing_position>30 and listing_position<=60;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'out_of_stock','Товара нет в наличии','critical','Нет в наличии',
         jsonb_build_object('source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and not in_stock;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'no_reviews','На карточке нет отзывов','info','0',
         jsonb_build_object('source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and review_count=0;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'no_video','На карточке нет видео','warning',video_count::text,
         jsonb_build_object('video_count',video_count,'source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and video_count=0;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'few_photos','На карточке меньше 3 фотографий','warning',photo_count::text,
         jsonb_build_object('photo_count',photo_count,'source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and photo_count<3;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'no_description','Нет описания товара','critical','Нет описания',
         jsonb_build_object('source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and not description_present;

  insert into tmp_triovist_own_issues_v236403
  select c.card_key,'no_warranty','Не указан срок гарантии','warning','Гарантия не указана',
         jsonb_build_object('source','own_21vek')
  from public.triovist_content_cards c
  where c.import_id=p_import_id and not c.warranty_present
    and exists(
      select 1 from public.triovist_content_cards w
      where w.import_id=p_import_id and w.warranty_present
    );

  insert into tmp_triovist_own_issues_v236403
  select card_key,'low_product_rating','Рейтинг карточки ниже 4','critical',product_rating::text,
         jsonb_build_object('product_rating',product_rating,'source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and product_rating is not null and product_rating<4;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'low_last_review','Последний отзыв ниже 4','critical',last_review_rating::text,
         jsonb_build_object('last_review_rating',last_review_rating,'latest_review_date',latest_review_date,
                            'latest_review_text',latest_review_text,'source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and last_review_rating is not null and last_review_rating<4;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'negative_review_unanswered','Отрицательный отзыв без ответа','critical',
         unanswered_negative_reviews::text,
         jsonb_build_object('count',unanswered_negative_reviews,'latest_review_date',latest_review_date,
                            'latest_review_text',latest_review_text,'source','own_21vek')
  from public.triovist_content_cards
  where import_id=p_import_id and unanswered_negative_reviews>0;

  insert into tmp_triovist_own_issues_v236403
  select card_key,'delivery_minsk_slow','Доставка по Минску дольше 1 дня','info',delivery_minsk_days::text,
         jsonb_build_object('delivery_minsk_days',delivery_minsk_days,'source','legacy_paid_until_deliverydays_approved')
  from public.triovist_content_cards
  where import_id=p_import_id and delivery_minsk_days is not null and delivery_minsk_days>1;

  insert into public.triovist_content_issues(
    manager_email,manager_name,card_key,issue_type,issue_title,severity,status,
    first_seen_import_id,last_seen_import_id,current_value,details,
    missing_from_latest,first_seen_at,last_seen_at,resolved_import_id,resolved_at
  )
  select v_import.manager_email,v_import.manager_name,t.card_key,t.issue_type,t.issue_title,
         t.severity,'open',p_import_id,p_import_id,t.current_value,t.details,
         false,now(),now(),null,null
  from tmp_triovist_own_issues_v236403 t
  on conflict(manager_email,card_key,issue_type) do update set
    manager_name=excluded.manager_name,
    issue_title=excluded.issue_title,
    severity=excluded.severity,
    status='open',
    first_seen_import_id=case when public.triovist_content_issues.status='resolved'
                              then p_import_id else public.triovist_content_issues.first_seen_import_id end,
    first_seen_at=case when public.triovist_content_issues.status='resolved'
                       then now() else public.triovist_content_issues.first_seen_at end,
    previous_value=public.triovist_content_issues.current_value,
    current_value=excluded.current_value,
    details=excluded.details,
    last_seen_import_id=p_import_id,
    last_seen_at=now(),
    missing_from_latest=false,
    resolved_import_id=null,
    resolved_at=null;

  update public.triovist_content_issues i
  set status='resolved',resolved_import_id=p_import_id,resolved_at=now(),
      missing_from_latest=false,previous_value=i.current_value,
      current_value='Исправлено',last_seen_at=now()
  where i.manager_email=v_import.manager_email
    and i.status in ('open','needs_review')
    and exists(
      select 1 from public.triovist_content_cards c
      where c.import_id=p_import_id and c.card_key=i.card_key
    )
    and not exists(
      select 1 from tmp_triovist_own_issues_v236403 t
      where t.card_key=i.card_key and t.issue_type=i.issue_type
    );

  update public.triovist_content_issues i
  set status='needs_review',missing_from_latest=true,last_seen_at=now(),
      details=coalesce(i.details,'{}'::jsonb)||jsonb_build_object('missing_from_import_id',p_import_id)
  where i.manager_email=v_import.manager_email
    and i.status in ('open','needs_review')
    and not exists(
      select 1 from public.triovist_content_cards c
      where c.import_id=p_import_id and c.card_key=i.card_key
    );

  select count(*)::int into v_open
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and status='open';

  select count(*)::int into v_new
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and first_seen_import_id=p_import_id;

  select count(*)::int into v_resolved
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and resolved_import_id=p_import_id;

  select count(*)::int into v_review
  from public.triovist_content_issues
  where manager_email=v_import.manager_email and status='needs_review';

  update public.triovist_content_imports
  set summary=coalesce(summary,'{}'::jsonb)||jsonb_build_object(
    'open_issues',v_open,'new_issues',v_new,'resolved_issues',v_resolved,
    'needs_review',v_review,'issues_rebuilt_by','v23.6.403'
  )
  where id=p_import_id;

  return jsonb_build_object(
    'ok',true,'import_id',p_import_id,'manager_email',v_import.manager_email,
    'open_issues',v_open,'new_issues',v_new,'resolved_issues',v_resolved,'needs_review',v_review
  );
end;
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
    where i.is_current and i.status='complete'
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
  where i.is_current and i.status='complete'
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

revoke all on function public.triovist_21vek_promotion_plan_v236403() from public,anon,authenticated;
grant execute on function public.triovist_21vek_promotion_plan_v236403() to service_role;

revoke all on function public.triovist_21vek_stage_shadow_v236403(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.triovist_21vek_stage_shadow_v236403(uuid,uuid,text) to service_role;

revoke all on function public.triovist_21vek_activate_shadow_v236403(uuid,uuid) from public,anon,authenticated;
grant execute on function public.triovist_21vek_activate_shadow_v236403(uuid,uuid) to service_role;

revoke all on function public.triovist_21vek_rebuild_issues_v236403(uuid) from public,anon,authenticated;
grant execute on function public.triovist_21vek_rebuild_issues_v236403(uuid) to service_role;

grant execute on function public.triovist_21vek_mrc_dashboard_v236220() to authenticated;
grant execute on function public.triovist_21vek_status_v236107() to authenticated;
