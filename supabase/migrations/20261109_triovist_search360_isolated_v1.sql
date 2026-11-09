-- Triovist 21vek Search360: isolated user-initiated deep rank checks.
-- Existing TOP, hourly, product-card parsers and snapshots remain untouched.
CREATE TABLE IF NOT EXISTS public.triovist_search360_requests_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  query_text text NOT NULL CHECK (char_length(btrim(query_text)) BETWEEN 2 AND 120),
  resolved_query text,
  suggestion_text text,
  suggestion_source text,
  suggestion_status text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','complete','partial','failed')),
  max_depth integer NOT NULL DEFAULT 600 CHECK(max_depth BETWEEN 60 AND 600),
  search_total integer,
  pages_checked integer NOT NULL DEFAULT 0,
  rows_found integer NOT NULL DEFAULT 0,
  error_text text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS triovist_search360_queue_idx
  ON public.triovist_search360_requests_v1(status,requested_at);
CREATE INDEX IF NOT EXISTS triovist_search360_actor_idx
  ON public.triovist_search360_requests_v1(requested_by,requested_at DESC);
ALTER TABLE public.triovist_search360_requests_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS triovist_search360_requests_read_v1 ON public.triovist_search360_requests_v1;
CREATE POLICY triovist_search360_requests_read_v1 ON public.triovist_search360_requests_v1
FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.users u WHERE u.id=(SELECT auth.uid())
    AND (u.role='boss' OR (u.access_scope='triovist' AND requested_by=(SELECT auth.uid()))))
);
DROP POLICY IF EXISTS triovist_search360_requests_add_v1 ON public.triovist_search360_requests_v1;
CREATE POLICY triovist_search360_requests_add_v1 ON public.triovist_search360_requests_v1
FOR INSERT TO authenticated WITH CHECK (
  requested_by=(SELECT auth.uid()) AND status='queued'
  AND suggestion_status='pending' AND resolved_query IS NULL
  AND suggestion_text IS NULL AND error_text IS NULL
  AND search_total IS NULL AND pages_checked=0 AND rows_found=0
  AND started_at IS NULL AND finished_at IS NULL
  AND EXISTS (SELECT 1 FROM public.users u
    WHERE u.id=(SELECT auth.uid()) AND (u.role='boss' OR u.access_scope='triovist'))
);
REVOKE ALL ON public.triovist_search360_requests_v1 FROM anon;
GRANT SELECT,INSERT ON public.triovist_search360_requests_v1 TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.triovist_search360_requests_v1 TO service_role;
-- No authenticated UPDATE or DELETE: results are written only by runner (service_role).

CREATE TABLE IF NOT EXISTS public.triovist_search360_results_v1 (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.triovist_search360_requests_v1(id) ON DELETE RESTRICT,
  product_id text NOT NULL,
  product_name text,
  product_url text,
  brand text,
  sku text,
  manager_email text,
  position integer CHECK (position IS NULL OR position>0),
  page_no integer,
  position_state text NOT NULL CHECK (position_state IN ('exact','not_found_within_checked','unknown_error')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, product_id)
);
CREATE INDEX IF NOT EXISTS triovist_search360_results_request_idx
  ON public.triovist_search360_results_v1(request_id,position);
ALTER TABLE public.triovist_search360_results_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS triovist_search360_results_read_v1 ON public.triovist_search360_results_v1;
CREATE POLICY triovist_search360_results_read_v1 ON public.triovist_search360_results_v1
FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.triovist_search360_requests_v1 rq WHERE rq.id=request_id)
);
REVOKE ALL ON public.triovist_search360_results_v1 FROM anon;
GRANT SELECT ON public.triovist_search360_results_v1 TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.triovist_search360_results_v1 TO service_role;
REVOKE ALL ON SEQUENCE public.triovist_search360_results_v1_id_seq FROM anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.triovist_search360_results_v1_id_seq TO service_role;

-- Read only current public-page snapshots: return LAST NEGATIVE, not the last review of any rating.
-- The public JSON has finite review coverage; never claim this is all lifetime reviews.
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
        LIMIT greatest(1,least(coalesce(p_limit,60),100))) n
  LEFT JOIN public.triovist_21vek_top_current t
    ON t.manager_email=n.manager_email AND t.card_key=n.card_key;
  RETURN jsonb_build_object('rows',coalesce(v_data,'[]'::jsonb),
    'source','public 21vek product-page visible reviews; latest negative only');
END;
$function$;
REVOKE ALL ON FUNCTION public.triovist_search360_negative_reviews_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_search360_negative_reviews_v1(integer) TO authenticated;

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
        LIMIT greatest(1,least(coalesce(p_limit,60),100))) n
  LEFT JOIN public.triovist_21vek_top_current t
    ON t.manager_email=n.manager_email AND t.card_key=n.card_key;
  RETURN jsonb_build_object('rows',coalesce(v_data,'[]'::jsonb),
    'source','public 21vek product-page visible reviews; latest negative only');
END;
$function$;
REVOKE ALL ON FUNCTION public.triovist_search360_negative_reviews_v1(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_search360_negative_reviews_v1(integer) TO authenticated;
