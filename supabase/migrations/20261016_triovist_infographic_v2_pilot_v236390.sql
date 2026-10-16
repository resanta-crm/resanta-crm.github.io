-- Isolated infographic V2 image-generation pilots; no modifications to legacy batches.
CREATE TABLE IF NOT EXISTS public.triovist_infographic_v2_pilots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES auth.users(id),
 owner_email text NOT NULL,
 sku text NOT NULL CHECK (char_length(sku) BETWEEN 1 AND 80),
 product_name text NOT NULL,
 product_url text NOT NULL,
 group_name text NOT NULL,
 manager_email text,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','needs_review','approved','cancelled','failed')),
 stage text NOT NULL DEFAULT 'queued',
 completed_slides integer NOT NULL DEFAULT 0 CHECK (completed_slides BETWEEN 0 AND 8),
 total_slides integer NOT NULL DEFAULT 8 CHECK (total_slides=8),
 max_paid_images integer NOT NULL DEFAULT 8 CHECK (max_paid_images BETWEEN 1 AND 8),
 paid_images_started integer NOT NULL DEFAULT 0 CHECK (paid_images_started BETWEEN 0 AND 8),
 model text NOT NULL DEFAULT 'gpt-image-2.5-sunburst',
 source_image_url text,
 facts jsonb NOT NULL DEFAULT '[]'::jsonb,
 storyboard jsonb NOT NULL DEFAULT '[]'::jsonb,
 audit jsonb NOT NULL DEFAULT '{}'::jsonb,
 warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
 error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS triovist_infographic_v2_owner_idx
ON public.triovist_infographic_v2_pilots(owner_user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS triovist_infographic_v2_active_sku_idx
ON public.triovist_infographic_v2_pilots(owner_user_id,sku)
WHERE status IN ('queued','processing');
CREATE TABLE IF NOT EXISTS public.triovist_infographic_v2_slides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pilot_id uuid NOT NULL REFERENCES public.triovist_infographic_v2_pilots(id) ON DELETE CASCADE,
 slide_no integer NOT NULL CHECK (slide_no BETWEEN 1 AND 8),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','completed','failed')),
 scene_path text,
 final_path text,
 prompt text,
 factual_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
 error_message text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(pilot_id,slide_no)
);
ALTER TABLE public.triovist_infographic_v2_pilots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triovist_infographic_v2_slides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.triovist_infographic_v2_pilots FROM anon,authenticated;
REVOKE ALL ON public.triovist_infographic_v2_slides FROM anon,authenticated;
COMMENT ON TABLE public.triovist_infographic_v2_pilots IS '2026-10-16 isolated eight-slide AI scene generation pilot; service-role only, opt-in on one SKU, gated before mass release.';