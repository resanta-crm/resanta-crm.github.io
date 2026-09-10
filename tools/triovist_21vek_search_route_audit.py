#!/usr/bin/env python3
import json,re,sys,time
from urllib.parse import urljoin,urlparse
import requests
from bs4 import BeautifulSoup

BASE='https://www.21vek.by/'
UA='ResantaCRM-21vekSearchRouteAudit/0.2 (+https://resanta-crm.by)'
HEADERS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml','Accept-Language':'ru-RU,ru;q=0.9'}
TIMEOUT=25

NEEDLES=['search-composer','getSearch','searchResult','searchProducts','searchId','term','queryId','filters','products','API_GATEWAY','apiGateway']

def uniq(seq):
    out=[]; seen=set()
    for x in seq:
        if x not in seen:
            seen.add(x); out.append(x)
    return out

def clips(text, needles=NEEDLES, radius=520, maxn=240):
    out=[]; low=text.lower()
    for needle in needles:
        start=0; n=needle.lower()
        while len(out)<maxn:
            i=low.find(n,start)
            if i<0: break
            out.append(text[max(0,i-radius):min(len(text),i+len(n)+radius)])
            start=i+len(n)
    return uniq(out)

def robots_rules(text):
    allows=[]; disallows=[]; active=False
    for raw in text.splitlines():
        line=raw.split('#',1)[0].strip()
        if not line: continue
        k,_,v=line.partition(':'); k=k.strip().lower(); v=v.strip()
        if k=='user-agent': active=(v=='*')
        elif active and k=='allow': allows.append(v)
        elif active and k=='disallow': disallows.append(v)
    return {'allow':allows,'disallow':disallows}

def fetch_text(s,url):
    r=s.get(url,timeout=TIMEOUT,allow_redirects=True)
    return r,r.text if r.status_code==200 else ''

def main(out_path):
    s=requests.Session(); s.headers.update(HEADERS)
    out={'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'robots':{},'homepage':{},'manifest':{},'search_assets':[],'shared_assets':[]}

    rr,rt=fetch_text(s,urljoin(BASE,'robots.txt'))
    out['robots']={'status':rr.status_code,'rules':robots_rules(rt),'content':rt[:22000]}

    r,html=fetch_text(s,BASE)
    soup=BeautifulSoup(html,'html.parser')
    out['homepage']['status']=r.status_code
    out['homepage']['forms']=[{'action':x.get('action'),'method':x.get('method')} for x in soup.find_all('form')]
    out['homepage']['inputs']=[{'name':x.get('name'),'type':x.get('type'),'placeholder':x.get('placeholder'),'autocomplete':x.get('autocomplete')} for x in soup.find_all('input') if x.get('placeholder') or x.get('name')]

    next_data={}; build_id=None
    tag=soup.find('script',id='__NEXT_DATA__')
    if tag:
        try:
            next_data=json.loads(tag.string or tag.get_text('',strip=False))
            build_id=next_data.get('buildId')
            out['homepage']['next_build_id']=build_id
            out['homepage']['next_page']=next_data.get('page')
            out['homepage']['runtimeConfig']=next_data.get('runtimeConfig')
            out['homepage']['assetPrefix']=next_data.get('assetPrefix')
        except Exception as e:
            out['homepage']['next_error']=str(e)

    script_urls=uniq([urljoin(BASE,x.get('src')) for x in soup.find_all('script',src=True)])
    next_scripts=[u for u in script_urls if '/_next/' in u]
    out['homepage']['script_urls']=next_scripts
    asset_root='https://cdn21vek.by/desktop'
    for u in next_scripts:
        m=re.match(r'^(https?://[^/]+(?:/[^/]+)?)/_next/',u)
        if m:
            asset_root=m.group(1); break
    out['homepage']['asset_root']=asset_root

    manifest_text=''
    if build_id:
        mu=f'{asset_root}/_next/static/{build_id}/_buildManifest.js'
        mr,manifest_text=fetch_text(s,mu)
        out['manifest']={'url':mu,'status':mr.status_code,'size':len(manifest_text),'search_clips':clips(manifest_text,['/search','search-'],300,80)}

    search_chunks=[]
    if manifest_text:
        search_chunks += re.findall(r'(static/chunks/pages/search-[A-Za-z0-9_-]+\.js)',manifest_text)
        # Include chunks listed close to the /search route; this catches shared search-only bundles.
        p=manifest_text.find('"/search"')
        if p>=0:
            near=manifest_text[p:p+2600]
            search_chunks += re.findall(r'"(static/chunks/[^"?]+\.js)"',near)
    search_urls=uniq([f'{asset_root}/_next/{x}' for x in search_chunks])
    out['manifest']['search_asset_urls']=search_urls

    # Always inspect shared app bundles because API models are commonly defined there.
    shared=[]
    for u in next_scripts:
        if '/chunks/pages/_app-' in u or '/chunks/main-' in u:
            shared.append(u)
    for u in uniq(shared):
        a,text=fetch_text(s,u)
        cs=clips(text)
        out['shared_assets'].append({'url':u,'status':a.status_code,'size':len(text),'clips':cs[:180]})
        time.sleep(.2)

    for u in search_urls:
        a,text=fetch_text(s,u)
        cs=clips(text)
        paths=uniq(re.findall(r'(?:(?:search-composer|recommendations-composer|product-adviser|locations)/api/[A-Za-z0-9_./?=&:{}-]+)',text,re.I))
        literals=uniq(re.findall(r'"([^"\\]{0,180}(?:search-composer|/search\?|searchId|queryId|term=)[^"\\]{0,220})"',text,re.I))
        out['search_assets'].append({'url':u,'status':a.status_code,'size':len(text),'service_paths':paths[:160],'literals':literals[:160],'clips':cs[:220]})
        time.sleep(.2)

    out['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    json.dump(out,open(out_path,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

if __name__=='__main__':
    main(sys.argv[1] if len(sys.argv)>1 else '21vek-search-route-audit.json')
