#!/usr/bin/env python3
import json,sys,time
import requests

URL='https://gate.21vek.by/search-composer/api/v3/products'
QUERY='бензиновый генератор'
UA='ResantaCRM-21vekTopProbe/0.2 (+https://resanta-crm.by)'
HEADERS={
  'User-Agent':UA,
  'Accept':'application/json, text/plain, */*',
  'Content-Type':'application/json',
  'Origin':'https://www.21vek.by',
  'Referer':'https://www.21vek.by/'
}
# Known Resanta/Huter donor ids from the current Triovist registry; old paid positions
# are included only to compare metric continuity, not as a source for the new result.
TARGETS={
  6724891:{'sku':'64/1/56','old_paid_position':34},
  9575555:{'sku':'64/1/132','old_paid_position':53},
  10230664:{'sku':'64/1/149','old_paid_position':55},
  10222117:{'sku':'64/1/148','old_paid_position':160},
  10230663:{'sku':'64/1/146','old_paid_position':186},
  10222122:{'sku':'64/1/147','old_paid_position':284}
}

def body(page,search_id=''):
    return {'query':QUERY,'order':'default','page':page,'limit':60,'mode':'desktop','searchId':search_id,'filters':[]}

def main(outp):
    out={'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'endpoint':URL,'query':QUERY,'pages':[],'targets':TARGETS}
    s=requests.Session(); s.headers.update(HEADERS)
    search_id=''; found={}
    try:
        for page in range(1,5):
            req=body(page,search_id)
            r=s.post(URL,json=req,timeout=30,allow_redirects=True)
            item={'page':page,'status':r.status_code,'request':req,'content_type':r.headers.get('content-type')}
            if r.status_code!=200 or 'json' not in (r.headers.get('content-type') or '').lower():
                item['text']=r.text[:3000]; out['pages'].append(item); break
            data=r.json(); products=data.get('products') or []
            search_id=data.get('searchId') or search_id
            item.update({'searchId':search_id,'total':data.get('total'),'product_count':len(products)})
            matches=[]
            for i,x in enumerate(products):
                try: pid=int(x.get('id'))
                except Exception: continue
                if pid in TARGETS:
                    pos=(page-1)*60+i+1
                    found[str(pid)]={'position':pos,'sku':TARGETS[pid]['sku'],'old_paid_position':TARGETS[pid]['old_paid_position'],'name':x.get('name'),'link':x.get('link')}
                    matches.append(found[str(pid)])
            item['matches']=matches
            out['pages'].append(item)
            if page<4: time.sleep(1.2)
    except Exception as e:
        out['error']=repr(e)
    out['found']=found
    out['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    json.dump(out,open(outp,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

if __name__=='__main__':
    main(sys.argv[1] if len(sys.argv)>1 else '21vek-top-probe.json')
