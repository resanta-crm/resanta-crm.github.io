#!/usr/bin/env python3
"""One-off/repair backfill for exact VIP cumulative snapshots from archived 1C sales emails.

Reads only emails with the standard sales subject, keeps the latest email of each
calendar day (Europe/Minsk), parses field sales with the existing importer, and
writes only vip_yoy_snapshots via replace_vip_yoy_snapshot_safe.
It never modifies purchase_history, clients, Triovist sales, plans, tasks or finance.
"""
from __future__ import annotations

import email
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import import_sales as field

MINSK=ZoneInfo("Europe/Minsk")
FROM=date.fromisoformat(os.environ.get("VIP_BACKFILL_FROM","2026-09-01"))
TO=date.fromisoformat(os.environ.get("VIP_BACKFILL_TO",date.today().isoformat()))

def log(x): print(x,flush=True)

def main():
    log(f"VIP snapshot backfill {FROM}..{TO}")
    mail=field.imaplib.IMAP4_SSL(field.IMAP_HOST,field.IMAP_PORT,timeout=field.MAIL_TIMEOUT)
    mail.login(field.IMAP_USER,field.IMAP_PASS)
    field.select_mailbox(mail)
    try:
        since=FROM.strftime("%d-%b-%Y")
        before=(TO+timedelta(days=1)).strftime("%d-%b-%Y")
        st,data=mail.search(None,f'(SINCE {since} BEFORE {before})')
        if st!="OK": raise RuntimeError("IMAP search failed")
        ids=data[0].split()
        log(f"Emails in range: {len(ids)}")
        metas=[]
        batch_size=75
        for i in range(0,len(ids),batch_size):
            for m in field.fetch_message_headers_batch(mail,ids[i:i+batch_size]):
                if field.SUBJECT_MARKER.lower() in str(m.get("subject") or "").lower():
                    sent=field.normalize_message_date(m.get("sent") or m.get("date"))
                    local=sent.astimezone(MINSK)
                    if FROM<=local.date()<=TO:
                        metas.append({"id":m["id"],"sent":sent,"date":local.date(),"subject":m["subject"]})
        by_day={}
        for m in metas:
            if m["date"] not in by_day or m["sent"]>by_day[m["date"]]["sent"]:
                by_day[m["date"]]=m
        log(f"Days with sales mail: {len(by_day)}")
        ok=0;skip=0;fail=0
        for d in sorted(by_day):
            m=by_day[d]
            if field.vip_snapshot_exists(d):
                skip+=1;continue
            st,msg_data=mail.fetch(m["id"],"(RFC822)")
            if st!="OK" or not msg_data:
                fail+=1;continue
            raw=next((x[1] for x in msg_data if isinstance(x,tuple) and len(x)>1 and isinstance(x[1],(bytes,bytearray))),None)
            if not raw:
                fail+=1;continue
            msg=email.message_from_bytes(raw)
            fn,content=field.find_xlsx_in_email(msg)
            if not content:
                fail+=1;continue
            try:
                month,rows=field.parse_sales(content)
                if month[:7]!=d.strftime("%Y-%m"):
                    skip+=1;continue
                try: field.attach_client_ids(rows)
                except Exception as exc: log(f"{d}: client_id warning: {exc}")
                if field.save_vip_yoy_snapshot(d,month,rows,source_message_at=m["sent"].isoformat()):
                    ok+=1
                else:
                    fail+=1
            except Exception as exc:
                log(f"{d}: parse/save failed: {exc}")
                fail+=1
        log(f"DONE saved={ok} existing/skipped={skip} failed={fail}")
    finally:
        try: mail.logout()
        except Exception: pass

if __name__=="__main__":
    main()
