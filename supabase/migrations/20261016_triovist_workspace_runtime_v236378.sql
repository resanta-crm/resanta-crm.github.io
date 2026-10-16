-- RESANTA CRM v23.6.378
-- Triovist workspace runtime recovery:
-- keep the existing content-dashboard contract, but avoid scanning the whole
-- 21vek cards table for every refresh. The current issue set is materialized
-- first, then each current card is fetched through the existing PK
-- (import_id, card_key). This removes the 8s authenticated timeout pressure.

create or replace function public.triovist_content_get_dashboard(p_manager_email text default null::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $function$
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
    where i.is_current and i.status='complete'
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
     and ci.is_current
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

revoke all on function public.triovist_content_get_dashboard(text) from public, anon;
grant execute on function public.triovist_content_get_dashboard(text) to authenticated, service_role;
