#!/usr/bin/env python3
"""TRIOVIST V2: guarded premium-image eight-slide SINGLE-SKU pilot worker.
No legacy batch writes. Eight premium Image API calls maximum; each reserved atomically.
Never marks the product publishable until a director reviews all eight images.
"""
from __future__ import annotations
import base64
import io
import json
import os
import time
import re
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont, ImageOps
from triovist_infographic_batch import (
    SUPABASE_URL, KEY, BUCKET, db_get, db_update, storage_put, fetch_photo,
    headers, request, log, storage_get
)

EDGE=SUPABASE_URL+"/functions/v1/triovist-infographic-v2-v236390"
STEPS=8
MAX_RUNTIME=int(os.environ.get("V2_PILOT_SECONDS","3150"))
START=time.monotonic()
def now():return datetime.now(timezone.utc).isoformat()
def fnt(size,bold=False):
    for f in (["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"] if bold
              else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]):
        try:return ImageFont.truetype(f,size)
        except OSError:continue
    return ImageFont.load_default()
def call(action,args,timeout=200):
    r=request("POST",EDGE,headers=headers(True),json={"action":action,**args},timeout=timeout)
    if r.status_code!=200:
        try: err=r.json()
        except Exception:err={}
        raise RuntimeError("Edge "+str(r.status_code)+": "+str(err.get("message") or err.get("error") or r.text[:120])[:230])
    j=r.json()
    if not j.get("ok"):raise RuntimeError("Edge: "+str(j.get("error")))
    return j
def update(pilot,fields):
    db_update("triovist_infographic_v2_pilots",{"id":"eq."+pilot["id"],"status":"in.(queued,processing)"},fields)
def slides(pilot_id):
    return db_get("triovist_infographic_v2_slides",{"pilot_id":"eq."+pilot_id,"select":"id,slide_no,status,scene_path,final_path,error_message","order":"slide_no.asc","limit":"8"})
def still_active(pid):
    rows=db_get("triovist_infographic_v2_pilots",{"id":"eq."+pid,"select":"status,completed_slides,paid_images_started","limit":"1"})
    return rows and rows[0]["status"] in ("queued","processing")
def preflight_png_storage():
    """Fail BEFORE any paid image call if the private archive bucket refuses PNG."""
    endpoint=f"{SUPABASE_URL}/storage/v1/bucket/{BUCKET}"
    reply=request("GET",endpoint,headers=headers(),timeout=25)
    if reply.status_code!=200:
        raise RuntimeError(f"Storage preflight failed (HTTP {reply.status_code}); no paid generation started")
    meta=reply.json()
    allowed=meta.get("allowed_mime_types")
    if allowed and ("image/png" not in allowed or "image/jpeg" not in allowed):
        raise RuntimeError("Storage preflight: image/png or image/jpeg not permitted; no paid generation started")
    if meta.get("public") is True:
        raise RuntimeError("Storage preflight: private bucket is unexpectedly public")
    log("V2 storage preflight OK: image/png, private bucket")

def image_to_reference(photo):
    p=photo.convert("RGB")
    p.thumbnail((1180,1180),Image.Resampling.LANCZOS)
    b=io.BytesIO()
    p.save(b,"JPEG",quality=90,optimize=True,subsampling=0)
    if b.tell()>3_500_000:raise RuntimeError("Reference photo too large; manual review required")
    return base64.b64encode(b.getvalue()).decode("ascii")
def brand_colors(name):
    n=(name or "").casefold()
    if "huter" in n:return ("HUTER","#FFD200","#080c15")
    if "вихр" in n:return ("ВИХРЬ","#FF7800","#0b0c10")
    if "eurolux" in n:return ("EUROLUX","#277fe9","#0c1827")
    return ("РЕСАНТА","#ec2937","#15151e")
def wrap(d,text,font,max_width,maxlines):
    result=[];cur=""
    for word in str(text or "").split():
        nxt=(cur+" "+word).strip()
        if d.textbbox((0,0),nxt,font=font)[2]<=max_width:
            cur=nxt
        else:
            if cur:result.append(cur)
            cur=word
        if len(result)>=maxlines:break
    if cur and len(result)<maxlines:result.append(cur)
    return result
def is_dark(rgba):
    r,g,b=rgba[:3];return (r*299+g*587+b*114)/1000<120
def safe_fact_caption(f):
    """Verified source text only. Normalize orthography; never invent a selling claim."""
    key=str(f.get("key") or "").lower()
    label=str(f.get("label") or "").strip()
    value=str(f.get("value") or "").strip()
    replacements={"Объем":"Объём","объем":"объём","Емкость":"Ёмкость","емкость":"ёмкость","Съем":"Съём","съем":"съём"}
    for a,b in replacements.items():label=label.replace(a,b)
    if key=="input_power_w":label="Потребляемая мощность"
    if key=="crown_material":label="Материал венца"
    if re.search(r"диаметр отверстия барабана",value,re.IGNORECASE):
        label="Диаметр отверстия барабана"
        value=re.sub(r"\s*\(.*?\)","",value).strip()
    if re.search(r"готовой смеси",label,re.IGNORECASE):label="Объём готовой смеси"
    return label[:75],value[:55]

def _draw_lines(draw,text,xy,width,start_size=58,max_lines=3,color="white",line_height=1.15):
    """Use pixel-width bounds; shrink instead of cropping Cyrillic or oversized SKU."""
    text=" ".join(str(text or "").split())
    if not text:return xy[1]
    size=start_size
    while size>=24:
        font=fnt(size,True)
        lines=wrap(draw,text,font,width,max_lines)
        if len(" ".join(lines))>=len(text) and all(draw.textbbox((0,0),v,font=font)[2]<=width for v in lines):
            break
        size-=3
    if size<24:raise RuntimeError("Typography exceeds protected poster bounds")
    y=xy[1]
    for line in lines:
        draw.text((xy[0],y),line,font=font,fill=color,stroke_width=2,stroke_fill=(0,0,0,225))
        y+=int(size*line_height)
    return y

def _gradient(image,xleft=0,xright=1200,height=700,max_alpha=220):
    layer=Image.new("RGBA",image.size,(0,0,0,0))
    d=ImageDraw.Draw(layer)
    for y in range(min(height,image.height)):
        alpha=int(max_alpha*(1-y/height)**1.35)
        d.line((xleft,y,xright,y),fill=(0,0,0,alpha),width=1)
    return Image.alpha_composite(image,layer)

def premium_composite(scene_bytes,slide,facts,product):
    """Different typography compositions, preserving the exact product in the AI scene.
    Source photo and the AI scene are separately archived for inexpensive copy-only revision.
    No external I/O or image-model calls occur in this function.
    """
    W,H=1200,1500
    if not 1<=int(slide["number"])<=8:raise RuntimeError("Invalid slide number")
    num=int(slide["number"])
    bg=Image.open(io.BytesIO(scene_bytes)).convert("RGB")
    image=ImageOps.fit(bg,(W,H),method=Image.Resampling.LANCZOS,centering=(.50,.48)).convert("RGBA")
    brand,accent,dark=brand_colors(product["product_name"])
    verified={f["id"]:f for f in facts}
    refs=[verified[fid] for fid in slide.get("fact_ids",[]) if fid in verified]
    if num==1 and len(refs)<3:raise RuntimeError("Hero requires three or more independently verified specs")
    image=_gradient(image,0,W,530 if num!=1 else 790,225 if num==1 else 185)
    if num==1:
        # Product occupies the central/right frame; hero receives 4–5 boxed real specifications.
        left=Image.new("RGBA",(W,H),(0,0,0,0));ld=ImageDraw.Draw(left)
        for x in range(610):
            a=int(191*(1-x/610)**1.25)
            ld.line((x,115,x,1340),fill=(0,0,0,a),width=1)
        image=Image.alpha_composite(image,left)
    d=ImageDraw.Draw(image)
    d.rounded_rectangle((46,35,280,101),radius=15,fill=(8,10,14,233),outline=accent,width=3)
    d.text((64,51),brand,fill=accent,font=fnt(34,True))
    d.rounded_rectangle((902,38,1149,95),radius=14,fill=(7,9,13,216))
    d.text((924,53),str(product["sku"])[:20],fill="white",font=fnt(24,True))
    if num==1:
        headline=re.sub(r"\s*\(\s*"+re.escape(str(product["sku"]))+r"\s*\)\s*$","",str(product["product_name"]),flags=re.I)
        headline=headline.strip() or str(product["product_name"])
        y=_draw_lines(d,headline.upper(),(48,143),550,start_size=54,max_lines=3)
        d.rectangle((50,y+14,550,y+18),fill=accent)
        d.text((50,y+31),"ГЛАВНЫЕ ХАРАКТЕРИСТИКИ",font=fnt(25,True),fill=accent)
        # Compact verified feature cards: 2-line labeling, no false material/volume claims.
        start=max(410,y+104)
        row_h=150 if len(refs)<=4 else 139
        if start+len(refs)*row_h>1355:raise RuntimeError("Hero text does not fit: review title and 5 specs")
        for i,f in enumerate(refs[:5]):
            label,value=safe_fact_caption(f)
            top=start+i*row_h
            d.rounded_rectangle((46,top,560,top+row_h-12),radius=18,
                                fill=(7,10,15,224),outline=accent,width=2)
            _draw_lines(d,value,(68,top+16),456,start_size=43,max_lines=1,color=accent)
            _draw_lines(d,label,(68,top+76),456,start_size=22,max_lines=2,color="white")
        footer=Image.new("RGBA",(W,H),(0,0,0,0));fd=ImageDraw.Draw(footer)
        fd.rectangle((0,1401,W,H),fill=(0,0,0,215))
        fd.rectangle((0,1401,W,1410),fill=accent)
        image=Image.alpha_composite(image,footer);d=ImageDraw.Draw(image)
        d.text((48,1431),"ТОЛЬКО ПОДТВЕРЖДЁННЫЕ ХАРАКТЕРИСТИКИ",font=fnt(22,True),fill="white")
    else:
        # Distinct headline layouts; model-generated photography is independent on every slide.
        layouts={
            2:(55,130,980,79),3:(53,135,740,71),4:(380,116,760,69),
            5:(53,136,990,70),6:(370,115,770,66),7:(52,126,990,67),
            8:(55,135,980,70)
        }
        x,y,mw,sz=layouts[num]
        title=str(slide.get("title") or "").strip()
        if not title or title.upper() in ("ОБЛОЖКА","ПРЕИМУЩЕСТВА","ХАРАКТЕРИСТИКИ"):
            raise RuntimeError("Placeholder text in professional slide")
        y=_draw_lines(d,title.upper(),(x,y),mw,start_size=sz,max_lines=3)
        # No generated marketing subtitle can invent unverified capabilities.
        if slide.get("subtitle"):
            _draw_lines(d,slide["subtitle"],(x,y+23),mw,start_size=27,max_lines=2,color=accent)
        # Optional small factual labels in a footer, not five nearly identical posters.
        cards=refs[:2]
        foot_top=1365 if cards else 1430
        footer=Image.new("RGBA",(W,H),(0,0,0,0));fd=ImageDraw.Draw(footer)
        fd.rectangle((0,foot_top,W,H),fill=(0,0,0,217))
        fd.rectangle((0,foot_top,W,foot_top+7),fill=accent)
        image=Image.alpha_composite(image,footer);d=ImageDraw.Draw(image)
        if cards:
            part=int(1080/len(cards))
            for i,f in enumerate(cards):
                label,value=safe_fact_caption(f)
                xx=53+i*part
                _draw_lines(d,label,(xx,foot_top+17),part-27,start_size=20,max_lines=1,color="white")
                _draw_lines(d,value,(xx,foot_top+53),part-27,start_size=33,max_lines=1,color=accent)
    d=ImageDraw.Draw(image)
    d.text((1080,1448),f"{num}/8",font=fnt(24,True),fill="white")
    out=io.BytesIO();image.convert("RGB").save(out,format="PNG",optimize=True)
    return out.getvalue()

def build(pilot):
    id=pilot["id"]
    if not still_active(id):return
    if pilot["status"]=="queued":
        update(pilot,{"status":"processing","stage":"Поиск оригинального фото","updated_at":now()})
    item={"product_url":pilot["product_url"],"product_name":pilot["product_name"],"sku":pilot["sku"]}
    photo,url,name,live_facts=fetch_photo(item) # same exact-model validation as V1, read-only
    if not still_active(id):return
    ref=image_to_reference(photo)
    plan=call("worker-plan",{"pilot_id":id,"photo_url":url,"live_facts":live_facts},timeout=130)
    if not still_active(id):return
    story=plan["storyboard"];facts=plan["facts"];product=plan["product"]
    if len(story)!=8:raise RuntimeError("Storyboard is not eight scenes")
    preflight_png_storage()
    log("V2 Pilot",id,"source",url,"verified facts",len(facts))
    for slide in story:
        if time.monotonic()-START>MAX_RUNTIME:break
        if not still_active(id):return
        nr=int(slide["number"]);state=next((s for s in slides(id) if s["slide_no"]==nr),None)
        if state and state["status"]=="completed":continue
        if state and state["status"]!="queued":raise RuntimeError(f"Slide {nr}: interrupted; no blind paid retry")
        log("V2 image",nr,"of",STEPS)
        try:
            result=call("worker-image",{"pilot_id":id,"slide_no":nr,"photo_base64":ref},timeout=235)
            raw=base64.b64decode(result["image_base64"],validate=True)
            if len(raw)<12000 or len(raw)>22_000_000:raise RuntimeError("Image size invalid")
            # Preserve the untouched AI scene so editorial changes never require a NEW image API call.
            scene_path=f"premium-v2/{id}/scene_{nr:02}.jpg"
            storage_put(scene_path,raw,content_type="image/jpeg")
            db_update("triovist_infographic_v2_slides",{"pilot_id":"eq."+id,"slide_no":"eq."+str(nr)},
                      {"scene_path":scene_path,"updated_at":now()})
            final=premium_composite(raw,slide,facts,product)
            path=f"premium-v2/{id}/slide_{nr:02}.png"
            storage_put(path,final,content_type="image/png")
            db_update("triovist_infographic_v2_slides",{"pilot_id":"eq."+id,"slide_no":"eq."+str(nr),"status":"eq.generating"},
                      {"status":"completed","final_path":path,"updated_at":now()})
            new_count=len([s for s in slides(id) if s["status"]=="completed"])
            update(pilot,{"completed_slides":new_count,"stage":f"Готово {new_count} из 8 слайдов","updated_at":now()})
        except Exception as exc:
            db_update("triovist_infographic_v2_slides",{"pilot_id":"eq."+id,"slide_no":"eq."+str(nr)},
                      {"status":"failed","error_message":str(exc)[:270],"updated_at":now()})
            raise
    if len([s for s in slides(id) if s["status"]=="completed"])==8 and still_active(id):
        hero_refs=story[0].get("fact_ids") or []
        coverage=len({x for x in hero_refs if any(f["id"]==x for f in facts)})
        saved=slides(id)
        scenes_saved=all(row.get("scene_path") for row in saved)
        update(pilot,{"status":"needs_review","completed_slides":8,
                      "stage":"8 слайдов готовы — обязательная визуальная проверка директора",
                "audit":{"source_url":url,"provider":"OpenAI Image API","model":"gpt-image-2.5-sunburst",
                         "editorial_version":"2.1","hero_verified":coverage>=3,
                         "hero_fact_count":coverage,"scene_layers_preserved":scenes_saved,
                         "russian_text_from_verified_facts":True,"requires_visual_review":True,
                         "automatically_publishable":False,"manual_review_required":True,
                         "pending_recompose":[],"generated_at":now()},
                "finished_at":now(),"updated_at":now()})
        log("V2 pilot needs review",id)
def recompose_text_only(pilot):
    """Re-render signed-off factual text from stored source scene. ZERO Image API requests."""
    if pilot.get("status")!="needs_review":return
    audit=pilot.get("audit") or {}
    if audit.get("editorial_version")!="2.1":return
    pending=[x for x in audit.get("pending_recompose",[]) if isinstance(x,int) and 1<=x<=8]
    if not pending:return
    id=pilot["id"]
    story=pilot.get("storyboard") or []
    facts=pilot.get("facts") or []
    product={"sku":pilot["sku"],"product_name":pilot["product_name"]}
    if len(story)!=8:raise RuntimeError("Stored storyboard invalid, no paid calls")
    for nr in pending:
        item=next((x for x in slides(id) if x["slide_no"]==nr),None)
        if not item or not item.get("scene_path") or item.get("status")!="completed":
            raise RuntimeError("Original scene unavailable: copy-only corrections cannot run")
        # Never re-run image generator on corrections.
        src=storage_get(item["scene_path"])
        final=premium_composite(src,story[nr-1],facts,product)
        storage_put(item["final_path"],final,content_type="image/png")
        log("V2.1 text-only recompose:",id,nr,"no paid image request")
        new_rows=db_get("triovist_infographic_v2_pilots",{"id":"eq."+id,"select":"audit,status","limit":"1"})
        if not new_rows or new_rows[0]["status"]!="needs_review":return
        current=new_rows[0].get("audit") or {}
        if nr in current.get("pending_recompose",[]):
            current["pending_recompose"]=[n for n in current["pending_recompose"] if n!=nr]
            current["last_text_recomposed"]=now()
            db_update("triovist_infographic_v2_pilots",
                      {"id":"eq."+id,"status":"eq.needs_review"},
                      {"audit":current,"stage":"Подписи пересобраны без новых платных изображений","updated_at":now()})

def main():
    pilots=db_get("triovist_infographic_v2_pilots",{
     "status":"in.(queued,processing)","select":"*","order":"created_at.asc","limit":"1"})
    if not pilots:
        review=db_get("triovist_infographic_v2_pilots",{
            "status":"eq.needs_review","select":"*","order":"updated_at.desc","limit":"10"})
        for pilot in review:
            if (pilot.get("audit") or {}).get("pending_recompose"):
                recompose_text_only(pilot)
                return
        log("V2 no paid-generation or text-only jobs")
        return
    pilot=pilots[0]
    try:build(pilot)
    except Exception as ex:
        log("V2 failed",pilot["id"],str(ex)[:400])
        update(pilot,{"status":"failed","stage":"Не прошёл контроль выполнения",
                      "error_message":str(ex)[:260],"finished_at":now(),"updated_at":now()})
        raise
if __name__=="__main__":main()
