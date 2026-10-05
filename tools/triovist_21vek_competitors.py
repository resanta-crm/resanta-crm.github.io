#!/usr/bin/env python3
"""Triovist / 21vek competitor pilot.

Uses the existing public-page parser for core card fields and adds a narrowly
scoped specification layer for competitive comparison. No CAPTCHA/auth bypass.
Current good competitor data is preserved when a new run fails.

Pilot scope: cordless drill-drivers from triovist_competitor_targets where
collect_enabled=true. Price history is append-only in snapshots.
"""
from __future__ import annotations

import json
import math
import os
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from triovist_21vek_parser import parse_product, public_product_url

SUPABASE_URL=(os.environ["SUPABASE_URL"] or "").strip().rstrip("/")
SUPABASE_KEY=(os.environ["SUPABASE_KEY"] or "").strip()
PARSER_VERSION="competitors-v1.0"
SEARCH_ENDPOINT="https://gate.21vek.by/search-composer/api/v3/products"
UA="ResantaCRM-21vekCompetitors/1.0 (+https://resanta-crm.by)"
DELAY=max(0.25,float(os.environ.get("COMPETITOR_DELAY_SECONDS","0.45")))
TIMEOUT=max(10,int(os.environ.get("COMPETITOR_HTTP_TIMEOUT","30")))

HEADERS={
    "User-Agent":UA,
    "Accept":"text/html,application/xhtml+xml",
    "Accept-Language":"ru-RU,ru;q=0.9",
}
SEARCH_HEADERS={
    "User-Agent":UA,
    "Accept":"application/json, text/plain, */*",
    "Content-Type":"application/json",
    "Origin":"https://www.21vek.by",
    "Referer":"https://www.21vek.by/",
}

ALIASES={
    "voltage_v":["напряжение аккумулятора","номинальное напряжение","напряжение"],
    "battery_capacity_ah":["емкость аккумулятора","ёмкость аккумулятора","емкость акб","ёмкость акб"],
    "motor_type":["тип электродвигателя","тип двигателя"],
    "max_rpm":["макс. скорость вращения","максимальная скорость вращения","max число оборотов, об/мин","частота вращения","число оборотов холостого хода"],
    "torque_nm":["макс. крутящий момент","максимальный крутящий момент","max крутящий момент, нм","крутящий момент"],
    "wood_mm":["диам. сверления дерева","макс. диаметр сверления в древесине","максимальный диаметр сверления древесины","макс. диаметр сверления дерево"],
    "steel_mm":["диам. сверления стали","макс. диаметр сверления в стали","максимальный диаметр сверления металла","макс. диаметр сверления металл"],
    "weight_kg":["вес","масса, согласно процедуре ерта","масса, согласно процедуре epta","масса, кг"],
    "battery_count":["аккумулятор в комплекте","аккумуляторов в комплекте","аккумуляторная батарея 2 ач","аккумуляторная батарея 2,0 ач"],
    "chuck_mm":["диаметр зажима патрона","диаметр патрона, макс.","макс. диаметр патрона"],
    "case_included":["дополнительная комплектация","упаковка","кейс"],
}
WEIGHTS={
    "voltage_v":0.18,"torque_nm":0.24,"motor_type":0.12,"battery_capacity_ah":0.10,
    "battery_count":0.10,"max_rpm":0.08,"wood_mm":0.06,"steel_mm":0.05,
    "chuck_mm":0.03,"weight_kg":0.04,
}


def api_headers(json_body: bool=False, prefer: str|None=None) -> dict[str,str]:
    h={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"}
    if json_body:
        h["Content-Type"]="application/json"
    if prefer:
        h["Prefer"]=prefer
    return h


def rest_get(table: str, params: dict[str,str], timeout: int=60) -> list[dict]:
    r=requests.get(f"{SUPABASE_URL}/rest/v1/{table}",headers=api_headers(),params=params,timeout=timeout)
    if r.status_code!=200:
        raise RuntimeError(f"GET {table}: {r.status_code} {r.text[:1000]}")
    return r.json() or []


def rest_post(table: str, rows: list[dict]|dict, prefer: str="return=minimal", timeout: int=90) -> Any:
    if isinstance(rows,list) and rows:
        keys=set().union(*(x.keys() for x in rows))
        rows=[{k:x.get(k) for k in keys} for x in rows]
    r=requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(True,prefer),json=rows,timeout=timeout
    )
    if r.status_code not in (200,201,204):
        raise RuntimeError(f"POST {table}: {r.status_code} {r.text[:1200]}")
    if r.status_code==204 or not r.text.strip():
        return None
    return r.json()


def rest_upsert(table: str, rows: list[dict], conflict: str, timeout: int=90) -> None:
    if not rows:
        return
    r=requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(True,"resolution=merge-duplicates,return=minimal"),
        params={"on_conflict":conflict},json=rows,timeout=timeout
    )
    if r.status_code not in (200,201,204):
        raise RuntimeError(f"UPSERT {table}: {r.status_code} {r.text[:1200]}")


def rest_patch(table: str, filt: dict[str,str], values: dict, timeout: int=60) -> None:
    r=requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(True,"return=minimal"),params=filt,json=values,timeout=timeout
    )
    if r.status_code not in (200,204):
        raise RuntimeError(f"PATCH {table}: {r.status_code} {r.text[:1000]}")


def rest_delete(table: str, filt: dict[str,str], timeout: int=60) -> None:
    r=requests.delete(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(False,"return=minimal"),params=filt,timeout=timeout
    )
    if r.status_code not in (200,204):
        raise RuntimeError(f"DELETE {table}: {r.status_code} {r.text[:1000]}")


def norm(v: Any) -> str:
    s=str(v or "").strip().lower().replace("ё","е")
    s=re.sub(r"[^0-9a-zа-я]+"," ",s)
    return " ".join(s.split())


def nums(v: Any) -> list[float]:
    out=[]
    for x in re.findall(r"\d+(?:[.,]\d+)?",str(v or "")):
        try: out.append(float(x.replace(",",".")))
        except Exception: pass
    return out


def line_specs(html: str) -> list[dict]:
    """Extract known visible 21vek characteristics from rendered public HTML text."""
    soup=BeautifulSoup(html,"html.parser")
    lines=[re.sub(r"\s+"," ",x).strip() for x in soup.get_text("\n",strip=True).splitlines()]
    lines=[x for x in lines if x]
    alias_to_key={}
    for key,aliases in ALIASES.items():
        for a in aliases:
            alias_to_key[norm(a)]=key
    out=[]
    seen=set()
    heading_words={
        "основные характеристики","рабочие характеристики","размеры и вес","комплектация",
        "характеристики","описание","отзывы","обратите внимание"
    }
    for i,line in enumerate(lines):
        nl=norm(line)
        key=alias_to_key.get(nl)
        if not key:
            continue
        value=""
        for j in range(i+1,min(len(lines),i+5)):
            cand=lines[j].strip()
            nc=norm(cand)
            if not cand or nc in heading_words or nc in alias_to_key:
                continue
            value=cand
            break
        if value and (key,value) not in seen:
            out.append({"key":key,"label":line,"value":value,"source":"visible_html"})
            seen.add((key,value))
    return out


def normalize_specs(raw: list[dict], parsed: dict) -> dict:
    values={}
    for row in raw:
        key=row.get("key")
        text=str(row.get("value") or "")
        ns=nums(text)
        if key=="voltage_v" and ns:
            values[key]=max(ns)
        elif key=="battery_capacity_ah" and ns:
            v=max(ns)
            if re.search(r"ма\s*[·*]?\s*ч|mah",text.lower()):
                v/=1000.0
            values[key]=round(v,3)
        elif key=="motor_type":
            n=norm(text)
            values[key]="brushless" if "бесщет" in n else ("brushed" if "щет" in n else n[:80])
        elif key=="max_rpm" and ns:
            values[key]=max(ns)
        elif key=="torque_nm" and ns:
            values[key]=max(ns)
        elif key in ("wood_mm","steel_mm","chuck_mm") and ns:
            values[key]=max(ns)
        elif key=="weight_kg" and ns:
            v=max(ns)
            low=text.lower()
            if " г" in low and "кг" not in low:
                v/=1000.0
            values[key]=round(v,3)
        elif key=="battery_count":
            n=norm(text)
            if ns:
                # "2 Ач" is capacity, not count. Prefer explicit "шт" when present.
                m=re.search(r"(\d+)\s*шт",text.lower())
                if m: values[key]=int(m.group(1))
                elif "да" in n: values[key]=1
            elif "да" in n:
                values[key]=1
        elif key=="case_included":
            n=norm(text)
            values[key]=bool("кейс" in n or "чемод" in n or "систейнер" in n)

    extra=parsed.get("extra") or {}
    warranty=extra.get("warranty") or {}
    wc=warranty.get("count")
    wu=str(warranty.get("unit") or "").lower()
    try:
        if wc is not None:
            w=float(wc)
            if "month" in wu or "мес" in wu: w/=12.0
            values["warranty_years"]=round(w,2)
    except Exception:
        pass
    return values


def fetch_html(session: requests.Session, url: str) -> str:
    if not public_product_url(url):
        raise RuntimeError("only canonical public 21vek product URL is allowed")
    last=None
    for attempt in range(4):
        try:
            r=session.get(url,headers=HEADERS,timeout=TIMEOUT,allow_redirects=True)
            if r.status_code==200:
                return r.text
            last=RuntimeError(f"HTTP {r.status_code}")
            if r.status_code==429:
                retry=r.headers.get("Retry-After")
                time.sleep(min(30.0,max(2.0,float(retry))) if retry else 3.0*(attempt+1))
            elif r.status_code>=500:
                time.sleep(1.5*(attempt+1))
            else:
                raise last
        except (requests.Timeout,requests.ConnectionError) as exc:
            last=exc
            time.sleep(1.5*(attempt+1))
    raise last or RuntimeError("21vek fetch failed")


def flatten_strings(obj: Any, prefix: str="") -> list[tuple[str,str]]:
    out=[]
    if isinstance(obj,dict):
        for k,v in obj.items():
            p=f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v,(str,int,float)):
                out.append((p,str(v)))
            else:
                out.extend(flatten_strings(v,p))
    elif isinstance(obj,list):
        for i,v in enumerate(obj):
            out.extend(flatten_strings(v,f"{prefix}[{i}]"))
    return out


def item_name(item: dict) -> str:
    for k in ("name","title","productName","fullName"):
        if item.get(k): return str(item[k])
    for path,val in flatten_strings(item):
        if path.lower().endswith((".name",".title")) and len(val)>8:
            return val
    return ""


def item_url(item: dict) -> str:
    candidates=[]
    for path,val in flatten_strings(item):
        lp=path.lower()
        if any(x in lp for x in ("url","href","link")) and ".html" in val:
            candidates.append(val)
    for val in candidates:
        u=urljoin("https://www.21vek.by/",val)
        if public_product_url(u):
            return u
    return ""


def search_21vek(session: requests.Session, query: str) -> list[dict]:
    body={"query":query,"order":"default","page":1,"limit":60,"mode":"desktop","searchId":"","filters":[]}
    r=session.post(SEARCH_ENDPOINT,headers=SEARCH_HEADERS,json=body,timeout=TIMEOUT,allow_redirects=True)
    if r.status_code!=200:
        raise RuntimeError(f"21vek search HTTP {r.status_code}: {r.text[:300]}")
    data=r.json()
    rows=data.get("products") if isinstance(data,dict) else None
    if not isinstance(rows,list):
        raise RuntimeError("21vek search returned no products")
    return rows


GENERIC_WORDS={"аккумуляторная","дрель","шуруповерт","дрель-шуруповерт","в","комплекте","all1"}


def model_tokens(v: str) -> set[str]:
    return {x for x in norm(v).split() if len(x)>=3 and x not in GENERIC_WORDS}


def resolve_target(session: requests.Session, target: dict) -> tuple[str,dict]:
    existing=str(target.get("product_url") or "")
    if existing and public_product_url(existing):
        return existing,{"mode":"saved_url"}

    queries=[]
    if target.get("external_code"): queries.append(str(target["external_code"]))
    queries.append(str(target.get("product_query") or ""))
    best=None
    for query in queries:
        if not query: continue
        rows=search_21vek(session,query)
        qt=model_tokens(target.get("product_query") or "")
        brand=norm(target.get("competitor_brand"))
        code=norm(target.get("external_code"))
        for item in rows:
            blob=norm(json.dumps(item,ensure_ascii=False))
            name=item_name(item)
            url=item_url(item)
            if not url: continue
            nt=model_tokens(name)
            overlap=len(qt & nt)/(len(qt) or 1)
            score=overlap*100
            if brand and brand in blob: score+=35
            if code and code in blob: score+=220
            # Model-specific tokens are more important than generic category words.
            for tok in qt:
                if any(ch.isdigit() for ch in tok) and tok in nt:
                    score+=12
            cand=(score,url,item,name)
            if best is None or score>best[0]:
                best=cand
        if best and best[0]>=180:
            break
        time.sleep(DELAY)
    if not best or best[0]<60:
        raise RuntimeError("не удалось однозначно найти карточку 21vek")
    return best[1],{"mode":"search","score":round(best[0],1),"matched_name":best[3]}


def parse_card(session: requests.Session, url: str, item: dict) -> dict:
    html=fetch_html(session,url)
    parsed=parse_product(html,{
        "url":url,
        "sku":item.get("sku"),
        "donor_article":item.get("donor_article"),
        "name":item.get("product_name") or item.get("product_query"),
        "category":item.get("category"),
        "subgroup":item.get("subgroup"),
    })
    raw=line_specs(html)
    specs=normalize_specs(raw,parsed)
    return {"parsed":parsed,"specs_raw":raw,"specs":specs}


def numeric_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    return max(0.0,1.0-abs(a-b)/den)


def similarity(ours: dict, comp: dict) -> float:
    total=0.0
    used=0.0
    for key,w in WEIGHTS.items():
        a=ours.get(key); b=comp.get(key)
        if a is None or b is None:
            continue
        if key=="motor_type":
            s=1.0 if a==b else 0.65
        else:
            try: s=numeric_similarity(float(a),float(b))
            except Exception: continue
        total+=w*s; used+=w
    if used<=0:
        return 0.0
    score=(total/used)*100
    coverage=min(1.0,used/sum(WEIGHTS.values()))
    score*=0.85+0.15*coverage
    try:
        if abs(float(ours.get("voltage_v"))-float(comp.get("voltage_v")))>6:
            score=min(score,55)
    except Exception: pass
    try:
        x=float(ours.get("torque_nm")); y=float(comp.get("torque_nm"))
        if min(x,y)/max(x,y)<0.55:
            score=min(score,65)
    except Exception: pass
    return round(max(0,min(100,score)),2)


def directional_score(key: str,a: Any,b: Any) -> float|None:
    if a is None or b is None: return None
    if key=="motor_type":
        rank={"brushless":2,"brushed":1}
        if a==b: return 50.0
        return 80.0 if rank.get(a,0)>rank.get(b,0) else 20.0
    try:
        av=float(a); bv=float(b)
    except Exception:
        return None
    if key=="weight_kg":
        av,bv=bv,av
    if abs(av-bv)<1e-9: return 50.0
    rel=(av-bv)/max(abs(bv),1e-9)
    return max(0.0,min(100.0,50.0+rel*140.0))


def competitiveness(ours: dict,comp: dict,our_price: float|None,comp_price: float|None) -> float:
    if our_price and comp_price and comp_price>0:
        rel=(comp_price-our_price)/comp_price
        price_score=max(0,min(100,50+rel*300))
    else:
        price_score=50.0

    perf_weights={
        "torque_nm":0.32,"motor_type":0.20,"battery_capacity_ah":0.14,
        "battery_count":0.12,"max_rpm":0.10,"wood_mm":0.06,"steel_mm":0.06,
    }
    s=w=0.0
    for k,kw in perf_weights.items():
        z=directional_score(k,ours.get(k),comp.get(k))
        if z is not None:
            s+=z*kw; w+=kw
    perf=s/w if w else 50.0

    bundle=[]
    for k in ("warranty_years","weight_kg"):
        z=directional_score(k,ours.get(k),comp.get(k))
        if z is not None: bundle.append(z)
    if ours.get("case_included") is not None and comp.get("case_included") is not None:
        bundle.append(50 if ours.get("case_included")==comp.get("case_included") else (80 if ours.get("case_included") else 20))
    bundle_score=sum(bundle)/len(bundle) if bundle else 50.0
    return round(0.30*price_score+0.50*perf+0.20*bundle_score,2)


def fmt_num(v: Any,unit: str="") -> str:
    try:
        n=float(v)
        s=f"{n:.2f}".rstrip("0").rstrip(".").replace(".",",")
        return s+(f" {unit}" if unit else "")
    except Exception:
        return str(v)


def compare_texts(ours: dict,comp: dict,our_price: float|None,comp_price: float|None,mrc: float|None) -> tuple[list[str],list[str]]:
    adv=[]; bad=[]
    if our_price and comp_price:
        d=(comp_price-our_price)/comp_price*100
        if d>0.5: adv.append(f"Цена ниже конкурента на {d:.1f}%")
        elif d<-0.5: bad.append(f"Цена выше конкурента на {abs(d):.1f}%")
    pairs=[
      ("torque_nm","Крутящий момент","Н·м",True),
      ("max_rpm","Макс. обороты","об/мин",True),
      ("battery_capacity_ah","Ёмкость АКБ","А·ч",True),
      ("battery_count","АКБ в комплекте","шт.",True),
      ("wood_mm","Сверление дерева","мм",True),
      ("steel_mm","Сверление стали","мм",True),
      ("weight_kg","Вес","кг",False),
    ]
    for key,label,unit,higher in pairs:
        a=ours.get(key);b=comp.get(key)
        if a is None or b is None: continue
        try:
            av=float(a);bv=float(b)
        except Exception: continue
        if abs(av-bv)<1e-9: continue
        better=av>bv if higher else av<bv
        txt=f"{label}: {fmt_num(a,unit)} против {fmt_num(b,unit)}"
        (adv if better else bad).append(txt)
    ma,mb=ours.get("motor_type"),comp.get("motor_type")
    if ma and mb and ma!=mb:
        if ma=="brushless": adv.append("Бесщёточный двигатель против щёточного")
        elif mb=="brushless": bad.append("У конкурента бесщёточный двигатель")
    if mrc and our_price and our_price<mrc:
        bad.append(f"Цена ниже МРЦ на {(mrc-our_price)/mrc*100:.1f}%")
    return adv[:8],bad[:8]


def mrc_state(price: float|None,mrc: float|None) -> tuple[float|None,float|None,str]:
    if not price or not mrc or mrc<=0:
        return None,None,"unknown"
    db=price-mrc
    dp=db/mrc*100
    if dp>=0: st="ok"
    elif dp>=-2: st="slight"
    elif dp>=-5: st="warning"
    else: st="critical"
    return round(db,2),round(dp,2),st


def recommendation(our_price,comp_price,mrc,mrc_status,score,advantages,disadvantages) -> str:
    if mrc_status=="critical":
        return "Сначала восстановить МРЦ: текущая цена существенно ниже допустимого ориентира. Снижение цены не использовать как конкурентный инструмент."
    if mrc_status in ("slight","warning"):
        return "Проверить и восстановить цену до МРЦ. Конкурировать характеристиками и комплектацией, а не дальнейшим снижением."
    if our_price and comp_price and our_price>comp_price*1.05 and score<60:
        target=max(float(mrc or 0),float(comp_price))
        return f"Конкурент дешевле и технически не слабее. Рассмотреть цену около {target:.2f} BYN, но не ниже МРЦ."
    if score>=70:
        return "Цену снижать не требуется: использовать технические преимущества в карточке 21vek и в аргументации менеджеров."
    if disadvantages:
        return "Паритет по цене/характеристикам. Усилить карточку товара по слабым параметрам и контролировать цену конкурента."
    return "Сохранять текущую цену и мониторить изменения конкурента."


def load_pilot_targets() -> list[dict]:
    return rest_get("triovist_competitor_targets",{
        "collect_enabled":"eq.true",
        "select":"id,source_row,subgroup,competitor_brand,product_query,external_code,product_url,collect_enabled",
        "order":"competitor_brand.asc"
    })


def load_mrc() -> dict[str,dict]:
    rows=rest_get("triovist_mrc_current",{"select":"sku,product_name,mrc_byn,effective_date"})
    return {str(x.get("sku") or "").strip():x for x in rows if x.get("sku")}


def load_own_candidates(mrc: dict[str,dict]) -> list[dict]:
    rows=rest_get("triovist_21vek_registry_v236214",{
        "select":"sku,donor_article,product_name,category,subgroup,product_url",
        "subgroup":"eq.Шуруповерты, гайковерты",
        "limit":"500"
    })
    out=[]
    for x in rows:
        sku=str(x.get("sku") or "").strip()
        name=norm(x.get("product_name"))
        if sku in mrc and "дрель" in name and "шуруповерт" in name and x.get("product_url"):
            out.append(x)
    return out


def insert_run(target_count: int) -> str:
    rows=rest_post("triovist_competitor_runs",{
        "parser_version":PARSER_VERSION,"status":"running","target_count":target_count,
        "notes":{"scope":"pilot_cordless_drill_drivers","source":"public 21vek pages","production_parser_untouched":True}
    },prefer="return=representation")
    if not rows or not rows[0].get("id"):
        raise RuntimeError("could not create competitor run")
    return rows[0]["id"]


def finish_run(run_id: str,status: str,success: int,errors: int,notes: dict) -> None:
    rest_patch("triovist_competitor_runs",{"id":f"eq.{run_id}"},{
        "status":status,"success_count":success,"error_count":errors,
        "finished_at":datetime.now(timezone.utc).isoformat(),"notes":notes
    })


def main() -> None:
    targets=load_pilot_targets()
    if not targets:
        print("No enabled competitor targets",flush=True)
        return
    run_id=insert_run(len(targets))
    session=requests.Session()
    mrc=load_mrc()
    own_targets=load_own_candidates(mrc)
    print(f"Competitor run {run_id}: targets={len(targets)} own_candidates={len(own_targets)}",flush=True)

    own_cards=[]
    own_errors=[]
    for i,x in enumerate(own_targets,1):
        try:
            got=parse_card(session,x["product_url"],x)
            card=got["parsed"]["card"]
            own_cards.append({
                **x,
                "price":card.get("price"),
                "specs":got["specs"],
                "specs_raw":got["specs_raw"],
            })
            print(f"OWN [{i}/{len(own_targets)}] {x.get('sku')} specs={len(got['specs'])}",flush=True)
        except Exception as exc:
            own_errors.append({"sku":x.get("sku"),"error":str(exc)})
            print(f"OWN [{i}/{len(own_targets)}] {x.get('sku')} ERROR {exc}",flush=True)
        time.sleep(DELAY)

    success=0
    errors=0
    target_notes=[]
    for idx,t in enumerate(targets,1):
        observed=datetime.now(timezone.utc).isoformat()
        try:
            url,match_meta=resolve_target(session,t)
            rest_patch("triovist_competitor_targets",{"id":f"eq.{t['id']}"},{"product_url":url,"match_notes":json.dumps(match_meta,ensure_ascii=False),"updated_at":observed})
            got=parse_card(session,url,t)
            parsed=got["parsed"]; card=parsed["card"]; extra=parsed["extra"]
            snapshot={
                "run_id":run_id,"target_id":t["id"],"observed_at":observed,
                "external_code":t.get("external_code"),"product_url":url,
                "product_name":card.get("product_name") or t.get("product_query"),
                "current_price":card.get("price"),"base_price":extra.get("base_price"),
                "in_stock":card.get("in_stock"),"product_rating":card.get("product_rating"),
                "review_count":card.get("review_count"),"specs_raw":got["specs_raw"],
                "specs_normalized":got["specs"],
                "parser_payload":{"brand":extra.get("brand"),"warranty":extra.get("warranty"),"match":match_meta},
                "error_text":None,
            }
            rest_post("triovist_competitor_snapshots",snapshot)
            rest_upsert("triovist_competitor_current",[{
                k:v for k,v in snapshot.items() if k!="id"
            }],"target_id")

            analyses=[]
            for ours in own_cards:
                sim=similarity(ours["specs"],got["specs"])
                if sim<45:
                    continue
                our_price=float(ours["price"]) if ours.get("price") is not None else None
                comp_price=float(card["price"]) if card.get("price") is not None else None
                mr=float(mrc[ours["sku"]]["mrc_byn"]) if ours["sku"] in mrc else None
                mdb,mdp,mst=mrc_state(our_price,mr)
                pd=None; pp=None
                if our_price is not None and comp_price:
                    pd=round(our_price-comp_price,2)
                    pp=round((our_price-comp_price)/comp_price*100,2)
                comp_score=competitiveness(ours["specs"],got["specs"],our_price,comp_price)
                st="ours_stronger" if comp_score>=70 else ("parity" if comp_score>=55 else "competitor_stronger")
                adv,bad=compare_texts(ours["specs"],got["specs"],our_price,comp_price,mr)
                rec=recommendation(our_price,comp_price,mr,mst,comp_score,adv,bad)
                analyses.append({
                    "target_id":t["id"],"our_sku":ours["sku"],"our_product_name":ours.get("product_name"),
                    "our_product_url":ours.get("product_url"),"our_price":our_price,"mrc_byn":mr,
                    "mrc_delta_byn":mdb,"mrc_delta_pct":mdp,"competitor_price":comp_price,
                    "price_delta_byn":pd,"price_delta_pct":pp,"similarity_score":sim,
                    "competitiveness_score":comp_score,"status":st,"mrc_status":mst,
                    "our_specs":ours["specs"],"competitor_specs":got["specs"],
                    "advantages":adv,"disadvantages":bad,"recommendation":rec,
                    "sales_pitch":adv[:4],"computed_at":observed,
                })
            analyses.sort(key=lambda x:(x["similarity_score"],x["competitiveness_score"]),reverse=True)
            top=analyses[:5]
            rest_delete("triovist_competitor_analysis_current",{"target_id":f"eq.{t['id']}"})
            if top:
                rest_post("triovist_competitor_analysis_current",top)
            success+=1
            target_notes.append({"brand":t["competitor_brand"],"url":url,"price":card.get("price"),"specs":got["specs"],"matches":len(top)})
            print(f"COMP [{idx}/{len(targets)}] {t['competitor_brand']} price={card.get('price')} specs={len(got['specs'])} matches={len(top)}",flush=True)
        except Exception as exc:
            errors+=1
            rest_post("triovist_competitor_snapshots",{
                "run_id":run_id,"target_id":t["id"],"observed_at":observed,
                "external_code":t.get("external_code"),"product_url":t.get("product_url"),
                "product_name":t.get("product_query"),"specs_raw":[],"specs_normalized":{},
                "parser_payload":{},"error_text":str(exc)[:2000],
            })
            target_notes.append({"brand":t.get("competitor_brand"),"error":str(exc)})
            print(f"COMP [{idx}/{len(targets)}] {t.get('competitor_brand')} ERROR {exc}",flush=True)
        time.sleep(DELAY)

    status="complete" if errors==0 and success==len(targets) else ("partial" if success else "failed")
    finish_run(run_id,status,success,errors,{
        "pilot":"Дрели-шуруповерты аккумуляторные",
        "own_candidates":len(own_targets),"own_fetch_errors":own_errors[:20],
        "targets":target_notes,
        "mrc_source":"РБ МРЦ 06.10.2026.xlsx",
    })
    print(f"DONE {status}: competitors={success}/{len(targets)} errors={errors} own={len(own_cards)}/{len(own_targets)}",flush=True)
    if success==0:
        raise SystemExit(2)


if __name__=="__main__":
    main()
