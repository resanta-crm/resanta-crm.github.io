#!/usr/bin/env python3
import json,re,sys,time
from urllib.parse import urljoin,urlparse
import requests
from bs4 import BeautifulSoup

BASE='https://www.21vek.by/'
UA='ResantaCRM-21vekSearchRouteAudit/0.1 (+https://resanta-crm.by)'
HEADERS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml','Accept-Language':'ru-RU,ru;q=0.9'}
TIMEOUT=25
MAX_ASSETS=80
PATTERNS=[
    r'/search[^"\'\\\s)]*', r'/search_sph[^"\'\\\s)]*', r'/api/[^"\'\\\s)]*',
    r'graphql[^"\'\\\s)]*', r'listing[^"\'\\\s)]*', r'suggest[^"\'\\\s)]*',
    r'autocomplete[^"\'\\\s)]*', r'searchQuery', r'queryText', r'searchTerm'
]

def uniq(seq):
    out=[]; seen=set()
    for x in seq:
        if x not in seen:
            seen.add(x); out.append(x)
    return out

def clips(text, needles):
    out=[]
    low=text.lower()
    for needle in needles:
        start=0
        while len(out)<250:
            i=low.find(needle,start)
            if i<0: break
            out.append(text[max(0,i-180):min(len(text),i+320)])
            start=i+len(needle)
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

def main(out_path):
    s=requests.Session(); s.headers.update(HEADERS)
    out={'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'homepage':{},'robots':{},'assets':[],'manifest':{}}

    rr=s.get(urljoin(BASE,'robots.txt'),timeout=TIMEOUT)
    out['robots']={'status':rr.status_code,'rules':robots_rules(rr.text),'content':rr.text[:20000]}

    r=s.get(BASE,timeout=TIMEOUT)
    soup=BeautifulSoup(r.text,'html.parser')
    out['homepage']['status']=r.status_code
    out['homepage']['forms']=[{'action':x.get('action'),'method':x.get('method')} for x in soup.find_all('form')]
    out['homepage']['inputs']=[{'name':x.get('name'),'type':x.get('type'),'placeholder':x.get('placeholder'),'autocomplete':x.get('autocomplete')} for x in soup.find_all('input') if x.get('placeholder') or x.get('name')]
    out['homepage']['search_clips']=clips(r.text,['search','suggest','autocomplete','query'])[:80]

    next_tag=soup.find('script',id='__NEXT_DATA__')
    build_id=None
    if next_tag:
        try:
            next_data=json.loads(next_tag.string or next_tag.get_text('',strip=False))
            build_id=next_data.get('buildId')
            out['homepage']['next_build_id']=build_id
            out['homepage']['next_page']=next_data.get('page')
        except Exception as e:
            out['homepage']['next_error']=str(e)

    scripts=[]
    for tag in soup.find_all('script',src=True):
        u=urljoin(BASE,tag.get('src'))
        p=urlparse(u)
        if p.netloc.endswith('21vek.by') and '/_next/' in p.path:
            scripts.append(u)
    scripts=uniq(scripts)

    if build_id:
        for suffix in ('_buildManifest.js','_ssgManifest.js'):
            u=urljoin(BASE,f'/_next/static/{build_id}/{suffix}')
            try:
                mr=s.get(u,timeout=TIMEOUT)
                out['manifest'][suffix]={'url':u,'status':mr.status_code,'size':len(mr.text),'search_clips':clips(mr.text,['search','suggest','autocomplete'])[:120]}
                if mr.status_code==200:
                    for m in re.findall(r'"([^"?]+\.js)"',mr.text):
                        if '/_next/' in m or m.startswith('static/'):
                            scripts.append(urljoin(BASE,'/_next/'+m.lstrip('/')) if m.startswith('static/') else urljoin(BASE,m))
            except Exception as e:
                out['manifest'][suffix]={'url':u,'error':str(e)}

    scripts=uniq(scripts)[:MAX_ASSETS]
    for idx,u in enumerate(scripts,1):
        try:
            a=s.get(u,timeout=TIMEOUT)
            text=a.text if a.status_code==200 else ''
            hits=[]
            for pat in PATTERNS:
                try:
                    vals=re.findall(pat,text,re.I)
                    if vals:
                        hits.extend(vals[:50])
                except re.error:
                    pass
            c=clips(text,['/search','search_sph','/api/','graphql','suggest','autocomplete','searchquery','querytext','searchterm'])
            if hits or c:
                out['assets'].append({'url':u,'status':a.status_code,'size':len(text),'hits':uniq([str(x) for x in hits])[:100],'clips':c[:100]})
        except Exception as e:
            out['assets'].append({'url':u,'error':str(e)})
        if idx%10==0: print('assets',idx,'/',len(scripts),flush=True)
        time.sleep(0.15)

    out['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    json.dump(out,open(out_path,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

if __name__=='__main__':
    main(sys.argv[1] if len(sys.argv)>1 else '21vek-search-route-audit.json')
