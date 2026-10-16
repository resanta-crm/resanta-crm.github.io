#!/usr/bin/env python3
"""Resanta Triovist v23.6.386: isolated, persistent AI infographic batch worker.

Runs only from a scheduled GitHub workflow with SUPABASE_URL and SUPABASE_KEY.
Works from existing CRM item snapshots. Fetches only canonical public 21vek
product pages and their public gallery. Never calls private 21vek endpoints,
bypasses CAPTCHA, invents missing product photos, or edits business source data.
"""
from __future__ import annotations
import io
import json
import os
import re
import sys
import time
import zipfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError

from triovist_21vek_parser import next_state, public_product_url

SUPABASE_URL=os.environ["SUPABASE_URL"].rstrip("/")
KEY=os.environ["SUPABASE_KEY"].strip()
EDGE=SUPABASE_URL+"/functions/v1/triovist-infographic-ai-v236385"
BUCKET="triovist-infographic-archives"
UA="ResantaCRM-InfographicBatch/1.0 (+https://resanta-crm.by)"
SESSION=requests.Session()
SESSION.headers.update({"User-Agent":UA,"Accept-Language":"ru-RU,ru;q=0.9"})
MAX_ITEMS=max(1,min(50,int(os.getenv("BATCH_MAX_ITEMS","24"))))
MAX_SECONDS=max(900,min(3300,int(os.getenv("BATCH_MAX_SECONDS","3000"))))
PART_BYTES=43*1024*1024
PHOTO_BYTES=12*1024*1024
MEDIA_DOMAINS={"21vek.by","www.21vek.by","cdn21vek.by"}
START=time.monotonic()

def log(*a):
    print(datetime.now(timezone.utc).isoformat(),*a,flush=True)

def headers(json_request=False):
    d={"apikey":KEY,"Authorization":"Bearer "+KEY}
    if json_request:d["Content-Type"]="application/json"
    return d

def request(method,url,timeout=35,**kw):
    resp=SESSION.request(method,url,timeout=timeout,**kw)
    if resp.status_code in (429,500,502,503,504):
        time.sleep(2)
        resp=SESSION.request(method,url,timeout=timeout,**kw)
    return resp

def db_get(table,params):
    r=request("GET",f"{SUPABASE_URL}/rest/v1/{table}",headers=headers(),params=params)
    r.raise_for_status()
    return r.json()

def db_update(table,filters,changes):
    h=headers(True);h["Prefer"]="return=minimal"
    r=request("PATCH",f"{SUPABASE_URL}/rest/v1/{table}",headers=h,params=filters,json=changes)
    r.raise_for_status()

def storage_put(path,data,content_type="application/zip"):
    h=headers();h.update({"Content-Type":content_type,"x-upsert":"true"})
    path="/".join(quote(seg,safe="") for seg in path.split("/"))
    r=request("POST",f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",headers=h,data=data,timeout=180)
    if r.status_code not in (200,201):raise RuntimeError("Storage upload: "+str(r.status_code)+" "+r.text[:250])

def storage_get(path):
    path="/".join(quote(seg,safe="") for seg in path.split("/"))
    r=request("GET",f"{SUPABASE_URL}/storage/v1/object/authenticated/{BUCKET}/{path}",headers=headers(),timeout=100)
    r.raise_for_status()
    return r.content

def safe_name(value):
    out=re.sub(r'[<>:"/\\|?*\x00-\x1f]+','_',str(value or ""))
    return out.strip(" ._")[:105] or "Unknown"

def model_matches(crm_name,live_name):
    def tokens(v):
        v=re.sub(r"\(\s*\d+(?:/\d+){1,4}\s*\)","",str(v or ""))
        return re.findall(r"[a-zа-я0-9]+",v.lower().replace("ё","е"))
    a=tokens(crm_name);b=tokens(live_name)
    if not a or not b:return False
    model=[x for x in a if any(c.isdigit() for c in x) and len(x)>=3]
    if model and not any(x in b for x in model):return False
    return SequenceMatcher(None," ".join(a)," ".join(b)).ratio()>=0.66 or (model and all(x in b for x in model[:2]))

def is_21vek(url):
    try:
        p=urlparse(url)
        host=(p.hostname or "").lower()
        return p.scheme=="https" and (host in MEDIA_DOMAINS or host.endswith(".21vek.by"))
    except Exception:return False

def candidate_urls(value):
    out=[]
    def walk(v,depth=0):
        if depth>6:return
        if isinstance(v,dict):
            for key in ("fullSize","original","originalUrl","large","image","imageUrl","src","url","path","file","medium","preview","miniature","photo"):
                if key in v:walk(v[key],depth+1)
            for key,val in v.items():
                if key not in {"fullSize","original","originalUrl","large","image","imageUrl","src","url","path","file","medium","preview","miniature","photo"}:walk(val,depth+1)
        elif isinstance(v,list):
            for item in v[:25]:walk(item,depth+1)
        elif isinstance(v,str):
            v=v.strip()
            if not v or v.startswith("data:"):return
            if v.startswith("//"):u="https:"+v
            elif v.startswith("/"):u=urljoin("https://www.21vek.by",v)
            else:u=v
            if is_21vek(u) and u not in out:out.append(u)
    walk(value)
    return out[:45]

def public_live_facts(fd):
    """Only general attributes of the exact current 21vek product, never variant models."""
    facts=[];used=set()
    for group in (fd.get("attributes") or [])[:8]:
        for entry in (group.get("groupItems") or [])[:35]:
            if not isinstance(entry,dict):continue
            label=str(entry.get("label") or entry.get("name") or "").strip()
            value=entry.get("value")
            if not label or not isinstance(value,(str,int,float)) or isinstance(value,bool):continue
            value=str(value).strip()
            if not value or len(value)>75 or len(label)>65 or value.lower() in ("нет","не указано","неизвестно","-","—","n/a"):
                continue
            key=label.lower()
            if key in used:continue
            used.add(key)
            facts.append({"id":"F"+str(len(facts)+1),"key":"live_"+str(len(facts)+1),
                "label":label,"value":value,"source":"Публичные характеристики точной карточки 21vek"})
            if len(facts)>=22:return facts
    return facts

def fetch_photo(item):
    source=str(item["product_url"])
    if not public_product_url(source):raise RuntimeError("Небезопасная или неканоническая ссылка 21vek")
    r=request("GET",source,headers={"User-Agent":UA,"Accept":"text/html","Accept-Language":"ru-RU"},timeout=28)
    if r.status_code!=200:raise RuntimeError("Карточка 21vek HTTP "+str(r.status_code))
    state=next_state(r.text)
    fd=(state.get("productCard") or {}).get("fullProductData") or {}
    name=str(fd.get("name") or "").strip()
    if not model_matches(item["product_name"],name):
        raise RuntimeError("Модель на 21vek отличается от выбранного SKU — фото заблокировано")
    live_facts=public_live_facts(fd)
    gallery=fd.get("gallery") or []
    valid=[x for x in gallery if isinstance(x,dict) and str(x.get("type") or "image").lower()=="image"]
    urls=candidate_urls(valid)
    soup=BeautifulSoup(r.text,"html.parser")
    for prop in ("og:image","twitter:image"):
        node=soup.find("meta",attrs={"property":prop}) or soup.find("meta",attrs={"name":prop})
        if node:
            for u in candidate_urls(node.get("content","")):
                if u not in urls:urls.append(u)
    if not urls:raise RuntimeError("В галерее 21vek нет доступной ссылки на фото")
    last_error=""
    for u in urls[:12]:
        try:
            pic=request("GET",u,headers={"User-Agent":UA,"Accept":"image/avif,image/webp,image/png,image/jpeg"},timeout=30,stream=True)
            if pic.status_code!=200:
                last_error="изображение HTTP "+str(pic.status_code);pic.close();continue
            size=0;buf=io.BytesIO()
            for chunk in pic.iter_content(65536):
                size+=len(chunk)
                if size>PHOTO_BYTES:raise RuntimeError("Фото превышает 12 МБ")
                buf.write(chunk)
            pic.close();buf.seek(0)
            image=Image.open(buf)
            image=ImageOps.exif_transpose(image)
            if image.width<450 or image.height<450:
                last_error="слишком маленькое фото";continue
            if image.width/image.height>3 or image.height/image.width>3:
                last_error="неподходящие пропорции фото";continue
            image.thumbnail((1200,1200),Image.Resampling.LANCZOS)
            return image.convert("RGBA"),u,name,live_facts
        except (requests.RequestException,UnidentifiedImageError,OSError,ValueError,RuntimeError) as e:
            last_error=str(e)[:150]
    raise RuntimeError("Не удалось получить качественное фото нужной модели: "+last_error)

def worker_plan(item_id,live_facts):
    resp=request("POST",EDGE,headers=headers(True),json={"action":"worker-plan","item_id":item_id,"live_facts":live_facts},timeout=110)
    if resp.status_code in (401,403):
        raise PermissionError("Ключ доступа к генератору не совпадает с серверным service-role")
    if resp.status_code!=200:
        raise RuntimeError("ИИ "+str(resp.status_code)+": "+resp.text[:260])
    data=resp.json()
    if not data.get("ok"):raise RuntimeError("ИИ: "+str(data.get("message") or data.get("error")))
    return data

def font(size,bold=False):
    names=["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
           "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"] if bold else [
           "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
           "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"]
    for filename in names:
        try:return ImageFont.truetype(filename,size)
        except OSError:pass
    return ImageFont.load_default()

def lines(draw,message,f,width,limit=3):
    words=str(message or "").split()
    ret=[];line=""
    for word in words:
        cand=(line+" "+word).strip()
        if draw.textbbox((0,0),cand,font=f)[2]>width and line:
            ret.append(line);line=word
        else:line=cand
    if line:ret.append(line)
    if len(ret)>limit:
        ret=ret[:limit]
        while draw.textbbox((0,0),ret[-1]+"…",font=f)[2]>width and len(ret[-1])>1:
            ret[-1]=ret[-1][:-1]
        ret[-1]+="…"
    return ret

def color_for(name):
    n=str(name).lower()
    if "huter" in n:return ((229,160,20),(24,35,49),(255,248,230),"HUTER")
    if "вихр" in n:return ((206,42,52),(20,42,61),(255,245,244),"ВИХРЬ")
    if "eurolux" in n:return ((35,104,197),(21,35,54),(241,247,255),"EUROLUX")
    return ((212,42,52),(20,42,61),(254,245,246),"РЕСАНТА")

def draw_png(photo,plan,slide):
    W,H=1200,1500
    name=plan["product"]["product_name"]
    accent,dark,bg,brand=color_for(name)
    im=Image.new("RGB",(W,H),bg)
    d=ImageDraw.Draw(im)
    d.rectangle([0,0,W,150],fill=accent)
    d.text((70,43),brand,fill="white",font=font(54,True))
    d.text((W-190,51),"21vek",fill="white",font=font(36,True))
    concept=next((x for x in plan["design"].get("concepts",[]) if x.get("key")=="rational"),{})
    title=concept.get("headline") if slide["number"]==1 else slide.get("title")
    title=str(title or "Особенности товара")
    p=font(62 if len(title)<60 else 50,True)
    for i,line in enumerate(lines(d,title,p,1045,3)):
        d.text((72,215+i*79),line,fill=dark,font=p)
    subtitle=slide.get("subtitle") or ""
    small=font(27)
    for i,line in enumerate(lines(d,subtitle,small,1020,2)):
        d.text((72,455+i*37),line,fill=(89,101,116),font=small)
    # Original exact-SKU product photography, no generative alteration of the product.
    white=Image.new("RGB",(1040,610),"white")
    orig=photo.copy()
    orig.thumbnail((990,575),Image.Resampling.LANCZOS)
    ox=(1040-orig.width)//2;oy=(610-orig.height)//2
    if orig.mode=="RGBA":
        white.paste(orig,(ox,oy),orig)
    else:white.paste(orig,(ox,oy))
    im.paste(white,(80,540))
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((67,1193,1133,1400),radius=20,fill="white",outline=(221,227,234),width=2)
    facts={x["id"]:x for x in plan.get("facts",[])}
    selected=[facts.get(k) for k in slide.get("fact_ids",[]) if k in facts][:3]
    if not selected:selected=list(facts.values())[:2]
    segments=max(1,len(selected));cell=1030//segments
    for i,fact in enumerate(selected):
        x=87+i*cell
        d.text((x,1232),str(fact["label"])[:24],fill=(105,114,130),font=font(21))
        vf=font(31,True)
        shown=lines(d,str(fact["value"]),vf,cell-35,2)
        for j,line in enumerate(shown):
            d.text((x,1282+j*35),line,fill=dark,font=vf)
        if i<segments-1:d.line((x+cell-14,1230,x+cell-14,1365),fill=(221,227,234),width=2)
    d.rectangle((0,1450,1200,1500),fill=dark)
    d.text((65,1458),"Артикул: "+str(plan["product"]["sku"]),fill="white",font=font(22))
    d.text((1030,1458),str(slide["number"])+"/7",fill="white",font=font(23))
    out=io.BytesIO()
    im.save(out,format="PNG",optimize=True)
    return out.getvalue()

def render_zip(item,plan,photo,source):
    contents=io.BytesIO()
    warnings=list(plan.get("design",{}).get("warnings",[]))
    with zipfile.ZipFile(contents,"w",compression=zipfile.ZIP_STORED,allowZip64=True) as z:
        for i,slide in enumerate(plan.get("design",{}).get("slides",[])[:7],1):
            slide={**slide,"number":i}
            z.writestr(f"slide_{i:02d}.png",draw_png(photo,plan,slide))
        metadata={
            "sku":item["sku"],"name":item["product_name"],"group":item["group_name"],
            "photo_source":source,"product_source":item["product_url"],
            "fact_sources":plan.get("facts",[]),
            "warnings":warnings,
            "manual_review_before_publishing":True,
            "generated_at":datetime.now(timezone.utc).isoformat()
        }
        z.writestr("audit.json",json.dumps(metadata,ensure_ascii=False,indent=2))
    return contents.getvalue(),warnings

def patch_item(item,fields):
    db_update("triovist_infographic_batch_items_v1",{"id":"eq."+item["id"]},{**fields,"updated_at":datetime.now(timezone.utc).isoformat()})

def status(batch_id):
    items=db_get("triovist_infographic_batch_items_v1",{"batch_id":"eq."+batch_id,"select":"id,sku,group_name,status,error_message","limit":"300","order":"group_name.asc,sku.asc"})
    counts={k:sum(i["status"]==k for i in items) for k in ("queued","processing","completed","error")}
    db_update("triovist_infographic_batches_v1",{"id":"eq."+batch_id},{
        "completed_items":counts["completed"],"failed_items":counts["error"],
        "status":"processing","updated_at":datetime.now(timezone.utc).isoformat()
    })
    return items,counts

def finalize(batch,items,counts):
    batch_id=batch["id"]
    if counts["queued"] or counts["processing"]:return
    if counts["completed"]==0:
        db_update("triovist_infographic_batches_v1",{"id":"eq."+batch_id},{
            "status":"failed","error_summary":"Ни один SKU не удалось завершить. Смотрите ошибки каждого товара и проверяйте доступ к фотографиям 21vek.",
            "finished_at":datetime.now(timezone.utc).isoformat(),
            "failed_items":counts["error"],"completed_items":0
        })
        log("FAILED all SKU",batch_id)
        return
    manifest=[];part_number=1;bytes_used=0;count=0
    file=io.BytesIO();out=zipfile.ZipFile(file,"w",compression=zipfile.ZIP_STORED,allowZip64=True)
    def commit():
        nonlocal file,out,part_number,bytes_used,count
        if count<1:return
        out.close()
        path=f"batches/{batch_id}/part_{part_number:03d}.zip"
        storage_put(path,file.getvalue())
        manifest.append({"path":path,"bytes":len(file.getvalue()),"files":count})
        part_number+=1;file=io.BytesIO()
        out=zipfile.ZipFile(file,"w",compression=zipfile.ZIP_STORED,allowZip64=True)
        bytes_used=0;count=0
    failures=[]
    for item in items:
        if item["status"]=="error":
            failures.append({"sku":item["sku"],"group":item["group_name"],"error":item.get("error_message")})
            continue
        if item["status"]!="completed":continue
        saved=f"batches/{batch_id}/items/{safe_name(item['sku'])}.zip"
        try:
            data=storage_get(saved)
            with zipfile.ZipFile(io.BytesIO(data)) as pack:
                for member in pack.namelist():
                    blob=pack.read(member)
                    if bytes_used+len(blob)>PART_BYTES and count>0:commit()
                    path="/".join([safe_name(item["group_name"]),safe_name(item["sku"]),member])
                    out.writestr(path,blob)
                    bytes_used+=len(blob);count+=1
        except Exception as ex:
            failures.append({"sku":item["sku"],"group":item["group_name"],"error":"Не удалось собрать: "+str(ex)[:180]})
    if failures:
        raw=json.dumps({"failed_or_missing_skus":failures,"generated_at":datetime.now(timezone.utc).isoformat()},ensure_ascii=False,indent=2).encode()
        if bytes_used+len(raw)>PART_BYTES and count>0:commit()
        out.writestr("NEEDS_REVIEW.json",raw)
        bytes_used+=len(raw);count+=1
    commit()
    try:out.close()
    except Exception:pass
    if not manifest:
        db_update("triovist_infographic_batches_v1",{"id":"eq."+batch_id},{
            "status":"failed","error_summary":"Все SKU завершились ошибкой или архив не удалось собрать",
            "finished_at":datetime.now(timezone.utc).isoformat()})
        log("finalized with no media",batch_id)
        return
    db_update("triovist_infographic_batches_v1",{"id":"eq."+batch_id},{
        "archive_path":manifest[0]["path"] if len(manifest)==1 else None,
        "archive_manifest":manifest,
        "status":"completed_with_errors" if failures else "completed",
        "error_summary":f"{len(failures)} SKU требуют проверки" if failures else None,
        "finished_at":datetime.now(timezone.utc).isoformat(),
        "updated_at":datetime.now(timezone.utc).isoformat()
    })
    log("completed",batch_id,"parts",len(manifest),"failures",len(failures))

def process(batch):
    bid=batch["id"]
    log("batch",bid,batch.get("groups"))
    if batch["status"]=="queued":
        db_update("triovist_infographic_batches_v1",{"id":"eq."+bid},{"status":"processing","started_at":datetime.now(timezone.utc).isoformat()})
    items,counts=status(bid)
    todo=db_get("triovist_infographic_batch_items_v1",{
        "batch_id":"eq."+bid,"status":"in.(queued,processing)",
        "select":"id,sku,product_name,product_url,group_name,manager_email,status",
        "order":"sku.asc","limit":str(MAX_ITEMS)
    })
    for n,item in enumerate(todo,1):
        if time.monotonic()-START>MAX_SECONDS:
            log("time budget reached",bid,n)
            break
        try:
            patch_item(item,{"status":"processing","error_message":None})
            photo,url,source_name,live_facts=fetch_photo(item)
            # No photo -> no artificially completed infographic. Model must match.
            plan=worker_plan(item["id"],live_facts)
            pack,warnings=render_zip(item,plan,photo,url)
            if len(pack)>48*1024*1024:raise RuntimeError("Комплект SKU слишком велик для хранилища")
            storage_put(f"batches/{bid}/items/{safe_name(item['sku'])}.zip",pack)
            patch_item(item,{"status":"completed","photo_source_url":url,"warnings":warnings})
            log("OK",n,item["sku"],"photo",url[:140],"zip_bytes",len(pack))
        except PermissionError:
            # Systemic credential issue: stop without marking unrelated SKU as corrupt.
            log("WORKER_AUTH_FAILED. Fix GitHub SUPABASE_KEY service-role secret.")
            return
        except Exception as ex:
            msg=str(ex)[:320]
            patch_item(item,{"status":"error","error_message":msg})
            log("ERROR",n,item["sku"],msg)
        time.sleep(0.45)
        items,counts=status(bid)
    items,counts=status(bid)
    finalize(batch,items,counts)

def main():
    jobs=db_get("triovist_infographic_batches_v1",{
        "status":"in.(queued,processing)","select":"id,status,groups,created_at",
        "order":"created_at.asc","limit":"3"
    })
    if not jobs:
        log("no pending infographic batches")
        return
    for job in jobs:
        if time.monotonic()-START>MAX_SECONDS:break
        process(job)

if __name__=="__main__":
    main()
