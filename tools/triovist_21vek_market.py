#!/usr/bin/env python3
"""Triovist / 21vek automatic market analysis v23.6.260.

Separate contour from the production own-card parser.
- scope comes from the current Resanta price matrix, not from a manual competitor list;
- first two 21vek search ranking pages (60 + 60) are collected with exact position;
- our brands are excluded from competitor market rows;
- technical characteristics are normalized by configurable DB rules;
- full specs are cached and refreshed only when needed; price/position snapshots are append-only;
- missing characteristics are never treated as zero;
- no CAPTCHA/auth bypass and no cookie reuse.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from triovist_21vek_parser import next_state, parse_product, public_product_url

SUPABASE_URL=os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY=os.environ["SUPABASE_KEY"].strip()
PARSER_VERSION="market-auto-v1.9"
RULESET_VERSION="rules-v5"
SEARCH_ENDPOINT="https://gate.21vek.by/search-composer/api/v3/products"
UA="ResantaCRM-21vekMarket/1.0 (+https://resanta-crm.by)"
DELAY=max(0.10,float(os.environ.get("MARKET_DELAY_SECONDS","0.22")))
TIMEOUT=max(10,int(os.environ.get("MARKET_HTTP_TIMEOUT","30")))
SPEC_TTL_DAYS=max(1,int(os.environ.get("MARKET_SPEC_TTL_DAYS","30")))
VALIDATE_PROFILES={
    x.strip() for x in os.environ.get("MARKET_VALIDATE_PROFILES","").split(",") if x.strip()
}
OUR_BRANDS={"resanta","ресанта","huter","вихрь","vikhr","eurolux"}

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


def api_headers(json_body: bool=False, prefer: str|None=None) -> dict[str,str]:
    h={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"}
    if json_body: h["Content-Type"]="application/json"
    if prefer: h["Prefer"]=prefer
    return h


def rest_get(table: str, params: dict[str,str], timeout: int=90) -> list[dict]:
    r=requests.get(f"{SUPABASE_URL}/rest/v1/{table}",headers=api_headers(),params=params,timeout=timeout)
    if r.status_code!=200:
        raise RuntimeError(f"GET {table}: {r.status_code} {r.text[:900]}")
    return r.json() or []


def rest_get_all(table: str, params: dict[str,str], page_size: int=800, timeout: int=90) -> list[dict]:
    out=[];offset=0
    while True:
        p=dict(params);p["limit"]=str(page_size);p["offset"]=str(offset)
        rows=rest_get(table,p,timeout)
        out.extend(rows)
        if len(rows)<page_size: return out
        offset+=len(rows)


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
    return None if r.status_code==204 or not r.text.strip() else r.json()


def rest_upsert(table: str, rows: list[dict], conflict: str, timeout: int=90) -> None:
    if not rows: return
    keys=set().union(*(x.keys() for x in rows))
    payload=[{k:x.get(k) for k in keys} for x in rows]
    r=requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=api_headers(True,"resolution=merge-duplicates,return=minimal"),
        params={"on_conflict":conflict},json=payload,timeout=timeout
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
    s=re.sub(r"[^0-9a-zа-я./]+"," ",s)
    return " ".join(s.split())


def clean_label(v: str) -> str:
    s=re.sub(r"\b(?:resanta|ресанта|huter|вихрь|vikhr|eurolux)\b"," ",str(v or ""),flags=re.I)
    s=re.sub(r"\s+"," ",s).strip(" ,.;:-")
    return s


def url_key(v: str) -> str:
    return str(v or "").strip().split("?",1)[0].split("#",1)[0].rstrip("/").lower()


def product_name_key(v: str) -> str:
    s=re.sub(r"\(\s*\d+(?:/\d+){1,3}\s*\)\s*$"," ",str(v or ""))
    return norm(s)


def sku_depth(sku: str) -> int:
    return len([x for x in str(sku or "").split("/") if x])


def sku_prefix2(sku: str) -> str:
    p=[x for x in str(sku or "").split("/") if x]
    return "/".join(p[:2]) if len(p)>=2 else str(sku or "")


def profile_for(label: str) -> str:
    n=norm(label)
    if "конвектор" in n: return "convector"
    if "маслян" in n and "радиатор" in n: return "oil_radiator"
    if "тепловент" in n: return "fan_heater"
    if "теплов" in n and "пуш" in n: return "heat_gun"
    if "теплов" in n and "завес" in n: return "heat_curtain"
    if "инфракрас" in n: return "infrared_heater"
    if "увлажн" in n: return "humidifier"
    if "ламп" in n or "led" in n: return "led_lamp"
    if "бензопил" in n: return "chainsaw_gas"
    if "электропил" in n or "электрическ" in n and "пил" in n: return "chainsaw_electric"
    return "generic"


def query_for(label: str, profile: str) -> str:
    q={
      "convector":"конвектор",
      "oil_radiator":"масляный радиатор",
      "fan_heater":"тепловентилятор",
      "heat_gun":"тепловая пушка",
      "heat_curtain":"тепловая завеса",
      "infrared_heater":"инфракрасный обогреватель",
      "humidifier":"увлажнитель воздуха",
      "led_lamp":"светодиодная лампа",
      "chainsaw_gas":"бензопила",
      "chainsaw_electric":"электропила",
    }.get(profile)
    return q or clean_label(label)


def scope_key(profile: str, query: str) -> str:
    return profile+"-"+hashlib.sha1(norm(query).encode("utf-8")).hexdigest()[:8]


def load_price_scope() -> tuple[list[dict],dict[str,set[str]]]:
    climate=rest_get_all("price_list",{
      "category":"eq.Климатическое оборудование",
      "select":"sku,product,category,subgroup,uploaded_at"
    },page_size=800)
    garden=rest_get_all("price_list",{
      "category":"eq.Садовая техника",
      "select":"sku,product,category,subgroup,uploaded_at"
    },page_size=800)

    headers={}
    for x in climate:
        sku=str(x.get("sku") or "")
        if sku_depth(sku)==2:
            headers[sku]=clean_label(str(x.get("product") or ""))

    groups: dict[tuple[str,str],dict]={}
    own: dict[str,set[str]]=defaultdict(set)
    for prefix,label in headers.items():
        children=[x for x in climate if sku_depth(str(x.get("sku") or ""))>=3 and sku_prefix2(str(x.get("sku") or ""))==prefix]
        if not children: continue
        profile=profile_for(label)
        if profile=="generic": continue
        query=query_for(label,profile)
        key=scope_key(profile,query)
        if key not in groups:
            groups[key]={
              "scope_key":key,"source_category":"Климатическое оборудование",
              "source_subgroup":clean_label(label),"source_prefix":prefix,
              "search_query":query,"profile_key":profile,"enabled":True,
              "own_sku_count":0,"derived_from_price_at":datetime.now(timezone.utc).isoformat(),
              "updated_at":datetime.now(timezone.utc).isoformat(),
            }
        else:
            # E.g. LED lamps may have separate brand-family headers in the price file.
            groups[key]["source_prefix"]+=","+prefix
        for x in children:
            sku=str(x.get("sku") or "").strip()
            if sku: own[key].add(sku)

    for label,profile,needle in [
      ("Бензопилы","chainsaw_gas","бензопил"),
      ("Электропилы","chainsaw_electric","электропил"),
    ]:
        query=query_for(label,profile);key=scope_key(profile,query)
        skus={
          str(x.get("sku") or "").strip() for x in garden
          if sku_depth(str(x.get("sku") or ""))>=3 and needle in norm(x.get("product"))
        }
        if skus:
            groups[key]={
              "scope_key":key,"source_category":"Садовая техника","source_subgroup":label,
              "source_prefix":None,"search_query":query,"profile_key":profile,"enabled":True,
              "own_sku_count":len(skus),"derived_from_price_at":datetime.now(timezone.utc).isoformat(),
              "updated_at":datetime.now(timezone.utc).isoformat(),
            }
            own[key].update(skus)

    for key,g in groups.items():
        g["own_sku_count"]=len(own[key])

    scopes=list(groups.values())
    scopes.sort(key=lambda x:(x["source_category"],x["source_subgroup"]))
    if VALIDATE_PROFILES:
        scopes=[x for x in scopes if x["profile_key"] in VALIDATE_PROFILES]
        own={k:v for k,v in own.items() if any(s["scope_key"]==k for s in scopes)}
    return scopes,own


def load_rules(profile: str) -> list[dict]:
    return rest_get("triovist_market_rules_v1",{
      "profile_key":"eq."+profile,
      "select":"spec_key,label,weight,direction,unit,aliases,critical",
      "order":"weight.desc"
    })


def alias_map(rules: list[dict]) -> dict[str,str]:
    out={}
    for r in rules:
        for a in r.get("aliases") or []:
            out[norm(a)]=r["spec_key"]
    return out


def nums(v: Any) -> list[float]:
    out=[]
    for x in re.findall(r"\d+(?:[.,]\d+)?",str(v or "")):
        try: out.append(float(x.replace(",",".")))
        except Exception: pass
    return out


def valid_price(v: Any) -> float|None:
    try:
        n=float(v)
        return n if math.isfinite(n) and n>0 else None
    except Exception:
        return None


def parse_fraction(text: str) -> float|None:
    m=re.search(r"(\d+)\s*/\s*(\d+)",text)
    if m and float(m.group(2)):
        return float(m.group(1))/float(m.group(2))
    ns=nums(text)
    return ns[0] if ns else None


def bool_value(text: str) -> bool|None:
    n=norm(text)
    if any(x in n for x in ("нет","отсутств","не предусмотр")): return False
    if any(x in n for x in ("да","есть","предусмотр","имеется")): return True
    return None


def presence_value(text: str) -> bool|None:
    n=norm(text)
    if not n or n in ("неизвестно","нет данных","n a","—","-"): return None
    if any(x in n for x in ("нет","отсутств","не предусмотр")): return False
    if any(x in n for x in ("да","есть","предусмотр","имеется")): return True
    # For an explicit characteristic, a meaningful non-empty value such as
    # "электронная", "плавная" or "LED" means the feature is present.
    return True


def infrared_energy_type(name: str,specs: dict|None=None,raw: list[dict]|None=None) -> str|None:
    specs=specs or {};raw=raw or []
    text=" ".join([
      str(name or ""),
      str(specs.get("energy_type") or ""),
      str(specs.get("fuel_type") or ""),
      " ".join(str(x.get("value") or "") for x in raw if isinstance(x,dict))
    ])
    n=norm(text)
    if any(x in n for x in ("газов","пропан","бутан","сжиженн газ","баллон")): return "gas"
    if any(x in n for x in ("электр","220","230","380","400","кварц","карбон","галоген","тэн")): return "electric"
    # In the 21vek infrared-heater search the non-gas items are electric;
    # keep unknown only when the title itself is not an infrared heater.
    if "инфракрас" in n: return "electric"
    return None


def infrared_heater_family(v: Any) -> str:
    n=norm(v)
    if "кварц" in n:return "quartz"
    if "карбон" in n or "углерод" in n:return "carbon"
    if "галоген" in n:return "halogen"
    if "керами" in n:return "ceramic"
    if "тэн" in n or "трубчат" in n:return "ten"
    return n


def infrared_install_tokens(v: Any) -> set[str]:
    n=norm(v);out=set()
    if "универс" in n: out.update(("wall","floor","ceiling"))
    if "настен" in n: out.add("wall")
    if "наполь" in n: out.add("floor")
    if "потол" in n: out.add("ceiling")
    return out


def thermostat_present(v: Any) -> bool|None:
    if v is None:return None
    n=norm(v)
    if not n:return None
    if any(x in n for x in ("нет","отсутств","не предусмотр")):return False
    return True


def voltage_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    if 200<=n<=250:return "single"
    if 360<=n<=420:return "three"
    return str(round(n,1))


def normalize_value(key: str, text: str) -> Any:
    low=str(text or "").lower();ns=nums(text)
    if key=="energy_type":
        n=norm(text)
        if any(x in n for x in ("газов","пропан","бутан","сжиженн газ")): return "gas"
        if any(x in n for x in ("электр","220","230","380","400")): return "electric"
        return n[:80] or None
    if key in ("device_type","heater_type","thermostat_type","control_type","ip_rating","installation_type","fuel_type","motor_position","bulb_shape","equipment"):
        return norm(text)[:240] or None
    if key=="base_type":
        m=re.search(r"\b(?:e|gu|gx|g)\s*\d+(?:[.]\d+)?\b",low,re.I)
        return re.sub(r"\s+","",m.group(0)).upper() if m else (norm(text)[:40] or None)
    if key in ("display_present","power_adjustment","temperature_adjustment","wheels_present","remote_control","fan_present","fan_only_mode","indicator_light"):
        return presence_value(text)
    if key in ("overheat_protection","humidistat","tool_free_tension"):
        return bool_value(text)
    if key=="chain_pitch_in":
        return parse_fraction(low)
    if not ns: return None
    if key=="power_modes":
        # 21vek may encode modes as "2 режима", "1000/2000 Вт" or
        # "500 Вт, 1000 Вт". These are two modes, not 1000/2000 modes.
        m=re.search(r"(\d+)\s*(?:режим|ступен)",low)
        if m:
            n=int(m.group(1))
            return n if 1<=n<=10 else None
        small=[int(x) for x in ns if float(x).is_integer() and 1<=x<=10]
        if small: return max(small)
        levels=[]
        for x in ns:
            if x>=20 and x not in levels: levels.append(x)
        if 2<=len(levels)<=6 and ("/" in low or "," in low or ";" in low):
            return len(levels)
        return None
    v=max(ns)
    if key=="power_w":
        # Read the first explicit power value for the current model and normalize
        # kW/W to watts. Do not take max(all numbers): strings may also contain
        # horsepower or a parenthetical "maximum power".
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:квт|kw)\b",low,re.I)
        if m:
            n=float(m.group(1).replace(",","."))
            # Guard against obvious source-unit typos such as "2600 кВт" for a chainsaw.
            return round(n if n>20 else n*1000,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:вт|w)\b",low,re.I)
        if m:
            return round(float(m.group(1).replace(",",".")),2)
        return round(ns[0],2)
    if key in ("area_m2","sections_count","drive_links","engine_cc","color_temp_k","luminous_flux_lm","noise_db"):
        return round(v,3)
    if key in ("tank_l","fuel_tank_l"):
        if "мл" in low and "л" not in low.replace("мл",""): v/=1000
        return round(v,3)
    if key=="output_mlh":
        if re.search(r"\bл\s*/?\s*ч",low): v*=1000
        return round(v,2)
    if key=="airflow_m3h":
        return round(v,2)
    if key=="fuel_consumption_kgh":
        return round(v,3)
    if key=="bar_length_cm":
        # 21vek often shows both units, e.g. "40 см (16")". Prefer the
        # explicit metric value instead of taking max(numbers) and then
        # converting because a quote exists somewhere in the string.
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*мм\b",low)
        if m: return round(float(m.group(1).replace(",","."))/10,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*см\b",low)
        if m: return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])",low)
        if m: return round(float(m.group(1).replace(",","."))*2.54,2)
        return round(ns[0],2)
    if key in ("width_mm","height_mm","depth_mm"):
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*мм\b",low)
        if m: return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*см\b",low)
        if m: return round(float(m.group(1).replace(",","."))*10,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*м\b",low)
        if m: return round(float(m.group(1).replace(",","."))*1000,2)
        return round(ns[0],2)
    if key=="chain_speed_ms": return round(v,2)
    if key=="weight_kg":
        if re.search(r"\bг\b",low) and "кг" not in low: v/=1000
        return round(v,3)
    if key=="voltage_v": return round(v,2)
    return round(v,3)


def primitive_text(v: Any) -> str:
    if isinstance(v,bool): return "да" if v else "нет"
    if isinstance(v,(str,int,float)): return str(v).strip()
    if isinstance(v,list) and len(v)<=8:
        xs=[primitive_text(x) for x in v]
        return ", ".join(x for x in xs if x)
    return ""


def extract_specs(html: str, rules: list[dict]) -> tuple[list[dict],dict]:
    aliases=alias_map(rules)
    raw=[];seen=set()
    try: state=next_state(html)
    except Exception: state={}
    root=(state.get("productCard") or {}).get("fullProductData") or {}
    label_keys=("name","title","label","caption","propertyName","featureName","characteristicName","parameterName")
    value_keys=("value","text","displayValue","propertyValue","featureValue","characteristicValue","parameterValue")

    def add(label: Any,value: Any,source: str,path: str=""):
        k=aliases.get(norm(label));text=primitive_text(value)
        if not k or not text: return
        sig=(k,text)
        if sig in seen: return
        seen.add(sig);raw.append({"key":k,"label":str(label),"value":text,"source":source,"path":path})

    def walk(node: Any,path="fd"):
        if isinstance(node,dict):
            label=None
            for lk in label_keys:
                if isinstance(node.get(lk),(str,int,float)):
                    label=node.get(lk);break
            if label is not None:
                for vk in value_keys:
                    if vk in node: add(label,node.get(vk),"next_data",path+"."+vk)
            for k,v in node.items():
                if norm(k) in aliases: add(k,v,"next_data",path+"."+str(k))
                if isinstance(v,(dict,list)): walk(v,path+"."+str(k))
        elif isinstance(node,list):
            for i,v in enumerate(node): walk(v,f"{path}[{i}]")
    walk(root)

    soup=BeautifulSoup(html,"html.parser")
    lines=[re.sub(r"\s+"," ",x).strip() for x in soup.get_text("\n",strip=True).splitlines()]
    lines=[x for x in lines if x]
    for i,line in enumerate(lines):
        key=None;label=line;width_used=1
        for width in (4,3,2,1):
            if i+width<=len(lines):
                candidate=" ".join(lines[i:i+width])
                if norm(candidate) in aliases:
                    key=aliases[norm(candidate)];label=candidate;width_used=width;break
        if not key: continue
        for j in range(i+width_used,min(len(lines),i+width_used+5)):
            cand=lines[j]
            if norm(cand) in aliases: break
            if cand:
                add(label,cand,"visible_html")
                break

    values={}
    for x in raw:
        val=normalize_value(x["key"],x["value"])
        if val is not None and x["key"] not in values:
            values[x["key"]]=val
    return raw,values


def fetch_html(session: requests.Session,url: str) -> str:
    if not public_product_url(url): raise RuntimeError("invalid public 21vek product URL")
    last=None
    for attempt in range(4):
        try:
            r=session.get(url,headers=HEADERS,timeout=TIMEOUT,allow_redirects=True)
            if r.status_code==200: return r.text
            last=RuntimeError(f"HTTP {r.status_code}")
            if r.status_code==429:
                try: wait=float(r.headers.get("Retry-After") or 3)
                except Exception: wait=3
                time.sleep(max(2,min(30,wait)))
            elif r.status_code>=500: time.sleep(1.5*(attempt+1))
            else: raise last
        except (requests.Timeout,requests.ConnectionError) as exc:
            last=exc;time.sleep(1.5*(attempt+1))
    raise last or RuntimeError("21vek fetch failed")


def flatten(obj: Any,prefix="") -> list[tuple[str,Any]]:
    out=[]
    if isinstance(obj,dict):
        for k,v in obj.items():
            p=f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v,(dict,list)): out.extend(flatten(v,p))
            else: out.append((p,v))
    elif isinstance(obj,list):
        for i,v in enumerate(obj): out.extend(flatten(v,f"{prefix}[{i}]"))
    return out


def item_name(item: dict) -> str:
    for k in ("name","title","productName","fullName"):
        if item.get(k): return str(item[k])
    for p,v in flatten(item):
        if isinstance(v,str) and p.lower().endswith((".name",".title")) and len(v)>8:
            return v
    return ""


def item_url(item: dict) -> str:
    for p,v in flatten(item):
        if isinstance(v,str) and any(x in p.lower() for x in ("url","href","link")) and ".html" in v:
            u=urljoin("https://www.21vek.by/",v)
            if public_product_url(u): return u
    return ""


def search_number(item: dict, key_words: tuple[str,...]) -> float|None:
    candidates=[]
    for p,v in flatten(item):
        lp=p.lower()
        if not isinstance(v,(int,float,str)): continue
        if not any(k in lp for k in key_words): continue
        try:
            n=float(str(v).replace(",","."))
            if math.isfinite(n): candidates.append((p,n))
        except Exception: pass
    if not candidates: return None
    # Prefer sale/current paths and avoid old/original price for current.
    candidates.sort(key=lambda z:(0 if any(k in z[0].lower() for k in ("saleprice","currentprice","finalprice")) else 1,len(z[0])))
    return candidates[0][1]


def search_text(item: dict,key_words: tuple[str,...]) -> str:
    for p,v in flatten(item):
        if isinstance(v,str) and any(k in p.lower() for k in key_words):
            s=v.strip()
            if s: return s
    return ""


def search_meta(item: dict) -> dict:
    brand=search_text(item,("producer.name","brand.name",".brand",".producer"))
    price=valid_price(search_number(item,("saleprice","currentprice","finalprice",".price")))
    rating=search_number(item,(".rating","rating.value"))
    reviews=search_number(item,("reviewcount","reviews.count"))
    status=search_text(item,(".status","availability","available"))
    ins=None
    if status:
        n=norm(status)
        if n in ("in","available","true","в наличии"): ins=True
        elif n in ("out","false","нет в наличии","unavailable"): ins=False
    ext=item.get("id")
    return {
      "brand":brand,"price":price,"rating":rating,
      "review_count":int(reviews) if reviews is not None else None,
      "in_stock":ins,"external_id":str(ext) if ext is not None else None
    }


def is_our_brand(item: dict,name: str) -> bool:
    blob=norm(name+" "+json.dumps(item,ensure_ascii=False))
    return any(re.search(r"(^|\s)"+re.escape(b)+r"(\s|$)",blob) for b in OUR_BRANDS)


def search_page(session: requests.Session, query: str,page: int,search_id: str="",attempts: int=5) -> dict:
    body={"query":query,"order":"default","page":page,"limit":60,"mode":"desktop","searchId":search_id,"filters":[]}
    last=None
    for attempt in range(max(1,attempts)):
        try:
            r=session.post(SEARCH_ENDPOINT,headers=SEARCH_HEADERS,json=body,timeout=TIMEOUT,allow_redirects=True)
            if r.status_code==200:
                data=r.json()
                if isinstance(data,dict) and isinstance(data.get("products"),list): return data
                raise RuntimeError("21vek search response has no products")
            last=RuntimeError(f"21vek search HTTP {r.status_code}: {r.text[:250]}")
            if r.status_code in (424,429):
                # 21vek occasionally returns 424 "ML request error" from its
                # ranking backend during bursts. It is transient: back off and
                # retry instead of failing the whole market run.
                try: retry_after=float(r.headers.get("Retry-After") or 0)
                except Exception: retry_after=0
                wait=max(retry_after,4.0*(attempt+1))
                time.sleep(min(30,wait))
            elif r.status_code>=500:
                time.sleep(min(20,2.0*(attempt+1)))
            else:
                raise last
        except (requests.Timeout,requests.ConnectionError) as exc:
            last=exc;time.sleep(min(20,2.0*(attempt+1)))
    raise last or RuntimeError("21vek search failed")


def discover_scope(session: requests.Session,scope: dict) -> tuple[list[dict],list[dict],dict]:
    def fetch_ranked(candidates: list[str],required: bool=True) -> tuple[str,dict,dict,str]|None:
        last_exc=None
        for cand in candidates:
            try:
                d1=search_page(session,cand,1,"",attempts=2 if len(candidates)>1 else 5)
                time.sleep(DELAY)
                sid=str(d1.get("searchId") or "")
                d2=search_page(session,cand,2,sid)
                time.sleep(DELAY)
                return cand,d1,d2,sid
            except Exception as exc:
                last_exc=exc
                time.sleep(2)
        if required:
            raise last_exc or RuntimeError("21vek search failed for all query variants")
        return None

    q=scope["search_query"]
    candidates=[q]
    if scope.get("profile_key")=="infrared_heater":
        for alt in ("обогреватель инфракрасный","инфракрасный","инфрак"):
            if norm(alt)!=norm(q): candidates.append(alt)

    main=fetch_ranked(candidates,True)
    assert main is not None
    used_query,d1,d2,sid=main
    datasets=[(used_query,d1,d2,sid)]
    supplemental_error=None

    # The general infrared search currently represents the electric market well
    # but can omit gas heaters entirely. Collect gas infrared heaters through a
    # separate ranking query and merge them into the same business subgroup.
    if scope.get("profile_key")=="infrared_heater":
        gas=fetch_ranked([
          "газовый инфракрасный обогреватель",
          "обогреватель газовый инфракрасный",
          "газовый инфракрасный",
          "газовый обогреватель"
        ],False)
        if gas is not None:
            datasets.append(gas)
        else:
            supplemental_error="gas infrared query unavailable"

    rows=[];own_rows=[];seen=set();own_seen=set();raw_count=0;own_excluded=0
    search_ids={}
    effective_queries=[]
    for ranked_query,qd1,qd2,qsid in datasets:
        search_ids[ranked_query]=qsid
        effective_queries.append(ranked_query)
        for page,data in ((1,qd1),(2,qd2)):
            for i,item in enumerate(data.get("products") or []):
                raw_count+=1
                name=item_name(item);url=item_url(item);meta=search_meta(item)
                position=(page-1)*60+i+1
                key=meta.get("external_id") or (
                  hashlib.sha1(url.encode("utf-8")).hexdigest() if url
                  else hashlib.sha1((ranked_query+"|"+name+"|"+str(page)+"|"+str(i)).encode("utf-8")).hexdigest()
                )
                if is_our_brand(item,name):
                    own_excluded+=1
                    own_key=str(key)
                    if own_key in own_seen: continue
                    own_seen.add(own_key)
                    own_rows.append({
                      "scope_key":scope["scope_key"],"product_key":own_key,"search_query":ranked_query,
                      "page_no":page,"position":position,"external_id":meta.get("external_id"),
                      "brand":meta.get("brand") or "","model":name,"product_url":url,
                      "current_price":valid_price(meta.get("price")),"in_stock":meta.get("in_stock")
                    })
                    continue
                if key in seen: continue
                seen.add(key)
                rows.append({
                  "scope_key":scope["scope_key"],"product_key":str(key),"search_query":ranked_query,
                  "page_no":page,"position":position,"external_id":meta.get("external_id"),
                  "brand":meta.get("brand") or "","model":name,"product_url":url,
                  "current_price":meta.get("price"),"base_price":None,"in_stock":meta.get("in_stock"),
                  "product_rating":meta.get("rating"),"review_count":meta.get("review_count"),
                  "_search_item":item
                })
    meta={
      "raw":raw_count,"competitors":len(rows),"own_excluded":own_excluded,
      "own_in_top120":len(own_rows),"search_id":sid,"effective_query":used_query,
      "effective_queries":effective_queries,"search_ids":search_ids
    }
    if supplemental_error: meta["supplemental_error"]=supplemental_error
    return rows,own_rows,meta

def load_registry() -> dict[str,dict]:
    rows=rest_get_all("triovist_21vek_registry_v236214",{
      "select":"sku,product_name,category,subgroup,product_url,price,in_stock,product_rating,review_count,manager_email"
    },page_size=900)
    return {str(x.get("sku") or "").strip():x for x in rows if x.get("sku")}


def load_mrc() -> dict[str,float]:
    rows=rest_get_all("triovist_mrc_current",{"select":"sku,mrc_byn"},page_size=900)
    out={}
    for x in rows:
        try: out[str(x.get("sku") or "").strip()]=float(x["mrc_byn"])
        except Exception: pass
    return out


def load_existing_products(scope: str) -> dict[str,dict]:
    rows=rest_get_all("triovist_market_products_current_v1",{
      "scope_key":"eq."+scope,
      "select":"*"
    },page_size=500)
    return {str(x["product_key"]):x for x in rows}


def load_existing_own(scope: str) -> dict[str,dict]:
    rows=rest_get_all("triovist_market_own_specs_current_v1",{
      "scope_key":"eq."+scope,
      "select":"*"
    },page_size=500)
    return {str(x["sku"]):x for x in rows}


def rules_signature_prefix(rules: list[dict]|None=None) -> str:
    keys={str(x.get("spec_key") or "") for x in (rules or [])}
    return RULESET_VERSION+"-fan2" if "remote_control" in keys and "fan_only_mode" in keys else RULESET_VERSION


def fresh_specs(row: dict|None,url: str,rules: list[dict]|None=None) -> bool:
    if not row or not row.get("specs_normalized") or not row.get("specs_fetched_at"): return False
    if str(row.get("product_url") or "")!=str(url or ""): return False
    if not str(row.get("specs_signature") or "").startswith(rules_signature_prefix(rules)+":"): return False
    try:
        t=datetime.fromisoformat(str(row["specs_fetched_at"]).replace("Z","+00:00"))
        return datetime.now(timezone.utc)-t.astimezone(timezone.utc)<=timedelta(days=SPEC_TTL_DAYS)
    except Exception: return False


def card_data(session: requests.Session,url: str,base: dict,rules: list[dict]) -> dict:
    html=fetch_html(session,url)
    parsed=parse_product(html,{
      "url":url,"sku":base.get("sku"),"donor_article":base.get("external_id"),
      "name":base.get("product_name") or base.get("model"),
      "category":base.get("category"),"subgroup":base.get("subgroup")
    })
    raw,specs=extract_specs(html,rules)
    card=parsed["card"];extra=parsed["extra"]
    if any(r.get("spec_key")=="energy_type" for r in rules):
        specs["energy_type"]=infrared_energy_type(
          card.get("product_name") or base.get("model") or base.get("product_name") or "",
          specs,raw
        )
    if any(r.get("spec_key")=="device_type" for r in rules) and not specs.get("device_type"):
        device_name=norm(card.get("product_name") or base.get("model") or base.get("product_name") or "")
        if "тепловент" in device_name:
            specs["device_type"]="тепловентилятор"
        elif "маслян" in device_name and ("радиатор" in device_name or "обогревател" in device_name):
            specs["device_type"]="масляный радиатор"
    return {
      "brand":extra.get("brand") or base.get("brand") or "",
      "model":card.get("product_name") or base.get("model") or base.get("product_name") or "",
      "current_price":valid_price(card.get("price")),
      "base_price":valid_price(extra.get("base_price")),
      "in_stock":card.get("in_stock"),
      "product_rating":card.get("product_rating"),
      "review_count":card.get("review_count"),
      "specs_raw":raw,"specs_normalized":specs,
      "specs_signature":rules_signature_prefix(rules)+":"+hashlib.sha1(json.dumps(specs,ensure_ascii=False,sort_keys=True).encode("utf-8")).hexdigest(),
      "specs_fetched_at":datetime.now(timezone.utc).isoformat()
    }


def numeric_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    return max(0.0,1.0-abs(a-b)/den)


def convector_power_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.05: return 1.0
    if diff<=0.10: return 0.85
    if diff<=0.20: return 0.65
    return 0.35 if diff<=0.30 else 0.0


def chainsaw_engine_similarity(a: float,b: float) -> float:
    diff=abs(a-b)
    if diff<=3: return 1.0
    if diff<=5: return 0.80
    if diff<=8: return 0.50
    return 0.0


def chainsaw_power_similarity(a: float,b: float) -> float:
    diff=abs(a-b)
    if diff<=200: return 1.0
    if diff<=350: return 0.80
    if diff<=500: return 0.50
    return 0.0


def infrared_power_similarity(a: float,b: float) -> float:
    diff=abs(a-b)
    if diff<=100:return 1.0
    if diff<=250:return 0.80
    if diff<=400:return 0.50
    return 0.0


def oil_power_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.05:return 1.0
    if diff<=0.10:return 0.85
    if diff<=0.20:return 0.65
    return 0.0


def fan_heater_power_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.05:return 1.0
    if diff<=0.10:return 0.85
    if diff<=0.20:return 0.65
    return 0.0


def oil_sections_similarity(a: float,b: float) -> float:
    diff=abs(a-b)
    if diff<0.5:return 1.0
    if diff<=1.0:return 0.80
    if diff<=2.0:return 0.50
    return 0.0


def infrared_heater_similarity(a: Any,b: Any) -> float:
    aa=infrared_heater_family(a);bb=infrared_heater_family(b)
    if not aa or not bb:return 0.0
    return 1.0 if aa==bb else categorical_similarity(aa,bb)


def infrared_install_similarity(a: Any,b: Any) -> float:
    aa=infrared_install_tokens(a);bb=infrared_install_tokens(b)
    if aa and bb:return 1.0 if aa&bb else 0.0
    return categorical_similarity(a,b)


def infrared_voltage_similarity(a: Any,b: Any) -> float:
    ca=voltage_class(a);cb=voltage_class(b)
    if ca is None or cb is None:return 0.0
    return 1.0 if ca==cb else 0.0


def categorical_similarity(a: Any,b: Any) -> float:
    na=norm(a);nb=norm(b)
    if not na or not nb: return 0.0
    if na==nb or na in nb or nb in na: return 1.0
    aa=set(na.split());bb=set(nb.split())
    return len(aa&bb)/max(1,len(aa|bb))


def similarity(ours: dict,comp: dict,rules: list[dict],profile: str="generic") -> float:
    if profile=="infrared_heater":
        ea=ours.get("energy_type");eb=comp.get("energy_type")
        if ea is not None and eb is not None and str(ea)!=str(eb):
            return 0.0
        total=used=allw=0.0
        energy_missing=ea is None or eb is None
        voltage_mismatch=False
        for rule in rules:
            w=float(rule.get("weight") or 0)
            if w<=0: continue
            allw+=w
            k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
            if a is None or b is None: continue
            try:
                if k=="power_w": s=infrared_power_similarity(float(a),float(b))
                elif k=="heater_type": s=infrared_heater_similarity(a,b)
                elif k=="installation_type": s=infrared_install_similarity(a,b)
                elif k=="thermostat_type":
                    pa,pb=thermostat_present(a),thermostat_present(b)
                    s=1.0 if pa is not None and pb is not None and pa==pb else 0.0
                elif k=="voltage_v":
                    s=infrared_voltage_similarity(a,b)
                    if voltage_class(a) is not None and voltage_class(b) is not None and s<1: voltage_mismatch=True
                elif rule.get("direction")=="boolean":
                    s=1.0 if bool(a)==bool(b) else 0.0
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if energy_missing:score=min(score,69.0)
        if voltage_mismatch:score=min(score,89.0)
        return round(max(0,min(100,score)),2)

    # Gasoline chainsaws use the approved fixed 50/50 formula:
    # engine displacement + power. Missing data keeps its weight as zero
    # contribution; weights are never re-normalized.
    if profile=="chainsaw_gas":
        total=allw=0.0
        for rule in rules:
            w=float(rule.get("weight") or 0)
            if w<=0: continue
            allw+=w
            k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
            if a is None or b is None: continue
            try:
                if k=="engine_cc": s=chainsaw_engine_similarity(float(a),float(b))
                elif k=="power_w": s=chainsaw_power_similarity(float(a),float(b))
                else: s=0.0
            except Exception:
                s=0.0
            total+=w*s
        return round(max(0,min(100,(total/max(allw,1e-9))*100)),2)

    if profile=="oil_radiator":
        # Approved oil-radiator formula: technical similarity only.
        # Price is evaluated only after the analog has been selected.
        total=used=allw=0.0
        critical_mismatch=False
        critical_missing=False
        for rule in rules:
            w=float(rule.get("weight") or 0)
            if w<=0: continue
            allw+=w
            k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
            if a is None or b is None:
                if rule.get("critical"): critical_missing=True
                continue
            try:
                if k=="power_w": s=oil_power_similarity(float(a),float(b))
                elif k=="sections_count": s=oil_sections_similarity(float(a),float(b))
                elif k=="thermostat_type":
                    pa,pb=thermostat_present(a),thermostat_present(b)
                    s=1.0 if pa is not None and pb is not None and pa==pb else categorical_similarity(a,b)
                elif rule.get("direction")=="boolean":
                    s=1.0 if bool(a)==bool(b) else 0.0
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            if rule.get("critical") and s<0.45: critical_mismatch=True
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing: score=min(score,69.0)
        if critical_mismatch: score=min(score,54.0)
        return round(max(0,min(100,score)),2)

    if profile=="fan_heater":
        # Approved heat-fan formula: technical match only; price is checked later.
        total=used=allw=0.0
        critical_mismatch=False
        critical_missing=False
        for rule in rules:
            w=float(rule.get("weight") or 0)
            if w<=0: continue
            allw+=w
            k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
            if a is None or b is None:
                if rule.get("critical"): critical_missing=True
                continue
            try:
                if k=="power_w": s=fan_heater_power_similarity(float(a),float(b))
                elif k=="thermostat_type":
                    pa,pb=thermostat_present(a),thermostat_present(b)
                    s=1.0 if pa is not None and pb is not None and pa==pb else categorical_similarity(a,b)
                elif rule.get("direction")=="boolean":
                    s=1.0 if bool(a)==bool(b) else 0.0
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            if rule.get("critical") and s<0.45: critical_mismatch=True
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing: score=min(score,69.0)
        if critical_mismatch: score=min(score,54.0)
        return round(max(0,min(100,score)),2)

    total=used=allw=0.0;critical_mismatch=False;critical_missing=False
    for rule in rules:
        w=float(rule.get("weight") or 0);allw+=w
        k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
        if a is None or b is None:
            if rule.get("critical"): critical_missing=True
            continue
        direction=rule.get("direction")
        if profile=="convector" and k=="power_w":
            try: s=convector_power_similarity(float(a),float(b))
            except Exception: s=categorical_similarity(a,b)
        elif direction in ("categorical","boolean"):
            s=categorical_similarity(a,b) if direction=="categorical" else (1.0 if bool(a)==bool(b) else 0.0)
        else:
            try: s=numeric_similarity(float(a),float(b))
            except Exception: s=categorical_similarity(a,b)
        if rule.get("critical") and s<0.45: critical_mismatch=True
        total+=w*s;used+=w
    if used<=0: return 0.0
    score=total/used*100
    coverage=min(1.0,used/max(allw,1e-9))
    score*=0.60+0.40*coverage
    if critical_missing: score=min(score,69.0)
    if critical_mismatch: score=min(score,54.0)
    return round(max(0,min(100,score)),2)


def analog_grade(score: float,profile: str="generic") -> str:
    if profile in ("convector","chainsaw_gas","infrared_heater"):
        if score>=90:return "direct"
        if score>=75:return "close"
        if score>=60:return "conditional"
        return "no_direct"
    if score>=85:return "direct"
    if score>=70:return "close"
    if score>=55:return "conditional"
    return "no_direct"


def directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    d=rule.get("direction")
    if d in ("categorical","boolean"):
        s=categorical_similarity(a,b) if d=="categorical" else (1.0 if bool(a)==bool(b) else 0.0)
        return 50 if s>=0.99 else 35
    if d=="neutral": return 50
    try: av=float(a);bv=float(b)
    except Exception:return None
    if abs(av-bv)<1e-9:return 50
    better=av>bv if d=="higher" else av<bv
    rel=abs(av-bv)/max(abs(bv),1e-9)
    return min(95,55+rel*80) if better else max(5,45-rel*80)


def competitiveness(ours: dict,comp: dict,rules: list[dict],our_price: float|None,comp_price: float|None,profile: str="generic") -> float:
    price_available=our_price is not None and comp_price is not None and comp_price>0
    if price_available:
        rel=(comp_price-our_price)/comp_price
        price_score=max(0,min(100,50+rel*280))
    else: price_score=50
    s=w=0.0
    for rule in rules:
        z=directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        if z is None: continue
        rw=float(rule.get("weight") or 0);s+=z*rw;w+=rw
    spec_score=s/w if w else 50
    if profile in ("convector","infrared_heater") and not price_available:
        return round(spec_score,2)
    return round(0.35*price_score+0.65*spec_score,2)


def fmt(v: Any,unit: str|None=None) -> str:
    if isinstance(v,bool): return "да" if v else "нет"
    try:
        n=float(v);s=f"{n:.2f}".rstrip("0").rstrip(".").replace(".",",")
        return s+(" "+unit if unit else "")
    except Exception:return str(v)


def compare_texts(ours: dict,comp: dict,rules: list[dict],our_price: float|None,comp_price: float|None,position: int|None,mrc: float|None) -> tuple[list[str],list[str]]:
    adv=[];bad=[]
    if our_price is not None and comp_price:
        d=(comp_price-our_price)/comp_price*100
        if d>0.5: adv.append(f"Наша цена ниже на {d:.1f}%")
        elif d<-0.5: bad.append(f"Конкурент дешевле на {abs(d):.1f}%")
    for rule in rules:
        if float(rule.get("weight") or 0)<=0: continue
        k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
        if a is None or b is None: continue
        z=directional(rule,a,b)
        if z is None or abs(z-50)<4: continue
        txt=f"{rule['label']}: {fmt(a,rule.get('unit'))} против {fmt(b,rule.get('unit'))}"
        (adv if z>50 else bad).append(txt)
    if position and position<=10:
        bad.append(f"Конкурент занимает {position}-е место по популярности")
    if mrc and our_price is not None and our_price<mrc:
        bad.append(f"Наша цена ниже МРЦ на {(mrc-our_price)/mrc*100:.1f}%")
    return adv[:10],bad[:10]


def mrc_state(price: float|None,mrc: float|None) -> tuple[float|None,float|None]:
    if price is None or not mrc:return None,None
    db=price-mrc;return round(db,2),round(db/mrc*100,2)


def recommendation(mrc_delta_pct: float|None,similarity_score: float,status: str,our_price: float|None,comp_price: float|None,profile: str="generic") -> str:
    if mrc_delta_pct is not None and mrc_delta_pct<0:
        return "Сначала восстановить МРЦ. Ниже МРЦ цену не снижать; конкурировать характеристиками, карточкой и комплектацией."
    min_match=55 if profile in ("oil_radiator","fan_heater") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 70)
    if similarity_score<min_match:
        return "Технического аналога нет: проверить пробел ассортимента. Не использовать эту пару для ценовой войны."
    if profile=="convector" and comp_price is None:
        return "Цена конкурента не получена. Итог рассчитан только по техническим характеристикам; решение по цене не принимать."
    if status=="competitor_stronger":
        return "Конкурент сильнее по совокупности цены и характеристик. Усилить карточку/матрицу; цену снижать только в пределах МРЦ."
    if status=="ours_stronger":
        return "Мы сильнее: цену снижать не требуется. Вывести подтверждённые преимущества в карточку и аргументацию менеджера."
    return "Паритет: контролировать позицию и цену конкурента, усиливать подтверждённые преимущества без снижения ниже МРЦ."


def insert_run(scope_count: int) -> str:
    rows=rest_post("triovist_market_runs_v1",{
      "parser_version":PARSER_VERSION,"status":"running","scope_count":scope_count,
      "notes":{"source":"price_list + public 21vek first two default-ranking pages",
               "validate_profiles":sorted(VALIDATE_PROFILES),"own_brands_excluded":sorted(OUR_BRANDS),
               "position_history":True,"spec_cache_days":SPEC_TTL_DAYS,
               "production_own_parser_untouched":True}
    },prefer="return=representation")
    if not rows or not rows[0].get("id"): raise RuntimeError("cannot create market run")
    return rows[0]["id"]


def main() -> None:
    scopes,scope_skus=load_price_scope()
    if not scopes: raise RuntimeError("Seasonal market scope is empty")
    rest_upsert("triovist_market_scopes_v1",scopes,"scope_key")
    run_id=insert_run(len(scopes))
    session=requests.Session();session.headers.update(HEADERS)
    registry=load_registry();mrc=load_mrc()
    registry_by_url={url_key(x.get("product_url")):sku for sku,x in registry.items() if url_key(x.get("product_url"))}
    registry_names=defaultdict(list)
    for sku,x in registry.items():
        nk=product_name_key(x.get("product_name") or "")
        if nk: registry_names[nk].append(sku)
    discovered_total=competitor_total=comparison_total=gap_total=errors=0
    run_notes=[]

    try:
        for si,scope in enumerate(scopes,1):
            skey=scope["scope_key"];profile=scope["profile_key"];rules=load_rules(profile)
            if not rules:
                run_notes.append({"scope":skey,"error":"no technical rules"});errors+=1;continue
            print(f"SCOPE [{si}/{len(scopes)}] {scope['source_subgroup']} query={scope['search_query']!r}",flush=True)

            products,own_market,discover_meta=discover_scope(session,scope)
            discovered_total+=discover_meta["raw"]
            existing=load_existing_products(skey)
            observed_dt=datetime.now(timezone.utc)
            observed=observed_dt.isoformat()
            observed_date=(observed_dt+timedelta(hours=3)).date().isoformat()
            current_rows=[];snapshot_rows=[];supplemental_filtered=0

            for pi,p in enumerate(products,1):
                old=existing.get(p["product_key"])
                p["run_id"]=run_id;p["observed_at"]=observed;p["error_text"]=None
                p["current_price"]=valid_price(p.get("current_price"))
                need_specs=not fresh_specs(old,p.get("product_url") or "",rules)
                need_card=need_specs or (profile in ("convector","infrared_heater") and p["current_price"] is None)
                # Keep cached technical specs unless TTL/url/model requires refresh.
                # For convectors, a missing/zero search price forces a card lookup;
                # stale prices are never presented as the current price.
                if old and not need_card:
                    p["specs_raw"]=old.get("specs_raw") or []
                    p["specs_normalized"]=old.get("specs_normalized") or {}
                    p["specs_signature"]=old.get("specs_signature")
                    p["specs_fetched_at"]=old.get("specs_fetched_at")
                    if not p.get("brand"):p["brand"]=old.get("brand") or ""
                    if profile not in ("convector","infrared_heater") and p.get("current_price") is None:
                        p["current_price"]=valid_price(old.get("current_price"))
                    if p.get("in_stock") is None:p["in_stock"]=old.get("in_stock")
                    if p.get("product_rating") is None:p["product_rating"]=old.get("product_rating")
                    if p.get("review_count") is None:p["review_count"]=old.get("review_count")
                elif p.get("product_url"):
                    try:
                        got=card_data(session,p["product_url"],p,rules)
                        for k,v in got.items():
                            if v is not None and v!="": p[k]=v
                        time.sleep(DELAY)
                    except Exception as exc:
                        if old:
                            p["specs_raw"]=old.get("specs_raw") or []
                            p["specs_normalized"]=old.get("specs_normalized") or {}
                            p["specs_signature"]=old.get("specs_signature")
                            p["specs_fetched_at"]=old.get("specs_fetched_at")
                        p["error_text"]=str(exc)[:1200];errors+=1
                else:
                    p["specs_raw"]=old.get("specs_raw") if old else []
                    p["specs_normalized"]=old.get("specs_normalized") if old else {}
                    p["specs_signature"]=old.get("specs_signature") if old else None
                    p["specs_fetched_at"]=old.get("specs_fetched_at") if old else None
                    p["error_text"]="21vek search result has no canonical product URL";errors+=1

                if profile=="infrared_heater" and "газов" in norm(p.get("search_query")):
                    if (p.get("specs_normalized") or {}).get("energy_type")!="gas":
                        supplemental_filtered+=1
                        continue

                p.pop("_search_item",None)
                current_rows.append(p)
                snapshot_rows.append({
                  k:p.get(k) for k in (
                    "run_id","scope_key","product_key","search_query","page_no","position","external_id","brand","model",
                    "product_url","current_price","base_price","in_stock","product_rating","review_count","observed_at","error_text"
                  )
                })
                if pi%20==0: print(f"  competitors {pi}/{len(products)}",flush=True)

            discover_meta["competitors"]=len(current_rows)
            if supplemental_filtered:
                discover_meta["supplemental_filtered_non_gas"]=supplemental_filtered
            competitor_total+=len(current_rows)

            rest_upsert("triovist_market_products_current_v1",current_rows,"scope_key,product_key")
            if snapshot_rows: rest_post("triovist_market_product_snapshots_v1",snapshot_rows)
            # Remove products which have left TOP-2 only after a successful discovery.
            rest_delete("triovist_market_products_current_v1",{"scope_key":"eq."+skey,"run_id":"neq."+run_id})

            # Our brands are not competitors, but their exact ranking positions are
            # captured from the very same 21vek result set before exclusion.
            found_by_sku={}
            for x in own_market:
                sku=registry_by_url.get(url_key(x.get("product_url")))
                if not sku:
                    candidates=registry_names.get(product_name_key(x.get("model") or "")) or []
                    if len(candidates)==1: sku=candidates[0]
                if sku and sku in scope_skus[skey] and sku not in found_by_sku:
                    found_by_sku[sku]=x

            own_position_rows=[];own_position_snapshots=[]
            for sku in sorted(scope_skus[skey]):
                src=registry.get(sku) or {}
                found=found_by_sku.get(sku)
                has_card=bool(src.get("product_url"))
                state="top120" if found else ("outside_top120" if has_card else "no_card")
                row={
                  "scope_key":skey,"sku":sku,
                  "product_name":src.get("product_name") or (found or {}).get("model") or sku,
                  "product_url":src.get("product_url") or (found or {}).get("product_url"),
                  "external_id":(found or {}).get("external_id"),
                  "brand":(found or {}).get("brand") or "",
                  "page_no":(found or {}).get("page_no"),
                  "position":(found or {}).get("position"),
                  "listing_state":state,"in_top120":state=="top120",
                  "current_price":valid_price((found or {}).get("current_price")) or valid_price(src.get("price")),
                  "in_stock":(found or {}).get("in_stock"),
                  "observed_at":observed,"run_id":run_id
                }
                own_position_rows.append(row)
                snap=dict(row);snap["observed_date"]=observed_date
                own_position_snapshots.append(snap)

            rest_delete("triovist_market_own_positions_current_v1",{"scope_key":"eq."+skey})
            if own_position_rows:
                rest_upsert("triovist_market_own_positions_current_v1",own_position_rows,"scope_key,sku")
                rest_upsert("triovist_market_own_position_snapshots_v1",own_position_snapshots,"scope_key,sku,observed_date")

            own_existing=load_existing_own(skey)
            own_rows=[]
            for sku in sorted(scope_skus[skey]):
                src=registry.get(sku)
                if not src or not src.get("product_url"):
                    continue
                old=own_existing.get(sku)
                row={
                  "sku":sku,"scope_key":skey,"product_name":src.get("product_name") or sku,
                  "product_url":src.get("product_url"),"current_price":valid_price(src.get("price")),
                  "mrc_byn":mrc.get(sku),"observed_at":observed,"error_text":None
                }
                if fresh_specs(old,row["product_url"],rules):
                    row.update({
                      "specs_raw":old.get("specs_raw") or [],"specs_normalized":old.get("specs_normalized") or {},
                      "specs_signature":old.get("specs_signature"),"specs_fetched_at":old.get("specs_fetched_at")
                    })
                else:
                    try:
                        got=card_data(session,row["product_url"],{
                          "sku":sku,"product_name":row["product_name"],"category":scope["source_category"],
                          "subgroup":scope["source_subgroup"]
                        },rules)
                        row.update({
                          "specs_raw":got["specs_raw"],"specs_normalized":got["specs_normalized"],
                          "specs_signature":got["specs_signature"],"specs_fetched_at":got["specs_fetched_at"]
                        })
                        time.sleep(DELAY)
                    except Exception as exc:
                        if old:
                            row.update({
                              "specs_raw":old.get("specs_raw") or [],"specs_normalized":old.get("specs_normalized") or {},
                              "specs_signature":old.get("specs_signature"),"specs_fetched_at":old.get("specs_fetched_at")
                            })
                        else:
                            row.update({"specs_raw":[],"specs_normalized":{}})
                        row["error_text"]=str(exc)[:1200];errors+=1
                own_rows.append(row)
            rest_upsert("triovist_market_own_specs_current_v1",own_rows,"sku")

            # Rebuild only this scope's current analysis/gaps.
            rest_delete("triovist_market_analysis_current_v1",{"scope_key":"eq."+skey})
            rest_delete("triovist_market_gaps_current_v1",{"scope_key":"eq."+skey})
            analyses=[];gaps=[]
            usable_own=[x for x in own_rows if x.get("specs_normalized")]
            gap_threshold=55 if profile in ("oil_radiator","fan_heater") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 70)
            candidate_threshold=60 if profile in ("convector","chainsaw_gas","infrared_heater") else 55
            for p in current_rows:
                if p.get("error_text") and not p.get("specs_normalized"): continue
                scored=[]
                for ours in usable_own:
                    sim=similarity(ours["specs_normalized"],p.get("specs_normalized") or {},rules,profile)
                    scored.append((sim,ours))
                scored.sort(key=lambda z:z[0],reverse=True)
                best=scored[0][0] if scored else 0.0
                if best<gap_threshold:
                    gaps.append({
                      "scope_key":skey,"product_key":p["product_key"],"best_similarity":round(best,2),
                      "reason":f"Нет нашего технически подтверждённого аналога с сопоставимостью ≥{gap_threshold}%",
                      "computed_at":observed
                    })
                top=[x for x in scored if x[0]>=candidate_threshold][:3]
                for idx,(sim,ours) in enumerate(top):
                    op=valid_price(ours.get("current_price"))
                    cp=valid_price(p.get("current_price"))
                    mr=float(ours["mrc_byn"]) if ours.get("mrc_byn") is not None else None
                    mdb,mdp=mrc_state(op,mr)
                    pdb=pdp=None
                    if op is not None and cp:
                        pdb=round(op-cp,2);pdp=round((op-cp)/cp*100,2)
                    comp_score=competitiveness(ours["specs_normalized"],p.get("specs_normalized") or {},rules,op,cp,profile)
                    status="ours_stronger" if comp_score>=65 else ("parity" if comp_score>=45 else "competitor_stronger")
                    adv,bad=compare_texts(
                      ours["specs_normalized"],p.get("specs_normalized") or {},rules,op,cp,p.get("position"),mr
                    )
                    analyses.append({
                      "scope_key":skey,"product_key":p["product_key"],"our_sku":ours["sku"],
                      "similarity_score":round(sim,2),"analog_grade":analog_grade(sim,profile),"is_primary":idx==0,
                      "competitiveness_score":comp_score,"status":status,"our_price":op,"mrc_byn":mr,
                      "mrc_delta_byn":mdb,"mrc_delta_pct":mdp,"competitor_price":cp,
                      "price_delta_byn":pdb,"price_delta_pct":pdp,
                      "our_specs":ours["specs_normalized"],"competitor_specs":p.get("specs_normalized") or {},
                      "advantages":adv,"disadvantages":bad,
                      "recommendation":recommendation(mdp,sim,status,op,cp,profile),"computed_at":observed
                    })
            if analyses: rest_post("triovist_market_analysis_current_v1",analyses)
            if gaps: rest_post("triovist_market_gaps_current_v1",gaps)
            comparison_total+=len(analyses);gap_total+=len(gaps)
            run_notes.append({
              "scope":skey,"subgroup":scope["source_subgroup"],"query":scope["search_query"],
              **discover_meta,"our_matrix":len(scope_skus[skey]),"our_21vek":len(own_rows),
              "our_listing_top120":sum(1 for x in own_position_rows if x["in_top120"]),
              "our_listing_outside_top120":sum(1 for x in own_position_rows if x["listing_state"]=="outside_top120"),
              "our_listing_no_card":sum(1 for x in own_position_rows if x["listing_state"]=="no_card"),
              "comparisons":len(analyses),"gaps":len(gaps)
            })
            print(f"  DONE competitors={len(products)} own21={len(own_rows)} comparisons={len(analyses)} gaps={len(gaps)}",flush=True)

        status="complete" if errors==0 else "partial"
        rest_patch("triovist_market_runs_v1",{"id":"eq."+run_id},{
          "status":status,"discovered_count":discovered_total,"competitor_count":competitor_total,
          "comparison_count":comparison_total,"gap_count":gap_total,"error_count":errors,
          "finished_at":datetime.now(timezone.utc).isoformat(),"notes":{
            "scopes":run_notes,"validation_mode":bool(VALIDATE_PROFILES),
            "position_contract":"page1=1..60,page2=61..120,21vek default desktop ranking",
            "full_spec_refresh_days":SPEC_TTL_DAYS,
            "own_parser_untouched":True
          }
        })
        print(f"DONE {status}: scopes={len(scopes)} competitors={competitor_total} comparisons={comparison_total} gaps={gap_total} errors={errors}",flush=True)
        if competitor_total==0: raise SystemExit(2)
    except Exception as exc:
        try:
            rest_patch("triovist_market_runs_v1",{"id":"eq."+run_id},{
              "status":"failed","error_count":max(errors,1),"finished_at":datetime.now(timezone.utc).isoformat(),
              "notes":{"fatal_error":str(exc)[:1800],"scopes":run_notes}
            })
        except Exception: pass
        raise


if __name__=="__main__":
    main()
