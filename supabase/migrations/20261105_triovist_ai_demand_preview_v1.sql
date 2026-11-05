-- Uni AI demand model v1. Never writes plans or tasks; explicit leader approval uses existing triovist_set_plan.
-- The 21vek qty_free can include in-transit units in the legacy file. qty_transit_reserve is NOT additive.
CREATE OR REPLACE FUNCTION public.triovist_ai_demand_preview_v20261105(p_month date DEFAULT date_trunc('month',current_date)::date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public','auth','pg_catalog'
AS $func$
DECLARE
 v_actor text := lower(coalesce(auth.jwt()->>'email',''));
 v_full boolean := public.triovist_is_boss();
 v_member boolean := public.triovist_is_member();
 v_target date;
 v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT (v_full OR v_member) THEN
   RAISE EXCEPTION 'Нет доступа к планированию Триовиста' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR p_month <> date_trunc('month',p_month)::date OR p_month<DATE '2024-01-01'
    OR p_month>(date_trunc('month',current_date)::date+interval '3 months')::date THEN
   RAISE EXCEPTION 'Недопустимый месяц расчёта' USING ERRCODE='22007';
 END IF;
 v_target:=p_month;
 WITH
 dates AS (
  SELECT v_target mon,(v_target-interval '1 month')::date pm,(v_target-interval '1 year')::date ly
 ),
 gr AS (
  SELECT group_name,manager_name,lower(manager_email) manager_email,public.triovist_norm(group_name) norm
  FROM public.triovist_group_assignments
  WHERE active AND lower(trim(group_name))<>'услуги'
    AND (v_full OR lower(manager_email)=v_actor)
 ),
 monthly AS (
  SELECT g.group_name,
   round(coalesce(sum(s.revenue) FILTER(WHERE s.month=d.ly),0),2) ly,
   round(coalesce(sum(s.revenue) FILTER(WHERE s.month=d.pm),0),2) pm,
   round(coalesce(sum(s.revenue) FILTER(WHERE s.month=d.mon),0),2) mtd,
   round(coalesce(sum(s.qty) FILTER(WHERE s.month=d.ly),0),2) ly_qty,
   round(coalesce(sum(s.qty) FILTER(WHERE s.month=d.pm),0),2) pm_qty
  FROM gr g CROSS JOIN dates d LEFT JOIN public.triovist_sales_resolved_cache s
    ON public.triovist_norm(s.assigned_group)=g.norm
   AND s.month IN (d.ly,d.pm,d.mon) AND trim(s.sku) !~ '^900(/|$)'
  GROUP BY g.group_name
 ),
 prof AS (
  SELECT profile,updated_at FROM public.triovist_seasonality_profiles ORDER BY updated_at DESC LIMIT 1
 ),
 season AS (
  SELECT g.group_name,
   coalesce((pr.profile->'levels'->'category'->regexp_replace(lower(g.group_name),'[^а-яa-z0-9 ]','','g')->'factors'->(extract(month from d.mon)::int-1))::numeric,0) target_factor,
   coalesce((pr.profile->'levels'->'category'->regexp_replace(lower(g.group_name),'[^а-яa-z0-9 ]','','g')->'factors'->(extract(month from d.pm)::int-1))::numeric,0) prior_factor,
   coalesce((pr.profile->'levels'->'category'->regexp_replace(lower(g.group_name),'[^а-яa-z0-9 ]','','g')->>'confidence')::numeric,0) confidence
  FROM gr g CROSS JOIN dates d CROSS JOIN prof pr
 ),
 prices AS (
  SELECT sku,round(sum(revenue)/nullif(sum(qty),0),2) unit_price
  FROM public.triovist_sales_resolved_cache s CROSS JOIN dates d
  WHERE s.month>=d.pm-interval '6 months' AND s.month<d.mon
   AND s.qty>0 AND s.revenue>0 AND trim(s.sku) !~ '^900(/|$)'
  GROUP BY sku
 ),
 latest_group AS (
  SELECT DISTINCT ON (sku) sku,assigned_group
  FROM public.triovist_sales_resolved_cache
  WHERE trim(sku) !~ '^900(/|$)' AND assigned_group IS NOT NULL
  ORDER BY sku,month DESC
 ),
 own AS (
  SELECT sku,round(sum(greatest(coalesce(qty_avail,0),0)),2) qty
  FROM public.stock_balances
  WHERE warehouse='Витебск' AND trim(sku) !~ '^900(/|$)'
  GROUP BY sku
 ),
 ck AS (
  SELECT sku,round(sum(greatest(coalesce(qty_total,0),0)),2) qty
  FROM public.triovist_chekhov_stock
  WHERE trim(sku) !~ '^900(/|$)'
  GROUP BY sku
 ),
 stock AS (
  SELECT g.group_name,
   round(coalesce(sum(greatest(coalesce(a.qty_free,0),0)),0),2) partner_free,
   round(coalesce(sum(greatest(coalesce(a.qty_free,0),0)*coalesce(pr.unit_price,0)),0),2) partner_value,
   round(coalesce(sum(coalesce(o.qty,0)),0),2) vitebsk_qty,
   round(coalesce(sum(coalesce(c.qty,0)),0),2) chekhov_qty,
   count(*)::int matched_sku,
   count(*) FILTER(WHERE pr.unit_price>0)::int priced_sku
  FROM public.triovist_partner_stock a
  JOIN latest_group l ON l.sku=a.sku
  JOIN gr g ON g.norm=public.triovist_norm(l.assigned_group)
  LEFT JOIN prices pr ON pr.sku=a.sku
  LEFT JOIN own o ON o.sku=a.sku
  LEFT JOIN ck c ON c.sku=a.sku
  WHERE NOT coalesce(a.excluded,false) AND trim(a.sku) !~ '^900(/|$)'
  GROUP BY g.group_name
 ),
 calc AS (
  SELECT g.manager_email,g.manager_name,g.group_name,m.ly,m.pm,m.mtd,m.ly_qty,m.pm_qty,
   round(CASE WHEN se.target_factor>0 AND se.prior_factor>0
      THEN greatest(0.20,least(2.5,se.target_factor/se.prior_factor)) ELSE NULL END,4) season_ratio,
   round(se.confidence,3) season_confidence,
   round(CASE WHEN m.ly>0 AND m.pm>0 AND se.target_factor>0 AND se.prior_factor>0
    THEN (m.ly*0.6+m.pm*greatest(0.20,least(2.5,se.target_factor/se.prior_factor))*0.4)*1.15
    ELSE NULL END,2) proposed,
   coalesce(st.partner_free,0) partner_free,
   coalesce(st.partner_value,0) partner_value,
   coalesce(st.vitebsk_qty,0) vitebsk_qty,
   coalesce(st.chekhov_qty,0) chekhov_qty,
   coalesce(st.matched_sku,0) matched_sku,
   coalesce(st.priced_sku,0) priced_sku
  FROM gr g JOIN monthly m ON g.group_name=m.group_name JOIN season se ON g.group_name=se.group_name
  LEFT JOIN stock st ON st.group_name=g.group_name
 ),
 sources AS (
  SELECT
   (SELECT max(snapshot_date) FROM public.triovist_partner_stock) partner_date,
   (SELECT max(snapshot_date) FROM public.triovist_chekhov_stock) chekhov_date,
   (SELECT max(report_date) FROM public.stock_balances WHERE warehouse='Витебск') vitebsk_date,
   (SELECT max(updated_at) FROM public.triovist_seasonality_profiles) season_updated,
   (SELECT EXISTS(SELECT 1 FROM public.triovist_sales_imports i CROSS JOIN dates d WHERE i.month=d.ly)) has_ly_import,
   (SELECT EXISTS(SELECT 1 FROM public.triovist_sales_imports i CROSS JOIN dates d WHERE i.month=d.pm)) has_pm_import,
   (SELECT coalesce(max(source_file),'') FROM public.triovist_stock_import_log WHERE source='partner' AND snapshot_date=(SELECT max(snapshot_date) FROM public.triovist_partner_stock)) partner_source
 )
 SELECT jsonb_build_object(
  'version','uni-demand-20261105-v1','month',to_char(v_target,'YYYY-MM'),
  'policy',jsonb_build_object(
    'growth',0.15,'last_year_weight',0.6,'previous_month_weight',0.4,
    'season_min',0.20,'season_max',2.5,
    'available_rule','partner qty_free already includes any transit allowance; never add qty_transit_reserve again',
    'chekhov','informational_only','group900','excluded',
    'approval','leader_only; never auto-save'),
  'sources',(SELECT jsonb_build_object('partner_date',partner_date,'vitebsk_date',vitebsk_date,
   'chekhov_date',chekhov_date,'season_updated',season_updated,
   'history_complete',has_ly_import AND has_pm_import,
   'transit_verified',partner_source LIKE '[truth-v23.5.5]%',
   'transit_warning',CASE WHEN partner_source LIKE '[truth-v23.5.5]%'
     THEN 'Свободный товар в пути уже входит в qty_free; отдельно не прибавляется'
     ELSE 'Файл 21vek не содержит проверенной разбивки свободного товара в пути; резерв отдельно не прибавляется' END
   ) FROM sources),
  'groups',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'manager_email',c.manager_email,'manager_name',c.manager_name,'group',c.group_name,
    'last_year',c.ly,'previous_month',c.pm,'current_month',c.mtd,
    'last_year_qty',c.ly_qty,'previous_month_qty',c.pm_qty,
    'season_ratio',c.season_ratio,'season_confidence',c.season_confidence,
    'proposed',c.proposed,'partner_free',c.partner_free,'partner_stock_value',c.partner_value,
    'vitebsk_qty',c.vitebsk_qty,'chekhov_qty_reference',c.chekhov_qty,
    'matched_sku',c.matched_sku,'priced_sku',c.priced_sku,
    'readiness',CASE
      WHEN c.proposed IS NULL THEN 'requires_history_or_season'
      WHEN c.priced_sku<1 THEN 'requires_price_mapping'
      WHEN c.partner_value<c.proposed THEN 'requires_replenishment'
      ELSE 'review' END,
    'action',CASE
      WHEN c.proposed IS NULL THEN 'Проверить продажи и сезонность; не назначать числовую цель без данных'
      WHEN c.partner_value<c.proposed AND c.vitebsk_qty>0 THEN 'Проверить возможность и сроки пополнения с Витебска'
      WHEN c.partner_value<c.proposed THEN 'Подтвердить поступление и сроки, прежде чем утверждать цель'
      ELSE 'Проверить ассортимент и карточки перспективных SKU, не назначая произвольный TOP-60' END
   ) ORDER BY c.manager_name,c.group_name)
   FROM calc c),'[]'::jsonb),
  'managers',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
      'email',x.manager_email,'name',x.manager_name,
      'suggested',x.suggested,'last_year',x.ly,'previous_month',x.pm,
      'included_groups',x.calculated,'total_groups',x.total,
      'requires_review',x.calculated<x.total OR NOT (SELECT has_ly_import AND has_pm_import FROM sources)
   ) ORDER BY x.manager_name)
   FROM (
    SELECT manager_email,manager_name,
      round(sum(coalesce(proposed,0)),2) suggested,
      round(sum(ly),2) ly,round(sum(pm),2) pm,
      count(*) FILTER(WHERE proposed IS NOT NULL)::int calculated,count(*)::int total
    FROM calc GROUP BY manager_email,manager_name
   ) x),'[]'::jsonb)
 ) INTO v_result;
 RETURN v_result;
END;
$func$;
REVOKE ALL ON FUNCTION public.triovist_ai_demand_preview_v20261105(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_ai_demand_preview_v20261105(date) TO authenticated,service_role;
