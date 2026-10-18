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
    min_size=15 if start_size<=28 else 24
    while size>=min_size:
        font=fnt(size,True)
        lines=wrap(draw,text,font,width,max_lines)
        if len(" ".join(lines))>=len(text) and all(draw.textbbox((0,0),v,font=font)[2]<=width for v in lines):
            break
        size-=3
    if size<min_size:raise RuntimeError("Typography exceeds protected poster bounds")
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
        # EIGHT commercially dense posters: same proof-quality as the approved hero.
        # Every printed technical claim is one of the exact-SKU facts supplied by the API.
        # Left/right layout varies with the distinct cinematic background requested upstream.
        if not 3<=len(refs)<=4:
            raise RuntimeError(f"Slide {num}: need 3-4 independently verified proof facts")
        layout=slide.get("layout") or ("product-left" if num in (4,6,8) else "macro-right")
        panel_on_right=layout=="product-left"
        x0,x1=(630,1155) if panel_on_right else (43,568)
        content_w=x1-x0-44
        matte=Image.new("RGBA",(W,H),(0,0,0,0));md=ImageDraw.Draw(matte)
        # Protected typography surface, without altering the source product photo.
        for dx in range(x0,min(x1+30,W)):
            edge_dist=(x1-dx) if not panel_on_right else (dx-x0)
            alpha=max(0,int(177*min(1,edge_dist/105)))
            md.line((dx,112,dx,1270),fill=(0,0,0,alpha),width=1)
        image=Image.alpha_composite(image,matte);d=ImageDraw.Draw(image)
        title=str(slide.get("title") or "").strip()
        if not title or title.upper() in ("ОБЛОЖКА","ПРЕИМУЩЕСТВА","ХАРАКТЕРИСТИКИ"):
            raise RuntimeError("Generic or missing professional slide title")
        y=_draw_lines(d,title.upper(),(x0+18,135),content_w,start_size=51,max_lines=3)
        if y>395:raise RuntimeError("Title exceeds safe composition zone")
        d.rectangle((x0+18,y+18,x1-28,y+25),fill=accent)
        sub=str(slide.get("subtitle") or "").strip()
        if sub:
            sub_y=_draw_lines(d,sub.upper(),(x0+18,y+47),content_w,start_size=24,max_lines=2,color=accent)
            if sub_y>490:raise RuntimeError("Subtitle overlaps supporting facts")
        # Four evidence cards with strong visual hierarchy, leading number,
        # supporting label and a simple professional icon. Never draw imagined benefits.
        count=len(refs)
        top=504
        row_h=172 if count==4 else 205
        if top+count*row_h>1230:raise RuntimeError("Fact cards exceed verified typography region")
        for n_fact,f in enumerate(refs):
            label,value=safe_fact_caption(f)
            y0=top+n_fact*row_h
            y1=y0+row_h-13
            d.rounded_rectangle((x0,y0,x1,y1),radius=18,fill=(8,11,16,237),outline=accent,width=2)
            # Single spec = visual proof inside a multi-proof slide, never the whole slide.
            circle_x=x0+36
            d.ellipse((circle_x-16,y0+23,circle_x+30,y0+69),outline=accent,width=3,fill=(22,27,31,236))
            d.text((circle_x-2,y0+31),str(n_fact+1),font=fnt(23,True),fill=accent)
            t_x=x0+88
            _draw_lines(d,value,(t_x,y0+16),x1-t_x-15,start_size=42,max_lines=2,color=accent)
            _draw_lines(d,label,(t_x,y0+92),x1-t_x-15,start_size=22,max_lines=2,color="white")
        footer=Image.new("RGBA",(W,H),(0,0,0,0));fd=ImageDraw.Draw(footer)
        fd.rounded_rectangle((27,1306,W-27,1450),radius=20,fill=(6,9,13,237),outline=accent,width=3)
        fd.rectangle((48,1324,58,1420),fill=accent)
        image=Image.alpha_composite(image,footer);d=ImageDraw.Draw(image)
        takeaway=str(slide.get("takeaway") or "").strip()
        if not takeaway:raise RuntimeError("Missing grounded takeaway")
        _draw_lines(d,takeaway.upper(),(82,1345),1030,start_size=35,max_lines=2,color=accent)

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
    # Offline preflight ALL eight typography layouts before consuming the first paid Image API request.
    # Guarantees every page contains 3-4 exact-SKU proof blocks and has no overflow.
    dummy=io.BytesIO()
    Image.new("RGB",(1024,1536),(17,24,31)).save(dummy,format="JPEG",quality=78)
    for draft in story:
        if draft.get("qa_version")!="2.2-proof-first":
            raise RuntimeError("Editor requires V2.2 storyboard; no paid generation started")
        if int(draft.get("number",0))>1 and len(draft.get("fact_ids") or [])<3:
            raise RuntimeError("Slide missing supporting verified facts; no paid generation started")
        premium_composite(dummy.getvalue(),draft,facts,product)
    log("V2 Pilot",id,"source",url,"verified facts",len(facts),"proof-first preflight passed")
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
                         "editorial_version":"2.2","creative_standard":"2.2-proof-first",
                         "all_slide_proofs_verified":all(len(x.get("fact_ids") or [])>=3 for x in story),
                         "visual_editorial_review_required":True,
                         "hero_verified":coverage>=3,
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
    if audit.get("editorial_version") not in ("2.1","2.2"):return
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
