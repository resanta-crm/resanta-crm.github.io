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
import re
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
PARSER_VERSION='top-shadow-v0.7'
ENDPOINT='https://gate.21vek.by/search-composer/api/v3/products'
UA='ResantaCRM-21vekTopShadow/0.7 (+https://resanta-crm.by)'


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


def norm_text(value: object) -> str:
    return re.sub(r"\\s+"," ",str(value or "").strip().lower().replace("ё","е"))


def derive_keyword(row: dict) -> str:
    """Build a human commercial search phrase when the source has none."""
    name=norm_text(row.get("product_name"))
    subgroup=norm_text(row.get("subgroup"))

    rules=[
        (r"соединител\w* для шланг", "соединитель для шланга"),
        (r"насосн\w* станц", "насосная станция"),
        (r"инверторн\w* генератор", "инверторный генератор"),
        (r"воздушн\w* компрессор|компрессор", "компрессор"),
        (r"мотоблок", "мотоблок"),
        (r"набор\w* инструмент", "набор инструментов"),
        (r"отрезн\w* диск", "круг отрезной"),
        (r"пылесос", "строительный пылесос"),
        (r"ножовк", "ножовка"),
        (r"горелк\w* газов|газов\w* горелк", "горелка газовая"),
        (r"полуавтомат\w* свароч|свароч\w* полуавтомат", "сварочный полуавтомат"),
        (r"сварочн\w* аппарат", "сварочный аппарат"),
        (r"электрод", "электроды сварочные"),
        (r"\bбур\b", "бур по бетону"),
        (r"теплов\w* пушк.*электр|электр.*теплов\w* пушк", "электрическая тепловая пушка"),
        (r"торцовочн\w* пил", "торцовочная пила"),
        (r"циркулярн\w* пил", "циркулярная пила"),
        (r"сабельн\w* пил", "сабельная пила"),
        (r"катушк\w* для шланг", "катушка для шланга"),
        (r"колес\w* для мотоблок", "колесо для мотоблока"),
        (r"газонокосилк.*электр|электр.*газонокосилк", "газонокосилка электрическая"),
        (r"диффузор.*плазморез", "диффузор для плазмореза"),
        (r"снегоуборщик.*аккумулятор|аккумулятор.*снегоуборщик", "аккумуляторный снегоуборщик"),
        (r"шланг", "шланг поливочный"),
    ]
    for pattern,phrase in rules:
        if re.search(pattern,name,re.I):
            return phrase

    # Generic fallback: use the unbranded subgroup. Every card must have a phrase.
    if subgroup:
        phrase=re.sub(r"\s+"," ",subgroup).strip(" ,.;:-")
        if phrase:
            return phrase

    clean=re.sub(r"\([^)]*\)"," ",name)
    clean=re.sub(r"\b(?:ресанта|huter|вихрь|eurolux)\b"," ",clean,flags=re.I)
    clean=re.sub(r"\b\d+(?:[/.-]\d+)+\b"," ",clean)
    clean=re.sub(r"\s+"," ",clean).strip(" ,.;:-")
    phrase=" ".join(clean.split()[:6]).strip()
    return phrase or "товар"

def canonical_keyword(row: dict, source_keyword: str) -> tuple[str,str]:
    """Normalize known commercial search families before measuring TOP.

    Source keywords from older imports may be misspelled or overly broad.
    For infrared heaters we use one stable family query so month-to-month
    positions are comparable and AI tasks are based on the intended market.
    """
    name=norm_text(row.get("product_name"))
    source=re.sub(r"\s+"," ",str(source_keyword or "")).strip(" ,.;:-")
    sku=str(row.get("sku") or "").strip()

    is_gas_heater=bool(re.search(r"газов\w*.*обогревател|обогревател.*газов\w*",name,re.I))
    is_infra_heater=bool(
        re.search(r"инфра[к|о]расн\w*.*обогревател|обогревател.*инфра[к|о]расн\w*",name,re.I)
        or re.search(r"\bико[-\s]?\d",name,re.I)
    )

    if is_gas_heater:
        return "газовый обогреватель","canonical_gas_heater"
    if is_infra_heater:
        return "инфракрасный обогреватель","canonical_infrared_heater"

    # Correct a known legacy typo even if the product name is abbreviated.
    if norm_text(source)=="инфрокрасный обогреватель":
        return "инфракрасный обогреватель","canonical_typo_fix"

    # A one-word query is too broad for this family. Keep source only when
    # the product name does not allow a safe family classification.
    if norm_text(source) in ("обогреватель","обогреватели") and sku.startswith("67/5/"):
        if "газов" in name:
            return "газовый обогреватель","canonical_gas_heater"
        if "ико" in name or "инфра" in name:
            return "инфракрасный обогреватель","canonical_infrared_heater"

    return source,"source"

def current_targets() -> list[dict]:
    rows=rest_get_all(
        'triovist_21vek_registry_v236214',
        {'select':'manager_email,manager_name,card_key,sku,donor_article,product_name,category,subgroup,product_url,keyword,listing_position,registry_snapshot_date'},
        page_size=900,
        timeout=90
    )
    if not rows:
        raise RuntimeError('Dedicated 21vek target registry is empty')
    out=[]
    for x in rows:
        source_kw=re.sub(r"\s+"," ",str(x.get('keyword') or '')).strip(" ,.;:-")
        derived=derive_keyword(x)
        base_kw=source_kw or derived
        canonical_kw,canonical_source=canonical_keyword(x,base_kw)
        x['keyword']=canonical_kw or base_kw
        x['_keyword_generated']=not bool(source_kw)
        x['_keyword_source']=canonical_source if canonical_source!='source' else ('source' if source_kw else 'generated')
        x['_keyword_original']=source_kw or None
        x['_baseline_snapshot_date']=x.get('registry_snapshot_date')
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
    # TOP is a coverage contract: never silently omit cards because of a diagnostic
    # keyword limit. Offset remains available for emergency diagnostics only.
    keys=keys[KEYWORD_OFFSET:]
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
    """Bounded retries for transient 21vek search dependencies (including HTTP 424).

    A 424 ML dependency or upstream idle timeout must not invalidate an entire
    daily 1724-card run after one short failed request. Respect 429 Retry-After.
    Never reinterpret a bad response as 'product not in TOP-60'.
    """
    body=search_body(keyword,page,search_id)
    last_error=None
    attempts=5
    for attempt in range(attempts):
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
            # 424 from search-composer signals a failed ML or product-card dependency.
            # All other 4xx except temporary throttling/timeouts fail closed.
            if r.status_code<500 and r.status_code not in (408,424,425,429):
                raise error
            last_error=error
            if attempt>=attempts-1:
                break
            retry=r.headers.get('Retry-After') if r.status_code==429 else None
            if retry:
                try:
                    delay=max(1.0,min(45.0,float(retry)))
                except (TypeError,ValueError):
                    delay=min(30.0,2.0*(2**attempt))
            else:
                delay=min(30.0,2.0*(2**attempt))
            time.sleep(delay)
        except (requests.Timeout,requests.ConnectionError) as exc:
            last_error=exc
            if attempt<attempts-1:
                time.sleep(min(30.0,2.0*(2**attempt)))
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



def resume_failed_run(run_id: str, all_targets: list[dict], groups: list[tuple[str,list[dict]]]) -> None:
    """Retry ONLY failed keywords from the same fully recorded TOP run.

    The original run_id and paired shadow are preserved. Unchanged successful
    rows retain their observed timestamp and ranking; a failed keyword is
    replaced only with a verified new search result. No other run is promoted.
    """
    if not re.fullmatch(r'[0-9a-fA-F-]{36}',run_id):
        raise RuntimeError('Unsafe TOP recovery id')
    runs=rest_get('triovist_21vek_top_runs',{
      'select':'id,status,parser_version,total_targets,total_keywords,requests_count,notes,started_at',
      'id':f'eq.{run_id}','limit':'2'},timeout=60)
    if len(runs)!=1:
        raise RuntimeError('TOP recovery run not found')
    run=runs[0]
    if run.get('status') not in ('failed','partial','running') or \
       run.get('parser_version')!='top-shadow-v0.7' or \
       int(run.get('total_targets') or -1)!=len(all_targets) or \
       int(run.get('total_keywords') or -1)!=len(groups):
        raise RuntimeError('TOP recovery blocked by incompatible run or target count')
    notes=run.get('notes') if isinstance(run.get('notes'),dict) else {}
    if run.get('status')=='running' and not notes.get('last_recovery_at'):
        raise RuntimeError('TOP recovery refused: active/unowned run')
    tries=int(notes.get('recovery_attempts') or 0)
    if tries>=4:
        raise RuntimeError('TOP recovery attempt limit reached; next full daily collection required')
    # A new shadow means this failed TOP may no longer be paired with today's
    # promotion. Do not silently combine TOP with a different card snapshot.
    latest=rest_get('triovist_21vek_shadow_runs',{
      'select':'id,started_at,finished_at,total_targets,status,success_count,error_count',
      'status':'eq.complete','order':'started_at.desc','limit':'1'},timeout=60)
    if len(latest)!=1 or int(latest[0].get('total_targets') or -1)!=len(all_targets) or \
       int(latest[0].get('success_count') or -1)!=len(all_targets) or \
       int(latest[0].get('error_count') or 0)!=0:
        raise RuntimeError('No matching complete card run for TOP recovery')
    if str(run['started_at'])<str(latest[0]['finished_at']):
        raise RuntimeError('TOP recovery run predates latest full card run')
    newer=rest_get('triovist_21vek_shadow_runs',{
      'select':'id','started_at':f'gt.{run["started_at"]}','limit':'1'},timeout=60)
    if newer:
        raise RuntimeError('A newer card run exists; do not revive an old TOP batch')

    previous=rest_get_all('triovist_21vek_top_snapshots',{
      'run_id':f'eq.{run_id}','select':'manager_email,card_key,keyword,error_text'
    },page_size=900,timeout=90)
    keyed={(str(t.get('manager_email') or ''),str(t.get('card_key') or '')):t for t in previous}
    target_keys={(str(x.get('manager_email') or ''),str(x.get('card_key') or '')) for x in all_targets}
    if len(previous)!=len(all_targets) or len(keyed)!=len(all_targets) or set(keyed)!=target_keys:
        raise RuntimeError('TOP recovery refused: snapshot cards mismatch current registry')
    failed={str(x.get('keyword') or '').casefold().strip() for x in previous if x.get('error_text')}
    failed.discard('')
    if len(failed)>12 or (not failed and run.get('status')!='partial'):
        raise RuntimeError('TOP recovery refused: no safe bounded failed keywords')
    group_by_name={word.casefold().strip():(word,rows) for word,rows in groups}
    if not failed.issubset(set(group_by_name)):
        raise RuntimeError('TOP recovery refused: a failed keyword no longer matches the registry')
    # Confirm every target still belongs to the same search phrase, not merely
    # the same card key, so a changed keyword never inherits a prior ranking.
    for word,rows in groups:
        for x in rows:
            old=keyed[(str(x.get('manager_email') or ''),str(x.get('card_key') or ''))]
            if str(old.get('keyword') or '').casefold().strip()!=word.casefold().strip():
                raise RuntimeError('TOP recovery refused: target keyword changed')
    updated=dict(notes,recovery_attempts=tries+1,
      last_recovery_at=datetime.now(timezone.utc).isoformat(),
      recovery_keywords=sorted(failed),production_cutover=False)
    rest_patch('triovist_21vek_top_runs',{'id':f'eq.{run_id}'},
               {'status':'running','notes':updated})
    print(f'TOP RECOVERY {run_id}: {len(failed)} keywords; attempt={tries+1}/4',flush=True)

    added_requests=0
    try:
        for keyword_key in sorted(failed):
            keyword,rows=group_by_name[keyword_key]
            result=collect_keyword(run_id,keyword,rows)
            added_requests+=int(result['request_count'])
            if result['keyword_error']:
                raise RuntimeError(f'TOP recovery still failing for {keyword!r}: {result["keyword_error"]}')
            rest_upsert('triovist_21vek_top_snapshots',result['snapshots'],
                        'run_id,manager_email,card_key',timeout=90)
        # Verify every row and every key once more before promoting the mirror.
        all_rows=rest_get_all('triovist_21vek_top_snapshots',{
          'run_id':f'eq.{run_id}','select':'*'},page_size=900,timeout=90)
        actual={(str(x.get('manager_email') or ''),str(x.get('card_key') or '')) for x in all_rows}
        if len(all_rows)!=len(all_targets) or actual!=target_keys or \
           any(x.get('error_text') for x in all_rows):
            raise RuntimeError('TOP recovery verification failed: incomplete rows')
        found=sum(bool(x.get('position_exact')) for x in all_rows)
        t30=sum(x.get('top30') is True for x in all_rows)
        t60=sum(x.get('top60') is True for x in all_rows)
        for begin in range(0,len(all_rows),200):
            rest_upsert('triovist_21vek_top_current',
                        [current_row(x) for x in all_rows[begin:begin+200]],
                        'manager_email,card_key',timeout=90)
        updated.update(recovery_complete=True,recovered_keywords=len(failed),
                       stored_rows=len(all_rows),outside_top60=sum(x.get('top60') is False for x in all_rows))
        rest_patch('triovist_21vek_top_runs',{'id':f'eq.{run_id}'},{
          'status':'complete','requests_count':int(run.get('requests_count') or 0)+added_requests,
          'found_exact_count':found,'top30_count':t30,'top60_count':t60,'error_count':0,
          'finished_at':datetime.now(timezone.utc).isoformat(),'notes':updated})
        print(f'✅ TOP RECOVERED {run_id}: keywords={len(failed)} cards={len(all_rows)} errors=0',flush=True)
    except Exception as exc:
        updated['last_recovery_error']=str(exc)[:420]
        rest_patch('triovist_21vek_top_runs',{'id':f'eq.{run_id}'},{
          'status':'failed','error_count':1,
          'requests_count':int(run.get('requests_count') or 0)+added_requests,
          'finished_at':datetime.now(timezone.utc).isoformat(),'notes':updated})
        raise


def main() -> None:
    all_targets=current_targets()
    invalid=[
        x for x in all_targets
        if not str(x.get('keyword') or '').strip()
        or not str(x.get('donor_article') or '').strip().isdigit()
    ]
    valid=[x for x in all_targets if x not in invalid]
    groups=grouped_targets(valid)
    selected=[x for _,xs in groups for x in xs]
    generated=sum(1 for x in all_targets if x.get('_keyword_generated'))
    canonicalized=sum(1 for x in all_targets if str(x.get('_keyword_source') or '').startswith('canonical_'))
    if any(not str(x.get('keyword') or '').strip() for x in all_targets):
        raise RuntimeError('TOP coverage contract violated: at least one card has no search phrase')
    resume_id=os.environ.get('TOP_RECOVER_RUN_ID','').strip()
    if resume_id:
        if invalid or len(selected)!=len(all_targets):
            raise RuntimeError('Recovery forbidden: invalid or uncovered registry cards')
        resume_failed_run(resume_id,all_targets,groups)
        return
    run_id=insert_run(len(groups),len(all_targets))
    print(
        f'TOP shadow {run_id}: keywords={len(groups)} targets={len(all_targets)} '
        f'generated_keywords={generated} canonicalized_keywords={canonicalized} workers={WORKERS} start_interval={DELAY:.2f}s',flush=True
    )

    requests_count=0
    errors=len(invalid)
    snapshots=[]
    current=[]
    completed=0

    observed=datetime.now(timezone.utc).isoformat()
    for x in invalid:
        reason='missing keyword' if not str(x.get('keyword') or '').strip() else 'invalid donor_article'
        row=row_for(
            run_id,x,position=None,exact=False,top30=None,top60=None,total=None,
            page_found=None,observed=observed,error=reason
        )
        snapshots.append(row)
        current.append(current_row(row))

    # If a future registry grows beyond the configured keyword limit, fail closed
    # instead of silently declaring uncovered cards to be outside TOP-60.
    if len(selected)+len(invalid) != len(all_targets):
        uncovered=len(all_targets)-len(selected)-len(invalid)
        raise RuntimeError(
            f'TOP keyword limit leaves {uncovered} cards unchecked; '
            f'increase TOP_KEYWORD_LIMIT before promotion'
        )

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
                    # Never replace the live TOP mirror with partial/failed data.
                    snapshots=[]
                    current=[]

        if snapshots:
            rest_post('triovist_21vek_top_snapshots',snapshots,timeout=90)

        stats=rest_get_all('triovist_21vek_top_snapshots',{
          'run_id':f'eq.{run_id}','select':'position_exact,top30,top60,error_text'
        },page_size=900,timeout=90)
        found_exact=sum(1 for x in stats if x.get('position_exact'))
        top30=sum(1 for x in stats if x.get('top30') is True)
        top60=sum(1 for x in stats if x.get('top60') is True)
        outside60=sum(1 for x in stats if x.get('top60') is False and not x.get('error_text'))
        row_errors=sum(1 for x in stats if x.get('error_text'))
        status='complete' if errors==0 and row_errors==0 and len(stats)==len(all_targets) else 'partial'
        if status=='complete':
            # Only after complete run validation publish the TOP mirror.
            verified=rest_get_all('triovist_21vek_top_snapshots',{
              'run_id':f'eq.{run_id}','select':'*'
            },page_size=900,timeout=90)
            if len(verified)!=len(all_targets) or any(x.get('error_text') for x in verified):
                raise RuntimeError('TOP mirror publication blocked: incomplete verified snapshot')
            for begin in range(0,len(verified),200):
                rest_upsert('triovist_21vek_top_current',
                            [current_row(x) for x in verified[begin:begin+200]],
                            'manager_email,card_key',timeout=90)
        rest_patch('triovist_21vek_top_runs',{'id':f'eq.{run_id}'},{
          'status':status,'requests_count':requests_count,'found_exact_count':found_exact,'top30_count':top30,
          'top60_count':top60,'error_count':errors+row_errors,'finished_at':datetime.now(timezone.utc).isoformat(),
          'notes':{'mode':'shadow','endpoint':'search-composer/api/v3/products','page_size':60,'production_cutover':False,
                   'expected_rows':len(all_targets),'stored_rows':len(stats),'generated_keywords':generated,
                   'canonicalized_keywords':canonicalized,
                   'outside_top60':outside60,'deep_exact':DEEP_EXACT,
                   'workers':WORKERS,'request_start_interval_seconds':DELAY}
        })
        print(
            f'DONE {status}: requests={requests_count} rows={len(stats)}/{len(all_targets)} '
            f'exact={found_exact} top30={top30} top60={top60} outside60={outside60} '
            f'generated_keywords={generated} canonicalized_keywords={canonicalized} errors={errors+row_errors}',flush=True
        )
        if status!='complete':
            raise RuntimeError('TOP shadow completeness check failed')
    except Exception as fatal:
        try:
            rest_patch('triovist_21vek_top_runs',{'id':f'eq.{run_id}'},{
              'status':'failed','requests_count':requests_count,'error_count':max(errors,1),
              'finished_at':datetime.now(timezone.utc).isoformat(),
              'notes':{'fatal_error':str(fatal),'production_cutover':False,'workers':WORKERS,
                       'generated_keywords':generated,'canonicalized_keywords':canonicalized,
                       'request_start_interval_seconds':DELAY}
            })
        finally:
            raise


if __name__=='__main__':
    main()
