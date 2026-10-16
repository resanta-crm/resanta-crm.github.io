-- RESANTA CRM v23.6.377
-- Centralize active Triovist competitor access through triovist_ui_context().
-- Fixes stale hardcoded manager emails and prevents future email-list drift.

create or replace function public.triovist_market_access_allowed_v236377()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $function$
declare
  c jsonb;
begin
  begin
    c := public.triovist_ui_context();
  exception when others then
    return false;
  end;
  return coalesce((c->>'is_leader')::boolean,false)
      or coalesce((c->>'is_manager')::boolean,false);
end;
$function$;

revoke all on function public.triovist_market_access_allowed_v236377() from public, anon;
grant execute on function public.triovist_market_access_allowed_v236377() to authenticated, service_role;

do $do$
declare
  r record;
  d text;
  nd text;
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'triovist_market_dashboard_meta_v236357',
        'triovist_market_state_counts_v236369',
        'triovist_market_dashboard_scope_v236357',
        'triovist_market_own_listing_scope_v236357',
        'triovist_market_competitor_history_scope_v236357',
        'triovist_market_competitor_positions_v236352',
        'triovist_market_competitor_position_history_v236352',
        'triovist_market_competitor_detail_v236306',
        'triovist_market_export_v236343'
      )
  loop
    d := pg_get_functiondef(r.oid);
    nd := regexp_replace(
      regexp_replace(
        d,
        '(if[[:space:]]+)(a|v_actor)\.actor_email[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+\2\.actor_email[[:space:]]+not[[:space:]]+in[[:space:]]*\([^)]*\)',
        '\1not public.triovist_market_access_allowed_v236377()',
        'i'
      ),
      '(if[[:space:]]+)v_email[[:space:]]+not[[:space:]]+in[[:space:]]*\([^)]*\)',
      '\1not public.triovist_market_access_allowed_v236377()',
      'i'
    );

    -- Idempotent: already migrated definitions are left untouched.
    if nd <> d then
      execute nd;
    end if;
  end loop;
end;
$do$;
