#!/usr/bin/env python3
"""Shadow-only keyword TOP collector for Triovist / 21vek.

Reads the current keyword + donor registry from triovist_content_cards, queries
21vek search-composer in the same 60-item desktop ranking used by the public
frontend, and writes only triovist_21vek_top_* shadow tables.

Safety:
- never writes triovist_content_* or CRM UI/business tables;
- no CAPTCHA/auth bypass and no cookie reuse;
- one search request serves every Resanta card sharing that keyword;
- HTTP 429 is respected; unknown values stay null, never fake zero;
- TOP30/TOP60 are definitive from page 1; deeper exact positions are optional.
"""
from __future__ import annotations

import hashlib
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import requests

SUPABASE_URL=os.environ['SUPABASE_URL'].strip().rstrip('/')
SUPABASE_KEY=os.environ['SUPABASE_KEY'].strip()
KEYWORD_LIMIT=max(1,int(os.environ.get('TOP_KEYWORD_LIMIT','500')))
KEYWORD_OFFSET=max(0,int(os.environ.get('TOP_KEYWORD_OFFSET','0')))
DELAY=max(0.05,float(os.environ.get('TOP_DELAY_SECONDS','0.18')))
WORKERS=max(1,min(16,int(os.environ.get('TOP_WORKERS','10'))))
TIMEOUT=max(10,int(os.environ.get('TOP_HTTP_TIMEOUT','30')))
DEEP_EXACT=os.environ.get('TOP_DEEP_EXACT','0').strip().lower() not in ('0','false','no')
DEEP_RADIUS=max(0,min(4,int(os.environ.get('TOP_DEEP_RADIUS','2'))))
MAX_DEEP_PAGES=max(0,min(20,int(os.environ.get('TOP_MAX_DEEP_PAGES_PER_KEYWORD','10'))))
PARSER_VERSION='top-shadow-v0.3'
ENDPOINT='https://gate.21vek.by/search-composer/api/v3/products'
UA='ResantaCRM-21vekTopShadow/0.3 (+https://resanta-crm.by)'


def api_headers(json_body: bool=False, prefer: str|None=None) -> dict[str,str]:
    h={'apikey':SUPABASE_KEY,'Authorization':f'Bearer {SUPABASE_KEY}'}
    if json_body:
        h['Content-Type']='application/json'
    if prefer:
        h['Prefer']=prefer
    return h


def rest_get(table: str, params: dict[str,str], timeout: int=60) -> list[dict]:
    r=requests.get(f'{SUPABASE_URL}/rest/v1/{table}',headers=api_headers(),params=params,timeout=timeout)
    if r.status_code!=200:
        raise RuntimeError(f'GET {table}: {r.status_code} {r.text[:800]}')
    return r.json() or []


def rest_get_all(table: str, params: dict[str,str], page_size: int=900, timeout: int=90) -> list[dict]:
    out=[]
    offset=0
    while True:
        p=dict(params)
        p['limit']=str(page_size)
        p['offset']=str(offset)
        rows=rest_get(table,p,timeout)
        out.extend(rows)
        if len(rows)<page_size:
            return out
        offset+=len(rows)


def rest_post(table: str, rows: list[dict]|dict, prefer: str='return=minimal', timeout: int=90) -> Any:
    r=requests.post(f'{SUPABASE_URL}/rest/v1/{table}',headers=api_headers(True,prefer),json=rows,timeout=timeout)
    if r.status_code not in (200,201,204):
        raise RuntimeError(f'POST {table}: {r.status_code} {r.text[:1000]}')
    if r.status_code==204 or not r.text.strip():
        return None
    return r.json()


def rest_upsert(table: str, rows: list[dict], conflict: str, timeout: int=90) -> None:
    if not rows:
        return
    r=requests.post(
        f'{SUPABASE_URL}/rest/v1/{table}',
        headers=api_headers(True,'resolution=merge-duplicates,return=minimal'),
        params={'on_conflict':conflict},json=rows,timeout=timeout)
    if r.status_code not in (200,201,204):
        raise RuntimeError(f'UPSERT {table}: {r.status_code} {r.text[:1000]}')


def rest_patch(table: str, filt: dict[str,str], values: dict, timeout: int=60) -> None:
    r=requests.patch(f'{SUPABASE_URL}/rest/v1/{table}',headers=api_headers(True,'return=minimal'),params=filt,json=values,timeout=timeout)
    if r.status_code not in (200,204):
        raise RuntimeError(f'PATCH {table}: {r.status_code} {r.text[:1000]}')


def current_targets() -> list[dict]:
    imports=rest_get('triovist_content_imports',{
        'is_current':'eq.true','status':'eq.complete','select':'id,manager_email,manager_name,snapshot_date'
    })
    if not imports:
        raise RuntimeError('Current Triovist content imports not found')
    out=[]
    select='manager_email,manager_name,card_key,sku,donor_article,product_name,product_url,keyword,listing_position'
    for imp in imports:
        rows=rest_get_all('triovist_content_cards',{'import_id':f"eq.{imp['id']}",'select':select})
        for x in rows:
            kw=str(x.get('keyword') or '').strip()
            donor=str(x.get('donor_article') or '').strip()
            if not kw or not donor.isdigit():
                continue
            x['keyword']=kw
            x['_baseline_snapshot_date']=imp.get('snapshot_date')
            out.append(x)
    return out


def grouped_targets(rows: list[dict]) -> list[tuple[str,list[dict]]]:
    groups: dict[str,list[dict]]=defaultdict(list)
    canonical={}
    for x in rows:
        k=x['keyword'].casefold().strip()
        groups[k].append(x)
        canonical.setdefault(k,x['keyword'])
    keys=sorted(groups,key=lambda k:hashlib.sha256(k.encode('utf-8')).hexdigest())
    keys=keys[KEYWORD_OFFSET:KEYWORD_OFFSET+KEYWORD_LIMIT]
    return [(canonical[k],groups[k]) for k in keys]


def search_body(keyword: str, page: int, search_id: str='') -> dict:
    return {'query':keyword,'order':'default','page':page,'limit':60,'mode':'desktop','searchId':search_id,'filters':[]}


_thread_state=threading.local()
_rate_lock=threading.Lock()
_next_request_at=0.0


def top_session() -> requests.Session:
    ses=getattr(_thread_state,'session',None)
    if ses is None:
        ses=requests.Session()
        ses.headers.update({
          'User-Agent':UA,'Accept':'application/json, text/plain, */*','Content-Type':'application/json',
          'Origin':'https://www.21vek.by','Referer':'https://www.21vek.by/'
        })
        _thread_state.session=ses
    return ses


def wait_delay() -> None:
    global _next_request_at
    with _rate_lock:
        now=time.monotonic()
        slot=max(now,_next_request_at)
        _next_request_at=slot+DELAY
    wait=slot-now
    if wait>0:
        time.sleep(wait)


def search_page(session: requests.Session, keyword: str, page: int, search_id: str) -> dict:
    body=search_body(keyword,page,search_id)
    last_error=None
    for attempt in range(3):
        wait_delay()
        try:
            r=session.post(ENDPOINT,json=body,timeout=TIMEOUT,allow_redirects=True)
            if r.status_code==200:
                try:
                    data=r.json()
                except Exception as exc:
                    raise RuntimeError('21vek search returned non-JSON') from exc
                if not isinstance(data,dict) or not isinstance(data.get('products'),list):
                    raise RuntimeError('21vek search response has no products array')
                return data
            error=RuntimeError(f'21vek search HTTP {r.status_code}: {r.text[:300]}')
            if r.status_code<500 and r.status_code not in (408,425,429):
                raise error
            last_error=error
            retry=r.headers.get('Retry-After') if r.status_code==429 else None
            if retry:
                try:
                    time.sleep(max(1.0,min(30.0,float(retry))))
                except Exception:
                    time.sleep(2.0*(attempt+1))
            elif attempt<2:
                time.sleep(1.0*(attempt+1))
        except (requests.Timeout,requests.ConnectionError) as exc:
            last_error=exc
            if attempt<2:
                time.sleep(1.0*(attempt+1))
    if last_error is not None:
        raise last_error
    raise RuntimeError('21vek search failed')


def page_positions(products: list[dict], page: int) -> dict[int,int]:
    out={}
    for i,x in enumerate(products):
        try:
            pid=int(x.get('id'))
        except Exception:
            continue
        out[pid]=(page-1)*60+i+1
    return out


def deep_candidates(targets: list[dict], total_pages: int) -> list[int]:
    expected=[]
    for x in targets:
        try:
            p=int(math.ceil(float(x.get('listing_position'))/60.0))
        except Exception:
            continue
        if p>1:
            expected.append(p)
    pages=[]
    for delta in range(0,DEEP_RADIUS+1):
        ds=[0] if delta==0 else [-delta,delta]
        for d in ds:
            for base in expected:
                p=base+d
                if p>1 and p<=total_pages and p not in pages:
                    pages.append(p)
                if len(pages)>=MAX_DEEP_PAGES:
                    return pages
    return pages


def row_for(run_id: str, x: dict, *, position: int|None, exact: bool, top30: bool|None, top60: bool|None,
            total: int|None, page_found: int|None, observed: str, error: str|None) -> dict:
    return {
      'run_id':run_id,'manager_email':x.get('manager_email') or '','card_key':x.get('card_key') or '',
      'sku':x.get('sku'),'donor_article':x.get('donor_article'),'product_name':x.get('product_name'),
      'product_url':x.get('product_url'),'keyword':x.get('keyword'),'old_paid_position':x.get('listing_position'),
      'position':position,'position_exact':exact,'top30':top30,'top60':top60,'search_total':total,
      'page_found':page_found,'observed_at':observed,'error_text':error
    }


def current_row(s: dict) -> dict:
    return {k:v for k,v in s.items() if k!='id'}


def insert_run(keyword_count: int, target_count: int) -> str:
    rows=rest_post('triovist_21vek_top_runs',{
      'parser_version':PARSER_VERSION,'status':'running','total_keywords':keyword_count,'total_targets':target_count,
      'notes':{'mode':'shadow','endpoint':'search-composer/api/v3/products','page_size':60,'keyword_offset':KEYWORD_OFFSET,
               'deep_exact':DEEP_EXACT,'deep_radius':DEEP_RADIUS,'max_deep_pages_per_keyword':MAX_DEEP_PAGES,
               'production_cutover':False}
    },prefer='return=representation')
    if not rows or not rows[0].get('id'):
        raise RuntimeError('Could not create TOP shadow run')
    return rows[0]['id']


def collect_keyword(run_id: str, keyword: str, targets: list[dict]) -> dict:
    observed=datetime.now(timezone.utc).isoformat()
    by_donor: dict[int,list[dict]]=defaultdict(list)
    for x in targets:
        by_donor[int(x['donor_article'])].append(x)
    found: dict[int,int]={}
    total=None
    search_id=''
    keyword_error=None
    request_count=0
    try:
        ses=top_session()
        data=search_page(ses,keyword,1,'')
        request_count+=1
        search_id=str(data.get('searchId') or '')
        total=int(data.get('total')) if data.get('total') is not None else None
        found.update({pid:pos for pid,pos in page_positions(data.get('products') or [],1).items() if pid in by_donor})

        unresolved=[x for pid,rows in by_donor.items() if pid not in found for x in rows]
        if DEEP_EXACT and unresolved and MAX_DEEP_PAGES>0 and total:
            total_pages=max(1,int(math.ceil(total/60.0)))
            for page in deep_candidates(unresolved,total_pages):
                data2=search_page(ses,keyword,page,search_id)
                request_count+=1
                search_id=str(data2.get('searchId') or search_id)
                pp=page_positions(data2.get('products') or [],page)
                for pid,pos in pp.items():
                    if pid in by_donor:
                        found[pid]=pos
                unresolved=[x for pid,rows in by_donor.items() if pid not in found for x in rows]
                if not unresolved:
                    break
    except Exception as exc:
        keyword_error=str(exc)

    snapshots=[]
    current=[]
    exact_rows=0
    for pid,rows in by_donor.items():
        for x in rows:
            if keyword_error:
                row=row_for(run_id,x,position=None,exact=False,top30=None,top60=None,total=total,page_found=None,observed=observed,error=keyword_error)
            elif pid in found:
                pos=found[pid]
                exact_rows+=1
                row=row_for(run_id,x,position=pos,exact=True,top30=pos<=30,top60=pos<=60,total=total,page_found=int(math.ceil(pos/60.0)),observed=observed,error=None)
            else:
                row=row_for(run_id,x,position=None,exact=False,top30=False,top60=False,total=total,page_found=None,observed=observed,error=None)
            snapshots.append(row)
            current.append(current_row(row))
    return {
      'keyword':keyword,'targets':len(targets),'snapshots':snapshots,'current':current,
      'request_count':request_count,'keyword_error':keyword_error,'exact_rows':exact_rows,'total':total
    }


def main() -> None:
    all_targets=current_targets()
    groups=grouped_targets(all_targets)
    selected=[x for _,xs in groups for x in xs]
    run_id=insert_run(len(groups),len(selected))
    print(
        f'TOP shadow {run_id}: keywords={len(groups)} targets={len(selected)} '
        f'workers={WORKERS} start_interval={DELAY:.2f}s',flush=True
    )

    requests_count=0
    errors=0
    snapshots=[]
    current=[]
    completed=0
    try:
        with ThreadPoolExecutor(max_workers=min(WORKERS,max(1,len(groups))),thread_name_prefix='21vek-top') as pool:
            futures=[pool.submit(collect_keyword,run_id,keyword,targets) for keyword,targets in groups]
            for future in as_completed(futures):
                result=future.result()
                completed+=1
                requests_count+=int(result['request_count'])
                if result['keyword_error']:
                    errors+=1
                snapshots.extend(result['snapshots'])
                current.extend(result['current'])
                print(
                    f"[{completed}/{len(groups)}] {result['keyword']!r}: targets={result['targets']} "
                    f"exact_rows={result['exact_rows']} total={result['total']} error={result['keyword_error'] or '-'}",
                    flush=True
                )
                if len(snapshots)>=250:
                    rest_post('triovist_21vek_top_snapshots',snapshots,timeout=90)
                    rest_upsert('triovist_21vek_top_current',current,'manager_email,card_key',timeout=90)
                    snapshots=[]
                    current=[]

        if snapshots:
            rest_post('triovist_21vek_top_snapshots',snapshots,timeout=90)
            rest_upsert('triovist_21vek_top_current',current,'manager_email,card_key',timeout=90)

        stats=rest_get_all('triovist_21vek_top_snapshots',{
          'run_id':f'eq.{run_id}','select':'position_exact,top30,top60,error_text'
        },page_size=900,timeout=90)
        found_exact=sum(1 for x in stats if x.get('position_exact'))
        top30=sum(1 for x in stats if x.get('top30') is True)
        top60=sum(1 for x in stats if x.get('top60') is True)
        row_errors=sum(1 for x in stats if x.get('error_text'))
        status='complete' if errors==0 and row_errors==0 and len(stats)==len(selected) else 'partial'
        rest_patch('triovist_21vek_top_runs',{'id':f'eq.{run_id}'},{
          'status':status,'requests_count':requests_count,'found_exact_count':found_exact,'top30_count':top30,
          'top60_count':top60,'error_count':errors+row_errors,'finished_at':datetime.now(timezone.utc).isoformat(),
          'notes':{'mode':'shadow','endpoint':'search-composer/api/v3/products','page_size':60,'production_cutover':False,
                   'expected_rows':len(selected),'stored_rows':len(stats),'deep_exact':DEEP_EXACT,
                   'workers':WORKERS,'request_start_interval_seconds':DELAY}
        })
        print(f'DONE {status}: requests={requests_count} rows={len(stats)}/{len(selected)} exact={found_exact} top30={top30} top60={top60} errors={errors+row_errors}',flush=True)
        if status!='complete':
            raise RuntimeError('TOP shadow completeness check failed')
    except Exception as fatal:
        try:
            rest_patch('triovist_21vek_top_runs',{'id':f'eq.{run_id}'},{
              'status':'failed','requests_count':requests_count,'error_count':max(errors,1),
              'finished_at':datetime.now(timezone.utc).isoformat(),
              'notes':{'fatal_error':str(fatal),'production_cutover':False,'workers':WORKERS,'request_start_interval_seconds':DELAY}
            })
        finally:
            raise


if __name__=='__main__':
    main()
