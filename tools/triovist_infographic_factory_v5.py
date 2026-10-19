#!/usr/bin/env python3
"""Triovist Infographic Factory 5.0 background worker.

One click -> category Visual DNA -> automatic 5-9 slide storyboard per exact SKU
-> hero-grade image generation -> independent visual QA >= threshold
-> targeted automatic regeneration of weak slides -> per-SKU ZIP -> batch ZIP parts.

Source CRM/parser tables are read-only. Temporary marketplace/provider failures
never poison unrelated SKUs. A worker lease prevents duplicate paid generation.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote, unquote, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError

from triovist_infographic_batch import (
    SUPABASE_URL, KEY, fetch_photo, headers as old_headers, log
)

EDGE=SUPABASE_URL.rstrip("/")+"/functions/v1/triovist-infographic-factory-v5"
BUCKET="triovist-infographic-factory-v5"
SESSION=requests.Session()
SESSION.headers.update({
    "User-Agent":"ResantaCRM-InfographicFactory/5.0 (+https://resanta-crm.by)",
    "Accept-Language":"ru-RU,ru;q=0.9,en;q=0.5"
})
LEASE_MINUTES=35
ITEMS_PER_WORKER=max(1,min(3,int(os.getenv("FACTORY_ITEMS_PER_WORKER","2"))))
WORKER_SECONDS=max(900,min(2100,int(os.getenv("FACTORY_WORKER_SECONDS","1650"))))
START=time.monotonic()
PART_BYTES=45*1024*1024
PHOTO_LIMIT=14*1024*1024
OWN_BRANDS={"resanta","ресанта","huter","хутер","вихрь","vikhr","eurolux","евролюкс"}
WB_HOST_CACHE={}

class TemporaryLimit(RuntimeError):pass
class WaitForDNA(RuntimeError):pass

def now():return datetime.now(timezone.utc).isoformat()
def now_dt():return datetime.now(timezone.utc)
def safe_name(v):
    x=re.sub(r'[<>:"/\\|?*\x00-\x1f]+','_',str(v or '')).strip(" ._")
    return x[:110] or "Unknown"
def api_headers(json_request=False):
    h={"apikey":KEY,"Authorization":"Bearer "+KEY}
    if json_request:h["Content-Type"]="application/json"
    return h
def req(method,url,timeout=40,**kw):
    r=SESSION.request(method,url,timeout=timeout,**kw)
    return r
def db_get(table,params):
    r=req("GET",f"{SUPABASE_URL}/rest/v1/{table}",headers=api_headers(),params=params,timeout=40)
    r.raise_for_status();return r.json()
def db_patch(table,filters,changes,representation=False):
    h=api_headers(True);h["Prefer"]="return=representation" if representation else "return=minimal"
    r=req("PATCH",f"{SUPABASE_URL}/rest/v1/{table}",headers=h,params=filters,json=changes,timeout=45)
    r.raise_for_status();return r.json() if representation and r.text else []
def db_insert(table,rows,representation=False):
    h=api_headers(True);h["Prefer"]="return=representation" if representation else "return=minimal"
    r=req("POST",f"{SUPABASE_URL}/rest/v1/{table}",headers=h,json=rows,timeout=50)
    r.raise_for_status();return r.json() if representation and r.text else []
def storage_put(path,data,content_type):
    encoded="/".join(quote(x,safe="") for x in path.split("/"))
    h=api_headers();h.update({"Content-Type":content_type,"x-upsert":"true"})
    r=req("POST",f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{encoded}",headers=h,data=data,timeout=180)
    if r.status_code not in (200,201):raise RuntimeError(f"Storage {r.status_code}: {r.text[:180]}")
def storage_get(path):
    encoded="/".join(quote(x,safe="") for x in path.split("/"))
    r=req("GET",f"{SUPABASE_URL}/storage/v1/object/authenticated/{BUCKET}/{encoded}",headers=api_headers(),timeout=150)
    r.raise_for_status();return r.content
def edge(action,payload,timeout=220):
    r=req("POST",EDGE,headers=api_headers(True),json={"action":action,**payload},timeout=timeout)
    if r.status_code==429:
        try:m=r.json().get("message")
        except Exception:m="temporary AI limit"
        raise TemporaryLimit(m or "temporary AI limit")
    if r.status_code!=200:
        try:j=r.json();m=j.get("message") or j.get("error")
        except Exception:m=r.text[:180]
        raise RuntimeError(f"Edge {r.status_code}: {m}")
    j=r.json()
    if not j.get("ok"):raise RuntimeError("Edge: "+str(j.get("message") or j.get("error")))
    return j

def font(size,bold=False):
    files=(["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"] if bold else
           ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"])
    for f in files:
        try:return ImageFont.truetype(f,size)
        except OSError:pass
    return ImageFont.load_default()

def wrap(draw,text,f,max_width,max_lines=3):
    words=str(text or "").split();out=[];cur=""
    for word in words:
        candidate=(cur+" "+word).strip()
        if cur and draw.textbbox((0,0),candidate,font=f)[2]>max_width:
            out.append(cur);cur=word
        else:cur=candidate
        if len(out)>=max_lines:break
    if cur and len(out)<max_lines:out.append(cur)
    return out

def brand_style(name):
    n=str(name or "").lower()
    if "huter" in n:return ("HUTER",(255,210,0),(14,18,23))
    if "вихр" in n:return ("ВИХРЬ",(255,120,0),(14,17,22))
    if "eurolux" in n:return ("EUROLUX",(45,126,235),(11,23,39))
    return ("РЕСАНТА",(228,42,55),(18,20,27))

def ref_jpeg(photo):
    p=photo.convert("RGB");p.thumbnail((1180,1180),Image.Resampling.LANCZOS)
    b=io.BytesIO();p.save(b,"JPEG",quality=91,optimize=True,subsampling=0)
    if b.tell()>4_500_000:raise RuntimeError("Reference photo too large")
    return b.getvalue()

def overlay_final(scene_bytes,slide,facts,item):
    W,H=1200,1500
    bg=Image.open(io.BytesIO(scene_bytes)).convert("RGB")
    bg=ImageOps.fit(bg,(W,H),method=Image.Resampling.LANCZOS,centering=(.5,.5)).convert("RGBA")
    brand,accent,dark=brand_style(item["product_name"])
    layout=slide.get("layout_key") or "editorial_left"
    left=layout in ("hero_split","editorial_left","macro_detail","technical_grid")
    panel=Image.new("RGBA",(W,H),(0,0,0,0));pd=ImageDraw.Draw(panel)
    if left:
        for x in range(0,650):
            a=int(225*(1-x/650)**1.25);pd.line((x,0,x,H),fill=(*dark,a),width=1)
        tx=68;tw=510
    else:
        for x in range(550,W):
            a=int(225*((x-550)/(W-550))**1.25);pd.line((x,0,x,H),fill=(*dark,a),width=1)
        tx=676;tw=470
    bg=Image.alpha_composite(bg,panel);d=ImageDraw.Draw(bg)

    d.rounded_rectangle((tx,48,tx+210,108),radius=18,fill=(*accent,238))
    d.text((tx+20,61),brand,font=font(29,True),fill="white" if sum(accent)<450 else dark)

    title=str(slide.get("title") or "")
    size=60 if len(title)<52 else 50
    f=font(size,True);y=155
    for line in wrap(d,title,f,tw,3):
        d.text((tx,y),line,font=f,fill="white",stroke_width=1,stroke_fill=(0,0,0,180));y+=int(size*1.12)
    sub=str(slide.get("subtitle") or "")
    if sub:
        sf=font(27,False)
        y+=12
        for line in wrap(d,sub,sf,tw,3):
            d.text((tx,y),line,font=sf,fill=(235,239,245,255));y+=36

    verified={str(x.get("id")):x for x in facts}
    linked=[verified.get(str(x)) for x in (slide.get("fact_ids") or []) if verified.get(str(x))][:4]
    card_y=1015 if left else 990
    card_x=tx;card_w=tw
    gap=12;card_h=92
    for i,fact in enumerate(linked):
        y0=card_y+i*(card_h+gap)
        d.rounded_rectangle((card_x,y0,card_x+card_w,y0+card_h),radius=17,fill=(255,255,255,235))
        d.text((card_x+18,y0+12),str(fact.get("label") or "")[:36],font=font(19),fill=(86,98,114))
        value=str(fact.get("value") or "")
        vf=font(28 if len(value)<24 else 23,True)
        d.text((card_x+18,y0+46),value[:45],font=vf,fill=dark)
        d.rounded_rectangle((card_x+card_w-14,y0+13,card_x+card_w-6,y0+card_h-13),radius=4,fill=accent)

    d.rounded_rectangle((44,H-80,W-44,H-30),radius=15,fill=(*dark,215))
    d.text((63,H-68),"Артикул: "+str(item["sku"]),font=font(20),fill="white")
    d.text((W-150,H-68),f"{int(slide['slide_no'])}/{int(item.get('slide_count') or 0)}",font=font(20,True),fill="white")
    out=io.BytesIO();bg.convert("RGB").save(out,"PNG",optimize=True)
    return out.getvalue()

def html_image_urls(html,base_url,limit=15):
    soup=BeautifulSoup(html,"html.parser");out=[]
    for attrs in ({"property":"og:image"},{"name":"twitter:image"}):
        node=soup.find("meta",attrs=attrs)
        if node and node.get("content"):out.append(node.get("content"))
    for img in soup.find_all("img")[:80]:
        for key in ("src","data-src","data-original","srcset"):
            val=img.get(key)
            if not val:continue
            for part in str(val).split(",")[:3]:
                u=part.strip().split(" ")[0]
                if u.startswith("//"):u="https:"+u
                elif u.startswith("/"):
                    p=urlparse(base_url);u=f"{p.scheme}://{p.netloc}{u}"
                if u.startswith("http"):out.append(u)
    # Catch image URLs embedded in JSON.
    for u in re.findall(r'https?:\\?/\\?/[^\"\'<> ]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\"\'<> ]*)?',html,re.I):
        out.append(u.replace("\\/","/"))
    unique=[]
    for u in out:
        if u and u not in unique:unique.append(u)
        if len(unique)>=limit:break
    return unique

def download_image(url):
    try:
        r=req("GET",url,headers={"User-Agent":SESSION.headers["User-Agent"],"Accept":"image/avif,image/webp,image/png,image/jpeg,*/*"},timeout=25,stream=True)
        if r.status_code!=200:return None
        buf=io.BytesIO();size=0
        for chunk in r.iter_content(65536):
            size+=len(chunk)
            if size>PHOTO_LIMIT:return None
            buf.write(chunk)
        buf.seek(0);im=Image.open(buf);im=ImageOps.exif_transpose(im).convert("RGB")
        if im.width<250 or im.height<250:return None
        if im.width/im.height>4 or im.height/im.width>4:return None
        im.thumbnail((700,700),Image.Resampling.LANCZOS);return im
    except Exception:return None

def marketplace_page_images(url,max_images=3):
    try:
        r=req("GET",url,headers={"User-Agent":SESSION.headers["User-Agent"],"Accept":"text/html,application/xhtml+xml"},timeout=28)
        if r.status_code!=200:return []
        out=[]
        for image_url in html_image_urls(r.text,url,18):
            im=download_image(image_url)
            if im is not None:out.append(im)
            if len(out)>=max_images:break
        return out
    except Exception:return []

def ddg_result_urls(query,domain,limit=6):
    try:
        r=req("GET","https://html.duckduckgo.com/html/",params={"q":f"site:{domain} {query}"},headers={"User-Agent":"Mozilla/5.0"},timeout=25)
        if r.status_code!=200:return []
        soup=BeautifulSoup(r.text,"html.parser");out=[]
        for a in soup.select("a.result__a"):
            href=a.get("href") or ""
            if "uddg=" in href:
                try:href=unquote(parse_qs(urlparse(href).query).get("uddg",[""])[0])
                except Exception:pass
            host=(urlparse(href).hostname or "").lower()
            if domain in host and href not in out:out.append(href)
            if len(out)>=limit:break
        return out
    except Exception:return []

def wb_search_products(query,limit=5):
    """Best-effort public WB discovery. Any anti-bot/rate-limit failure falls back to web discovery."""
    try:
        r=req("GET","https://search.wb.ru/exactmatch/ru/common/v4/search",
              params={"query":query,"resultset":"catalog","dest":"-1257786","curr":"rub","spp":"30","appType":"1","lang":"ru","page":"1"},
              headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36","Accept":"application/json,text/plain,*/*"},
              timeout=18)
        if r.status_code!=200 or "json" not in (r.headers.get("content-type") or "").lower():return []
        j=r.json()
        products=j.get("products") or (j.get("data") or {}).get("products") or []
        out=[]
        for p in products:
            try:nm=int(p.get("id"))
            except Exception:continue
            brand=normalize_group(p.get("brand"))
            if brand in OWN_BRANDS:continue
            out.append({"id":nm,"pics":int(p.get("pics") or 3)})
            if len(out)>=limit:break
        return out
    except Exception:return []

def wb_basket_host(nm):
    vol=nm//100000
    if vol in WB_HOST_CACHE:return WB_HOST_CACHE[vol]
    path=f"/vol{vol}/part{nm//1000}/{nm}/info/ru/card.json"
    # Recent hosts first, then exhaustive bounded probe. Cached per volume.
    order=list(range(35,61))+list(range(1,35))
    for n in order:
        host=f"{n:02d}"
        try:
            r=req("GET",f"https://basket-{host}.wbbasket.ru{path}",headers={"User-Agent":"Mozilla/5.0","Accept":"application/json"},timeout=3)
            if r.status_code==200:
                WB_HOST_CACHE[vol]=host;return host
        except Exception:pass
    return None

def wb_visual_samples(query,max_images=6):
    out=[]
    for p in wb_search_products(query,4):
        host=wb_basket_host(p["id"])
        if not host:continue
        nm=p["id"];vol=nm//100000;part=nm//1000
        for i in range(1,min(3,p.get("pics",3))+1):
            u=f"https://basket-{host}.wbbasket.ru/vol{vol}/part{part}/{nm}/images/big/{i}.webp"
            im=download_image(u)
            if im is not None:out.append(im)
            if len(out)>=max_images:return out
    return out

def normalize_group(s):
    return re.sub(r"[^a-zа-я0-9]+"," ",str(s or "").lower().replace("ё","е")).strip()

def collect_21vek_competitor_urls(group,limit=6):
    try:
        scopes=db_get("triovist_market_scopes_v1",{"select":"scope_key,source_category,source_subgroup,search_query","enabled":"eq.true","limit":"400"})
        g=normalize_group(group);matched=[]
        for s in scopes:
            text=" ".join(normalize_group(s.get(k)) for k in ("source_category","source_subgroup","search_query"))
            if g and (g in text or any(tok in text for tok in g.split() if len(tok)>5)):matched.append(s["scope_key"])
        if not matched:return []
        filt="("+",".join(matched[:20])+")"
        rows=db_get("triovist_market_products_current_v1",{"select":"product_url,brand,position,in_stock","scope_key":f"in.{filt}","order":"position.asc","limit":"80"})
        out=[]
        for x in rows:
            if normalize_group(x.get("brand")) in OWN_BRANDS:continue
            u=str(x.get("product_url") or "")
            if u.startswith("https://") and "21vek.by/" in u and u not in out:out.append(u)
            if len(out)>=limit:break
        return out
    except Exception:return []

def build_contact_sheet(samples):
    # samples = [(source, Image)]
    W,H=1800,1800;cols=4;rows=4
    canvas=Image.new("RGB",(W,H),(244,246,249));d=ImageDraw.Draw(canvas)
    cell_w=W//cols;cell_h=H//rows
    for idx,(source,im) in enumerate(samples[:16]):
        col=idx%cols;row=idx//cols;x=col*cell_w;y=row*cell_h
        tile=Image.new("RGB",(cell_w-18,cell_h-48),"white")
        cp=im.copy();cp.thumbnail((cell_w-38,cell_h-76),Image.Resampling.LANCZOS)
        tile.paste(cp,((tile.width-cp.width)//2,18))
        canvas.paste(tile,(x+9,y+8))
        d.text((x+20,y+cell_h-35),f"{source.upper()} · {idx+1}",font=font(18,True),fill=(35,48,64))
    out=io.BytesIO();canvas.save(out,"JPEG",quality=88,optimize=True);return out.getvalue()

def ensure_group_dna(item,fallback_photo):
    group=item["group_name"]
    rows=db_get("triovist_infographic_group_dna_v5",{"group_name":"eq."+group,"select":"*","limit":"1"})
    row=rows[0] if rows else None
    if row and row.get("status")=="ready" and row.get("expires_at") and datetime.fromisoformat(row["expires_at"].replace("Z","+00:00"))>now_dt():
        return row
    token=str(uuid.uuid4());until=(now_dt()+timedelta(minutes=LEASE_MINUTES)).isoformat()
    # Best-effort lease; if another worker is researching, wait.
    if row and row.get("status")=="researching" and row.get("locked_until"):
        try:
            if datetime.fromisoformat(row["locked_until"].replace("Z","+00:00"))>now_dt():raise WaitForDNA("group DNA is being researched")
        except ValueError:pass
    patched=db_patch("triovist_infographic_group_dna_v5",{"group_name":"eq."+group},
                     {"status":"researching","lock_token":token,"locked_until":until,"error_message":None,"updated_at":now()},True)
    if not patched:
        db_insert("triovist_infographic_group_dna_v5",{"group_name":group,"status":"researching","lock_token":token,"locked_until":until})
    samples=[];summary={"21vek":0,"wb":0,"ozon":0,"fallback_exact_sku":0,"urls":{"21vek":[],"wb":[],"ozon":[]}}
    # 21vek competitor gallery references from our parser.
    for u in collect_21vek_competitor_urls(group,6):
        ims=marketplace_page_images(u,2);summary["urls"]["21vek"].append(u)
        for im in ims:
            samples.append(("21vek",im));summary["21vek"]+=1
            if summary["21vek"]>=6:break
        if summary["21vek"]>=6:break
    # Wildberries: first use its public JSON/CDN discovery; if throttled or fingerprint-blocked, fall back to public web results.
    wbims=wb_visual_samples(group,6)
    for im in wbims:
        samples.append(("wb",im));summary["wb"]+=1
    if summary["wb"]<3:
        for u in ddg_result_urls(group,"wildberries.ru",5):
            ims=marketplace_page_images(u,2);summary["urls"]["wb"].append(u)
            for im in ims:
                samples.append(("wb",im));summary["wb"]+=1
                if summary["wb"]>=5:break
            if summary["wb"]>=5:break
    # Ozon is intentionally fail-soft: public pages/search may be anti-bot protected. The factory never stops if this source is unavailable.
    for u in ddg_result_urls(group,"ozon.ru",6):
        ims=marketplace_page_images(u,2);summary["urls"]["ozon"].append(u)
        for im in ims:
            samples.append(("ozon",im));summary["ozon"]+=1
            if summary["ozon"]>=5:break
        if summary["ozon"]>=5:break
    if len(samples)<4:
        samples.append(("exact-sku",fallback_photo.convert("RGB")));summary["fallback_exact_sku"]+=1
    sheet=build_contact_sheet(samples)
    path=f"dna/{safe_name(group)}/{int(time.time())}.jpg";storage_put(path,sheet,"image/jpeg")
    try:
        result=edge("worker-group-dna",{"group_name":group,"contact_sheet_base64":base64.b64encode(sheet).decode(),"source_summary":summary},timeout=190)
        db_patch("triovist_infographic_group_dna_v5",{"group_name":"eq."+group},
                 {"contact_sheet_path":path,"source_summary":summary,"lock_token":None,"locked_until":None,"updated_at":now()})
        return db_get("triovist_infographic_group_dna_v5",{"group_name":"eq."+group,"select":"*","limit":"1"})[0]
    except TemporaryLimit:
        db_patch("triovist_infographic_group_dna_v5",{"group_name":"eq."+group},{"status":"missing","lock_token":None,"locked_until":None,"error_message":"Временный лимит ИИ; повторится автоматически","updated_at":now()})
        raise
    except Exception as e:
        db_patch("triovist_infographic_group_dna_v5",{"group_name":"eq."+group},{"status":"error","lock_token":None,"locked_until":None,"error_message":str(e)[:220],"updated_at":now()})
        raise

def claim_item():
    batches=db_get("triovist_infographic_factory_batches_v5",{
        "status":"in.(queued,researching,processing)","select":"id,status,created_at","order":"created_at.asc","limit":"12"})
    token=str(uuid.uuid4());until=(now_dt()+timedelta(minutes=LEASE_MINUTES)).isoformat()
    for batch in batches:
        candidates=db_get("triovist_infographic_factory_items_v5",{
            "batch_id":"eq."+batch["id"],
            "status":"in.(queued,planning,generating,qa,remaking)",
            "select":"*","order":"is_reference.desc,updated_at.asc","limit":"16"})
        for item in candidates:
            if item.get("next_attempt_at"):
                try:
                    if datetime.fromisoformat(item["next_attempt_at"].replace("Z","+00:00"))>now_dt():continue
                except ValueError:pass
            if item.get("locked_until"):
                try:
                    if datetime.fromisoformat(item["locked_until"].replace("Z","+00:00"))>now_dt():continue
                except ValueError:pass
            out=db_patch("triovist_infographic_factory_items_v5",{"id":"eq."+item["id"],"status":"eq."+item["status"]},
                         {"lock_token":token,"locked_until":until,"started_at":item.get("started_at") or now(),"updated_at":now()},True)
            if out:return out[0]
    return None

def release_item(item,changes=None):
    payload={"lock_token":None,"locked_until":None,"updated_at":now()}
    if changes:payload.update(changes)
    db_patch("triovist_infographic_factory_items_v5",{"id":"eq."+item["id"]},payload)

def requeue(item,message,minutes=5):
    retry=int(item.get("retry_count") or 0)+1
    delay=min(60,max(minutes,2**min(retry,5)))
    release_item(item,{"status":"queued","stage":f"Временная пауза — автоматический повтор примерно через {delay} мин",
                       "retry_count":retry,"next_attempt_at":(now_dt()+timedelta(minutes=delay)).isoformat(),
                       "error_message":None})

def get_slides(item_id):
    return db_get("triovist_infographic_factory_slides_v5",{"item_id":"eq."+item_id,"select":"*","order":"slide_no.asc","limit":"10"})

def process_item(item):
    if time.monotonic()-START>WORKER_SECONDS-120:return
    iid=item["id"];log("Factory item",item["sku"],item["group_name"])
    try:
        # Keep the claim lease while changing business status; never expose an unlocked paid-work item.
        db_patch("triovist_infographic_factory_items_v5",{"id":"eq."+iid},
                 {"status":"planning","stage":"Проверяю exact-SKU фото и факты","error_message":None,"updated_at":now()})
        db_patch("triovist_infographic_factory_batches_v5",{"id":"eq."+item["batch_id"],"status":"in.(queued,researching,processing)"},
                 {"status":"processing","stage":"Фабрика работает в фоне","started_at":now(),"updated_at":now()})
        photo,photo_url,_,live_facts=fetch_photo({"product_url":item["product_url"],"product_name":item["product_name"],"sku":item["sku"]})
        dna=ensure_group_dna(item,photo)
        ref_bytes=ref_jpeg(photo);ref64=base64.b64encode(ref_bytes).decode()
        source_path=f"batches/{item['batch_id']}/items/{safe_name(item['sku'])}/source.jpg"
        storage_put(source_path,ref_bytes,"image/jpeg")
        current=db_get("triovist_infographic_factory_items_v5",{"id":"eq."+iid,"select":"*","limit":"1"})[0]
        if not current.get("storyboard") or int(current.get("slide_count") or 0)==0:
            db_patch("triovist_infographic_factory_items_v5",{"id":"eq."+iid},{"status":"planning","stage":"ИИ строит 5–9 сильных экранов","source_photo_url":photo_url,"source_photo_path":source_path,"updated_at":now()})
            edge("worker-storyboard",{"item_id":iid,"live_facts":live_facts,"photo_url":photo_url},timeout=190)
        current=db_get("triovist_infographic_factory_items_v5",{"id":"eq."+iid,"select":"*","limit":"1"})[0]
        slides=get_slides(iid);batch=db_get("triovist_infographic_factory_batches_v5",{"id":"eq."+item["batch_id"],"select":"*","limit":"1"})[0]
        if not slides:raise RuntimeError("Storyboard saved without slides")
        db_patch("triovist_infographic_factory_items_v5",{"id":"eq."+iid},{"status":"generating","stage":f"Генерация {len(slides)} слайдов","updated_at":now()})
        attention=False
        for slide in slides:
            if slide["status"]=="completed":continue
            max_attempts=1+int(batch.get("max_regenerations") or 2)
            revision=""
            while int(slide.get("attempt_count") or 0)<max_attempts:
                if time.monotonic()-START>WORKER_SECONDS-240:
                    release_item(item,{"status":"queued","stage":"Продолжу с этого слайда в следующем цикле"})
                    return
                attempt=int(slide.get("attempt_count") or 0)+1
                db_patch("triovist_infographic_factory_slides_v5",{"id":"eq."+slide["id"]},
                         {"status":"generating","attempt_count":attempt,"error_message":None,"updated_at":now()})
                if slide.get("qa_report"):
                    revision="; ".join(slide["qa_report"].get("required_changes") or [])[:600]
                result=edge("worker-slide-image",{"item_id":iid,"slide_no":slide["slide_no"],"photo_base64":ref64,"revision_note":revision},timeout=240)
                scene=base64.b64decode(result["image_base64"],validate=True)
                if len(scene)<12000:raise RuntimeError("Generated scene too small")
                scene_path=f"batches/{item['batch_id']}/items/{safe_name(item['sku'])}/scene_{int(slide['slide_no']):02}_a{attempt}.jpg"
                storage_put(scene_path,scene,"image/jpeg")
                fresh_item=db_get("triovist_infographic_factory_items_v5",{"id":"eq."+iid,"select":"*","limit":"1"})[0]
                fresh_slide=db_get("triovist_infographic_factory_slides_v5",{"id":"eq."+slide["id"],"select":"*","limit":"1"})[0]
                final=overlay_final(scene,fresh_slide,fresh_item.get("facts") or [],fresh_item)
                final_path=f"batches/{item['batch_id']}/items/{safe_name(item['sku'])}/slide_{int(slide['slide_no']):02}.png"
                storage_put(final_path,final,"image/png")
                db_patch("triovist_infographic_factory_slides_v5",{"id":"eq."+slide["id"]},{"status":"qa","scene_path":scene_path,"final_path":final_path,"updated_at":now()})
                qa=edge("worker-slide-qa",{"item_id":iid,"slide_no":slide["slide_no"],
                    "source_image_base64":ref64,"final_image_base64":base64.b64encode(final).decode()},timeout=190)["report"]
                if qa.get("approved"):
                    db_patch("triovist_infographic_factory_slides_v5",{"id":"eq."+slide["id"]},{"status":"completed","qa_score":int(qa.get("score") or 0),"qa_report":qa,"updated_at":now()})
                    slide={**slide,"status":"completed","qa_score":int(qa.get("score") or 0),"qa_report":qa,"attempt_count":attempt,"final_path":final_path}
                    break
                db_patch("triovist_infographic_factory_slides_v5",{"id":"eq."+slide["id"]},{"qa_score":int(qa.get("score") or 0),"qa_report":qa,"status":"queued","updated_at":now()})
                slide={**slide,"qa_report":qa,"attempt_count":attempt}
                db_patch("triovist_infographic_factory_items_v5",{"id":"eq."+iid},{"status":"remaking","stage":f"Автопеределка слайда {slide['slide_no']}: QA {qa.get('score',0)}/100","updated_at":now()})
            if slide.get("status")!="completed":
                last=db_get("triovist_infographic_factory_slides_v5",{"id":"eq."+slide["id"],"select":"*","limit":"1"})[0]
                if last["status"]!="completed":
                    db_patch("triovist_infographic_factory_slides_v5",{"id":"eq."+slide["id"]},{"status":"attention","error_message":"Не достиг порога качества после автоматических переделок","updated_at":now()})
                    attention=True
        final_slides=get_slides(iid)
        completed=sum(x["status"]=="completed" for x in final_slides)
        remakes=sum(max(0,int(x.get("attempt_count") or 0)-1) for x in final_slides)
        scores=[int(x.get("qa_score") or 0) for x in final_slides if x.get("qa_score") is not None]
        quality=min(scores) if scores else 0
        # Per-SKU archive, including audit even if one slide needs attention.
        zbuf=io.BytesIO()
        with zipfile.ZipFile(zbuf,"w",compression=zipfile.ZIP_STORED,allowZip64=True) as z:
            for s in final_slides:
                if s.get("final_path"):
                    try:z.writestr(f"slide_{int(s['slide_no']):02}.png",storage_get(s["final_path"]))
                    except Exception:pass
            z.writestr("audit.json",json.dumps({
                "sku":item["sku"],"group":item["group_name"],"product_name":item["product_name"],
                "source_photo":photo_url,"slide_count":len(final_slides),"quality_floor":quality,
                "slides":[{"slide_no":s["slide_no"],"status":s["status"],"attempts":s["attempt_count"],"score":s.get("qa_score"),"qa":s.get("qa_report")} for s in final_slides],
                "generated_at":now()
            },ensure_ascii=False,indent=2))
        zip_path=f"batches/{item['batch_id']}/items/{safe_name(item['sku'])}.zip";storage_put(zip_path,zbuf.getvalue(),"application/zip")
        if attention or completed<len(final_slides):
            release_item(item,{"status":"attention","stage":"Часть слайдов не достигла 90/100 после автопеределок","slide_count":len(final_slides),"completed_slides":completed,"remake_slides":remakes,"quality_score":quality,"item_zip_path":zip_path,"finished_at":now()})
        else:
            release_item(item,{"status":"completed","stage":"Готово — все слайды прошли независимый QA","slide_count":len(final_slides),"completed_slides":completed,"remake_slides":remakes,"quality_score":quality,"item_zip_path":zip_path,"finished_at":now(),"retry_count":0,"next_attempt_at":None})
    except WaitForDNA:
        requeue(item,"Visual DNA is being researched",2)
    except TemporaryLimit as e:
        log("Factory temporary limit",item["sku"],str(e)[:160]);requeue(item,str(e),5)
    except Exception as e:
        msg=str(e)[:260];log("Factory item failed",item["sku"],msg)
        current=db_get("triovist_infographic_factory_items_v5",{"id":"eq."+iid,"select":"retry_count","limit":"1"})
        retry=int((current[0].get("retry_count") if current else 0) or 0)
        if retry<2 and any(x in msg.lower() for x in ("timeout","connection","http 429","http 500","http 502","http 503","http 504","temporary")):
            item["retry_count"]=retry;requeue(item,msg,5)
        else:
            release_item(item,{"status":"error","stage":"Требует внимания","error_message":msg,"finished_at":now()})

def batch_counts(batch_id):
    items=db_get("triovist_infographic_factory_items_v5",{"batch_id":"eq."+batch_id,"select":"status,remake_slides,item_zip_path,sku,group_name","limit":"500"})
    return items,{
        "completed":sum(x["status"]=="completed" for x in items),
        "attention":sum(x["status"]=="attention" for x in items),
        "error":sum(x["status"]=="error" for x in items),
        "active":sum(x["status"] in ("queued","waiting_group_dna","planning","generating","qa","remaking") for x in items),
        "remakes":sum(int(x.get("remake_slides") or 0)>0 for x in items)
    }

def finalize_batch(batch):
    bid=batch["id"];items,counts=batch_counts(bid)
    db_patch("triovist_infographic_factory_batches_v5",{"id":"eq."+bid},{
        "completed_items":counts["completed"],"attention_items":counts["attention"],"failed_items":counts["error"],
        "remake_items":counts["remakes"],"updated_at":now()
    })
    if counts["active"]:return
    # If any selected group still needs the one-time style approval, pause after reference SKU(s).
    # Group names may contain commas, therefore never use a PostgREST in.(...) string here.
    all_dna=db_get("triovist_infographic_group_dna_v5",{"select":"group_name,approved_for_bulk","limit":"500"})
    selected=set(batch.get("groups") or [])
    dna=[x for x in all_dna if x.get("group_name") in selected]
    approved={x["group_name"]:bool(x.get("approved_for_bulk")) for x in dna}
    unapproved=[g for g in selected if not approved.get(g,False)]
    if unapproved:
        refs=[x for x in items if x.get("group_name") in unapproved]
        if refs and all(x["status"] in ("completed","attention","error") for x in refs):
            db_patch("triovist_infographic_factory_batches_v5",{"id":"eq."+bid},{"status":"pilot_review","stage":"Контрольные SKU готовы — один раз утвердите стиль группы, затем фабрика запустит остальные SKU","updated_at":now()})
        return
    # Final batch archives from per-SKU ZIPs.
    good=[x for x in items if x.get("item_zip_path")]
    if not good:
        db_patch("triovist_infographic_factory_batches_v5",{"id":"eq."+bid},{"status":"failed","stage":"Нет готовых комплектов","error_summary":"Ни один SKU не сформировал архив","finished_at":now(),"updated_at":now()});return
    manifest=[];part=1;used=0;count=0;buf=io.BytesIO();z=zipfile.ZipFile(buf,"w",compression=zipfile.ZIP_STORED,allowZip64=True)
    def commit():
        nonlocal part,used,count,buf,z
        if count<1:return
        z.close();path=f"batches/{bid}/archive_part_{part:03}.zip";storage_put(path,buf.getvalue(),"application/zip")
        manifest.append({"path":path,"bytes":len(buf.getvalue()),"files":count});part+=1;used=0;count=0;buf=io.BytesIO();z=zipfile.ZipFile(buf,"w",compression=zipfile.ZIP_STORED,allowZip64=True)
    for x in good:
        try:data=storage_get(x["item_zip_path"])
        except Exception:continue
        if used+len(data)>PART_BYTES and count:commit()
        z.writestr(f"{safe_name(x['group_name'])}/{safe_name(x['sku'])}.zip",data);used+=len(data);count+=1
    commit()
    try:z.close()
    except Exception:pass
    status="completed_with_attention" if counts["attention"] or counts["error"] else "completed"
    db_patch("triovist_infographic_factory_batches_v5",{"id":"eq."+bid},{"status":status,"stage":"Фабрика завершена","archive_manifest":manifest,
        "error_summary":f"Требуют внимания: {counts['attention']}; ошибки: {counts['error']}" if status!="completed" else None,
        "finished_at":now(),"updated_at":now()})

def refresh_batches():
    batches=db_get("triovist_infographic_factory_batches_v5",{"status":"in.(queued,researching,processing,pilot_review)","select":"*","order":"created_at.asc","limit":"20"})
    for b in batches:
        if b["status"]!="pilot_review":finalize_batch(b)

def main():
    shard=os.getenv("FACTORY_SHARD","0")
    log("Infographic Factory V5 worker",shard)
    processed=0
    while processed<ITEMS_PER_WORKER and time.monotonic()-START<WORKER_SECONDS-180:
        item=claim_item()
        if not item:break
        process_item(item);processed+=1
    refresh_batches()
    log("Factory worker done",shard,"processed",processed)

if __name__=="__main__":main()
