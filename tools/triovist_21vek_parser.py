#!/usr/bin/env python3
"""Isolated public-page parser prototype for Triovist / 21vek.

Reads canonical public product HTML only. It does NOT call 21vek /api,
search endpoints, auth endpoints, or bypass anti-bot controls.
Output is shadow JSON and is never written to production CRM by this script.
"""
import argparse, json, re, time
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

UA="ResantaCRM-21vekParser/0.1 (+https://resanta-crm.by)"
HEADERS={"User-Agent":UA,"Accept":"text/html,application/xhtml+xml","Accept-Language":"ru-RU,ru;q=0.9"}
TIMEOUT=25

def clean_html(value):
    if not value: return ""
    return re.sub(r"\s+"," ",BeautifulSoup(str(value),"html.parser").get_text(" ",strip=True)).strip()

def public_product_url(url):
    u=urlparse(str(url or ""))
    return u.scheme=="https" and u.netloc in {"www.21vek.by","21vek.by"} and u.path.endswith(".html") and not u.query and not u.fragment

def next_state(html):
    soup=BeautifulSoup(html,"html.parser")
    tag=soup.find("script",id="__NEXT_DATA__")
    if not tag: raise ValueError("__NEXT_DATA__ not found")
    outer=json.loads(tag.string or tag.get_text("",strip=False))
    raw=outer.get("props",{}).get("pageProps",{}).get("initialState")
    if isinstance(raw,str): return json.loads(raw)
    if isinstance(raw,dict): return raw
    raise ValueError("initialState not found")

def as_num(v):
    try: return float(v)
    except Exception: return None

def iso_date(v):
    s=str(v or "")
    m=re.match(r"^(\d{4}-\d{2}-\d{2})",s)
    return m.group(1) if m else None

def parse_product(html,item):
    state=next_state(html)
    pc=state.get("productCard") or {}
    fd=pc.get("fullProductData") or {}
    rd=pc.get("productReviewsData") or {}
    if not fd or not fd.get("code"): raise ValueError("product payload missing")

    prices=fd.get("prices") or {}
    sale_price=as_num(prices.get("salePrice")) or 0
    base_price=as_num(prices.get("price"))
    current_price=sale_price if sale_price>0 else base_price
    discount=as_num(prices.get("discount")) or 0
    percent_discount=as_num(prices.get("percentDiscount")) or 0

    warranty=fd.get("warranty") or {}
    warranty_count=as_num(warranty.get("count")) or 0
    warranty_unit=str(warranty.get("unit") or "")

    gallery=fd.get("gallery") or []
    photos=[x for x in gallery if str(x.get("type") or "").lower()=="image"]
    videos=[x for x in gallery if str(x.get("type") or "").lower()=="video"]

    reviews=rd.get("reviews") or []
    discussions=rd.get("discussions") or []
    latest=max(reviews,key=lambda x:str(x.get("dateTimestamp") or ""),default={})
    negatives=[x for x in reviews if (as_num(x.get("rating")) is not None and as_num(x.get("rating"))<4)]
    unanswered_questions=sum(1 for x in discussions if str(x.get("question") or "").strip() and not str(x.get("answer") or "").strip())

    review_count=int(rd.get("reviewCount") or len(reviews) or 0)
    question_count=int(rd.get("discussionCount") or len(discussions) or 0)
    rating=as_num(rd.get("rating"))
    if review_count==0: rating=None

    description=clean_html(fd.get("descriptionBlock") or fd.get("commonDescription"))
    status=str(fd.get("status") or "").lower()
    in_stock=True if status=="in" else (False if status else None)
    delivery=fd.get("deliveryDays")
    delivery=int(delivery) if isinstance(delivery,(int,float)) else None

    donor=str(fd.get("code") or item.get("donor_article") or "").strip()
    sku=str(item.get("sku") or "").strip()
    key="donor:"+re.sub(r"\s+","",donor) if donor else "url:"+str(item.get("url") or "")

    card={
      "card_key":key,
      "sku":sku,
      "donor_article":donor,
      "product_name":str(fd.get("name") or item.get("name") or "").strip(),
      "category":item.get("category"),
      "subgroup":item.get("subgroup"),
      "product_url":item["url"],
      "price":current_price,
      "description_present":bool(description),
      "warranty_present":warranty_count>0,
      "sale_flag":"SALE" if (sale_price>0 or discount>0 or percent_discount>0 or bool(fd.get("sales"))) else "",
      "keyword":item.get("keyword"),
      "listing_position":None,
      "product_rating":rating,
      "last_review_rating":as_num(latest.get("rating")) if latest else None,
      "review_count":review_count,
      "question_count":question_count,
      "photo_count":len(photos),
      "video_count":len(videos),
      "in_stock":in_stock,
      "delivery_minsk_days":delivery,
      "pickup_minsk_days":None,
      "mdc_value":None,
      "sale_value":current_price if (sale_price>0 or discount>0) else None,
      "negative_reviews":len(negatives),
      # Public SSR exposes review text/rating but no reliable merchant-answer flag.
      # Keep unknown rather than falsely writing zero in production.
      "unanswered_negative_reviews":None,
      "unanswered_questions":unanswered_questions,
      "latest_review_date":iso_date(latest.get("dateTimestamp")) if latest else None,
      "latest_review_text":" | ".join(str(latest.get(k) or "").strip() for k in ("summary","positives","negatives") if str(latest.get(k) or "").strip())[:2000],
      "latest_review_answered":None,
      "hd_available":0,
      "hd_on_site":len(videos),
      "hd_uploadable":0,
      "yt_available":len([x for x in videos if "youtube" in str(x.get("src") or "").lower()]),
      "yt_on_site":len([x for x in videos if "youtube" in str(x.get("src") or "").lower()]),
      "yt_uploadable":0,
      "source_row":None
    }
    extra={
      "brand":(fd.get("producer") or {}).get("name"),
      "base_price":base_price,
      "sale_price":sale_price or None,
      "discount":discount,
      "percent_discount":percent_discount,
      "status_raw":fd.get("status"),
      "warranty":warranty,
      "description_text":description[:5000],
      "gallery":gallery,
      "reviews":reviews,
      "questions":discussions,
      "breadcrumbs":fd.get("breadcrumbs") or [],
      "parser_sources":{
        "core":"public product HTML -> __NEXT_DATA__ -> initialState.productCard",
        "listing":"not_collected",
        "pickup":"not_collected",
        "review_answer_status":"not_reliably_exposed",
        "external_video_candidates":"not_a_21vek_page_field"
      }
    }
    return {"card":card,"extra":extra}

def compare(old,new):
    keys=["price","description_present","warranty_present","product_rating","review_count","question_count","photo_count","video_count","in_stock","delivery_minsk_days"]
    out={}
    for k in keys:
        a=(old or {}).get(k); b=new.get(k)
        out[k]={"paid_parser":a,"own_parser":b,"same":a==b}
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("registry")
    ap.add_argument("output")
    args=ap.parse_args()
    registry=json.load(open(args.registry,encoding="utf-8"))
    ses=requests.Session(); ses.headers.update(HEADERS)
    result={"parser_version":"0.1","mode":"shadow_public_html_only","started_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"items":[]}
    for i,item in enumerate(registry.get("items") or [],1):
        url=item.get("url")
        row={"input":item}
        try:
            if not public_product_url(url): raise ValueError("only canonical public 21vek product URLs without query are allowed")
            r=ses.get(url,timeout=TIMEOUT,allow_redirects=True)
            if r.status_code!=200: raise ValueError(f"HTTP {r.status_code}")
            parsed=parse_product(r.text,item)
            row.update({"ok":True,"http_status":r.status_code,**parsed,"comparison":compare(item.get("old"),parsed["card"])})
        except Exception as e:
            row.update({"ok":False,"error":str(e)[:1000]})
        result["items"].append(row)
        print(f"[{i}/{len(registry.get('items') or [])}] {item.get('sku')} ok={row.get('ok')} {row.get('error','')}",flush=True)
        time.sleep(1)
    result["finished_at"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    result["summary"]={
      "total":len(result["items"]),
      "ok":sum(1 for x in result["items"] if x.get("ok")),
      "failed":sum(1 for x in result["items"] if not x.get("ok")),
      "production_write_enabled":False
    }
    with open(args.output,"w",encoding="utf-8") as f: json.dump(result,f,ensure_ascii=False,indent=2)
    if result["summary"]["failed"]: raise SystemExit(2)

if __name__=="__main__": main()
