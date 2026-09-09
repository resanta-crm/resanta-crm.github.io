#!/usr/bin/env python3
import json,re,sys,time
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

UA="ResantaCRM-21vekResearch/0.1 (+https://resanta-crm.by)"
HEADERS={"User-Agent":UA,"Accept":"text/html,application/xhtml+xml","Accept-Language":"ru-RU,ru;q=0.9"}
TIMEOUT=25
TERMS=("delivery","pickup","city","region","stock","avail","warehouse","courier","достав","самовывоз","налич")


def next_state(html):
    soup=BeautifulSoup(html,"html.parser")
    tag=soup.find("script",id="__NEXT_DATA__")
    if not tag:
        return soup,None
    outer=json.loads(tag.string or tag.get_text("",strip=False))
    raw=outer.get("props",{}).get("pageProps",{}).get("initialState")
    if isinstance(raw,str):
        raw=json.loads(raw)
    return soup,raw if isinstance(raw,dict) else None


def matching(obj,path="$",out=None,depth=0):
    if out is None: out=[]
    if depth>10 or len(out)>250: return out
    if isinstance(obj,dict):
        for k,v in obj.items():
            p=f"{path}.{k}"
            if any(t in str(k).lower() for t in TERMS):
                if isinstance(v,(str,int,float,bool)) or v is None:
                    out.append({"path":p,"value":v})
                else:
                    out.append({"path":p,"type":type(v).__name__,"size":len(v) if hasattr(v,"__len__") else None})
            matching(v,p,out,depth+1)
    elif isinstance(obj,list):
        for i,v in enumerate(obj[:80]):
            matching(v,f"{path}[{i}]",out,depth+1)
    return out


def text_snippets(soup):
    text=re.sub(r"\s+"," ",soup.get_text(" ",strip=True))
    low=text.lower()
    out=[]
    for term in ("доставка","самовывоз","сегодня","завтра"):
        start=0
        for _ in range(8):
            i=low.find(term,start)
            if i<0: break
            out.append(text[max(0,i-180):min(len(text),i+320)])
            start=i+len(term)
    ded=[]
    for s in out:
        if s not in ded: ded.append(s)
    return ded[:20]


def product_probe(session,item):
    r=session.get(item["url"],timeout=TIMEOUT,allow_redirects=True)
    soup,state=next_state(r.text)
    fd=((state or {}).get("productCard") or {}).get("fullProductData") or {}
    return {
      **item,"status":r.status_code,"final_url":r.url,
      "full_product_keys":sorted(fd.keys()),
      "deliveryDays":fd.get("deliveryDays"),
      "status_raw":fd.get("status"),
      "matching":matching(fd),
      "text_snippets":text_snippets(soup)
    }


def looks_product(d):
    if not isinstance(d,dict): return False
    keys={str(k).lower() for k in d.keys()}
    return bool(keys & {"code","productcode","name","url","link","slug","producturl","href"}) and bool(keys & {"price","prices","code","productcode"})


def list_candidates(obj,path="$",out=None,depth=0):
    if out is None: out=[]
    if depth>12 or len(out)>120: return out
    if isinstance(obj,dict):
        for k,v in obj.items():
            list_candidates(v,f"{path}.{k}",out,depth+1)
    elif isinstance(obj,list):
        dicts=[x for x in obj if isinstance(x,dict)]
        productish=[x for x in dicts if looks_product(x)]
        if len(productish)>=3:
            samples=[]
            for x in productish[:8]:
                samples.append({
                  "keys":sorted(x.keys())[:60],
                  "code":x.get("code") or x.get("productCode") or x.get("id"),
                  "name":x.get("name") or x.get("title"),
                  "url":x.get("url") or x.get("link") or x.get("href") or x.get("productUrl")
                })
            out.append({"path":path,"list_size":len(obj),"productish":len(productish),"samples":samples})
        for i,v in enumerate(obj[:25]):
            list_candidates(v,f"{path}[{i}]",out,depth+1)
    return out


def category_probe(session,item):
    r=session.get(item["url"],timeout=TIMEOUT,allow_redirects=True)
    soup,state=next_state(r.text)
    return {
      **item,"status":r.status_code,"final_url":r.url,
      "next_state_top_keys":sorted((state or {}).keys()),
      "list_candidates":list_candidates(state or {}),
      "matching":matching(state or {}),
      "text_prefix":re.sub(r"\s+"," ",soup.get_text(" ",strip=True))[:2500]
    }


def main():
    src=sys.argv[1]
    outp=sys.argv[2]
    cfg=json.load(open(src,encoding="utf-8"))
    s=requests.Session(); s.headers.update(HEADERS)
    out={"products":[],"categories":[],"started_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
    rr=s.get("https://www.21vek.by/robots.txt",timeout=TIMEOUT)
    out["robots"]={"status":rr.status_code,"content":rr.text[:8000]}
    for x in cfg.get("products",[]):
        print("product",x["label"],flush=True)
        out["products"].append(product_probe(s,x)); time.sleep(1)
    for x in cfg.get("categories",[]):
        print("category",x["label"],flush=True)
        out["categories"].append(category_probe(s,x)); time.sleep(1)
    out["finished_at"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    json.dump(out,open(outp,"w",encoding="utf-8"),ensure_ascii=False,indent=2)


if __name__=="__main__":
    main()
