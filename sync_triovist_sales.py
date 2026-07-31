#!/usr/bin/env python3
"""Автоматически обновляет текущий месяц ООО «Триовист» из письма «Продажи для CRM»."""
from __future__ import annotations

import email
import imaplib
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime

import requests

from triovist_import_core import check_current_or_previous, log, parse_current_report

IMAP_HOST = os.environ.get("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
IMAP_USER = os.environ["IMAP_USER"].strip()
IMAP_PASS = "".join(os.environ["IMAP_PASS"].split()).replace("\xa0", "")
SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()
SUBJECT_MARKER = os.environ.get("TRIOVIST_SALES_SUBJECT", "Продажи для CRM")
LOOKBACK_DAYS = int(os.environ.get("TRIOVIST_SALES_LOOKBACK_DAYS", "7"))


def decode_text(value: str | None) -> str:
    if not value:
        return ""
    parts = []
    for part, encoding in decode_header(value):
        if isinstance(part, bytes):
            parts.append(part.decode(encoding or "utf-8", errors="replace"))
        else:
            parts.append(part)
    return "".join(parts)


def message_date(value: str | None) -> datetime:
    try:
        result = parsedate_to_datetime(value)
        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result.astimezone(timezone.utc)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def select_mailbox(mail: imaplib.IMAP4_SSL) -> None:
    try:
        status, boxes = mail.list()
        if status == "OK":
            for raw in boxes or []:
                if b"\\All" not in raw:
                    continue
                match = re.search(br'\)\s+"[^"]*"\s+(.+)$', raw)
                if not match:
                    continue
                token = match.group(1).strip().strip(b'"')
                mailbox = token.decode("ascii", errors="ignore")
                if mailbox and mail.select(f'"{mailbox}"' if " " in mailbox else mailbox)[0] == "OK":
                    log(f"Ищу отчёт во всей почте: {mailbox}")
                    return
    except Exception as exc:
        log(f"⚠️ Не удалось открыть всю почту: {exc}")
    if mail.select("INBOX")[0] != "OK":
        raise RuntimeError("Не удалось открыть INBOX")


def xlsx_attachment(msg) -> tuple[str, bytes] | tuple[None, None]:
    for part in msg.walk():
        filename = decode_text(part.get_filename())
        if filename.lower().endswith(".xlsx"):
            return filename, part.get_payload(decode=True)
    return None, None


def rpc_replace(month: str, rows: list[dict], qty, revenue, source: str) -> dict:
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/triovist_replace_month_safe",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "p_month": month,
            "p_rows": rows,
            "p_source_file": source,
            "p_expected_qty": format(qty, "f"),
            "p_expected_revenue": format(revenue, "f"),
        },
        timeout=180,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase отклонил импорт: {response.status_code} {response.text}")
    try:
        return response.json()
    except Exception:
        return {"rows": len(rows), "qty": str(qty), "revenue": str(revenue)}


def main() -> None:
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    try:
        mail.login(IMAP_USER, IMAP_PASS)
        select_mailbox(mail)
        since = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
        status, data = mail.search(None, f"(SINCE {since})")
        if status != "OK":
            raise RuntimeError("Не удалось получить список писем")

        candidates = []
        errors = []
        for message_id in data[0].split():
            status, raw_data = mail.fetch(message_id, "(RFC822)")
            if status != "OK" or not raw_data or not raw_data[0]:
                continue
            msg = email.message_from_bytes(raw_data[0][1])
            subject = decode_text(msg.get("Subject"))
            if SUBJECT_MARKER.lower() not in subject.lower():
                continue
            filename, content = xlsx_attachment(msg)
            if not content:
                continue
            sent = message_date(msg.get("Date"))
            try:
                month, rows, qty, revenue = parse_current_report(content)
                candidates.append((month, sent, filename, rows, qty, revenue))
            except Exception as exc:
                errors.append(f"{sent:%d.%m %H:%M}: {exc}")

        if not candidates:
            detail = "; ".join(errors[-3:])
            raise RuntimeError(f"Не найден пригодный отчёт «{SUBJECT_MARKER}». {detail}")

        candidates.sort(key=lambda item: (item[0], item[1]))
        month, sent, filename, rows, qty, revenue = candidates[-1]
        check_current_or_previous(month)
        log(f"Выбран {filename}, письмо {sent:%d.%m.%Y %H:%M}, период {month[:7]}")
        result = rpc_replace(month, rows, qty, revenue, f"email · {filename} · {sent.isoformat()}")
        log(f"✅ Триовист обновлён: {len(rows)} SKU-строк, {qty} шт., {revenue} BYN с НДС")
        log(f"Результат Supabase: {result}")
    finally:
        try:
            mail.logout()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ОШИБКА: {exc}")
        sys.exit(1)
