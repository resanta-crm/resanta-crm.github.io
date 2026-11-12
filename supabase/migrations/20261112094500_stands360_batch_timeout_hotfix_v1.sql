-- Hotfix 2026-11-12: eliminate ten expensive per-placement v3 SKU RPCs from overview.
-- One set-based snapshot of all visible stands, their confirmed SKU sets and 1C history.
-- No edits to stored stands, source photos, catalog, 1C, GPS, routes or contracts.
CREATE OR REPLACE FUNCTION public.crm_stands_360_v3(p_limit integer DEFAULT 150)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fast$
DECLARE role_text text:=private.crm_stands_role_v236346();
        person text:=private.crm_stands_user_name_v236346();
        response jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR role_text NOT IN ('dfs','df','manager')
 THEN RAISE EXCEPTION 'Доступ запрещён' USING errcode='42501'; END IF;
 WITH
 base AS MATERIALIZED (
  SELECT p.id,p.client_id,p.client_name,coalesce(nullif(c.code,''),p.client_id::text) AS client_code,
   p.manager_name,p.address,p.installed_at,p.asset_id,a.asset_code,
   t.name AS stand_type,t.brand AS stand_brand,p.status,p.last_control_at,
   p.last_control_photo_path,p.installation_photo_path,p.vision_checked_at,p.vision_status,
   p.vision_summary,p.vision_fill_pct,p.vision_own_brand_pct,
   p.ai_score,p.ai_status,p.ai_checked_at,
   coalesce(lb.legal_client_id,p.client_id) AS legal_client_id,
   lc.name AS legal_client_name,
   CASE WHEN p.last_control_at IS NOT NULL THEN current_date-p.last_control_at::date
        WHEN p.installed_at IS NOT NULL THEN current_date-p.installed_at ELSE NULL END AS photo_days
  FROM public.stand_placements_v236346 p
  LEFT JOIN public.clients c ON c.id=p.client_id
  LEFT JOIN public.stand_assets_v236346 a ON a.id=p.asset_id
  LEFT JOIN public.stand_asset_types_v236346 t ON t.id=p.asset_type_id
  LEFT JOIN public.stand_360_legal_bindings_v3 lb ON lb.placement_id=p.id
  LEFT JOIN public.clients lc ON lc.id=coalesce(lb.legal_client_id,p.client_id)
  WHERE p.status IN ('active','legacy_unreconciled','return_requested')
    AND (role_text IN ('dfs','df') OR p.manager_name=person)
  ORDER BY p.installed_at DESC,p.id
  LIMIT least(greatest(coalesce(p_limit,150),1),250)
 ),
 -- Real manufacturer catalog, not the heavyweight composite price+promotion+1C view.
 catalog AS MATERIALIZED (
  SELECT upper(btrim(sku)) AS key,max(btrim(sku)) AS sku FROM public.price_list
  WHERE nullif(btrim(sku),'') IS NOT NULL GROUP BY upper(btrim(sku))
 ),
 multi AS MATERIALIZED (
  SELECT m.placement_id,m.raw_sku,array_agg(DISTINCT m.catalog_sku ORDER BY m.catalog_sku) AS codes
  FROM public.stand_360_multi_sku_v3 m
  JOIN base b ON b.id=m.placement_id
  GROUP BY m.placement_id,m.raw_sku
 ),
 raw AS MATERIALIZED (
  SELECT i.placement_id,i.sku AS raw_sku,
    greatest(1,coalesce((regexp_match(i.sku,'([0-9]+)[[:space:]]*скю','i'))[1]::int,1)) AS expected,
    CASE WHEN m.codes IS NOT NULL THEN m.codes
         WHEN ln.catalog_sku IS NOT NULL THEN ARRAY[ln.catalog_sku]
         WHEN cat.sku IS NOT NULL THEN ARRAY[cat.sku]
         ELSE ARRAY[]::text[] END AS confirmed_skus
  FROM public.stand_placement_items_v236346 i
  JOIN base b ON b.id=i.placement_id
  LEFT JOIN multi m ON m.placement_id=i.placement_id AND m.raw_sku=i.sku
  LEFT JOIN public.stand_360_sku_links_v2 ln ON ln.placement_id=i.placement_id AND ln.raw_sku=i.sku
  LEFT JOIN catalog cat ON cat.key=upper(btrim(i.sku))
 ),
 sku_counts AS MATERIALIZED (
  SELECT placement_id,count(*)::int registered_rows,
    coalesce(sum(expected),0)::int sku_expected,
    coalesce(sum(cardinality(confirmed_skus)),0)::int sku_selected,
    count(*) FILTER (WHERE cardinality(confirmed_skus)<expected)::int unresolved_groups
  FROM raw GROUP BY placement_id
 ),
 sku_keys AS MATERIALIZED (
  SELECT DISTINCT r.placement_id,upper(btrim(x.sku)) AS sku
  FROM raw r CROSS JOIN LATERAL unnest(r.confirmed_skus) x(sku)
  WHERE nullif(btrim(x.sku),'') IS NOT NULL
 ),
 history AS MATERIALIZED (
  SELECT h.client_id,h.month,h.revenue,upper(btrim(h.sku)) AS sku
  FROM public.purchase_history h
  WHERE h.client_id IN (SELECT DISTINCT b.legal_client_id FROM base b WHERE b.legal_client_id IS NOT NULL)
 ),
 client_totals AS MATERIALIZED (
  SELECT client_id,count(*)::int client_history_rows,
   coalesce(sum(revenue) FILTER (WHERE month >= date_trunc('month',current_date)::date-interval '5 months'),0)::numeric AS client_ship_6m
  FROM history GROUP BY client_id
 ),
 ship_stats AS MATERIALIZED (
  SELECT keys.placement_id,
    coalesce(sum(h.revenue) FILTER (WHERE h.month>=date_trunc('month',current_date)::date-interval '2 months'),0)::numeric AS ship_3m,
    coalesce(sum(h.revenue) FILTER (WHERE h.month>=date_trunc('month',current_date)::date-interval '5 months'),0)::numeric AS ship_6m,
    coalesce(sum(h.revenue) FILTER (WHERE h.month>=date_trunc('month',current_date)::date-interval '11 months'
      AND h.month<date_trunc('month',current_date)::date-interval '5 months'),0)::numeric AS ship_prev_6m,
    max(h.month) AS last_ship_month
  FROM sku_keys keys JOIN base b ON b.id=keys.placement_id
  LEFT JOIN history h ON h.client_id=b.legal_client_id AND h.sku=keys.sku
   AND h.month>=date_trunc('month',current_date)::date-interval '11 months'
  GROUP BY keys.placement_id
 ),
 outlets AS MATERIALIZED (
  SELECT pc.client_id,count(DISTINCT pc.point_id)::int AS physical_point_links
  FROM public.route_physical_point_clients pc
  WHERE pc.client_id IN (SELECT b.client_id FROM base b)
  GROUP BY pc.client_id
 ),
 enriched AS (
  SELECT b.*,coalesce(sc.sku_expected,0) AS sku_expected,
   coalesce(sc.sku_selected,0) AS sku_selected,
   coalesce(sc.sku_expected,0) AS registered_skus,
   coalesce(sc.sku_selected,0) AS validated_skus,
   coalesce(sc.unresolved_groups,0) AS unresolved_skus,
   (SELECT count(*) FROM sku_keys keys WHERE keys.placement_id=b.id)::int AS unique_skus,
   coalesce(ss.ship_3m,0) AS ship_3m,
   coalesce(ss.ship_6m,0) AS ship_6m,
   coalesce(ss.ship_prev_6m,0) AS ship_prev_6m,ss.last_ship_month,
   coalesce(ct.client_history_rows,0) AS client_history_rows,
   coalesce(ct.client_ship_6m,0) AS client_ship_6m,
   coalesce(ol.physical_point_links,0) AS physical_point_links,
   coalesce(ps.origin,'unknown') AS photo_origin,
   coalesce(pr.requested,false) AS photo_requested,
   v.stand_present AS vision_stand_present,
   v.photo_quality_score AS vision_photo_quality_score,
   v.storage_path AS vision_photo_evidence_path
  FROM base b
  LEFT JOIN sku_counts sc ON sc.placement_id=b.id
  LEFT JOIN ship_stats ss ON ss.placement_id=b.id
  LEFT JOIN client_totals ct ON ct.client_id=b.legal_client_id
  LEFT JOIN outlets ol ON ol.client_id=b.client_id
  LEFT JOIN LATERAL (
   SELECT src.origin FROM public.stand_360_photo_sources_v1 src
   JOIN public.stand_photos_v236346 photo ON photo.id=src.photo_id
   WHERE src.placement_id=b.id AND photo.storage_path=coalesce(b.last_control_photo_path,b.installation_photo_path)
   ORDER BY src.submitted_at DESC LIMIT 1
  )ps ON true
  LEFT JOIN LATERAL (
   SELECT true AS requested FROM public.stand_360_photo_requests_v1 req
   WHERE req.placement_id=b.id AND req.status='open' LIMIT 1
  )pr ON true
  LEFT JOIN LATERAL (
   SELECT vv.stand_present,vv.photo_quality_score,vv.storage_path
   FROM public.stand_vision_checks_v236347 vv WHERE vv.placement_id=b.id
   ORDER BY vv.created_at DESC LIMIT 1
  )v ON true
 ),
 evaluated AS (
  SELECT en.*,
   CASE WHEN en.client_history_rows=0 THEN 'client_id_unlinked'
    WHEN en.unresolved_skus>0 OR en.registered_skus=0 THEN 'sku_unverified'
    ELSE 'verified_monthly_client_shipments' END AS sales_confidence,
   CASE WHEN en.asset_id IS NULL THEN 'asset_check'
    WHEN en.last_control_photo_path IS NULL AND en.installation_photo_path IS NULL THEN 'photo_missing'
    WHEN en.client_history_rows=0 THEN 'client_id_check'
    WHEN en.unresolved_skus>0 OR en.registered_skus=0 THEN 'sku_check'
    WHEN en.photo_days>45 THEN 'photo_stale'
    WHEN en.vision_checked_at IS NULL OR en.vision_checked_at<coalesce(en.last_control_at,'epoch'::timestamptz) THEN 'vision_pending'
    WHEN en.vision_own_brand_pct IS NOT NULL AND en.vision_own_brand_pct<35 THEN 'use_check'
    WHEN en.ship_6m=0 AND en.unique_skus>0 THEN 'shipments_check'
    WHEN en.ship_prev_6m>0 AND en.ship_6m<en.ship_prev_6m*.75 THEN 'shipments_check'
    ELSE 'maintain' END AS priority_code
  FROM enriched en
 )
 SELECT jsonb_build_object(
  'version','stands360-v3-fast','actor_role',role_text,
  'data_precision','monthly shipments by confirmed legal client and exact catalog SKU; not retail stand sales',
  'total',count(*),
  'asset_issues',count(*) FILTER (WHERE asset_id IS NULL),
  'photo_issues',count(*) FILTER (WHERE last_control_photo_path IS NULL AND installation_photo_path IS NULL),
  'data_issues',count(*) FILTER (WHERE sales_confidence<>'verified_monthly_client_shipments'),
  'attention',count(*) FILTER (WHERE priority_code<>'maintain'),
  'stands',coalesce(jsonb_agg(to_jsonb(evaluated) ORDER BY
    CASE priority_code WHEN 'asset_check' THEN 1 WHEN 'client_id_check' THEN 2 WHEN 'sku_check' THEN 3
    WHEN 'photo_missing' THEN 4 WHEN 'use_check' THEN 5 WHEN 'photo_stale' THEN 6
    WHEN 'shipments_check' THEN 7 ELSE 8 END,client_name),'[]'::jsonb)
 ) INTO response FROM evaluated;
 RETURN response;
END $fast$;
REVOKE ALL ON FUNCTION public.crm_stands_360_v3(integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.crm_stands_360_v3(integer) TO authenticated;

-- Speed up the *single* stand drilldown without changing its data contract:
-- the full catalog consists precisely of records in price_list (not broad view).
CREATE OR REPLACE FUNCTION public.crm_stands_360_skus_v3(p_placement_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fast_sku$
DECLARE p public.stand_placements_v236346%rowtype;legal_id uuid;
 result jsonb;expected_total int; selected_total int; unresolved int;
 ship6 numeric;shipprev numeric;all6 numeric;clientrows int;
BEGIN
 p:=private.crm_stands_v3_check(p_placement_id,false);
 SELECT coalesce(lb.legal_client_id,p.client_id) INTO legal_id
 FROM public.stand_360_legal_bindings_v3 lb WHERE lb.placement_id=p.id;
 legal_id:=coalesce(legal_id,p.client_id);
 WITH
 catalog AS MATERIALIZED (
  SELECT upper(btrim(sku)) AS code,max(btrim(sku)) AS sku FROM public.price_list
  WHERE nullif(btrim(sku),'') IS NOT NULL GROUP BY upper(btrim(sku))
 ),
 raw AS MATERIALIZED (
  SELECT i.sku raw_sku,i.product_name,
    greatest(1,coalesce((regexp_match(i.sku,'([0-9]+)[[:space:]]*скю','i'))[1]::int,1)) AS expected,
    (SELECT array_agg(DISTINCT m.catalog_sku ORDER BY m.catalog_sku) FROM public.stand_360_multi_sku_v3 m
       WHERE m.placement_id=i.placement_id AND m.raw_sku=i.sku) AS multi_skus,
    l.catalog_sku AS legacy_sku,cat.sku AS exact_sku
  FROM public.stand_placement_items_v236346 i
  LEFT JOIN public.stand_360_sku_links_v2 l ON l.placement_id=i.placement_id AND l.raw_sku=i.sku
  LEFT JOIN catalog cat ON cat.code=upper(btrim(i.sku))
  WHERE i.placement_id=p.id
 ),
 expanded AS MATERIALIZED (
  SELECT raw.*,
   CASE WHEN multi_skus IS NOT NULL THEN multi_skus
    WHEN legacy_sku IS NOT NULL THEN ARRAY[legacy_sku]
    WHEN exact_sku IS NOT NULL THEN ARRAY[exact_sku]
    ELSE ARRAY[]::text[] END AS effective_skus,
   CASE WHEN multi_skus IS NOT NULL THEN cardinality(multi_skus)
    WHEN legacy_sku IS NOT NULL OR exact_sku IS NOT NULL THEN 1 ELSE 0 END AS chosen
  FROM raw
 ),
 raw_detail AS (
  SELECT expanded.*,
   CASE WHEN chosen=0 THEN 'unresolved' WHEN chosen<expected THEN 'partial'
        WHEN multi_skus IS NOT NULL THEN 'verified_multi' ELSE 'exact_or_verified' END AS sku_state,
   coalesce((SELECT sum(h.revenue) FROM public.purchase_history h
    WHERE h.client_id=legal_id AND h.month>=date_trunc('month',current_date)::date-interval '5 months'
     AND upper(btrim(h.sku))=ANY(SELECT upper(btrim(u)) FROM unnest(expanded.effective_skus) u)),0) AS ship_6m
  FROM expanded
 )
 SELECT coalesce(jsonb_agg(to_jsonb(raw_detail) ORDER BY
   CASE sku_state WHEN 'unresolved' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,raw_sku),'[]'::jsonb),
  coalesce(sum(expected),0)::int,coalesce(sum(chosen),0)::int,
  count(*) FILTER (WHERE chosen<expected)::int
 INTO result,expected_total,selected_total,unresolved FROM raw_detail;
 WITH confirmed AS(
  SELECT DISTINCT upper(btrim(u)) sku FROM expanded x CROSS JOIN LATERAL unnest(x.effective_skus) u
  WHERE nullif(btrim(u),'') IS NOT NULL
 )
 SELECT coalesce(sum(h.revenue) FILTER (WHERE h.month>=date_trunc('month',current_date)::date-interval '5 months'),0),
  coalesce(sum(h.revenue) FILTER (WHERE h.month<date_trunc('month',current_date)::date-interval '5 months'),0)
 INTO ship6,shipprev FROM confirmed c
 JOIN public.purchase_history h ON h.client_id=legal_id AND upper(btrim(h.sku))=c.sku
 WHERE h.month>=date_trunc('month',current_date)::date-interval '11 months';
 SELECT count(*),
  coalesce(sum(revenue) FILTER (WHERE month>=date_trunc('month',current_date)::date-interval '5 months'),0)
 INTO clientrows,all6 FROM public.purchase_history WHERE client_id=legal_id;
 RETURN jsonb_build_object('placement_id',p.id,'client_id',p.client_id,'legal_client_id',legal_id,
  'sku_expected',expected_total,'sku_selected',selected_total,'unresolved_groups',unresolved,
  'ship_6m',ship6,'ship_prev_6m',shipprev,'client_history_rows',clientrows,'client_ship_6m',all6,
  'rows',result,'data_precision','monthly_customer_shipments_not_retail');
END $fast_sku$;
REVOKE ALL ON FUNCTION public.crm_stands_360_skus_v3(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.crm_stands_360_skus_v3(uuid) TO authenticated;
