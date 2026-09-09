#!/usr/bin/env python3
import json, os, re, sys, time
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

UA = "ResantaCRM-21vekAudit/0.1 (+https://resanta-crm.by)"
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
}
TIMEOUT = 25

def safe_text(x, limit=500):
    s = re.sub(r"\\s+", " ", str(x or "")).strip()
    return s[:limit]

def jsonld_summary(soup):
    out=[]
    for tag in soup.find_all("script", attrs={"type":"application/ld+json"}):
        raw=tag.string or tag.get_text(" ", strip=True)
        try:
            data=json.loads(raw)
            objs=data if isinstance(data,list) else [data]
            for obj in objs:
                if isinstance(obj,dict):
                    out.append({
                        "type": obj.get("@type"),
                        "name": safe_text(obj.get("name"),180),
                        "sku": safe_text(obj.get("sku"),120),
                        "mpn": safe_text(obj.get("mpn"),120),
                        "rating": obj.get("aggregateRating"),
                        "offers": obj.get("offers"),
                    })
        except Exception as e:
            out.append({"parse_error": str(e)[:200], "prefix": safe_text(raw,250)})
    return out[:20]

def meta(soup, name=None, prop=None):
    tag = soup.find("meta", attrs={"name":name}) if name else soup.find("meta", attrs={"property":prop})
    return tag.get("content") if tag else None

def walk_matches(obj, path="$", out=None, depth=0):
    if out is None: out=[]
    if depth>14 or len(out)>=160: return out
    terms=("price","review","rating","question","delivery","pickup","warranty","guarantee","description","image","video","stock","avail","sale","discount","city","location")
    if isinstance(obj,dict):
        for k,v in obj.items():
            p=f"{path}.{k}"
            if any(t in str(k).lower() for t in terms):
                if isinstance(v,(str,int,float,bool)) or v is None:
                    out.append({"path":p,"value":safe_text(v,300)})
                elif isinstance(v,(list,dict)):
                    out.append({"path":p,"type":type(v).__name__,"size":len(v)})
            walk_matches(v,p,out,depth+1)
    elif isinstance(obj,list):
        for i,v in enumerate(obj[:20]):
            walk_matches(v,f"{path}[{i}]",out,depth+1)
    return out

def parse_next_data(soup):
    if not soup: return {"present":False}
    tag=soup.find("script",id="__NEXT_DATA__")
    if not tag: return {"present":False}
    raw=tag.string or tag.get_text("",strip=False)
    try:
        data=json.loads(raw)
        return {
            "present":True,
            "bytes":len(raw.encode("utf-8")),
            "top_keys":list(data.keys())[:40] if isinstance(data,dict) else [],
            "matches":walk_matches(data)[:160],
        }
    except Exception as e:
        return {"present":True,"bytes":len(raw.encode("utf-8")),"parse_error":str(e)[:300]}

def probe_url(session, item, save_html_path=None):
    url=item["url"]
    started=time.time()
    try:
        r=session.get(url, timeout=TIMEOUT, allow_redirects=True)
    except Exception as e:
        return {**item, "ok":False, "error":str(e), "elapsed_ms":round((time.time()-started)*1000)}
    html=r.text or ""
    if save_html_path and r.status_code==200:
        os.makedirs(os.path.dirname(save_html_path),exist_ok=True)
        with open(save_html_path,"w",encoding="utf-8") as f:
            f.write(html)
    low=html.lower()
    soup=BeautifulSoup(html, "html.parser") if "html" in (r.headers.get("content-type") or "").lower() else None
    scripts=[]
    if soup:
        for s in soup.find_all("script"):
            src=s.get("src")
            if src:
                scripts.append(src)
    script_hosts=sorted({urlparse(x).netloc for x in scripts if urlparse(x).netloc})
    title=safe_text(soup.title.get_text(" ",strip=True),300) if soup and soup.title else ""
    structured = jsonld_summary(soup) if soup else []
    text = safe_text(soup.get_text(" ", strip=True), 5000) if soup else ""
    markers={}
    for k,patterns in {
        "captcha":["captcha","капча","проверка, что вы не робот","подтвердите, что вы человек"],
        "reviews":["отзыв","reviews","reviewcount","aggregaterating"],
        "questions":["вопрос","questions","question"],
        "price":["price","цена","byn"],
        "availability":["налич","availability","instock","outofstock"],
        "delivery":["достав","delivery","самовывоз","pickup"],
        "next_data":["__next_data__"],
        "nuxt":["__nuxt__"],
        "initial_state":["initial_state","initialstate"],
    }.items():
        markers[k]=any(p in low for p in patterns)
    result={
        **item,
        "ok": r.status_code==200 and len(html)>1000,
        "status": r.status_code,
        "final_url": r.url,
        "content_type": r.headers.get("content-type"),
        "content_length": len(r.content or b""),
        "elapsed_ms": round((time.time()-started)*1000),
        "title": title,
        "meta_description": meta(soup,name="description") if soup else None,
        "og_title": meta(soup,prop="og:title") if soup else None,
        "og_description": meta(soup,prop="og:description") if soup else None,
        "og_image": meta(soup,prop="og:image") if soup else None,
        "jsonld": structured,
        "next_data": parse_next_data(soup),
        "script_count": len(scripts),
        "script_hosts": script_hosts[:30],
        "markers": markers,
        "text_prefix": text[:1400],
        "response_headers": {
            k:v for k,v in r.headers.items()
            if k.lower() in ("server","cache-control","content-language","x-powered-by","via","cf-ray")
        },
    }
    return result

def main():
    src=sys.argv[1] if len(sys.argv)>1 else "data/triovist_21vek_probe_urls.json"
    outp=sys.argv[2] if len(sys.argv)>2 else "probe-result.json"
    data=json.load(open(src,encoding="utf-8"))
    session=requests.Session()
    session.headers.update(HEADERS)
    result={"user_agent":UA,"started_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"robots":None,"items":[]}
    try:
        rr=session.get("https://www.21vek.by/robots.txt",timeout=TIMEOUT)
        result["robots"]={"status":rr.status_code,"content":rr.text[:5000]}
    except Exception as e:
        result["robots"]={"error":str(e)}
    for idx,item in enumerate(data["items"],1):
        print(f"[{idx}/{len(data['items'])}] {item['sku']} {item['url']}", flush=True)
        save_path=f"probe-html/{item['sku'].replace('/','_')}.html"
        x=probe_url(session,item,save_path)
        print(json.dumps({k:x.get(k) for k in ("sku","status","content_length","title","markers","error")},ensure_ascii=False),flush=True)
        result["items"].append(x)
        time.sleep(1.0)
    result["finished_at"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    with open(outp,"w",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
    ok=sum(1 for x in result["items"] if x.get("ok"))
    print(f"Probe complete: {ok}/{len(result['items'])} usable HTML pages",flush=True)

if __name__=="__main__":
    main()
