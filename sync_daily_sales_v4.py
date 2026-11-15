#!/usr/bin/env python3
"""Isolated IMAP → daily snapshot RPC. No writes to purchase_history or clients."""
import argparse
import email
import hashlib
import imaplib
import json
import os
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

from daily_sales_report_v4 import SUBJECT, parse_report


def text_header(value):
    return str(make_header(decode_header(value or "")))


def candidates(mail):
    # Read/unread flags never affect imports. Search only the dedicated feed.
    since = (datetime.now(timezone.utc)-timedelta(days=4)).strftime("%d-%b-%Y")
    ok, data = mail.uid("search", "CHARSET", "UTF-8", f'(SINCE {since} SUBJECT "Реализации за день")'.encode())
    if ok != "OK":
        raise RuntimeError("Daily mailbox search failed")
    found = []
    for uid in data[0].split()[-30:]:
        ok, parts = mail.uid("fetch", uid, "(BODY.PEEK[] INTERNALDATE)")
        if ok != "OK":
            raise RuntimeError("Daily message fetch failed")
        blob = next((p[1] for p in parts if isinstance(p, tuple)), None)
        if not blob:
            raise RuntimeError("Daily message body is missing")
        message = email.message_from_bytes(blob)
        subject = text_header(message.get("Subject"))
        if not subject.startswith(SUBJECT + " от "):
            continue
        sent = parsedate_to_datetime(message["Date"])
        if sent.tzinfo is None:
            raise ValueError("Source message timezone is missing")
        attachments = []
        for part in message.walk():
            filename = text_header(part.get_filename())
            if filename.lower().endswith((".xls", ".xlsx")):
                attachments.append(part.get_payload(decode=True))
        if len(attachments) != 1:
            raise ValueError("Expected exactly one daily Excel attachment")
        content = attachments[0]
        result = parse_report(content)
        local_day = sent.astimezone(ZoneInfo("Europe/Minsk")).date().isoformat()
        if result["report_day"] != local_day:
            raise ValueError("Daily report is pinned to a different day; check Today in 1C")
        result.update(source_message_at=sent.isoformat(), source_message_id=message.get("Message-ID") or uid.decode(),
                      content_sha256=hashlib.sha256(content).hexdigest())
        found.append(result)
    return sorted(found, key=lambda x:x["source_message_at"])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--file", help="Parse a local XLS/XLSX without mailbox or database access")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    if args.file:
        from pathlib import Path
        result = parse_report(Path(args.file).read_bytes())
        print(json.dumps({k:v for k,v in result.items() if k != "rows"},ensure_ascii=False))
        print("Detail rows:",len(result["rows"]))
        return
    with imaplib.IMAP4_SSL(os.environ.get("IMAP_HOST","imap.gmail.com"),993,timeout=35) as mail:
        mail.login(os.environ["IMAP_USER"],"".join(os.environ["IMAP_PASS"].split()))
        mail.select("INBOX",readonly=True)
        reports = candidates(mail)
    if not reports:
        print("No dedicated daily reports found")
        return
    if args.dry_run:
        print("Validated reports:",len(reports))
        return
    import requests
    key = os.environ["SUPABASE_KEY"]
    url = os.environ["SUPABASE_URL"].rstrip("/")+"/rest/v1/rpc/crm_daily_sales_ingest_v4"
    for result in reports:
        response = requests.post(url,headers={"apikey":key,"Authorization":"Bearer "+key},
                                 json={"p_report":result},timeout=90)
        if not response.ok:
            # Do not print authenticated request headers or secrets.
            raise RuntimeError("Daily snapshot RPC failed: HTTP "+str(response.status_code))
        payload = response.json()
        print(json.dumps({"day":result["report_day"],"rows":len(result["rows"]),"result":payload},ensure_ascii=False))


if __name__ == "__main__":
    main()
