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
LOOKBACK_DAYS = int(os.environ.get("TRIOVIST_SALES_LOOKBACK_DAYS", "14"))
MAIL_TIMEOUT = int(os.environ.get("TRIOVIST_IMAP_TIMEOUT_SECONDS", "45"))
MAX_FULL_MESSAGES = int(os.environ.get("TRIOVIST_MAX_EMAIL_CANDIDATES", "8"))


def decode_text(value: str | None) -> str:
    if not value:
        return ""
    parts = []
    for part, encoding in decode_header(value):
        if isinstance(part, bytes):
            enc = encoding or "utf-8"
            if str(enc).lower() == "unknown-8bit":
                enc = "utf-8"
            try:
                parts.append(part.decode(enc, errors="replace"))
            except (LookupError, UnicodeDecodeError):
                parts.append(part.decode("utf-8", errors="replace"))
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


def fetch_message_header(mail: imaplib.IMAP4_SSL, message_id: bytes):
    status, data = mail.fetch(message_id, "(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])")
    if status != "OK":
        return None
    raw = b""
    for item in data or []:
        if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], (bytes, bytearray)):
            raw += bytes(item[1])
    if not raw:
        return None
    msg = email.message_from_bytes(raw)
    return {
        "id": message_id,
        "subject": decode_text(msg.get("Subject")),
        "sent": message_date(msg.get("Date")),
    }


def recent_subject_candidates(mail: imaplib.IMAP4_SSL, message_ids):
    candidates = []
    for message_id in message_ids:
        try:
            meta = fetch_message_header(mail, message_id)
        except Exception as exc:
            log(f"⚠️ Заголовок письма {message_id!r} пропущен: {exc}")
            continue
        if meta and SUBJECT_MARKER.lower() in meta["subject"].lower():
            candidates.append(meta)
    candidates.sort(key=lambda x: x["sent"], reverse=True)
    log(f"Подходящих писем: {len(candidates)}; полностью проверяю максимум {MAX_FULL_MESSAGES} самых свежих.")
    return candidates[:MAX_FULL_MESSAGES]


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
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, timeout=MAIL_TIMEOUT)
    try:
        mail.login(IMAP_USER, IMAP_PASS)
        select_mailbox(mail)
        try:
            mail.sock.settimeout(MAIL_TIMEOUT)
        except Exception:
            pass
        since = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
        status, data = mail.search(None, f"(SINCE {since})")
        if status != "OK":
            raise RuntimeError("Не удалось получить список писем")

        headers = recent_subject_candidates(mail, data[0].split())
        candidates = []
        errors = []
        for meta in headers:
            message_id, sent = meta["id"], meta["sent"]
            try:
                status, raw_data = mail.fetch(message_id, "(RFC822)")
            except Exception as exc:
                errors.append(f"{sent:%d.%m %H:%M}: IMAP {exc}")
                continue
            if status != "OK" or not raw_data:
                continue
            raw = next((item[1] for item in raw_data if isinstance(item, tuple) and len(item)>1 and isinstance(item[1], (bytes, bytearray))), None)
            if not raw:
                continue
            msg = email.message_from_bytes(raw)
            filename, content = xlsx_attachment(msg)
            if not content:
                continue
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
