#!/usr/bin/env python3
"""Resanta CRM — resilient PDZ importer v23.4.10.

Root fix:
- INBOX first: daily 1C PDZ messages arrive there, so we do not scan Gmail All Mail
  on every hourly run;
- bounded header-only scan, then download only a few matching messages;
- fallback to All Mail only if INBOX has no matching PDZ message;
- newest VALID report is chosen by report date inside Excel;
- any mail/parser/write error keeps the last good CRM debt slice intact.
"""
from __future__ import annotations

import email
import imaplib
import os
import re
import sys
from datetime import date, datetime, timedelta
from email.header import decode_header
from typing import Any

import import_pdz as base

HEADER_BATCH_SIZE=max(20,min(250,int(os.environ.get('PDZ_HEADER_BATCH_SIZE','80'))))
HEADER_SCAN_LIMIT=max(100,min(3000,int(os.environ.get('PDZ_HEADER_SCAN_LIMIT','600'))))
MAX_CANDIDATE_EMAILS=max(3,min(20,int(os.environ.get('PDZ_MAX_CANDIDATE_EMAILS','8'))))


def decode_text(value:str|None)->str:
    out=[]
    for chunk,enc in decode_header(value or ''):
        out.append(chunk.decode(enc or 'utf-8',errors='replace') if isinstance(chunk,bytes) else chunk)
    return ''.join(out)


def _select_inbox(mail:imaplib.IMAP4_SSL)->bool:
    try:
        st,_=mail.select('INBOX',readonly=True)
        if st=='OK':
            base.log('PDZ: сначала проверяю INBOX')
            return True
    except Exception as exc:
        base.log(f'PDZ: INBOX недоступен: {exc}')
    return False


def _select_all_mail(mail:imaplib.IMAP4_SSL)->bool:
    try:
        base.select_mailbox(mail)
        base.log('PDZ: резервный поиск во всей почте')
        return True
    except Exception as exc:
        base.log(f'PDZ: вся почта недоступна: {exc}')
        return False


def header_rows(mail:imaplib.IMAP4_SSL,msg_ids:list[bytes])->list[tuple[bytes,str,datetime]]:
    if not msg_ids:return []
    status,raw=mail.fetch(b','.join(msg_ids).decode('ascii'),'(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])')
    if status!='OK':return []
    out=[]
    for item in raw or []:
        if not isinstance(item,tuple) or len(item)<2:continue
        meta,payload=item[0],item[1]
        if not isinstance(meta,(bytes,bytearray)) or not isinstance(payload,(bytes,bytearray)):continue
        m=re.match(br'\s*(\d+)\s',bytes(meta))
        if not m:continue
        msg=email.message_from_bytes(bytes(payload))
        out.append((m.group(1),decode_text(msg.get('Subject')),base.normalize_message_date(msg.get('Date'))))
    return out


def find_hits(mail:imaplib.IMAP4_SSL)->list[tuple[bytes,str,datetime]]:
    since=(date.today()-timedelta(days=base.LOOKBACK_DAYS)).strftime('%d-%b-%Y')
    st,data=mail.search(None,f'(SINCE "{since}")')
    if st!='OK':raise RuntimeError('Не удалось получить список писем')
    ids=data[0].split() if data and data[0] else []
    newest=list(reversed(ids[-HEADER_SCAN_LIMIT:]))
    hits=[];scanned=0
    for offset in range(0,len(newest),HEADER_BATCH_SIZE):
        batch=newest[offset:offset+HEADER_BATCH_SIZE]
        rows=header_rows(mail,batch);scanned+=len(rows)
        for msg_id,subject,sent in rows:
            if base.SUBJECT_MARKER.lower() in subject.lower():hits.append((msg_id,subject,sent))
        if len(hits)>=MAX_CANDIDATE_EMAILS:break
    hits.sort(key=lambda x:(x[2],int(x[0])),reverse=True)
    base.log(f'PDZ safe scan: писем в папке={len(ids)}, заголовков={scanned}, найдено={len(hits)}')
    return hits[:MAX_CANDIDATE_EMAILS]


def parsed_candidates()->tuple[list[tuple[Any,...]],list[str]]:
    base.log(f'Подключаюсь к почте {base.IMAP_HOST}:{base.IMAP_PORT} как {base.IMAP_USER}')
    mail=imaplib.IMAP4_SSL(base.IMAP_HOST,base.IMAP_PORT)
    try:
        mail.login(base.IMAP_USER,base.IMAP_PASS)
        hits=[]
        if _select_inbox(mail):hits=find_hits(mail)
        if not hits:
            if not _select_all_mail(mail):raise RuntimeError('Не удалось открыть почтовые папки')
            hits=find_hits(mail)
        if not hits:raise RuntimeError(f'Не найдено письмо «{base.SUBJECT_MARKER}» за {base.LOOKBACK_DAYS} дней')

        parsed=[];errors=[]
        for msg_id,_,header_sent in hits:
            st,raw=mail.fetch(msg_id,'(BODY.PEEK[])')
            if st!='OK' or not raw:
                errors.append(f'message {msg_id.decode()}: не удалось скачать');continue
            payload=None
            for item in raw:
                if isinstance(item,tuple) and len(item)>=2 and isinstance(item[1],(bytes,bytearray)):
                    payload=bytes(item[1]);break
            if not payload:
                errors.append(f'message {msg_id.decode()}: пустое письмо');continue
            msg=email.message_from_bytes(payload)
            subject=decode_text(msg.get('Subject'));sent=base.normalize_message_date(msg.get('Date')) or header_sent
            filename,content=base.find_xlsx_in_email(msg)
            if not content:
                errors.append(f'{sent:%d.%m %H:%M}: нет Excel-вложения');continue
            try:
                rows,report_date,meta=base.parse_pdz(content)
                parsed.append((report_date or date.min,sent,subject,filename,rows,report_date,meta))
            except Exception as exc:
                errors.append(f'{sent:%d.%m %H:%M}: {filename}: {exc}')
        return parsed,errors
    finally:
        try:mail.logout()
        except Exception:pass


def main()->None:
    base.safe_set_import_status('pdz','running',details='PDZ inbox-first safe scan v23.4.10')
    report_date=None;sent=None;rows=None
    try:
        parsed,parse_errors=parsed_candidates()
        if not parsed:
            detail='; '.join(parse_errors[-3:])
            raise RuntimeError('Не найден пригодный отчёт ПДЗ'+(f': {detail}' if detail else ''))
        parsed.sort(key=lambda x:(x[0],x[1]))
        _,sent,subject,filename,rows,report_date,meta=parsed[-1]
        base.IMPORT_CONTEXT.update({'report_date':report_date.isoformat() if report_date else None,'source_message_at':sent.isoformat() if sent else None,'row_count':len(rows)})
        if report_date is None:raise RuntimeError('Не удалось прочитать дату отчёта из файла ПДЗ')
        age=(date.today()-report_date).days
        if age<0:raise RuntimeError(f'Дата отчёта ПДЗ находится в будущем: {report_date:%d.%m.%Y}')
        if age>base.MAX_REPORT_AGE_DAYS:
            raise RuntimeError(f'Отчёт ПДЗ от {report_date:%d.%m.%Y} старше допустимых {base.MAX_REPORT_AGE_DAYS} дн.; последний хороший срез сохранён')
        if not rows and not meta.get('validated_zero'):
            raise RuntimeError('Пустой отчёт ПДЗ не подтверждён итогами менеджеров; последний хороший срез сохранён')
        total=sum(float(r.get('debt_overdue') or 0) for r in rows)
        base.replace_debt_table(rows,report_date,sent.isoformat())
        base.safe_set_import_status('pdz','ok',report_date=report_date.isoformat(),source_message_at=sent.isoformat(),row_count=len(rows),details=f'Просрочено {total:.2f} BYN; файл {filename}; inbox-first v23.4.10')
        base.log(f'✅ PDZ v23.4.10: дата={report_date}, строк={len(rows)}, просрочено={total:,.2f} BYN')
    except Exception as exc:
        base.safe_set_import_status('pdz','error',report_date=report_date.isoformat() if report_date else None,source_message_at=sent.isoformat() if sent else None,row_count=len(rows) if isinstance(rows,list) else None,details='PDZ v23.4.10; последний хороший срез не удалён',error_text=str(exc)[:2000])
        base.log(f'ОШИБКА PDZ v23.4.10: {exc}')
        raise


if __name__=='__main__':
    try:main()
    except Exception:sys.exit(1)
