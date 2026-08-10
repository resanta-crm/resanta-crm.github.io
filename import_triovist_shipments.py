#!/usr/bin/env python3
"""Import recent 1C shipments to ООО «Триовист» from Gmail into triovist_shipments.

Expected Excel: at minimum Артикул + Количество. Optional columns:
Дата / Дата документа, Документ / Номер документа, Номенклатура / Товар,
Контрагент / Клиент, Сумма / Выручка.
If Контрагент exists, only rows containing "Триовист" are imported.
Group/SKU 900 is always ignored.
"""
from __future__ import annotations
import email, imaplib, io, os, re, sys
from datetime import date, datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime
from decimal import Decimal, InvalidOperation
import openpyxl, requests

IMAP_HOST=os.getenv('IMAP_HOST','imap.gmail.com'); IMAP_PORT=int(os.getenv('IMAP_PORT','993'))
IMAP_USER=os.environ['IMAP_USER'].strip(); IMAP_PASS=''.join(os.environ['IMAP_PASS'].split()).replace('\xa0','')
SUPABASE_URL=os.environ['SUPABASE_URL'].strip().rstrip('/'); SUPABASE_KEY=os.environ['SUPABASE_KEY'].strip()
LOOKBACK=int(os.getenv('TRIOVIST_SHIPMENTS_LOOKBACK_DAYS','14'))
SUBJECT_KEYS=tuple(x.strip().lower() for x in os.getenv('TRIOVIST_SHIPMENTS_SUBJECT_KEYS','отгруз,триовист').split(',') if x.strip())
ARTICLE_RE=re.compile(r'^\d+(?:/\d+){1,6}$')

def log(x): print(x,flush=True)
def norm(v): return re.sub(r'\s+',' ',str(v or '').strip().lower().replace('ё','е'))
def dec(v):
    if v in (None,''): return Decimal('0')
    try: return Decimal(str(v).replace('\xa0','').replace(' ','').replace(',','.'))
    except InvalidOperation: return Decimal('0')
def decode(v):
    if not v:return ''
    out=[]
    for part,enc in decode_header(v): out.append(part.decode(enc or 'utf-8','replace') if isinstance(part,bytes) else part)
    return ''.join(out)
def msg_date(v):
    try:
        d=parsedate_to_datetime(v); return (d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d).astimezone(timezone.utc)
    except Exception:return datetime.min.replace(tzinfo=timezone.utc)
def select_box(mail):
    try:
        st,boxes=mail.list()
        if st=='OK':
            for raw in boxes or []:
                if b'\\All' not in raw: continue
                m=re.search(br'\)\s+"[^"]*"\s+(.+)$',raw)
                if m:
                    token=m.group(1).strip().strip(b'"').decode('ascii','ignore')
                    if token and mail.select(f'"{token}"' if ' ' in token else token)[0]=='OK': log('Ищу отгрузки во всей почте: '+token);return
    except Exception as e: log('⚠️ All Mail: '+str(e))
    if mail.select('INBOX')[0]!='OK':raise RuntimeError('Не удалось открыть почту')
def attachment(msg):
    for p in msg.walk():
        fn=decode(p.get_filename())
        if fn.lower().endswith('.xlsx'):return fn,p.get_payload(decode=True)
    return None,None
def col(headers,*names):
    h=[norm(x) for x in headers]
    for n in names:
        k=norm(n)
        for i,x in enumerate(h):
            if x==k or x.startswith(k):return i
    return -1
def parse_date(v):
    if isinstance(v,datetime): return v.date()
    if isinstance(v,date): return v
    s=str(v or '').strip();
    for f in ('%Y-%m-%d','%d.%m.%Y','%d/%m/%Y','%d-%m-%Y'):
        try:return datetime.strptime(s[:10],f).date()
        except Exception:pass
    return None
def parse_xlsx(content,filename):
    wb=openpyxl.load_workbook(io.BytesIO(content),data_only=True)
    target=None
    for ws in wb.worksheets:
        for r in range(1,min(ws.max_row,30)+1):
            headers=[ws.cell(r,c).value for c in range(1,ws.max_column+1)]
            sku=col(headers,'Артикул','SKU'); qty=col(headers,'Количество','Кол-во','Кол.')
            if sku>=0 and qty>=0:
                target=(ws,r,headers,sku,qty,col(headers,'Дата','Дата документа','Период'),col(headers,'Номенклатура','Товар','Наименование'),col(headers,'Документ','Номер документа','Регистратор'),col(headers,'Сумма','Выручка','Сумма с НДС'),col(headers,'Контрагент','Клиент'));break
        if target:break
    if not target: raise RuntimeError('Не найдена таблица: нужны колонки Артикул и Количество')
    ws,hr,headers,csku,cqty,cdt,cprod,cdoc,csum,cclient=target; acc={}
    for r in range(hr+1,ws.max_row+1):
        sku=str(ws.cell(r,csku+1).value or '').strip().lstrip("'")
        if not ARTICLE_RE.match(sku) or re.match(r'^900(?:/|$)',sku,re.I):continue
        if cclient>=0 and 'триовист' not in norm(ws.cell(r,cclient+1).value):continue
        qty=dec(ws.cell(r,cqty+1).value)
        if qty==0:continue
        dt=parse_date(ws.cell(r,cdt+1).value) if cdt>=0 else date.today(); dt=dt or date.today()
        doc=str(ws.cell(r,cdoc+1).value or '').strip() if cdoc>=0 else ''; doc=doc or 'без документа'
        product=str(ws.cell(r,cprod+1).value or '').strip() if cprod>=0 else ''
        amount=dec(ws.cell(r,csum+1).value) if csum>=0 else Decimal('0')
        key=(dt.isoformat(),doc,sku)
        x=acc.setdefault(key,{'shipment_date':dt.isoformat(),'document_no':doc,'sku':sku,'product':product,'qty':Decimal('0'),'amount':Decimal('0'),'source_file':filename})
        x['qty']+=qty; x['amount']+=amount
    return [{**x,'qty':format(x['qty'],'f'),'amount':format(x['amount'].quantize(Decimal('0.01')),'f')} for x in acc.values()]
def upsert(rows):
    if not rows:return 0
    headers={'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'}
    for i in range(0,len(rows),500):
        r=requests.post(SUPABASE_URL+'/rest/v1/triovist_shipments?on_conflict=shipment_date,document_no,sku',headers=headers,json=rows[i:i+500],timeout=120)
        if r.status_code not in (200,201,204):raise RuntimeError(f'Supabase {r.status_code}: {r.text}')
    return len(rows)
def main():
    mail=imaplib.IMAP4_SSL(IMAP_HOST,IMAP_PORT,timeout=45); mail.login(IMAP_USER,IMAP_PASS); select_box(mail)
    since=(date.today()-timedelta(days=LOOKBACK)).strftime('%d-%b-%Y'); st,data=mail.search(None,f'(SINCE {since})')
    if st!='OK':raise RuntimeError('Не удалось получить письма')
    ids=data[0].split(); candidates=[]
    # newest first; fetch only messages whose headers contain both markers
    for mid in reversed(ids):
        st,raw=mail.fetch(mid,'(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])')
        if st!='OK' or not raw or not raw[0]:continue
        hdr=email.message_from_bytes(raw[0][1]); subject=decode(hdr.get('Subject'))
        if not all(k in norm(subject) for k in SUBJECT_KEYS):continue
        candidates.append((mid,msg_date(hdr.get('Date')),subject))
        if len(candidates)>=8:break
    if not candidates:
        log('ℹ️ Свежего отчёта отгрузок Триовист не найдено. Это не ошибка; данные не менялись.');return
    candidates.sort(key=lambda x:x[1],reverse=True)
    for mid,sent,subject in candidates:
        st,raw=mail.fetch(mid,'(RFC822)')
        if st!='OK' or not raw or not raw[0]:continue
        msg=email.message_from_bytes(raw[0][1]); fn,content=attachment(msg)
        if not content:continue
        try:
            rows=parse_xlsx(content,fn); n=upsert(rows)
            log(f'✅ Отгрузки Триовист: {n} строк из {fn}, письмо {sent:%d.%m.%Y %H:%M}');return
        except Exception as e: log('⚠️ '+fn+': '+str(e))
    raise RuntimeError('Подходящие письма найдены, но ни один Excel не удалось разобрать')
if __name__=='__main__':
    try:main()
    except Exception as e:log('ОШИБКА: '+str(e));sys.exit(1)
