#!/usr/bin/env python3
"""Triovist / 21vek automatic market analysis v23.6.393.

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
PARSER_VERSION="market-auto-v6.23"
RULESET_VERSION="rules-v5"
SEARCH_ENDPOINT="https://gate.21vek.by/search-composer/api/v3/products"
UA="ResantaCRM-21vekMarket/1.0 (+https://resanta-crm.by)"
DELAY=max(0.10,float(os.environ.get("MARKET_DELAY_SECONDS","0.22")))
TIMEOUT=max(10,int(os.environ.get("MARKET_HTTP_TIMEOUT","30")))
SPEC_TTL_DAYS=max(1,int(os.environ.get("MARKET_SPEC_TTL_DAYS","30")))
VALIDATE_PROFILES={
    x.strip() for x in os.environ.get("MARKET_VALIDATE_PROFILES","").split(",") if x.strip()
}
VALIDATE_EXACT=str(os.environ.get("MARKET_VALIDATE_EXACT","")).strip().lower() in {"1","true","yes","on"}
# Scheduled production runs keep every approved profile. For a deliberate
# targeted maintenance run, MARKET_VALIDATE_EXACT=1 limits work strictly to
# the named profiles so working-hours fixes do not recalculate the whole market.
if VALIDATE_PROFILES and not VALIDATE_EXACT:
    VALIDATE_PROFILES.update({
        "earth_auger","garden_shredder","battery_pruner","sprayer",
        "impact_wrench","circular_saw","impact_drill","cordless_screwdriver","paint_sprayer","jigsaw","rotary_hammer","planer","reciprocating_saw","construction_vacuum","construction_heat_gun","miter_saw","bench_grinder","angle_grinder","concrete_mixer","grain_crusher","washstand","compressor","circulation_pump","drainage_pump","fecal_pump","sewage_station","surface_pump","borehole_pump"
    })
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


def rest_delete(table: str, filt: dict[str,str], timeout: int=20, attempts: int=3) -> None:
    # DELETEs are idempotent here. A busy PostgREST/Supabase connection must not
    # destroy a whole market run: retry short transient waits instead of hanging
    # for a minute and failing after all 21vek cards have already been parsed.
    last=None
    for attempt in range(1,max(1,attempts)+1):
        try:
            r=requests.delete(
                f"{SUPABASE_URL}/rest/v1/{table}",
                headers=api_headers(False,"return=minimal"),params=filt,timeout=timeout
            )
            if r.status_code in (200,204):
                return
            body=r.text[:1000]
            if r.status_code not in (408,409,423,429,500,502,503,504):
                raise RuntimeError(f"DELETE {table}: {r.status_code} {body}")
            last=RuntimeError(f"DELETE {table}: transient {r.status_code} {body}")
        except (requests.Timeout,requests.ConnectionError) as exc:
            last=exc
        if attempt<attempts:
            time.sleep(1.5*attempt)
    raise RuntimeError(f"DELETE {table} failed after {attempts} attempts: {last}")



def rest_rpc(name: str, payload: dict|None=None, timeout: int=60, attempts: int=3) -> Any:
    last=None
    for attempt in range(1,max(1,attempts)+1):
        try:
            r=requests.post(
                f"{SUPABASE_URL}/rest/v1/rpc/{name}",
                headers=api_headers(True),
                json=payload or {},
                timeout=timeout
            )
            if r.status_code not in (200,201,204):
                raise RuntimeError(f"RPC {name}: {r.status_code} {r.text[:1200]}")
            return None if r.status_code==204 or not r.text.strip() else r.json()
        except Exception as exc:
            last=exc
            if attempt>=attempts:break
            time.sleep(1.2*attempt)
    raise last


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
    if "опрыскив" in n: return "sprayer"
    if "гайковерт" in n or "гайковёрт" in n: return "impact_wrench"
    if "торцов" in n and "пил" in n: return "miter_saw"
    if "точильн" in n and "станок" in n: return "bench_grinder"
    if "точильно шлифовальн" in n and "станок" in n: return "bench_grinder"
    if "углошлиф" in n or ("болгар" in n and "машин" in n) or re.search(r"\bа?ушм\b",n): return "angle_grinder"
    if "бетономеш" in n or "бетоносмес" in n: return "concrete_mixer"
    if "зернодроб" in n or ("измельч" in n and "зерн" in n): return "grain_crusher"
    if "умываль" in n: return "washstand"
    if "компрессор" in n: return "compressor"
    if ("фекаль" in n or "фекал" in n) and "насос" in n: return "fecal_pump"
    if "канализац" in n and any(x in n for x in ("станц","установ")): return "sewage_station"
    if "поверхност" in n and "насос" in n: return "surface_pump"
    if "скважин" in n and "насос" in n: return "borehole_pump"
    if "циркуляц" in n and "насос" in n: return "circulation_pump"
    if "дренаж" in n and "насос" in n: return "drainage_pump"
    if ("дисков" in n and "пил" in n) or "циркуляр" in n: return "circular_saw"
    if "шуруповерт" in n and "аккумулятор" in n: return "cordless_screwdriver"
    if "краскопульт" in n: return "paint_sprayer"
    if "лобзик" in n: return "jigsaw"
    if "перфоратор" in n: return "rotary_hammer"
    if "рубан" in n: return "planer"
    if "сабельн" in n and "пил" in n: return "reciprocating_saw"
    if "строительн" in n and "пылесос" in n: return "construction_vacuum"
    if "пылесос строительн" in n: return "construction_vacuum"
    if "термопистолет" in n or (("строительн" in n or "техническ" in n) and "фен" in n): return "construction_heat_gun"
    if "дрел" in n and "удар" in n and "шуруповерт" not in n: return "impact_drill"
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
      "sprayer":"опрыскиватель",
      "impact_wrench":"гайковерт",
      "circular_saw":"дисковая пила",
      "miter_saw":"торцовочная пила",
      "bench_grinder":"точильный станок",
      "angle_grinder":"угловая шлифовальная машина",
      "concrete_mixer":"бетономешалка",
      "grain_crusher":"зернодробилка",
      "washstand":"умывальник дачный",
      "compressor":"компрессор",
      "circulation_pump":"циркуляционный насос",
      "drainage_pump":"дренажный насос",
      "fecal_pump":"фекальный насос",
      "sewage_station":"канализационный насос",
      "surface_pump":"поверхностный насос",
      "borehole_pump":"скважинный насос",
      "impact_drill":"дрель ударная",
      "cordless_screwdriver":"аккумуляторный шуруповерт",
      "paint_sprayer":"краскопульт",
      "jigsaw":"лобзик",
      "rotary_hammer":"перфоратор",
      "planer":"электрорубанок",
      "reciprocating_saw":"сабельная пила",
      "construction_vacuum":"строительный пылесос",
      "construction_heat_gun":"строительный фен",
    }.get(profile)
    return q or clean_label(label)


def scope_key(profile: str, query: str) -> str:
    return profile+"-"+hashlib.sha1(norm(query).encode("utf-8")).hexdigest()[:8]


def load_price_scope() -> tuple[list[dict],dict[str,set[str]],dict[str,str]]:
    climate=rest_get_all("price_list",{
      "category":"eq.Климатическое оборудование",
      "select":"sku,product,category,subgroup,uploaded_at"
    },page_size=800)
    garden=rest_get_all("price_list",{
      "category":"eq.Садовая техника",
      "select":"sku,product,category,subgroup,uploaded_at"
    },page_size=800)
    all_price=rest_get_all("price_list",{
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
      ("Опрыскиватели","sprayer","опрыскив"),
      ("Гайковерты","impact_wrench","гайковерт"),
      ("Дисковые пилы","circular_saw","дисков"),
      ("Торцовочные пилы","miter_saw","торцов"),
      ("Точильные станки","bench_grinder","точильн"),
      ("Углошлифовальные машины","angle_grinder","углошлиф"),
      ("Бетономешалки","concrete_mixer","бетономеш"),
      ("Зернодробилки","grain_crusher","зернодроб"),
      ("Умывальники","washstand","умываль"),
      ("Компрессоры","compressor","компрессор"),
      ("Циркуляционные насосы","circulation_pump","циркуляц"),
      ("Дренажные насосы","drainage_pump","дренаж"),
      ("Фекальные насосы","fecal_pump","фекал"),
      ("Канализационные станции","sewage_station","канализац"),
      ("Поверхностные насосы","surface_pump","поверхност"),
      ("Скважинные насосы","borehole_pump","скважин"),
      ("Дрели ударные","impact_drill","дрел"),
      ("Шуруповерты аккумуляторные","cordless_screwdriver","шуруповерт"),
      ("Краскопульты","paint_sprayer","краскопульт"),
      ("Лобзики","jigsaw","лобзик"),
      ("Перфораторы","rotary_hammer","перфоратор"),
      ("Рубанки","planer","рубан"),
      ("Сабельные пилы","reciprocating_saw","сабельн"),
      ("Строительные пылесосы","construction_vacuum","пылесос"),
      ("Термопистолеты","construction_heat_gun","термопистолет"),
    ]:
        query=query_for(label,profile);key=scope_key(profile,query)
        skus=set()
        source_rows=all_price if profile in ("impact_wrench","circular_saw","impact_drill","cordless_screwdriver","paint_sprayer","jigsaw","rotary_hammer","planer","reciprocating_saw","construction_vacuum","construction_heat_gun","miter_saw","bench_grinder","angle_grinder","concrete_mixer","grain_crusher","washstand","compressor","circulation_pump","drainage_pump","fecal_pump","sewage_station","surface_pump","borehole_pump") else garden
        for x in source_rows:
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
            elif profile=="sprayer":
                matched=("опрыскив" in pn
                         and "запчаст" not in pn and "форсунк" not in pn and "шланг" not in pn
                         and not sku.startswith("900/"))
            elif profile=="impact_wrench":
                matched=(("гайковерт" in pn or "гайковёрт" in pn)
                         and "насадк" not in pn and "головк" not in pn
                         and not sku.startswith("900/"))
            elif profile=="circular_saw":
                matched=((("дисков" in pn and "пил" in pn) or ("циркуляр" in pn and "пил" in pn))
                         and "торцов" not in pn
                         and "станок" not in pn and "диск для" not in pn and "пильн диск" not in pn
                         and "направляющ" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            elif profile=="miter_saw":
                matched=("торцов" in pn and "пил" in pn
                         and "диск для" not in pn and "пильн диск" not in pn
                         and "станин" not in pn and "стол для" not in pn and "подставк" not in pn
                         and "запчаст" not in pn and not sku.startswith("900/"))
            elif profile=="bench_grinder":
                matched=("точильн" in pn and "станок" in pn
                         and "камень для" not in pn and "круг для" not in pn
                         and "заточный многофункцион" not in pn and "для цеп" not in pn
                         and "запчаст" not in pn and not sku.startswith("900/"))
            elif profile=="angle_grinder":
                matched=(("углошлиф" in pn or re.search(r"\bа?ушм\b",pn))
                         and "полировальн" not in pn
                         and "диск для" not in pn and "щетк" not in pn and "щёт" not in pn
                         and "ручк" not in pn and "ключ для" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            elif profile=="concrete_mixer":
                matched=(sku.startswith("74/1/")
                         and ("бетономеш" in pn or "бетоносмес" in pn)
                         and not any(x in pn for x in ("венец для","двигатель для","лопасть для","ремень для","запчаст","шестерн для")))
            elif profile=="grain_crusher":
                matched=(sku.startswith("74/2/")
                         and "зернодроб" in pn
                         and not sku.startswith("900/")
                         and not any(x in pn for x in ("сито для","нож для","решетк","решётк","ремень для","двигатель для","запчаст","комплект для")))
            elif profile=="washstand":
                matched=(sku.startswith("74/4/")
                         and "умываль" in pn
                         and not sku.startswith("900/")
                         and not any(x in pn for x in ("бак для","тэн для","тен для","кран для","мойка для","раковина для","запчаст","комплект для")))
            elif profile=="compressor":
                matched=((sku.startswith("74/3/") or sku.startswith("74/7/"))
                         and "компрессор" in pn
                         and not any(x in pn for x in ("масло компресс","шланг","фильтр для","ремень для","головка для","запчаст","набор для","пистолет")))
            elif profile=="circulation_pump":
                matched=("циркуляц" in pn and "насос" in pn
                         and "шланг" not in pn and "муфт" not in pn and "патруб" not in pn
                         and "переходник" not in pn and "фильтр для" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            elif profile=="drainage_pump":
                matched=("дренаж" in pn and "насос" in pn
                         and "шланг" not in pn and "муфт" not in pn and "патруб" not in pn
                         and "переходник" not in pn and "фильтр для" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            elif profile=="fecal_pump":
                matched=(("фекаль" in pn or "фекал" in pn) and "насос" in pn
                         and "шланг" not in pn and "муфт" not in pn and "патруб" not in pn
                         and "переходник" not in pn and "фильтр для" not in pn and "запчаст" not in pn
                         and "ремкомплект" not in pn and not sku.startswith("900/"))
            elif profile=="sewage_station":
                matched=("канализац" in pn and any(x in pn for x in ("насос","станц","установ"))
                         and "запчаст" not in pn and "шланг" not in pn and "муфт" not in pn
                         and "патруб" not in pn and "переходник" not in pn
                         and not sku.startswith("900/"))
            elif profile=="surface_pump":
                matched=("поверхност" in pn and "насос" in pn
                         and "станц" not in pn and "насосная станц" not in pn
                         and "запчаст" not in pn and "шланг" not in pn and "муфт" not in pn
                         and "патруб" not in pn and "переходник" not in pn
                         and not sku.startswith("900/"))
            elif profile=="borehole_pump":
                matched=("скважин" in pn and "насос" in pn
                         and "ремкомплект" not in pn and "запчаст" not in pn
                         and "винт и корпус" not in pn
                         and not sku.startswith("900/"))
            elif profile=="impact_drill":
                matched=("дрел" in pn and "удар" in pn
                         and "шуруповерт" not in pn and "миксер" not in pn and "перфоратор" not in pn
                         and not sku.startswith("900/"))
            elif profile=="cordless_screwdriver":
                matched=("шуруповерт" in pn and "аккумулятор" in pn
                         and "винтоверт" not in pn and "гайковерт" not in pn and "перфоратор" not in pn
                         and not sku.startswith("900/"))
            elif profile=="paint_sprayer":
                matched=("краскопульт" in pn
                         and "пневмат" not in pn and "аэрограф" not in pn
                         and not ("окрасоч" in pn and "аппарат" in pn)
                         and not ("покрасоч" in pn and "станц" in pn)
                         and "безвоздуш" not in pn
                         and not sku.startswith("900/"))
            elif profile=="jigsaw":
                matched=("лобзик" in pn
                         and "пилк" not in pn and "полотн" not in pn and "набор" not in pn
                         and "ручной" not in pn
                         and not sku.startswith("900/"))
            elif profile=="rotary_hammer":
                matched=("перфоратор" in pn
                         and "патрон для" not in pn and "бур " not in pn and "набор бур" not in pn
                         and "насадк" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            elif profile=="planer":
                matched=("рубан" in pn
                         and "ручн" not in pn and "рашпил" not in pn and "гипсокарт" not in pn
                         and "нож для" not in pn and "ножи для" not in pn and "лезв" not in pn
                         and "ремень для" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            elif profile=="reciprocating_saw":
                matched=("сабельн" in pn and "пил" in pn
                         and "полотно" not in pn and "полотн" not in pn and "пилка" not in pn
                         and "насадк" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            elif profile=="construction_vacuum":
                matched=("пылесос" in pn and "строительн" in pn
                         and "мешк" not in pn and "фильтр" not in pn and "шланг" not in pn
                         and "моющ" not in pn and "мойка пылесос" not in pn
                         and not sku.startswith("900/"))
            elif profile=="construction_heat_gun":
                matched=("термопистолет" in pn
                         and "клеев" not in pn and "термокле" not in pn
                         and "насадк" not in pn and "запчаст" not in pn
                         and not sku.startswith("900/"))
            if matched:skus.add(sku)
        if skus:
            groups[key]={
              "scope_key":key,"source_category":("Оборудование" if profile in ("concrete_mixer","grain_crusher","washstand","compressor") else ("Насосы" if profile in ("circulation_pump","drainage_pump","fecal_pump","sewage_station","surface_pump","borehole_pump") else ("Инструмент" if profile in ("impact_wrench","circular_saw","impact_drill","cordless_screwdriver","paint_sprayer","jigsaw","rotary_hammer","planer","reciprocating_saw","construction_vacuum","construction_heat_gun","miter_saw","bench_grinder","angle_grinder") else "Садовая техника"))),"source_subgroup":label,
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
    price_names={}
    for x in all_price:
        sku=str(x.get("sku") or "").strip()
        name=str(x.get("product") or "").strip()
        if sku and name and sku_depth(sku)>=3:
            price_names[sku]=name
    return scopes,own,price_names


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
    if any(x in n for x in ("пневм","compressed air","air powered")):return "pneumatic"
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










def construction_heat_gun_required_missing(ours: dict,comp: dict) -> bool:
    return any(ours.get(k) is None or comp.get(k) is None for k in ("airflow_lmin","heating_time_sec","input_power_w"))


def construction_heat_gun_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def construction_heat_gun_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    av=float(a);bv=float(b)
    if k=="airflow_lmin":
        if abs(av-bv)<=50:return 50
        return 68 if av>bv else 32
    if k=="heating_time_sec":
        if abs(av-bv)<=10:return 50
        return 70 if av<bv else 30
    if k=="input_power_w":
        if abs(av-bv)<=150:return 50
        return 66 if av>bv else 34
    return directional(rule,a,b)


def construction_vacuum_cleaning_family(v: Any) -> str:
    n=norm(v)
    has_dry=any(x in n for x in ("сух", "dry"))
    has_wet=any(x in n for x in ("влаж", "wet", "жидкост", "сбор воды", "сбор жидкости"))
    if has_dry and has_wet:return "dry_wet"
    if has_wet:return "wet"
    if has_dry:return "dry"
    return n


def construction_vacuum_body_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("нержав", "stainless", "inox")):return "stainless"
    has_metal=any(x in n for x in ("металл","сталь","алюмин","metal","steel"))
    has_plastic=any(x in n for x in ("пласт","полимер","plastic"))
    if has_metal and has_plastic:return "metal_plastic"
    if has_metal:return "metal"
    if has_plastic:return "plastic"
    return n


def construction_vacuum_required_missing(ours: dict,comp: dict) -> bool:
    required=("input_power_w","tank_capacity_l","vacuum_cleaning_type","vacuum_body_material")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def construction_vacuum_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def construction_vacuum_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=150:return 50
        return 66 if av>bv else 34
    if k=="tank_capacity_l":
        av=float(a);bv=float(b)
        if abs(av-bv)<=5:return 50
        return 68 if av>bv else 32
    if k=="vacuum_cleaning_type":
        aa=construction_vacuum_cleaning_family(a);bb=construction_vacuum_cleaning_family(b)
        if aa==bb:return 50
        if aa=="dry_wet" and bb in ("dry","wet"):return 72
        if bb=="dry_wet" and aa in ("dry","wet"):return 28
        return 50
    if k=="vacuum_body_material":
        aa=construction_vacuum_body_family(a);bb=construction_vacuum_body_family(b)
        if aa==bb:return 50
        strong={"metal","stainless","metal_plastic"}
        if aa in strong and bb=="plastic":return 65
        if bb in strong and aa=="plastic":return 35
        return 50
    return directional(rule,a,b)


def reciprocating_saw_source_family(v: Any) -> str:
    return circular_saw_source_family(v)


def reciprocating_saw_required_missing(ours: dict,comp: dict) -> bool:
    required=("power_source","input_power_w","motor_type","cut_depth_wood_mm","cut_depth_metal_mm","strokes_per_min")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def reciprocating_saw_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def reciprocating_saw_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="power_source":return 50
    if k=="motor_type":
        aa=impact_wrench_motor_family(a);bb=impact_wrench_motor_family(b)
        if aa==bb:return 50
        if aa=="brushless" and bb=="brushed":return 72
        if aa=="brushed" and bb=="brushless":return 28
        return 50
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=150:return 50
        return 66 if av>bv else 34
    if k=="cut_depth_wood_mm":
        av=float(a);bv=float(b)
        if abs(av-bv)<=20:return 50
        return 70 if av>bv else 30
    if k=="cut_depth_metal_mm":
        av=float(a);bv=float(b)
        if abs(av-bv)<=2:return 50
        return 70 if av>bv else 30
    if k=="strokes_per_min":return 50
    return directional(rule,a,b)


def planer_required_missing(ours: dict,comp: dict) -> bool:
    # Motor type is useful when 21vek provides it, but must not manufacture a gap.
    return any(ours.get(k) is None or comp.get(k) is None for k in ("max_rpm","planing_depth_mm","planing_width_mm"))


def planer_data_incomplete(ours: dict,comp: dict) -> bool:
    # UI still warns that motor type is missing even though the three confirmed
    # planing metrics are sufficient to select an analogue.
    return any(ours.get(k) is None or comp.get(k) is None for k in ("motor_type","max_rpm","planing_depth_mm","planing_width_mm"))


def planer_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def planer_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="motor_type":
        aa=impact_wrench_motor_family(a);bb=impact_wrench_motor_family(b)
        if aa==bb:return 50
        if aa=="brushless" and bb=="brushed":return 72
        if aa=="brushed" and bb=="brushless":return 28
        return 50
    if k=="planing_depth_mm":
        av=float(a);bv=float(b)
        if abs(av-bv)<=0.5:return 50
        return 70 if av>bv else 30
    if k in ("max_rpm","planing_width_mm"):return 50
    return directional(rule,a,b)


def rotary_hammer_chuck_family(v: Any) -> str:
    raw=str(v or "").strip().lower().replace("ё","е")
    n=norm(v)
    if re.search(r"\bsds\s*[- ]?max\b",raw,re.I) or "sds max" in n:return "sds_max"
    if re.search(r"\bsds\s*\+",raw,re.I) or re.search(r"\bsds\s*[- ]?plus\b",raw,re.I) or "sds plus" in n:return "sds_plus"
    if re.search(r"\bsds\s*[- ]?top\b",raw,re.I) or "sds top" in n:return "sds_top"
    if any(x in n for x in ("шестигран","hex")):return "hex"
    if any(x in n for x in ("быстрозажим","quick release","quick-release","keyless")):return "keyless"
    if any(x in n for x in ("ключевой","зубчато венц","keyed")):return "keyed"
    return n


def rotary_hammer_required_missing(ours: dict,comp: dict) -> bool:
    return any(ours.get(k) is None or comp.get(k) is None for k in ("chuck_type","input_power_w","impact_energy_j","max_rpm"))


def rotary_hammer_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def rotary_hammer_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="chuck_type":return 50
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=150:return 50
        return 66 if av>bv else 34
    if k=="impact_energy_j":
        av=float(a);bv=float(b)
        if abs(av-bv)<=0.5:return 50
        return 72 if av>bv else 28
    if k=="max_rpm":return 50
    return directional(rule,a,b)


def jigsaw_device_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("сабельн","reciprocating")):return "reciprocating_saw"
    if any(x in n for x in ("ручной лобзик","manual jigsaw")):return "manual_jigsaw"
    if "лобзик" in n or "jigsaw" in n:return "jigsaw"
    return n


def jigsaw_source_family(v: Any) -> str:
    return circular_saw_source_family(v)


def jigsaw_required_missing(ours: dict,comp: dict) -> bool:
    required=("cut_depth_wood_mm","strokes_per_min")
    if any(ours.get(k) is None or comp.get(k) is None for k in required):return True
    source=jigsaw_source_family(ours.get("power_source") or comp.get("power_source"))
    if source=="mains":
        return ours.get("input_power_w") is None or comp.get("input_power_w") is None
    return False


def jigsaw_power_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))
    if d<=100:return 1.0
    if d<=200:return 0.85
    if d<=300:return 0.65
    return 0.0


def jigsaw_relative_similarity(a: float,b: float,full: float=0.10,close: float=0.20,partial: float=0.30) -> float:
    d=abs(float(a)-float(b))/max(abs(float(a)),abs(float(b)),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def jigsaw_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=100:return 50
        return 66 if av>bv else 34
    if k=="cut_depth_wood_mm":
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.10:return 50
        return 70 if av>bv else 30
    if k=="motor_type":
        aa=impact_wrench_motor_family(a);bb=impact_wrench_motor_family(b)
        if aa==bb:return 50
        if aa=="brushless" and bb=="brushed":return 72
        if aa=="brushed" and bb=="brushless":return 28
        return 50
    if k in ("strokes_per_min","device_type","power_source"):return 50
    return directional(rule,a,b)


def paint_sprayer_device_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("аэрограф","airbrush")):return "airbrush"
    if any(x in n for x in ("пневмат","compressed air","air spray gun")):return "pneumatic_spray_gun"
    if (("окрасоч" in n and "аппарат" in n) or ("покрасоч" in n and "станц" in n)
        or "безвоздуш" in n or "airless" in n):return "paint_station"
    if "краскопульт" in n or "paint sprayer" in n or "spray gun" in n:return "electric_spray_gun"
    return n


def paint_sprayer_tank_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("верхн","сверху","top","upper")):return "upper"
    if any(x in n for x in ("нижн","снизу","bottom","lower")):return "lower"
    if any(x in n for x in ("выносн","отдельн","раздельн","remote","separate")):return "remote"
    return n


def paint_sprayer_required_missing(ours: dict,comp: dict) -> bool:
    return any(ours.get(k) is None or comp.get(k) is None for k in ("input_power_w","pressure_bar"))


def paint_sprayer_power_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))
    if d<=100:return 1.0
    if d<=200:return 0.85
    if d<=300:return 0.65
    return 0.0


def paint_sprayer_pressure_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))/max(abs(float(a)),abs(float(b)),1e-9)
    if d<=0.10:return 1.0
    if d<=0.20:return 0.85
    if d<=0.30:return 0.65
    return 0.0


def paint_sprayer_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=100:return 50
        return 66 if av>bv else 34
    if k=="pressure_bar":
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.10:return 50
        return 68 if av>bv else 32
    if k in ("tank_position","device_type"):return 50
    return directional(rule,a,b)


def screwdriver_device_family(v: Any) -> str:
    n=norm(v)
    if "гайковерт" in n or "гайковёрт" in str(v or "").lower():return "impact_wrench"
    if "перфоратор" in n:return "rotary_hammer"
    if "винтоверт" in n or "винтовёрт" in str(v or "").lower() or "impact driver" in n:return "impact_driver"
    if "дрел" in n and "шуруповерт" in n:return "screwdriver"
    if "шуруповерт" in n:return "screwdriver"
    if "дрел" in n:return "drill"
    return n


def screwdriver_required_missing(ours: dict,comp: dict) -> bool:
    return any(ours.get(k) is None or comp.get(k) is None for k in ("battery_capacity_ah","max_torque_nm"))


def screwdriver_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))/max(abs(float(a)),abs(float(b)),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def screwdriver_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="motor_type":
        aa=impact_wrench_motor_family(a);bb=impact_wrench_motor_family(b)
        if aa==bb:return 50
        if aa=="brushless" and bb=="brushed":return 72
        if aa=="brushed" and bb=="brushless":return 28
        return 50
    if k in ("impact_present","case_present"):
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 68 if av else 32
    if k=="battery_count":
        av=float(a);bv=float(b)
        if av==bv:return 50
        return 68 if av>bv else 32
    if k=="battery_capacity_ah":
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.15:return 50
        return 64 if av>bv else 36
    if k=="max_torque_nm":
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.10:return 50
        return 70 if av>bv else 30
    if k=="device_type":return 50
    return directional(rule,a,b)


def impact_drill_device_family(v: Any) -> str:
    n=norm(v)
    if "перфоратор" in n or "rotary hammer" in n:return "rotary_hammer"
    if "шуруповерт" in n or "drill driver" in n:return "drill_driver"
    if "миксер" in n:return "drill_mixer"
    if "дрел" in n:
        if any(x in n for x in ("безудар","без удара","non impact","non-impact")):return "drill_nonimpact"
        if any(x in n for x in ("удар","impact")):return "impact_drill"
        return "drill"
    return n


def impact_drill_required_missing(ours: dict,comp: dict) -> bool:
    required=("input_power_w","max_rpm","impact_present")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def impact_drill_power_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))
    if d<=100:return 1.0
    if d<=200:return 0.85
    if d<=300:return 0.65
    return 0.0


def impact_drill_rpm_similarity(a: float,b: float) -> float:
    return circular_saw_relative_similarity(float(a),float(b),0.10,0.20,0.30)


def impact_drill_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=100:return 50
        return 66 if av>bv else 34
    if k=="speed_count":
        av=float(a);bv=float(b)
        if av==bv:return 50
        return 62 if av>bv else 38
    if k in ("max_rpm","impact_present","device_type"):
        return 50
    return directional(rule,a,b)






def drainage_pump_body_material_part(v: Any) -> str:
    """Возвращает именно материал КОРПУСА, не материал насосной части/крыльчатки."""
    raw=str(v or "").strip()
    if not raw:return ""
    low=raw.lower().replace("ё","е")
    # 21vek встречается в виде: "алюминий (корпус), чугун (насос)".
    # Раньше слово "чугун" перехватывало всю строку, и корпус ошибочно становился чугунным.
    for pattern in (
        r"([^,;/]+?)\s*\(\s*корпус(?:а| насоса)?\s*\)",
        r"материал\s+корпуса\s*[:\-]\s*([^,;/]+)",
        r"корпус\s*[:\-]\s*([^,;/]+)",
    ):
        m=re.search(pattern,low,re.I)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return raw


def drainage_pump_body_family(v: Any) -> str:
    n=norm(drainage_pump_body_material_part(v))
    if not n:return ""
    # Не объединяем разные материалы в абстрактный "металл":
    # пользователь просил сравнивать именно материал корпуса.
    tokens=[]
    if any(x in n for x in ("нержав","stainless","inox")):tokens.append("stainless")
    # Не считать "нержавеющая сталь" одновременно обычной сталью.
    n_wo_stainless=re.sub(r"нержав\w*\s+сталь|stainless\s+steel|inox"," ",n)
    if any(x in n_wo_stainless for x in ("чугун","cast iron")):tokens.append("cast_iron")
    if any(x in n_wo_stainless for x in ("алюмин","aluminium","aluminum")):tokens.append("aluminum")
    if re.search(r"(^|\s)сталь(?:\s|$)",n_wo_stainless) or re.search(r"(^|\s)steel(?:\s|$)",n_wo_stainless):tokens.append("steel")
    if any(x in n for x in ("технополимер","technopolymer")):tokens.append("technopolymer")
    n_wo_tech=re.sub(r"технополимер|technopolymer"," ",n)
    if any(x in n_wo_tech for x in ("пластик","пластмасс","plastic")):tokens.append("plastic")
    if any(x in n_wo_tech for x in ("полимер","polymer")):tokens.append("polymer")
    if not tokens and any(x in n for x in ("металл","metal")):tokens.append("metal")
    uniq=[]
    for x in tokens:
        if x not in uniq:uniq.append(x)
    return "+".join(uniq) if uniq else n[:120]


def circulation_pump_required_missing(ours: dict,comp: dict) -> bool:
    # Particle size is optional by the approved business rule: its absence must not
    # mark the comparison incomplete or lower the result.
    required=("max_head_m","flow_rate_m3h","input_power_w","pressure_bar")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def circulation_pump_relative_similarity(a: float,b: float,full: float=0.10,close: float=0.20,partial: float=0.30) -> float:
    d=abs(float(a)-float(b))/max(abs(float(a)),abs(float(b)),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def circulation_pump_head_similarity(a: float,b: float) -> float:
    av=float(a);bv=float(b)
    d=abs(av-bv);rel=d/max(abs(av),abs(bv),1e-9)
    if d<=0.5 or rel<=0.10:return 1.0
    if d<=1.0 or rel<=0.20:return 0.85
    if d<=1.5 or rel<=0.30:return 0.65
    return 0.0


def circulation_pump_particle_similarity(a: float,b: float) -> float:
    av=float(a);bv=float(b)
    d=abs(av-bv);rel=d/max(abs(av),abs(bv),1e-9)
    if d<=1 or rel<=0.10:return 1.0
    if d<=2 or rel<=0.20:return 0.85
    if d<=3 or rel<=0.30:return 0.65
    return 0.0


def circulation_pump_directional(rule: dict,a: Any,b: Any,ours: dict|None=None,comp: dict|None=None) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    av=float(a);bv=float(b)
    if k=="max_head_m":
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=0.5 or rel<=0.10:return 50
        return 68 if av>bv else 32
    if k=="flow_rate_m3h":
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="pressure_bar":
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        return 68 if av>bv else 32
    if k=="filter_particle_mm":
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="input_power_w":
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        # Lower power is an advantage only when hydraulic performance is comparable.
        if not ours or not comp:return 50
        ah=ours.get("max_head_m");bh=comp.get("max_head_m")
        af=ours.get("flow_rate_m3h");bf=comp.get("flow_rate_m3h")
        if None in (ah,bh,af,bf):return 50
        head_rel=abs(float(ah)-float(bh))/max(abs(float(ah)),abs(float(bh)),1e-9)
        flow_rel=abs(float(af)-float(bf))/max(abs(float(af)),abs(float(bf)),1e-9)
        comparable=(abs(float(ah)-float(bh))<=0.5 or head_rel<=0.10) and flow_rel<=0.10
        if not comparable:return 50
        return 68 if av<bv else 32
    return directional(rule,a,b)


def drainage_pump_required_missing(ours: dict,comp: dict) -> bool:
    required=("flow_rate_lmin","input_power_w","max_head_m","pump_body_material","filter_particle_mm")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def fecal_pump_required_missing(ours: dict,comp: dict) -> bool:
    # These hydraulic parameters are sufficient to decide whether a confirmed
    # assortment gap exists. Grinder is a strong modifier when explicitly known.
    required=("flow_rate_lmin","max_head_m","filter_particle_mm")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def fecal_pump_data_incomplete(ours: dict,comp: dict) -> bool:
    required=("pump_body_material","flow_rate_lmin","max_head_m","connection_diameter_in",
              "filter_particle_mm","grinder_present","water_type")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def fecal_pump_connection_inches(v: Any) -> float|None:
    raw=str(v or "").strip()
    if not raw:return None
    low=raw.lower().replace(",",".").replace("″",'"').replace("”",'"')
    # Mixed fractions such as 1 1/2".
    m=re.search(r"(\d+)\s+(\d+)\s*/\s*(\d+)\s*(?:\"|дюйм|inch|in\b)",low,re.I)
    if m and float(m.group(3)):
        return round(float(m.group(1))+float(m.group(2))/float(m.group(3)),4)
    m=re.search(r"(\d+)\s*/\s*(\d+)\s*(?:\"|дюйм|inch|in\b)",low,re.I)
    if m and float(m.group(2)):
        return round(float(m.group(1))/float(m.group(2)),4)
    m=re.search(r"(\d+(?:\.\d+)?)\s*(?:\"|дюйм(?:а|ов)?|inch(?:es)?|in\b)",low,re.I)
    if m:return round(float(m.group(1)),4)
    # Pipe marks on 21vek can be written as G2 / G 1.5.
    m=re.search(r"\bg\s*(\d+(?:\.\d+)?)\b",low,re.I)
    if m:return round(float(m.group(1)),4)
    m=re.search(r"(\d+(?:\.\d+)?)\s*(?:мм|mm)\b",low,re.I)
    if m:return round(float(m.group(1))/25.4,4)
    ns=nums(low)
    return round(float(ns[0]),4) if ns else None


def fecal_pump_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="flow_rate_lmin":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="max_head_m":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 68 if av>bv else 32
    if k=="filter_particle_mm":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="grinder_present":
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 72 if av else 28
    if k in ("pump_body_material","connection_diameter_in","water_type"):
        # Compatibility characteristics: do not invent a stronger/weaker rank.
        return 50
    return directional(rule,a,b)


def drainage_pump_relative_similarity(a: float,b: float,full: float=0.10,close: float=0.20,partial: float=0.30) -> float:
    den=max(abs(float(a)),abs(float(b)),1e-9)
    d=abs(float(a)-float(b))/den
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def drainage_pump_head_similarity(a: float,b: float) -> float:
    av=float(a);bv=float(b)
    d=abs(av-bv);rel=d/max(abs(av),abs(bv),1e-9)
    if d<=1 or rel<=0.10:return 1.0
    if d<=2 or rel<=0.20:return 0.85
    if d<=3 or rel<=0.30:return 0.65
    return 0.0


def drainage_pump_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k in ("flow_rate_lmin","input_power_w"):
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="max_head_m":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 68 if av>bv else 32
    if k=="filter_particle_mm":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="pump_body_material":
        # Материал корпуса — характеристика сопоставимости, а не шкала "лучше/хуже".
        # Нержавейка, чугун, алюминий, сталь и пластик не получают выдуманный ранг прочности.
        return 50
    return directional(rule,a,b)


def borehole_pump_principle_family(v: Any) -> str:
    n=norm(v)
    if not n:return ""
    if any(x in n for x in ("центробеж","centrifugal")):return "centrifugal"
    if any(x in n for x in ("винтов","шнек","screw","auger")):return "screw"
    if any(x in n for x in ("вихрев","vortex")):return "vortex"
    if any(x in n for x in ("вибрац","vibrat")):return "vibration"
    return n[:120]


def borehole_pump_required_missing(ours: dict,comp: dict) -> bool:
    # Core comparison: head + flow + immersion depth + well diameter.
    # Pumping depth is not a required market metric; water/principle refine class.
    required=("max_head_m","max_immersion_depth_m","well_diameter_mm","flow_rate_lmin")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def borehole_pump_depth_similarity(a: float,b: float) -> float:
    av=float(a);bv=float(b)
    d=abs(av-bv);rel=d/max(abs(av),abs(bv),1e-9)
    if d<=1 or rel<=0.10:return 1.0
    if d<=2 or rel<=0.20:return 0.85
    if d<=3 or rel<=0.30:return 0.65
    return 0.0


def borehole_pump_diameter_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))
    if d<=5:return 1.0
    if d<=10:return 0.85
    if d<=20:return 0.65
    return 0.0


def borehole_pump_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="flow_rate_lmin":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        return 66 if av>bv else 34
    if k in ("max_head_m","max_pumping_depth_m","max_immersion_depth_m"):
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 68 if av>bv else 32
    if k in ("water_type","operating_principle","well_diameter_mm"):
        # Совместимость, а не шкала "сильнее/слабее".
        return 50
    return directional(rule,a,b)


def surface_pump_water_tokens(v: Any) -> set[str]:
    n=norm(v)
    out=set()
    if not n:return out
    if any(x in n for x in ("слабозагряз","малозагряз","слабо загряз","slightly dirty")):
        out.add("slightly_dirty")
    n2=re.sub(r"слабозагряз\w*|малозагряз\w*|слабо загряз\w*|slightly dirty"," ",n)
    if any(x in n2 for x in ("грязн","загрязн","dirty")):out.add("dirty")
    if any(x in n for x in ("чист","clean")):out.add("clean")
    if any(x in n for x in ("сточн","канализац","sewage")):out.add("sewage")
    if any(x in n for x in ("солен","солён","морск","salt water")):out.add("salt")
    if any(x in n for x in ("пресн","fresh water")):out.add("fresh")
    return out


def surface_pump_water_family(v: Any) -> str:
    t=surface_pump_water_tokens(v)
    return "+".join(sorted(t)) if t else (norm(v)[:120] or "")


def surface_pump_required_missing(ours: dict,comp: dict) -> bool:
    required=("flow_rate_lmin","input_power_w","max_head_m","max_suction_depth_m","water_type")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def surface_pump_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k in ("flow_rate_lmin","input_power_w"):
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        return 66 if av>bv else 34
    if k in ("max_head_m","max_suction_depth_m"):
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 68 if av>bv else 32
    if k=="water_type":
        # Тип воды — характеристика совместимости, без выдуманной шкалы "лучше/хуже".
        return 50
    return directional(rule,a,b)


def sewage_station_required_missing(ours: dict,comp: dict) -> bool:
    # Particle size is an additional characteristic for stations, not a blocker.
    required=("flow_rate_lmin","max_head_m","input_power_w","max_water_temp_c")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def sewage_station_temperature_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))
    if d<=5:return 1.0
    if d<=10:return 0.85
    if d<=15:return 0.65
    return 0.0


def sewage_station_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k in ("flow_rate_lmin","input_power_w"):
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="max_head_m":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 68 if av>bv else 32
    if k=="filter_particle_mm":
        av=float(a);bv=float(b)
        rel=abs(av-bv)/max(abs(av),abs(bv),1e-9)
        if abs(av-bv)<=1 or rel<=0.10:return 50
        return 66 if av>bv else 34
    if k=="max_water_temp_c":
        av=float(a);bv=float(b)
        if abs(av-bv)<=5:return 50
        return 68 if av>bv else 32
    return directional(rule,a,b)


def angle_grinder_source_family(v: Any) -> str:
    return circular_saw_source_family(v)


def angle_grinder_motor_family(v: Any) -> str:
    return impact_wrench_motor_family(v)


def angle_grinder_required_missing(ours: dict,comp: dict) -> bool:
    required=("power_source","motor_type","soft_start_present","speed_adjustment_present","grinder_disc_diameter_mm")
    if any(ours.get(k) is None or comp.get(k) is None for k in required):
        return True
    source=angle_grinder_source_family(ours.get("power_source") or comp.get("power_source"))
    if source=="battery":
        return ours.get("battery_capacity_ah") is None or comp.get("battery_capacity_ah") is None
    if source=="mains":
        return ours.get("input_power_w") is None or comp.get("input_power_w") is None
    return True


def angle_grinder_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def angle_grinder_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="motor_type":
        aa=angle_grinder_motor_family(a);bb=angle_grinder_motor_family(b)
        if aa==bb:return 50
        if aa=="brushless" and bb=="brushed":return 72
        if aa=="brushed" and bb=="brushless":return 28
        return 50
    if k in ("soft_start_present","speed_adjustment_present"):
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 70 if av else 30
    if k=="battery_capacity_ah":
        av=float(a);bv=float(b)
        if abs(av-bv)<=0.5:return 50
        return 65 if av>bv else 35
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=150:return 50
        return 66 if av>bv else 34
    if k in ("power_source","grinder_disc_diameter_mm"):
        return 50
    return directional(rule,a,b)


def bench_grinder_motor_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("асинхрон","индукцион","induction","asynchronous")):return "induction"
    if any(x in n for x in ("бесщет","бесщёточ","brushless","bl motor")):return "brushless"
    if any(x in n for x in ("щеточ","щёточ","коллектор","brushed","universal")):return "brushed"
    return n


def bench_grinder_required_missing(ours: dict,comp: dict) -> bool:
    return any(ours.get(k) is None or comp.get(k) is None
               for k in ("motor_type","input_power_w","max_rpm","grinding_wheel_diameter_mm"))


def bench_grinder_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def bench_grinder_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="motor_type":
        return 50
    av=float(a) if k!="motor_type" else None
    bv=float(b) if k!="motor_type" else None
    if k=="input_power_w":
        if abs(av-bv)<=50:return 50
        return 68 if av>bv else 32
    if k in ("max_rpm","grinding_wheel_diameter_mm"):
        return 50
    return directional(rule,a,b)


def miter_saw_required_missing(ours: dict,comp: dict) -> bool:
    required=("input_power_w","blade_diameter_mm","sliding_present","cut_depth_90_mm","cut_depth_45_mm","max_rpm")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def miter_saw_abs_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(float(a)-float(b))
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def miter_saw_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="sliding_present":return 50
    av=float(a) if k!="sliding_present" else None
    bv=float(b) if k!="sliding_present" else None
    if k=="input_power_w":
        if abs(av-bv)<=200:return 50
        return 66 if av>bv else 34
    if k in ("cut_depth_90_mm","cut_depth_45_mm"):
        if abs(av-bv)<=5:return 50
        return 70 if av>bv else 30
    if k in ("blade_diameter_mm","max_rpm"):return 50
    return directional(rule,a,b)


def circular_saw_device_family(v: Any) -> str:
    n=norm(v)
    if "станок" in n and any(x in n for x in ("циркуляр","распилов","настоль")):return "table_saw"
    if any(x in n for x in ("торцов","miter","mitre")):return "miter_saw"
    if any(x in n for x in ("погруж","plunge")):return "plunge_saw"
    if any(x in n for x in ("мини дисков","мини-дисков","минипил","mini circular","compact circular")):return "mini_circular_saw"
    if ("дисков" in n and "пил" in n) or "циркуляр" in n:return "circular_saw"
    return n


def circular_saw_source_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("аккумуля","батар","battery","li ion","li-ion")):return "battery"
    if any(x in n for x in ("сетев","сеть","220","230","mains","corded","electric","электр")):return "mains"
    return n


def circular_saw_blade_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    if 75<=n<=95:return "85_90"
    if 100<=n<=125:return "115"
    if 126<=n<=150:return "140"
    if 151<=n<=172:return "160_165"
    if 173<=n<=195:return "185_190"
    if 196<=n<=220:return "200_210"
    if 221<=n<=245:return "235"
    return str(round(n,1))


def circular_saw_arbor_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    standards=(10,12.7,15.875,16,20,22.23,25.4,30,32)
    best=min(standards,key=lambda x:abs(n-x))
    if abs(n-best)<=0.6:return str(best)
    return str(round(n,2))


def circular_saw_voltage_class(v: Any) -> str|None:
    return impact_wrench_voltage_class(v)


def circular_saw_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def circular_saw_angle_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))
    if d<=5:return 1.0
    if d<=10:return 0.85
    if d<=15:return 0.65
    return 0.0


def circular_saw_required_missing(ours: dict,comp: dict) -> bool:
    required=("device_type","power_source","blade_diameter_mm","arbor_diameter_mm","cut_depth_90_mm")
    if any(ours.get(k) is None or comp.get(k) is None for k in required):return True
    source=circular_saw_source_family(ours.get("power_source") or comp.get("power_source"))
    if source=="battery":
        return ours.get("battery_voltage_v") is None or comp.get("battery_voltage_v") is None
    return False


def circular_saw_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="motor_type":
        aa=impact_wrench_motor_family(a);bb=impact_wrench_motor_family(b)
        if aa==bb:return 50
        if aa=="brushless" and bb=="brushed":return 72
        if aa=="brushed" and bb=="brushless":return 28
        return 50
    if k=="cut_speed_adjustment":
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 70 if av else 30
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)<=150:return 50
        return 66 if av>bv else 34
    if k in ("device_type","power_source","max_rpm","blade_diameter_mm","arbor_diameter_mm","battery_type","battery_voltage_v"):
        return 50
    return directional(rule,a,b)


def impact_wrench_device_family(v: Any) -> str:
    n=norm(v)
    if "гайковерт" in n or "гайковёрт" in str(v or "").lower() or "impact wrench" in n:return "impact_wrench"
    if "винтоверт" in n or "impact driver" in n:return "impact_driver"
    if "шуруповерт" in n:return "screwdriver"
    if "дрель" in n:return "drill"
    return n


def impact_wrench_kind_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("безудар","без удара","non impact","non-impact")):return "non_impact"
    if any(x in n for x in ("ударн","impact")):return "impact"
    return n


def impact_wrench_source_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("пневм","compressed air","air powered","воздуш")):return "pneumatic"
    if any(x in n for x in ("аккумуля","батар","battery","li ion","li-ion")):return "battery"
    if any(x in n for x in ("сетев","сеть","220","230","mains","corded","electric")):return "mains"
    return n


def impact_wrench_motor_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("бесщет","бесщёточ","brushless","bl motor")):return "brushless"
    if any(x in n for x in ("щеточ","щёточ","brushed","коллектор")):return "brushed"
    return n


def impact_wrench_chuck_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("квадрат","square","четырехгран","четырёхгран")):return "square"
    if any(x in n for x in ("шестигран","hex")):return "hex"
    return n


def impact_wrench_voltage_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    if 9<=n<=13:return "10_8_12"
    if 16<=n<=22:return "18_20"
    if 23<=n<=28:return "24"
    if 34<=n<=42:return "36_40"
    if 46<=n<=52:return "48"
    if 54<=n<=62:return "60"
    if 72<=n<=84:return "80"
    return str(round(n,1))


def impact_wrench_drive_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    known=[(0.25,"1/4"),(0.375,"3/8"),(0.5,"1/2"),(0.75,"3/4"),(1.0,"1")]
    for x,label in known:
        if abs(n-x)<=0.025:return label
    return str(round(n,4))


def impact_wrench_mode_tokens(v: Any) -> set[str]:
    n=norm(v);out=set()
    m=re.search(r"(\d+)\s*(?:режим|скорост)",n)
    if m:out.add("count:"+m.group(1))
    if any(x in n for x in ("автостоп","авто стоп","auto stop","autostop")):out.add("auto_stop")
    if any(x in n for x in ("болт","bolt")):out.add("bolt")
    if any(x in n for x in ("реверс стоп","reverse stop")):out.add("reverse_stop")
    if any(x in n for x in ("точн","precision")):out.add("precision")
    if not out and n:out.add(n)
    return out


def impact_wrench_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def impact_wrench_modes_similarity(a: Any,b: Any) -> float:
    aa=impact_wrench_mode_tokens(a);bb=impact_wrench_mode_tokens(b)
    if aa and bb:return len(aa&bb)/max(1,len(aa|bb))
    return categorical_similarity(a,b)


def impact_wrench_required_missing(ours: dict,comp: dict) -> bool:
    required=("device_type","wrench_type","power_source","drive_size_in","max_torque_nm")
    if any(ours.get(k) is None or comp.get(k) is None for k in required):return True
    source=impact_wrench_source_family(ours.get("power_source") or comp.get("power_source"))
    if source=="battery":
        return ours.get("battery_voltage_v") is None or comp.get("battery_voltage_v") is None
    return False


def impact_wrench_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="motor_type":
        aa=impact_wrench_motor_family(a);bb=impact_wrench_motor_family(b)
        if aa==bb:return 50
        if aa=="brushless" and bb=="brushed":return 72
        if aa=="brushed" and bb=="brushless":return 28
        return 50
    if k in ("device_type","wrench_type","power_source","chuck_type","drive_size_in","max_rpm","battery_type","battery_voltage_v"):
        return 50
    if k=="operating_modes":
        aa=impact_wrench_mode_tokens(a);bb=impact_wrench_mode_tokens(b)
        ca=next((int(x.split(":",1)[1]) for x in aa if x.startswith("count:")),None)
        cb=next((int(x.split(":",1)[1]) for x in bb if x.startswith("count:")),None)
        if ca is not None and cb is not None and ca!=cb:return 62 if ca>cb else 38
        return 50
    if k in ("reverse_present","rotation_adjustment"):
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 70 if av else 30
    return directional(rule,a,b)


def sprayer_device_family(v: Any) -> str:
    n=norm(v)
    if "опрыскив" in n or "sprayer" in n:return "sprayer"
    return n


def sprayer_source_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("аккумуля","батар","battery","li ion","li-ion")):return "battery"
    if any(x in n for x in ("бензин","топлив","двс","petrol","gasoline")):return "fuel"
    if any(x in n for x in ("сетев","сеть","220","230","mains")):return "mains"
    if any(x in n for x in ("ручн","механическ","помпов","рычаж","manual")):return "manual"
    return n


def sprayer_carry_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("ранцев","рюкзач","на спин")):return "backpack"
    if any(x in n for x in ("плеч","на плеч")):return "shoulder"
    if any(x in n for x in ("колес","тележ")):return "wheeled"
    if any(x in n for x in ("ручн","переносн","в руке")):return "handheld"
    return n


def sprayer_engine_family(v: Any) -> str:
    n=norm(v)
    if re.search(r"(^|\s)2\s*(?:такт|stroke)",n) or any(x in n for x in ("двухтакт","2-такт","2 такт","two stroke")):return "2stroke"
    if re.search(r"(^|\s)4\s*(?:такт|stroke)",n) or any(x in n for x in ("четырехтакт","4-такт","4 такт","four stroke")):return "4stroke"
    return n


def sprayer_application_tokens(v: Any) -> set[str]:
    n=norm(v);out=set()
    if any(x in n for x in ("сад","огород","растен","дерев","кустар")):out.add("garden")
    if any(x in n for x in ("сельск","агро","поле","ферм")):out.add("agriculture")
    if any(x in n for x in ("дезинф","санитар","обработк помещ")):out.add("disinfection")
    if any(x in n for x in ("удобрен","подкорм")):out.add("fertilizer")
    if any(x in n for x in ("вредител","инсекти","гербиц","пестиц")):out.add("plant_protection")
    if not out and n:out.add(n)
    return out


def sprayer_voltage_class(v: Any) -> str|None:
    try:n=float(v)
    except Exception:return None
    if 3.0<=n<=4.5:return "3_7_v"
    if 10<=n<16:return "12_v"
    if 16<=n<=22:return "18_20_v"
    if 23<=n<=28:return "24_v"
    if 34<=n<=42:return "36_40_v"
    if 46<=n<=52:return "48_v"
    if 54<=n<=62:return "60_v"
    if 72<=n<=84:return "80_v"
    return str(round(n,1))


def sprayer_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def sprayer_required_missing(ours: dict,comp: dict) -> bool:
    source=sprayer_source_family(ours.get("power_source") or comp.get("power_source"))
    base=("device_type","power_source","flow_rate_lmin","tank_capacity_l")
    if any(ours.get(k) is None or comp.get(k) is None for k in base):return True
    if source=="battery":
        return ours.get("voltage_v") is None or comp.get("voltage_v") is None
    if source=="fuel":
        if ours.get("fuel_engine_type") is None or comp.get("fuel_engine_type") is None:return True
        # Engine output can be expressed by power or displacement. Require at least one confirmed pair.
        power_pair=ours.get("fuel_power_w") is not None and comp.get("fuel_power_w") is not None
        cc_pair=ours.get("engine_cc") is not None and comp.get("engine_cc") is not None
        return not (power_pair or cc_pair)
    if source=="manual":
        return ours.get("carry_type") is None or comp.get("carry_type") is None
    return False


def sprayer_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k in ("device_type","application_area","carry_type","voltage_v","power_source","battery_type","fuel_engine_type","engine_cc"):
        return 50
    return directional(rule,a,b)


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


def concrete_mixer_crown_family(v: Any) -> str:
    n=norm(v)
    if any(x in n for x in ("чугун","cast iron","castiron")): return "cast_iron"
    if any(x in n for x in ("сталь","стальн","steel")): return "steel"
    if any(x in n for x in ("полиамид","полиуретан","пластик","пластмасс","полимер","polyamide","polyurethane","plastic","polymer")): return "polymer"
    # "Металлический" without a metal grade is not enough to call the crown
    # steel or cast iron. Keep it visible, but mark the comparison incomplete.
    if any(x in n for x in ("металл","металлическ","metal")): return "metal_unspecified"
    return n


def concrete_mixer_required_missing(ours: dict,comp: dict) -> bool:
    for side in (ours,comp):
        if side.get("drum_capacity_l") is None or side.get("input_power_w") is None:
            return True
        fam=concrete_mixer_crown_family(side.get("crown_material"))
        if fam not in ("cast_iron","polymer","steel"):
            return True
    return False


def concrete_mixer_relative_similarity(a: float,b: float,full: float,close: float,conditional: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.80
    if d<=conditional:return 0.60
    return 0.0


def concrete_mixer_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="drum_capacity_l":
        # Drum size defines the capacity class; a larger drum is not automatically "better".
        return 50
    if k=="crown_material":
        aa=concrete_mixer_crown_family(a);bb=concrete_mixer_crown_family(b)
        if not aa or not bb:return None
        if aa==bb:return 50
        if aa=="cast_iron" and bb=="polymer":return 75
        if aa=="polymer" and bb=="cast_iron":return 25
        # Steel is evaluated separately and is not auto-equated to cast iron.
        return 50
    if k=="input_power_w":
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.15:return 50
        return directional(rule,av,bv)
    return directional(rule,a,b)


def grain_crusher_body_form_family(v: Any) -> str:
    n=norm(v)
    if not n:return ""
    if any(x in n for x in ("цилиндр","cylind")):return "cylindrical"
    if any(x in n for x in ("кругл","round")):return "round"
    if any(x in n for x in ("прямоугол","rectang")):return "rectangular"
    if any(x in n for x in ("квадрат","square")):return "square"
    if any(x in n for x in ("конич","конус","conic")):return "conical"
    return n[:120]


def grain_crusher_required_missing(ours: dict,comp: dict) -> bool:
    # 21vek reliably exposes power + throughput for this category, while body
    # form is absent from the public spec set and hopper volume is only partial.
    # Optional fields still contribute their approved weights when present, but
    # their absence must never be treated as zero, a loss, or block the verdict.
    required=("input_power_w","throughput_kgh")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def grain_crusher_relative_similarity(a: float,b: float,full: float=0.10,close: float=0.20,partial: float=0.30) -> float:
    d=abs(float(a)-float(b))/max(abs(float(a)),abs(float(b)),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def grain_crusher_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="grain_crusher_body_form":
        aa=grain_crusher_body_form_family(a);bb=grain_crusher_body_form_family(b)
        return 50 if aa and bb else None
    if k in ("input_power_w","throughput_kgh","hopper_capacity_l"):
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.10:return 50
        return directional(rule,av,bv)
    return directional(rule,a,b)


def washstand_class_from_name(v: Any, sku: Any="") -> str:
    n=norm(v);sku=str(sku or "").strip()
    if sku.startswith("74/4/") and not sku.startswith("900/"):
        return "full_set"
    if any(x in n for x in ("тэн для","тен для","нагревательный элемент","кран для","мойка для","раковина для","бак для","запчаст")):
        return "accessory"
    if "с душем" in n or "душевой" in n:
        return "shower_set"
    full_markers=(
        "с тумб","тумба","тандем","чистюля","с раковин","с мойк",
        "мойка нержав","мойка пластик","комфорт","люкс"
    )
    if any(x in n for x in full_markers):
        return "full_set"
    # Standalone heated tanks / hand-wash tanks are sold in the same 21vek
    # category but are not substitutes for our cabinet + sink sets.
    if ("эвбо" in n or re.search(r"\bум[-\s]?\d",n)
        or "без эвн" in n or re.search(r"\b(?:5|9|10|12|15|17|20|22)\s*л\b",n)):
        return "tank_only"
    # Unknown construction is deliberately not accepted as a direct analogue.
    return "unknown"


def washstand_body_material_part(v: Any) -> str:
    raw=str(v or "").strip()
    if not raw:return ""
    parts=[x.strip() for x in re.split(r"[,;]",raw) if x.strip()]
    sink_marked=any(
        re.search(r"\(\s*(?:мойк|раковин)",part,re.I) or any(x in norm(part) for x in ("мойка","раковина"))
        for part in parts
    )
    explicit_body=[]
    unlabeled=[]
    for part in parts:
        pn=norm(part)
        if re.search(r"\(\s*(?:мойк|раковин)",part,re.I) or any(x in pn for x in ("мойка","раковина")):
            continue
        if any(x in pn for x in ("тумб","корпус","каркас")):
            explicit_body.append(part)
        else:
            unlabeled.append(part)
    if explicit_body:
        return ", ".join(explicit_body)
    # If the source explicitly labels another segment as the sink, the remaining
    # unlabeled material belongs to the body/cabinet. Otherwise a generic
    # "Материал: пластик/нержавейка" is ambiguous and must not be invented as body.
    if sink_marked and unlabeled:
        return ", ".join(unlabeled)
    return ""


def washstand_body_material_family(v: Any) -> str:
    n=norm(washstand_body_material_part(v))
    if not n:return ""
    has_stainless=any(x in n for x in ("нержав","stainless","inox"))
    n2=re.sub(r"нержав\w*\s+сталь|stainless\s+steel|inox"," ",n)
    has_steel=bool(re.search(r"(^|\s)сталь(?:\s|$)",n2)) or bool(re.search(r"(^|\s)steel(?:\s|$)",n2))
    has_metal=any(x in n2 for x in ("металл","metal"))
    has_plastic=any(x in n for x in ("пластик","пластмасс","полимер","plastic","polymer"))
    fam=[]
    if has_stainless:fam.append("stainless")
    if has_steel:fam.append("steel")
    elif has_metal:fam.append("metal")
    if has_plastic:fam.append("plastic")
    fam=list(dict.fromkeys(fam))
    if len(fam)>1:return "combined"
    return fam[0] if fam else n[:120]


def washstand_required_missing(ours: dict,comp: dict) -> bool:
    required=("washstand_class","tank_capacity_l","water_heating_present")
    return any(ours.get(k) is None or comp.get(k) is None for k in required)


def washstand_relative_similarity(a: float,b: float) -> float:
    d=abs(float(a)-float(b))/max(abs(float(a)),abs(float(b)),1e-9)
    if d<=0.10:return 1.0
    if d<=0.20:return 0.85
    if d<=0.30:return 0.65
    return 0.0


def washstand_directional(rule: dict,a: Any,b: Any) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="washstand_body_material":
        aa=washstand_body_material_family(a);bb=washstand_body_material_family(b)
        return 50 if aa and bb else None
    if k=="tank_capacity_l":
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.10:return 50
        return directional(rule,av,bv)
    if k=="water_heating_present":
        av=bool(a);bv=bool(b)
        if av==bv:return 50
        return 78 if av else 22
    return directional(rule,a,b)


def compressor_type_family(v: Any) -> str:
    n=norm(v)
    if not n:return ""
    piston=any(x in n for x in ("поршнев","piston"))
    screw=any(x in n for x in ("винтов","screw"))
    membrane=any(x in n for x in ("мембран","diaphragm"))
    scroll=any(x in n for x in ("спиральн","scroll"))
    oilfree=any(x in n for x in ("безмаслян","безмасля","oil free","oil-free"))
    oil=any(x in n for x in ("маслян","масля","oil lubric"))
    if screw:return "screw"
    if membrane:return "diaphragm"
    if scroll:return "scroll"
    if piston and oilfree:return "piston_oilfree"
    if piston and oil:return "piston_oil"
    if piston:return "piston"
    if oilfree:return "oilfree"
    return n[:120]


def compressor_engine_family(v: Any) -> str:
    n=norm(v)
    if not n:return ""
    if any(x in n for x in ("бензин","gasoline","petrol")):return "gasoline"
    if any(x in n for x in ("дизел","diesel")):return "diesel"
    if any(x in n for x in ("электр","асинхрон","индукцион","коллектор","electric","induction","asynchronous","сеть","сетев")):
        return "electric"
    # 21vek compressor cards often expose the engine source as power voltage
    # instead of a literal "Тип двигателя". Explicit mains voltage is enough
    # evidence to classify the drive as electric, without inventing details.
    if re.search(r"\b(?:110|127|220|230|240|380|400)\s*(?:в|v)\b",n):
        return "electric"
    return n[:120]


def compressor_drive_family(v: Any) -> str:
    n=norm(v)
    if not n:return ""
    if any(x in n for x in ("коаксиал","прямой","прямой привод","direct","coaxial")):return "direct"
    if any(x in n for x in ("ременн","ременной","belt")):return "belt"
    return n[:120]


def compressor_lubrication_family(v: Any) -> str:
    n=norm(v)
    if not n:return ""
    # Normalized DB values are fed back through this helper during comparison.
    # "oilfree" must be recognized before the generic substring "oil".
    if n=="oilfree" or any(x in n for x in ("безмаслян","безмасля","без масла","oil free","oil-free")):return "oilfree"
    if n=="oil" or any(x in n for x in ("маслян","масля","с маслом","oil lubric")):return "oil"
    return n[:120]


def compressor_voltage_class(v: Any) -> str:
    n=norm(v)
    if not n:return ""
    vals=nums(v)
    if any(370<=float(x)<=430 for x in vals):return "400v"
    if any(210<=float(x)<=250 for x in vals):return "230v"
    if any(100<=float(x)<=140 for x in vals):return "120v"
    if "аккумулятор" in n or "акб" in n or "battery" in n:return "battery"
    return n[:120]


def compressor_flow_basis_pair(ours: dict,comp: dict) -> tuple[float,float,str]|None:
    a=ours.get("flow_rate_lmin");b=comp.get("flow_rate_lmin")
    ba=str(ours.get("compressor_flow_basis") or "")
    bb=str(comp.get("compressor_flow_basis") or "")
    if a is None or b is None or not ba or not bb or ba!=bb:return None
    return float(a),float(b),ba


def compressor_required_missing(ours: dict,comp: dict) -> bool:
    required=("compressor_type","receiver_capacity_l","compressor_engine_type","pressure_bar")
    if any(ours.get(k) is None or comp.get(k) is None for k in required):return True
    # Tankless inflators/heads are not direct analogues of our receiver compressors.
    try:
        if float(ours.get("receiver_capacity_l") or 0)<=0 or float(comp.get("receiver_capacity_l") or 0)<=0:return True
    except Exception:return True
    return compressor_flow_basis_pair(ours,comp) is None


def compressor_relative_similarity(a: float,b: float,full: float,close: float,partial: float) -> float:
    d=abs(a-b)/max(abs(a),abs(b),1e-9)
    if d<=full:return 1.0
    if d<=close:return 0.85
    if d<=partial:return 0.65
    return 0.0


def compressor_pressure_similarity(a: float,b: float) -> float:
    d=abs(a-b);rel=d/max(abs(a),abs(b),1e-9)
    if d<=1.0 or rel<=0.10:return 1.0
    if rel<=0.20:return 0.85
    if rel<=0.30:return 0.65
    return 0.0


def compressor_directional(rule: dict,a: Any,b: Any,ours: dict|None=None,comp: dict|None=None) -> float|None:
    if a is None or b is None:return None
    k=rule.get("spec_key")
    if k=="compressor_type":
        aa=compressor_type_family(a);bb=compressor_type_family(b)
        return 50 if aa and bb and aa==bb else 50
    if k=="compressor_engine_type":
        aa=compressor_engine_family(a);bb=compressor_engine_family(b)
        return 50 if aa and bb and aa==bb else 50
    if k=="compressor_drive_type":
        aa=compressor_drive_family(a);bb=compressor_drive_family(b)
        return 50 if aa and bb and aa==bb else None
    if k=="compressor_lubrication":
        aa=compressor_lubrication_family(a);bb=compressor_lubrication_family(b)
        return 50 if aa and bb and aa==bb else None
    if k=="compressor_voltage_v":
        aa=compressor_voltage_class(a);bb=compressor_voltage_class(b)
        return 50 if aa and bb and aa==bb else None
    if k=="receiver_capacity_l":
        av=float(a);bv=float(b)
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.20:return 50
        return directional(rule,av,bv)
    if k=="flow_rate_lmin":
        pair=compressor_flow_basis_pair(ours or {},comp or {})
        if pair is None:return None
        av,bv,_basis=pair
        if abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.10:return 50
        return directional(rule,av,bv)
    if k=="pressure_bar":
        av=float(a);bv=float(b)
        if abs(av-bv)<=1.0 or abs(av-bv)/max(abs(av),abs(bv),1e-9)<=0.10:return 50
        return directional(rule,av,bv)
    return directional(rule,a,b)


def normalize_value(key: str, text: str) -> Any:
    low=str(text or "").lower();ns=nums(text)
    if key=="washstand_body_material":
        v=washstand_body_material_family(text)
        return v[:120] if v else None
    if key=="water_heating_present":
        n=norm(text)
        if any(x in n for x in ("без подогрев","без нагрев","подогрев отсутств","нагрев отсутств","не подогрев")):return False
        b=bool_value(text)
        if b is not None:return b
        if any(x in n for x in ("с подогрев","подогрев","нагрев вод","водонагрев","тэн","тен")):return True
        return None
    if key=="throughput_kgh":
        vals=[]
        vals.extend(float(x.replace(",",".")) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:кг\s*/\s*ч|кг/ч|kg\s*/\s*h|kg/h)",low,re.I))
        vals.extend(float(x.replace(",","."))*1000 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:т\s*/\s*ч|т/ч|t\s*/\s*h|t/h)",low,re.I))
        vals.extend(float(x.replace(",","."))*60 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:кг\s*/\s*мин|кг/мин|kg\s*/\s*min|kg/min)",low,re.I))
        return round(max(vals),3) if vals else (round(max(ns),3) if ns else None)
    if key=="hopper_capacity_l":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3|m³)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*1000,3)
        if re.search(r"\b(?:кг|kg)\b",low,re.I):return None
        return round(max(ns),3) if ns else None
    if key=="grain_crusher_body_form":
        v=grain_crusher_body_form_family(text)
        return v[:120] if v else None
    if key=="drum_capacity_l":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3|m³)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*1000,3)
        return round(max(ns),3) if ns else None
    if key=="crown_material":
        v=concrete_mixer_crown_family(text)
        return v[:120] if v else None
    if key=="compressor_type":
        v=compressor_type_family(text)
        return v[:120] if v else None
    if key=="compressor_drive_type":
        v=compressor_drive_family(text)
        return v[:120] if v else None
    if key=="compressor_lubrication":
        v=compressor_lubrication_family(text)
        return v[:120] if v else None
    if key=="compressor_voltage_v":
        v=compressor_voltage_class(text)
        return v[:120] if v else None
    if key=="compressor_engine_type":
        v=compressor_engine_family(text)
        return v[:120] if v else None
    if key=="receiver_capacity_l":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3|m³)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*1000,3)
        return round(max(ns),3) if ns else None
    if key=="airflow_lmin":
        vals=[]
        vals.extend(float(x.replace(",",".")) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:л\s*/\s*мин|л/мин|l\s*/\s*min|l/min)\b",low,re.I))
        vals.extend(float(x.replace(",","."))*1000/60 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:м3\s*/\s*ч|м³\s*/\s*ч|m3\s*/\s*h|m³/h)\b",low,re.I))
        vals.extend(float(x.replace(",","."))*60 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:л\s*/\s*с|л/с|l\s*/\s*s|l/s)\b",low,re.I))
        return round(max(vals),3) if vals else (round(max(ns),3) if ns else None)
    if key=="heating_time_sec":
        vals=[]
        vals.extend(float(x.replace(",","."))*60 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:мин|min)\b",low,re.I))
        vals.extend(float(x.replace(",",".")) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:сек|секунд|с|sec|second(?:s)?)\b",low,re.I))
        return round(min(vals),3) if vals else (round(min(ns),3) if ns else None)
    if key=="operating_principle":
        return borehole_pump_principle_family(text)[:120] or None
    if key=="water_type":
        return surface_pump_water_family(text)[:120] or None
    if key=="connection_diameter_in":
        return fecal_pump_connection_inches(text)
    if key in ("max_pumping_depth_m","max_immersion_depth_m"):
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:см|cm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/100,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мм|mm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/1000,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м|m)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        return round(ns[0],3) if ns else None
    if key=="well_diameter_mm":
        value=None
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мм|mm)\b",low,re.I)
        if m:value=float(m.group(1).replace(",","."))
        if value is None:
            m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:см|cm)\b",low,re.I)
            if m:value=float(m.group(1).replace(",","."))*10
        if value is None:
            m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м|m)\b",low,re.I)
            if m:value=float(m.group(1).replace(",","."))*1000
        if value is None and ns:value=float(ns[0])
        # Residential / commercial borehole pump listings cannot reasonably have
        # a 900 mm required well diameter. Treat such source values as anomalies,
        # never as a numeric input to similarity.
        if value is not None and (value<30 or value>500):
            return None
        return round(value,3) if value is not None else None
    if key=="max_suction_depth_m":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:см|cm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/100,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мм|mm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/1000,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м|m)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        return round(ns[0],3) if ns else None
    if key=="max_water_temp_c":
        vals=[float(x.replace(",",".")) for x in re.findall(r"([+-]?\d+(?:[.,]\d+)?)\s*(?:°\s*[cс]|град(?:ус(?:а|ов)?)?\s*[cс]?)",low,re.I)]
        if vals:return round(vals[0],2)
        return round(ns[0],2) if ns else None
    if key=="energy_type":
        n=norm(text)
        if any(x in n for x in ("газов","пропан","бутан","сжиженн газ")): return "gas"
        if any(x in n for x in ("электр","220","230","380","400")): return "electric"
        return n[:80] or None
    if key=="vacuum_cleaning_type":
        return construction_vacuum_cleaning_family(text)[:120] or None
    if key=="vacuum_body_material":
        return construction_vacuum_body_family(text)[:120] or None
    if key=="pump_body_material":
        return drainage_pump_body_family(text)[:120] or None
    if key=="rotary_hammer_chuck":
        return rotary_hammer_chuck_family(text)[:120] or None
    if key=="chuck_type":
        return rotary_hammer_chuck_family(text)[:120] or None
    if key=="jigsaw_type":
        return jigsaw_device_family(text)[:120] or None
    if key=="paint_sprayer_type":
        return paint_sprayer_device_family(text)[:120] or None
    if key=="tank_position":
        return paint_sprayer_tank_family(text)[:120] or None
    if key=="screwdriver_type":
        return screwdriver_device_family(text)[:120] or None
    if key=="impact_drill_type":
        return impact_drill_device_family(text)[:120] or None
    if key=="circular_saw_type":
        return circular_saw_device_family(text)[:120] or None
    if key=="wrench_type":
        return impact_wrench_kind_family(text)[:120] or None
    if key=="motor_type":
        n=norm(text)
        if any(x in n for x in ("асинхрон","индукцион","induction","asynchronous")):return "induction"
        return impact_wrench_motor_family(text)[:120] or None
    if key=="chuck_type":
        return impact_wrench_chuck_family(text)[:120] or None
    if key=="operating_modes":
        t=impact_wrench_mode_tokens(text)
        return "+".join(sorted(t)) if t else None
    if key=="application_area":
        t=sprayer_application_tokens(text)
        return "+".join(sorted(t)) if t else None
    if key=="carry_type":
        return sprayer_carry_family(text)[:120] or None
    if key=="fuel_engine_type":
        return sprayer_engine_family(text)[:120] or None
    if key=="battery_type":
        n=norm(text)
        if any(x in n for x in ("размеры и вес","время работы от","емкость","напряжение","зарядное устройство")):
            return None
        if any(x in n for x in ("lifepo4","li fe po4","литий железо фосфат")):return "lifepo4"
        if any(x in n for x in ("li ion","li-ion","литий ион","литийион")):return "li ion"
        if any(x in n for x in ("li pol","li-pol","lipo","литий полимер")):return "li pol"
        if any(x in n for x in ("sla","свинцово кислот","свинцово-кислот")):return "sla"
        if any(x in n for x in ("gel","гелев")):return "gel"
        if any(x in n for x in ("nimh","ni mh","никель металл")):return "ni mh"
        if any(x in n for x in ("nicd","ni cd","никель кадм")):return "ni cd"
        return n[:120] or None
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
    if key in ("device_type","purpose","heater_type","thermostat_type","control_type","ip_rating","installation_type","fuel_type","heating_mode","motor_position","bulb_shape","equipment","snow_blower_type","drive_type","clutch_type","construction","engine_type","battery_type","tool_type","knife_type","blade_type","application_area","carry_type","fuel_engine_type"):
        return norm(text)[:240] or None
    if key=="base_type":
        m=re.search(r"\b(?:e|gu|gx|g)\s*\d+(?:[.]\d+)?\b",low,re.I)
        return re.sub(r"\s+","",m.group(0)).upper() if m else (norm(text)[:40] or None)
    if key=="impact_present":
        n=norm(text)
        b=bool_value(text)
        if b is not None:return b
        if any(x in n for x in ("с ударом","ударн","impact")):return True
        if any(x in n for x in ("безудар","без удара","шуруповерт","винтоверт","сверлен","вращен")):return False
        return None
    if key=="case_present":
        n=norm(text)
        if any(x in n for x in ("показать все характерист","все характеристики","характеристики товара")):return None
        b=bool_value(text)
        if b is not None:return b
        if any(x in n for x in ("без кейса","без чемодан","без футляр")):return False
        if any(x in n for x in ("кейс","чемодан","футляр")):return True
        return None
    if key in ("display_present","power_adjustment","temperature_adjustment","wheels_present","remote_control","fan_present","fan_only_mode","indicator_light","chain_brake","auto_chain_lubrication","tool_free_tension","operator_panel_control","headlight","heated_handles","skid_height_adjustment","collector_present","reverse_present","rotation_adjustment","cut_speed_adjustment","sliding_present","soft_start_present","speed_adjustment_present","grinder_present"):
        return presence_value(text)
    if key in ("overheat_protection","humidistat"):
        return bool_value(text)
    if key=="chain_pitch_in":
        return parse_fraction(low)
    if not ns: return None
    if key=="battery_count":
        n=norm(text)
        if any(x in n for x in ("без аккумулятор","без акб","аккумулятор не входит","акб не входит")):return 0
        m=re.search(r"(\d+)\s*(?:аккумулятор|акб|батаре)",low,re.I)
        if m:
            z=int(m.group(1))
            return z if 0<=z<=8 else None
        if len(ns)==1 and float(ns[0]).is_integer() and 0<=ns[0]<=8:return int(ns[0])
        return None
    if key=="speed_count":
        m=re.search(r"(\d+)\s*(?:скорост|передач)",low,re.I)
        if m:
            n=int(m.group(1))
            return n if 1<=n<=10 else None
        ints=[int(x) for x in ns if float(x).is_integer() and 1<=x<=10]
        return max(ints) if ints else None
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
    if key in ("planing_depth_mm","planing_width_mm"):
        mm=[float(x.replace(",",".")) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*мм\b",low,re.I)]
        if mm:return round(max(mm),3)
        cm=[float(x.replace(",","."))*10 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*см\b",low,re.I)]
        if cm:return round(max(cm),3)
        return round(max(ns),3)
    if key in ("cut_depth_wood_mm","cut_depth_metal_mm"):
        mm=[float(x.replace(",",".")) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*мм\b",low,re.I)]
        if mm:return round(max(mm),3)
        cm=[float(x.replace(",","."))*10 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*см\b",low,re.I)]
        if cm:return round(max(cm),3)
        return round(max(ns),3)
    if key=="strokes_per_min":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:ход(?:ов|а)?\s*/\s*мин|ход(?:ов|а)?\s*в\s*мин|spm|strokes?\s*/\s*min)",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),2)
        return round(max(ns),2)
    if key=="pressure_bar":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мпа|mpa)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*10,4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:кпа|kpa)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/100,4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:psi)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*0.0689476,4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:бар|bar)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:атм|atm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*1.01325,4)
        return round(ns[0],4)
    if key=="impact_energy_j":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:кдж|kj)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))*1000,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:дж|j|joule(?:s)?)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", ".")),3)
        return round(max(ns),3)
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
        # Parse milliamp-hours first. Values such as "2000 мА·ч" must become 2 Ah,
        # never 2000 Ah. The separator between A and h may be a dot/middle-dot/space.
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м\s*а\s*[·.\s-]?\s*ч|м\s*ач|m\s*a\s*h|mah)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", "."))/1000,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:а\s*[·.\s-]?\s*ч|ач|a\s*h|ah)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",", ".")),3)
        return round(ns[0],3)
    if key=="battery_voltage_v":
        return round(ns[0],2)
    if key in ("cut_depth_90_mm","cut_depth_45_mm","blade_diameter_mm","arbor_diameter_mm","grinding_wheel_diameter_mm","grinder_disc_diameter_mm"):
        mm=[float(x.replace(",",".")) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*мм\b",low,re.I)]
        if mm:return round(max(mm),3)
        cm=[float(x.replace(",","."))*10 for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*см\b",low,re.I)]
        if cm:return round(max(cm),3)
        fm=re.search(r"(\d+)\s*/\s*(\d+)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])",low,re.I)
        if fm and float(fm.group(2))!=0:return round(float(fm.group(1))/float(fm.group(2))*25.4,3)
        im=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])",low,re.I)
        if im:return round(float(im.group(1).replace(",","."))*25.4,3)
        return round(max(ns),3)
    if key=="tilt_angle_deg":
        return round(max(ns),2)
    if key=="drive_size_in":
        m=re.search(r"(\d+)\s*/\s*(\d+)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])?",low,re.I)
        if m and float(m.group(2))!=0:return round(float(m.group(1))/float(m.group(2)),4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:дюйм(?:а|ов)?|inch(?:es)?|[\"″])",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*мм\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/25.4,4)
        n=ns[0]
        return round(n/25.4,4) if n>2 else round(n,4)
    if key=="max_rpm":
        return round(max(ns),2)
    if key=="max_torque_nm":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:н\s*[·.*-]?\s*м|нм|n\s*[·.*-]?\s*m|nm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:кгс?|kgf)\s*[·.*-]?\s*(?:м|m)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*9.80665,2)
        return round(max(ns),2)
    if key=="charging_time_min":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мин|min)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:ч|час|hours?|h)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*60,2)
        return round(ns[0],2)
    if key=="max_head_m":
        # 21vek may publish both horizontal transfer distance and vertical head
        # in one field (e.g. "90 м по горизонтали; напор по вертикали 9 м").
        # Hydraulic comparison must use the vertical head.
        vertical_patterns=(
            r"(?:напор\s+по\s+вертикал\w*|по\s+вертикал\w*|вертикальн\w*\s+напор)[^0-9]{0,30}(\d+(?:[.,]\d+)?)\s*(?:м|m)\b",
            r"(\d+(?:[.,]\d+)?)\s*(?:м|m)\b[^;,.]{0,35}(?:по\s+вертикал\w*|вертикальн\w*)",
        )
        for pat in vertical_patterns:
            m=re.search(pat,low,re.I)
            if m:return round(float(m.group(1).replace(",",".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:см|cm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/100,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мм|mm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/1000,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м|m)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        return round(ns[0],3) if ns else None
    if key=="filter_particle_mm":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мм|mm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:см|cm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*10,3)
        return round(ns[0],3) if ns else None
    if key=="flow_rate_m3h":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3|m³)\s*/\s*(?:ч|h|hour)",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3|m³)\s*/\s*(?:мин|min)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*60,4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\s*/\s*(?:мин|min)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*0.06,4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\s*/\s*(?:ч|h|hour)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/1000,4)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мл|ml)\s*/\s*(?:мин|min)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*0.00006,4)
        return round(ns[0],4) if ns else None
    if key in ("flow_rate_lmin","flow_rate_input_lmin","flow_rate_output_lmin"):
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3|m³)\s*/\s*(?:ч|h|hour)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*1000/60,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м3|м³|m3|m³)\s*/\s*(?:мин|min)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))*1000,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\s*/\s*(?:мин|min)",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\s*/\s*(?:ч|h|hour)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/60,3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мл|ml)\s*/\s*(?:мин|min)",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/1000,3)
        return round(ns[0],3)
    if key=="tank_capacity_l":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:л|l)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),3)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:мл|ml)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/1000,3)
        return round(ns[0],3)
    if key=="spray_radius_m":
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:м|m)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",",".")),2)
        m=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:см|cm)\b",low,re.I)
        if m:return round(float(m.group(1).replace(",","."))/100,2)
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

    rule_keys={str(x.get("spec_key") or "") for x in rules}
    impact_drill_mode={"speed_count","max_rpm","impact_present"}.issubset(rule_keys)
    cordless_mode={"battery_count","case_present","max_torque_nm","battery_capacity_ah"}.issubset(rule_keys)
    jigsaw_mode={"cut_depth_wood_mm","strokes_per_min","motor_type"}.issubset(rule_keys)
    rotary_hammer_mode={"chuck_type","input_power_w","impact_energy_j","max_rpm"}.issubset(rule_keys)
    planer_mode={"motor_type","max_rpm","planing_depth_mm","planing_width_mm"}.issubset(rule_keys)
    reciprocating_saw_mode={"power_source","input_power_w","motor_type","cut_depth_wood_mm","cut_depth_metal_mm","strokes_per_min"}.issubset(rule_keys)
    construction_vacuum_mode={"input_power_w","tank_capacity_l","vacuum_cleaning_type","vacuum_body_material"}.issubset(rule_keys)
    construction_heat_gun_mode={"airflow_lmin","heating_time_sec","input_power_w"}.issubset(rule_keys)
    concrete_mixer_mode={"drum_capacity_l","crown_material","input_power_w"}.issubset(rule_keys)
    grain_crusher_mode={"input_power_w","throughput_kgh","grain_crusher_body_form","hopper_capacity_l"}.issubset(rule_keys)
    washstand_mode={"washstand_class","washstand_body_material","tank_capacity_l","water_heating_present"}.issubset(rule_keys)
    compressor_mode={"compressor_type","receiver_capacity_l","compressor_engine_type","compressor_drive_type","compressor_lubrication","compressor_voltage_v","flow_rate_lmin","flow_rate_input_lmin","flow_rate_output_lmin","pressure_bar"}.issubset(rule_keys)
    miter_saw_mode={"input_power_w","blade_diameter_mm","sliding_present","cut_depth_90_mm","cut_depth_45_mm","max_rpm"}.issubset(rule_keys)
    bench_grinder_mode={"motor_type","input_power_w","max_rpm","grinding_wheel_diameter_mm"}.issubset(rule_keys)
    angle_grinder_mode={"power_source","motor_type","battery_capacity_ah","input_power_w","soft_start_present","speed_adjustment_present","grinder_disc_diameter_mm"}.issubset(rule_keys)
    circulation_pump_mode={"max_head_m","flow_rate_m3h","input_power_w","pressure_bar","filter_particle_mm"}.issubset(rule_keys)
    drainage_pump_mode={"flow_rate_lmin","input_power_w","max_head_m","pump_body_material","filter_particle_mm"}.issubset(rule_keys)
    sewage_station_mode={"flow_rate_lmin","input_power_w","max_head_m","filter_particle_mm","max_water_temp_c"}.issubset(rule_keys)
    surface_pump_mode={"flow_rate_lmin","input_power_w","max_head_m","max_suction_depth_m","water_type"}.issubset(rule_keys)
    borehole_pump_mode={"water_type","operating_principle","max_head_m","max_pumping_depth_m","max_immersion_depth_m","well_diameter_mm","flow_rate_lmin"}.issubset(rule_keys)

    def concrete_mixer_fuzzy_key(label: Any,value: Any) -> str|None:
        if not concrete_mixer_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if any(x in ln for x in ("объем","обьем","ёмкост","емкост","вместим")) and "барабан" in ln:
            return "drum_capacity_l"
        if "венец" in ln and ("материал" in ln or any(x in vn for x in ("чугун","полиамид","пласт","полимер","сталь"))):
            return "crown_material"
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        return None


    def grain_crusher_fuzzy_key(label: Any,value: Any) -> str|None:
        if not grain_crusher_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if any(x in ln for x in ("производительн","пропускн способн","выработк")):
            if not any(x in ln for x in ("двигател","электр")):
                return "throughput_kgh"
        if "форм" in ln and "корпус" in ln:
            return "grain_crusher_body_form"
        if "корпус" in ln and any(x in vn for x in ("кругл","цилиндр","прямоугол","квадрат","конич","конус","round","cylind","rectang","square","conic")):
            return "grain_crusher_body_form"
        if "бункер" in ln and any(x in ln for x in ("объем","обьем","ёмкост","емкост","вместим","загруз")):
            return "hopper_capacity_l"
        return None


    def washstand_fuzzy_key(label: Any,value: Any) -> str|None:
        if not washstand_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if ("материал" in ln and "корпус" in ln) or ln=="материал":
            return "washstand_body_material"
        if any(x in ln for x in ("емкост","ёмкост","объем","обьем","вместим")) and any(x in ln for x in ("бак","резервуар","для вод")):
            return "tank_capacity_l"
        if ln in ("объем","обьем","объём"):
            return "tank_capacity_l"
        if any(x in ln for x in ("подогрев","нагрев вод","водонагрев","нагревател")):
            return "water_heating_present"
        if any(x in ln for x in ("функц","особенност","комплект")) and any(x in vn for x in ("подогрев","нагрев вод","водонагрев")):
            return "water_heating_present"
        return None


    def compressor_fuzzy_key(label: Any,value: Any) -> str|None:
        if not compressor_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if ("тип" in ln or "вид" in ln or "принцип" in ln) and "компресс" in ln:
            return "compressor_type"
        if any(x in ln for x in ("ресивер","ресивер")) and any(x in ln for x in ("объем","обьем","ёмкост","емкост","вместим")):
            return "receiver_capacity_l"
        if ("двигател" in ln and any(x in ln for x in ("тип","вид"))) or (
            "тип двигателя" in ln or "двигатель"==ln
        ):
            return "compressor_engine_type"
        if ("тип питан" in ln or "источник питан" in ln) and any(x in vn for x in ("сеть","сетев","электр","бензин","дизел","gasoline","diesel")):
            return "compressor_engine_type"
        if "привод" in ln and "двигател" not in ln:
            return "compressor_drive_type"
        if "смаз" in ln or "масл" in ln and any(x in ln for x in ("тип","систем","налич")):
            return "compressor_lubrication"
        if "напряжен" in ln and re.search(r"\b(?:110|127|220|230|240|380|400)\s*(?:в|v)\b",vn):
            return "compressor_voltage_v"
        if any(x in ln for x in ("производительн","подач","расход воздух","воздушн поток")) and "мощност" not in ln:
            if "выход" in ln:return "flow_rate_output_lmin"
            if "вход" in ln:return "flow_rate_input_lmin"
            return "flow_rate_lmin"
        if "давлен" in ln and any(x in ln for x in ("макс","рабоч","номин")):
            return "pressure_bar"
        if "максимальное давление" in ln or "макс давление" in ln:
            return "pressure_bar"
        # Some 21vek cards place the value under a short generic label.
        if ln=="давление" and any(x in vn for x in ("бар","bar","мпа","mpa","psi")):
            return "pressure_bar"
        return None


    def impact_drill_fuzzy_key(label: Any,value: Any) -> str|None:
        if not impact_drill_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст","удар")):
            return "input_power_w"
        if ("скорост" in ln or "ступен" in ln) and any(x in ln for x in ("колич","число")) and "регулиров" not in ln:
            return "speed_count"
        if "удар" not in ln:
            rpm_label=(
                ("оборот" in ln and any(x in ln for x in ("макс","число","холост")))
                or ("вращен" in ln and any(x in ln for x in ("макс","скорост","частот")))
                or ("частота вращен" in ln)
            )
            if rpm_label and "регулиров" not in ln:return "max_rpm"
        if "удар" in ln and not any(x in ln for x in ("частот","колич","число")):
            return "impact_present"
        if any(x in ln for x in ("режим","функц","операц")) and any(x in vn for x in ("с удар","ударн","impact")):
            return "impact_present"
        return None










    def circulation_pump_fuzzy_key(label: Any,value: Any) -> str|None:
        if not circulation_pump_mode:return None
        ln=norm(label)
        if not ln:return None
        if any(x in ln for x in ("производительн","пропускн способн","максимальн подач","макс подач","расход вод","расход жидк")):
            return "flow_rate_m3h"
        if ln=="подача" or ("подач" in ln and "высот" not in ln):
            return "flow_rate_m3h"
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if "напор" in ln or ("высот" in ln and any(x in ln for x in ("подъем","подъём","подач"))):
            return "max_head_m"
        if "давлен" in ln and "напор" not in ln:
            return "pressure_bar"
        if (
            ("частиц" in ln or "загрязнен" in ln or "загрязнён" in ln or "примес" in ln)
            and any(x in ln for x in ("размер","диаметр","пропуск","макс","фильтр"))
        ):
            return "filter_particle_mm"
        return None


    def drainage_pump_fuzzy_key(label: Any,value: Any) -> str|None:
        if not drainage_pump_mode:return None
        ln=norm(label)
        if not ln:return None
        if any(x in ln for x in ("производительн","пропускн способн","максимальн подач","макс подач","расход вод")):
            return "flow_rate_lmin"
        if ln=="подача" or ("подач" in ln and "высот" not in ln):
            return "flow_rate_lmin"
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if "напор" in ln or ("высот" in ln and any(x in ln for x in ("подъем","подъём","подач"))):
            return "max_head_m"
        if "материал" in ln and "корпус" in ln:
            return "pump_body_material"
        if (
            ("частиц" in ln or "загрязнен" in ln or "загрязнён" in ln or "примес" in ln)
            and any(x in ln for x in ("размер","диаметр","пропуск","макс","фильтр"))
        ):
            return "filter_particle_mm"
        return None


    def borehole_pump_fuzzy_key(label: Any,value: Any) -> str|None:
        if not borehole_pump_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if any(x in ln for x in ("производительн","пропускн способн","максимальн подач","макс подач","расход вод","расход жидк")):
            return "flow_rate_lmin"
        if ln=="подача" or ("подач" in ln and "высот" not in ln):
            return "flow_rate_lmin"
        if "напор" in ln or ("высот" in ln and any(x in ln for x in ("подъем","подъём","подач"))):
            return "max_head_m"
        if "глубин" in ln and "погруж" in ln:
            return "max_immersion_depth_m"
        if "глубин" in ln and ("откач" in ln or "забор" in ln):
            return "max_pumping_depth_m"
        if ("диаметр" in ln and "скваж" in ln) or ("диаметр" in ln and "обсад" in ln):
            return "well_diameter_mm"
        if ("принцип" in ln and any(x in ln for x in ("действ","работ"))) or (
            "тип насоса" in ln and any(x in vn for x in ("центробеж","винтов","шнек","вихрев","вибрац","centrifugal","screw","vortex"))
        ):
            return "operating_principle"
        if (
            ("тип" in ln or "вид" in ln or "качест" in ln or "перекач" in ln)
            and ("вод" in ln or "жидк" in ln)
        ):
            return "water_type"
        if "вод" in ln and any(x in vn for x in ("чист","гряз","загряз","сточ","канализац","морск","солен","пресн")):
            return "water_type"
        return None


    def surface_pump_fuzzy_key(label: Any,value: Any) -> str|None:
        if not surface_pump_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if any(x in ln for x in ("производительн","пропускн способн","максимальн подач","макс подач","расход вод","расход жидк")):
            return "flow_rate_lmin"
        if ln=="подача" or ("подач" in ln and "высот" not in ln):
            return "flow_rate_lmin"
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if "напор" in ln or ("высот" in ln and any(x in ln for x in ("подъем","подъём","подач"))):
            return "max_head_m"
        if "глубин" in ln and any(x in ln for x in ("всасыв","забор","откач")):
            return "max_suction_depth_m"
        if "высот" in ln and "всасыв" in ln:
            return "max_suction_depth_m"
        if (
            ("тип" in ln or "вид" in ln or "качест" in ln or "перекач" in ln)
            and ("вод" in ln or "жидк" in ln)
        ):
            return "water_type"
        if "вод" in ln and any(x in vn for x in ("чист","гряз","загряз","сточ","канализац","морск","солен","пресн")):
            return "water_type"
        return None


    def sewage_station_fuzzy_key(label: Any,value: Any) -> str|None:
        if not sewage_station_mode:return None
        ln=norm(label)
        if not ln:return None
        if any(x in ln for x in ("производительн","пропускн способн","максимальн подач","макс подач","расход вод","расход жидк")):
            return "flow_rate_lmin"
        if ln=="подача" or ("подач" in ln and "высот" not in ln):
            return "flow_rate_lmin"
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if "напор" in ln or ("высот" in ln and any(x in ln for x in ("подъем","подъём","подач"))):
            return "max_head_m"
        if (
            ("частиц" in ln or "загрязнен" in ln or "загрязнён" in ln or "примес" in ln)
            and any(x in ln for x in ("размер","диаметр","пропуск","макс","фильтр"))
        ):
            return "filter_particle_mm"
        if ("температур" in ln and any(x in ln for x in ("вод","жидк","перекач"))
            and not any(x in ln for x in ("окружа","воздух","двигател"))):
            return "max_water_temp_c"
        return None


    def angle_grinder_fuzzy_key(label: Any,value: Any) -> str|None:
        if not angle_grinder_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if "двигател" in ln and any(x in ln for x in ("тип","мотор")):
            return "motor_type"
        if any(x in ln for x in ("источник питан","тип питан","электропитан")):
            return "power_source"
        if "питан" in ln and any(x in vn for x in ("аккумуля","батар","сеть","сетев","220","230")):
            return "power_source"
        if ("емкост" in ln or "ёмкост" in ln) and any(x in ln for x in ("аккумуля","акб","батар")):
            return "battery_capacity_ah"
        if "плавн" in ln and any(x in ln for x in ("пуск","старт")):
            return "soft_start_present"
        if "регулиров" in ln and any(x in ln for x in ("оборот","скорост","частот вращ")):
            return "speed_adjustment_present"
        if "диаметр" in ln and any(x in ln for x in ("диск","круг")) and "посад" not in ln:
            return "grinder_disc_diameter_mm"
        return None

    def bench_grinder_fuzzy_key(label: Any,value: Any) -> str|None:
        if not bench_grinder_mode:return None
        ln=norm(label)
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if "двигател" in ln and any(x in ln for x in ("тип","мотор")):
            return "motor_type"
        if "диаметр" in ln and any(x in ln for x in ("круг","диск")) and "посад" not in ln:
            return "grinding_wheel_diameter_mm"
        rpm_label=(
            ("оборот" in ln and any(x in ln for x in ("макс","число","холост")))
            or ("вращен" in ln and any(x in ln for x in ("макс","скорост","частот")))
            or ("частота вращен" in ln)
        )
        if rpm_label and "регулиров" not in ln:return "max_rpm"
        return None

    def miter_saw_fuzzy_key(label: Any,value: Any) -> str|None:
        if not miter_saw_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст")):
            return "input_power_w"
        if "диаметр" in ln and "диск" in ln and "посад" not in ln:
            return "blade_diameter_mm"
        if "протяж" in ln or ("горизонтальн" in ln and any(x in ln for x in ("перемещ","ход","скольж"))):
            return "sliding_present"
        if ("глубин" in ln or "высот" in ln) and any(x in ln for x in ("рез","пропил")):
            if re.search(r"(^|\D)90(?:\D|$)",ln):return "cut_depth_90_mm"
            if re.search(r"(^|\D)45(?:\D|$)",ln):return "cut_depth_45_mm"
        rpm_label=(
            ("оборот" in ln and any(x in ln for x in ("макс","число","холост")))
            or ("вращен" in ln and any(x in ln for x in ("макс","скорост","частот")))
            or ("частота вращен" in ln)
        )
        if rpm_label and "регулиров" not in ln:return "max_rpm"
        if "протяж" in vn and any(x in ln for x in ("функц","особенност","конструкц")):
            return "sliding_present"
        return None

    def construction_heat_gun_fuzzy_key(label: Any,value: Any) -> str|None:
        if not construction_heat_gun_mode:return None
        ln=norm(label)
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("поток","нагрев","выходн")):
            return "input_power_w"
        if any(x in ln for x in ("производитель","воздушн поток","поток воздуха","расход воздуха","подача воздуха")):
            return "airflow_lmin"
        if ("время" in ln and any(x in ln for x in ("нагрев","разогрев","выход"))) or "скорост нагрева" in ln:
            return "heating_time_sec"
        return None

    def construction_vacuum_fuzzy_key(label: Any,value: Any) -> str|None:
        if not construction_vacuum_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("всасыв", "розет", "выходн")):
            return "input_power_w"
        if any(x in ln for x in ("объем", "обьем", "емкост")) and any(x in ln for x in ("бак","контейнер","пылесбор")):
            return "tank_capacity_l"
        if any(x in ln for x in ("тип убор", "вид убор", "режим убор", "тип очист")):
            return "vacuum_cleaning_type"
        if "материал" in ln and any(x in ln for x in ("корпус","бак","контейнер","пылесбор")):
            return "vacuum_body_material"
        if "уборк" in ln and any(x in vn for x in ("сух","влаж","wet","dry")):
            return "vacuum_cleaning_type"
        return None

    def reciprocating_saw_fuzzy_key(label: Any,value: Any) -> str|None:
        if not reciprocating_saw_mode:return None
        ln=norm(label);vn=norm(primitive_text(value))
        if not ln:return None
        if "мощност" in ln and not any(x in ln for x in ("выходн","акуст","удар")):
            return "input_power_w"
        if "глубин" in ln and any(x in ln for x in ("пропил","рез")):
            if any(x in ln for x in ("дерев","древес")):return "cut_depth_wood_mm"
            if any(x in ln for x in ("металл","сталь","алюмин")):return "cut_depth_metal_mm"
        if any(x in ln for x in ("ход", "движен пилк")) and any(x in ln for x in ("минут","частот","число","колич","макс")):
            return "strokes_per_min"
        if "двигател" in ln and any(x in ln for x in ("тип","мотор")):return "motor_type"
        if any(x in ln for x in ("источник питан","тип питан","электропитан")):return "power_source"
        if "питан" in ln and any(x in vn for x in ("аккумуля","батар","сеть","сетев","220","230")):return "power_source"
        return None

    def planer_fuzzy_key(label: Any,value: Any) -> str|None:
        if not planer_mode:return None
        ln=norm(label)
        if not ln:return None
        if "глубин" in ln and any(x in ln for x in ("строг","выбор","съем","сняти")):
            return "planing_depth_mm"
        if "ширин" in ln and any(x in ln for x in ("строг","обработ","нож","рабоч")):
            return "planing_width_mm"
        rpm_label=(
            ("оборот" in ln and any(x in ln for x in ("макс","число","холост")))
            or ("вращен" in ln and any(x in ln for x in ("макс","скорост","частот")))
            or ("частота вращен" in ln)
        )
        if rpm_label and "регулиров" not in ln:return "max_rpm"
        if "двигател" in ln and any(x in ln for x in ("тип","мотор")):return "motor_type"
        return None

    def rotary_hammer_fuzzy_key(label: Any,value: Any) -> str|None:
        if not rotary_hammer_mode:return None
        ln=norm(label)
        if not ln:return None
        if "патрон" in ln or "креплен" in ln and any(x in ln for x in ("бур","оснаст","хвост")):
            return "chuck_type"
        if "энерг" in ln and "удар" in ln:return "impact_energy_j"
        if "сила" in ln and "удар" in ln:return "impact_energy_j"
        if "мощност" in ln and not any(x in ln for x in ("удар","акуст","выходн")):
            return "input_power_w"
        rpm_label=(
            ("оборот" in ln and any(x in ln for x in ("макс","число","холост")))
            or ("вращен" in ln and any(x in ln for x in ("макс","скорост","частот")))
            or ("частота вращен" in ln)
        )
        if rpm_label and "регулиров" not in ln:return "max_rpm"
        return None

    def jigsaw_fuzzy_key(label: Any,value: Any) -> str|None:
        if not jigsaw_mode:return None
        ln=norm(label)
        if not ln:return None
        # 21vek uses several wording variants for the same two agreed metrics.
        # Keep wood depth separate from metal/aluminium values.
        if ("глубин" in ln or "толщин" in ln) and ("пропил" in ln or "рез" in ln) and "дерев" in ln:
            return "cut_depth_wood_mm"
        if "ход" in ln and "длина" not in ln and any(x in ln for x in ("частот","число","колич","кол во","макс","холост","движен")):
            return "strokes_per_min"
        return None

    def push(k: str,label: Any,text: str,source: str,path: str=""):
        if not k or not text:return
        sig=(k,text)
        if sig in seen:return
        seen.add(sig);raw.append({"key":k,"label":str(label),"value":text,"source":source,"path":path})

    def cordless_extras(label: Any,value: Any,source: str,path: str=""):
        if not cordless_mode:return
        text=primitive_text(value)
        if not text:return
        ln=norm(label);vn=norm(text)
        equipment_label=any(x in ln for x in ("комплект","поставк","набор","аксессуар","оснащен"))
        if not equipment_label:return
        if any(x in vn for x in ("аккумулятор","акб","батаре")):
            if any(x in vn for x in ("без аккумулятор","без акб","аккумулятор не входит","акб не входит")):
                push("battery_count",label,"0 аккумуляторов",source,path)
            else:
                m=re.search(r"(\d+)\s*(?:аккумулятор|акб|батаре)",str(text).lower(),re.I)
                if m:push("battery_count",label,m.group(1)+" аккумулятора",source,path)
        if any(x in vn for x in ("кейс","чемодан","футляр")):
            push("case_present",label,"кейс",source,path)
        elif any(x in vn for x in ("без кейса","без чемодан","без футляр")):
            push("case_present",label,"без кейса",source,path)

    def add(label: Any,value: Any,source: str,path: str=""):
        text=primitive_text(value)
        k=aliases.get(norm(label)) or concrete_mixer_fuzzy_key(label,value) or grain_crusher_fuzzy_key(label,value) or washstand_fuzzy_key(label,value) or compressor_fuzzy_key(label,value) or borehole_pump_fuzzy_key(label,value) or surface_pump_fuzzy_key(label,value) or sewage_station_fuzzy_key(label,value) or circulation_pump_fuzzy_key(label,value) or drainage_pump_fuzzy_key(label,value) or angle_grinder_fuzzy_key(label,value) or bench_grinder_fuzzy_key(label,value) or miter_saw_fuzzy_key(label,value) or construction_heat_gun_fuzzy_key(label,value) or construction_vacuum_fuzzy_key(label,value) or reciprocating_saw_fuzzy_key(label,value) or planer_fuzzy_key(label,value) or rotary_hammer_fuzzy_key(label,value) or impact_drill_fuzzy_key(label,value) or jigsaw_fuzzy_key(label,value)
        if k and text:push(k,label,text,source,path)
        cordless_extras(label,value,source,path)

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

    values={};anomalies=[]
    for x in raw:
        val=normalize_value(x["key"],x["value"])
        if val is not None and x["key"] not in values:
            values[x["key"]]=val
        elif x["key"]=="well_diameter_mm":
            raw_nums=nums(x.get("value"))
            if raw_nums and max(raw_nums)>=500:
                anomalies.append("Диаметр скважины в источнике выглядит аномально: "+str(x.get("value") or ""))
    if anomalies:
        values["_data_anomalies"]=list(dict.fromkeys(anomalies))[:5]
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


def resolve_own_card(session: requests.Session,product_name: str) -> dict|None:
    """Resolve a missing own 21vek card using its price-list name.

    Only page 1 is queried and a model token must match. A recovered card does
    not invent a ranking position: without a ranked hit it remains outside TOP-120.
    """
    q=re.sub(r"^\s*sale!\s*","",str(product_name or ""),flags=re.I).strip()
    if not q:return None
    q=re.sub(r"\([^)]*\)"," ",q)
    q=" ".join(q.split())
    try:
        data=search_page(session,q,1,"",attempts=2)
    except Exception:
        return None
    src=norm(product_name)
    model_tokens=[
      t for t in re.findall(r"[0-9a-zа-я]+(?:[/.-][0-9a-zа-я]+)*",src,re.I)
      if any(ch.isdigit() for ch in t) and len(t)>=2
    ]
    best=None;best_score=-1
    for item in data.get("products") or []:
        name=item_name(item);url=item_url(item)
        if not url or not is_our_brand(item,name):continue
        nn=norm(name)
        hits=sum(1 for t in model_tokens if t in nn)
        if model_tokens and hits<=0:continue
        meta=search_meta(item)
        score=hits*10
        if norm(meta.get("brand")) and norm(meta.get("brand")) in src:score+=3
        if score>best_score:
            best={
              "product_name":name,"product_url":url,"external_id":meta.get("external_id"),
              "brand":meta.get("brand") or "","price":valid_price(meta.get("price")),
              "in_stock":meta.get("in_stock")
            }
            best_score=score
    return best


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
    # Keep the stable scope key/query in CRM, but query station-specific terms
    # first so submerged WQ pumps do not define this market.
    if scope.get("profile_key")=="sewage_station":
        candidates=[
          "канализационная установка",
          "канализационная станция",
          "станция принудительной канализации",
          "канализационная насосная установка",
          "канализационная насосная станция",
          q
        ]
    if scope.get("profile_key")=="borehole_pump":
        for alt in ("насос скважинный","погружной скважинный насос","глубинный насос"):
            if norm(alt)!=norm(q): candidates.append(alt)
    if scope.get("profile_key")=="surface_pump":
        for alt in ("насос поверхностный","садовый поверхностный насос","самовсасывающий поверхностный насос"):
            if norm(alt)!=norm(q): candidates.append(alt)
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
                if scope.get("profile_key")=="sewage_station":
                    sn=norm(name)
                    # Exclude explicit submerged sewage/fecal pumps from the
                    # forced-sewage-station market while keeping KN/Sanipro-like
                    # station models that may not spell "station" in the title.
                    if any(x in sn for x in ("погружн","фекальн","дренажн")) or re.search(r"(^|\s)wq[-\s]?\d",sn,re.I):
                        continue
                if scope.get("profile_key")=="paint_sprayer" and paint_sprayer_device_family(name)!="electric_spray_gun":
                    continue
                if scope.get("profile_key")=="jigsaw":
                    jn=norm(name)
                    if "лобзик" not in jn or "пилк" in jn or "полотн" in jn or ("ручной" in jn and "лобзик" in jn):
                        continue
                if scope.get("profile_key")=="rotary_hammer":
                    rn=norm(name)
                    if "перфоратор" not in rn or any(x in rn for x in ("патрон для","набор бур","бур для","насадк","запчаст")):
                        continue
                if scope.get("profile_key")=="planer":
                    pn=norm(name)
                    if "рубан" not in pn or any(x in pn for x in ("ручн","рашпил","гипсокарт","нож для","ножи для","лезв","ремень для","запчаст")):
                        continue
                if scope.get("profile_key")=="reciprocating_saw":
                    sn=norm(name)
                    if "сабельн" not in sn or "пил" not in sn or any(x in sn for x in ("полотно","полотн","пилка","насадк","запчаст")):
                        continue
                if scope.get("profile_key")=="construction_vacuum":
                    vn=norm(name)
                    vacuum_class=any(x in vn for x in ("профессиональн","строительн","промышленн"))
                    if ("пылесос" not in vn or not vacuum_class
                        or any(x in vn for x in ("робот","вертикальн","ручной","автомобильн","моющ","мешок для","фильтр для","шланг для","насадк"))):
                        continue
                if scope.get("profile_key")=="construction_heat_gun":
                    hn=norm(name)
                    heatgun_class=(("фен" in hn and any(x in hn for x in ("строительн","техническ"))) or "термофен" in hn or "термопистолет" in hn)
                    if not heatgun_class or any(x in hn for x in ("клеев","термокле","для волос","парикмах")):
                        continue
                if scope.get("profile_key")=="miter_saw":
                    mn=norm(name)
                    if not (("торцов" in mn and "пил" in mn) or "miter saw" in mn or "mitre saw" in mn):
                        continue
                    if any(x in mn for x in ("диск для","пильн диск","станина","стол для","подставк","запчаст")):
                        continue
                if scope.get("profile_key")=="bench_grinder":
                    gn=norm(name)
                    grinder_class=(("точильн" in gn and "станок" in gn) or ("точильно шлифовальн" in gn and "станок" in gn) or "bench grinder" in gn)
                    if not grinder_class or any(x in gn for x in ("камень для","круг для","диск для","заточный многофункцион","для цеп","запчаст")):
                        continue
                if scope.get("profile_key")=="concrete_mixer":
                    mn=norm(name)
                    mixer_class=("бетономеш" in mn or "бетоносмес" in mn)
                    if not mixer_class or any(x in mn for x in ("венец для","двигатель для","лопасть для","ремень для","запчаст","шестерн для","насадка миксер","дрель миксер")):
                        continue
                if scope.get("profile_key")=="grain_crusher":
                    gn=norm(name)
                    grain_class=("зернодроб" in gn or ("измельчител" in gn and any(x in gn for x in ("зерн","корм"))))
                    if not grain_class or any(x in gn for x in ("сито для","нож для","решетк","решётк","ремень для","запчаст","комплект для")):
                        continue
                if scope.get("profile_key")=="washstand":
                    wn=norm(name)
                    if "умываль" not in wn:
                        continue
                    # Only confirmed full washstand sets enter the analogue pool.
                    # Tanks/hand-wash basins, heaters, spare parts and shower sets
                    # are a different product class and must never win by price.
                    if washstand_class_from_name(name)!="full_set":
                        continue
                if scope.get("profile_key")=="compressor":
                    cn=norm(name);cu=url_key(url)
                    compressor_class=("компрессор" in cn)
                    excluded=(
                        "inflators/" in cu
                        or any(x in cn for x in (
                          "автомобильн","без акб","без аккумулятор","аккумуляторн компрессор",
                          "голова компрессор","компрессорная голова","головка компрессор",
                          "блок компрессор","компрессорный блок","насос компрессорн",
                          "масло компресс","шланг","фильтр для","ремень для","головка для",
                          "запчаст","пистолет","набор для"
                        ))
                    )
                    if not compressor_class or excluded:
                        continue
                if scope.get("profile_key")=="circulation_pump":
                    cn=norm(name)
                    circulation_class=("циркуляц" in cn and "насос" in cn)
                    if (not circulation_class
                        or any(x in cn for x in ("дренаж","фекаль","канализац","скважин","поверхност","шланг","муфт","патруб","переходник","фильтр для","запчаст"))):
                        continue
                if scope.get("profile_key")=="drainage_pump":
                    dn=norm(name)
                    pump_class=("дренаж" in dn and "насос" in dn)
                    if not pump_class or any(x in dn for x in ("шланг","муфт","патруб","переходник","фильтр для","запчаст")):
                        continue
                if scope.get("profile_key")=="sewage_station":
                    sn=norm(name)
                    station_class=("канализац" in sn and any(x in sn for x in ("насос","станц","установ")))
                    if not station_class or any(x in sn for x in ("запчаст","шланг","муфт","патруб","переходник")):
                        continue
                if scope.get("profile_key")=="surface_pump":
                    pn2=norm(name)
                    surface_class=("поверхност" in pn2 and "насос" in pn2)
                    if not surface_class or any(x in pn2 for x in ("насосная станц","станция водоснабж","шланг","муфт","патруб","переходник","запчаст")):
                        continue
                if scope.get("profile_key")=="borehole_pump":
                    bn=norm(name)
                    borehole_class=("насос" in bn and ("скважин" in bn or "глубинн" in bn))
                    if (not borehole_class
                        or any(x in bn for x in ("дренаж","фекаль","канализац","сточн","поверхност","насосная станц","ремкомплект","запчаст","шланг","муфт","патруб","переходник"))):
                        continue
                if scope.get("profile_key")=="angle_grinder":
                    an=norm(name)
                    grinder_class=(("углов" in an and "шлиф" in an and "машин" in an) or "болгарк" in an or re.search(r"\bа?ушм\b",an))
                    if not grinder_class or any(x in an for x in ("полировальн","диск для","щетк","щёт","ручк","ключ для","запчаст")):
                        continue
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
    if "spray_radius_m" in keys and "flow_rate_lmin" in keys and "tank_capacity_l" in keys:
        return RULESET_VERSION+"-sprayer2"
    if "max_torque_nm" in keys and "drive_size_in" in keys and "wrench_type" in keys:
        return RULESET_VERSION+"-wrench2"
    if {"max_head_m","flow_rate_m3h","input_power_w","pressure_bar","filter_particle_mm"}.issubset(keys):
        return RULESET_VERSION+"-circulationpump1"
    if {"water_type","operating_principle","max_head_m","max_pumping_depth_m","max_immersion_depth_m","well_diameter_mm","flow_rate_lmin"}.issubset(keys):
        return RULESET_VERSION+"-boreholepump2"
    if "max_head_m" in keys and "max_suction_depth_m" in keys and "water_type" in keys and "flow_rate_lmin" in keys and "input_power_w" in keys:
        return RULESET_VERSION+"-surfacepump1"
    if "max_head_m" in keys and "max_water_temp_c" in keys and "filter_particle_mm" in keys and "flow_rate_lmin" in keys and "input_power_w" in keys:
        return RULESET_VERSION+"-sewagestation2"
    if {"pump_body_material","flow_rate_lmin","max_head_m","connection_diameter_in","filter_particle_mm","grinder_present","water_type"}.issubset(keys):
        return RULESET_VERSION+"-fecalpump2"
    if "max_head_m" in keys and "pump_body_material" in keys and "filter_particle_mm" in keys and "flow_rate_lmin" in keys:
        return RULESET_VERSION+"-drainpump2"
    if {"drum_capacity_l","crown_material","input_power_w"}.issubset(keys):
        return RULESET_VERSION+"-concretemixer2"
    if {"input_power_w","throughput_kgh","grain_crusher_body_form","hopper_capacity_l"}.issubset(keys):
        return RULESET_VERSION+"-graincrusher1"
    if {"washstand_class","washstand_body_material","tank_capacity_l","water_heating_present"}.issubset(keys):
        return RULESET_VERSION+"-washstand3"
    if {"compressor_type","receiver_capacity_l","compressor_engine_type","compressor_drive_type","compressor_lubrication","compressor_voltage_v","flow_rate_input_lmin","flow_rate_output_lmin","pressure_bar"}.issubset(keys):
        return RULESET_VERSION+"-compressor3"
    if "grinder_disc_diameter_mm" in keys and "power_source" in keys and "soft_start_present" in keys and "speed_adjustment_present" in keys:
        return RULESET_VERSION+"-anglegrinder1"
    if "grinding_wheel_diameter_mm" in keys and "motor_type" in keys and "max_rpm" in keys and "input_power_w" in keys:
        return RULESET_VERSION+"-benchgrinder1"
    if "blade_diameter_mm" in keys and "sliding_present" in keys and "cut_depth_90_mm" in keys and "cut_depth_45_mm" in keys:
        return RULESET_VERSION+"-mitersaw1"
    if "blade_diameter_mm" in keys and "cut_depth_90_mm" in keys and "arbor_diameter_mm" in keys:
        return RULESET_VERSION+"-circular2"
    if "speed_count" in keys and "max_rpm" in keys and "impact_present" in keys:
        return RULESET_VERSION+"-impactdrill2"
    if "battery_count" in keys and "case_present" in keys and "max_torque_nm" in keys:
        return RULESET_VERSION+"-screwdriver2"
    if "pressure_bar" in keys and "tank_position" in keys and "input_power_w" in keys:
        return RULESET_VERSION+"-paintsprayer2"
    if "airflow_lmin" in keys and "heating_time_sec" in keys and "input_power_w" in keys:
        return RULESET_VERSION+"-constructionheatgun1"
    if "tank_capacity_l" in keys and "vacuum_cleaning_type" in keys and "vacuum_body_material" in keys:
        return RULESET_VERSION+"-vacuum1"
    if "cut_depth_metal_mm" in keys and "cut_depth_wood_mm" in keys and "strokes_per_min" in keys and "motor_type" in keys:
        return RULESET_VERSION+"-recipsaw1"
    if "cut_depth_wood_mm" in keys and "strokes_per_min" in keys and "motor_type" in keys:
        return RULESET_VERSION+"-jigsaw3"
    if "chuck_type" in keys and "impact_energy_j" in keys and "max_rpm" in keys:
        return RULESET_VERSION+"-rotaryhammer1"
    if "planing_depth_mm" in keys and "planing_width_mm" in keys and "motor_type" in keys:
        return RULESET_VERSION+"-planer2"
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
    if any(r.get("spec_key")=="flow_rate_input_lmin" for r in rules):
        if specs.get("flow_rate_input_lmin") is not None:
            specs["flow_rate_lmin"]=specs["flow_rate_input_lmin"]
            specs["compressor_flow_basis"]="input"
        elif specs.get("flow_rate_output_lmin") is not None:
            specs["flow_rate_lmin"]=specs["flow_rate_output_lmin"]
            specs["compressor_flow_basis"]="output"
        elif specs.get("flow_rate_lmin") is not None:
            specs["compressor_flow_basis"]="generic"
    if any(r.get("spec_key")=="washstand_class" for r in rules):
        specs["washstand_class"]=washstand_class_from_name(
          card.get("product_name") or base.get("model") or base.get("product_name") or "",
          base.get("sku") or ""
        )
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
        elif "станок" in device_name and any(x in device_name for x in ("циркуляр","распилов","настоль")):
            specs["device_type"]="циркулярный станок"
        elif ("дисков" in device_name and "пил" in device_name) or "циркуляр" in device_name:
            if "погруж" in device_name:specs["device_type"]="погружная дисковая пила"
            elif "мини" in device_name:specs["device_type"]="мини-дисковая пила"
            else:specs["device_type"]="дисковая пила"
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
        elif "опрыскив" in device_name:
            specs["device_type"]="опрыскиватель"
        elif "гайковерт" in device_name:
            specs["device_type"]="гайковерт"
        elif "лобзик" in device_name:
            if "ручной" in device_name:specs["device_type"]="ручной лобзик"
            else:specs["device_type"]="лобзик"
        elif "краскопульт" in device_name:
            if "пневмат" in device_name:specs["device_type"]="пневматический краскопульт"
            elif (("окрасоч" in device_name and "аппарат" in device_name)
                  or ("покрасоч" in device_name and "станц" in device_name)
                  or "безвоздуш" in device_name):specs["device_type"]="окрасочный аппарат"
            else:specs["device_type"]="электрический краскопульт"
        elif "шуруповерт" in device_name:
            specs["device_type"]="дрель-шуруповерт" if "дрел" in device_name else "шуруповерт"
        elif "перфоратор" in device_name:
            specs["device_type"]="перфоратор"
        elif "дрел" in device_name:
            if "шуруповерт" in device_name:specs["device_type"]="дрель-шуруповерт"
            elif "миксер" in device_name:specs["device_type"]="дрель-миксер"
            elif "удар" in device_name:specs["device_type"]="ударная дрель"
            elif "безудар" in device_name:specs["device_type"]="безударная дрель"
            else:specs["device_type"]="дрель"
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












    heatgun_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="airflow_lmin" for r in rules) and any(r.get("spec_key")=="heating_time_sec" for r in rules):
        desc=str(extra.get("description_text") or "")
        if specs.get("airflow_lmin") is None:
            vals=[float(x.replace(",",".")) for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:л\s*/\s*мин|л/мин|l\s*/\s*min|l/min)\b",desc.lower(),re.I)]
            if vals:specs["airflow_lmin"]=max(vals)
        if specs.get("heating_time_sec") is None:
            hm=re.search(r"(?:время\s+)?(?:нагрев\w*|разогрев\w*)[^0-9]{0,40}(\d+(?:[.,]\d+)?)\s*(сек|секунд|с|min|мин)",desc.lower(),re.I)
            if hm:
                hv=float(hm.group(1).replace(",","."))
                if hm.group(2) in ("min","мин"):hv*=60
                specs["heating_time_sec"]=hv

    reciprocating_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="cut_depth_metal_mm" for r in rules) and any(r.get("spec_key")=="strokes_per_min" for r in rules):
        sn=norm(reciprocating_name)
        source=reciprocating_saw_source_family(specs.get("power_source"))
        if any(x in sn for x in ("аккумуля","battery","li ion","li-ion")):source="battery"
        elif any(x in sn for x in ("сетев","220","230","corded")):source="mains"
        elif specs.get("input_power_w") is not None:source="mains"
        if source:specs["power_source"]=source
        if not specs.get("motor_type"):
            if any(x in sn for x in ("бесщет","бесщёточ","brushless")):specs["motor_type"]="brushless"
            elif any(x in sn for x in ("щеточ","щёточ","brushed","коллектор")):specs["motor_type"]="brushed"

    planer_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="planing_depth_mm" for r in rules) and any(r.get("spec_key")=="planing_width_mm" for r in rules):
        pn=norm(planer_name)
        if not specs.get("motor_type"):
            if any(x in pn for x in ("бесщет","бесщёточ","brushless")):specs["motor_type"]="brushless"
            elif any(x in pn for x in ("щеточ","щёточ","brushed","коллектор")):specs["motor_type"]="brushed"

    rotary_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="chuck_type" for r in rules):
        rn=norm(rotary_name)
        if not specs.get("chuck_type"):
            fam=rotary_hammer_chuck_family(rotary_name)
            if fam in ("sds_plus","sds_max","sds_top","hex","keyless","keyed"):specs["chuck_type"]=fam

    jigsaw_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="cut_depth_wood_mm" for r in rules) and any(r.get("spec_key")=="strokes_per_min" for r in rules):
        jn=norm(jigsaw_name)
        if "сабельн" in jn:
            specs["device_type"]="сабельная пила"
        elif "ручной" in jn and "лобзик" in jn:
            specs["device_type"]="ручной лобзик"
        elif "лобзик" in jn:
            specs["device_type"]="лобзик"

        source=jigsaw_source_family(specs.get("power_source"))
        if any(x in jn for x in ("аккумуля","battery","li ion","li-ion")):source="battery"
        elif any(x in jn for x in ("электрическ","сетев","220","230")):source="mains"
        elif specs.get("input_power_w") is not None:source="mains"
        if source:specs["power_source"]=source

        if not specs.get("motor_type"):
            if any(x in jn for x in ("бесщет","бесщёточ","brushless")):specs["motor_type"]="brushless"
            elif any(x in jn for x in ("щеточ","щёточ","brushed")):specs["motor_type"]="brushed"

    paint_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="pressure_bar" for r in rules) and any(r.get("spec_key")=="tank_position" for r in rules):
        pn=norm(paint_name)
        if "аэрограф" in pn:
            specs["device_type"]="аэрограф"
        elif "пневмат" in pn:
            specs["device_type"]="пневматический краскопульт"
        elif (("окрасоч" in pn and "аппарат" in pn)
              or ("покрасоч" in pn and "станц" in pn)
              or "безвоздуш" in pn):
            specs["device_type"]="окрасочный аппарат"
        elif "краскопульт" in pn:
            specs["device_type"]="электрический краскопульт"

    screwdriver_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="battery_count" for r in rules) and any(r.get("spec_key")=="max_torque_nm" for r in rules):
        sn=norm(screwdriver_name)
        if "гайковерт" in sn:
            specs["device_type"]="гайковерт"
        elif "винтоверт" in sn:
            specs["device_type"]="винтоверт"
        elif "перфоратор" in sn:
            specs["device_type"]="перфоратор"
        elif "шуруповерт" in sn:
            specs["device_type"]="дрель-шуруповерт" if "дрел" in sn else "шуруповерт"

        if not specs.get("motor_type"):
            if any(x in sn for x in ("бесщет","бесщёточ","brushless")):specs["motor_type"]="brushless"
            elif any(x in sn for x in ("щеточ","щёточ","brushed")):specs["motor_type"]="brushed"

        if specs.get("max_torque_nm") is None:
            tm=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:н\s*[·.*-]?\s*м|нм|nm)\b",str(screwdriver_name).lower(),re.I)
            if tm:specs["max_torque_nm"]=float(tm.group(1).replace(",","."))

        if specs.get("battery_capacity_ah") is None:
            am=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:а\s*[·.\s-]?\s*ч|ач|ah)\b",str(screwdriver_name).lower(),re.I)
            if am:specs["battery_capacity_ah"]=float(am.group(1).replace(",","."))

        if specs.get("impact_present") is None:
            if "безудар" in sn:specs["impact_present"]=False
            elif "ударн" in sn:specs["impact_present"]=True

        if specs.get("battery_count") is None:
            if any(x in sn for x in ("без акб","без аккумулятор")):
                specs["battery_count"]=0
            else:
                bm=re.search(r"(\d+)\s*(?:акб|аккумулятор)",str(screwdriver_name).lower(),re.I)
                if bm:
                    bn=int(bm.group(1))
                    if 0<=bn<=8:specs["battery_count"]=bn

        if specs.get("case_present") is None:
            if any(x in sn for x in ("без кейса","без чемодана")):specs["case_present"]=False
            elif any(x in sn for x in ("в кейсе","с кейсом","кейс","чемодан")):specs["case_present"]=True

    drill_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="impact_present" for r in rules) and any(r.get("spec_key")=="speed_count" for r in rules):
        dn=norm(drill_name)
        if "перфоратор" in dn:
            specs["device_type"]="перфоратор"
        elif "шуруповерт" in dn:
            specs["device_type"]="дрель-шуруповерт"
        elif "миксер" in dn:
            specs["device_type"]="дрель-миксер"
        elif "дрел" in dn:
            own_impact_scope=("дрел" in norm(base.get("subgroup")) and "удар" in norm(base.get("subgroup")))
            if specs.get("impact_present") is True or "удар" in dn or own_impact_scope:
                specs["device_type"]="ударная дрель"
                if specs.get("impact_present") is None:specs["impact_present"]=True
            elif specs.get("impact_present") is False or "безудар" in dn:
                specs["device_type"]="безударная дрель"
            elif not specs.get("device_type"):
                specs["device_type"]="дрель"


    angle_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="grinder_disc_diameter_mm" for r in rules) and any(r.get("spec_key")=="soft_start_present" for r in rules):
        an=norm(angle_name)
        desc=norm(extra.get("description_text") or "")
        source=angle_grinder_source_family(specs.get("power_source"))
        if any(x in an for x in ("аккумуля","аушм","battery","li ion","li-ion")):source="battery"
        elif any(x in an for x in ("сетев","220","230")):source="mains"
        elif specs.get("battery_capacity_ah") is not None:source="battery"
        elif specs.get("input_power_w") is not None:source="mains"
        if source:specs["power_source"]=source

        if not specs.get("motor_type"):
            if any(x in an+" "+desc for x in ("бесщет","бесщёточ","brushless")):specs["motor_type"]="brushless"
            elif any(x in an+" "+desc for x in ("щеточ","щёточ","коллектор","brushed")):specs["motor_type"]="brushed"

        if specs.get("battery_capacity_ah") is None and source=="battery":
            am=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:а\s*[·.\s-]?\s*ч|ач|ah)\b",str(angle_name)+" "+str(extra.get("description_text") or ""),re.I)
            if am:specs["battery_capacity_ah"]=float(am.group(1).replace(",","."))

        if specs.get("grinder_disc_diameter_mm") is None:
            candidates=[]
            for x in re.findall(r"(?<!\d)(115|125|150|180|230)(?!\d)",str(angle_name)):
                candidates.append(float(x))
            if candidates:specs["grinder_disc_diameter_mm"]=candidates[0]

        if specs.get("soft_start_present") is None:
            if any(x in desc for x in ("плавн пуск","плавн старт","мягк пуск")):specs["soft_start_present"]=True
        if specs.get("speed_adjustment_present") is None:
            if any(x in desc for x in ("регулировк оборот","регулировк числа оборот","регулировк скорост","электронн регулировк")):specs["speed_adjustment_present"]=True

    circular_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="blade_diameter_mm" for r in rules) and any(r.get("spec_key")=="cut_depth_90_mm" for r in rules):
        cn=norm(circular_name)
        if "станок" in cn and any(x in cn for x in ("циркуляр","распилов","настоль")):
            specs["device_type"]="циркулярный станок"
        elif "погруж" in cn:
            specs["device_type"]="погружная дисковая пила"
        elif "мини" in cn and ("дисков" in cn or "циркуляр" in cn):
            specs["device_type"]="мини-дисковая пила"
        elif ("дисков" in cn and "пил" in cn) or "циркуляр" in cn:
            specs["device_type"]="дисковая пила"

        source=circular_saw_source_family(specs.get("power_source"))
        if any(x in cn for x in ("аккумуля","battery","li ion","li-ion")):source="battery"
        elif any(x in cn for x in ("сетев","электрическ","220","230")):source="mains"
        elif specs.get("battery_voltage_v") is not None or specs.get("battery_capacity_ah") is not None:source="battery"
        elif specs.get("input_power_w") is not None:source="mains"
        if source:specs["power_source"]=source

        if not specs.get("motor_type"):
            if any(x in cn for x in ("бесщет","бесщёточ","brushless")):specs["motor_type"]="brushless"
            elif any(x in cn for x in ("щеточ","щёточ","brushed")):specs["motor_type"]="brushed"

        if source=="battery" and specs.get("battery_voltage_v") is None:
            vm=re.search(r"\b(10[.,]8|12|18|20|24|36|40|48|60|80)\s*(?:в|v|li)\b",str(circular_name).lower(),re.I)
            if vm:specs["battery_voltage_v"]=float(vm.group(1).replace(",","."))

        if specs.get("blade_diameter_mm") is None:
            candidates=[]
            for x in re.findall(r"(?<!\d)(\d{2,3})(?!\d)",str(circular_name)):
                n=float(x)
                if 75<=n<=245:candidates.append(n)
            if candidates:specs["blade_diameter_mm"]=candidates[0]

    wrench_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="max_torque_nm" for r in rules):
        wn=norm(wrench_name)
        if "гайковерт" in wn and not specs.get("device_type"):specs["device_type"]="гайковерт"
        if not specs.get("wrench_type"):
            if any(x in wn for x in ("безудар","без удара")):specs["wrench_type"]="non_impact"
            elif "удар" in wn:specs["wrench_type"]="impact"
        source=impact_wrench_source_family(specs.get("power_source"))
        if any(x in wn for x in ("пневм","воздуш")):source="pneumatic"
        elif any(x in wn for x in ("аккумуля","battery","li ion","li-ion")):source="battery"
        elif any(x in wn for x in ("сетев","220","230")):source="mains"
        if source:specs["power_source"]=source
        if not specs.get("motor_type"):
            if any(x in wn for x in ("бесщет","бесщёточ","brushless")):specs["motor_type"]="brushless"
            elif any(x in wn for x in ("щеточ","щёточ","brushed")):specs["motor_type"]="brushed"
        if source=="battery" and specs.get("battery_voltage_v") is None:
            vm=re.search(r"\b(10[.,]8|12|18|20|24|36|40|48|60|80)\s*(?:в|v)\b",str(wrench_name).lower(),re.I)
            if vm:specs["battery_voltage_v"]=float(vm.group(1).replace(",","."))
        if specs.get("drive_size_in") is None:
            dm=re.search(r"(?:квадрат|square|hex|шестигранник)?\s*(1\s*/\s*4|3\s*/\s*8|1\s*/\s*2|3\s*/\s*4|1)\s*(?:[\"″]|дюйм)?",str(wrench_name).lower(),re.I)
            if dm:
                token=dm.group(1).replace(" ","")
                if "/" in token:
                    a,b=token.split("/",1);specs["drive_size_in"]=round(float(a)/float(b),4)
                else:specs["drive_size_in"]=float(token)
        if specs.get("chuck_type") is None:
            if "квадрат" in wn or "square" in wn:specs["chuck_type"]="square"
            elif "шестигран" in wn or "hex" in wn:specs["chuck_type"]="hex"

    sprayer_name=card.get("product_name") or base.get("model") or base.get("product_name") or ""
    if any(r.get("spec_key")=="spray_radius_m" for r in rules):
        sn=norm(sprayer_name)
        if "опрыскив" in sn and not specs.get("device_type"):
            specs["device_type"]="опрыскиватель"

        source=sprayer_source_family(specs.get("power_source"))
        if any(x in sn for x in ("аккумуля","battery","li ion","li-ion")):source="battery"
        elif any(x in sn for x in ("бензин","двс","petrol","gasoline")):source="fuel"
        elif any(x in sn for x in ("ручн","помпов","рычаж","пульверизатор")):source="manual"
        if source:specs["power_source"]=source

        if source=="battery" and specs.get("voltage_v") is None:
            vm=re.search(r"\b(3[.,]7|12|18|20|24|36|40|48|60|80)\s*(?:в|v)\b",str(sprayer_name).lower(),re.I)
            if vm:specs["voltage_v"]=float(vm.group(1).replace(",","."))
        if source=="battery" and specs.get("battery_type") is None:
            if any(x in sn for x in ("li ion","li-ion","литий ион","литий-ион")):specs["battery_type"]="Li-Ion"
            elif any(x in sn for x in ("lifepo4","li fe po4")):specs["battery_type"]="LiFePO4"

        if source=="fuel" and not specs.get("fuel_engine_type"):
            if any(x in sn for x in ("2 такт","2-такт","двухтакт")):specs["fuel_engine_type"]="2stroke"
            elif any(x in sn for x in ("4 такт","4-такт","четырехтакт")):specs["fuel_engine_type"]="4stroke"

        if not specs.get("carry_type"):
            if any(x in sn for x in ("ранцев","рюкзач")):specs["carry_type"]="backpack"
            elif "плеч" in sn:specs["carry_type"]="shoulder"
            elif "колес" in sn:specs["carry_type"]="wheeled"
            elif "ручн" in sn:specs["carry_type"]="handheld"

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








    if profile=="concrete_mixer":
        weights={"drum_capacity_l":0.45,"crown_material":0.30,"input_power_w":0.25}
        total=used=0.0
        material_mismatch=False
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="drum_capacity_l":
                    z=concrete_mixer_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="input_power_w":
                    z=concrete_mixer_relative_similarity(float(a),float(b),0.15,0.30,0.45)
                else:
                    aa=concrete_mixer_crown_family(a);bb=concrete_mixer_crown_family(b)
                    z=1.0 if aa and bb and aa==bb else 0.55
                    if aa and bb and aa!=bb:material_mismatch=True
            except Exception:z=0.0
            total+=w*z;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        # Different known crown materials cannot be a "direct" analogue.
        if material_mismatch:score=min(score,84.0)
        return round(max(0,min(100,score)),2)


    if profile=="grain_crusher":
        weights={"input_power_w":0.30,"throughput_kgh":0.35,"grain_crusher_body_form":0.10,"hopper_capacity_l":0.25}
        total=used=0.0
        form_mismatch=False
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k in ("input_power_w","throughput_kgh","hopper_capacity_l"):
                    z=grain_crusher_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                else:
                    aa=grain_crusher_body_form_family(a);bb=grain_crusher_body_form_family(b)
                    z=1.0 if aa and bb and aa==bb else 0.55
                    if aa and bb and aa!=bb:form_mismatch=True
            except Exception:z=0.0
            total+=w*z;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if form_mismatch:score=min(score,84.0)
        if grain_crusher_required_missing(ours,comp):score=min(score,69.0)
        return round(max(0,min(100,score)),2)


    if profile=="washstand":
        ca=str(ours.get("washstand_class") or "")
        cb=str(comp.get("washstand_class") or "")
        if ca!="full_set" or cb!="full_set":
            return 0.0
        weights={"washstand_body_material":0.25,"tank_capacity_l":0.35,"water_heating_present":0.40}
        total=used=0.0
        material_mismatch=False
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="washstand_body_material":
                    aa=washstand_body_material_family(a);bb=washstand_body_material_family(b)
                    z=1.0 if aa and bb and aa==bb else 0.60
                    if aa and bb and aa!=bb:material_mismatch=True
                elif k=="tank_capacity_l":
                    z=washstand_relative_similarity(float(a),float(b))
                elif k=="water_heating_present":
                    z=1.0 if bool(a)==bool(b) else 0.25
                else:z=0.0
            except Exception:z=0.0
            total+=w*z;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if material_mismatch:score=min(score,88.0)
        if washstand_required_missing(ours,comp):score=min(score,69.0)
        return round(max(0,min(100,score)),2)


    if profile=="compressor":
        ta=compressor_type_family(ours.get("compressor_type"));tb=compressor_type_family(comp.get("compressor_type"))
        ea=compressor_engine_family(ours.get("compressor_engine_type"));eb=compressor_engine_family(comp.get("compressor_engine_type"))
        da=compressor_drive_family(ours.get("compressor_drive_type"));db=compressor_drive_family(comp.get("compressor_drive_type"))
        la=compressor_lubrication_family(ours.get("compressor_lubrication"));lb=compressor_lubrication_family(comp.get("compressor_lubrication"))
        va=compressor_voltage_class(ours.get("compressor_voltage_v"));vb=compressor_voltage_class(comp.get("compressor_voltage_v"))
        if ta and tb and ta!=tb:return 0.0
        if ea and eb and ea!=eb:return 0.0
        if da and db and da!=db:return 0.0
        if la and lb and la!=lb:return 0.0
        if va and vb and va!=vb:return 0.0
        ba=str(ours.get("compressor_flow_basis") or "")
        bb=str(comp.get("compressor_flow_basis") or "")
        if ba and bb and ba!=bb:return 0.0
        # No receiver = inflator/head/tankless machine, not a direct analogue.
        try:
            if float(ours.get("receiver_capacity_l") or 0)<=0 or float(comp.get("receiver_capacity_l") or 0)<=0:return 0.0
        except Exception:return 0.0
        weights={"compressor_type":0.20,"receiver_capacity_l":0.20,"compressor_engine_type":0.10,"flow_rate_lmin":0.25,"pressure_bar":0.10,"compressor_drive_type":0.05,"compressor_lubrication":0.05,"compressor_voltage_v":0.05}
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if k=="flow_rate_lmin":
                pair=compressor_flow_basis_pair(ours,comp)
                if pair is None:continue
                a,b,_basis=pair
            elif a is None or b is None:
                continue
            try:
                if k=="compressor_type":
                    z=1.0 if compressor_type_family(a)==compressor_type_family(b) else 0.0
                elif k=="compressor_engine_type":
                    z=1.0 if compressor_engine_family(a)==compressor_engine_family(b) else 0.0
                elif k=="compressor_drive_type":
                    z=1.0 if compressor_drive_family(a)==compressor_drive_family(b) else 0.0
                elif k=="compressor_lubrication":
                    z=1.0 if compressor_lubrication_family(a)==compressor_lubrication_family(b) else 0.0
                elif k=="compressor_voltage_v":
                    z=1.0 if compressor_voltage_class(a)==compressor_voltage_class(b) else 0.0
                elif k=="receiver_capacity_l":
                    z=compressor_relative_similarity(float(a),float(b),0.20,0.35,0.50)
                elif k=="flow_rate_lmin":
                    z=compressor_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="pressure_bar":
                    z=compressor_pressure_similarity(float(a),float(b))
                else:z=0.0
            except Exception:z=0.0
            total+=w*z;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        if compressor_required_missing(ours,comp):score=min(score,69.0)
        return round(max(0,min(100,score)),2)


    if profile=="construction_heat_gun":
        weights={"airflow_lmin":0.40,"heating_time_sec":0.25,"input_power_w":0.35}
        critical_missing=construction_heat_gun_required_missing(ours,comp)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="airflow_lmin":
                    s=construction_heat_gun_abs_similarity(float(a),float(b),50,100,150)
                elif k=="heating_time_sec":
                    s=construction_heat_gun_abs_similarity(float(a),float(b),10,20,30)
                elif k=="input_power_w":
                    s=construction_heat_gun_abs_similarity(float(a),float(b),150,300,450)
                else:s=0.0
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="construction_vacuum":
        weights={"input_power_w":0.30,"tank_capacity_l":0.25,"vacuum_cleaning_type":0.25,"vacuum_body_material":0.20}
        critical_missing=construction_vacuum_required_missing(ours,comp)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="input_power_w":
                    s=construction_vacuum_abs_similarity(float(a),float(b),150,300,450)
                elif k=="tank_capacity_l":
                    s=construction_vacuum_abs_similarity(float(a),float(b),5,10,15)
                elif k=="vacuum_cleaning_type":
                    aa=construction_vacuum_cleaning_family(a);bb=construction_vacuum_cleaning_family(b)
                    if aa==bb:s=1.0
                    elif "dry_wet" in (aa,bb) and ({aa,bb}&{"dry","wet"}):s=0.78
                    else:s=0.55
                elif k=="vacuum_body_material":
                    aa=construction_vacuum_body_family(a);bb=construction_vacuum_body_family(b)
                    if aa==bb:s=1.0
                    elif aa in ("metal","stainless","metal_plastic") and bb in ("metal","stainless","metal_plastic"):s=0.90
                    elif "plastic" in (aa,bb):s=0.70
                    else:s=0.60
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        # Keep the real technical match from available confirmed fields.
        # Missing material/other fields is represented by coverage + data_incomplete status,
        # not by forcing every incomplete vacuum pair to the same 54%.
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="reciprocating_saw":
        sa=reciprocating_saw_source_family(ours.get("power_source"));sb=reciprocating_saw_source_family(comp.get("power_source"))
        if sa and sb and sa!=sb:return 0.0

        weights={"input_power_w":0.20,"motor_type":0.15,"cut_depth_wood_mm":0.25,"cut_depth_metal_mm":0.20,"strokes_per_min":0.20}
        critical_missing=reciprocating_saw_required_missing(ours,comp)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="input_power_w":
                    s=reciprocating_saw_abs_similarity(float(a),float(b),150,300,450)
                elif k=="motor_type":
                    s=1.0 if impact_wrench_motor_family(a)==impact_wrench_motor_family(b) else 0.55
                elif k=="cut_depth_wood_mm":
                    s=reciprocating_saw_abs_similarity(float(a),float(b),20,40,60)
                elif k=="cut_depth_metal_mm":
                    s=reciprocating_saw_abs_similarity(float(a),float(b),2,4,6)
                elif k=="strokes_per_min":
                    s=reciprocating_saw_abs_similarity(float(a),float(b),300,600,900)
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        # Keep the real match from the characteristics that 21vek actually provides.
        # Missing power/motor type remains data_incomplete and lowers coverage,
        # but must not collapse almost every pair to exactly 54%.
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="planer":
        wa=ours.get("planing_width_mm");wb=comp.get("planing_width_mm")
        if wa is not None and wb is not None and abs(float(wa)-float(wb))>2:return 0.0

        weights={"motor_type":0.15,"max_rpm":0.20,"planing_depth_mm":0.35,"planing_width_mm":0.30}
        critical_missing=planer_required_missing(ours,comp)
        total=used=0.0
        # Missing optional motor type must neither cap a good match at 54% nor
        # lower coverage. If both sides know the motor type, it still matters.
        allw=sum(w for k,w in weights.items() if k!="motor_type" or (ours.get(k) is not None and comp.get(k) is not None))
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="motor_type":
                    s=1.0 if impact_wrench_motor_family(a)==impact_wrench_motor_family(b) else 0.55
                elif k=="max_rpm":
                    s=planer_abs_similarity(float(a),float(b),1500,3000,4500)
                elif k=="planing_depth_mm":
                    s=planer_abs_similarity(float(a),float(b),0.5,1.0,1.5)
                elif k=="planing_width_mm":
                    s=1.0 if abs(float(a)-float(b))<=2 else 0.0
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        return round(max(0,min(100,score)),2)


    if profile=="rotary_hammer":
        ca=rotary_hammer_chuck_family(ours.get("chuck_type"));cb=rotary_hammer_chuck_family(comp.get("chuck_type"))
        if ca and cb and ca!=cb:return 0.0

        weights={"input_power_w":0.35,"impact_energy_j":0.40,"max_rpm":0.25}
        critical_missing=rotary_hammer_required_missing(ours,comp)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="input_power_w":
                    s=rotary_hammer_abs_similarity(float(a),float(b),150,300,450)
                elif k=="impact_energy_j":
                    s=rotary_hammer_abs_similarity(float(a),float(b),0.5,1.0,1.5)
                elif k=="max_rpm":
                    s=rotary_hammer_abs_similarity(float(a),float(b),150,300,450)
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


    if profile=="jigsaw":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and jigsaw_device_family(da)!=jigsaw_device_family(db):
            return 0.0

        sa=jigsaw_source_family(ours.get("power_source"));sb=jigsaw_source_family(comp.get("power_source"))
        if sa and sb and sa!=sb:return 0.0
        source=sa or sb

        weights={"input_power_w":0.25 if source=="mains" else 0.0,
                 "cut_depth_wood_mm":0.35,"strokes_per_min":0.25,"motor_type":0.15}
        critical_missing=jigsaw_required_missing(ours,comp)
        total=used=allw=0.0
        for k,w in weights.items():
            if w<=0:continue
            allw+=w
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="input_power_w":
                    s=jigsaw_power_similarity(float(a),float(b))
                elif k=="cut_depth_wood_mm":
                    s=jigsaw_relative_similarity(float(a),float(b))
                elif k=="strokes_per_min":
                    s=jigsaw_relative_similarity(float(a),float(b))
                elif k=="motor_type":
                    s=1.0 if impact_wrench_motor_family(a)==impact_wrench_motor_family(b) else 0.55
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w

        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        return round(max(0,min(100,score)),2)

    if profile=="paint_sprayer":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and paint_sprayer_device_family(da)!=paint_sprayer_device_family(db):
            return 0.0
        if da is not None and paint_sprayer_device_family(da)!="electric_spray_gun":return 0.0
        if db is not None and paint_sprayer_device_family(db)!="electric_spray_gun":return 0.0

        weights={"input_power_w":0.40,"tank_position":0.20,"pressure_bar":0.40}
        critical_missing=paint_sprayer_required_missing(ours,comp)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="input_power_w":
                    s=paint_sprayer_power_similarity(float(a),float(b))
                elif k=="pressure_bar":
                    s=paint_sprayer_pressure_similarity(float(a),float(b))
                elif k=="tank_position":
                    s=1.0 if paint_sprayer_tank_family(a)==paint_sprayer_tank_family(b) else 0.55
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        # For paint sprayers 21vek usually omits pressure entirely.
        # Missing critical data must block "stronger/weaker", but must NOT
        # turn every real analogue into an assortment gap. Keep the technical
        # similarity from the characteristics that are actually confirmed.
        return round(max(0,min(100,score)),2)

    if profile=="cordless_screwdriver":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and screwdriver_device_family(da)!=screwdriver_device_family(db):
            return 0.0

        weights={"battery_capacity_ah":0.25,"motor_type":0.12,"max_torque_nm":0.35,
                 "impact_present":0.10,"battery_count":0.10,"case_present":0.08}
        critical_missing=screwdriver_required_missing(ours,comp)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="battery_capacity_ah":
                    s=screwdriver_relative_similarity(float(a),float(b),0.15,0.30,0.45)
                elif k=="motor_type":
                    s=1.0 if impact_wrench_motor_family(a)==impact_wrench_motor_family(b) else 0.55
                elif k=="max_torque_nm":
                    s=screwdriver_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k in ("impact_present","case_present"):
                    s=1.0 if bool(a)==bool(b) else 0.55
                elif k=="battery_count":
                    d=abs(float(a)-float(b))
                    s=1.0 if d==0 else (0.80 if d==1 else 0.55)
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

    if profile=="impact_drill":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None:
            fa=impact_drill_device_family(da);fb=impact_drill_device_family(db)
            if fa!=fb:return 0.0

        ia=ours.get("impact_present");ib=comp.get("impact_present")
        if ia is not None and ib is not None and bool(ia)!=bool(ib):return 0.0
        if ia is False or ib is False:return 0.0

        weights={"device_type":0.00,"input_power_w":0.35,"speed_count":0.15,"max_rpm":0.25,"impact_present":0.25}
        critical_missing=impact_drill_required_missing(ours,comp)
        total=used=allw=0.0
        for k,w in weights.items():
            if w<=0:continue
            allw+=w
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="input_power_w":
                    s=impact_drill_power_similarity(float(a),float(b))
                elif k=="speed_count":
                    s=1.0 if int(float(a))==int(float(b)) else 0.65
                elif k=="max_rpm":
                    s=impact_drill_rpm_similarity(float(a),float(b))
                elif k=="impact_present":
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
        if critical_missing:score=min(score,54.0)
        return round(max(0,min(100,score)),2)




    if profile=="borehole_pump":
        # Core score uses the four metrics that are actually present often enough
        # on 21vek. Water type controls class; principle is a strong modifier only
        # when both sides explicitly provide it. "Pumping depth" is not scored.
        wa=surface_pump_water_tokens(ours.get("water_type"));wb=surface_pump_water_tokens(comp.get("water_type"))
        if wa and wb and not wa.intersection(wb):
            return 0.0
        weights={"max_head_m":0.30,"flow_rate_lmin":0.30,"max_immersion_depth_m":0.20,"well_diameter_mm":0.20}
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="flow_rate_lmin":
                    s=drainage_pump_relative_similarity(float(a),float(b))
                elif k in ("max_head_m","max_immersion_depth_m"):
                    s=borehole_pump_depth_similarity(float(a),float(b))
                elif k=="well_diameter_mm":
                    s=borehole_pump_diameter_similarity(float(a),float(b))
                else:s=0.0
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        pa=borehole_pump_principle_family(ours.get("operating_principle"))
        pb=borehole_pump_principle_family(comp.get("operating_principle"))
        if pa and pb and pa!=pb:
            score=min(score,65.0)
        return round(max(0,min(100,score)),2)


    if profile=="surface_pump":
        weights={"flow_rate_lmin":0.20,"input_power_w":0.20,"max_head_m":0.20,"max_suction_depth_m":0.20,"water_type":0.20}
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k in ("flow_rate_lmin","input_power_w"):
                    s=drainage_pump_relative_similarity(float(a),float(b))
                elif k in ("max_head_m","max_suction_depth_m"):
                    s=drainage_pump_head_similarity(float(a),float(b))
                elif k=="water_type":
                    aa=surface_pump_water_tokens(a);bb=surface_pump_water_tokens(b)
                    if aa and bb:
                        s=1.0 if aa==bb else (0.75 if aa.intersection(bb) else 0.35)
                    else:
                        s=categorical_similarity(a,b)
                else:s=0.0
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="sewage_station":
        weights={"flow_rate_lmin":0.25,"max_head_m":0.25,"filter_particle_mm":0.10,"input_power_w":0.20,"max_water_temp_c":0.20}
        total=used=0.0
        allw=sum(w for k,w in weights.items() if k!="filter_particle_mm" or (ours.get(k) is not None and comp.get(k) is not None))
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k in ("flow_rate_lmin","input_power_w","filter_particle_mm"):
                    s=drainage_pump_relative_similarity(float(a),float(b))
                elif k=="max_head_m":
                    s=drainage_pump_head_similarity(float(a),float(b))
                elif k=="max_water_temp_c":
                    s=sewage_station_temperature_similarity(float(a),float(b))
                else:s=0.0
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="fecal_pump":
        weights={"flow_rate_lmin":0.27,"max_head_m":0.27,"filter_particle_mm":0.22,
                 "grinder_present":0.14,"pump_body_material":0.04,
                 "connection_diameter_in":0.03,"water_type":0.03}
        critical_missing=fecal_pump_required_missing(ours,comp)
        total=used=0.0
        # Optional fields affect the result when known, but absence of one must
        # not collapse an otherwise sound hydraulic analogue to 54%.
        allw=sum(w for k,w in weights.items() if k in ("flow_rate_lmin","max_head_m","filter_particle_mm") or (ours.get(k) is not None and comp.get(k) is not None))
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="flow_rate_lmin":
                    s=drainage_pump_relative_similarity(float(a),float(b))
                elif k=="max_head_m":
                    s=drainage_pump_head_similarity(float(a),float(b))
                elif k=="filter_particle_mm":
                    s=drainage_pump_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="pump_body_material":
                    aa=drainage_pump_body_family(a);bb=drainage_pump_body_family(b)
                    s=1.0 if aa and aa==bb else 0.65
                elif k=="connection_diameter_in":
                    d=abs(float(a)-float(b))
                    s=1.0 if d<=0.05 else (0.80 if d<=0.25 else (0.55 if d<=0.50 else 0.0))
                elif k=="grinder_present":
                    s=1.0 if bool(a)==bool(b) else 0.45
                elif k=="water_type":
                    aa=surface_pump_water_tokens(a);bb=surface_pump_water_tokens(b)
                    if aa and bb:s=1.0 if aa==bb else (0.75 if aa.intersection(bb) else 0.35)
                    else:s=categorical_similarity(a,b)
                else:s=0.0
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        return round(max(0,min(100,score)),2)


    if profile=="circulation_pump":
        weights={"max_head_m":0.30,"flow_rate_m3h":0.25,"pressure_bar":0.20,"input_power_w":0.15,"filter_particle_mm":0.10}
        critical_missing=circulation_pump_required_missing(ours,comp)
        total=used=0.0
        # Particle size is optional; exclude it from coverage when absent.
        allw=sum(w for k,w in weights.items() if k!="filter_particle_mm" or (ours.get(k) is not None and comp.get(k) is not None))
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="max_head_m":
                    s=circulation_pump_head_similarity(float(a),float(b))
                elif k=="filter_particle_mm":
                    s=circulation_pump_particle_similarity(float(a),float(b))
                else:
                    s=circulation_pump_relative_similarity(float(a),float(b))
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        return round(max(0,min(100,score)),2)


    if profile=="drainage_pump":
        weights={"flow_rate_lmin":0.25,"input_power_w":0.20,"max_head_m":0.25,"pump_body_material":0.15,"filter_particle_mm":0.15}
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k in ("flow_rate_lmin","input_power_w","filter_particle_mm"):
                    s=drainage_pump_relative_similarity(float(a),float(b))
                elif k=="max_head_m":
                    s=drainage_pump_head_similarity(float(a),float(b))
                elif k=="pump_body_material":
                    aa=drainage_pump_body_family(a);bb=drainage_pump_body_family(b)
                    # Для подбора аналога точное совпадение материала важно.
                    # Разные материалы уменьшают сопоставимость одинаково, без скрытого рейтинга.
                    s=1.0 if aa and aa==bb else 0.65
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="angle_grinder":
        sa=angle_grinder_source_family(ours.get("power_source"));sb=angle_grinder_source_family(comp.get("power_source"))
        if sa and sb and sa!=sb:return 0.0

        da=ours.get("grinder_disc_diameter_mm");db=comp.get("grinder_disc_diameter_mm")
        if da is not None and db is not None and abs(float(da)-float(db))>2:
            return 0.0

        source=sa or sb
        weights={"motor_type":0.20,"soft_start_present":0.15,"speed_adjustment_present":0.15,"grinder_disc_diameter_mm":0.25}
        if source=="battery":weights["battery_capacity_ah"]=0.25
        elif source=="mains":weights["input_power_w"]=0.25
        else:
            weights["battery_capacity_ah"]=0.125;weights["input_power_w"]=0.125

        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="motor_type":
                    aa=angle_grinder_motor_family(a);bb=angle_grinder_motor_family(b)
                    s=1.0 if aa==bb else 0.60
                elif k=="battery_capacity_ah":
                    s=angle_grinder_abs_similarity(float(a),float(b),0.5,1.0,1.5)
                elif k=="input_power_w":
                    s=angle_grinder_abs_similarity(float(a),float(b),150,300,450)
                elif k in ("soft_start_present","speed_adjustment_present"):
                    s=1.0 if bool(a)==bool(b) else 0.65
                elif k=="grinder_disc_diameter_mm":
                    s=1.0 if abs(float(a)-float(b))<=2 else 0.0
                else:s=0.0
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="bench_grinder":
        da=ours.get("grinding_wheel_diameter_mm");db=comp.get("grinding_wheel_diameter_mm")
        if da is not None and db is not None and abs(float(da)-float(db))>5:
            return 0.0

        weights={"motor_type":0.20,"input_power_w":0.30,"max_rpm":0.20,"grinding_wheel_diameter_mm":0.30}
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="motor_type":
                    s=1.0 if bench_grinder_motor_family(a)==bench_grinder_motor_family(b) else 0.60
                elif k=="input_power_w":
                    s=bench_grinder_abs_similarity(float(a),float(b),50,100,150)
                elif k=="max_rpm":
                    s=bench_grinder_abs_similarity(float(a),float(b),300,600,900)
                elif k=="grinding_wheel_diameter_mm":
                    s=1.0 if abs(float(a)-float(b))<=5 else 0.0
                else:s=0.0
            except Exception:s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="miter_saw":
        ba=ours.get("blade_diameter_mm");bb=comp.get("blade_diameter_mm")
        if ba is not None and bb is not None and abs(float(ba)-float(bb))>10:
            return 0.0
        sa=ours.get("sliding_present");sb=comp.get("sliding_present")
        if sa is not None and sb is not None and bool(sa)!=bool(sb):
            return 0.0

        weights={"input_power_w":0.18,"blade_diameter_mm":0.20,"sliding_present":0.18,
                 "cut_depth_90_mm":0.18,"cut_depth_45_mm":0.14,"max_rpm":0.12}
        critical_missing=miter_saw_required_missing(ours,comp)
        total=used=0.0
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="input_power_w":
                    s=miter_saw_abs_similarity(float(a),float(b),200,400,600)
                elif k=="blade_diameter_mm":
                    s=1.0 if abs(float(a)-float(b))<=10 else 0.0
                elif k=="sliding_present":
                    s=1.0 if bool(a)==bool(b) else 0.0
                elif k in ("cut_depth_90_mm","cut_depth_45_mm"):
                    s=miter_saw_abs_similarity(float(a),float(b),5,10,15)
                elif k=="max_rpm":
                    s=miter_saw_abs_similarity(float(a),float(b),500,1000,1500)
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(sum(weights.values()),1e-9))
        score*=0.60+0.40*coverage
        return round(max(0,min(100,score)),2)


    if profile=="circular_saw":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and circular_saw_device_family(da)!=circular_saw_device_family(db):
            return 0.0

        sa=circular_saw_source_family(ours.get("power_source"));sb=circular_saw_source_family(comp.get("power_source"))
        if sa and sb and sa!=sb:return 0.0
        source=sa or sb

        ba=ours.get("blade_diameter_mm");bb=comp.get("blade_diameter_mm")
        if ba is not None and bb is not None and circular_saw_blade_class(ba)!=circular_saw_blade_class(bb):
            return 0.0

        aa=ours.get("arbor_diameter_mm");ab=comp.get("arbor_diameter_mm")
        if aa is not None and ab is not None and circular_saw_arbor_class(aa)!=circular_saw_arbor_class(ab):
            return 0.0

        if source=="battery":
            va=ours.get("battery_voltage_v");vb=comp.get("battery_voltage_v")
            if va is not None and vb is not None and circular_saw_voltage_class(va)!=circular_saw_voltage_class(vb):
                return 0.0

        weights={
          "device_type":0.10,"power_source":0.10,"input_power_w":0.00,"cut_speed_adjustment":0.04,
          "max_rpm":0.06,"cut_depth_90_mm":0.18,"cut_depth_45_mm":0.08,"blade_diameter_mm":0.16,
          "arbor_diameter_mm":0.12,"tilt_angle_deg":0.05,"motor_type":0.04,"battery_type":0.00,
          "battery_voltage_v":0.00,"battery_capacity_ah":0.00
        }
        if source=="mains":
            weights["input_power_w"]=0.10
        elif source=="battery":
            weights["battery_type"]=0.03;weights["battery_voltage_v"]=0.08;weights["battery_capacity_ah"]=0.05

        critical_missing=circular_saw_required_missing(ours,comp)
        total=used=allw=0.0
        for k,w in weights.items():
            if w<=0:continue
            allw+=w
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="device_type":
                    s=1.0 if circular_saw_device_family(a)==circular_saw_device_family(b) else 0.0
                elif k=="power_source":
                    s=1.0 if circular_saw_source_family(a)==circular_saw_source_family(b) else 0.0
                elif k=="input_power_w":
                    # Approved business tolerance for circular saws: ±150 W is a full match.
                    # Wider bands are only used to keep nearby powers as close/partial analogs.
                    pd=abs(float(a)-float(b))
                    s=1.0 if pd<=150 else (0.85 if pd<=300 else (0.65 if pd<=450 else 0.0))
                elif k=="cut_speed_adjustment":
                    s=1.0 if bool(a)==bool(b) else 0.55
                elif k=="max_rpm":
                    s=circular_saw_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k in ("cut_depth_90_mm","cut_depth_45_mm"):
                    s=circular_saw_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="blade_diameter_mm":
                    if circular_saw_blade_class(a)!=circular_saw_blade_class(b):s=0.0
                    else:s=1.0 if abs(float(a)-float(b))/max(float(a),float(b),1)<=0.03 else 0.85
                elif k=="arbor_diameter_mm":
                    s=1.0 if circular_saw_arbor_class(a)==circular_saw_arbor_class(b) else 0.0
                elif k=="tilt_angle_deg":
                    s=circular_saw_angle_similarity(float(a),float(b))
                elif k=="motor_type":
                    s=1.0 if impact_wrench_motor_family(a)==impact_wrench_motor_family(b) else 0.55
                elif k=="battery_type":
                    s=1.0 if battery_pruner_battery_family(a)==battery_pruner_battery_family(b) else 0.45
                elif k=="battery_voltage_v":
                    s=1.0 if circular_saw_voltage_class(a)==circular_saw_voltage_class(b) else 0.0
                elif k=="battery_capacity_ah":
                    s=circular_saw_relative_similarity(float(a),float(b),0.15,0.30,0.45)
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        return round(max(0,min(100,score)),2)

    if profile=="impact_wrench":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and impact_wrench_device_family(da)!=impact_wrench_device_family(db):
            return 0.0

        ka=impact_wrench_kind_family(ours.get("wrench_type"));kb=impact_wrench_kind_family(comp.get("wrench_type"))
        if ka and kb and ka!=kb:return 0.0

        sa=impact_wrench_source_family(ours.get("power_source"));sb=impact_wrench_source_family(comp.get("power_source"))
        if sa and sb and sa!=sb:return 0.0
        source=sa or sb

        va=ours.get("drive_size_in");vb=comp.get("drive_size_in")
        if va is not None and vb is not None and impact_wrench_drive_class(va)!=impact_wrench_drive_class(vb):
            return 0.0

        if source=="battery":
            ba=ours.get("battery_voltage_v");bb=comp.get("battery_voltage_v")
            if ba is not None and bb is not None and impact_wrench_voltage_class(ba)!=impact_wrench_voltage_class(bb):
                return 0.0

        weights={
          "device_type":0.07,"wrench_type":0.09,"power_source":0.10,"motor_type":0.05,
          "input_power_w":0.05,"reverse_present":0.04,"operating_modes":0.05,"chuck_type":0.05,
          "drive_size_in":0.12,"rotation_adjustment":0.04,"max_rpm":0.07,"max_torque_nm":0.17,
          "battery_type":0.03,"battery_voltage_v":0.04,"battery_capacity_ah":0.02,"charging_time_min":0.01
        }
        if source=="mains":
            weights["input_power_w"]=0.11;weights["battery_type"]=weights["battery_voltage_v"]=weights["battery_capacity_ah"]=weights["charging_time_min"]=0.0
        elif source=="pneumatic":
            for k in ("motor_type","input_power_w","battery_type","battery_voltage_v","battery_capacity_ah","charging_time_min"):weights[k]=0.0
        elif source!="battery":
            for k in ("battery_type","battery_voltage_v","battery_capacity_ah","charging_time_min"):weights[k]=0.0

        critical_missing=impact_wrench_required_missing(ours,comp)
        total=used=allw=0.0;chuck_mismatch=False
        for k,w in weights.items():
            if w<=0:continue
            allw+=w
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="device_type":
                    s=1.0 if impact_wrench_device_family(a)==impact_wrench_device_family(b) else 0.0
                elif k=="wrench_type":
                    s=1.0 if impact_wrench_kind_family(a)==impact_wrench_kind_family(b) else 0.0
                elif k=="power_source":
                    s=1.0 if impact_wrench_source_family(a)==impact_wrench_source_family(b) else 0.0
                elif k=="motor_type":
                    s=1.0 if impact_wrench_motor_family(a)==impact_wrench_motor_family(b) else 0.55
                elif k=="input_power_w":
                    s=impact_wrench_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k in ("reverse_present","rotation_adjustment"):
                    s=1.0 if bool(a)==bool(b) else 0.55
                elif k=="operating_modes":
                    s=impact_wrench_modes_similarity(a,b)
                elif k=="chuck_type":
                    aa=impact_wrench_chuck_family(a);bb=impact_wrench_chuck_family(b)
                    s=1.0 if aa==bb else 0.35
                    if aa and bb and aa!=bb:chuck_mismatch=True
                elif k=="drive_size_in":
                    s=1.0 if impact_wrench_drive_class(a)==impact_wrench_drive_class(b) else 0.0
                elif k=="max_rpm":
                    s=impact_wrench_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="max_torque_nm":
                    s=impact_wrench_relative_similarity(float(a),float(b),0.10,0.20,0.30)
                elif k=="battery_type":
                    s=1.0 if battery_pruner_battery_family(a)==battery_pruner_battery_family(b) else 0.45
                elif k=="battery_voltage_v":
                    s=1.0 if impact_wrench_voltage_class(a)==impact_wrench_voltage_class(b) else 0.0
                elif k=="battery_capacity_ah":
                    s=impact_wrench_relative_similarity(float(a),float(b),0.15,0.30,0.45)
                elif k=="charging_time_min":
                    s=impact_wrench_relative_similarity(float(a),float(b),0.15,0.30,0.45)
                else:
                    s=categorical_similarity(a,b)
            except Exception:
                s=0.0
            total+=w*s;used+=w
        if used<=0:return 0.0
        score=total/used*100
        coverage=min(1.0,used/max(allw,1e-9))
        score*=0.60+0.40*coverage
        if critical_missing:score=min(score,54.0)
        if chuck_mismatch:score=min(score,84.0)
        return round(max(0,min(100,score)),2)

    if profile=="sprayer":
        da=ours.get("device_type");db=comp.get("device_type")
        if da is not None and db is not None and sprayer_device_family(da)!=sprayer_device_family(db):
            return 0.0

        sa=sprayer_source_family(ours.get("power_source"))
        sb=sprayer_source_family(comp.get("power_source"))
        if sa and sb and sa!=sb:return 0.0
        source=sa or sb

        if source=="battery":
            va=ours.get("voltage_v");vb=comp.get("voltage_v")
            if va is not None and vb is not None:
                ca=sprayer_voltage_class(va);cb=sprayer_voltage_class(vb)
                if ca and cb and ca!=cb:return 0.0
        if source=="fuel":
            ea=sprayer_engine_family(ours.get("fuel_engine_type"))
            eb=sprayer_engine_family(comp.get("fuel_engine_type"))
            if ea and eb and ea!=eb:return 0.0

        if source=="battery":
            weights={"device_type":0.08,"application_area":0.05,"carry_type":0.08,"voltage_v":0.12,
                     "flow_rate_lmin":0.15,"power_source":0.15,"battery_type":0.04,"battery_capacity_ah":0.09,
                     "tank_capacity_l":0.14,"spray_radius_m":0.10}
        elif source=="fuel":
            weights={"device_type":0.08,"application_area":0.05,"carry_type":0.08,"flow_rate_lmin":0.15,
                     "power_source":0.15,"tank_capacity_l":0.14,"fuel_engine_type":0.08,"fuel_power_w":0.08,
                     "engine_cc":0.06,"fuel_tank_l":0.03,"spray_radius_m":0.10}
        elif source=="manual":
            weights={"device_type":0.12,"application_area":0.08,"carry_type":0.18,"flow_rate_lmin":0.24,
                     "power_source":0.18,"tank_capacity_l":0.15,"spray_radius_m":0.05}
        else:
            weights={"device_type":0.10,"application_area":0.07,"carry_type":0.10,"flow_rate_lmin":0.20,
                     "power_source":0.18,"tank_capacity_l":0.18,"spray_radius_m":0.10,"voltage_v":0.07}

        critical_missing=sprayer_required_missing(ours,comp)
        total=used=0.0;carry_mismatch=False
        for k,w in weights.items():
            a=ours.get(k);b=comp.get(k)
            if a is None or b is None:continue
            try:
                if k=="device_type":
                    s=1.0 if sprayer_device_family(a)==sprayer_device_family(b) else 0.0
                elif k=="power_source":
                    s=1.0 if sprayer_source_family(a)==sprayer_source_family(b) else 0.0
                elif k=="carry_type":
                    s=1.0 if sprayer_carry_family(a)==sprayer_carry_family(b) else 0.45
                    if sprayer_carry_family(a) and sprayer_carry_family(b) and sprayer_carry_family(a)!=sprayer_carry_family(b):
                        carry_mismatch=True
                elif k=="application_area":
                    aa=sprayer_application_tokens(a);bb=sprayer_application_tokens(b)
                    s=len(aa&bb)/max(1,len(aa|bb)) if aa and bb else categorical_similarity(a,b)
                elif k=="voltage_v":
                    ca=sprayer_voltage_class(a);cb=sprayer_voltage_class(b)
                    s=1.0 if ca is not None and cb is not None and ca==cb else 0.0
                elif k=="battery_type":
                    s=1.0 if battery_pruner_battery_family(a)==battery_pruner_battery_family(b) else 0.45
                elif k=="fuel_engine_type":
                    s=1.0 if sprayer_engine_family(a)==sprayer_engine_family(b) else 0.0
                elif k in ("flow_rate_lmin","tank_capacity_l","battery_capacity_ah","fuel_tank_l","spray_radius_m"):
                    s=sprayer_relative_similarity(float(a),float(b),0.15,0.30,0.45)
                elif k in ("fuel_power_w","engine_cc"):
                    s=sprayer_relative_similarity(float(a),float(b),0.10,0.20,0.30)
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
        if carry_mismatch:score=min(score,84.0)
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
        if profile=="concrete_mixer":
            z=concrete_mixer_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="grain_crusher":
            z=grain_crusher_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="washstand":
            z=washstand_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="compressor":
            z=compressor_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]),ours,comp)
        elif profile=="snow_blower":
            z=snow_blower_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="garden_shredder":
            z=garden_shredder_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="battery_pruner":
            z=battery_pruner_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="sprayer":
            z=sprayer_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="impact_wrench":
            z=impact_wrench_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="circular_saw":
            z=circular_saw_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="miter_saw":
            z=miter_saw_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="bench_grinder":
            z=bench_grinder_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="borehole_pump":
            z=borehole_pump_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="surface_pump":
            z=surface_pump_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="sewage_station":
            z=sewage_station_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="fecal_pump":
            z=fecal_pump_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="circulation_pump":
            z=circulation_pump_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]),ours,comp)
        elif profile=="drainage_pump":
            z=drainage_pump_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="angle_grinder":
            z=angle_grinder_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="impact_drill":
            z=impact_drill_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="cordless_screwdriver":
            z=screwdriver_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="paint_sprayer":
            z=paint_sprayer_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="jigsaw":
            z=jigsaw_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="rotary_hammer":
            z=rotary_hammer_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="planer":
            z=planer_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="reciprocating_saw":
            z=reciprocating_saw_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="construction_vacuum":
            z=construction_vacuum_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
        elif profile=="construction_heat_gun":
            z=construction_heat_gun_directional(rule,ours.get(rule["spec_key"]),comp.get(rule["spec_key"]))
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
        if profile=="concrete_mixer":
            z=concrete_mixer_directional(rule,a,b)
        elif profile=="grain_crusher":
            z=grain_crusher_directional(rule,a,b)
        elif profile=="washstand":
            z=washstand_directional(rule,a,b)
        elif profile=="compressor":
            z=compressor_directional(rule,a,b,ours,comp)
        elif profile=="garden_shredder":
            z=garden_shredder_directional(rule,a,b)
        elif profile=="battery_pruner":
            z=battery_pruner_directional(rule,a,b)
        elif profile=="sprayer":
            z=sprayer_directional(rule,a,b)
        elif profile=="impact_wrench":
            z=impact_wrench_directional(rule,a,b)
        elif profile=="circular_saw":
            z=circular_saw_directional(rule,a,b)
        elif profile=="miter_saw":
            z=miter_saw_directional(rule,a,b)
        elif profile=="bench_grinder":
            z=bench_grinder_directional(rule,a,b)
        elif profile=="borehole_pump":
            z=borehole_pump_directional(rule,a,b)
        elif profile=="surface_pump":
            z=surface_pump_directional(rule,a,b)
        elif profile=="sewage_station":
            z=sewage_station_directional(rule,a,b)
        elif profile=="fecal_pump":
            z=fecal_pump_directional(rule,a,b)
        elif profile=="circulation_pump":
            z=circulation_pump_directional(rule,a,b,ours,comp)
        elif profile=="drainage_pump":
            z=drainage_pump_directional(rule,a,b)
        elif profile=="angle_grinder":
            z=angle_grinder_directional(rule,a,b)
        elif profile=="impact_drill":
            z=impact_drill_directional(rule,a,b)
        elif profile=="cordless_screwdriver":
            z=screwdriver_directional(rule,a,b)
        elif profile=="paint_sprayer":
            z=paint_sprayer_directional(rule,a,b)
        elif profile=="jigsaw":
            z=jigsaw_directional(rule,a,b)
        elif profile=="rotary_hammer":
            z=rotary_hammer_directional(rule,a,b)
        elif profile=="planer":
            z=planer_directional(rule,a,b)
        elif profile=="reciprocating_saw":
            z=reciprocating_saw_directional(rule,a,b)
        elif profile=="construction_vacuum":
            z=construction_vacuum_directional(rule,a,b)
        elif profile=="construction_heat_gun":
            z=construction_heat_gun_directional(rule,a,b)
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
    if profile=="sprayer" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения опрыскивателей. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены критические параметры его типа питания."
    if profile=="impact_wrench" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения гайковертов. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены тип гайковерта, питание, посадка и максимальный крутящий момент; для аккумуляторного также напряжение АКБ."
    if profile=="circular_saw" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения дисковых пил. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены тип, питание, диаметр диска, посадочное отверстие и глубина реза 90°; для аккумуляторной также напряжение АКБ."
    if profile=="miter_saw" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения торцовочных пил. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены мощность, диаметр диска, наличие протяжки, глубина реза 90°/45° и скорость вращения."
    if profile=="bench_grinder" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения точильных станков. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены тип двигателя, мощность, скорость вращения и диаметр круга."
    if profile=="angle_grinder" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения УШМ. Сетевые и аккумуляторные модели не смешиваются; для сетевой должны быть подтверждены тип двигателя, мощность, плавный пуск, регулировка оборотов и диаметр диска, для аккумуляторной — тип двигателя, емкость АКБ, плавный пуск, регулировка оборотов и диаметр диска."
    if profile=="impact_drill" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения ударных дрелей. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены мощность, максимальные обороты и наличие удара."
    if profile=="cordless_screwdriver" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения аккумуляторных шуруповертов. Не считать конкурента сильнее, пока не подтверждены емкость АКБ и максимальный крутящий момент."
    if profile=="paint_sprayer" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения краскопультов. Не считать конкурента сильнее, пока не подтверждены мощность и давление."
    if profile=="jigsaw" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения лобзиков. Не считать конкурента сильнее, пока не подтверждены максимальная глубина пропила по дереву и количество ходов в минуту; для сетевого лобзика также мощность."
    if profile=="rotary_hammer" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения перфораторов. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены тип патрона, мощность, энергия удара и максимальная скорость вращения."
    if profile=="planer" and status=="data_incomplete":
        return "Аналог рассчитан по доступным данным: тип двигателя может быть не указан. Для подбора обязательны максимальные обороты, глубина и ширина строгания; тип двигателя уточняет итог, но не блокирует аналог."
    if profile=="reciprocating_saw" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения сабельных пил. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены мощность, тип двигателя, глубина пропила по дереву и металлу, число ходов в минуту и тип питания."
    if profile=="construction_vacuum" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения строительных пылесосов. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены мощность, объем бака, тип уборки и материал корпуса."
    if profile=="construction_heat_gun" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения термопистолетов. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены производительность воздушного потока, время нагрева и мощность."
    if profile=="concrete_mixer" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных по бетономешалке. Отсутствующую характеристику не считать проигрышем: сравнивать только подтвержденные объём барабана, материал венца и мощность."
    if profile=="grain_crusher" and status=="data_incomplete":
        return "Недостаточно подтверждено ядро сравнения зернодробилки: нужны мощность и производительность. Форма корпуса и ёмкость бункера учитываются с согласованными весами, когда 21vek их публикует; отсутствие этих полей не считается проигрышем."
    if profile=="washstand" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных по умывальнику. Не считать отсутствующее поле нулём или проигрышем: нужны материал корпуса, ёмкость бака и наличие подогрева."
    if profile=="compressor" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных по компрессору. Не считать отсутствующую характеристику нулём или проигрышем: для точного аналога нужны тип компрессора, объём ресивера, тип двигателя, производительность и максимальное давление."
    if profile=="circulation_pump" and status=="data_incomplete":
        return "Недостаточно подтвержденных данных для точного сравнения циркуляционных насосов. Не считать конкурента сильнее или прямым аналогом, пока не подтверждены максимальный напор, пропускная способность, мощность и максимальное давление. Размер фильтруемых частиц — дополнительный параметр и не обязателен для вывода."
    if profile=="fecal_pump" and status=="data_incomplete":
        return "Аналог рассчитан по неполным данным. Для подтверждения пробела обязательны производительность, максимальный напор и размер частиц; измельчитель сильно влияет на итог, когда он указан. Материал корпуса, подключение и тип воды уточняют сравнение."
    min_match=55 if profile in ("oil_radiator","fan_heater","heat_gun","humidifier","chainsaw_electric","snow_blower","leaf_blower","earth_auger","garden_shredder","battery_pruner","sprayer","impact_wrench","circular_saw","impact_drill","cordless_screwdriver","paint_sprayer","jigsaw","rotary_hammer","planer","reciprocating_saw","construction_vacuum","construction_heat_gun","miter_saw","bench_grinder","angle_grinder","concrete_mixer","grain_crusher","washstand","compressor","drainage_pump","fecal_pump","sewage_station","surface_pump","borehole_pump") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 70)
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
    scopes,scope_skus,price_names=load_price_scope()
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

            # Recover our real 21vek cards missing from the old registry. This is a
            # targeted fallback for the agreed categories, not a broad market crawl.
            resolved_own_cards=0
            if profile in ("snow_blower","borehole_pump","planer","fecal_pump"):
                for sku in sorted(scope_skus[skey]):
                    src=registry.get(sku) or {}
                    if src.get("product_url"):continue
                    pname=price_names.get(sku) or src.get("product_name")
                    if not pname:continue
                    resolved=resolve_own_card(session,pname)
                    if not resolved:continue
                    registry[sku]={
                      **src,
                      "sku":sku,
                      "product_name":resolved.get("product_name") or pname,
                      "product_url":resolved.get("product_url"),
                      "price":resolved.get("price"),
                      "in_stock":resolved.get("in_stock"),
                      "category":scope.get("source_category"),
                      "subgroup":scope.get("source_subgroup")
                    }
                    resolved_own_cards+=1
                    time.sleep(DELAY)

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
            # Publish fresh own specs first. The old delete-first sequence could leave
            # a category empty when Supabase was busy between DELETE and UPSERT.
            # Upsert-first preserves the last good data even during transient DB load.
            rest_upsert("triovist_market_own_specs_current_v1",own_rows,"sku")
            live_skus={str(x.get("sku") or "") for x in own_rows if x.get("sku")}
            stale_skus=[sku for sku in own_existing if sku not in live_skus]
            for stale_sku in stale_skus:
                try:
                    rest_delete("triovist_market_own_specs_current_v1",{"sku":"eq."+stale_sku},timeout=12,attempts=2)
                except Exception as cleanup_exc:
                    # Stale cleanup is secondary to publishing current data. Do not
                    # abort the market run; the next successful cycle retries cleanup.
                    print(f"  WARN stale own-spec cleanup {stale_sku}: {cleanup_exc}",flush=True)

            # Rebuild only this scope's current analysis/gaps.
            rest_delete("triovist_market_analysis_current_v1",{"scope_key":"eq."+skey})
            rest_delete("triovist_market_gaps_current_v1",{"scope_key":"eq."+skey})
            analyses=[];gaps=[]
            usable_own=[x for x in own_rows if x.get("specs_normalized")]
            expected_own_count=len(scope_skus[skey])
            matrix_checked=expected_own_count>0 and len(usable_own)>=expected_own_count
            gap_threshold=55 if profile in ("oil_radiator","fan_heater","heat_gun","humidifier","chainsaw_electric","snow_blower","leaf_blower","earth_auger","garden_shredder","battery_pruner","sprayer","impact_wrench","circular_saw","impact_drill","cordless_screwdriver","paint_sprayer","jigsaw","rotary_hammer","planer","reciprocating_saw","construction_vacuum","construction_heat_gun","miter_saw","bench_grinder","angle_grinder","concrete_mixer","grain_crusher","washstand","compressor","drainage_pump","fecal_pump","sewage_station","surface_pump","borehole_pump") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 70)
            candidate_threshold=50 if profile in ("earth_auger","garden_shredder","battery_pruner","sprayer","impact_wrench","circular_saw","impact_drill","cordless_screwdriver","paint_sprayer","jigsaw","rotary_hammer","planer","reciprocating_saw","construction_vacuum","construction_heat_gun","miter_saw","bench_grinder","angle_grinder","concrete_mixer","grain_crusher","washstand","compressor","drainage_pump","sewage_station","surface_pump","borehole_pump") else (60 if profile in ("convector","chainsaw_gas","infrared_heater") else 55)
            for p in current_rows:
                if p.get("error_text") and not p.get("specs_normalized"): continue
                scored=[]
                for ours in usable_own:
                    sim=similarity(ours["specs_normalized"],p.get("specs_normalized") or {},rules,profile)
                    scored.append((sim,ours))
                scored.sort(key=lambda z:z[0],reverse=True)
                best=scored[0][0] if scored else 0.0
                gap_confirmed=bool(scored) and matrix_checked
                if profile=="concrete_mixer" and scored:
                    gap_confirmed=gap_confirmed and not concrete_mixer_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="grain_crusher" and scored:
                    gap_confirmed=gap_confirmed and not grain_crusher_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="washstand" and scored:
                    gap_confirmed=gap_confirmed and not washstand_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="compressor" and scored:
                    gap_confirmed=gap_confirmed and not compressor_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="reciprocating_saw" and scored:
                    gap_confirmed=gap_confirmed and not reciprocating_saw_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="construction_vacuum" and scored:
                    gap_confirmed=gap_confirmed and not construction_vacuum_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="construction_heat_gun" and scored:
                    gap_confirmed=gap_confirmed and not construction_heat_gun_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="miter_saw" and scored:
                    gap_confirmed=gap_confirmed and not miter_saw_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="bench_grinder" and scored:
                    gap_confirmed=gap_confirmed and not bench_grinder_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="borehole_pump" and scored:
                    gap_confirmed=gap_confirmed and not borehole_pump_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="surface_pump" and scored:
                    gap_confirmed=gap_confirmed and not surface_pump_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="sewage_station" and scored:
                    gap_confirmed=gap_confirmed and not sewage_station_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="fecal_pump" and scored:
                    gap_confirmed=gap_confirmed and not fecal_pump_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="circulation_pump" and scored:
                    gap_confirmed=gap_confirmed and not circulation_pump_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="drainage_pump" and scored:
                    gap_confirmed=gap_confirmed and not drainage_pump_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                if profile=="angle_grinder" and scored:
                    gap_confirmed=gap_confirmed and not angle_grinder_required_missing(
                      scored[0][1].get("specs_normalized") or {},
                      p.get("specs_normalized") or {}
                    )
                confirmed_gap=bool(best<gap_threshold and gap_confirmed)
                if confirmed_gap:
                    gaps.append({
                      "scope_key":skey,"product_key":p["product_key"],"best_similarity":round(best,2),
                      "reason":f"Подтверждённый пробел: матрица проверена полностью, лучшая сопоставимость ниже {gap_threshold}%",
                      "computed_at":observed
                    })
                # A row cannot be both an accepted analogue and a confirmed gap.
                # For incomplete data we still show the nearest candidate with a warning.
                top=[] if confirmed_gap else [x for x in scored if x[0]>=candidate_threshold][:3]
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
                    data_incomplete=False
                    comp_specs=p.get("specs_normalized") or {}
                    if profile=="concrete_mixer" and concrete_mixer_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="grain_crusher" and grain_crusher_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="washstand" and washstand_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="compressor" and compressor_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="snow_blower":
                        our_start=snow_blower_start_family(ours["specs_normalized"].get("engine_start_type"))
                        comp_start=comp_specs.get("engine_start_type")
                        if "electric" in our_start and comp_start is None and status=="competitor_stronger":
                            data_incomplete=True
                    if profile=="earth_auger":
                        req=("device_type","engine_type","fuel_power_w","max_auger_diameter_mm","shaft_diameter_mm")
                        if any(ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None for k in req):
                            data_incomplete=True
                    if profile=="garden_shredder":
                        req=("cutting_mechanism","engine_type","input_power_w","max_branch_diameter_mm")
                        if any(ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None for k in req):
                            data_incomplete=True
                    if profile=="battery_pruner":
                        req=("device_type","tool_type","voltage_v","power_source","max_cut_diameter_mm")
                        if any(ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None for k in req):
                            data_incomplete=True
                    if profile=="sprayer" and sprayer_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="impact_wrench" and impact_wrench_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="circular_saw" and circular_saw_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="miter_saw" and miter_saw_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="bench_grinder" and bench_grinder_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="borehole_pump" and borehole_pump_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="surface_pump" and surface_pump_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="sewage_station" and sewage_station_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="fecal_pump" and fecal_pump_data_incomplete(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="circulation_pump" and circulation_pump_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="drainage_pump" and drainage_pump_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="angle_grinder" and angle_grinder_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="impact_drill" and impact_drill_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="cordless_screwdriver" and screwdriver_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="paint_sprayer" and paint_sprayer_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="jigsaw" and jigsaw_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="rotary_hammer" and rotary_hammer_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="planer" and planer_data_incomplete(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="reciprocating_saw" and reciprocating_saw_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="construction_vacuum" and construction_vacuum_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    if profile=="construction_heat_gun" and construction_heat_gun_required_missing(ours["specs_normalized"],comp_specs):
                        data_incomplete=True
                    adv,bad=compare_texts(
                      ours["specs_normalized"],comp_specs,rules,op,cp,p.get("position"),mr,profile
                    )
                    if profile=="concrete_mixer" and concrete_mixer_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по объёму барабана, материалу венца или мощности бетономешалки — отсутствующие данные не считаются проигрышем, итог предварительный")
                    if profile=="compressor" and compressor_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по типу компрессора, объёму ресивера, типу двигателя, производительности или максимальному давлению — отсутствующие данные не считаются проигрышем, итог предварительный")
                    if profile=="snow_blower" and "electric" in snow_blower_start_family(ours["specs_normalized"].get("engine_start_type")) and comp_specs.get("engine_start_type") is None:
                        bad.append("У конкурента нет данных по типу запуска: нельзя считать электростартер равным отсутствующим данным")
                    if profile=="earth_auger":
                        missing=[k for k in ("device_type","engine_type","fuel_power_w","max_auger_diameter_mm","shaft_diameter_mm") if ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None]
                        if missing:
                            bad.append("Недостаточно данных по критическим характеристикам мотобура — итог предварительный, часть характеристик не подтверждена")
                    if profile=="garden_shredder":
                        missing=[k for k in ("cutting_mechanism","engine_type","input_power_w","max_branch_diameter_mm") if ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None]
                        if missing:
                            bad.append("Недостаточно данных по критическим характеристикам садового измельчителя — итог предварительный, часть характеристик не подтверждена")
                    if profile=="battery_pruner":
                        missing=[k for k in ("device_type","tool_type","voltage_v","power_source","max_cut_diameter_mm") if ours["specs_normalized"].get(k) is None or comp_specs.get(k) is None]
                        if missing:
                            bad.append("Недостаточно данных по критическим характеристикам аккумуляторного секатора — итог предварительный, часть характеристик не подтверждена")
                    if profile=="sprayer" and sprayer_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по критическим характеристикам опрыскивателя для его типа питания — итог предварительный, часть характеристик не подтверждена")
                    if profile=="impact_wrench" and impact_wrench_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по критическим характеристикам гайковерта — итог предварительный, часть характеристик не подтверждена")
                    if profile=="circular_saw" and circular_saw_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по критическим характеристикам дисковой пилы — итог предварительный, часть характеристик не подтверждена")
                    if profile=="miter_saw" and miter_saw_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по мощности, диаметру диска, протяжке, глубине реза 90°/45° или скорости вращения торцовочной пилы — итог предварительный, часть характеристик не подтверждена")
                    if profile=="bench_grinder" and bench_grinder_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по типу двигателя, мощности, скорости вращения или диаметру круга точильного станка — итог предварительный, часть характеристик не подтверждена")
                    if profile=="borehole_pump" and borehole_pump_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по типу воды, принципу действия, максимальному напору, глубине откачки, глубине погружения, диаметру скважины или пропускной способности скважинного насоса — итог предварительный, часть характеристик не подтверждена")
                    if profile=="surface_pump" and surface_pump_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по пропускной способности, мощности, максимальному напору воды, глубине откачки или типу воды поверхностного насоса — итог предварительный, часть характеристик не подтверждена")
                    if profile=="sewage_station" and sewage_station_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по пропускной способности, максимальному напору, размеру фильтрующих частиц, мощности или максимальной температуре воды канализационной станции — итог предварительный, часть характеристик не подтверждена")
                    if profile=="fecal_pump" and fecal_pump_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по материалу корпуса, пропускной способности, максимальному напору, диаметру соединения, размеру фильтруемых частиц, измельчителю или типу воды фекального насоса — итог предварительный, часть характеристик не подтверждена")
                    if profile=="circulation_pump" and circulation_pump_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по максимальному напору, пропускной способности, мощности или максимальному давлению циркуляционного насоса — итог предварительный, часть характеристик не подтверждена")
                    if profile=="drainage_pump" and drainage_pump_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по производительности, мощности, максимальному напору, материалу корпуса или размеру фильтрующих частиц дренажного насоса — итог предварительный, часть характеристик не подтверждена")
                    if profile=="angle_grinder" and angle_grinder_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по типу двигателя, питанию, мощности/емкости АКБ, плавному пуску, регулировке оборотов или диаметру диска УШМ — итог предварительный, часть характеристик не подтверждена")
                    if profile=="impact_drill" and impact_drill_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по критическим характеристикам ударной дрели — итог предварительный, часть характеристик не подтверждена")
                    if profile=="cordless_screwdriver" and screwdriver_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по емкости АКБ или крутящему моменту шуруповерта — итог предварительный, часть характеристик не подтверждена")
                    if profile=="paint_sprayer" and paint_sprayer_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по мощности или давлению краскопульта — итог предварительный, часть характеристик не подтверждена")
                    if profile=="jigsaw" and jigsaw_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по критическим характеристикам лобзика — итог предварительный, часть характеристик не подтверждена")
                    if profile=="rotary_hammer" and rotary_hammer_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по типу патрона, мощности, энергии удара или максимальной скорости вращения перфоратора — итог предварительный, часть характеристик не подтверждена")
                    if profile=="planer" and planer_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по типу двигателя, оборотам, глубине или ширине строгания рубанка — итог предварительный, часть характеристик не подтверждена")
                    if profile=="reciprocating_saw" and reciprocating_saw_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по мощности, типу двигателя, пропилу дерева/металла, числу ходов или типу питания сабельной пилы — итог предварительный, часть характеристик не подтверждена")
                    if profile=="construction_vacuum" and construction_vacuum_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по мощности, объему бака, типу уборки или материалу корпуса строительного пылесоса — итог предварительный, часть характеристик не подтверждена")
                    if profile=="construction_heat_gun" and construction_heat_gun_required_missing(ours["specs_normalized"],comp_specs):
                        bad.append("Недостаточно данных по производительности воздушного потока, времени нагрева или мощности термопистолета — итог предварительный, часть характеристик не подтверждена")
                    analyses.append({
                      "scope_key":skey,"product_key":p["product_key"],"our_sku":ours["sku"],
                      "similarity_score":round(sim,2),"analog_grade":analog_grade(sim,profile),"is_primary":idx==0,
                      "competitiveness_score":comp_score,"status":status,"data_incomplete":data_incomplete,"our_price":op,"mrc_byn":mr,
                      "mrc_delta_byn":mdb,"mrc_delta_pct":mdp,"competitor_price":cp,
                      "price_delta_byn":pdb,"price_delta_pct":pdp,
                      "our_specs":ours["specs_normalized"],"competitor_specs":p.get("specs_normalized") or {},
                      "advantages":adv,"disadvantages":bad,
                      "recommendation":(("⚠️ Итог предварительный: часть характеристик не подтверждена. " if data_incomplete else "")+recommendation(mdp,sim,status,op,cp,profile)),"computed_at":observed
                    })
            if analyses: rest_post("triovist_market_analysis_current_v1",analyses)
            if gaps: rest_post("triovist_market_gaps_current_v1",gaps)
            comparison_total+=len(analyses);gap_total+=len(gaps)
            run_notes.append({
              "scope":skey,"subgroup":scope["source_subgroup"],"query":scope["search_query"],
              **discover_meta,"our_matrix":len(scope_skus[skey]),"our_21vek":len(own_rows),"own_cards_resolved_from_price":resolved_own_cards,"matrix_checked_for_gaps":matrix_checked,
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
        # Publish one stable dashboard snapshot only after the market cycle finishes.
        # The UI reads this cache instantly and never competes with parser writes.
        try:
            cache_info=rest_rpc("triovist_market_dashboard_refresh_v236357",{},timeout=45,attempts=3)
            print(f"DASHBOARD CACHE REFRESHED: {cache_info}",flush=True)
        except Exception as cache_exc:
            print(f"DASHBOARD CACHE WARNING: {cache_exc}",flush=True)

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
