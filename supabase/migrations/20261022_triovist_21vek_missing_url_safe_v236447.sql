-- Resanta CRM 21vek: preserve 404/410 tombstones without inventing a live price.
-- A confirmed vanished public product URL stays in the 1724-card registry;
-- only the unavailable card receives a NULL current price and in_stock=false.
-- Existing pointer publication/full-run/TOP completeness gates are unchanged.
DO $patch$
DECLARE
  fn text;
  old_expr text := 'coalesce(nullif(s.current_price,0),p.price),';
  new_expr text := 'case when coalesce(s.parser_payload #>> ''{parser_sources,collection_status}'','''') like ''unavailable_http_%'' then null else coalesce(nullif(s.current_price,0),p.price) end,';
BEGIN
  fn := pg_get_functiondef('public.triovist_21vek_stage_shadow_v236403(uuid,uuid,text)'::regprocedure);
  IF strpos(fn,new_expr)>0 THEN
    RAISE NOTICE '21vek vanished-url price guard already installed';
    RETURN;
  END IF;
  IF strpos(fn,old_expr)=0 THEN
    RAISE EXCEPTION 'Cannot safely patch changed Triovist staging function';
  END IF;
  IF strpos(substring(fn FROM strpos(fn,old_expr)+length(old_expr)),old_expr)>0 THEN
    RAISE EXCEPTION 'Ambiguous stale-price occurrence in Triovist staging function';
  END IF;
  EXECUTE replace(fn,old_expr,new_expr);
  RAISE NOTICE '21vek staging: vanished product URL cannot fall back to historical price';
END;
$patch$;
