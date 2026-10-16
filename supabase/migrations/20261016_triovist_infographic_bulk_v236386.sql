-- v23.6.386: isolated persistent batch pipeline for Triovist infographics.
-- No writes to source Triovist sales, price, stock or parser tables.
CREATE TABLE IF NOT EXISTS public.triovist_infographic_batches_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  owner_email text NOT NULL,
  groups text[] NOT NULL,
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','completed_with_errors','failed')),
  archive_path text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.triovist_infographic_batch_items_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.triovist_infographic_batches_v1(id) ON DELETE CASCADE,
  sku text NOT NULL,
  group_name text NOT NULL,
  manager_email text NOT NULL,
  product_name text NOT NULL,
  product_url text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','error')),
  photo_source_url text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infographic_batch_sku_unique UNIQUE(batch_id,sku)
);
CREATE INDEX IF NOT EXISTS infographic_batches_owner_new_idx ON public.triovist_infographic_batches_v1(owner_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS infographic_batch_items_job_status_idx ON public.triovist_infographic_batch_items_v1(batch_id,status,sku);
ALTER TABLE public.triovist_infographic_batches_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triovist_infographic_batch_items_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.triovist_infographic_batches_v1 FROM anon,authenticated;
REVOKE ALL ON public.triovist_infographic_batch_items_v1 FROM anon,authenticated;
COMMENT ON TABLE public.triovist_infographic_batches_v1 IS 'Private automatic infographic batches; accessed through dedicated server API only. No source table mutations.';
COMMENT ON TABLE public.triovist_infographic_batch_items_v1 IS 'Per-SKU batch progress and image provenance; no source table mutations.';

-- The source has 21vek subgroup "Бытовые насосы", which includes fecal pumps.
-- Make fecal pumps their own selectable type while retaining the other subgroup rows.
CREATE OR REPLACE FUNCTION public.triovist_infographic_catalog_v236386(p_manager text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='public'
AS $$
WITH latest AS (
 SELECT DISTINCT ON (c.sku) c.sku,c.subgroup,c.product_name,c.manager_email
 FROM public.triovist_content_cards c
 WHERE c.sku IS NOT NULL AND c.sku <> '' AND c.product_url LIKE 'https://www.21vek.by/%'
   AND (p_manager IS NULL OR lower(c.manager_email)=lower(p_manager))
 ORDER BY c.sku,c.created_at DESC
), typed AS (
 SELECT sku,CASE WHEN product_name ~* 'фекальн.{0,40}насос|насос.{0,40}фекальн' THEN 'Фекальные насосы'
  ELSE COALESCE(NULLIF(btrim(subgroup),''),'Без подгруппы') END AS group_name
 FROM latest
)
SELECT COALESCE(jsonb_agg(jsonb_build_object('name',group_name,'sku_count',sku_count) ORDER BY group_name),'[]'::jsonb)
FROM (SELECT group_name,count(*) sku_count FROM typed GROUP BY group_name HAVING count(*)>0) groups;
$$;
CREATE OR REPLACE FUNCTION public.triovist_infographic_group_skus_v236386(p_groups text[],p_manager text DEFAULT NULL)
RETURNS TABLE(sku text,group_name text,product_name text,product_url text,manager_email text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='public'
AS $$
WITH latest AS (
 SELECT DISTINCT ON (c.sku) c.sku,c.product_name,c.subgroup,c.product_url,c.manager_email,c.created_at
 FROM public.triovist_content_cards c
 WHERE c.sku IS NOT NULL AND c.sku <> '' AND c.product_url LIKE 'https://www.21vek.by/%'
   AND (p_manager IS NULL OR lower(c.manager_email)=lower(p_manager))
 ORDER BY c.sku,c.created_at DESC
), typed AS (
 SELECT l.sku,CASE WHEN l.product_name ~* 'фекальн.{0,40}насос|насос.{0,40}фекальн' THEN 'Фекальные насосы'
  ELSE COALESCE(NULLIF(btrim(l.subgroup),''),'Без подгруппы') END AS group_name,
 l.product_name,l.product_url,l.manager_email
 FROM latest l
)
SELECT t.sku,t.group_name,t.product_name,t.product_url,t.manager_email
FROM typed t WHERE t.group_name=ANY(p_groups)
ORDER BY t.group_name,t.sku LIMIT 501;
$$;
REVOKE ALL ON FUNCTION public.triovist_infographic_catalog_v236386(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.triovist_infographic_group_skus_v236386(text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.triovist_infographic_catalog_v236386(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.triovist_infographic_group_skus_v236386(text[],text) TO service_role;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('triovist-infographic-archives','triovist-infographic-archives',false,52428800,ARRAY['application/zip']::text[])
ON CONFLICT (id) DO NOTHING;
