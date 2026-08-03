#!/usr/bin/env python3
"""Импорт отчёта 1С «Поступление денег» в Resanta CRM.

Источник:
- по умолчанию — самое свежее письмо за последние PAYMENTS_LOOKBACK_DAYS дней,
  тема которого содержит PAYMENTS_SUBJECT_MARKER;
- для локальной проверки можно задать PAYMENTS_FILE=/path/report.xlsx.

В CRM загружаются ТОЛЬКО блоки сотрудников, которые в public.users имеют
role='manager'. Руководители, интернет-магазины, служебные блоки и строки без
менеджера отбрасываются.

Структура результата:
Менеджер → Клиент → Платёжный документ → Дата/время → Сумма.
Если один документ в отчёте 1С разбит на несколько строк, суммы объединяются.
"""

from __future__ import annotations

import email
import imaplib
import io
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import pandas as pd
import requests

IMAP_HOST = os.environ.get("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
IMAP_USER = os.environ.get("IMAP_USER", "").strip()
IMAP_PASS = "".join(os.environ.get("IMAP_PASS", "").split()).replace("\xa0", "")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SUBJECT_MARKER = os.environ.get("PAYMENTS_SUBJECT_MARKER", "Поступление денег для CRM").strip()
LOOKBACK_DAYS = int(os.environ.get("PAYMENTS_LOOKBACK_DAYS", "10"))
LOCAL_FILE = os.environ.get("PAYMENTS_FILE", "").strip()

DOC_RE = re.compile(
    r"^(?P<doc_type>.+?)\s+(?P<number>[0-9A-Za-zА-Яа-яЁё-]+)\s+от\s+"
    r"(?P<date>\d{2}\.\d{2}\.\d{4})(?:\s+(?P<time>\d{2}:\d{2}:\d{2}))?$"
)
PERIOD_RE = re.compile(r"Период\s*:\s*(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})", re.I)
LEGAL_FORMS_RE = re.compile(
    r"\b(ООО|ОДО|ОАО|ЗАО|ЧУП|ЧТУП|ЧП|ЧТПУП|УП|ИП|ПТУП|УЧП|СПК|КФХ|РУП|КУП|ГУ|ТД)\b",
    re.I,
)


def log(message: str) -> None:
    print(message, flush=True)


def api_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def api_get(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}", headers=api_headers(), params=params, timeout=60
    )
    if response.status_code != 200:
        raise RuntimeError(f"Supabase GET {table}: {response.status_code} {response.text}")
    return response.json()


def set_import_status(status: str, **kwargs: Any) -> None:
    payload = {
        "p_source": "payments",
        "p_status": status,
        "p_report_period": kwargs.get("report_period"),
        "p_report_date": kwargs.get("report_date"),
        "p_source_message_at": kwargs.get("source_message_at"),
        "p_row_count": kwargs.get("row_count"),
        "p_details": kwargs.get("details"),
        "p_error_text": kwargs.get("error_text"),
    }
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/crm_set_import_status",
        headers=api_headers(), json=payload, timeout=30,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Статус импорта: {response.status_code} {response.text}")


def safe_status(status: str, **kwargs: Any) -> None:
    try:
        set_import_status(status, **kwargs)
    except Exception as exc:  # служебный статус не должен скрывать основную ошибку
        log(f"⚠️ Не удалось записать статус импорта: {exc}")


def decode_header_text(value: str | None) -> str:
    result = []
    for part, encoding in decode_header(value or ""):
        if isinstance(part, bytes):
            result.append(part.decode(encoding or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)


def normalized_message_date(value: str | None) -> datetime:
    try:
        dt = parsedate_to_datetime(value or "")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
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
        log(f"⚠️ Папка всей почты недоступна: {exc}")
    if mail.select("INBOX")[0] != "OK":
        raise RuntimeError("Не удалось открыть INBOX")


def candidate_attachments() -> list[tuple[bytes, str, datetime]]:
    """Возвращает все подходящие Excel-вложения за окно поиска.

    Выбор самого свежего отчёта выполняется позже по периоду ВНУТРИ файла,
    а не только по дате письма. Это исключает откат на июль, если старый файл
    был переслан позже августовского.
    """
    if not IMAP_USER or not IMAP_PASS:
        raise RuntimeError("Не заданы IMAP_USER / IMAP_PASS")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    try:
        mail.login(IMAP_USER, IMAP_PASS)
        select_mailbox(mail)
        since = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
        status, data = mail.search(None, f'(SINCE "{since}")')
        if status != "OK":
            raise RuntimeError("Не удалось найти письма")
        candidates: list[tuple[bytes, str, datetime]] = []
        for msg_id in (data[0].split() if data and data[0] else []):
            st, raw = mail.fetch(msg_id, "(RFC822)")
            if st != "OK" or not raw or not raw[0]:
                continue
            message = email.message_from_bytes(raw[0][1])
            subject = decode_header_text(message.get("Subject"))
            if SUBJECT_MARKER.lower() not in subject.lower() and "поступление денег" not in subject.lower():
                continue
            message_at = normalized_message_date(message.get("Date"))
            for part in message.walk():
                filename = decode_header_text(part.get_filename())
                if not filename or not filename.lower().endswith((".xlsx", ".xls")):
                    continue
                payload = part.get_payload(decode=True)
                if payload:
                    candidates.append((payload, filename, message_at))
        if not candidates:
            raise RuntimeError(
                f"За {LOOKBACK_DAYS} дней не найдено письмо с Excel-вложением и темой «{SUBJECT_MARKER}»"
            )
        return candidates
    finally:
        try:
            mail.logout()
        except Exception:
            pass

def normalize_name(value: Any) -> str:
    text = str(value or "").lower().replace("ё", "е")
    text = LEGAL_FORMS_RE.sub(" ", text)
    text = re.sub(r"[^a-zа-я0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def as_number(value: Any) -> float | None:
    number = pd.to_numeric(value, errors="coerce")
    return None if pd.isna(number) else float(number)


def load_crm_reference() -> tuple[list[str], dict[str, str], dict[str, str]]:
    users = api_get("users", {"select": "name,role", "role": "eq.manager"})
    managers = [str(row.get("name") or "").strip() for row in users if row.get("name")]
    if not managers:
        raise RuntimeError("В таблице users нет сотрудников с role=manager")

    clients = api_get("clients", {"select": "id,name,manager_name"})
    aliases = api_get("client_aliases", {"select": "client_id,alias_name"})
    client_by_key: dict[str, str] = {}
    ambiguous: set[str] = set()

    def add(key: str, client_id: str) -> None:
        if not key:
            return
        if key in client_by_key and client_by_key[key] != client_id:
            ambiguous.add(key)
            client_by_key.pop(key, None)
        elif key not in ambiguous:
            client_by_key[key] = client_id

    for row in clients:
        add(normalize_name(row.get("name")), str(row.get("id")))
    for row in aliases:
        add(normalize_name(row.get("alias_name")), str(row.get("client_id")))
    return managers, client_by_key, {normalize_name(m): m for m in managers}


def manager_match(value: str, official: list[str]) -> str | None:
    norm = normalize_name(value)
    if not norm:
        return None
    for name in official:
        if norm == normalize_name(name):
            return name
    # В отчёте обычно полное ФИО. Если написание отличается, фамилия должна
    # совпасть целым первым словом и быть уникальной среди менеджеров CRM.
    first = norm.split()[0]
    matches = [name for name in official if normalize_name(name).split()[0] == first]
    return matches[0] if len(matches) == 1 else None


def report_period(df: pd.DataFrame) -> tuple[date, date]:
    for value in df.astype(object).values.flatten().tolist():
        if pd.isna(value):
            continue
        match = PERIOD_RE.search(str(value))
        if match:
            return (
                datetime.strptime(match.group(1), "%d.%m.%Y").date(),
                datetime.strptime(match.group(2), "%d.%m.%Y").date(),
            )
    raise RuntimeError("В отчёте не найден параметр «Период: ДД.ММ.ГГГГ - ДД.ММ.ГГГГ»")


def amount_column(df: pd.DataFrame) -> int:
    for _, row in df.iterrows():
        for col, value in row.items():
            if str(value or "").strip().lower() == "сумма":
                return int(col)
    # Резерв: крайняя справа колонка, где есть числовые значения.
    best_col, best_count = -1, 0
    for col in df.columns:
        count = sum(as_number(v) is not None for v in df[col].tolist())
        if count > best_count:
            best_col, best_count = int(col), count
    if best_col < 0:
        raise RuntimeError("Не найдена колонка суммы")
    return best_col


def parse_report(payload: bytes, managers: list[str], client_by_key: dict[str, str]) -> tuple[date, date, list[dict[str, Any]], dict[str, float]]:
    df = pd.read_excel(io.BytesIO(payload), header=None, dtype=object)
    start, end = report_period(df)
    amount_col = amount_column(df)

    # Следующая значимая строка нужна, чтобы отличать строку менеджера/служебного
    # блока от клиента: после менеджера идёт клиент, после клиента — документ.
    meaningful = []
    for _, row in df.iterrows():
        text = str(row.iloc[0] or "").strip() if not pd.isna(row.iloc[0]) else ""
        amount = as_number(row.iloc[amount_col])
        meaningful.append(bool(text and amount is not None))
    next_is_non_document = [False] * len(df)
    for i in range(len(df)):
        j = i + 1
        while j < len(df) and not meaningful[j]:
            j += 1
        if j < len(df):
            next_text = str(df.iloc[j, 0] or "").strip()
            next_is_non_document[i] = DOC_RE.match(next_text) is None

    current_manager: str | None = None
    current_client: str | None = None
    expected_totals: dict[str, float] = {}
    raw_docs: list[dict[str, Any]] = []

    for i, row in df.iterrows():
        raw_text = row.iloc[0]
        text = "" if pd.isna(raw_text) else str(raw_text).strip()
        if not text:
            continue
        amount = as_number(row.iloc[amount_col])

        matched_manager = manager_match(text, managers)
        if matched_manager and amount is not None:
            current_manager = matched_manager
            current_client = None
            expected_totals[current_manager] = amount
            continue

        doc = DOC_RE.match(text)
        if doc:
            if current_manager and current_client and amount not in (None, 0):
                stamp = doc.group("date") + " " + (doc.group("time") or "00:00:00")
                document_at = datetime.strptime(stamp, "%d.%m.%Y %H:%M:%S").replace(tzinfo=timezone.utc)
                raw_docs.append({
                    "manager_name": current_manager,
                    "client_name": current_client,
                    "client_id": client_by_key.get(normalize_name(current_client)),
                    "document_type": doc.group("doc_type").strip(),
                    "document_number": doc.group("number").strip(),
                    "document_at": document_at.isoformat(),
                    "amount": round(amount, 2),
                })
            continue

        if amount is None:
            continue

        # Любой неразрешённый верхнеуровневый блок (например интернет-магазин,
        # другой руководитель или служебная организация) обнуляет менеджера.
        if next_is_non_document[i]:
            current_manager = None
            current_client = None
            continue

        if current_manager and text.lower() not in {"менеджер", "партнер", "регистратор"}:
            current_client = text

    if not raw_docs:
        raise RuntimeError("В отчёте не найдено поступлений по менеджерам CRM")

    # Объединяем разбитые строки одного документа.
    aggregate: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in raw_docs:
        key = (row["manager_name"], row["client_name"], row["document_number"], row["document_at"])
        if key not in aggregate:
            aggregate[key] = dict(row)
        else:
            aggregate[key]["amount"] = round(aggregate[key]["amount"] + row["amount"], 2)

    result = sorted(aggregate.values(), key=lambda x: (x["manager_name"], x["client_name"], x["document_at"], x["document_number"]))

    parsed_totals: dict[str, float] = defaultdict(float)
    for row in result:
        parsed_totals[row["manager_name"]] += float(row["amount"])
    for manager, expected in expected_totals.items():
        actual = round(parsed_totals.get(manager, 0.0), 2)
        if abs(actual - round(expected, 2)) > 0.05:
            raise RuntimeError(
                f"Контроль суммы не пройден: {manager}: итог отчёта {expected:.2f}, разобрано {actual:.2f} BYN"
            )

    return start, end, result, dict(parsed_totals)


def replace_period(start: date, end: date, rows: list[dict[str, Any]], filename: str, message_at: datetime | None) -> int:
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/replace_cash_receipts_period",
        headers=api_headers(),
        json={
            "p_period_start": start.isoformat(),
            "p_period_end": end.isoformat(),
            "p_rows": rows,
            "p_source_file": filename,
            "p_source_message_at": message_at.isoformat() if message_at else None,
        },
        timeout=120,
    )
    if response.status_code not in (200, 201):
        raise RuntimeError(f"Запись поступлений: {response.status_code} {response.text}")
    value = response.json()
    return int(value[0] if isinstance(value, list) else value)


def main() -> None:
    message_at: datetime | None = None
    filename = ""
    start: date | None = None
    end: date | None = None
    try:
        safe_status("running", details="Поиск отчёта поступлений денег")
        if LOCAL_FILE:
            path = Path(LOCAL_FILE)
            payload = path.read_bytes()
            filename = path.name
            message_at = datetime.now(timezone.utc)
            log(f"Локальный файл: {filename}")
        managers, client_by_key, _ = load_crm_reference()
        log("Менеджеры CRM: " + ", ".join(managers))

        if LOCAL_FILE:
            start, end, rows, totals = parse_report(payload, managers, client_by_key)
        else:
            parsed = []
            errors = []
            for candidate_payload, candidate_filename, candidate_at in candidate_attachments():
                try:
                    c_start, c_end, c_rows, c_totals = parse_report(candidate_payload, managers, client_by_key)
                    parsed.append((c_end, c_start, candidate_at, candidate_filename, c_rows, c_totals))
                except Exception as candidate_error:
                    errors.append(f"{candidate_filename}: {candidate_error}")
            if not parsed:
                detail = "; ".join(errors[-3:])
                raise RuntimeError("Не найден пригодный отчёт поступлений" + (f": {detail}" if detail else ""))
            parsed.sort(key=lambda x: (x[0], x[1], x[2]))
            end, start, message_at, filename, rows, totals = parsed[-1]
            log(f"Выбран отчёт по максимальному периоду: {filename}, {message_at.isoformat()}")
        log(f"Период: {start} — {end}; документов после объединения: {len(rows)}")
        for manager, total in sorted(totals.items()):
            log(f"  {manager}: {total:,.2f} BYN")

        inserted = replace_period(start, end, rows, filename, message_at)
        safe_status(
            "ok", report_period=f"{start} — {end}", report_date=end,
            source_message_at=message_at, row_count=inserted,
            details=f"Файл {filename}; выбран по периоду внутри отчёта",
        )
        log(f"✅ В CRM записано документов: {inserted}")
    except Exception as exc:
        period = f"{start} — {end}" if start and end else None
        safe_status(
            "error", report_period=period, report_date=end,
            source_message_at=message_at, details=f"Файл {filename or 'не найден'}",
            error_text=str(exc)[:3000],
        )
        log(f"❌ {exc}")
        raise


if __name__ == "__main__":
    main()
