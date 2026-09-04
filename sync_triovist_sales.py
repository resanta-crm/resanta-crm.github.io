#!/usr/bin/env python3
"""RESANTA CRM v22.7.31 — надёжное обновление продаж ООО «Триовист».

Скрипт работает в GitHub Actions с уже существующими IMAP/Supabase secrets.
Он не доверяет одному письму вслепую: проверяет несколько свежих отчётов,
показывает их суммы в логе, выбирает самый свежий отчёт текущего месяца,
не позволяет старому/регрессивному снимку молча затереть более полный факт и
после записи сверяет сумму/количество, которые реально читает CRM.
"""
from __future__ import annotations

import email
import imaplib
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from email.header import decode_header
from email.utils import parsedate_to_datetime

import requests

from triovist_import_core import check_current_or_previous, log, parse_current_report

IMAP_HOST = (os.environ.get("IMAP_HOST") or "imap.gmail.com").strip()
IMAP_PORT = int((os.environ.get("IMAP_PORT") or "993").strip())
IMAP_USER = os.environ["IMAP_USER"].strip()
IMAP_PASS = "".join(os.environ["IMAP_PASS"].split()).replace("\xa0", "")
SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()
SUBJECT_MARKER = (os.environ.get("TRIOVIST_SALES_SUBJECT") or "Продажи для CRM").strip()
LOOKBACK_DAYS = int(os.environ.get("TRIOVIST_SALES_LOOKBACK_DAYS", "21"))
MAIL_TIMEOUT = int(os.environ.get("TRIOVIST_IMAP_TIMEOUT_SECONDS", "45"))
MAX_FULL_MESSAGES = max(8, int(os.environ.get("TRIOVIST_MAX_EMAIL_CANDIDATES", "20")))
HEADER_BATCH_SIZE = max(20, int(os.environ.get("TRIOVIST_IMAP_HEADER_BATCH", "75")))
HEADER_SCAN_DEADLINE = max(30, int(os.environ.get("TRIOVIST_HEADER_SCAN_DEADLINE_SECONDS", "120")))
ALLOW_REGRESSION = (os.environ.get("TRIOVIST_ALLOW_REGRESSION") or "false").lower() in {"1", "true", "yes", "on"}


def decode_text(value: str | None) -> str:
    if not value:
        return ""
    parts: list[str] = []
    for part, encoding in decode_header(value):
        if isinstance(part, bytes):
            enc = encoding or "utf-8"
            if str(enc).lower() == "unknown-8bit":
                enc = "utf-8"
            try:
                parts.append(part.decode(enc, errors="replace"))
            except LookupError:
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
        raise RuntimeError("Не удалось открыть почтовый ящик")
    log("Ищу отчёт в INBOX")


def fetch_message_headers_batch(mail: imaplib.IMAP4_SSL, message_ids: list[bytes]) -> list[dict]:
    if not message_ids:
        return []
    status, data = mail.fetch(b",".join(message_ids), "(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])")
    if status != "OK":
        raise RuntimeError("Почта не вернула пакет заголовков")
    requested = {bytes(x) for x in message_ids}
    result: list[dict] = []
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
        msg = email.message_from_bytes(bytes(item[1]))
        result.append({
            "id": message_id,
            "subject": decode_text(msg.get("Subject")),
            "sent": message_date(msg.get("Date")),
        })
    return result


def recent_subject_candidates(mail: imaplib.IMAP4_SSL, message_ids: list[bytes]) -> list[dict]:
    candidates: list[dict] = []
    started = time.monotonic()
    total_batches = max(1, (len(message_ids) + HEADER_BATCH_SIZE - 1) // HEADER_BATCH_SIZE)
    for batch_no, start in enumerate(range(0, len(message_ids), HEADER_BATCH_SIZE), 1):
        if time.monotonic() - started > HEADER_SCAN_DEADLINE:
            raise RuntimeError(
                f"Почта слишком долго отдаёт заголовки: превышен лимит {HEADER_SCAN_DEADLINE} сек. "
                "Данные CRM не изменены."
            )
        batch = message_ids[start:start + HEADER_BATCH_SIZE]
        log(f"  Заголовки {batch_no}/{total_batches}: {len(batch)} писем...")
        for meta in fetch_message_headers_batch(mail, batch):
            if SUBJECT_MARKER.lower() in meta["subject"].lower():
                candidates.append(meta)
    candidates.sort(key=lambda x: x["sent"], reverse=True)
    log(f"Найдено писем по маркеру «{SUBJECT_MARKER}»: {len(candidates)}.")
    if len(candidates) > MAX_FULL_MESSAGES:
        log(f"Полностью проверю {MAX_FULL_MESSAGES} самых свежих писем.")
    return candidates[:MAX_FULL_MESSAGES]


def xlsx_attachment(msg) -> tuple[str | None, bytes | None]:
    for part in msg.walk():
        filename = decode_text(part.get_filename())
        if filename.lower().endswith(".xlsx"):
            return filename, part.get_payload(decode=True)
    return None, None


def api_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def rpc(name: str, payload: dict, timeout: int = 180):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers=api_headers(),
        json=payload,
        timeout=timeout,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase RPC {name}: {response.status_code} {response.text[:800]}")
    if response.status_code == 204 or not response.text.strip():
        return None
    return response.json()


def rpc_replace(month: str, rows: list[dict], qty: Decimal, revenue: Decimal, source: str):
    return rpc(
        "triovist_replace_month_safe",
        {
            "p_month": month,
            "p_rows": rows,
            "p_source_file": source,
            "p_expected_qty": format(qty, "f"),
            "p_expected_revenue": format(revenue, "f"),
        },
        180,
    )


def dashboard_state(month_date: str) -> dict:
    month = month_date[:7]
    data = rpc(
        "triovist_get_dashboard",
        {"p_end_month": month, "p_mode": "month", "p_start_month": None},
        120,
    ) or {}
    rows = data.get("items") if isinstance(data, dict) else []
    rows = rows if isinstance(rows, list) else []
    revenue = sum((Decimal(str(x.get("current_revenue") or 0)) for x in rows), Decimal("0")).quantize(Decimal("0.01"))
    qty = sum((Decimal(str(x.get("current_qty") or 0)) for x in rows), Decimal("0")).quantize(Decimal("0.001"))
    last = data.get("last_import") if isinstance(data, dict) and isinstance(data.get("last_import"), dict) else {}
    return {"revenue": revenue, "qty": qty, "last_import": last, "items": len(rows)}


def audit(status: str, *, month: str | None = None, sent: datetime | None = None,
          filename: str | None = None, subject: str | None = None, rows: int | None = None,
          qty: Decimal | None = None, revenue: Decimal | None = None,
          before: Decimal | None = None, after: Decimal | None = None, details: str = "") -> None:
    payload = {
        "p_status": status,
        "p_report_month": month,
        "p_email_sent_at": sent.isoformat() if sent and sent.year > 1900 else None,
        "p_source_file": filename,
        "p_source_subject": subject,
        "p_source_rows": rows,
        "p_source_qty": format(qty, "f") if qty is not None else None,
        "p_source_revenue": format(revenue, "f") if revenue is not None else None,
        "p_crm_revenue_before": format(before, "f") if before is not None else None,
        "p_crm_revenue_after": format(after, "f") if after is not None else None,
        "p_details": details[:2000] if details else None,
    }
    try:
        rpc("triovist_sales_import_audit_write", payload, 30)
    except Exception as exc:
        # Аудит не имеет права остановить сам импорт продаж.
        log(f"⚠️ Аудит импорта не записан: {exc}")




def last_published_message_at() -> datetime | None:
    """Fast hourly guard: avoid downloading/parsing the same Excel again."""
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/crm_import_status",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            params={
                "source": "eq.triovist_sales",
                "select": "source_message_at,status",
                "limit": "1",
            },
            timeout=20,
        )
        if response.status_code != 200:
            return None
        rows = response.json() or []
        if not rows or str(rows[0].get("status") or "") != "ok":
            return None
        raw = str(rows[0].get("source_message_at") or "").strip()
        if not raw:
            return None
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def publish_import_status(month: str, sent: datetime, rows: int, details: str) -> None:
    """Publish one lightweight realtime stamp only after a verified new Triovist import."""
    try:
        rpc(
            "crm_set_import_status",
            {
                "p_source": "triovist_sales",
                "p_status": "ok",
                "p_report_period": month[:7],
                "p_report_date": None,
                "p_source_message_at": sent.isoformat(),
                "p_row_count": rows,
                "p_details": details,
                "p_error_text": None,
            },
            30,
        )
    except Exception as exc:
        # Import truth is already verified in triovist tables; status signal must not roll it back.
        log(f"⚠️ Realtime-статус Триовиста не записан: {exc}")


def current_and_previous() -> tuple[str, str]:
    today = date.today()
    current = f"{today.year:04d}-{today.month:02d}-01"
    if today.month == 1:
        previous = f"{today.year - 1:04d}-12-01"
    else:
        previous = f"{today.year:04d}-{today.month - 1:02d}-01"
    return current, previous


def main() -> None:
    selected = None
    try:
        mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, timeout=MAIL_TIMEOUT)
    except Exception as exc:
        audit("error", details=f"IMAP connection: {exc}")
        raise

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
        log(f"Писем за последние {LOOKBACK_DAYS} дн.: {len(ids)}. Заголовки — пакетами по {HEADER_BATCH_SIZE}.")
        headers = recent_subject_candidates(mail, ids)

        # v23.6.60: если самое свежее письмо уже является загруженным источником,
        # заканчиваем почасовую проверку до скачивания и разбора Excel.
        last_loaded = last_published_message_at()
        if headers and last_loaded is not None:
            newest = headers[0]["sent"]
            newest_utc = newest if newest.tzinfo else newest.replace(tzinfo=timezone.utc)
            if newest_utc.astimezone(timezone.utc) <= last_loaded.astimezone(timezone.utc):
                log(f"✅ Письмо {newest:%d.%m.%Y %H:%M} уже загружено в Триовист — без изменений.")
                return

        valid: list[dict] = []
        errors: list[str] = []
        for idx, meta in enumerate(headers, 1):
            sent = meta["sent"]
            log(f"  Проверяю полное письмо {idx}/{len(headers)}: {sent:%d.%m.%Y %H:%M} — {meta['subject']}")
            try:
                status, raw_data = mail.fetch(meta["id"], "(RFC822)")
            except Exception as exc:
                errors.append(f"{sent:%d.%m %H:%M}: IMAP {exc}")
                continue
            if status != "OK" or not raw_data:
                errors.append(f"{sent:%d.%m %H:%M}: письмо не получено")
                continue
            raw = next((item[1] for item in raw_data if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], (bytes, bytearray))), None)
            if not raw:
                errors.append(f"{sent:%d.%m %H:%M}: пустое тело письма")
                continue
            msg = email.message_from_bytes(raw)
            filename, content = xlsx_attachment(msg)
            if not content:
                errors.append(f"{sent:%d.%m %H:%M}: нет .xlsx")
                continue
            try:
                month, rows, qty, revenue = parse_current_report(content)
            except Exception as exc:
                errors.append(f"{sent:%d.%m %H:%M}: {exc}")
                continue
            item = {
                "month": month, "sent": sent, "filename": filename or "report.xlsx",
                "subject": meta["subject"], "rows": rows, "qty": qty, "revenue": revenue,
            }
            valid.append(item)
            log(f"    ✅ валиден: период {month[:7]} · {len(rows)} SKU · {qty} шт. · {revenue} BYN")

        current_month, previous_month = current_and_previous()
        current_rows = [x for x in valid if x["month"] == current_month]
        fallback_rows = [x for x in valid if x["month"] == previous_month]
        pool = current_rows or fallback_rows
        if not pool:
            detail = "; ".join(errors[-5:]) or "подходящих Excel нет"
            audit("no_report", details=detail)
            raise RuntimeError(f"Не найден пригодный отчёт «{SUBJECT_MARKER}» за текущий/предыдущий месяц. {detail}")

        # Самый свежий отчёт — источник истины. При одинаковой дате/времени берём
        # вариант с большей суммой, чтобы повторная рассылка не выбрала урезанный дубль.
        pool.sort(key=lambda x: (x["sent"], x["revenue"], x["qty"]), reverse=True)
        selected = pool[0]
        month = selected["month"]
        sent = selected["sent"]
        filename = selected["filename"]
        rows = selected["rows"]
        qty = selected["qty"]
        revenue = selected["revenue"]
        check_current_or_previous(month)
        log(f"ВЫБРАН: {filename} · письмо {sent:%d.%m.%Y %H:%M} · {month[:7]} · {len(rows)} SKU · {qty} шт. · {revenue} BYN")

        before_state = dashboard_state(month)
        before_revenue: Decimal = before_state["revenue"]
        before_qty: Decimal = before_state["qty"]
        log(f"CRM ДО: {before_state['items']} SKU · {before_qty} шт. · {before_revenue} BYN")

        if month == current_month and revenue < before_revenue - Decimal("0.01") and not ALLOW_REGRESSION:
            msg = (
                f"Регрессивный снимок заблокирован: источник {revenue} BYN < CRM {before_revenue} BYN. "
                "Данные не изменены. Если уменьшение действительно корректно из-за возвратов, нужен осознанный ручной запуск с TRIOVIST_ALLOW_REGRESSION=true."
            )
            log(f"⚠️ {msg}")
            audit("regression_blocked", month=month, sent=sent, filename=filename, subject=selected["subject"],
                  rows=len(rows), qty=qty, revenue=revenue, before=before_revenue, after=before_revenue, details=msg)
            return

        if revenue == before_revenue and qty == before_qty:
            msg = "Свежий пригодный отчёт найден, но сумма и количество уже совпадают с CRM — перезапись не нужна."
            log(f"✅ {msg}")
            audit("no_change", month=month, sent=sent, filename=filename, subject=selected["subject"],
                  rows=len(rows), qty=qty, revenue=revenue, before=before_revenue, after=before_revenue, details=msg)
            return

        source = f"email · {filename} · {sent.isoformat()} · v22.7.31"
        result = rpc_replace(month, rows, qty, revenue, source)
        log(f"Supabase replace result: {result}")

        after_state = dashboard_state(month)
        after_revenue: Decimal = after_state["revenue"]
        after_qty: Decimal = after_state["qty"]
        log(f"CRM ПОСЛЕ: {after_state['items']} SKU · {after_qty} шт. · {after_revenue} BYN")

        if after_revenue != revenue or after_qty != qty:
            msg = (
                f"Контроль после записи не сошёлся: источник {qty} шт. / {revenue} BYN, "
                f"CRM показывает {after_qty} шт. / {after_revenue} BYN."
            )
            audit("error", month=month, sent=sent, filename=filename, subject=selected["subject"],
                  rows=len(rows), qty=qty, revenue=revenue, before=before_revenue, after=after_revenue, details=msg)
            raise RuntimeError(msg)

        msg = f"Триовист обновлён и проверен: {len(rows)} SKU · {qty} шт. · {revenue} BYN с НДС."
        log(f"✅ {msg}")
        audit("updated", month=month, sent=sent, filename=filename, subject=selected["subject"],
              rows=len(rows), qty=qty, revenue=revenue, before=before_revenue, after=after_revenue, details=msg)
        publish_import_status(month, sent, len(rows), msg)
    except Exception as exc:
        if selected is not None:
            audit("error", month=selected.get("month"), sent=selected.get("sent"), filename=selected.get("filename"),
                  subject=selected.get("subject"), rows=len(selected.get("rows") or []), qty=selected.get("qty"),
                  revenue=selected.get("revenue"), details=str(exc))
        log(f"ОШИБКА: {exc}")
        raise
    finally:
        try:
            mail.logout()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)
