#!/usr/bin/env python3
import json,re,sys,time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE='https://www.21vek.by/'
UA='ResantaCRM-21vekSearchRouteAudit/0.3 (+https://resanta-crm.by)'
HEADERS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml','Accept-Language':'ru-RU,ru;q=0.9'}
TIMEOUT=25

NEEDLES=['search-composer','getSearchResultV3Products','getSearchV3Products','getSearchResultProducts','searchResult','searchProductsCalculated','currentPage','searchId','queryId','clientId','API_GATEWAY','apiGateway']
TARGETS=['getSearchResultV3Products','getSearchResultProducts','getSearchV3Products','searchProductsCalculated','setSearchResultCurrentPage','setSearchResultTerm','setSearchResultSearchId']

def uniq(seq):
    out=[]; seen=set()
    for x in seq:
        if x not in seen:
            seen.add(x); out.append(x)
    return out

def clips(text, needles=NEEDLES, radius=700, maxn=260):
    out=[]; low=text.lower()
    for needle in needles:
        start=0; n=needle.lower()
        while len(out)<maxn:
            i=low.find(n,start)
            if i<0: break
            out.append(text[max(0,i-radius):min(len(text),i+len(n)+radius)])
            start=i+len(n)
    return uniq(out)

def target_windows(text, radius=3600):
    out=[]; low=text.lower()
    for needle in TARGETS:
        start=0; n=needle.lower(); count=0
        while count<18:
            i=low.find(n,start)
            if i<0: break
            out.append({'needle':needle,'text':text[max(0,i-radius):min(len(text),i+len(n)+radius)]})
            start=i+len(n); count+=1
    # de-dupe exact windows
    seen=set(); ded=[]
    for x in out:
        k=x['text']
        if k not in seen:
            seen.add(k); ded.append(x)
    return ded[:120]

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
    try:
        r=s.get(url,timeout=TIMEOUT,allow_redirects=True)
        return {'url':url,'status':r.status_code,'content_type':r.headers.get('content-type'),'text':r.text if r.status_code==200 else r.text[:4000]}
    except Exception as e:
        return {'url':url,'error':str(e),'text':''}

def main(out_path):
    s=requests.Session(); s.headers.update(HEADERS)
    out={'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'robots':{},'homepage':{},'manifest':{},'assets':[]}

    for host in ['https://www.21vek.by/robots.txt','https://gate.21vek.by/robots.txt','https://search.21vek.by/robots.txt']:
        rr=fetch_text(s,host); txt=rr.pop('text','')
        rr['rules']=robots_rules(txt) if rr.get('status')==200 else None
        rr['content']=txt[:22000]
        out['robots'][host]=rr

    home=fetch_text(s,BASE); html=home.pop('text',''); out['homepage'].update(home)
    soup=BeautifulSoup(html,'html.parser')
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
        if m: asset_root=m.group(1); break
    out['homepage']['asset_root']=asset_root

    manifest_text=''
    if build_id:
        mu=f'{asset_root}/_next/static/{build_id}/_buildManifest.js'
        mr=fetch_text(s,mu); manifest_text=mr.pop('text','')
        out['manifest'].update(mr)
        out['manifest']['size']=len(manifest_text)
        out['manifest']['search_clips']=clips(manifest_text,['/search','search-'],400,80)

    search_chunks=[]
    if manifest_text:
        search_chunks += re.findall(r'(static/chunks/pages/search-[A-Za-z0-9_-]+\.js)',manifest_text)
        p=manifest_text.find('"/search"')
        if p>=0:
            near=manifest_text[p:p+3500]
            search_chunks += re.findall(r'"(static/chunks/[^"?]+\.js)"',near)
    search_urls=uniq([f'{asset_root}/_next/{x}' for x in search_chunks])
    out['manifest']['search_asset_urls']=search_urls

    inspect_urls=[]
    for u in next_scripts:
        if '/chunks/pages/_app-' in u or '/chunks/main-' in u:
            inspect_urls.append(u)
    inspect_urls += search_urls
    for u in uniq(inspect_urls):
        a=fetch_text(s,u); text=a.pop('text','')
        if not text: continue
        cs=clips(text)
        tw=target_windows(text)
        paths=uniq(re.findall(r'(?:search-composer|recommendations-composer|product-adviser|locations)/api/[A-Za-z0-9_./?=&:{}-]+',text,re.I))
        if cs or tw or paths or '/pages/search-' in u:
            out['assets'].append({**a,'size':len(text),'service_paths':paths[:180],'clips':cs[:220],'target_windows':tw})
        time.sleep(.15)

    out['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    json.dump(out,open(out_path,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

if __name__=='__main__':
    main(sys.argv[1] if len(sys.argv)>1 else '21vek-search-route-audit.json')
