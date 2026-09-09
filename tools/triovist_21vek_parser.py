#!/usr/bin/env python3
"""Isolated public-page parser for Triovist / 21vek.

Approved business scope:
- current/base price, stock, description, warranty;
- photos and videos already present on the 21vek card;
- rating, reviews, negative reviews, unanswered negative reviews;
- latest review/date/rating/answer flag;
- default Minsk deliveryDays (shadow until semantics are confirmed).

Explicitly excluded from the new parser:
questions/answers, SALE/action fields, pickup Minsk, external HD/YouTube
"available/uploadable" video checks.

Reads canonical public product HTML only. It does NOT call 21vek /api,
search endpoints, auth endpoints, or bypass anti-bot controls.
"""
import argparse, json, re, time
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

UA="ResantaCRM-21vekParser/0.5 (+https://resanta-crm.by)"
HEADERS={"User-Agent":UA,"Accept":"text/html,application/xhtml+xml","Accept-Language":"ru-RU,ru;q=0.9"}
TIMEOUT=25


def clean_html(value):
    if not value:
        return ""
    return re.sub(r"\s+"," ",BeautifulSoup(str(value),"html.parser").get_text(" ",strip=True)).strip()


def public_product_url(url):
    u=urlparse(str(url or ""))
    return (
        u.scheme=="https"
        and u.netloc in {"www.21vek.by","21vek.by"}
        and u.path.endswith(".html")
        and not u.query
        and not u.fragment
    )


def next_state(html):
    soup=BeautifulSoup(html,"html.parser")
    tag=soup.find("script",id="__NEXT_DATA__")
    if not tag:
        raise ValueError("__NEXT_DATA__ not found")
    outer=json.loads(tag.string or tag.get_text("",strip=False))
    raw=outer.get("props",{}).get("pageProps",{}).get("initialState")
    if isinstance(raw,str):
        return json.loads(raw)
    if isinstance(raw,dict):
        return raw
    raise ValueError("initialState not found")


def as_num(v):
    try:
        return float(v)
    except Exception:
        return None


def iso_date(v):
    s=str(v or "")
    m=re.match(r"^(\d{4}-\d{2}-\d{2})",s)
    return m.group(1) if m else None


def review_text(review):
    if not review:
        return ""
    parts=[
        str(review.get(k) or "").strip()
        for k in ("summary","positives","negatives")
        if str(review.get(k) or "").strip()
    ]
    return " | ".join(parts)[:2000]


def review_answered(review):
    if not review:
        return None
    return bool(str(review.get("moderatorComment") or "").strip())


def parse_product(html,item):
    state=next_state(html)
    pc=state.get("productCard") or {}
    fd=pc.get("fullProductData") or {}
    rd=pc.get("productReviewsData") or {}
    if not fd or not fd.get("code"):
        raise ValueError("product payload missing")

    prices=fd.get("prices") or {}
    sale_price=as_num(prices.get("salePrice")) or 0
    base_price=as_num(prices.get("price"))
    current_price=sale_price if sale_price>0 else base_price

    warranty=fd.get("warranty") or {}
    warranty_count=as_num(warranty.get("count")) or 0
    warranty_unit=str(warranty.get("unit") or "")

    gallery=fd.get("gallery") or []
    photos=[x for x in gallery if str(x.get("type") or "").lower()=="image"]
    videos=[x for x in gallery if str(x.get("type") or "").lower()=="video"]

    reviews=rd.get("reviews") or []
    latest=max(reviews,key=lambda x:str(x.get("dateTimestamp") or x.get("date") or ""),default={})
    negatives=[
        x for x in reviews
        if as_num(x.get("rating")) is not None and as_num(x.get("rating"))<4
    ]
    unanswered_negatives=[
        x for x in negatives
        if not str(x.get("moderatorComment") or "").strip()
    ]

    review_count=int(rd.get("reviewCount") or len(reviews) or 0)
    rating=as_num(rd.get("rating"))
    if review_count==0:
        rating=None

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
      "product_rating":rating,
      "last_review_rating":as_num(latest.get("rating")) if latest else None,
      "review_count":review_count,
      "photo_count":len(photos),
      "video_count":len(videos),
      "in_stock":in_stock,
      "delivery_minsk_days":delivery,
      "negative_reviews":len(negatives),
      "unanswered_negative_reviews":len(unanswered_negatives),
      "latest_review_date":iso_date(latest.get("dateTimestamp") or latest.get("date")) if latest else None,
      "latest_review_text":review_text(latest),
      "latest_review_answered":review_answered(latest),
      "source_row":None
    }

    extra={
      "brand":(fd.get("producer") or {}).get("name"),
      "base_price":base_price,
      "status_raw":fd.get("status"),
      "warranty":warranty,
      "description_text":description[:5000],
      "gallery":gallery,
      "reviews":reviews,
      "breadcrumbs":fd.get("breadcrumbs") or [],
      "parser_sources":{
        "core":"public product HTML -> __NEXT_DATA__ -> initialState.productCard",
        "review_answer":"moderatorComment present on public 21vek review",
        "listing":"not_collected_separate_module_required",
        "delivery":"deliveryDays_collected_but_business_semantics_not_yet_approved",
        "excluded_scope":[
          "questions_answers",
          "sale_action_fields",
          "pickup_minsk",
          "external_hd_youtube_available_uploadable"
        ]
      }
    }
    return {"card":card,"extra":extra}


def compare(old,new):
    keys=[
        "price","description_present","warranty_present","product_rating",
        "review_count","photo_count","video_count","in_stock","delivery_minsk_days"
    ]
    out={}
    for k in keys:
        a=(old or {}).get(k)
        b=new.get(k)
        out[k]={"paid_parser":a,"own_parser":b,"same":a==b}
    return out


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("registry")
    ap.add_argument("output")
    args=ap.parse_args()
    registry=json.load(open(args.registry,encoding="utf-8"))
    ses=requests.Session()
    ses.headers.update(HEADERS)
    result={
        "parser_version":"0.5",
        "mode":"shadow_public_html_only",
        "started_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
        "items":[]
    }
    for i,item in enumerate(registry.get("items") or [],1):
        url=item.get("url")
        row={"input":item}
        try:
            if not public_product_url(url):
                raise ValueError("only canonical public 21vek product URLs without query are allowed")
            r=ses.get(url,timeout=TIMEOUT,allow_redirects=True)
            if r.status_code!=200:
                raise ValueError(f"HTTP {r.status_code}")
            parsed=parse_product(r.text,item)
            row.update({
                "ok":True,
                "http_status":r.status_code,
                **parsed,
                "comparison":compare(item.get("old"),parsed["card"])
            })
        except Exception as e:
            row.update({"ok":False,"error":str(e)[:1000]})
        result["items"].append(row)
        print(
            f"[{i}/{len(registry.get('items') or [])}] {item.get('sku')} "
            f"ok={row.get('ok')} {row.get('error','')}",
            flush=True
        )
        time.sleep(1)

    result["finished_at"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    result["summary"]={
      "total":len(result["items"]),
      "ok":sum(1 for x in result["items"] if x.get("ok")),
      "failed":sum(1 for x in result["items"] if not x.get("ok")),
      "production_write_enabled":False
    }
    with open(args.output,"w",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
    if result["summary"]["failed"]:
        raise SystemExit(2)


if __name__=="__main__":
    main()
