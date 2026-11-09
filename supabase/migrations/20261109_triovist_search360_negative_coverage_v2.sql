-- Search360 coverage: allow filtering across every card with visible negative feedback.
-- No old card/TOP data changes; same actor and manager scope as v1.
CREATE OR REPLACE FUNCTION public.triovist_search360_negative_reviews_v1(p_limit integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
  v_user public.users%ROWTYPE;
  v_data jsonb;
BEGIN
  SELECT * INTO v_user FROM public.users u WHERE u.id=auth.uid();
  IF v_user.id IS NULL OR NOT (coalesce(v_user.role,'')='boss' OR coalesce(v_user.access_scope,'')='triovist') THEN
    RAISE EXCEPTION 'Нет доступа к отзывам Триовист 21vek';
  END IF;
  WITH raw AS (
    SELECT r.manager_email,r.card_key,r.sku,r.product_url,r.observed_at,r.parser_payload
    FROM public.triovist_21vek_shadow_raw_current r
    WHERE (v_user.role='boss' OR lower(r.manager_email)=lower(v_user.email))
      AND jsonb_typeof(r.parser_payload->'reviews')='array'
  ), negatives AS (
    SELECT r.*,rv.review
    FROM raw r
    JOIN LATERAL (
      SELECT x.value review
      FROM jsonb_array_elements(r.parser_payload->'reviews') x(value)
      WHERE x.value->>'rating' ~ '^[123]$'
      ORDER BY x.value->>'dateTimestamp' DESC NULLS LAST
      LIMIT 1
    ) rv ON TRUE
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'card_key',n.card_key,'manager_email',n.manager_email,'sku',n.sku,
    'product_name',coalesce(t.product_name,n.sku),'product_url',coalesce(t.product_url,n.product_url),
    'position',CASE WHEN t.position_exact IS TRUE THEN t.position ELSE NULL END,
    'position_exact',t.position_exact,'keyword',t.keyword,
    'last_negative_date',left(n.review->>'dateTimestamp',10),
    'last_negative_rating',(n.review->>'rating')::numeric,
    'last_negative_text',left(concat_ws(' | ',
       nullif(btrim(n.review->>'summary'),''),
       nullif(btrim(n.review->>'positives'),''),
       nullif(btrim(n.review->>'negatives'),'')),1500),
    'last_negative_answered',nullif(btrim(n.review->>'moderatorComment'),'') IS NOT NULL,
    'source_observed_at',n.observed_at,
    'coverage','visible_public_page_reviews'
  ) ORDER BY (n.review->>'dateTimestamp') DESC NULLS LAST),'[]'::jsonb)
  INTO v_data
  FROM (SELECT * FROM negatives ORDER BY review->>'dateTimestamp' DESC NULLS LAST
        LIMIT greatest(1,least(coalesce(p_limit,60),500))) n
  LEFT JOIN public.triovist_21vek_top_current t
    ON t.manager_email=n.manager_email AND t.card_key=n.card_key;
  RETURN jsonb_build_object('rows',coalesce(v_data,'[]'::jsonb),
    'source','public 21vek product-page visible reviews; latest negative only');
END;
$function$;
REVOKE ALL ON FUNCTION public.triovist_search360_negative_reviews_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_search360_negative_reviews_v1(integer) TO authenticated;
