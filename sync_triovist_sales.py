#!/usr/bin/env python3
"""Автоматически обновляет текущий месяц ООО «Триовист» из письма «Продажи для CRM»."""
from __future__ import annotations

import email
import imaplib
import os
import re
import sys
import time
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
HEADER_BATCH_SIZE = max(20, int(os.environ.get("TRIOVIST_IMAP_HEADER_BATCH", "75")))
HEADER_SCAN_DEADLINE = max(30, int(os.environ.get("TRIOVIST_HEADER_SCAN_DEADLINE_SECONDS", "120")))


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


def fetch_message_headers_batch(mail: imaplib.IMAP4_SSL, message_ids):
    """Одним IMAP FETCH получает Subject/Date сразу для пачки писем.

    Раньше Триовист делал отдельный FETCH для каждого письма и мог 10–20 минут
    стоять на строке «Ищу отчёт во всей почте». Теперь 200+ писем читаются
    несколькими пакетами, а полные письма скачиваются только для свежих кандидатов.
    """
    if not message_ids:
        return []
    message_set = b",".join(message_ids)
    status, data = mail.fetch(message_set, "(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])")
    if status != "OK":
        raise RuntimeError("Gmail не вернул пакет заголовков")

    requested = {bytes(x) for x in message_ids}
    result = []
    for item in data or []:
        if not (isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], (bytes, bytearray))):
            continue
        meta_raw = item[0] if isinstance(item[0], (bytes, bytearray)) else b""
        match = re.match(rb"\s*(\d+)", bytes(meta_raw))
        if not match:
            continue
        message_id = match.group(1)
        if message_id not in requested:
            continue
        raw = bytes(item[1])
        if not raw:
            continue
        msg = email.message_from_bytes(raw)
        result.append({
            "id": message_id,
            "subject": decode_text(msg.get("Subject")),
            "sent": message_date(msg.get("Date")),
        })
    return result


def recent_subject_candidates(mail: imaplib.IMAP4_SSL, message_ids):
    candidates = []
    started = time.monotonic()
    total_batches = max(1, (len(message_ids) + HEADER_BATCH_SIZE - 1) // HEADER_BATCH_SIZE)
    for batch_no, start in enumerate(range(0, len(message_ids), HEADER_BATCH_SIZE), 1):
        if time.monotonic() - started > HEADER_SCAN_DEADLINE:
            raise RuntimeError(
                f"Gmail слишком долго отдаёт заголовки: превышен лимит {HEADER_SCAN_DEADLINE} сек. "
                "Импорт Триовиста остановлен без изменения данных CRM."
            )
        batch = message_ids[start:start + HEADER_BATCH_SIZE]
        log(f"  Заголовки {batch_no}/{total_batches}: {len(batch)} писем...")
        metas = fetch_message_headers_batch(mail, batch)
        for meta in metas:
            if SUBJECT_MARKER.lower() in meta["subject"].lower():
                candidates.append(meta)

    candidates.sort(key=lambda x: x["sent"], reverse=True)
    log(f"Найдено писем «{SUBJECT_MARKER}»: {len(candidates)}.")
    if candidates:
        if len(candidates) > MAX_FULL_MESSAGES:
            log(f"Полностью загружу максимум {MAX_FULL_MESSAGES} самых свежих; как только найден корректный отчёт текущего месяца — остановлюсь.")
        else:
            log("Проверяю самое свежее подходящее письмо; остальные используются только как запасные.")
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

        ids = data[0].split()
        log(f"Писем за последние {LOOKBACK_DAYS} дн.: {len(ids)}. Заголовки получаю пакетами по {HEADER_BATCH_SIZE}, без сотен отдельных IMAP-запросов.")
        headers = recent_subject_candidates(mail, ids)
        errors = []
        selected = None
        previous_fallback = None
        today = date.today()
        current_month = f"{today.year:04d}-{today.month:02d}-01"
        if today.month == 1:
            previous_month = f"{today.year - 1:04d}-12-01"
        else:
            previous_month = f"{today.year:04d}-{today.month - 1:02d}-01"

        # Кандидаты уже отсортированы от свежих к старым. Полностью скачиваем
        # только несколько свежих писем и прекращаем работу сразу после первого
        # корректного отчёта текущего месяца.
        for idx, meta in enumerate(headers, 1):
            message_id, sent = meta["id"], meta["sent"]
            log(f"  Проверяю полное письмо {idx}/{len(headers)}: {sent:%d.%m.%Y %H:%M} — {meta['subject']}")
            try:
                status, raw_data = mail.fetch(message_id, "(RFC822)")
            except Exception as exc:
                errors.append(f"{sent:%d.%m %H:%M}: IMAP {exc}")
                continue
            if status != "OK" or not raw_data:
                errors.append(f"{sent:%d.%m %H:%M}: Gmail не вернул полное письмо")
                continue
            raw = next((item[1] for item in raw_data if isinstance(item, tuple) and len(item)>1 and isinstance(item[1], (bytes, bytearray))), None)
            if not raw:
                errors.append(f"{sent:%d.%m %H:%M}: пустое тело письма")
                continue
            msg = email.message_from_bytes(raw)
            filename, content = xlsx_attachment(msg)
            if not content:
                errors.append(f"{sent:%d.%m %H:%M}: нет Excel-вложения")
                continue
            try:
                month, rows, qty, revenue = parse_current_report(content)
            except Exception as exc:
                errors.append(f"{sent:%d.%m %H:%M}: {exc}")
                continue

            parsed = (month, sent, filename, rows, qty, revenue)
            if month == current_month:
                selected = parsed
                log("  ✅ Найден корректный отчёт Триовиста за текущий месяц — дальнейший поиск не нужен.")
                break
            if month == previous_month and previous_fallback is None:
                previous_fallback = parsed
                log("  ℹ️ Найден свежий отчёт прошлого месяца; держу как запасной и продолжаю искать текущий.")

        if selected is None:
            selected = previous_fallback
        if selected is None:
            detail = "; ".join(errors[-3:])
            raise RuntimeError(f"Не найден пригодный отчёт «{SUBJECT_MARKER}». {detail}")

        month, sent, filename, rows, qty, revenue = selected
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
