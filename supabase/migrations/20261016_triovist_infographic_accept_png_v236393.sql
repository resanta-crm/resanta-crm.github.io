-- V2 exports PNG; V1 archives remain ZIP. Do not make bucket public.
UPDATE storage.buckets
SET allowed_mime_types=ARRAY['application/zip','image/png']::text[]
WHERE id='triovist-infographic-archives'
  AND allowed_mime_types=ARRAY['application/zip']::text[];
