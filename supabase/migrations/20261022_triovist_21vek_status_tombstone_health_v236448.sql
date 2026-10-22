-- 21vek control: distinguish an explicitly verified HTTP 404/410 tombstone
-- from a broken live price. A missing URL must not downgrade 1,723 healthy
-- cards into a red all-parser outage. No inventory, price, TOP, MRC or pointer
-- writes are performed. Existing actor authorization is unchanged.
DO $patch$
DECLARE
  fn text;
  k_decl text := '  v_nonpositive integer:=0;';
  k_select text := 'count(*) filter(where c.price is null or c.price<=0)::int,';
  k_into text := 'v_top30,v_top60,v_nonpositive,v_keyword_targets,';
  k_join text := '  join public.triovist_content_cards c on c.import_id=i.id' || E'\n' ||
                 '  where private.triovist_pointer_is_current_v236404(i.id)';
  k_health text := 'and v_nonpositive=0';
  k_result text := '''nonpositive_price'',v_nonpositive,';
  tombstone text := '(' ||
   'c.in_stock is false and s.in_stock is false and s.current_price is null ' ||
   'and s.error_text is null and ' ||
   '(s.parser_payload #>> ''{parser_sources,collection_status}'') in ' ||
   '(''unavailable_http_404'',''unavailable_http_410'')' || ')';
  p_select text;
BEGIN
  fn := pg_get_functiondef('public.triovist_21vek_status_v236107()'::regprocedure);
  IF position('v_live_price_issues integer' IN fn)>0 THEN
    RAISE NOTICE '21vek parser status tombstone guard already installed';
    RETURN;
  END IF;
  IF position(k_decl IN fn)=0 OR position(k_select IN fn)=0 OR
     position(k_into IN fn)=0 OR position(k_join IN fn)=0 OR
     position(k_health IN fn)=0 OR position(k_result IN fn)=0 THEN
    RAISE EXCEPTION '21vek status source changed; preserving original function';
  END IF;
  IF position(k_decl IN substring(fn FROM position(k_decl IN fn)+length(k_decl)))>0 OR
     position(k_select IN substring(fn FROM position(k_select IN fn)+length(k_select)))>0 OR
     position(k_join IN substring(fn FROM position(k_join IN fn)+length(k_join)))>0 OR
     position(k_result IN substring(fn FROM position(k_result IN fn)+length(k_result)))>0 THEN
    RAISE EXCEPTION '21vek status source ambiguous; preserving original function';
  END IF;
  fn:=replace(fn,k_decl,k_decl || E'\n' ||
         '  v_live_price_issues integer:=0;' || E'\n' ||
         '  v_verified_removed_urls integer:=0;');
  p_select := k_select || E'\n' ||
     '         count(*) filter(where (c.price is null or c.price<=0) and not ' ||
     tombstone || ')::int,' || E'\n' ||
     '         count(*) filter(where (c.price is null or c.price<=0) and ' ||
     tombstone || ')::int,';
  fn:=replace(fn,k_select,p_select);
  fn:=replace(fn,k_into,'v_top30,v_top60,v_nonpositive,v_live_price_issues,v_verified_removed_urls,v_keyword_targets,');
  fn:=replace(fn,k_join,
     '  join public.triovist_content_cards c on c.import_id=i.id' || E'\n' ||
     '  left join public.triovist_21vek_shadow_snapshots s' || E'\n' ||
     '    on s.manager_email=c.manager_email and s.card_key=c.card_key' || E'\n' ||
     '   and s.run_id::text=split_part(i.source_file,'':'',2)' || E'\n' ||
     '  where private.triovist_pointer_is_current_v236404(i.id)');
  fn:=replace(fn,k_health,'and v_live_price_issues=0');
  fn:=replace(fn,k_result,k_result || E'\n' ||
       '      ''blocking_price_issues'',v_live_price_issues,' || E'\n' ||
       '      ''verified_removed_urls'',v_verified_removed_urls,');
  EXECUTE fn;
  RAISE NOTICE '21vek status: retained real bad prices as red; ignored only verified no-price out-of-stock HTTP 404/410 tombstones';
END
$patch$;