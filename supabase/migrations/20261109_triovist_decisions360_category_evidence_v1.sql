-- Evidence-only "Доли 360": 9-month category totals + freshest verified product facts.
-- Price is the latest imported price, not an assumed current retail offer.
-- Product market sales volumes cannot be inferred from listing position.
CREATE OR REPLACE FUNCTION public.triovist_decisions360_category_evidence_v1(
  p_category text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
 a record;
 v_market numeric;
 v_ours numeric;
 v_owner text;
 v_notes text;
 v_goal numeric;
 v_brands jsonb:='[]'::jsonb;
 v_skus jsonb:='[]'::jsonb;
 v_competitors jsonb:='[]'::jsonb;
 v_price_at timestamptz;
 v_price_id uuid;
BEGIN
 SELECT * INTO a FROM public.triovist_content_actor();
 IF a.actor_email IS NULL THEN RAISE EXCEPTION 'Нет авторизации'; END IF;

 SELECT c.market_usd,c.source_notes,x.manager_email
 INTO v_market,v_notes,v_owner
 FROM public.triovist_share_categories_v1 c
 LEFT JOIN public.triovist_share_assignments_v1 x ON x.category=c.category
 WHERE c.period_end='2026-09-30' AND c.category=p_category;
 IF NOT FOUND THEN RAISE EXCEPTION 'Категория не найдена'; END IF;
 IF a.actor_role='boss' AND a.actor_email IN ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') THEN
   NULL;
 ELSIF a.actor_scope='triovist'
  AND a.actor_email IN ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru')
  AND a.actor_email=lower(coalesce(v_owner,'')) THEN
   NULL;
 ELSE RAISE EXCEPTION 'Нет доступа к этой категории'; END IF;

 SELECT coalesce(sum(revenue_usd),0) INTO v_ours
 FROM public.triovist_share_brands_v1
 WHERE category=p_category AND period_end='2026-09-30'
 AND lower(brand) IN ('ресанта','huter','вихрь','eurolux');
 SELECT target_pp INTO v_goal
 FROM public.triovist_share_goals_v1 WHERE category=p_category AND quarter='2026-Q4';

 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',y.brand,'usd_9m',y.revenue_usd,
   'qty_9m',y.quantity,
   'share_pct',CASE WHEN v_market>0 THEN round(y.revenue_usd/v_market*100,2) ELSE NULL END)
   ORDER BY y.revenue_usd DESC),'[]'::jsonb)
 INTO v_brands
 FROM public.triovist_share_brands_v1 y
 WHERE y.category=p_category AND y.period_end='2026-09-30';

 SELECT i.id,i.imported_at INTO v_price_id,v_price_at
 FROM public.triovist_price_imports i
 WHERE i.status='success' ORDER BY i.imported_at DESC LIMIT 1;

 -- A verified category ↔ task-subgroup mapping exists for the instrument category.
 -- Other categories retain baseline brand facts until an explicit mapping is approved.
 IF p_category='Электроинструмент' AND v_owner IS NOT NULL THEN
   WITH listing AS (
     SELECT DISTINCT ON (btrim(s.item->>'sku'))
       btrim(s.item->>'sku') sku,
       btrim(coalesce(s.item->>'keyword','')) keyword,
       coalesce(s.item->>'listing_state','unknown') saved_listing_state,
       t.commercial_context->>'subgroup' task_subgroup
     FROM public.triovist_ai_tasks t
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(t.commercial_context->'listing_samples')='array'
            THEN t.commercial_context->'listing_samples' ELSE '[]'::jsonb END) s(item)
     WHERE t.period_month=date_trunc('month',current_date)::date
       AND lower(t.manager_email)=lower(v_owner)
       AND t.generator_version='uni-brainstorm-subgroup-v2'
       AND public.triovist_norm(t.group_name) IN (
         public.triovist_norm('Инструмент'),
         public.triovist_norm('Инструмент Ресанта'))
       AND nullif(btrim(s.item->>'sku'),'') IS NOT NULL
       AND btrim(s.item->>'sku') !~* '^900(/|$)'
     ORDER BY btrim(s.item->>'sku'),t.created_at DESC
   ),
   detailed AS (
     SELECT l.sku,l.keyword,l.task_subgroup,l.saved_listing_state,
       p.product product_name,p.price price_list,
       cs.qty_total chekhov_total,cs.snapshot_date chekhov_date,
       st.qty_free partner_free,st.qty_transit_reserve partner_in_transit,
       st.snapshot_date partner_date,
       tp.position, tp.position_exact,tp.observed_at position_at,
       CASE
         WHEN p.sku IS NULL THEN 'not_in_last_price_import'
         WHEN st.qty_free IS NOT NULL AND st.qty_free<=0 AND coalesce(cs.qty_total,0)>0
           THEN 'partner_stock_gap_with_chekhov'
         WHEN tp.sku IS NULL OR tp.observed_at<now()-interval '72 hours'
           THEN 'listing_not_freshly_verified'
         WHEN tp.position_exact AND tp.position>60 THEN 'weak_exact_position'
         ELSE 'check_commercial_decision'
       END opportunity
     FROM listing l
     LEFT JOIN LATERAL (
       SELECT product,price,sku FROM public.triovist_price_items p
       WHERE p.import_id=v_price_id AND p.sku=l.sku LIMIT 1
     ) p ON true
     LEFT JOIN LATERAL (
       SELECT qty_total,snapshot_date
       FROM public.triovist_chekhov_stock c
       WHERE c.sku=l.sku ORDER BY snapshot_date DESC LIMIT 1
     ) cs ON true
     LEFT JOIN LATERAL (
       SELECT qty_free,qty_transit_reserve,snapshot_date
       FROM public.triovist_partner_stock st
       WHERE st.sku=l.sku AND st.excluded IS NOT TRUE
       ORDER BY snapshot_date DESC LIMIT 1
     ) st ON true
     LEFT JOIN LATERAL (
       SELECT position,position_exact,observed_at,sku
       FROM public.triovist_21vek_top_current tp
       WHERE tp.sku=l.sku AND lower(tp.manager_email)=lower(v_owner)
       ORDER BY observed_at DESC LIMIT 1
     ) tp ON true
   )
   SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sku',a.sku,'subgroup',a.task_subgroup,'keyword',a.keyword,
    'product',a.product_name,'price_list',a.price_list,
    'price_list_at',v_price_at,'chekhov_total',a.chekhov_total,'chekhov_date',a.chekhov_date,
    'partner_free',a.partner_free,'partner_in_transit',a.partner_in_transit,
    'partner_date',a.partner_date,
    'position',CASE WHEN a.position_exact IS TRUE AND a.position_at>=now()-interval '72 hours'
                    THEN a.position ELSE NULL END,
    'position_at',a.position_at,'position_verified',a.position_exact IS TRUE AND a.position_at>=now()-interval '72 hours',
    'listing_state',a.saved_listing_state,'opportunity',a.opportunity
   ) ORDER BY
      CASE a.opportunity
      WHEN 'partner_stock_gap_with_chekhov' THEN 0
      WHEN 'listing_not_freshly_verified' THEN 1
      WHEN 'weak_exact_position' THEN 2 ELSE 3 END,a.sku),'[]'::jsonb)
   INTO v_skus FROM (SELECT * FROM detailed LIMIT 75) a;

   WITH keywords AS (
      SELECT DISTINCT lower(btrim(s.item->>'keyword')) keyword
      FROM public.triovist_ai_tasks t
      CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(t.commercial_context->'listing_samples')='array'
            THEN t.commercial_context->'listing_samples' ELSE '[]'::jsonb END) s(item)
      WHERE t.period_month=date_trunc('month',current_date)::date
        AND lower(t.manager_email)=lower(v_owner)
        AND public.triovist_norm(t.group_name) IN (
         public.triovist_norm('Инструмент'),public.triovist_norm('Инструмент Ресанта'))
        AND nullif(btrim(s.item->>'keyword'),'') IS NOT NULL
   ),
   competitor AS (
     SELECT c.brand,c.model,c.search_query,c.position,c.current_price,c.in_stock,c.observed_at,c.product_url
     FROM public.triovist_market_comp_position_current_v236352 c
     WHERE lower(btrim(c.search_query)) IN (SELECT keyword FROM keywords)
       AND c.brand IS NOT NULL
       AND lower(c.brand) NOT IN ('ресанта','вихрь','huter','eurolux')
       AND c.position IS NOT NULL AND c.observed_at IS NOT NULL
     ORDER BY c.position ASC,c.observed_at DESC LIMIT 15
   )
   SELECT coalesce(jsonb_agg(jsonb_build_object(
       'brand',brand,'model',model,'search_query',search_query,
       'position',position,'price',current_price,'in_stock',in_stock,
       'observed_at',observed_at,'product_url',product_url,
       'volume_usd',NULL,'volume_status','нет подтвержденного оборота по SKU')
       ORDER BY position ASC),'[]'::jsonb)
   INTO v_competitors FROM competitor;
 END IF;

 RETURN jsonb_build_object(
   'category',p_category,'owner',v_owner,
   'baseline_end','2026-09-30','baseline_months',9,'currency','USD','vat','without_vat',
   'market_usd',v_market,'our_usd',v_ours,
   'our_share_pct',CASE WHEN v_market>0 THEN round(v_ours/v_market*100,2) ELSE NULL END,
   'one_pp_usd_9m',CASE WHEN v_market>0 THEN round(v_market/100,2) ELSE NULL END,
   'q4_target_delta_pp',v_goal,
   'q4_target_final_share_pct',CASE WHEN v_market>0 AND v_goal IS NOT NULL
     THEN round(v_ours/v_market*100+v_goal,2) ELSE NULL END,
   'goal_requires_review',coalesce(v_goal,0)>=10,
   'brand_revenue_incomplete',true,'source_notes',v_notes,'brands',v_brands,
   'sku_evidence',v_skus,'competitor_evidence',v_competitors,
   'sku_mapping',CASE WHEN p_category='Электроинструмент' THEN
    'task_listing_samples_for_instrument_groups' ELSE 'not_verified_for_category' END,
   'price_imported_at',v_price_at,
   'conclusion','Позиция в поиске не равна продажам. Доля +1 п.п. — модель на обороте за 9 месяцев, не выручка Q4 и не прибыль. Факт Q4 требует нового отчёта рынка.');
END;
$function$;
REVOKE ALL ON FUNCTION public.triovist_decisions360_category_evidence_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_decisions360_category_evidence_v1(text) TO authenticated;
