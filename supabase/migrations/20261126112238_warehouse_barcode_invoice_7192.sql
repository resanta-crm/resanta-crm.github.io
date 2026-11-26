-- Invoice 7192 (2026-11-26) pairs this EAN with the active Vitebsk SKU.
-- The October nomenclature and November 3 barcode file retain the retired 900 prefix.
-- Keep the original import evidence intact and correct the operational directory.
DO $fix$
DECLARE
  v_product text;
  v_existing_sku text;
BEGIN
  SELECT product_name INTO v_product
  FROM public.crm_promotion_catalog_v236215
  WHERE sku='73/1/3/37' AND in_full_catalog IS TRUE;

  IF v_product IS DISTINCT FROM 'Круг отрезной по металлу 180х2,5х22 мм Вихрь'
     OR EXISTS (SELECT 1 FROM public.crm_promotion_catalog_v236215
                WHERE sku='900/73/1/3/37' AND in_full_catalog IS TRUE)
     OR EXISTS (SELECT 1 FROM public.stock_balances
                WHERE sku='900/73/1/3/37' AND coalesce(qty_onhand,0)>0)
     OR EXISTS (SELECT 1 FROM public.warehouse_barcodes
                WHERE sku='73/1/3/37' AND active IS TRUE AND barcode<>'4606059023005') THEN
    RAISE EXCEPTION 'Unexpected catalog or stock for warehouse barcode 4606059023005';
  END IF;

  SELECT sku INTO v_existing_sku FROM public.warehouse_barcodes
  WHERE barcode='4606059023005' AND active IS TRUE FOR UPDATE;

  IF v_existing_sku='73/1/3/37' THEN
    RETURN;
  END IF;
  IF v_existing_sku IS DISTINCT FROM '900/73/1/3/37' THEN
    RAISE EXCEPTION 'Unexpected warehouse owner for barcode 4606059023005';
  END IF;

  UPDATE public.warehouse_barcodes
  SET sku='73/1/3/37', product=v_product,
      source='Счёт 1С №7192 от 26.11.2026', updated_at=now()
  WHERE barcode='4606059023005' AND sku='900/73/1/3/37' AND active IS TRUE;
END
$fix$;
