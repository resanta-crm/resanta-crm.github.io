#!/usr/bin/env python3
"""RESANTA CRM v23.6.198 — единый импорт продаж 1С для полевых и Triovist.

Источник один: письмо «Продажи для CRM». Автоматически принимаются
ежечасные операционные срезы 09:xx–18:xx по Минску.

Главный контракт:
  * одно письмо скачивается один раз;
  * оба парсера обязаны успешно разобрать один и тот же Excel ДО записи продаж;
  * одна RPC-транзакция заменяет purchase_history и triovist_sales_override;
  * если любая проверка/запись падает — обе части откатываются;
  * статусы sales и triovist_sales подтверждаются одной транзакцией и одним
    source_message_at, поэтому интерфейс видит один и тот же срез.
"""
from __future__ import annotations

import email
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

import requests

import import_sales as field
from triovist_import_core import check_current_or_previous, parse_current_report

VERSION = "v23.6.199"
MINSK = ZoneInfo("Europe/Minsk")
TARGET_HOURS = set(range(9, 19))
LOOKBACK_DAYS = max(2, int(os.environ.get("UNIFIED_SALES_LOOKBACK_DAYS", "4")))
MAX_CANDIDATES = max(10, int(os.environ.get("UNIFIED_MAX_EMAIL_CANDIDATES", "20")))
HEADER_BATCH_SIZE = max(20, int(os.environ.get("UNIFIED_IMAP_HEADER_BATCH", "50")))
HEADER_SCAN_DEADLINE = max(30, int(os.environ.get("UNIFIED_HEADER_SCAN_DEADLINE_SECONDS", "60")))


def log(message: str) -> None:
    print(message, flush=True)


def api_headers() -> dict[str, str]:
    return {
        "apikey": field.SUPABASE_KEY,
        "Authorization": f"Bearer {field.SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def normalize_dt(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def parse_iso(value: object) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return normalize_dt(dt)
    except Exception:
        return None


def same_stamp(a: datetime | None, b: datetime | None) -> bool:
    if a is None or b is None:
        return False
    return abs((a.astimezone(timezone.utc) - b.astimezone(timezone.utc)).total_seconds()) < 1


def get_import_statuses() -> dict[str, dict]:
    try:
        response = requests.get(
            f"{field.SUPABASE_URL}/rest/v1/crm_import_status",
            headers={
                "apikey": field.SUPABASE_KEY,
                "Authorization": f"Bearer {field.SUPABASE_KEY}",
            },
            params={
                "source": "in.(sales,triovist_sales)",
                "select": "source,status,source_message_at,last_success_at,updated_at,report_period,report_date",
            },
            timeout=20,
        )
        if response.status_code != 200:
            log(f"⚠️ Статусы импорта не прочитаны: {response.status_code} {response.text[:300]}")
            return {}
        return {str(row.get("source") or ""): row for row in (response.json() or [])}
    except Exception as exc:
        log(f"⚠️ Статусы импорта не прочитаны: {exc}")
        return {}


def status_stamp(row: dict | None) -> datetime | None:
    return parse_iso((row or {}).get("source_message_at"))


def recent_subject_candidates(mail, message_ids: list[bytes]) -> list[dict]:
    """Читает свежие заголовки с конца ящика и не скачивает лишние Excel."""
    result: list[dict] = []
    started = time.monotonic()
    newest_first = list(reversed(message_ids))
    total_batches = max(1, (len(newest_first) + HEADER_BATCH_SIZE - 1) // HEADER_BATCH_SIZE)

    for batch_no, start in enumerate(range(0, len(newest_first), HEADER_BATCH_SIZE), 1):
        if time.monotonic() - started > HEADER_SCAN_DEADLINE:
            if result:
                log(f"⚠️ Дедлайн заголовков {HEADER_SCAN_DEADLINE} сек.; использую уже найденные письма: {len(result)}")
                break
            raise RuntimeError(f"Gmail не отдал свежие заголовки за {HEADER_SCAN_DEADLINE} сек.")

        batch = newest_first[start:start + HEADER_BATCH_SIZE]
        log(f"  Заголовки {batch_no}/{total_batches}: {len(batch)} писем")
        metas = field.fetch_message_headers_batch(mail, batch)
        for meta in metas:
            if field.SUBJECT_MARKER.lower() in str(meta.get("subject") or "").lower():
                result.append(meta)
        if len(result) >= MAX_CANDIDATES:
            break

    result.sort(key=lambda x: x["sent"], reverse=True)
    return result[:MAX_CANDIDATES]


def is_target_slice(meta: dict) -> bool:
    sent = normalize_dt(meta.get("sent"))
    if sent is None:
        return False
    local = sent.astimezone(MINSK)
    return local.hour in TARGET_HOURS


def slice_key(value: datetime) -> tuple[str, int]:
    local = normalize_dt(value).astimezone(MINSK)
    return local.date().isoformat(), local.hour


def choose_pending_slice(headers: list[dict], statuses: dict[str, dict]) -> dict | None:
    eligible = sorted((x for x in headers if is_target_slice(x)), key=lambda x: x["sent"])
    if not eligible:
        return None

    # В пределах одного часа 1С может повторно отправить письмо. Для CRM это всё
    # равно один логический срез; выбираем самое свежее письмо данного часа.
    by_slice: dict[tuple[str, int], dict] = {}
    for meta in eligible:
        key = slice_key(meta["sent"])
        if key not in by_slice or normalize_dt(meta["sent"]) > normalize_dt(by_slice[key]["sent"]):
            by_slice[key] = meta
    slices = sorted(by_slice.items(), key=lambda item: item[0])

    sales_row = statuses.get("sales") or {}
    tri_row = statuses.get("triovist_sales") or {}
    sales_stamp = status_stamp(sales_row)
    tri_stamp = status_stamp(tri_row)
    sales_period = str(sales_row.get("report_period") or "").strip()
    tri_period = str(tri_row.get("report_period") or "").strip()
    stamps = [x for x in (sales_stamp, tri_stamp) if x is not None]

    if sales_stamp is not None and tri_stamp is not None and same_stamp(sales_stamp, tri_stamp):
        baseline_key = slice_key(max(stamps))
        pending = [meta for key, meta in slices if key > baseline_key]
        return pending[-1] if pending else None

    # ВАЖНО при переходе месяца: legacy-импорт одной части мог уже записать
    # октябрь, когда вторая часть ещё оставалась на незакрытом сентябре.
    # Нельзя брать max(source_message_at): тогда финальный срез прошлого месяца
    # (например 30.09 17:00) навсегда считается "старым" и пропускается.
    # Сначала закрываем более старый report_period самым свежим разрешённым
    # срезом этого месяца, и только затем движемся в новый месяц.
    if sales_period and tri_period and sales_period != tri_period:
        older_period = min(sales_period, tri_period)
        older_stamp = sales_stamp if sales_period == older_period else tri_stamp
        candidates = []
        for key, meta in slices:
            local = normalize_dt(meta["sent"]).astimezone(MINSK)
            if local.strftime("%Y-%m") != older_period:
                continue
            if older_stamp is not None and normalize_dt(meta["sent"]) <= older_stamp:
                continue
            candidates.append(meta)
        if candidates:
            chosen = candidates[-1]
            local = normalize_dt(chosen["sent"]).astimezone(MINSK)
            log(
                f"⚠️ Месяцы sales/Triovist разошлись ({sales_period} vs {tri_period}). "
                f"Сначала закрываю {older_period} срезом {local:%d.%m.%Y %H:%M}."
            )
            return chosen

    # Переход со старой раздельной схемы внутри одного месяца: синхронизируем обе
    # части на логическом срезе, которого уже достигла более свежая цепочка.
    if stamps:
        baseline_key = slice_key(max(stamps))
        same = [meta for key, meta in slices if key == baseline_key]
        if same:
            return same[-1]
        pending = [meta for key, meta in slices if key > baseline_key]
        return pending[-1] if pending else None

    return slices[-1][1]


def fetch_full_message(mail, meta: dict) -> tuple[str, bytes]:
    sent = normalize_dt(meta["sent"])
    status, raw_data = mail.fetch(meta["id"], "(RFC822)")
    if status != "OK" or not raw_data:
        raise RuntimeError(f"Gmail не вернул письмо {sent:%d.%m.%Y %H:%M}")
    raw = next(
        (item[1] for item in raw_data if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], (bytes, bytearray))),
        None,
    )
    if not raw:
        raise RuntimeError("Пустое тело письма")
    msg = email.message_from_bytes(raw)
    filename, content = field.find_xlsx_in_email(msg)
    if not content:
        raise RuntimeError("В письме нет Excel-вложения")
    if content[:2] != b"PK":
        raise RuntimeError("Продажи 1С должны приходить в .xlsx; .xls не поддерживается")
    return filename or "Продажи для CRM.xlsx", content


def clean_field_rows(rows: list[dict]) -> list[dict]:
    keys = (
        "client_name", "category", "subgroup", "product", "sku", "month",
        "qty", "revenue", "manager_name", "client_id",
    )
    return [{key: row.get(key) for key in keys} for row in rows]


def field_totals(rows: list[dict]) -> tuple[Decimal, Decimal]:
    qty = sum((Decimal(str(row.get("qty") or 0)) for row in rows), Decimal("0"))
    revenue = sum((Decimal(str(row.get("revenue") or 0)) for row in rows), Decimal("0"))
    return qty.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP), revenue.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def unified_replace(
    *,
    month: str,
    report_date: date,
    sent: datetime,
    filename: str,
    field_rows: list[dict],
    field_qty: Decimal,
    field_revenue: Decimal,
    tri_rows: list[dict],
    tri_qty: Decimal,
    tri_revenue: Decimal,
) -> dict:
    local = sent.astimezone(MINSK)
    details = (
        f"1С: срез {local:%d.%m.%Y, %H:%M}; "
        f"полевые {len(field_rows)} строк / {field_qty} шт. / {field_revenue} BYN; "
        f"Triovist {len(tri_rows)} SKU / {tri_qty} шт. / {tri_revenue} BYN; "
        f"файл {filename}; {VERSION}"
    )
    source = f"email · {filename} · {sent.isoformat()} · {VERSION}"
    payload = {
        "p_month": month,
        "p_field_rows": clean_field_rows(field_rows),
        "p_field_expected_qty": format(field_qty, "f"),
        "p_field_expected_revenue": format(field_revenue, "f"),
        "p_triovist_rows": tri_rows,
        "p_triovist_expected_qty": format(tri_qty, "f"),
        "p_triovist_expected_revenue": format(tri_revenue, "f"),
        "p_source_file": source,
        "p_report_period": month[:7],
        "p_report_date": report_date.isoformat(),
        "p_source_message_at": sent.isoformat(),
        "p_field_row_count": len(field_rows),
        "p_triovist_row_count": len(tri_rows),
        "p_details": details,
    }
    response = requests.post(
        f"{field.SUPABASE_URL}/rest/v1/rpc/crm_replace_sales_snapshot_unified",
        headers=api_headers(),
        json=payload,
        timeout=240,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Единая транзакция продаж не выполнена: {response.status_code} {response.text[:1200]}")
    if response.status_code == 204 or not response.text.strip():
        return {}
    data = response.json()
    return data if isinstance(data, dict) else {"result": data}


def mark_pair_error(message: str, *, report_period: str | None = None, report_date: date | None = None) -> None:
    for source in ("sales", "triovist_sales"):
        field.safe_set_import_status(
            source,
            "error",
            report_period=report_period,
            report_date=report_date.isoformat() if report_date else None,
            source_message_at=None,
            row_count=None,
            details=f"Единый импорт {VERSION}",
            error_text=message[:2000],
        )


def refresh_secondary_data(report_end: date, month: str, sent: datetime, rows: list[dict]) -> None:
    field.save_vip_yoy_snapshot(report_end, month, rows, source_message_at=sent.isoformat())
    try:
        response = requests.post(
            f"{field.SUPABASE_URL}/rest/v1/rpc/refresh_client_revenue_totals",
            headers=api_headers(),
            json={},
            timeout=120,
        )
        if response.status_code not in (200, 201, 204):
            log(f"⚠️ Пересчёт оборотов клиентов пропущен: {response.status_code} {response.text[:300]}")
    except Exception as exc:
        log(f"⚠️ Пересчёт оборотов клиентов пропущен: {exc}")
    field.capture_promotion_sales_snapshots(month, sent.isoformat())


def main() -> None:
    selected: dict | None = None
    report_period: str | None = None
    report_end: date | None = None
    mail = None
    try:
        log(f"RESANTA {VERSION}: единый импорт 1С 09:00 / 13:00 / 17:00")
        mail = field.imaplib.IMAP4_SSL(field.IMAP_HOST, field.IMAP_PORT, timeout=field.MAIL_TIMEOUT)
        mail.login(field.IMAP_USER, field.IMAP_PASS)
        field.select_mailbox(mail)
        try:
            mail.sock.settimeout(field.MAIL_TIMEOUT)
        except Exception:
            pass

        since = (datetime.now(MINSK).date() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
        status, data = mail.search(None, f"(SINCE {since})")
        if status != "OK":
            raise RuntimeError("Не удалось получить список писем")
        ids = data[0].split()
        log(f"Писем за {LOOKBACK_DAYS} дн.: {len(ids)}")

        headers = recent_subject_candidates(mail, ids)
        statuses = get_import_statuses()
        selected = choose_pending_slice(headers, statuses)
        if selected is None:
            log("✅ Нового разрешённого среза 09:00 / 13:00 / 17:00 нет — без изменений.")
            return

        sent = normalize_dt(selected["sent"])
        local = sent.astimezone(MINSK)
        log(f"ВЫБРАН единый срез: {local:%d.%m.%Y %H:%M} — {selected['subject']}")
        filename, content = fetch_full_message(mail, selected)

        month, field_rows = field.parse_sales(content)
        _report_start, report_end = field.parse_report_bounds(content)
        tri_month, tri_rows, tri_qty, tri_revenue = parse_current_report(content)
        if month != tri_month:
            raise RuntimeError(f"Парсеры увидели разные месяцы: полевые {month}, Triovist {tri_month}")
        report_period = month[:7]
        field.check_period(month)
        check_current_or_previous(tri_month)

        field_qty, field_revenue = field_totals(field_rows)
        log(f"  Полевые: {len(field_rows)} строк · {field_qty} шт. · {field_revenue} BYN")
        log(f"  Triovist: {len(tri_rows)} SKU · {tri_qty} шт. · {tri_revenue} BYN")

        try:
            field.ensure_clients_exist(field_rows)
        except Exception as exc:
            log(f"⚠️ Автозаведение клиентов не выполнено: {exc}")
        try:
            field.attach_client_ids(field_rows)
        except Exception as exc:
            log(f"⚠️ Привязка client_id не выполнена: {exc}")

        result = unified_replace(
            month=month,
            report_date=report_end,
            sent=sent,
            filename=filename,
            field_rows=field_rows,
            field_qty=field_qty,
            field_revenue=field_revenue,
            tri_rows=tri_rows,
            tri_qty=tri_qty,
            tri_revenue=tri_revenue,
        )
        log(f"✅ Единая транзакция подтверждена: {result}")

        refresh_secondary_data(report_end, month, sent, field_rows)
        log(f"ГОТОВО: один срез {local:%d.%m.%Y %H:%M} применён к полевым и Triovist.")
    except Exception as exc:
        mark_pair_error(str(exc), report_period=report_period, report_date=report_end)
        log(f"ОШИБКА: {exc}")
        raise
    finally:
        if mail is not None:
            try:
                mail.logout()
            except Exception:
                pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)
