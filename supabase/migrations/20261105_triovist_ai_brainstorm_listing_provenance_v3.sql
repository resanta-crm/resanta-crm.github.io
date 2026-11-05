-- Brainstorm listing: show current verified positions, prior exact positions and actual missing reasons.
CREATE OR REPLACE FUNCTION public.triovist_ai_brainstorm_preview_v20261105(p_month date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date, p_manager_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
DECLARE
 v_actor record;
 v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
 v_manager text:=nullif(lower(trim(coalesce(p_manager_email,''))),'');
 v_result jsonb;
BEGIN
 SELECT * INTO v_actor FROM public.triovist_content_actor();
 IF auth.uid() IS NULL OR v_actor.actor_email IS DISTINCT FROM 'payushin_ar@resanta.ru'
   OR v_actor.actor_role IS DISTINCT FROM 'boss' THEN
  RAISE EXCEPTION 'Мозговой штурм ИИ доступен только директору филиальной сети'
   USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR p_month<>v_month OR v_month<date '2025-01-01'
    OR v_month>date_trunc('month',current_date)::date THEN
  RAISE EXCEPTION 'Неверный месяц мозгового штурма' USING ERRCODE='22007';
 END IF;
 IF v_manager IS NOT NULL AND v_manager NOT IN
   ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') THEN
  RAISE EXCEPTION 'Менеджер не закреплён за Триовистом' USING ERRCODE='22023';
 END IF;
 WITH
 bounds AS (
  SELECT v_month AS mon, (v_month-interval '1 day')::date AS closed_until,
   date_trunc('year',v_month-interval '1 day')::date AS current_from,
   (v_month-interval '1 year')::date AS target_prev_year
 ), periods AS (
  SELECT b.*,(b.current_from-interval '1 year')::date AS previous_from,
    (b.closed_until-interval '1 year')::date AS previous_until,
    extract(month from b.closed_until)::int AS expected_months
  FROM bounds b
 ), quality AS (
  SELECT r.*,
  (SELECT count(distinct i.month) FROM public.triovist_sales_imports i
    WHERE i.month BETWEEN r.current_from AND r.closed_until) AS months_current,
  (SELECT count(distinct i.month) FROM public.triovist_sales_imports i
    WHERE i.month BETWEEN r.previous_from AND r.previous_until) AS months_last_year,
  (SELECT max(snapshot_date) FROM public.triovist_partner_stock) partner_date,
  (SELECT max(report_date) FROM public.stock_balances WHERE warehouse='Витебск') vitebsk_date,
  (SELECT max(snapshot_date) FROM public.triovist_chekhov_stock) chekhov_date
  FROM periods r
 ), assignment AS (
  SELECT g.manager_email,g.manager_name,g.group_name,public.triovist_norm(g.group_name) gn
  FROM public.triovist_group_assignments g
  WHERE g.active AND lower(g.manager_email) IN ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru')
    AND (v_manager IS NULL OR lower(g.manager_email)=v_manager)
    AND lower(trim(g.group_name))<>'услуги'
 ), annual AS (
  SELECT a.manager_email,a.manager_name,a.group_name,s.subgroup,
    round(coalesce(sum(s.revenue) FILTER (WHERE s.month BETWEEN q.previous_from AND q.previous_until),0),2) sales_last_year,
    round(coalesce(sum(s.revenue) FILTER (WHERE s.month BETWEEN q.current_from AND q.closed_until),0),2) sales_current,
    round(coalesce(sum(s.revenue) FILTER (WHERE s.month=q.target_prev_year),0),2) analogous_month_last_year
  FROM assignment a CROSS JOIN quality q
  JOIN public.triovist_sales_resolved_cache s
    ON public.triovist_norm(s.assigned_group)=a.gn
   AND ((s.month BETWEEN q.current_from AND q.closed_until)
     OR (s.month BETWEEN q.previous_from AND q.previous_until)
     OR s.month=q.target_prev_year)
  WHERE nullif(trim(s.subgroup),'') IS NOT NULL
    AND nullif(trim(s.sku),'') IS NOT NULL
    AND trim(s.sku) !~ '^900(/|$)'
    AND coalesce(s.category,'') !~ '^900(/|$)'
  GROUP BY a.manager_email,a.manager_name,a.group_name,s.subgroup
 ), lost AS (
  SELECT x.*,round(x.sales_last_year-x.sales_current,2) lost_revenue,
    round(100*(x.sales_current-x.sales_last_year)/nullif(x.sales_last_year,0),1) change_pct,
    CASE WHEN x.analogous_month_last_year>0
      THEN greatest(100,round(x.analogous_month_last_year*1.15/100,0)*100)
      ELSE NULL END AS proposed_volume,
    row_number() OVER (
      PARTITION BY x.manager_email ORDER BY x.sales_last_year-x.sales_current DESC,
        x.sales_last_year DESC,x.group_name,x.subgroup
    ) AS loss_rank
  FROM annual x WHERE x.sales_last_year>0 AND x.sales_current<x.sales_last_year
 ), sku_groups AS (
  SELECT DISTINCT s.sku,a.manager_email,a.group_name,s.subgroup
  FROM assignment a CROSS JOIN quality q
  JOIN public.triovist_sales_resolved_cache s
    ON public.triovist_norm(s.assigned_group)=a.gn
   AND ((s.month BETWEEN q.current_from AND q.closed_until)
     OR (s.month BETWEEN q.previous_from AND q.previous_until)
     OR s.month=q.target_prev_year)
  WHERE trim(s.sku) !~ '^900(/|$)' AND nullif(trim(s.subgroup),'') IS NOT NULL
 ), partner AS (
  SELECT DISTINCT ON (sku) sku,
    greatest(coalesce(qty_free,0),0)::numeric AS free_qty,
    snapshot_date
  FROM public.triovist_partner_stock
  WHERE not coalesce(excluded,false) AND sku IS NOT NULL
    AND trim(sku) !~ '^900(/|$)'
  ORDER BY sku,snapshot_date DESC NULLS LAST,imported_at DESC NULLS LAST
 ), vitebsk AS (
  SELECT sku,round(sum(greatest(coalesce(qty_avail,0),0)),2) qty
  FROM public.stock_balances
  WHERE warehouse='Витебск' AND report_date=(SELECT vitebsk_date FROM quality)
    AND trim(sku) !~ '^900(/|$)'
  GROUP BY sku
 ), chekhov AS (
  SELECT sku,round(sum(greatest(coalesce(qty_total,0),0)),2) qty
  FROM public.triovist_chekhov_stock
  WHERE snapshot_date=(SELECT chekhov_date FROM quality) AND trim(sku) !~ '^900(/|$)'
  GROUP BY sku
 ), registry AS (
  SELECT DISTINCT ON(lower(manager_email),sku)
    lower(manager_email) manager_email,sku,listing_position,
    registry_completed_at,registry_snapshot_date,in_stock,
    description_present,photo_count,keyword,product_url
  FROM public.triovist_21vek_registry_v236214
  WHERE sku IS NOT NULL
  ORDER BY lower(manager_email),sku,
    registry_completed_at DESC NULLS LAST, registry_snapshot_date DESC NULLS LAST
 ), fresh_position AS (
  SELECT DISTINCT ON(lower(manager_email),sku)
    lower(manager_email) manager_email,sku,position,position_exact,observed_at
  FROM public.triovist_21vek_top_current
  WHERE sku IS NOT NULL AND observed_at>=now()-interval '72 hours'
  ORDER BY lower(manager_email),sku,observed_at DESC NULLS LAST
 ), sku_status AS (
  SELECT x.*,coalesce(pa.free_qty,0) partner_qty,
    coalesce(vi.qty,0) vitebsk_qty,coalesce(ch.qty,0) chekhov_qty,
    CASE
     WHEN fp.position_exact AND fp.position>0 THEN fp.position::numeric
     WHEN re.registry_snapshot_date>=current_date-3
       AND re.listing_position>0 THEN re.listing_position
     ELSE NULL END AS current_position,
    (re.sku IS NOT NULL) AS registered,
    re.in_stock,re.description_present,re.photo_count,re.keyword,re.product_url,
    hx.position last_exact_position,hx.observed_at last_exact_seen,
    coalesce(fp.observed_at,re.registry_completed_at) observed_at
  FROM sku_groups x LEFT JOIN partner pa ON pa.sku=x.sku
   LEFT JOIN vitebsk vi ON vi.sku=x.sku
   LEFT JOIN chekhov ch ON ch.sku=x.sku
   LEFT JOIN registry re ON re.manager_email=lower(x.manager_email) AND re.sku=x.sku
   LEFT JOIN fresh_position fp ON fp.manager_email=lower(x.manager_email) AND fp.sku=x.sku
   LEFT JOIN LATERAL (
     SELECT h.position,h.observed_at FROM public.triovist_21vek_top_snapshots h
     WHERE lower(h.manager_email)=lower(x.manager_email)
       AND trim(h.sku)=x.sku
       AND h.error_text IS NULL AND h.position_exact=true AND h.position>0
     ORDER BY h.observed_at DESC LIMIT 1
   ) hx ON true
 ), stock_listing AS (
  SELECT s.manager_email,s.group_name,s.subgroup,
   count(*)::int AS sku_count,
   round(sum(s.partner_qty),2) AS partner_free,
   round(sum(s.vitebsk_qty),2) AS vitebsk_qty,
   round(sum(s.chekhov_qty),2) AS chekhov_reference,
   count(*) FILTER (WHERE s.registered)::int AS registered_sku,
   count(*) FILTER (WHERE s.current_position IS NOT NULL)::int AS positions_known,
   count(*) FILTER (WHERE s.current_position>60)::int AS outside_top60,
   count(*) FILTER (WHERE s.current_position IS NULL)::int AS rank_unknown,
   count(*) FILTER (WHERE s.in_stock IS FALSE OR s.description_present IS FALSE
                       OR coalesce(s.photo_count,0)=0)::int AS card_issues,
   count(*) FILTER (WHERE s.partner_qty<=0)::int AS unavailable_sku
  FROM sku_status s GROUP BY s.manager_email,s.group_name,s.subgroup
 ), sku_examples AS (
  SELECT s.*,
   row_number() OVER(PARTITION BY s.manager_email,s.group_name,s.subgroup
    ORDER BY CASE WHEN s.current_position>60 THEN 0 WHEN s.current_position IS NULL THEN 1
                  WHEN s.in_stock IS FALSE THEN 2 ELSE 3 END,s.sku) AS order_no
  FROM sku_status s
 ), examples AS (
  SELECT manager_email,group_name,subgroup,
   jsonb_agg(jsonb_build_object('sku',sku,'position',current_position,
     'stock_21vek',partner_qty,'stock_vitebsk',vitebsk_qty,
     'card_problem',in_stock IS FALSE OR description_present IS FALSE OR coalesce(photo_count,0)=0,
     'position_verified',current_position IS NOT NULL,
     'position_last_exact',last_exact_position,
     'position_last_seen',last_exact_seen,
     'keyword',keyword,'product_url',product_url,
     'registered',registered,'card_in_stock',in_stock,
     'listing_state',CASE
       WHEN current_position IS NOT NULL THEN 'current_confirmed'
       WHEN NOT registered THEN 'not_in_fresh_registry'
       WHEN in_stock IS FALSE THEN 'out_of_stock'
       ELSE 'not_confirmed_in_search' END
   ) ORDER BY order_no) AS items
  FROM sku_examples WHERE order_no<=24
  GROUP BY manager_email,group_name,subgroup
 ), existing AS (
  SELECT l.manager_email,l.group_name,l.subgroup,
   exists(SELECT 1 FROM public.triovist_ai_tasks t
     WHERE t.manager_email=l.manager_email AND t.period_month=v_month
       AND t.status NOT IN ('cancelled','not_relevant')
       AND public.triovist_norm(t.group_name)=public.triovist_norm(l.group_name)
       AND public.triovist_norm(t.commercial_context->>'subgroup')=public.triovist_norm(l.subgroup)
    ) AS already_assigned
  FROM lost l
 ), eligible AS (
  SELECT l.*,coalesce(st.sku_count,0) sku_count,
   coalesce(st.partner_free,0) partner_free,
   coalesce(st.vitebsk_qty,0) vitebsk_qty,
   coalesce(st.chekhov_reference,0) chekhov_reference,
   coalesce(st.registered_sku,0) registered_sku,
   coalesce(st.positions_known,0) positions_known,
   coalesce(st.outside_top60,0) outside_top60,
   coalesce(st.rank_unknown,0) rank_unknown,
   coalesce(st.card_issues,0) card_issues,
   coalesce(st.unavailable_sku,0) unavailable_sku,
   coalesce(ex.already_assigned,false) already_assigned,
   coalesce(exs.items,'[]'::jsonb) examples
  FROM lost l LEFT JOIN stock_listing st
    ON st.manager_email=l.manager_email AND st.group_name=l.group_name AND st.subgroup=l.subgroup
  LEFT JOIN existing ex
    ON ex.manager_email=l.manager_email AND ex.group_name=l.group_name AND ex.subgroup=l.subgroup
  LEFT JOIN examples exs
    ON exs.manager_email=l.manager_email AND exs.group_name=l.group_name AND exs.subgroup=l.subgroup
 ), pick AS (
  SELECT e.*,row_number() OVER(PARTITION BY e.manager_email
    ORDER BY e.lost_revenue DESC,e.sales_last_year DESC,e.group_name,e.subgroup) selected_rank
  FROM eligible e WHERE NOT e.already_assigned
 ), ready AS (
  SELECT * FROM pick WHERE selected_rank<=30
    AND (SELECT months_current>=expected_months AND months_last_year>=expected_months FROM quality)
 )
 SELECT jsonb_build_object(
  'version','uni-brainstorm-subgroup-v2',
  'month',to_char(v_month,'YYYY-MM'),
  'timeframe',(SELECT jsonb_build_object('current_start',current_from,'current_end',closed_until,
    'last_year_start',previous_from,'last_year_end',previous_until,
    'same_month_last_year',target_prev_year) FROM quality),
  'quality',(SELECT jsonb_build_object('complete',
    months_current>=expected_months AND months_last_year>=expected_months,
    'expected_months',expected_months,'current_import_months',months_current,
    'prior_year_import_months',months_last_year,
    'partner_date',partner_date,'vitebsk_date',vitebsk_date,'chekhov_date',chekhov_date,
    'transit_note','Свободный товар в пути может быть внутри qty_free; отдельно не прибавлять') FROM quality),
  'managers',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'email',m.manager_email,'name',m.manager_name,
    'declining_subgroups',(SELECT count(*) FROM lost l WHERE l.manager_email=m.manager_email),
    'offered',(SELECT count(*) FROM ready r WHERE r.manager_email=m.manager_email),
    'active_tasks',(SELECT count(*) FROM public.triovist_ai_tasks t
      WHERE t.manager_email=m.manager_email AND t.period_month=v_month
        AND t.status NOT IN ('cancelled','not_relevant')),
    'max_tasks',30
   ) ORDER BY m.manager_name)
   FROM (SELECT DISTINCT manager_email,manager_name FROM assignment) m),'[]'::jsonb),
  'proposals',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'manager_email',x.manager_email,'manager_name',x.manager_name,
    'group',x.group_name,'subgroup',x.subgroup,
    'sales_previous_year',x.sales_last_year,'sales_current_year',x.sales_current,
    'loss',x.lost_revenue,'change_pct',x.change_pct,
    'analogous_month_last_year',x.analogous_month_last_year,
    'suggested_target',x.proposed_volume,
    'sku_count',x.sku_count,'partner_free',x.partner_free,
    'vitebsk_qty',x.vitebsk_qty,'chekhov_reference',x.chekhov_reference,
    'registered_sku',x.registered_sku,'positions_known',x.positions_known,
    'outside_top60',x.outside_top60,'rank_unknown',x.rank_unknown,
    'card_issues',x.card_issues,'unavailable_sku',x.unavailable_sku,
    'listing_skus',x.examples,
    'priority_rank',x.selected_rank,
    'stock_warning',CASE WHEN x.partner_free>0 THEN '21vek в наличии'
      WHEN x.vitebsk_qty>0 THEN 'Проверить пополнение из Витебска'
      ELSE 'Нет подтверждённого доступного остатка — цель не гарантирована' END,
    'target_note',CASE WHEN x.analogous_month_last_year>0 THEN
      'Ориентир: аналогичный месяц прошлого года ×1,15; не переносить октябрь как ноябрь'
      ELSE 'В аналогичном месяце прошлого года продаж нет; цель задаёт руководитель' END,
    'listing_note','Проверить позиции и карточки выбранных SKU; неизвестная позиция не означает подтверждённое выпадение из TOP-60'
   ) ORDER BY x.manager_name,x.selected_rank)
   FROM ready x),'[]'::jsonb)
 ) INTO v_result;
 RETURN v_result;
END;
$function$
;
