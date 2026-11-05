#!/usr/bin/env python3
"""Hourly own-SKU ranking observer (depth 120); NEVER promotes daily 21vek snapshots.

Reads last *published* own keyword registry. Each hour checks a bounded, rotating
subset of keywords to avoid 21vek load spikes. A successful page 1/2 comparison
is recorded even when a product is not present (outside top120); HTTP errors
record no positional observation. Price/stock are optional search-result hints.
"""
from __future__ import annotations
import math
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

# Reuse the already-tested 21vek 60-per-page request and anti-429 backoff.
import triovist_21vek_top_shadow as top

BATCH = max(1, min(120, int(os.environ.get("OWN_HOURLY_KEYWORDS", "60"))))
PAUSE = max(.15, float(os.environ.get("OWN_HOURLY_PAUSE", ".5")))
RUNS = "triovist_own_hourly_runs_v1"
OBS = "triovist_own_hourly_observations_v1"
CURRENT = "triovist_21vek_top_current"

def group_targets(rows: list[dict]) -> list[tuple[str,list[dict]]]:
    groups: dict[str,list[dict]] = defaultdict(list)
    for row in rows:
        keyword = " ".join(str(row.get("keyword") or "").split())
        try: donor = int(str(row.get("donor_article") or ""))
        except (ValueError, TypeError): continue
        if not keyword or donor<=0: continue
        groups[keyword.casefold()].append({**row, "keyword":keyword, "donor_article":donor})
    return [(group[0]["keyword"],group) for _,group in sorted(groups.items())]

def batch_for_hour(groups: list[tuple[str,list[dict]]], hour: int,
                   per_hour: int=BATCH) -> list[tuple[str,list[dict]]]:
    if not groups: return []
    start=(hour*per_hour)%len(groups)
    size=min(per_hour,len(groups))
    return [groups[(start+i)%len(groups)] for i in range(size)]

def optional_search_price(item: dict) -> float|None:
    # Search UI fields are not stable. Do not invent missing price data.
    for key in ("saleprice","salePrice","currentprice","currentPrice","finalprice","finalPrice","price"):
        value=item.get(key)
        try:
            if isinstance(value,dict):
                value=value.get("value") or value.get("amount")
            num=float(value)
            if math.isfinite(num) and num>0: return num
        except (TypeError,ValueError): pass
    return None

def optional_search_stock(item: dict) -> bool|None:
    val=item.get("inStock")
    if isinstance(val,bool): return val
    val=item.get("available")
    if isinstance(val,bool): return val
    return None

def collect(keyword: str, targets: list[dict],
            fetch=top.search_page, session=None) -> tuple[list[dict],int]:
    # Do not mark an unsuccessful second-page lookup as outside TOP120.
    ses=session or top.top_session()
    first=fetch(ses,keyword,1,"")
    if not isinstance(first.get("products"),list): raise RuntimeError("No first page")
    found: dict[int,tuple[int,dict]]={}
    for idx,item in enumerate(first["products"]):
        try: pid=int(item.get("id"))
        except (TypeError,ValueError): continue
        found[pid]=(idx+1,item)
    request_count=1
    unresolved=any(x["donor_article"] not in found for x in targets)
    total=first.get("total")
    try: total=int(total) if total is not None else None
    except (TypeError,ValueError): total=None
    if unresolved and (total is None or total>60):
        second=fetch(ses,keyword,2,str(first.get("searchId") or ""))
        if not isinstance(second.get("products"),list): raise RuntimeError("No second page")
        request_count+=1
        for idx,item in enumerate(second["products"]):
            try: pid=int(item.get("id"))
            except (TypeError,ValueError): continue
            found.setdefault(pid,(idx+61,item))
    observed=datetime.now(timezone.utc).isoformat()
    rows=[]
    for x in targets:
        hit=found.get(x["donor_article"])
        position=hit[0] if hit else None
        if position is not None and not 1<=position<=120: raise RuntimeError("Invalid rank")
        item=hit[1] if hit else {}
        rows.append({
            "manager_email":x["manager_email"],"card_key":x["card_key"],
            "sku":x.get("sku"),"product_name":x.get("product_name"),
            "keyword":keyword,"position":position,"search_total":total,
            "observed_price":optional_search_price(item),
            "observed_stock":optional_search_stock(item),
            "observed_at":observed
        })
    return rows,request_count

def run(now: datetime|None=None) -> dict:
    now=now or datetime.now(timezone.utc)
    # Never compete with an active production daily collection.
    recent=(now.timestamp()-2*3600)
    cutoff=datetime.fromtimestamp(recent,timezone.utc).isoformat()
    active=top.rest_get('triovist_21vek_shadow_runs',{
        'select':'id','status':'eq.running','started_at':'gte.'+cutoff,'limit':'1'})
    if active:
        print('Own hourly watch skipped: daily 21vek full collection is active',flush=True)
        return {'status':'skipped','checked':0,'cards':0,'calls':0,'errors':0}
    hour=int(now.timestamp()//3600)
    registry=top.rest_get_all(CURRENT,{
        "select":"manager_email,card_key,sku,product_name,keyword,donor_article",
        "order":"manager_email.asc,card_key.asc"
    })
    groups=group_targets(registry)
    batch=batch_for_hour(groups,hour)
    if not batch: raise RuntimeError("Published own keyword registry is empty; skipping")
    payload={
        "status":"running","keywords_total":len(groups),"keywords_checked":0,
        "cards_checked":0,"request_count":0,"error_count":0,
        "note":f"bounded {len(batch)} keywords; rotating hourly; depth=120"
    }
    created=top.rest_post(RUNS,payload,"return=representation")
    if not created or not created[0].get("id"): raise RuntimeError("Cannot start hourly watch")
    run_id=created[0]["id"]
    successes=0;errors=0;cards=0;requests=0
    throttled=False
    try:
        for keyword,targets in batch:
            try:
                rows,calls=collect(keyword,targets)
                for row in rows: row["run_id"]=run_id
                # Bounded write batch, never touches the production TOP or cards.
                top.rest_upsert(OBS,rows,"run_id,manager_email,card_key")
                successes+=1;cards+=len(rows);requests+=calls
            except Exception as exc:
                errors+=1
                msg=str(exc)
                print(f"Hourly search failed for keyword {keyword[:80]!r}: {msg[:180]}",flush=True)
                if any(code in msg for code in ("HTTP 429","HTTP 403","captcha","CAPTCHA")):
                    throttled=True
                    break
            time.sleep(PAUSE)
        status="complete" if not errors and successes==len(batch) else ("partial" if successes else "failed")
        top.rest_patch(RUNS,{"id":f"eq.{run_id}"},{
            "status":status,"keywords_checked":successes,
            "cards_checked":cards,"request_count":requests,"error_count":errors,
            "finished_at":datetime.now(timezone.utc).isoformat(),
            "note":"Rate-limited, stopped early" if throttled else "Hourly bounded observation only"
        })
        print(f"21vek own hourly: status={status}, batch={len(batch)}, complete={successes}, cards={cards}, calls={requests}, errors={errors}",flush=True)
        return {"status":status,"checked":successes,"cards":cards,"calls":requests,"errors":errors}
    except Exception:
        try:
            top.rest_patch(RUNS,{"id":f"eq.{run_id}"},{
                "status":"failed","error_count":errors+1,
                "finished_at":datetime.now(timezone.utc).isoformat(),
                "note":"Watcher failed; daily production snapshot is unchanged"})
        except Exception: pass
        raise

if __name__=="__main__":
    result=run()
    if result["status"]=="failed": raise SystemExit(1)
