#!/usr/bin/env python3
"""Triovist / 21vek automatic market analysis v23.6.282.

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
PARSER_VERSION="market-auto-v3.4"
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
    if "снегоубор" in n: return "snow_blower"
    if "воздуходув" in n: return "leaf_blower"
    if any(x in n for x in ("мотобур","бензобур","землебур")): return "earth_auger"
    if ("измельч" in n and ("сад" in n or "вет" in n)) or "садов шредер" in n: return "garden_shredder"
    if "секатор" in n and "аккумулятор" in n: return "battery_pruner"
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
      "snow_blower":"снегоуборщик",
      "leaf_blower":"воздуходувка",
      "earth_auger":"мотобур",
      "garden_shredder":"садовый измельчитель",
      "battery_pruner":"аккумуляторный секатор",
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
      ("Снегоуборщики","snow_blower","снегоубор"),
      ("Воздуходувки","leaf_blower","воздуходув"),
      ("Мотобуры","earth_auger","мотобур"),
      ("Садовые измельчители","garden_shredder","измельч"),
      ("Аккумуляторные секаторы","battery_pruner","секатор"),
    ]:
        query=query_for(label,profile);key=scope_key(profile,query)
        skus=set()
        for x in garden:
            sku=str(x.get("sku") or "").strip()
            if sku_depth(sku)<3:continue
            pn=norm(x.get("product"))
            matched=needle in pn
            if profile=="chainsaw_electric":
                matched=matched or ("электрическ" in pn and "пил" in pn)
            elif profile=="snow_blower":
                matched=matched and sku.startswith("70/7/") and "насадк" not in pn and "листовк" not in pn
            elif profile=="leaf_blower":
                matched=matched and sku.startswith("70/13/") and not sku.startswith("900/")
            elif profile=="earth_auger":
                matched=(any(x in pn for x in ("мотобур","бензобур","землебур"))
                         and not sku.startswith("900/"))
            elif profile=="garden_shredder":
                matched=(("измельч" in pn or "садов шредер" in pn)
                         and "нож для" not in pn and "лезв" not in pn
                         and not sku.startswith("900/"))
            elif profile=="battery_pruner":
                matched=("секатор" in pn and "аккумулятор" in pn
                         and "лезв" not in pn and "нож для" not in pn
                         and not sku.startswith("900/"))
            if matched:skus.add(sku)
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


def heat_gun_family(name: str,specs: dict|None=None,raw: list[dict]|None=None) -> str|None:
    specs=specs or {};raw=raw or []
    text=" ".join([
      str(name or ""),
      str(specs.get("fuel_type") or ""),
      str(specs.get("heater_type") or ""),
      " ".join(str(x.get("value") or "") for x in raw if isinstance(x,dict))
    ])
    n=norm(text)
    if any(x in n for x in ("газов","пропан","бутан","сжиженн газ","газовая пушка")): return "gas"
    if any(x in n for x in ("дизел","соляр","керосин","дизельная пушка")): return "diesel"
    if any(x in n for x in ("электр","220 в","230 в","380 в","400 в","электрическая пушка")): return "electric"
    return None


def heat_gun_heating_mode(name: str,specs: dict|None=None,raw: list[dict]|None=None,family: str|None=None) -> str|None:
    specs=specs or {};raw=raw or []
    fam=family or heat_gun_family(name,specs,raw)
    if fam!="diesel": return None
    text=" ".join([
      str(name or ""),
      str(specs.get("heating_mode") or ""),
      " ".join(str(x.get("value") or "") for x in raw if isinstance(x,dict))
    ])
    n=norm(text)
    if "непрям" in n:return "indirect"
    if "прям" in n:return "direct"
    # Diesel heat guns without an explicit "indirect" marker are the direct-heating class.
    if "дизел" in n and ("пуш" in n or "нагрев" in n):return "direct"
    return None


def heat_gun_power_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.05:return 1.0
    if diff<=0.10:return 0.85
    if diff<=0.20:return 0.65
    return 0.0


def heat_gun_airflow_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.10:return 1.0
    if diff<=0.20:return 0.85
    if diff<=0.30:return 0.65
    return 0.0


def heat_gun_metric_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.10:return 1.0
    if diff<=0.20:return 0.85
    if diff<=0.30:return 0.65
    return 0.0


def humidifier_device_family(v: Any) -> str:
    n=norm(v)
    if "аромадиффуз" in n or ("диффузор" in n and "увлажн" not in n):return "diffuser"
    if "мойк" in n and "воздух" in n:return "air_washer"
    if "очистител" in n and "увлажн" not in n:return "air_purifier"
    if "ультразв" in n and "увлажн" in n:return "humidifier_ultrasonic"
    if ("традиц" in n or "холодн испар" in n or "естествен испар" in n) and "увлажн" in n:return "humidifier_traditional"
    if ("паров" in n or "горяч пар" in n) and "увлажн" in n:return "humidifier_steam"
    if "увлажн" in n:return "humidifier"
    return n


def humidifier_technology_family(v: Any) -> str:
    n=norm(v)
    out=[]
    if "ультразв" in n:out.append("ultrasonic")
    if "традиц" in n or "холодн испар" in n or "естествен испар" in n:out.append("traditional")
    if "паров" in n or "горяч пар" in n:out.append("steam")
    return "+".join(out) if out else n


def humidifier_power_supply_family(v: Any) -> str:
    n=norm(v)
    out=[]
    if any(x in n for x in ("сеть","розет","220","230")):out.append("mains")
    if "usb" in n or "юсб" in n:out.append("usb")
    if any(x in n for x in ("аккумуля","батар")):out.append("battery")
    return "+".join(out) if out else n


def humidifier_metric_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.10:return 1.0
    if diff<=0.20:return 0.85
    if diff<=0.30:return 0.65
    return 0.0


def humidifier_power_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.15:return 1.0
    if diff<=0.30:return 0.85
    if diff<=0.50:return 0.65
    return 0.0


def snow_blower_power_source_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("аккумуля","батар","battery","li ion","li-ion")):return "battery"
    if any(x in n for x in ("электр","сеть","сетев","220","230","розет","mains")):return "electric"
    if any(x in n for x in ("бензин","топлив","двс","4 такт","четырехтакт","four stroke")):return "fuel"
    return n


def snow_blower_device_family(v: Any) -> str:
    n=norm(v)
    if "насадк" in n:return "attachment"
    if "лопат" in n:return "snow_shovel"
    if "снегоубор" in n:return "snow_blower"
    return n


def snow_blower_type_tokens(v: Any) -> set[str]:
    n=norm(v);out=set()
    if "несамоход" in n:out.add("non_self")
    elif "самоход" in n:out.add("self")
    if "одноступ" in n or "1 ступ" in n:out.add("one_stage")
    if "двухступ" in n or "2 ступ" in n:out.add("two_stage")
    if "трехступ" in n or "3 ступ" in n:out.add("three_stage")
    return out


def snow_blower_drive_family(v: Any) -> str:
    n=norm(v)
    if "гусен" in n:return "track"
    if "колес" in n:return "wheel"
    return n


def snow_blower_start_family(v: Any) -> str:
    n=norm(v);out=[]
    if any(x in n for x in ("руч","manual")):out.append("manual")
    if any(x in n for x in ("электр","электростарт","electric","220","230")):out.append("electric")
    if any(x in n for x in ("battery","аккумуля","12 в","12v")):out.append("battery")
    if any(x in n for x in ("mains","сеть","220","230")):out.append("mains")
    return "+".join(sorted(set(out))) if out else n


def snow_blower_battery_voltage_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    if 16<=n<=22:return "18_20"
    if 34<=n<=42:return "36_40"
    if 46<=n<=52:return "48"
    if 54<=n<=62:return "60"
    if 72<=n<=84:return "80"
    return str(round(n,1))


def snow_blower_abs_similarity(a: float,b: float,full: float,close: float,conditional: float) -> float:
    diff=abs(a-b)
    if diff<=full:return 1.0
    if diff<=close:return 0.85
    if diff<=conditional:return 0.65
    return 0.0


def snow_blower_relative_similarity(a: float,b: float,full: float=0.05,close: float=0.10,conditional: float=0.20) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=full:return 1.0
    if diff<=close:return 0.85
    if diff<=conditional:return 0.65
    return 0.0


def leaf_blower_power_source_family(v: Any) -> str:
    return snow_blower_power_source_family(v)


def leaf_blower_device_family(v: Any) -> str:
    n=norm(v)
    if "воздуходув" in n or ("садов" in n and "пылесос" in n):return "leaf_blower"
    return n


def leaf_blower_construction_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("ранцев","рюкзач")):return "backpack"
    if any(x in n for x in ("ручн","переносн")):return "handheld"
    if any(x in n for x in ("колес","на колес")):return "wheeled"
    return n


def leaf_blower_function_tokens(v: Any) -> set[str]:
    n=norm(v);out=set()
    if any(x in n for x in ("blow","обдув","выдув","воздуходув")):out.add("blow")
    if any(x in n for x in ("vacuum","всасыв","пылесос","сбор лист")):out.add("vacuum")
    if any(x in n for x in ("shred","измельч","мульч")):out.add("shred")
    if "антивиб" in n:out.add("anti_vibration")
    if any(x in n for x in ("регулировк скорост","регулировк оборот","плавн регулиров")):out.add("speed_control")
    if any(x in n for x in ("круиз","фиксац оборот","поддержан оборот")):out.add("cruise_control")
    if "турбо" in n:out.add("turbo")
    return out


def leaf_blower_functions_similarity(a: Any,b: Any) -> float:
    aa=leaf_blower_function_tokens(a);bb=leaf_blower_function_tokens(b)
    if aa and bb:return len(aa&bb)/max(1,len(aa|bb))
    return categorical_similarity(a,b)


def leaf_blower_noise_similarity(a: float,b: float) -> float:
    d=abs(a-b)
    if d<=3:return 1.0
    if d<=6:return 0.85
    if d<=10:return 0.65
    return 0.0


def battery_pruner_device_family(v: Any) -> str:
    n=norm(v)
    if "секатор" in n:return "pruner"
    if "сучкорез" in n:return "lopper"
    if "ножниц" in n:return "shears"
    return n


def battery_pruner_tool_family(v: Any) -> str:
    n=norm(v)
    if "секатор" in n:return "pruner"
    if "сучкорез" in n:return "lopper"
    if "ножниц" in n:return "shears"
    return n


def battery_pruner_source_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("аккумуля","батар","battery","li ion","li-ion")):return "battery"
    if any(x in n for x in ("сетев","сеть","220","230","electric","электр")):return "mains"
    if any(x in n for x in ("ручн","механическ","manual")):return "manual"
    return n


def battery_pruner_battery_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("lifepo4","li fe po4","литий железо фосфат")):return "lifepo4"
    if any(x in n for x in ("li ion","li-ion","литий ион","литийион")):return "li_ion"
    if any(x in n for x in ("nimh","ni mh","никель металл")):return "ni_mh"
    if any(x in n for x in ("nicd","ni cd","никель кадм")):return "ni_cd"
    return n


def battery_pruner_knife_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("обводн","bypass")):return "bypass"
    if any(x in n for x in ("наковальн","anvil")):return "anvil"
    if any(x in n for x in ("двойн","двухлезв","double")):return "double"
    if "нож" in n and "подвиж" in n:return "moving"
    if "нож" in n and "неподвиж" in n:return "fixed"
    return n


def battery_pruner_blade_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("обводн","bypass")):return "bypass"
    if any(x in n for x in ("наковальн","anvil")):return "anvil"
    if any(x in n for x in ("двусторон","double edge","двухсторон")):return "double_edge"
    if any(x in n for x in ("односторон","single edge")):return "single_edge"
    if any(x in n for x in ("изогнут","curved")):return "curved"
    if any(x in n for x in ("прям","straight")):return "straight"
    return n


def battery_pruner_voltage_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    if 10<=n<16:return "12_v"
    if 16<=n<=22:return "18_20_v"
    if 23<=n<=28:return "24_v"
    if 34<=n<=42:return "36_40_v"
    if 46<=n<=52:return "48_v"
    if 54<=n<=62:return "60_v"
    if 72<=n<=84:return "80_v"
    return str(round(n,1))


def battery_pruner_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def battery_pruner_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k in ("device_type","tool_type","voltage_v","power_source","battery_type","knife_type","blade_type"):
        return 50
    return directional(rule,a,b)


def garden_shredder_device_family(v: Any) -> str:
    n=norm(v)
    if ("измельч" in n and ("сад" in n or "вет" in n)) or "шредер" in n:return "garden_shredder"
    return n


def garden_shredder_engine_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("аккумуля","батар","battery","li ion","li-ion")):return "battery"
    if any(x in n for x in ("бензин","двс","топлив","internal combustion")):return "fuel"
    if any(x in n for x in ("электр","сетев","сеть","220","230","380","400","electric")):return "electric"
    return n


def garden_shredder_body_family(v: Any) -> str:
    n=norm(v)
    has_metal=any(x in n for x in ("металл","сталь","алюмин"))
    has_plastic=any(x in n for x in ("пласт","полимер"))
    if has_metal and has_plastic:return "combined"
    if has_metal:return "metal"
    if has_plastic:return "plastic"
    return n


def garden_shredder_cutting_family(v: Any) -> str:
    n=norm(v)
    if "турбин" in n:return "turbine"
    if "фрез" in n or "фрезер" in n:return "milling"
    if any(x in n for x in ("валков","валец","ролик","роликов")):return "roller"
    if "нож" in n:return "knife"
    if "диск" in n:return "disc"
    return n


def garden_shredder_collector_type_family(v: Any) -> str:
    n=norm(v)
    if "меш" in n:return "bag"
    if any(x in n for x in ("жестк","жёстк","контейнер","короб","бак")):return "rigid_container"
    if "съем" in n or "съём" in n:return "removable"
    return n


def garden_shredder_material_tokens(v: Any) -> set[str]:
    n=norm(v);out=set()
    if any(x in n for x in ("ветк","ветв","суч","древес")):out.add("branches")
    if any(x in n for x in ("лист","листв")):out.add("leaves")
    if "трав" in n:out.add("grass")
    if any(x in n for x in ("мягк","зелён","зелен","растительн отход")):out.add("soft_waste")
    if any(x in n for x in ("садов отход","органич","компост")):out.add("garden_waste")
    if not out and n:out.add(n)
    return out


def garden_shredder_voltage_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    if 200<=n<=250:return "mains_220_230"
    if 360<=n<=420:return "mains_380_400"
    if 16<=n<=22:return "battery_18_20"
    if 34<=n<=42:return "battery_36_40"
    if 46<=n<=52:return "battery_48"
    if 54<=n<=62:return "battery_60"
    if 72<=n<=84:return "battery_80"
    return str(round(n,1))


def garden_shredder_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def garden_shredder_noise_similarity(a: float,b: float) -> float:
    d=abs(a-b)
    if d<=3:return 1.0
    if d<=6:return 0.85
    if d<=10:return 0.65
    return 0.0


def garden_shredder_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="processed_material":
        aa=garden_shredder_material_tokens(a);bb=garden_shredder_material_tokens(b)
        if not aa or not bb:return None
        if aa==bb:return 50
        if aa>bb:return 72
        if bb>aa:return 28
        return 55 if len(aa)>len(bb) else (45 if len(bb)>len(aa) else 50)
    if k=="collector_present":
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 70 if av and not bv else 30
    if k in ("body_material","cutting_mechanism","collector_type","cutting_speed_rpm"):
        return 50
    return directional(rule,a,b)


def earth_auger_device_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("мотобур","бензобур","землебур","earth auger","auger")):return "earth_auger"
    return n


def earth_auger_engine_family(v: Any) -> str:
    n=norm(v)
    if re.search(r"(^|\s)2\s*(?:такт|stroke)",n) or any(x in n for x in ("двухтакт","2-такт","2 такт","two stroke")):return "2stroke"
    if re.search(r"(^|\s)4\s*(?:такт|stroke)",n) or any(x in n for x in ("четырехтакт","4-такт","4 такт","four stroke")):return "4stroke"
    return n


def earth_auger_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def normalize_value(key: str, text: str) -> Any:
    low=str(text or "").lower();ns=nums(text)
    if key=="energy_type":
        n=norm(text)
        if any(x in n for x in ("газов","пропан","бутан","сжиженн газ")): return "gas"
        if any(x in n for x in ("электр","220","230","380","400")): return "electric"
        return n[:80] or None
    if key=="processed_material":
        t=garden_shredder_material_tokens(text)
        return "+".join(sorted(t)) if t else None
    if key=="body_material":
        return garden_shredder_body_family(text)[:120] or None
    if key=="cutting_mechanism":
        return garden_shredder_cutting_family(text)[:120] or None
    if key=="collector_type":
        return garden_shredder_collector_type_family(text)[:120] or None
    if key=="technologies":
        return humidifier_technology_family(text)[:240] or None
    if key=="power_supply":
        return humidifier_power_supply_family(text)[:120] or None
    if key=="power_source":
        return snow_blower_power_source_family(text)[:120] or None
    if key=="functions":
        t=leaf_blower_function_tokens(text)
        return "+".join(sorted(t)) if t else (norm(text)[:240] or None)
    if key=="engine_start_type":
        return snow_blower_start_family(text)[:120] or None
    if key=="gears":
        n=norm(text)
        fwd=re.search(r"(\d+)\s*(?:вперед|впер)",n)
        rev=re.search(r"(\d+)\s*(?:назад|задн)",n)
        if fwd or rev:
            return (fwd.group(1) if fwd else "0")+"+"+(rev.group(1) if rev else "0")
        m=re.search(r"(\d+)\s*/\s*(\d+)",n)
        if m:return m.group(1)+"+"+m.group(2)
        m=re.search(r"^(\d+)\s*\+\s*(\d+)$",n)
        if m:return m.group(1)+"+"+m.group(2)
        return n[:80] or None
    if key in ("device_type","purpose","heater_type","thermostat_type","control_type","ip_rating","installation_type","fuel_type","heating_mode","motor_position","bulb_shape","equipment","snow_blower_type","drive_type","clutch_type","construction","engine_type","battery_type","tool_type","knife_type","blade_type"):
        return norm(text)[:240] or None
    if key=="base_type":
        m=re.search(r"\b(?:e|gu|gx|g)\s*\d+(?:[.]\d+)?\b",low,re.I)
        return re.sub(r"\s+","",m.group(0)).upper() if m else (norm(text)[:40] or None)
    if key in ("display_present","power_adjustment","temperature_adjustment","wheels_present","remote_control","fan_present","fan_only_mode","indicator_light","chain_brake","auto_chain_lubrication","tool_free_tension","operator_panel_control","headlight","heated_handles","skid_height_adjustment","collector_present"):
        return presence_value(text)
    if key in ("overheat_protection","humidistat"):
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
    if key=="input_power_w":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:квт|kw)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*1000,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:вт|w)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", ".")),2)
        return round(ns[0],2)
    if key=="motor_power_w":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л\.?\s*с\.?|hp|лс)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*735.499,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:квт|kw)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*1000,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:вт|w)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", ".")),2)
        return round(ns[0],2)
    if key=="fuel_power_w":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л\.?\s*с\.?|hp|лс)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*735.499,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:квт|kw)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*1000,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:вт|w)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", ".")),2)
        return round(ns[0],2)
    if key=="battery_capacity_ah":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:а\s*ч|ач|ah)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", ".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:ма\s*ч|мач|mah)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))/1000,3)
        return round(ns[0],3)
    if key=="battery_voltage_v":
        return round(ns[0],2)
    if key in ("clearing_width_cm","intake_height_cm"):
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*мм\b",low)
        if m:return round(float(m.group(1).replace(",", "."))/10,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*см\b",low)
        if m:return round(float(m.group(1).replace(",", ".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*м\b",low)
        if m:return round(float(m.group(1).replace(",", "."))*100,2)
        return round(ns[0],2)
    if key=="throw_distance_m":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*см\b",low)
        if m:return round(float(m.group(1).replace(",", "."))/100,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*м\b",low)
        if m:return round(float(m.group(1).replace(",", ".")),2)
        return round(ns[0],2)
    if key=="power_w":
        # Read the first explicit power value for the current model and normalize
        # kW/W to watts. Do not take max(all numbers): strings may also contain
        # horsepower or a parenthetical "maximum power".
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:квт|kw)\b",low,re.I)
        if m:
            n=float(m.group(1).replace(",","."))
            # Real heat guns legitimately reach 24–75 kW. Only very large
            # values (e.g. a source typo "2600 кВт" that actually means 2600 W)
            # are treated as already-watts.
            return round(n if n>=1000 else n*1000,2)
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
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3)\s*/\s*(?:мин|min)",low,re.I)
        if m:
            n=float(m.group(1).replace(",", "."))
            return round(n if n>100 else n*60,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3)\s*/\s*(?:с|s)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*3600,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\s*/\s*(?:с|s)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*3.6,2)
        return round(v,2)
    if key=="air_speed_ms":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:км|km)\s*/\s*(?:ч|h)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))/3.6,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м|m)\s*/\s*(?:с|s)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", ".")),3)
        return round(v,3)
    if key in ("rpm","cutting_speed_rpm"):
        return round(v,2)
    if key=="feed_openings_count":
        vals=[int(x) for x in ns if float(x).is_integer() and 1<=x<=20]
        return max(vals) if vals else None
    if key=="collector_capacity_l":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мл|ml)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/1000,3)
        return round(v,2)
    if key=="max_cut_diameter_mm":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*мм\b",low)
        if m:return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*см\b",low)
        if m:return round(float(m.group(1).replace(",","."))*10,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*25.4,2)
        return round(ns[0],2)
    if key=="max_branch_diameter_mm":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*мм\b",low)
        if m:return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*см\b",low)
        if m:return round(float(m.group(1).replace(",","."))*10,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*25.4,2)
        return round(ns[0],2)
    if key in ("max_auger_diameter_mm","shaft_diameter_mm"):
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*мм\b",low)
        if m:return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*см\b",low)
        if m:return round(float(m.group(1).replace(",","."))*10,2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*25.4,2)
        return round(ns[0],2)
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
    if "heating_mode" in keys and "fuel_consumption_kgh" in keys and "airflow_m3h" in keys:
        return RULESET_VERSION+"-gun3"
    if "technologies" in keys and "output_mlh" in keys and "power_supply" in keys:
        return RULESET_VERSION+"-humid3"
    if "chain_brake" in keys and "auto_chain_lubrication" in keys and "power_supply" in keys:
        return RULESET_VERSION+"-esaw2"
    if "clearing_width_cm" in keys and "throw_distance_m" in keys and "power_source" in keys:
        return RULESET_VERSION+"-snow5"
    if "air_speed_ms" in keys and "airflow_m3h" in keys and "power_source" in keys:
        return RULESET_VERSION+"-blower2"
    if "max_auger_diameter_mm" in keys and "shaft_diameter_mm" in keys and "fuel_power_w" in keys:
        return RULESET_VERSION+"-auger1"
    if "max_branch_diameter_mm" in keys and "cutting_mechanism" in keys and "collector_capacity_l" in keys:
        return RULESET_VERSION+"-shredder1"
    if "max_cut_diameter_mm" in keys and "tool_type" in keys and "battery_capacity_ah" in keys:
        return RULESET_VERSION+"-pruner1"
    if "remote_control" in keys and "fan_only_mode" in keys:
        return RULESET_VERSION+"-fan2"
    return RULESET_VERSION


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
        elif "мойк" in device_name and "воздух" in device_name:
            specs["device_type"]="мойка воздуха"
        elif "аромадиффуз" in device_name or "арома диффуз" in device_name:
            specs["device_type"]="аромадиффузор"
        elif "увлажн" in device_name:
            specs["device_type"]="увлажнитель воздуха"
        elif "электропил" in device_name or ("цепн" in device_name and "пил" in device_name):
            specs["device_type"]="цепная электропила"
        elif "снегоубор" in device_name and "насадк" not in device_name:
            specs["device_type"]="снегоуборщик"
        elif "воздуходув" in device_name or ("садов" in device_name and "пылесос" in device_name):
            specs["device_type"]="воздуходувка"
        elif any(x in device_name for x in ("мотобур","бензобур","землебур")):
            specs["device_type"]="мотобур"
        elif ("измельч" in device_name and ("сад" in device_name or "вет" in device_name)) or "шредер" in device_name:
            specs["device_type"]="садовый измельчитель"
        elif "секатор" in device_name:
            specs["device_type"]="аккумуляторный секатор" if "аккумулятор" in device_name else "секатор"
    saw_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="power_supply" for r in rules) and any(r.get("spec_key")=="bar_length_cm" for r in rules):
        if not specs.get("power_supply"):
            saw_n=norm(saw_name)
            if any(x in saw_n for x in ("аккумуля","battery","li ion","li-ion")):
                specs["power_supply"]="battery"
            elif "электропил" in saw_n or ("цепн" in saw_n and "пил" in saw_n):
                specs["power_supply"]="mains"
    snow_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="snow_blower_type" for r in rules):
        title_n=norm(snow_name)
        device_n=norm(specs.get("device_type") or "")
        source_n=norm(specs.get("power_source") or "")
        source=None

        # Main machine class must win over auxiliary starter/battery fields.
        # A petrol snow blower may legitimately have an electric starter battery.
        if "аккумулятор" in title_n or "аккумулятор" in device_n:
            source="battery"
        elif "электрическ" in title_n or "электрическ" in device_n or " электро" in (" "+title_n):
            source="electric"
        elif "бензин" in title_n or "бензин" in device_n:
            source="fuel"
        elif specs.get("engine_cc") is not None or specs.get("tank_l") is not None:
            source="fuel"
        elif snow_blower_power_source_family(source_n) in ("battery","electric","fuel"):
            source=snow_blower_power_source_family(source_n)
        elif specs.get("battery_voltage_v") is not None or specs.get("battery_capacity_ah") is not None:
            source="battery"
        elif "снегоубор" in title_n:
            source="fuel"
        if source:specs["power_source"]=source

        # For petrol machines 21vek may label starter supply as the machine's
        # "Источник питания" / "Напряжение аккумулятора". Keep that auxiliary
        # starter data separate from the main fuel class.
        if source=="fuel":
            current_raw=[x for x in raw if isinstance(x,dict) and str(x.get("path") or "").startswith("fd.attributes")]
            src_values=[norm(x.get("value")) for x in current_raw if x.get("key")=="power_source"]
            volt_values=[normalize_value("battery_voltage_v",str(x.get("value") or "")) for x in current_raw if x.get("key")=="battery_voltage_v"]
            volt_values=[float(x) for x in volt_values if x is not None]
            starter_source=None
            if any(any(t in v for t in ("сеть","220","230")) for v in src_values):
                starter_source="mains"
            elif any(any(t in v for t in ("аккумуля","батар","12 в","12v")) for v in src_values):
                starter_source="battery"
            if volt_values:
                vv=volt_values[0]
                if vv>=100:
                    starter_source=starter_source or "mains"
                    specs["starter_voltage_v"]=vv
                    specs.pop("battery_voltage_v",None)
                elif vv<=60:
                    starter_source=starter_source or "battery"
                    specs["starter_voltage_v"]=vv
                    specs.pop("battery_voltage_v",None)
            if starter_source:
                specs["starter_power_source"]=starter_source
                sf=snow_blower_start_family(specs.get("engine_start_type"))
                has_manual="manual" in sf
                if "electric" in sf:
                    specs["engine_start_type"]=("electric_"+starter_source)+("+manual" if has_manual else "")

    if any(r.get("spec_key")=="drive_type" for r in rules) and not specs.get("drive_type"):
        sn=norm(snow_name)
        if "гусен" in sn:specs["drive_type"]="гусеничный"
        elif "колес" in sn:specs["drive_type"]="колесный"

    blower_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="air_speed_ms" for r in rules):
        bn=norm(blower_name)
        source=None
        if "аккумулятор" in bn:source="battery"
        elif "бензин" in bn:source="fuel"
        elif "электрическ" in bn or "сетев" in bn:source="electric"
        else:
            source=leaf_blower_power_source_family(specs.get("power_source"))
        if source:specs["power_source"]=source

        if norm(specs.get("construction")) in ("двигателя","двигатель"):
            specs.pop("construction",None)
        if not specs.get("construction"):
            if any(x in bn for x in ("ранцев","рюкзач")):specs["construction"]="ранцевая"
            elif any(x in bn for x in ("ручн","переносн")):specs["construction"]="ручная"

        ft=leaf_blower_function_tokens(specs.get("functions"))
        if "воздуходув" in bn:ft.add("blow")
        if "пылесос" in bn:ft.add("vacuum")
        if "измельч" in bn or "мульч" in bn:ft.add("shred")
        if ft:specs["functions"]="+".join(sorted(ft))

        if source=="fuel" and specs.get("fuel_power_w") is None and specs.get("motor_power_w") is not None:
            specs["fuel_power_w"]=specs.get("motor_power_w")

    auger_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="max_auger_diameter_mm" for r in rules):
        an=norm(auger_name)
        if any(x in an for x in ("мотобур","бензобур","землебур")) and not specs.get("device_type"):
            specs["device_type"]="мотобур"
        if not specs.get("engine_type"):
            if any(x in an for x in ("2 такт","2-такт","двухтакт")):specs["engine_type"]="2-тактный"
            elif any(x in an for x in ("4 такт","4-такт","четырехтакт")):specs["engine_type"]="4-тактный"

    pruner_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="max_cut_diameter_mm" for r in rules):
        pn=norm(pruner_name)
        if "секатор" in pn:
            if not specs.get("device_type"):specs["device_type"]="аккумуляторный секатор" if "аккумулятор" in pn else "секатор"
            if not specs.get("tool_type"):specs["tool_type"]="секатор"
        elif "сучкорез" in pn and not specs.get("tool_type"):
            specs["tool_type"]="сучкорез"
        elif "ножниц" in pn and not specs.get("tool_type"):
            specs["tool_type"]="садовые ножницы"
        if any(x in pn for x in ("аккумулятор","battery","li ion","li-ion")):
            specs["power_source"]="battery"
        if specs.get("voltage_v") is None:
            vm=re.search(r"\b(\d+(?:[.,]\d+)?)\s*(?:в|v)\b",str(pruner_name).lower(),re.I)
            if vm:
                vv=float(vm.group(1).replace(",","."))
                if 5<=vv<=100:specs["voltage_v"]=vv
        if specs.get("battery_type") is None:
            if any(x in pn for x in ("li ion","li-ion","литий ион","литий-ион")):specs["battery_type"]="Li-Ion"
            elif any(x in pn for x in ("lifepo4","li fe po4")):specs["battery_type"]="LiFePO4"

    shredder_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="max_branch_diameter_mm" for r in rules):
        sn=norm(shredder_name)
        if (("измельч" in sn and ("сад" in sn or "вет" in sn)) or "шредер" in sn) and not specs.get("device_type"):
            specs["device_type"]="садовый измельчитель"
        existing_engine=str(specs.get("engine_type") or "")
        if any(x in sn for x in ("аккумуля","battery","li ion","li-ion")):
            specs["engine_type"]="аккумуляторный "+existing_engine
        elif any(x in sn for x in ("бензин","двс")):
            specs["engine_type"]="бензиновый "+existing_engine
        elif any(x in sn for x in ("электрическ","сетев")):
            specs["engine_type"]="сетевой электрический "+existing_engine
        elif specs.get("input_power_w") is not None and specs.get("voltage_v") is not None:
            try:
                vv=float(specs.get("voltage_v"))
                if 180<=vv<=420:specs["engine_type"]="сетевой электрический "+existing_engine
            except Exception:pass
        if specs.get("collector_present") is None and specs.get("collector_capacity_l") is not None:
            try:
                if float(specs.get("collector_capacity_l"))>0:specs["collector_present"]=True
            except Exception:pass

    gun_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="fuel_type" for r in rules):
        gun_family=heat_gun_family(gun_name,specs,raw)
        if gun_family: specs["fuel_type"]=gun_family
    else:
        gun_family=None
    if any(r.get("spec_key")=="heating_mode" for r in rules):
        gun_mode=heat_gun_heating_mode(gun_name,specs,raw,gun_family)
        if gun_mode: specs["heating_mode"]=gun_mode
    if any(r.get("spec_key")=="voltage_v" for r in rules) and specs.get("voltage_v") is None:
        vm=re.search(r"\b(220|230|380|400)\s*(?:в|v)\b",str(gun_name).lower(),re.I)
        if vm: specs["voltage_v"]=float(vm.group(1))
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


def electric_chainsaw_power_similarity(a: float,b: float) -> float:
    den=max(abs(a),abs(b),1e-9)
    diff=abs(a-b)/den
    if diff<=0.05:return 1.0
    if diff<=0.10:return 0.85
    if diff<=0.20:return 0.65
    return 0.0


def electric_chainsaw_bar_similarity(a: float,b: float) -> float:
    diff=abs(a-b)
    if diff<=2:return 1.0
    if diff<=5:return 0.85
    if diff<=10:return 0.65
    return 0.0


def electric_chainsaw_device_family(v: Any) -> str:
    n=norm(v)
    if "сабел" in n:return "reciprocating"
    if "дисков" in n or "циркуляр" in n:return "circular"
    if "торцов" in n:return "mitre"
    if "цепн" in n or "электропил" in n:return "chainsaw"
    return n


def electric_chainsaw_supply_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("аккумуля","батар","battery","li ion","li-ion")):return "battery"
    if any(x in n for x in ("сеть","сетев","220","230","розет","mains")):return "mains"
    return n


def electric_chainsaw_purpose_family(v: Any) -> str:
    n=norm(v)
    if "полупроф" in n:return "semi_professional"
    if "проф" in n:return "professional"
    if "бытов" in n:return "household"
    return n


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

    if profile=="chainsaw_electric":
        da=ours.get("device_type");db=comp.get("device_type")
        sa=ours.get("power_supply");sb=comp.get("power_supply")
        critical_missing=(da is None or db is None or sa is None or sb is None)

        if da is not None and db is not None:
            if electric_chainsaw_device_family(da)!=electric_chainsaw_device_family(db):
                return 0.0
        if sa is not None and sb is not None:
            if electric_chainsaw_supply_family(sa)!=electric_chainsaw_supply_family(sb):
                return 0.0

        total=used=allw=0.0
        for rule in rules:
            w=float(rule.get("weight") or 0)
            if w<=0:continue
            allw+=w
            k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="power_w":s=electric_chainsaw_power_similarity(float(a),float(b))
                elif k=="bar_length_cm":s=electric_chainsaw_bar_similarity(float(a),float(b))
                elif k=="device_type":
                    s=1.0 if electric_chainsaw_device_family(a)==electric_chainsaw_device_family(b) else 0.0
                elif k=="power_supply":
                    s=1.0 if electric_chainsaw_supply_family(a)==electric_chainsaw_supply_family(b) else 0.0
                elif k=="purpose":
                    s=1.0 if electric_chainsaw_purpose_family(a)==electric_chainsaw_purpose_family(b) else 0.0
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
        if critical_missing:score=min(score,69.0)
        return round(max(0,min(100,score)),2)

    if profile=="battery_pruner":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and battery_pruner_device_family(da)!=battery_pruner_device_family(db):
            return 0.0

        ta=battery_pruner_tool_family(ours.get("tool_type"))
        tb=battery_pruner_tool_family(comp.get("tool_type"))
        if ta and tb and ta!=tb:return 0.0

        pa=battery_pruner_source_family(ours.get("power_source"))
        pb=battery_pruner_source_family(comp.get("power_source"))
        if pa and pb and pa!=pb:return 0.0

        va=ours.get("voltage_v");vb=comp.get("voltage_v")
        if va is not None and vb is not None:
            ca=battery_pruner_voltage_class(va);cb=battery_pruner_voltage_class(vb)
            if ca and cb and ca!=cb:return 0.0

        weights={
          "device_type":0.08,"tool_type":0.14,"voltage_v":0.15,"power_source":0.14,
          "battery_type":0.07,"battery_capacity_ah":0.09,"knife_type":0.07,
          "blade_type":0.07,"max_cut_diameter_mm":0.19
        }
        required=("device_type","tool_type","voltage_v","power_source","max_cut_diameter_mm")
        critical_missing=any(ours.get(k) is None or comp.get(k) is None for k in required)
        total=used=0.0
        cutting_mismatch=False

        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="device_type":
                    s=1.0 if battery_pruner_device_family(a)==battery_pruner_device_family(b) else 0.0
                elif k=="tool_type":
                    s=1.0 if battery_pruner_tool_family(a)==battery_pruner_tool_family(b) else 0.0
                elif k=="power_source":
                    s=1.0 if battery_pruner_source_family(a)==battery_pruner_source_family(b) else 0.0
                elif k=="voltage_v":
                    ca=battery_pruner_voltage_class(a);cb=battery_pruner_voltage_class(b)
                    s=1.0 if ca is not None and cb is not None and ca==cb else 0.0
                elif k=="battery_type":
                    s=1.0 if battery_pruner_battery_family(a)==battery_pruner_battery_family(b) else 0.45
                elif k=="battery_capacity_ah":
                    s=battery_pruner_relative_similarity(float(a),float(b),0.15,0.25,0.40)
                elif k=="max_cut_diameter_mm":
                    s=battery_pruner_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="knife_type":
                    aa=battery_pruner_knife_family(a);bb=battery_pruner_knife_family(b)
                    s=1.0 if aa==bb else 0.40
                    if aa and bb and aa!=bb:cutting_mismatch=True
                elif k=="blade_type":
                    aa=battery_pruner_blade_family(a);bb=battery_pruner_blade_family(b)
                    s=1.0 if aa==bb else 0.40
                    if aa and bb and aa!=bb:cutting_mismatch=True
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w

        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        if cutting_mismatch:score=min(score,84.0)
        return round(max(0,min(100,score)),2)

    if profile=="garden_shredder":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and garden_shredder_device_family(da)!=garden_shredder_device_family(db):
            return 0.0

        ea=garden_shredder_engine_family(ours.get("engine_type"))
        eb=garden_shredder_engine_family(comp.get("engine_type"))
        if ea and eb and ea!=eb:return 0.0

        va=ours.get("voltage_v");vb=comp.get("voltage_v")
        if va is not None and vb is not None:
            ca=garden_shredder_voltage_class(va);cb=garden_shredder_voltage_class(vb)
            if ca and cb and ca!=cb:return 0.0

        weights={
          "device_type":0.07,"processed_material":0.08,"body_material":0.03,"cutting_mechanism":0.15,
          "input_power_w":0.14,"voltage_v":0.07,"noise_db":0.04,"cutting_speed_rpm":0.05,
          "max_branch_diameter_mm":0.17,"engine_type":0.10,"collector_capacity_l":0.04,
          "feed_openings_count":0.02,"collector_present":0.02,"collector_type":0.02
        }
        required=("cutting_mechanism","engine_type","input_power_w","max_branch_diameter_mm")
        critical_missing=any(ours.get(k) is None or comp.get(k) is None for k in required)
        total=used=0.0
        cutting_mismatch=False

        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="device_type":
                    s=1.0 if garden_shredder_device_family(a)==garden_shredder_device_family(b) else 0.0
                elif k=="engine_type":
                    s=1.0 if garden_shredder_engine_family(a)==garden_shredder_engine_family(b) else 0.0
                elif k=="voltage_v":
                    ca=garden_shredder_voltage_class(a);cb=garden_shredder_voltage_class(b)
                    s=1.0 if ca is not None and cb is not None and ca==cb else 0.0
                elif k=="processed_material":
                    aa=garden_shredder_material_tokens(a);bb=garden_shredder_material_tokens(b)
                    s=len(aa&bb)/max(1,len(aa|bb)) if aa and bb else categorical_similarity(a,b)
                elif k=="body_material":
                    s=1.0 if garden_shredder_body_family(a)==garden_shredder_body_family(b) else 0.65
                elif k=="cutting_mechanism":
                    aa=garden_shredder_cutting_family(a);bb=garden_shredder_cutting_family(b)
                    s=1.0 if aa==bb else 0.35
                    if aa and bb and aa!=bb:cutting_mismatch=True
                elif k=="input_power_w":
                    s=garden_shredder_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="noise_db":
                    s=garden_shredder_noise_similarity(float(a),float(b))
                elif k=="cutting_speed_rpm":
                    s=garden_shredder_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="max_branch_diameter_mm":
                    s=garden_shredder_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="collector_capacity_l":
                    s=garden_shredder_relative_similarity(float(a),float(b),0.15,0.30,0.45)
                elif k=="feed_openings_count":
                    s=1.0 if int(round(float(a)))==int(round(float(b))) else 0.65
                elif k=="collector_present":
                    s=1.0 if bool(a)==bool(b) else 0.65
                elif k=="collector_type":
                    s=1.0 if garden_shredder_collector_type_family(a)==garden_shredder_collector_type_family(b) else 0.65
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w

        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        if cutting_mismatch:score=min(score,84.0)
        return round(max(0,min(100,score)),2)

    if profile=="earth_auger":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and earth_auger_device_family(da)!=earth_auger_device_family(db):
            return 0.0

        ea=earth_auger_engine_family(ours.get("engine_type"))
        eb=earth_auger_engine_family(comp.get("engine_type"))
        if ea and eb and ea!=eb:return 0.0

        sa=ours.get("shaft_diameter_mm");sb=comp.get("shaft_diameter_mm")
        if sa is not None and sb is not None and abs(float(sa)-float(sb))>0.15:
            return 0.0

        weights={
          "device_type":0.10,"engine_type":0.12,"fuel_power_w":0.18,"fuel_tank_l":0.07,
          "rpm":0.06,"engine_cc":0.15,"max_auger_diameter_mm":0.20,"shaft_diameter_mm":0.12
        }
        required=("device_type","engine_type","fuel_power_w","max_auger_diameter_mm","shaft_diameter_mm")
        critical_missing=any(ours.get(k) is None or comp.get(k) is None for k in required)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="device_type":
                    s=1.0 if earth_auger_device_family(a)==earth_auger_device_family(b) else 0.0
                elif k=="engine_type":
                    s=1.0 if earth_auger_engine_family(a)==earth_auger_engine_family(b) else 0.0
                elif k=="shaft_diameter_mm":
                    s=1.0 if abs(float(a)-float(b))<=0.15 else 0.0
                elif k=="engine_cc":
                    s=earth_auger_relative_similarity(float(a),float(b),0.05,0.10,0.20)
                elif k in ("fuel_power_w","fuel_tank_l","rpm","max_auger_diameter_mm"):
                    s=earth_auger_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w

        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        return round(max(0,min(100,score)),2)

    if profile=="leaf_blower":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and leaf_blower_device_family(da)!=leaf_blower_device_family(db):
            return 0.0

        fa=leaf_blower_power_source_family(ours.get("power_source"))
        fb=leaf_blower_power_source_family(comp.get("power_source"))
        critical_missing=not fa or not fb
        if fa and fb and fa!=fb:return 0.0

        if fa=="fuel":
            weights={
              "device_type":0.08,"construction":0.12,"air_speed_ms":0.14,"engine_type":0.07,
              "power_source":0.10,"functions":0.08,"airflow_m3h":0.15,"noise_db":0.04,
              "fuel_power_w":0.09,"engine_cc":0.07,"fuel_tank_l":0.06
            }
        elif fa=="battery":
            weights={
              "device_type":0.08,"construction":0.10,"air_speed_ms":0.15,"engine_type":0.06,
              "power_source":0.10,"battery_type":0.05,"battery_capacity_ah":0.07,"battery_voltage_v":0.12,
              "rpm":0.05,"functions":0.08,"airflow_m3h":0.08,"noise_db":0.02,"motor_power_w":0.04
            }
        elif fa=="electric":
            weights={
              "device_type":0.10,"construction":0.12,"air_speed_ms":0.18,"engine_type":0.07,
              "power_source":0.12,"rpm":0.07,"functions":0.10,"airflow_m3h":0.16,
              "noise_db":0.03,"motor_power_w":0.05
            }
        else:
            return 0.0

        total=used=0.0
        construction_mismatch=False
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k in ("air_speed_ms","airflow_m3h","rpm"):
                    s=snow_blower_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k in ("motor_power_w","fuel_power_w","engine_cc"):
                    s=snow_blower_relative_similarity(float(a),float(b),0.05,0.10,0.20)
                elif k in ("battery_capacity_ah","fuel_tank_l"):
                    s=snow_blower_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="battery_voltage_v":
                    ca=snow_blower_battery_voltage_class(a);cb=snow_blower_battery_voltage_class(b)
                    s=1.0 if ca is not None and cb is not None and ca==cb else 0.0
                elif k=="noise_db":
                    s=leaf_blower_noise_similarity(float(a),float(b))
                elif k=="power_source":
                    s=1.0 if leaf_blower_power_source_family(a)==leaf_blower_power_source_family(b) else 0.0
                elif k=="device_type":
                    s=1.0 if leaf_blower_device_family(a)==leaf_blower_device_family(b) else 0.0
                elif k=="construction":
                    aa=leaf_blower_construction_family(a);bb=leaf_blower_construction_family(b)
                    s=1.0 if aa==bb else categorical_similarity(a,b)
                    if aa and bb and aa!=bb:construction_mismatch=True
                elif k=="functions":
                    s=leaf_blower_functions_similarity(a,b)
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w

        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,69.0)
        if construction_mismatch:score=min(score,84.0)
        return round(max(0,min(100,score)),2)

    if profile=="snow_blower":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and snow_blower_device_family(da)!=snow_blower_device_family(db):
            return 0.0

        fa=snow_blower_power_source_family(ours.get("power_source"))
        fb=snow_blower_power_source_family(comp.get("power_source"))
        if not fa or not fb:return 0.0
        if fa!=fb:return 0.0

        ta=snow_blower_type_tokens(ours.get("snow_blower_type"))
        tb=snow_blower_type_tokens(comp.get("snow_blower_type"))
        if ta and tb:
            for pair in (("self","non_self"),("one_stage","two_stage"),("one_stage","three_stage"),("two_stage","three_stage")):
                if (pair[0] in ta and pair[1] in tb) or (pair[1] in ta and pair[0] in tb):
                    return 0.0

        if fa=="fuel":
            weights={
              "device_type":0.10,"snow_blower_type":0.10,"clearing_width_cm":0.12,"intake_height_cm":0.08,
              "throw_distance_m":0.08,"drive_type":0.10,"operator_panel_control":0.04,"gears":0.08,
              "headlight":0.03,"motor_power_w":0.10,"engine_cc":0.05,"tank_l":0.03,
              "engine_start_type":0.03,"heated_handles":0.02,"clutch_type":0.02,"skid_height_adjustment":0.02
            }
        elif fa=="electric":
            weights={
              "device_type":0.12,"snow_blower_type":0.10,"power_source":0.10,"clearing_width_cm":0.18,
              "intake_height_cm":0.12,"throw_distance_m":0.10,"drive_type":0.08,"motor_power_w":0.12,
              "operator_panel_control":0.03,"headlight":0.02,"skid_height_adjustment":0.03
            }
        elif fa=="battery":
            weights={
              "device_type":0.10,"snow_blower_type":0.08,"power_source":0.08,"clearing_width_cm":0.16,
              "intake_height_cm":0.10,"throw_distance_m":0.10,"drive_type":0.07,"battery_capacity_ah":0.10,
              "battery_voltage_v":0.12,"operator_panel_control":0.03,"headlight":0.02,"skid_height_adjustment":0.04
            }
        else:
            return 0.0

        total=0.0
        track_wheel_mismatch=False
        used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k in ("clearing_width_cm","intake_height_cm"):
                    s=snow_blower_abs_similarity(float(a),float(b),3,5,10)
                elif k=="throw_distance_m":
                    s=snow_blower_abs_similarity(float(a),float(b),1,2,4)
                elif k in ("motor_power_w","engine_cc"):
                    s=snow_blower_relative_similarity(float(a),float(b),0.05,0.10,0.20)
                elif k in ("tank_l","battery_capacity_ah"):
                    s=snow_blower_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="battery_voltage_v":
                    ca=snow_blower_battery_voltage_class(a);cb=snow_blower_battery_voltage_class(b)
                    s=1.0 if ca is not None and cb is not None and ca==cb else 0.0
                elif k=="power_source":
                    s=1.0 if snow_blower_power_source_family(a)==snow_blower_power_source_family(b) else 0.0
                elif k=="device_type":
                    s=1.0 if snow_blower_device_family(a)==snow_blower_device_family(b) else 0.0
                elif k=="snow_blower_type":
                    aa=snow_blower_type_tokens(a);bb=snow_blower_type_tokens(b)
                    s=1.0 if aa and bb and aa==bb else categorical_similarity(a,b)
                elif k=="drive_type":
                    aa=snow_blower_drive_family(a);bb=snow_blower_drive_family(b)
                    s=1.0 if aa and bb and aa==bb else categorical_similarity(a,b)
                    if {aa,bb}=={"track","wheel"}:track_wheel_mismatch=True
                elif k=="engine_start_type":
                    s=categorical_similarity(snow_blower_start_family(a),snow_blower_start_family(b))
                elif k in ("operator_panel_control","headlight","heated_handles","skid_height_adjustment"):
                    s=1.0 if bool(a)==bool(b) else 0.0
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w

        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if track_wheel_mismatch:score=min(score,84.0)
        return round(max(0,min(100,score)),2)

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

    if profile=="heat_gun":
        fa=ours.get("fuel_type");fb=comp.get("fuel_type")
        if fa is None or fb is None:return 0.0
        if str(fa)!=str(fb):return 0.0

        if fa=="electric":
            ca=voltage_class(ours.get("voltage_v"));cb=voltage_class(comp.get("voltage_v"))
            if ca is None or cb is None:return 0.0
            if ca!=cb:return 0.0
            weights={
              "fuel_type":0.10,"power_w":0.25,"airflow_m3h":0.15,"voltage_v":0.15,
              "heater_type":0.10,"control_type":0.05,"thermostat_type":0.05,
              "overheat_protection":0.04,"power_adjustment":0.05,
              "temperature_adjustment":0.03,"fan_only_mode":0.03
            }
        elif fa=="gas":
            weights={
              "fuel_type":0.15,"power_w":0.30,"airflow_m3h":0.20,
              "fuel_consumption_kgh":0.10,"control_type":0.05,"thermostat_type":0.05,
              "overheat_protection":0.05,"power_adjustment":0.05,
              "temperature_adjustment":0.03,"fan_only_mode":0.02
            }
        elif fa=="diesel":
            ma=ours.get("heating_mode");mb=comp.get("heating_mode")
            if ma is None or mb is None:return 0.0
            if str(ma)!=str(mb):return 0.0
            weights={
              "fuel_type":0.10,"power_w":0.24,"airflow_m3h":0.15,"heating_mode":0.15,
              "fuel_consumption_kgh":0.10,"tank_l":0.08,"voltage_v":0.05,
              "control_type":0.03,"thermostat_type":0.03,"overheat_protection":0.03,
              "power_adjustment":0.02,"temperature_adjustment":0.01,"fan_only_mode":0.01
            }
        else:
            return 0.0

        total=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:
                continue
            try:
                if k=="power_w": s=heat_gun_power_similarity(float(a),float(b))
                elif k=="airflow_m3h": s=heat_gun_airflow_similarity(float(a),float(b))
                elif k in ("fuel_consumption_kgh","tank_l"): s=heat_gun_metric_similarity(float(a),float(b))
                elif k=="voltage_v":
                    ca=voltage_class(a);cb=voltage_class(b)
                    s=1.0 if ca is not None and cb is not None and ca==cb else 0.0
                elif k=="thermostat_type":
                    pa,pb=thermostat_present(a),thermostat_present(b)
                    s=1.0 if pa is not None and pb is not None and pa==pb else categorical_similarity(a,b)
                elif k in ("overheat_protection","power_adjustment","temperature_adjustment","fan_only_mode"):
                    s=1.0 if bool(a)==bool(b) else 0.0
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s
        return round(max(0,min(100,total*100)),2)

    if profile=="humidifier":
        # Approved humidifier formula: technical match only; price is checked later.
        da=ours.get("device_type");db=comp.get("device_type")
        device_missing=da is None or db is None
        if da is not None and db is not None:
            fa=humidifier_device_family(da);fb=humidifier_device_family(db)
            hard_classes={"diffuser","air_washer","air_purifier"}
            if (fa in hard_classes) != (fb in hard_classes):return 0.0
            if fa in hard_classes and fb in hard_classes and fa!=fb:return 0.0
            if fa.startswith("humidifier_") and fb.startswith("humidifier_") and fa!=fb:return 0.0

        total=used=allw=0.0
        for rule in rules:
            w=float(rule.get("weight") or 0)
            if w<=0:continue
            allw+=w
            k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
            if a is None or b is None:
                continue
            try:
                if k in ("output_mlh","area_m2","tank_l"):
                    s=humidifier_metric_similarity(float(a),float(b))
                elif k=="power_w":
                    s=humidifier_power_similarity(float(a),float(b))
                elif k=="technologies":
                    ta=humidifier_technology_family(a);tb=humidifier_technology_family(b)
                    s=1.0 if ta and tb and ta==tb else categorical_similarity(ta,tb)
                elif k=="power_supply":
                    pa=humidifier_power_supply_family(a);pb=humidifier_power_supply_family(b)
                    s=1.0 if pa and pb and pa==pb else categorical_similarity(pa,pb)
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
        if device_missing:score=min(score,69.0)
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


def snow_blower_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="engine_start_type":
        aa=snow_blower_start_family(a);bb=snow_blower_start_family(b)
        if aa==bb:return 50
        ae="electric" in aa;be="electric" in bb
        am="manual" in aa;bm="manual" in bb
        if ae and not be:return 78 if am else 70
        if be and not ae:return 22 if bm else 30
        return 50
    if k in ("headlight","heated_handles","operator_panel_control","skid_height_adjustment"):
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 70 if av and not bv else 30
    if k=="gears":
        def parts(v):
            m=re.match(r"^(\d+)\+(\d+)$",str(v or "").strip())
            return (int(m.group(1)),int(m.group(2))) if m else None
        aa=parts(a);bb=parts(b)
        if aa and bb:
            if aa==bb:return 50
            da=(aa[0]+aa[1])-(bb[0]+bb[1])
            return 60 if da>0 else (40 if da<0 else 50)
    return directional(rule,a,b)


def competitiveness(ours: dict,comp: dict,rules: list[dict],our_price: float|None,comp_price: float|None,profile: str="generic") -> float:
    price_available=our_price is not None and comp_price is not None and comp_price>0
    if price_available:
        rel=(comp_price-our_price)/comp_price
        price_score=max(0,min(100,50+rel*280))
    else: price_score=50
    s=w=0.0
    for rule in rules:
        if profile=="snow_blower":
            z=snow_blower_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="garden_shredder":
            z=garden_shredder_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="battery_pruner":
            z=battery_pruner_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        else:
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


def compare_texts(ours: dict,comp: dict,rules: list[dict],our_price: float|None,comp_price: float|None,position: int|None,mrc: float|None,profile: str="generic") -> tuple[list[str],list[str]]:
    adv=[];bad=[]
    if our_price is not None and comp_price:
        d=(comp_price-our_price)/comp_price*100
        if d>0.5: adv.append(f"Наша цена ниже на {d:.1f}%")
        elif d<-0.5: bad.append(f"Конкурент дешевле на {abs(d):.1f}%")
    for rule in rules:
        if float(rule.get("weight") or 0)<=0: continue
        k=rule["spec_key"];a=ours.get(k);b=comp.get(k)
        if a is None or b is None: continue
        if profile=="garden_shredder":
            z=garden_shredder_directional(rule,a,b)
        elif profile=="battery_pruner":
            z=battery_pruner_directional(rule,a,b)
        else:
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
    if profile=="earth_auger" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения мотобуров. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены тип двигателя, мощность, максимальный диаметр бура и посадочный диаметр."
    if profile=="garden_shredder" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения садовых измельчителей. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены режущий механизм, тип двигателя, входная мощность и максимальный диаметр веток."
    if profile=="battery_pruner" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения аккумуляторных секаторов. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены тип инструмента, аккумуляторное питание, напряжение и максимальная толщина среза."
    min_match=55 if profile in ("oil_radiator","fan_heater","heat_gun","humidifier","chainsaw_electric","snow_blower","leaf_blower","earth_auger","garden_shredder","battery_pruner") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 70)
    if similarity_score<min_match:
        return "Технического аналога нет: проверить пробел ассортимента. Не использовать эту пару для ценовой войны."
    if profile=="convector" and comp_price is None:
        return "Цена конкурента не получена. Итог рассчитан только по техническим характеристикам; решение по цене не принимать."
    if status=="data_incomplete":
        return "У конкурента не подтверждены важные характеристики. Не считать его сильнее только из-за цены: сначала подтвердить тип запуска и недостающие функции."
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
            gap_threshold=55 if profile in ("oil_radiator","fan_heater","heat_gun","humidifier","chainsaw_electric","snow_blower","leaf_blower","earth_auger","garden_shredder","battery_pruner") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 70)
            candidate_threshold=50 if profile in ("earth_auger","garden_shredder","battery_pruner") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 55)
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
                    comp_specs=p.get("specs_normalized") or {}
                    if profile=="snow_blower":
                        our_start=snow_blower_start_family(ours["specs_normalized"].get("engine_start_type"))
                        comp_start=comp_specs.get("engine_start_type")
                        if "electric" in our_start and comp_start is None and status=="competitor_stronger":
                            status="data_incomplete"
                    if profile=="earth_auger":
                        req=("device_type","engine_type","fuel_power_w","max_auger_diameter_mm","shaft_diameter_mm")
                        if any(ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None for k in req):
                            status="data_incomplete"
                    if profile=="garden_shredder":
                        req=("cutting_mechanism","engine_type","input_power_w","max_branch_diameter_mm")
                        if any(ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None for k in req):
                            status="data_incomplete"
                    if profile=="battery_pruner":
                        req=("device_type","tool_type","voltage_v","power_source","max_cut_diameter_mm")
                        if any(ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None for k in req):
                            status="data_incomplete"
                    adv,bad=compare_texts(
                      ours["specs_normalized"],comp_specs,rules,op,cp,p.get("position"),mr,profile
                    )
                    if profile=="snow_blower" and "electric" in snow_blower_start_family(ours["specs_normalized"].get("engine_start_type")) and comp_specs.get("engine_start_type") is None:
                        bad.append("У конкурента нет данных по типу запуска: нельзя считать электростартер равным отсутствующим данным")
                    if profile=="earth_auger":
                        missing=[k for k in ("device_type","engine_type","fuel_power_w","max_auger_diameter_mm","shaft_diameter_mm") if ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None]
                        if missing:
                            bad.append("Недостаточно данных по критическим характеристикам мотобура — вывод сильнее/слабее заблокирован")
                    if profile=="garden_shredder":
                        missing=[k for k in ("cutting_mechanism","engine_type","input_power_w","max_branch_diameter_mm") if ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None]
                        if missing:
                            bad.append("Недостаточно данных по критическим характеристикам садового измельчителя — вывод сильнее/слабее заблокирован")
                    if profile=="battery_pruner":
                        missing=[k for k in ("device_type","tool_type","voltage_v","power_source","max_cut_diameter_mm") if ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None]
                        if missing:
                            bad.append("Недостаточно данных по критическим характеристикам аккумуляторного секатора — вывод сильнее/слабее заблокирован")
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
