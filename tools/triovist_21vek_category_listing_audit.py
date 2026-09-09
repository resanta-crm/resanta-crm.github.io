#!/usr/bin/env python3
import json,re,time,sys
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

UA="ResantaCRM-21vekListingAudit/0.2 (+https://resanta-crm.by)"
HEADERS={"User-Agent":UA,"Accept":"text/html,application/xhtml+xml","Accept-Language":"ru-RU,ru;q=0.9"}
TIMEOUT=25

CATEGORIES=[
 ("generators","https://www.21vek.by/generators/"),
 ("voltage_stabilizers","https://www.21vek.by/voltage_stabilizers/"),
 ("rangefinders","https://www.21vek.by/rangefinders/")
]

def state_from_html(html):
    soup=BeautifulSoup(html,"html.parser")
    tag=soup.find("script",id="__NEXT_DATA__")
    if not tag: raise ValueError("__NEXT_DATA__ missing")
    outer=json.loads(tag.string or tag.get_text("",strip=False))
    raw=outer.get("props",{}).get("pageProps",{}).get("initialState")
    if isinstance(raw,str): raw=json.loads(raw)
    if not isinstance(raw,dict): raise ValueError("initialState missing")
    return soup,raw

def summarize(v,depth=0):
    if depth>2: return type(v).__name__
    if isinstance(v,dict):
        out={}
        for k,x in v.items():
            if isinstance(x,(str,int,float,bool)) or x is None:
                out[k]=x
            elif isinstance(x,list):
                out[k]={"type":"list","size":len(x)}
            elif isinstance(x,dict):
                out[k]=summarize(x,depth+1)
        return out
    return v

def product_row(x,pos):
    return {
      "position":pos,
      "code":x.get("code"),
      "fullName":x.get("fullName"),
      "link":x.get("link"),
      "price":x.get("price"),
      "oldPrice":x.get("oldPrice"),
      "status":x.get("status"),
      "rating":x.get("rating"),
      "reviewCount":x.get("reviewCount"),
      "producer":x.get("producer")
    }

def main():
    out={"started_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"categories":[]}
    s=requests.Session(); s.headers.update(HEADERS)
    robots=s.get("https://www.21vek.by/robots.txt",timeout=TIMEOUT)
    out["robots"]={"status":robots.status_code,"content":robots.text[:10000]}
    for label,url in CATEGORIES:
        print("fetch",label,flush=True)
        r=s.get(url,timeout=TIMEOUT,allow_redirects=True)
        soup,state=state_from_html(r.text)
        listing=state.get("listing") or {}
        products=listing.get("products") or []
        anchors=[]
        for a in soup.find_all("a",href=True):
            href=a.get("href")
            txt=re.sub(r"\s+"," ",a.get_text(" ",strip=True))
            low=(href+" "+txt).lower()
            if "page" in low or "показать" in low or "след" in low or "pagination" in low:
                anchors.append({"href":href,"text":txt[:120]})
        seen=[]; ded=[]
        for a in anchors:
            key=(a["href"],a["text"])
            if key not in seen:
                seen.append(key); ded.append(a)
        out["categories"].append({
          "label":label,"url":url,"status":r.status_code,
          "listing_keys":sorted(listing.keys()),
          "listing_summary":summarize({k:v for k,v in listing.items() if k!="products"}),
          "products":[product_row(x,i+1) for i,x in enumerate(products)],
          "pagination_links":ded[:100]
        })
        time.sleep(1)
    out["finished_at"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    json.dump(out,open(sys.argv[1],"w",encoding="utf-8"),ensure_ascii=False,indent=2)

if __name__=="__main__":
    main()
