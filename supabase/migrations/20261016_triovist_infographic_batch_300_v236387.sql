-- Max 300 SKU across all selected groups. Ensures the UI/API cap is also enforced in Postgres.
ALTER TABLE public.triovist_infographic_batches_v1 ADD CONSTRAINT triovist_infographic_batches_300_sku_check CHECK (total_items BETWEEN 0 AND 300);
