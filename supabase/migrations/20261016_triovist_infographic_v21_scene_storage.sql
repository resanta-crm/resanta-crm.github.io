-- Enable retained JPEG source scenes for no-cost typography revisions; keep bucket private.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/zip','image/png','image/jpeg']::text[]
WHERE id='triovist-infographic-archives'
  AND allowed_mime_types @> ARRAY['application/zip','image/png']::text[]
  AND NOT (allowed_mime_types @> ARRAY['image/jpeg']::text[]);
