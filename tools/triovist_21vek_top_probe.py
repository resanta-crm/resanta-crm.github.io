#!/usr/bin/env python3
import json,sys,time
import requests

URL='https://gate.21vek.by/search-composer/api/v3/products'
QUERY='бензиновый генератор'
UA='ResantaCRM-21vekTopProbe/0.1 (+https://resanta-crm.by)'
BODY={
  'query':QUERY,
  'order':'default',
  'page':1,
  'limit':60,
  'mode':'desktop',
  'searchId':'',
  'filters':[]
}
HEADERS={
  'User-Agent':UA,
  'Accept':'application/json, text/plain, */*',
  'Content-Type':'application/json',
  'Origin':'https://www.21vek.by',
  'Referer':'https://www.21vek.by/'
}

def pick(x):
    keys=['id','code','name','fullName','alias','link','url','producerName','producer','status','price']
    return {k:x.get(k) for k in keys if k in x}

def main(outp):
    out={'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'endpoint':URL,'query':QUERY,'request':BODY}
    try:
        r=requests.post(URL,headers=HEADERS,json=BODY,timeout=30,allow_redirects=True)
        out['status']=r.status_code
        out['content_type']=r.headers.get('content-type')
        out['rate_headers']={k:v for k,v in r.headers.items() if 'rate' in k.lower() or 'retry' in k.lower()}
        if 'json' in (r.headers.get('content-type') or '').lower():
            data=r.json()
            out['response_keys']=sorted(data.keys()) if isinstance(data,dict) else None
            if isinstance(data,dict):
                products=data.get('products') or []
                out['total']=data.get('total')
                out['searchId']=data.get('searchId') or data.get('search_id')
                out['product_count']=len(products)
                out['first_product_keys']=sorted(products[0].keys()) if products and isinstance(products[0],dict) else []
                out['products']=[{'position':i+1,**pick(x)} for i,x in enumerate(products) if isinstance(x,dict)]
                out['meta']={k:v for k,v in data.items() if k not in ('products','filters','categories') and isinstance(v,(str,int,float,bool,type(None),list,dict))}
            else:
                out['response']=data
        else:
            out['text']=r.text[:6000]
    except Exception as e:
        out['error']=repr(e)
    out['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    json.dump(out,open(outp,'w',encoding='utf-8'),ensure_ascii=False,indent=2)

if __name__=='__main__':
    main(sys.argv[1] if len(sys.argv)>1 else '21vek-top-probe.json')
