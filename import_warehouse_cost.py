#!/usr/bin/env python3
"""RESANTA CRM v23.6.20 — automatic warehouse cost import from 1C Gmail report.

Source subject: "Себестоимость для СРМ ..."
Attachment: "Себестоимость товаров организаций ... (XLSX).xlsx"
No spreadsheet dependency: XLSX is read with the Python standard library.
The latest valid report for the current month replaces only that month's snapshot.
"""
from __future__ import annotations
import email, imaplib, os, re, time, zipfile, io
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime
import requests

VERSION='v23.6.20'
IMAP_USER=os.environ['IMAP_USER'].strip()
IMAP_PASS=''.join(os.environ['IMAP_PASS'].split()).replace('\xa0','')
SUPABASE_URL=os.environ['SUPABASE_URL'].strip().rstrip('/')
SUPABASE_KEY=os.environ['SUPABASE_KEY'].strip()
LOOKBACK=max(2,int(os.getenv('WAREHOUSE_COST_LOOKBACK_DAYS','10')))
MAIL_TIMEOUT=max(20,int(os.getenv('WAREHOUSE_COST_IMAP_TIMEOUT_SECONDS','45')))
SKU_RE=re.compile(r'^\d+(?:/\d+){1,8}$')
PERIOD_RE=re.compile(r'(\d{1,2})[.]([0-9]{1,2})[.]([0-9]{4})\s*[-–—]\s*(\d{1,2})[.]([0-9]{1,2})[.]([0-9]{4})')
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

def log(x): print(x,flush=True)
def norm(v): return re.sub(r'\s+',' ',str(v or '').strip().lower().replace('ё','е'))
def decode(v):
    if not v:return ''
    out=[]
    for part,enc in decode_header(v):
        if isinstance(part,bytes):
            try: out.append(part.decode(enc or 'utf-8','replace'))
            except Exception: out.append(part.decode('utf-8','replace'))
        else: out.append(part)
    return ''.join(out)
def msg_date(v):
    try:
        d=parsedate_to_datetime(v)
        return (d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d).astimezone(timezone.utc)
    except Exception:return datetime.min.replace(tzinfo=timezone.utc)
def num(v):
    if v in (None,''):return 0.0
    try:return float(str(v).replace('\xa0','').replace(' ','').replace(',','.'))
    except Exception:return 0.0

def connect_mail():
    last=None
    for a in range(1,4):
        m=None
        try:
            log(f'{VERSION}: Gmail IMAP {a}/3')
            m=imaplib.IMAP4_SSL('imap.gmail.com',993,timeout=MAIL_TIMEOUT);m.login(IMAP_USER,IMAP_PASS)
            try:m.sock.settimeout(MAIL_TIMEOUT)
            except Exception:pass
            return m
        except Exception as e:
            last=e
            try:
                if m:m.logout()
            except Exception:pass
            if a<3:time.sleep(6)
    raise RuntimeError(f'Не удалось подключиться к Gmail: {last}')

def select_box(mail):
    try:
        st,boxes=mail.list()
        if st=='OK':
            for raw in boxes or []:
                if b'\\All' not in raw:continue
                mt=re.search(br'\)\s+"[^"]*"\s+(.+)$',raw)
                if not mt:continue
                token=mt.group(1).strip().strip(b'"').decode('ascii','ignore')
                if token and mail.select(f'"{token}"' if ' ' in token else token)[0]=='OK':return token
    except Exception:pass
    if mail.select('INBOX')[0]!='OK':raise RuntimeError('Не удалось открыть Gmail')
    return 'INBOX'

def excel_attachments(msg):
    out=[]
    for p in msg.walk():
        fn=decode(p.get_filename()).strip()
        if not fn.lower().endswith(('.xlsx','.xlsm')):continue
        body=p.get_payload(decode=True)
        if body:out.append((fn,body))
    return out

def colnum(ref):
    m=re.match(r'([A-Z]+)',ref or '')
    if not m:return 0
    n=0
    for ch in m.group(1):n=n*26+ord(ch)-64
    return n

def xlsx_rows(blob):
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            root=ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall(NS+'si'):
                shared.append(''.join((t.text or '') for t in si.iter(NS+'t')))
        wb=ET.fromstring(z.read('xl/workbook.xml'))
        rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        relmap={r.attrib['Id']:r.attrib['Target'] for r in rels}
        sh=wb.find(NS+'sheets')[0]
        target=relmap[sh.attrib[RNS+'id']]
        root=ET.fromstring(z.read('xl/'+target))
        rows=[]
        for row in root.findall('.//'+NS+'sheetData/'+NS+'row'):
            vals={}
            for c in row.findall(NS+'c'):
                ref=c.attrib.get('r','');typ=c.attrib.get('t');v=c.find(NS+'v')
                if v is None:continue
                raw=v.text or ''
                if typ=='s':
                    try:val=shared[int(raw)]
                    except Exception:val=''
                elif typ=='b':val=(raw=='1')
                else:
                    try:val=float(raw)
                    except Exception:val=raw
                vals[colnum(ref)]=val
            rows.append((int(row.attrib.get('r','0')),vals))
        return rows

def parse_report(blob,email_dt):
    rows=xlsx_rows(blob)
    joined=' | '.join(str(v) for _,r in rows[:20] for v in r.values())
    if 'себестоимость товаров организаций' not in norm(joined):raise ValueError('Это не отчёт себестоимости')
    if 'byn' not in norm(joined):raise ValueError('Отчёт должен быть в BYN')
    pm=None
    mt=PERIOD_RE.search(joined)
    if mt:pm=f'{int(mt.group(3)):04d}-{int(mt.group(2)):02d}-01'
    if not pm:pm=email_dt.strftime('%Y-%m-01')
    header_i=None
    for i,(rn,r) in enumerate(rows):
        if norm(r.get(1))=='артикул' and norm(r.get(2))=='номенклатура':header_i=i;break
    if header_i is None:raise ValueError('Не найдена шапка Артикул / Номенклатура')
    if header_i<1:raise ValueError('Нет верхней шапки отчёта')
    prev=rows[header_i-1][1]
    required={6:'начальный остаток',10:'приход',12:'расход',14:'конечный остаток'}
    for col,title in required.items():
        if title not in norm(prev.get(col)):raise ValueError(f'Не подтверждён блок «{title}»')
    items=[];seen=set()
    for rn,r in rows[header_i+1:]:
        sku=str(r.get(1,'')).strip().lstrip("'")
        if not SKU_RE.match(sku) or sku in seen:continue
        seen.add(sku)
        oq,oc,rq,rc,eq,ec,cq,cc=[num(r.get(c)) for c in (6,8,10,11,12,13,14,15)]
        unit_cost=(cc/cq if cq else (oc/oq if oq else 0.0))
        items.append({'report_month':pm,'report_date':email_dt.date().isoformat(),'sku':sku,'product':str(r.get(2,'')).strip() or None,'unit':str(r.get(5,'')).strip() or None,'opening_qty':oq,'opening_cost_byn':oc,'receipt_qty':rq,'receipt_cost_byn':rc,'expense_qty':eq,'expense_cost_byn':ec,'closing_qty':cq,'closing_cost_byn':cc,'unit_cost_byn':unit_cost})
    if len(items)<500:raise ValueError(f'Слишком мало SKU: {len(items)}')
    sums={k:sum(x[k] for x in items) for k in ('opening_qty','opening_cost_byn','receipt_qty','receipt_cost_byn','expense_qty','expense_cost_byn','closing_qty','closing_cost_byn')}
    return pm,items,sums

def headers(prefer='return=minimal'):
    return {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':prefer}
def req(method,path,payload=None,params=None,prefer='return=minimal'):
    r=requests.request(method,SUPABASE_URL+'/rest/v1/'+path,headers=headers(prefer),json=payload,params=params,timeout=120)
    if r.status_code>=300:raise RuntimeError(f'Supabase {method} {path}: {r.status_code} {r.text[:1000]}')
    return r.json() if r.text else None

def import_rows(items,pm,report_date,filename,email_dt,sums):
    common={'source_file':filename,'source_email_ts':email_dt.isoformat()}
    for i in range(0,len(items),250):
        batch=[dict(x,**common) for x in items[i:i+250]]
        req('POST','warehouse_cost_snapshots',batch,{'on_conflict':'report_month,sku'},'resolution=merge-duplicates,return=minimal')
    req('DELETE','warehouse_cost_snapshots',params={'report_month':'eq.'+pm,'report_date':'neq.'+report_date})
    logrow={'report_month':pm,'report_date':report_date,'source_file':filename,'source_email_ts':email_dt.isoformat(),'row_count':len(items),**sums}
    req('POST','warehouse_cost_import_log',[logrow],{'on_conflict':'report_month'},'resolution=merge-duplicates,return=minimal')

def main():
    mail=connect_mail();box=select_box(mail);log('Ищу себестоимость во всей почте: '+box)
    try:
        since=(datetime.now()-timedelta(days=LOOKBACK)).strftime('%d-%b-%Y')
        st,data=mail.uid('search',None,'SINCE',since)
        if st!='OK':raise RuntimeError('Gmail search failed')
        uids=(data[0] or b'').split()[-160:]
        candidates=[]
        for uid in reversed(uids):
            st,h=mail.uid('fetch',uid,'(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])')
            if st!='OK' or not h or not h[0]:continue
            raw=h[0][1] if isinstance(h[0],tuple) else b'';m=email.message_from_bytes(raw)
            subject=decode(m.get('Subject'));s=norm(subject)
            if 'себестоимость' not in s or ('срм' not in s and 'crm' not in s):continue
            candidates.append((msg_date(m.get('Date')),uid,subject))
        candidates.sort(reverse=True)
        for email_dt,uid,subject in candidates[:20]:
            st,full=mail.uid('fetch',uid,'(RFC822)')
            if st!='OK' or not full:continue
            raw=next((x[1] for x in full if isinstance(x,tuple)),None)
            if not raw:continue
            m=email.message_from_bytes(raw)
            for fn,blob in excel_attachments(m):
                try:
                    pm,items,sums=parse_report(blob,email_dt)
                    import_rows(items,pm,email_dt.date().isoformat(),fn,email_dt,sums)
                    log(f'✅ Себестоимость импортирована: {len(items)} SKU · {pm} · расход {sums["expense_cost_byn"]:.2f} BYN · остаток {sums["closing_cost_byn"]:.2f} BYN')
                    return
                except Exception as e:log(f'  ⚠️ {fn} не подошёл: {e}')
        log('Нового валидного отчёта себестоимости не найдено. База не менялась.')
    finally:
        try:mail.logout()
        except Exception:pass
if __name__=='__main__':main()
