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
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont, ImageOps
from triovist_infographic_batch import (
    SUPABASE_URL, KEY, BUCKET, db_get, db_update, storage_put, fetch_photo,
    headers, request, log
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
    return db_get("triovist_infographic_v2_slides",{"pilot_id":"eq."+pilot_id,"select":"id,slide_no,status,final_path,error_message","order":"slide_no.asc","limit":"8"})
def still_active(pid):
    rows=db_get("triovist_infographic_v2_pilots",{"id":"eq."+pid,"select":"status,completed_slides,paid_images_started","limit":"1"})
    return rows and rows[0]["status"] in ("queued","processing")
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
def premium_composite(scene_bytes,slide,facts,product):
    W,H=1200,1500
    bg=Image.open(io.BytesIO(scene_bytes)).convert("RGB")
    image=ImageOps.fit(bg,(W,H),method=Image.Resampling.LANCZOS,centering=(.5,.48)).convert("RGBA")
    brand,accent,dark=brand_colors(product["product_name"])
    num=slide["number"]
    # Eight intentionally different layouts; generated photographic scene is unique per slide.
    styles=[
        (55,132,780,"top_left"),(65,120,1010,"top_left"),
        (65,120,1050,"top_left"),(380,108,770,"top_right"),
        (54,115,1100,"top_left"),(340,110,780,"top_right"),
        (65,110,1050,"top_left"),(55,110,1010,"top_left")
    ]
    x,y,mw,layout=styles[num-1]
    if num in (4,6):x=W-mw-55
    # Gradient behind the headline that does not cover the product/scene globally.
    shade=Image.new("RGBA",(W,H),(0,0,0,0));overlay=ImageDraw.Draw(shade)
    for step in range(730):
        a=int(200*(1-step/730)**1.75)
        overlay.line((0,step,W,step),fill=(0,0,0,a),width=1)
    if num in (4,6):
        for step in range(660):
            a=int(105*(1-step/660)**1.4)
            overlay.line((W-step,60,W-step,H-180),fill=(0,0,0,a),width=1)
    image=Image.alpha_composite(image,shade)
    d=ImageDraw.Draw(image)
    # Brand header and actual SKU text supplied programmatically; no generative brand distortion.
    bf=fnt(35,True);sf=fnt(27,True)
    d.rounded_rectangle((52,37,285,100),radius=13,fill=(0,0,0,216),outline=accent,width=3)
    d.text((70,51),brand,fill=accent,font=bf)
    d.rounded_rectangle((915,40,1145,94),radius=12,fill=(0,0,0,215))
    d.text((935,50),str(product["sku"])[:19],font=sf,fill="white")
    title=str(slide.get("title") or slide.get("key") or "Преимущества товара")
    if len(title)>54:size=57
    elif len(title)>32:size=65
    else:size=82
    tf=fnt(size,True)
    lines=wrap(d,title.upper(),tf,mw,min(3,4 if len(title)>40 else 3))
    # Handle long words without printing outside bounds.
    if lines and any(d.textbbox((0,0),line,font=tf)[2]>mw+30 for line in lines):
        tf=fnt(max(39,size-16),True);lines=wrap(d,title.upper(),tf,mw,3)
    t_y=y
    for line in lines:
        d.text((x+3,t_y+4),line,font=tf,fill=(0,0,0,125),stroke_width=2,stroke_fill=(0,0,0,125))
        d.text((x,t_y),line,font=tf,fill="white",stroke_width=1,stroke_fill=(10,10,10,90))
        t_y+=int(tf.size*1.22)
    if slide.get("subtitle"):
        subfont=fnt(30,True)
        for line in wrap(d,slide["subtitle"],subfont,mw,2):
            d.text((x,t_y+10),line,font=subfont,fill=accent,stroke_width=2,stroke_fill=(0,0,0,185))
            t_y+=43
    chosen={f["id"]:f for f in facts}
    cards=[chosen[fid] for fid in slide.get("fact_ids",[]) if fid in chosen][:3]
    # A restrained lower factual ribbon -- legible but not large fake technical blocks.
    foot_top=H-(138 if cards else 70)
    footer=Image.new("RGBA",(W,H),(0,0,0,0));fd=ImageDraw.Draw(footer)
    fd.rectangle((0,foot_top,W,H),fill=(0,0,0,215))
    fd.rectangle((0,foot_top,W,foot_top+8),fill=accent)
    image=Image.alpha_composite(image,footer);d=ImageDraw.Draw(image)
    if cards:
        available=W-108
        step=int(available/len(cards))
        for i,f in enumerate(cards):
            xx=50+i*step
            label=str(f.get("label") or "")[:32]
            value=str(f.get("value") or "")[:30]
            d.text((xx,foot_top+24),label,font=fnt(20),fill="#d1d7de")
            d.text((xx,foot_top+62),value,font=fnt(34,True),fill=accent)
    d.text((50,H-36),"Товар: "+str(product["sku"]),font=fnt(18),fill="#becbd6")
    d.text((1030,H-39),f"{num}/8",font=fnt(25,True),fill="white")
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
        update(pilot,{"status":"needs_review","completed_slides":8,"stage":"8 слайдов готовы — требуется утверждение директора",
                "audit":{"source_url":url,"provider":"OpenAI Image API","model":"gpt-image-2.5-sunburst",
                         "automatically_publishable":False,"manual_review_required":True,"generated_at":now()},
                "finished_at":now(),"updated_at":now()})
        log("V2 pilot needs review",id)
def main():
    pilots=db_get("triovist_infographic_v2_pilots",{
     "status":"in.(queued,processing)","select":"*","order":"created_at.asc","limit":"1"})
    if not pilots:
        log("V2 no active pilots")
        return
    pilot=pilots[0]
    try:build(pilot)
    except Exception as ex:
        log("V2 failed",pilot["id"],str(ex)[:400])
        update(pilot,{"status":"failed","stage":"Не прошёл контроль выполнения",
                      "error_message":str(ex)[:260],"finished_at":now(),"updated_at":now()})
        raise
if __name__=="__main__":main()
