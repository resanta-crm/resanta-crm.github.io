#!/usr/bin/env python3
"""21vek Search360: isolated, bounded, user-requested deep listing observer.

No writes to the existing card parser, TOP or market/competitor tables.
Public 21vek search only; no auth/cookie/CAPTCHA bypass.
"""
from __future__ import annotations
import math
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit, urljoin

import requests
import triovist_21vek_top_shadow as top

QUEUE="triovist_search360_requests_v1"
ROWS="triovist_search360_results_v1"
REGISTRY="triovist_21vek_top_current"
MAX_JOBS=max(1,min(3,int(os.environ.get("SEARCH360_JOBS_PER_RUN","2"))))
REQUEST_PAUSE=max(.5,float(os.environ.get("SEARCH360_PAGE_PAUSE_SECONDS","1.0")))
VERSION="search360-v1"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def compact(v: object) -> str:
    return " ".join(str(v or "").strip().split())


def item_name(item: dict) -> str:
    for key in ("name","title","productName","product_name"):
        v=item.get(key)
        if isinstance(v,str) and v.strip(): return compact(v)[:250]
        if isinstance(v,dict):
            x=v.get("name") or v.get("text") or v.get("value")
            if isinstance(x,str) and x.strip(): return compact(x)[:250]
    p=item.get("product")
    if isinstance(p,dict):return item_name(p)
    return ""


def product_url(item: dict) -> str | None:
    for key in ("url","link","productUrl","product_url","href"):
        v=item.get(key)
        if isinstance(v,dict):v=v.get("url")
        if not isinstance(v,str) or not v.strip():continue
        url=urljoin("https://www.21vek.by/",v.strip())
        parsed=urlsplit(url)
        if parsed.scheme=="https" and parsed.hostname in ("www.21vek.by","21vek.by"):
            return url[:900]
    return None


def brand_name(item: dict) -> str | None:
    for key in ("producer","brand"):
        value=item.get(key)
        if isinstance(value,dict):value=value.get("name")
        if isinstance(value,str) and value.strip():return compact(value)[:100]
    return None


def parse_first_text_suggestion(payload: object) -> tuple[str,str] | None:
    """Only use explicit textual suggestions in their supplied order.
    Never select a product/card/category suggestion as a keyword.
    """
    if isinstance(payload,list):
        entries=payload
        path="array"
    elif isinstance(payload,dict):
        entries=None;path=""
        for key in ("querySuggestions","textSuggestions","suggestedQueries","suggestions","queries"):
            v=payload.get(key)
            if isinstance(v,list):
                entries=v;path=key;break
        if entries is None:
            for key in ("data","result","payload"):
                v=payload.get(key)
                if isinstance(v,dict):
                    nested=parse_first_text_suggestion(v)
                    if nested:return (nested[0],key+"."+nested[1])
            return None
    else:return None
    for element in entries:
        if isinstance(element,str):term=element
        elif isinstance(element,dict):
            # Some services mix product/card suggestions into the same list.
            if str(element.get("type") or element.get("suggestionType") or "").lower() in (
                "product","item","card","category","catalog","brand"):
                continue
            if any(k in element for k in ("productId","product_id","productUrl","product_url")):
                continue
            term=element.get("query") or element.get("text") or element.get("phrase") or element.get("value")
            if not isinstance(term,str):continue
        else:continue
        term=compact(term)
        if 2<=len(term)<=120 and not term.startswith(("http://","https://")):
            return (term,path)
    return None


def trusted_suggest_endpoint() -> str | None:
    url=compact(os.environ.get("SEARCH360_SUGGEST_URL"))
    if not url:return None
    p=urlsplit(url)
    if p.scheme!="https" or p.hostname not in ("gate.21vek.by","www.21vek.by","21vek.by"):
        raise ValueError("Suggestion source is not a permitted 21vek HTTPS URL")
    if p.username or p.password or p.query or p.fragment:
        raise ValueError("Suggestion source must be a clean 21vek HTTPS endpoint")
    return url


def resolve_search_phrase(session: requests.Session, typed: str, fetch=None) -> tuple[str,str,str|None,str|None]:
    """Returns effective phrase, status, first suggestion, source.
    When the published autocomplete source is unavailable, the explicit input is
    used and marked unverified. Never invent the site's first suggestion.
    """
    typed=compact(typed)
    endpoint=trusted_suggest_endpoint()
    if not endpoint:
        return typed,"suggestion_unavailable",None,None
    try:
        if fetch is not None:
            data=fetch(endpoint,typed)
        else:
            time.sleep(REQUEST_PAUSE)
            method=os.environ.get("SEARCH360_SUGGEST_METHOD","GET").strip().upper()
            if method=="POST":
                response=session.post(endpoint,json={"query":typed},timeout=top.TIMEOUT)
            else:
                response=session.get(endpoint,params={"query":typed},timeout=top.TIMEOUT)
            if response.status_code in (403,429):
                raise RuntimeError("21vek suggestion request limited")
            response.raise_for_status()
            data=response.json()
        suggestion=parse_first_text_suggestion(data)
        if suggestion:
            return suggestion[0],"first_text_suggestion",suggestion[0],endpoint
        return typed,"suggestion_missing",None,endpoint
    except (requests.RequestException,RuntimeError,ValueError):
        return typed,"suggestion_unavailable",None,endpoint


def load_registry() -> dict[str,list[dict]]:
    rows=top.rest_get_all(REGISTRY,{"select":"manager_email,card_key,sku,donor_article,product_name,keyword,product_url"})
    by_donor: dict[str,list[dict]]={}
    for x in rows:
        donor=compact(x.get("donor_article"))
        if donor.isdigit():by_donor.setdefault(donor,[]).append(x)
    return by_donor


def collect_listing(req: dict, fetch_page=top.search_page,
                    suggestion=None, sleep=time.sleep) -> dict:
    phrase=compact(req.get("query_text"))
    if len(phrase)<2 or len(phrase)>120:raise ValueError("Invalid search phrase")
    depth=max(60,min(600,int(req.get("max_depth") or 600)))
    session=top.top_session()
    actual,state,suggest_text,suggest_source=(suggestion or resolve_search_phrase(session,phrase))
    first=fetch_page(session,actual,1,"")
    if not isinstance(first.get("products"),list):
        raise RuntimeError("21vek returned no valid first results page")
    total=int(first.get("total") or 0)
    if total<0:raise RuntimeError("21vek returned invalid product total")
    limit_pages=max(1,min(math.ceil(depth/60),math.ceil(total/60) if total else 1))
    first_id=str(first.get("searchId") or "")
    seen: dict[str,dict]={}
    incomplete_reason=None
    checked=0
    data=first
    for page in range(1,limit_pages+1):
        if page>1:
            sleep(REQUEST_PAUSE)
            try:
                data=fetch_page(session,actual,page,first_id)
                if not isinstance(data.get("products"),list):
                    raise RuntimeError(f"Page {page} has invalid products")
                if data.get("total") is not None and int(data.get("total"))!=total:
                    raise RuntimeError("Search total changed during pagination")
                first_id=str(data.get("searchId") or first_id)
            except Exception as exc:
                incomplete_reason="Page "+str(page)+": "+str(exc)[:200]
                break
        checked+=1
        products=data.get("products") or []
        if not products and total>0:
            incomplete_reason="Unexpected empty page "+str(page)
            break
        for ix,item in enumerate(products):
            pid=str(item.get("id") or "").strip()
            if not pid.isdigit():continue
            if pid in seen:
                # An unstable overlapping ranking must not claim a complete observation.
                incomplete_reason="21vek returned a duplicate product across ranking pages"
                break
            rank=(page-1)*60+ix+1
            if rank>depth:continue
            seen[pid]={
                "request_id":str(req["id"]),"product_id":pid,
                "product_name":item_name(item),"product_url":product_url(item),
                "brand":brand_name(item),"sku":None,"manager_email":None,
                "position":rank,"page_no":page,"position_state":"exact",
                "observed_at":utcnow()
            }
        if incomplete_reason:break
    return {"query_text":phrase,"resolved_query":actual,
            "suggestion_text":suggest_text,"suggestion_source":suggest_source,
            "suggestion_status":state,"search_total":total,
            "pages_checked":checked,"rows":list(seen.values()),
            "error_text":incomplete_reason,"status":"partial" if incomplete_reason else "complete"}


def annotate_our_skus(rows: list[dict], registry: dict[str,list[dict]]) -> None:
    for x in rows:
        owners=registry.get(x["product_id"]) or []
        if not owners:continue
        x["sku"]=", ".join(sorted({compact(o.get("sku")) for o in owners if o.get("sku")}))[:220]
        x["manager_email"]=", ".join(sorted({compact(o.get("manager_email")) for o in owners if o.get("manager_email")}))[:260]
        if not x.get("product_name"):
            x["product_name"]=compact(owners[0].get("product_name"))[:250]
        if not x.get("product_url"):
            x["product_url"]=product_url({"url":owners[0].get("product_url")})


def add_unseen_own_skus(record: dict, registry: dict[str,list[dict]]) -> None:
    """Distinguish exact rank from 'not in *checked* range' for this query.

    Only records from the same canonical keyword are eligible. Never carry a
    position across two different phrases or claim the product is absent on 21vek.
    """
    phrase=compact(record.get("query_text")).casefold()
    resolved=compact(record.get("resolved_query")).casefold()
    keys={phrase,resolved}
    existing={str(x["product_id"]) for x in record["rows"]}
    max_checked=(record.get("pages_checked") or 0)*60
    if max_checked<60:return
    for pid,owners in registry.items():
        if pid in existing:continue
        matching=[x for x in owners if compact(x.get("keyword")).casefold() in keys]
        if not matching:continue
        first=matching[0]
        record["rows"].append({
            "request_id":str(record["request_id"]),"product_id":pid,
            "product_name":compact(first.get("product_name"))[:250],
            "product_url":product_url({"url":first.get("product_url")}),
            "brand":None,
            "sku":", ".join(sorted({compact(x.get("sku")) for x in matching if x.get("sku")}))[:220],
            "manager_email":", ".join(sorted({compact(x.get("manager_email")) for x in matching if x.get("manager_email")}))[:260],
            "position":None,"page_no":None,"position_state":"not_found_within_checked",
            "observed_at":utcnow()
        })
        existing.add(pid)


def run_one(req: dict, registry: dict[str,list[dict]]) -> dict:
    rid=str(req["id"])
    # Atomic claim with a conditional status predicate; concurrent Actions cannot
    # overwrite each other's work. Workflow also uses concurrency group.
    claim=requests.patch(
        f"{top.SUPABASE_URL}/rest/v1/{QUEUE}",
        headers=top.api_headers(True,"return=representation"),
        params={"id":"eq."+rid,"status":"eq.queued"},
        json={"status":"running","started_at":utcnow()},
        timeout=20
    )
    claim.raise_for_status()
    if len(claim.json() or [])!=1:return {"id":rid,"status":"already_claimed"}
    try:
        record=collect_listing(req)
        annotate_our_skus(record["rows"],registry)
        record["request_id"]=rid
        add_unseen_own_skus(record,registry)
        for start in range(0,len(record["rows"]),80):
            top.rest_post(ROWS,record["rows"][start:start+80])
        patch={k:record.get(k) for k in (
            "resolved_query","suggestion_text","suggestion_source","suggestion_status",
            "search_total","pages_checked","error_text")}
        patch.update({"status":record["status"],"rows_found":len(record["rows"]),
                      "finished_at":utcnow()})
        top.rest_patch(QUEUE,{"id":"eq."+rid},patch)
        return {"id":rid,"status":record["status"],"rows":len(record["rows"]),
                "pages":record["pages_checked"],"suggestion":record["suggestion_status"]}
    except Exception as exc:
        message=str(exc)[:700]
        top.rest_patch(QUEUE,{"id":"eq."+rid},{
            "status":"failed","error_text":message,"finished_at":utcnow()})
        throttled=any(word in message.lower() for word in ('429','captcha','403','rate limit'))
        return {"id":rid,"status":"failed","reason":type(exc).__name__,"throttled":throttled}


def run() -> list[dict]:
    # Do not compete with full production card collection.
    try:
        active=top.rest_get('triovist_21vek_shadow_runs',{
            'select':'id','status':'eq.running','started_at':'gte.'+datetime.fromtimestamp(
                datetime.now(timezone.utc).timestamp()-7200,timezone.utc).isoformat(),'limit':'1'})
        if active:
            print('Search360 queued safely: full 21vek parser currently active',flush=True)
            return []
    except Exception:
        # Safety-first: if full-parser state cannot be verified, defer own scans.
        print('Search360 deferred: cannot verify the full-parser status',flush=True)
        return []
    pending=top.rest_get(QUEUE,{"select":"*","status":"eq.queued",
                                "order":"requested_at.asc","limit":str(MAX_JOBS)})
    if not pending:return []
    registry=load_registry()
    outcomes=[]
    for req in pending:
        outcome=run_one(req,registry)
        outcomes.append(outcome)
        print("Search360",outcome,flush=True)
        time.sleep(REQUEST_PAUSE)
        if outcome.get('throttled'):
            print('Search360 stopped due to 21vek access/rate limit',flush=True)
            break
    return outcomes


if __name__=="__main__":
    run()
