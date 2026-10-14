#!/usr/bin/env python3
"""
RESANTA CRM v23.6.352 · lightweight competitor position watch.

Purpose:
- re-query the real 21vek default desktop ranking without re-fetching technical specs;
- track only competitors already present in the nightly full market contour;
- save a new observation for every attempt;
- never mark an old successful value as fresh after a failed request;
- exact depth: page 1 (1..60) + page 2 (61..120).

The nightly full parser remains the source of technical characteristics,
similarity and competitor discovery. This file only refreshes position/price/stock.
"""
from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict
from datetime import datetime, timezone

import requests

from triovist_21vek_market import (
    DELAY,
    HEADERS,
    OUR_BRANDS,
    is_our_brand,
    item_name,
    item_url,
    rest_get_all,
    rest_patch,
    rest_post,
    rest_upsert,
    search_meta,
    search_page,
    valid_price,
)

WATCH_VERSION = "market-position-watch-v1"
SOURCE = (os.environ.get("POSITION_WATCH_SOURCE") or "schedule").strip().lower()
if SOURCE not in {"schedule", "manual", "test"}:
    SOURCE = "schedule"
ONLY_SCOPE = (os.environ.get("POSITION_WATCH_SCOPE_KEY") or "").strip()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_scopes() -> list[dict]:
    params = {
        "select": "scope_key,source_subgroup,search_query,profile_key,enabled",
        "enabled": "eq.true",
        "order": "source_subgroup.asc",
    }
    if ONLY_SCOPE:
        params["scope_key"] = "eq." + ONLY_SCOPE
    return rest_get_all("triovist_market_scopes_v1", params, page_size=300)


def load_tracked() -> dict[str, list[dict]]:
    params = {
        "select": "scope_key,product_key,search_query,external_id,brand,model,product_url,current_price,in_stock",
        "order": "scope_key.asc,position.asc.nullslast,product_key.asc",
    }
    if ONLY_SCOPE:
        params["scope_key"] = "eq." + ONLY_SCOPE
    rows = rest_get_all("triovist_market_products_current_v1", params, page_size=900)
    out: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        out[str(row.get("scope_key") or "")].append(row)
    return out


def load_watch_current() -> dict[tuple[str, str], dict]:
    params = {"select": "*"}
    if ONLY_SCOPE:
        params["scope_key"] = "eq." + ONLY_SCOPE
    rows = rest_get_all("triovist_market_comp_position_current_v236352", params, page_size=900)
    return {
        (str(x.get("scope_key") or ""), str(x.get("product_key") or "")): x
        for x in rows
    }


def start_run(scope_count: int, tracked_count: int) -> str:
    rows = rest_post(
        "triovist_market_position_watch_runs_v236352",
        {
            "source": SOURCE,
            "status": "running",
            "scope_count": scope_count,
            "tracked_count": tracked_count,
            "notes": {
                "version": WATCH_VERSION,
                "scope_filter": ONLY_SCOPE or None,
                "contract": "fresh 21vek default desktop search; page1=1..60,page2=61..120",
                "technical_specs_untouched": True,
                "competitor_discovery_untouched": True,
            },
        },
        prefer="return=representation",
    )
    if not rows or not rows[0].get("id"):
        raise RuntimeError("cannot create position-watch run")
    return str(rows[0]["id"])


def product_key(item: dict, name: str, query: str, page: int, idx: int) -> tuple[str, str, dict]:
    meta = search_meta(item)
    url = item_url(item)
    key = meta.get("external_id") or (
        hashlib.sha1(url.encode("utf-8")).hexdigest()
        if url
        else hashlib.sha1(f"{query}|{name}|{page}|{idx}".encode("utf-8")).hexdigest()
    )
    return str(key), url, meta


def fetch_ranked_query(session: requests.Session, query: str) -> dict[str, dict]:
    d1 = search_page(session, query, 1, "", attempts=5)
    time.sleep(DELAY)
    sid = str(d1.get("searchId") or "")
    d2 = search_page(session, query, 2, sid, attempts=5)
    time.sleep(DELAY)

    found: dict[str, dict] = {}
    for page, data in ((1, d1), (2, d2)):
        products = data.get("products") or []
        for i, item in enumerate(products):
            name = item_name(item)
            key, url, meta = product_key(item, name, query, page, i)
            position = (page - 1) * 60 + i + 1
            # Position counts the raw 21vek ranking, including our own products.
            # We simply do not track our brands as competitors.
            if is_our_brand(item, name):
                continue
            if key in found:
                continue
            found[key] = {
                "product_key": key,
                "search_query": query,
                "external_id": meta.get("external_id"),
                "brand": meta.get("brand") or "",
                "model": name,
                "product_url": url,
                "position": position,
                "page_no": page,
                "current_price": valid_price(meta.get("price")),
                "in_stock": meta.get("in_stock"),
            }
    return found


def movement(old: dict | None, state: str, position: int | None) -> tuple[str, int | None, str]:
    if not old:
        return "new", None, utcnow()
    old_state = str(old.get("listing_state") or "")
    old_position = old.get("position")
    same = old_state == state and (
        (state == "outside_top120") or
        (state == "top120" and old_position == position)
    )
    if same:
        return str(old.get("movement") or "same"), 0 if state == "top120" else None, str(old.get("changed_at") or utcnow())
    if old_state == "outside_top120" and state == "top120":
        return "entered", None, utcnow()
    if old_state == "top120" and state == "outside_top120":
        return "exited", None, utcnow()
    if old_state == "outside_top120" and state == "outside_top120":
        return "outside", None, str(old.get("changed_at") or utcnow())
    if old_state == "top120" and state == "top120" and old_position is not None and position is not None:
        delta = int(old_position) - int(position)
        return ("up" if delta > 0 else "down" if delta < 0 else "same"), delta, utcnow() if delta else str(old.get("changed_at") or utcnow())
    return "new", None, utcnow()


def success_rows(
    run_id: str,
    scope_key: str,
    tracked: list[dict],
    query: str,
    found: dict[str, dict],
    current_map: dict[tuple[str, str], dict],
    observed: str,
) -> tuple[list[dict], list[dict]]:
    current_rows: list[dict] = []
    snapshots: list[dict] = []

    for tracked_row in tracked:
        tracked_query = str(tracked_row.get("search_query") or query).strip() or query
        if tracked_query != query:
            continue
        pk = str(tracked_row.get("product_key") or "")
        hit = found.get(pk)
        old = current_map.get((scope_key, pk))
        state = "top120" if hit else "outside_top120"
        pos = int(hit["position"]) if hit and hit.get("position") is not None else None
        move, delta, changed_at = movement(old, state, pos)

        brand = (hit or {}).get("brand") or tracked_row.get("brand") or (old or {}).get("brand")
        model = (hit or {}).get("model") or tracked_row.get("model") or (old or {}).get("model")
        product_url = (hit or {}).get("product_url") or tracked_row.get("product_url") or (old or {}).get("product_url")
        external_id = (hit or {}).get("external_id") or tracked_row.get("external_id") or (old or {}).get("external_id")

        row = {
            "scope_key": scope_key,
            "product_key": pk,
            "search_query": query,
            "brand": brand,
            "model": model,
            "product_url": product_url,
            "external_id": external_id,
            "position": pos,
            "page_no": (hit or {}).get("page_no"),
            "listing_state": state,
            # If a competitor is outside TOP-120, the search result no longer
            # exposes a fresh price/availability. Keep these NULL rather than
            # passing stale values off as current.
            "current_price": (hit or {}).get("current_price") if hit else None,
            "in_stock": (hit or {}).get("in_stock") if hit else None,
            "observed_at": observed,
            "previous_position": (old or {}).get("position"),
            "previous_state": (old or {}).get("listing_state"),
            "previous_observed_at": (old or {}).get("observed_at"),
            "position_delta": delta,
            "movement": move,
            "changed_at": changed_at,
            "last_attempt_at": observed,
            "last_attempt_status": "success",
            "last_error": None,
            "run_id": run_id,
            "updated_at": observed,
        }
        current_rows.append(row)
        current_map[(scope_key, pk)] = row

        snapshots.append({
            "run_id": run_id,
            "scope_key": scope_key,
            "product_key": pk,
            "search_query": query,
            "brand": brand,
            "model": model,
            "product_url": product_url,
            "external_id": external_id,
            "position": pos,
            "page_no": (hit or {}).get("page_no"),
            "listing_state": state,
            "current_price": (hit or {}).get("current_price") if hit else None,
            "in_stock": (hit or {}).get("in_stock") if hit else None,
            "observed_at": observed,
            "attempt_status": "success",
            "error_text": None,
            "source": SOURCE,
        })
    return current_rows, snapshots


def error_rows(
    run_id: str,
    scope_key: str,
    tracked: list[dict],
    query: str,
    current_map: dict[tuple[str, str], dict],
    observed: str,
    error: str,
) -> tuple[list[dict], list[dict]]:
    current_rows: list[dict] = []
    snapshots: list[dict] = []
    msg = error[:1200]

    for tracked_row in tracked:
        tracked_query = str(tracked_row.get("search_query") or query).strip() or query
        if tracked_query != query:
            continue
        pk = str(tracked_row.get("product_key") or "")
        old = current_map.get((scope_key, pk))
        # Current table represents the LAST SUCCESSFUL position. On failure we
        # only advance last_attempt_*; therefore stale data can never look fresh.
        if old:
            keep = dict(old)
            keep["last_attempt_at"] = observed
            keep["last_attempt_status"] = "error"
            keep["last_error"] = msg
            keep["updated_at"] = observed
            current_rows.append(keep)
            current_map[(scope_key, pk)] = keep

        snapshots.append({
            "run_id": run_id,
            "scope_key": scope_key,
            "product_key": pk,
            "search_query": query,
            "brand": tracked_row.get("brand"),
            "model": tracked_row.get("model"),
            "product_url": tracked_row.get("product_url"),
            "external_id": tracked_row.get("external_id"),
            "position": None,
            "page_no": None,
            "listing_state": None,
            "current_price": None,
            "in_stock": None,
            "observed_at": observed,
            "attempt_status": "error",
            "error_text": msg,
            "source": SOURCE,
        })
    return current_rows, snapshots


def main() -> None:
    scopes = load_scopes()
    tracked_by_scope = load_tracked()
    current_map = load_watch_current()
    tracked_count = sum(len(v) for v in tracked_by_scope.values())
    run_id = start_run(len(scopes), tracked_count)
    session = requests.Session()
    session.headers.update(HEADERS)

    query_count = success_count = error_count = 0
    notes: list[dict] = []

    try:
        for idx, scope in enumerate(scopes, 1):
            scope_key = str(scope.get("scope_key") or "")
            tracked = tracked_by_scope.get(scope_key) or []
            if not tracked:
                notes.append({"scope": scope_key, "tracked": 0, "status": "skipped"})
                continue

            grouped: dict[str, list[dict]] = defaultdict(list)
            fallback_query = str(scope.get("search_query") or "").strip()
            for row in tracked:
                q = str(row.get("search_query") or fallback_query).strip() or fallback_query
                if q:
                    grouped[q].append(row)

            scope_success = scope_errors = 0
            print(f"SCOPE [{idx}/{len(scopes)}] {scope_key}: tracked={len(tracked)} queries={len(grouped)}", flush=True)

            for query, group in grouped.items():
                query_count += 1
                observed = utcnow()
                try:
                    found = fetch_ranked_query(session, query)
                    cur, snaps = success_rows(run_id, scope_key, group, query, found, current_map, observed)
                    if cur:
                        rest_upsert("triovist_market_comp_position_current_v236352", cur, "scope_key,product_key")
                    if snaps:
                        rest_post("triovist_market_comp_position_snapshots_v236352", snaps)
                    success_count += len(snaps)
                    scope_success += len(snaps)
                    print(f"  OK query={query!r}: tracked={len(group)} found={sum(1 for x in group if str(x.get('product_key')) in found)}", flush=True)
                except Exception as exc:
                    msg = str(exc)
                    cur, snaps = error_rows(run_id, scope_key, group, query, current_map, observed, msg)
                    if cur:
                        rest_upsert("triovist_market_comp_position_current_v236352", cur, "scope_key,product_key")
                    if snaps:
                        rest_post("triovist_market_comp_position_snapshots_v236352", snaps)
                    error_count += len(snaps)
                    scope_errors += len(snaps)
                    print(f"  ERROR query={query!r}: {msg[:300]}", flush=True)

            notes.append({
                "scope": scope_key,
                "tracked": len(tracked),
                "queries": len(grouped),
                "success_observations": scope_success,
                "error_observations": scope_errors,
            })

        status = "complete" if error_count == 0 else ("partial" if success_count else "failed")
        rest_patch(
            "triovist_market_position_watch_runs_v236352",
            {"id": "eq." + run_id},
            {
                "status": status,
                "query_count": query_count,
                "success_count": success_count,
                "error_count": error_count,
                "finished_at": utcnow(),
                "notes": {
                    "version": WATCH_VERSION,
                    "scope_filter": ONLY_SCOPE or None,
                    "position_depth": 120,
                    "fresh_requests_only": True,
                    "stale_success_not_refreshed_on_error": True,
                    "scopes": notes,
                },
            },
        )
        print(f"DONE {status}: scopes={len(scopes)} queries={query_count} success={success_count} errors={error_count}", flush=True)
        if status == "failed":
            raise SystemExit(2)
    except Exception as exc:
        try:
            rest_patch(
                "triovist_market_position_watch_runs_v236352",
                {"id": "eq." + run_id},
                {
                    "status": "failed",
                    "query_count": query_count,
                    "success_count": success_count,
                    "error_count": max(error_count, 1),
                    "finished_at": utcnow(),
                    "notes": {
                        "version": WATCH_VERSION,
                        "fatal_error": str(exc)[:1800],
                        "scope_filter": ONLY_SCOPE or None,
                        "scopes": notes,
                    },
                },
            )
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
