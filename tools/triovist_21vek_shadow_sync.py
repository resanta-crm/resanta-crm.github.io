#!/usr/bin/env python3
"""Shadow synchronization for the Resanta/Triovist 21vek parser prototype.

Safety contract:
- reads the current paid-parser snapshot only as a target registry/baseline;
- fetches canonical public 21vek product pages sequentially;
- writes ONLY to triovist_21vek_shadow_* tables;
- never writes triovist_content_*, AI tasks, plans, sales, stock, or CRM UI data.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests

from triovist_21vek_parser import parse_product, public_product_url

SUPABASE_URL=(os.environ["SUPABASE_URL"] or "").strip().rstrip("/")
SUPABASE_KEY=(os.environ["SUPABASE_KEY"] or "").strip()
LIMIT=max(1,int(os.environ.get("SHADOW_LIMIT","120")))
OFFSET=max(0,int(os.environ.get("SHADOW_OFFSET","0")))
DELAY=max(0.4,float(os.environ.get("SHADOW_DELAY_SECONDS","0.8")))
TIMEOUT=max(10,int(os.environ.get("SHADOW_HTTP_TIMEOUT","25")))
PARSER_VERSION="shadow-v0.4"
UA="ResantaCRM-21vekShadow/0.4 (+https://resanta-crm.by)"

BASELINE_FIELDS=[
    "price","description_present","warranty_present","product_rating",
    "review_count","question_count","photo_count","video_count","in_stock",
    "delivery_minsk_days"
]
COMPARE_MAP={
    "price":"price",
    "description_present":"description_present",
    "warranty_present":"warranty_present",
    "product_rating":"product_rating",
    "review_count":"review_count",
    "question_count":"question_count",
    "photo_count":"photo_count",
    "video_count":"video_count",
    "in_stock":"in_stock",
    "delivery_minsk_days":"delivery_minsk_days",
}

def api_headers(json_body: bool=False, prefer: str|None=None) -> dict[str,str]:
    h={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"}
    if json_body: h["Content-Type"]="application/json"
    if prefer: h["Prefer"]=prefer
    return h

def rest_get(table: str, params: dict[str,str], timeout: int=60) -> list[dict]:
    r=requests.get(f"{SUPABASE_URL}/rest/v1/{table}",headers=api_headers(),params=params,timeout=timeout)
    if r.status_code!=200:
        raise RuntimeError(f"GET {table}: {r.status_code} {r.text[:800]}")
    return r.json() or []

def rest_get_all(table: str, params: dict[str,str], page_size: int=900, timeout: int=90) -> list[dict]:
    out=[]
    offset=0
    while True:
        page_params=dict(params)
        page_params["limit"]=str(page_size)
        page_params["offset"]=str(offset)
        page=rest_get(table,page_params,timeout)
        out.extend(page)
        if len(page)<page_size:
            break
        offset+=len(page)
    return out

def rest_post(table: str, rows: list[dict]|dict, *, prefer: str="return=minimal", timeout: int=60) -> Any:
    r=requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(True,prefer),
        json=rows,timeout=timeout
    )
    if r.status_code not in (200,201,204):
        raise RuntimeError(f"POST {table}: {r.status_code} {r.text[:1000]}")
    if r.status_code==204 or not r.text.strip(): return None
    return r.json()

def rest_upsert(table: str, rows: list[dict], conflict: str, timeout: int=90) -> None:
    if not rows: return
    r=requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(True,"resolution=merge-duplicates,return=minimal"),
        params={"on_conflict":conflict},
        json=rows,timeout=timeout
    )
    if r.status_code not in (200,201,204):
        raise RuntimeError(f"UPSERT {table}: {r.status_code} {r.text[:1000]}")

def rest_patch(table: str, filt: dict[str,str], values: dict, timeout: int=60) -> None:
    r=requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(True,"return=minimal"),
        params=filt,json=values,timeout=timeout
    )
    if r.status_code not in (200,204):
        raise RuntimeError(f"PATCH {table}: {r.status_code} {r.text[:1000]}")

def current_targets() -> list[dict]:
    imports=rest_get("triovist_content_imports",{
        "is_current":"eq.true","status":"eq.complete",
        "select":"id,manager_email,manager_name,snapshot_date"
    })
    if not imports:
        raise RuntimeError("Не найдены текущие снимки платного парсера")
    result=[]
    select=(
        "manager_email,manager_name,card_key,sku,donor_article,product_name,category,subgroup,"
        "product_url,price,description_present,warranty_present,product_rating,review_count,"
        "question_count,photo_count,video_count,in_stock,delivery_minsk_days"
    )
    for imp in imports:
        rows=rest_get_all("triovist_content_cards",{
            "import_id":f"eq.{imp['id']}",
            "select":select
        },page_size=900,timeout=90)
        for x in rows:
            url=str(x.get("product_url") or "").strip()
            if not public_product_url(url):
                continue
            x["_baseline_snapshot_date"]=imp.get("snapshot_date")
            result.append(x)
    if not result:
        raise RuntimeError("В текущих снимках нет корректных публичных URL 21vek")
    # Stable hash sampling gives both managers/categories broad coverage without depending on row order.
    result.sort(key=lambda x: hashlib.sha256(
        (str(x.get("manager_email"))+"|"+str(x.get("sku"))+"|"+str(x.get("product_url"))).encode("utf-8")
    ).hexdigest())
    return result[OFFSET:OFFSET+LIMIT]

def baseline(row: dict) -> dict:
    return {k:row.get(k) for k in BASELINE_FIELDS} | {
        "snapshot_date":row.get("_baseline_snapshot_date")
    }

def equalish(a,b) -> bool:
    if a is None and b is None: return True
    if isinstance(a,(int,float)) and isinstance(b,(int,float)):
        return abs(float(a)-float(b))<0.005
    return a==b

def diff_paid(row: dict, card: dict) -> tuple[dict,list[str]]:
    out={}
    changed=[]
    for paid_key,new_key in COMPARE_MAP.items():
        a=row.get(paid_key); b=card.get(new_key)
        same=equalish(a,b)
        out[paid_key]={"paid":a,"own":b,"same":same}
        if not same: changed.append(paid_key)
    return out,changed

def snapshot_row(run_id: str, source: dict, parsed: dict|None, error: str|None=None) -> dict:
    b=baseline(source)
    if parsed is None:
        return {
          "run_id":run_id,"manager_email":source.get("manager_email") or "",
          "card_key":source.get("card_key") or ("url:"+source.get("product_url","")),
          "sku":source.get("sku"),"donor_article":source.get("donor_article"),
          "product_name":source.get("product_name"),"category":source.get("category"),
          "subgroup":source.get("subgroup"),"product_url":source.get("product_url"),
          "paid_baseline":b,"differences":{},"changed_fields":[],"parser_payload":{},
          "error_text":error[:2000] if error else "unknown error"
        }
    card=parsed["card"]; extra=parsed["extra"]
    differences,changed=diff_paid(source,card)
    warranty=extra.get("warranty") or {}
    return {
      "run_id":run_id,
      "manager_email":source.get("manager_email") or "",
      "card_key":source.get("card_key") or card.get("card_key") or ("url:"+source.get("product_url","")),
      "sku":source.get("sku") or card.get("sku"),
      "donor_article":card.get("donor_article") or source.get("donor_article"),
      "product_name":card.get("product_name") or source.get("product_name"),
      "category":source.get("category"),"subgroup":source.get("subgroup"),
      "product_url":source.get("product_url"),
      "current_price":card.get("price"),"base_price":extra.get("base_price"),
      "sale_price":extra.get("sale_price"),"discount":extra.get("discount"),
      "percent_discount":extra.get("percent_discount"),
      "sale_flag":bool(card.get("sale_flag")),
      "in_stock":card.get("in_stock"),
      "description_present":card.get("description_present"),
      "warranty_present":card.get("warranty_present"),
      "warranty_count":warranty.get("count"),"warranty_unit":warranty.get("unit"),
      "photo_count":card.get("photo_count"),"video_count":card.get("video_count"),
      "product_rating":card.get("product_rating"),"review_count":card.get("review_count"),
      "question_count":card.get("question_count"),"negative_reviews":card.get("negative_reviews"),
      "unanswered_questions":card.get("unanswered_questions"),
      "delivery_minsk_days":card.get("delivery_minsk_days"),
      "paid_baseline":b,"differences":differences,"changed_fields":changed,
      # Daily history stays compact. Full public payload is kept separately
      # as the latest current state per card.
      "parser_payload":{
        "brand":extra.get("brand"),
        "status_raw":extra.get("status_raw"),
        "parser_sources":extra.get("parser_sources")
      },
      "error_text":None
    }

def raw_current_row(run_id: str, source: dict, parsed: dict) -> dict:
    card=parsed["card"]; extra=parsed["extra"]
    return {
      "manager_email":source.get("manager_email") or "",
      "card_key":source.get("card_key") or card.get("card_key") or ("url:"+source.get("product_url","")),
      "run_id":run_id,
      "sku":source.get("sku") or card.get("sku"),
      "product_url":source.get("product_url"),
      "parser_version":PARSER_VERSION,
      "observed_at":datetime.now(timezone.utc).isoformat(),
      "parser_payload":{
        "brand":extra.get("brand"),
        "status_raw":extra.get("status_raw"),
        "base_price":extra.get("base_price"),
        "sale_price":extra.get("sale_price"),
        "discount":extra.get("discount"),
        "percent_discount":extra.get("percent_discount"),
        "warranty":extra.get("warranty"),
        "description_text":extra.get("description_text"),
        "gallery":extra.get("gallery"),
        "reviews":extra.get("reviews"),
        "questions":extra.get("questions"),
        "breadcrumbs":extra.get("breadcrumbs"),
        "parser_sources":extra.get("parser_sources")
      }
    }

def insert_run(target_count: int) -> str:
    rows=rest_post("triovist_21vek_shadow_runs",{
      "parser_version":PARSER_VERSION,"status":"running","requested_limit":LIMIT,
      "total_targets":target_count,
      "notes":{"mode":"shadow","source_registry":"current triovist_content_cards","offset":OFFSET,"production_cutover":False}
    },prefer="return=representation")
    if not rows or not rows[0].get("id"):
        raise RuntimeError("Не удалось создать shadow run")
    return rows[0]["id"]

def main() -> None:
    targets=current_targets()
    run_id=insert_run(len(targets))
    print(f"Shadow run {run_id}: targets={len(targets)} parser={PARSER_VERSION}",flush=True)
    success=0; errors=0; batch=[]; raw_batch=[]
    ses=requests.Session()
    ses.headers.update({"User-Agent":UA,"Accept":"text/html,application/xhtml+xml","Accept-Language":"ru-RU,ru;q=0.9"})
    try:
        for idx,target in enumerate(targets,1):
            parsed=None; err=None
            try:
                r=ses.get(target["product_url"],timeout=TIMEOUT,allow_redirects=True)
                if r.status_code!=200:
                    raise RuntimeError(f"HTTP {r.status_code}")
                parsed=parse_product(r.text,{
                    "url":target["product_url"],"sku":target.get("sku"),
                    "donor_article":target.get("donor_article"),
                    "name":target.get("product_name"),"category":target.get("category"),
                    "subgroup":target.get("subgroup")
                })
                success+=1
            except Exception as exc:
                errors+=1; err=str(exc)
            batch.append(snapshot_row(run_id,target,parsed,err))
            if parsed is not None:
                raw_batch.append(raw_current_row(run_id,target,parsed))
            print(f"[{idx}/{len(targets)}] {target.get('sku')} ok={err is None} {err or ''}",flush=True)
            if len(batch)>=25:
                rest_post("triovist_21vek_shadow_snapshots",batch,timeout=90)
                rest_upsert("triovist_21vek_shadow_raw_current",raw_batch,"manager_email,card_key",timeout=90)
                batch=[]; raw_batch=[]
            if idx<len(targets):
                time.sleep(DELAY)
        if batch:
            rest_post("triovist_21vek_shadow_snapshots",batch,timeout=90)
            rest_upsert("triovist_21vek_shadow_raw_current",raw_batch,"manager_email,card_key",timeout=90)
        status="complete" if errors==0 else ("partial" if success else "failed")
        rest_patch("triovist_21vek_shadow_runs",{"id":f"eq.{run_id}"},{
          "status":status,"success_count":success,"error_count":errors,
          "finished_at":datetime.now(timezone.utc).isoformat(),
          "notes":{
            "mode":"shadow","source_registry":"current triovist_content_cards",
            "offset":OFFSET,"production_cutover":False,"delay_seconds":DELAY,
            "result":"No working CRM tables were modified."
          }
        })
        print(f"Shadow complete: success={success} errors={errors}",flush=True)
        if success==0: raise SystemExit(2)
    except Exception as exc:
        try:
            rest_patch("triovist_21vek_shadow_runs",{"id":f"eq.{run_id}"},{
              "status":"failed","success_count":success,"error_count":errors+1,
              "finished_at":datetime.now(timezone.utc).isoformat(),
              "notes":{"fatal_error":str(exc)[:1500],"production_cutover":False}
            })
        except Exception:
            pass
        raise

if __name__=="__main__":
    main()
