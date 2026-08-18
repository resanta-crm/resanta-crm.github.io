#!/usr/bin/env python3
"""Resanta CRM — resilient PDZ importer v23.4.9.

Keeps the proven parser/writer from import_pdz.py, but replaces the expensive
"download every message" IMAP scan with a header-first bounded search.
The newest valid report is selected by the report date inside Excel, not by
mail delivery order. Old good CRM data is never deleted on an import error.
"""
from __future__ import annotations

import email
import imaplib
import os
import re
import sys
from datetime import date, datetime
from email.header import decode_header
from typing import Any

import import_pdz as base

HEADER_BATCH_SIZE = max(20, min(500, int(os.environ.get("PDZ_HEADER_BATCH_SIZE", "100"))))
HEADER_SCAN_LIMIT = max(200, min(20000, int(os.environ.get("PDZ_HEADER_SCAN_LIMIT", "3000"))))
MAX_CANDIDATE_EMAILS = max(3, min(30, int(os.environ.get("PDZ_MAX_CANDIDATE_EMAILS", "12"))))


def decode_text(value: str | None) -> str:
    parts: list[str] = []
    for chunk, enc in decode_header(value or ""):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(enc or "utf-8", errors="replace"))
        else:
            parts.append(chunk)
    return "".join(parts)


def header_rows(mail: imaplib.IMAP4_SSL, msg_ids: list[bytes]) -> list[tuple[bytes, str, datetime]]:
    if not msg_ids:
        return []
    status, raw = mail.fetch(
        b",".join(msg_ids).decode("ascii"),
        "(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)])",
    )
    if status != "OK":
        return []
    out: list[tuple[bytes, str, datetime]] = []
    for item in raw or []:
        if not isinstance(item, tuple) or len(item) < 2:
            continue
        meta, payload = item[0], item[1]
        if not isinstance(meta, (bytes, bytearray)) or not isinstance(payload, (bytes, bytearray)):
            continue
        match = re.match(br"\s*(\d+)\s", bytes(meta))
        if not match:
            continue
        msg = email.message_from_bytes(bytes(payload))
        out.append((match.group(1), decode_text(msg.get("Subject")), base.normalize_message_date(msg.get("Date"))))
    return out


def parsed_candidates() -> tuple[list[tuple[Any, ...]], list[str]]:
    """Return parsed PDZ candidates after downloading only a small bounded set."""
    base.log(f"Подключаюсь к почте {base.IMAP_HOST}:{base.IMAP_PORT} как {base.IMAP_USER}")
    mail = imaplib.IMAP4_SSL(base.IMAP_HOST, base.IMAP_PORT)
    try:
        mail.login(base.IMAP_USER, base.IMAP_PASS)
        base.select_mailbox(mail)
        since = (date.today() - base.timedelta(days=base.LOOKBACK_DAYS)).strftime("%d-%b-%Y")
        status, data = mail.search(None, f'(SINCE "{since}")')
        if status != "OK":
            raise RuntimeError("Не удалось получить список писем")
        all_ids = data[0].split() if data and data[0] else []
        if not all_ids:
            raise RuntimeError(f"За последние {base.LOOKBACK_DAYS} дней писем нет")

        newest = list(reversed(all_ids[-HEADER_SCAN_LIMIT:]))
        hits: list[tuple[bytes, str, datetime]] = []
        scanned = 0
        for offset in range(0, len(newest), HEADER_BATCH_SIZE):
            batch = newest[offset:offset + HEADER_BATCH_SIZE]
            rows = header_rows(mail, batch)
            scanned += len(rows)
            for msg_id, subject, sent in rows:
                if base.SUBJECT_MARKER.lower() in subject.lower():
                    hits.append((msg_id, subject, sent))
            if len(hits) >= MAX_CANDIDATE_EMAILS:
                break

        hits.sort(key=lambda x: (x[2], int(x[0])), reverse=True)
        hits = hits[:MAX_CANDIDATE_EMAILS]
        base.log(
            f"PDZ IMAP safe scan: писем={len(all_ids)}, заголовков={scanned}, "
            f"кандидатов для полного скачивания={len(hits)}"
        )
        if not hits:
            raise RuntimeError(
                f"Не найдено письмо с темой «{base.SUBJECT_MARKER}» за {base.LOOKBACK_DAYS} дней"
            )

        parsed: list[tuple[Any, ...]] = []
        errors: list[str] = []
        for msg_id, _, header_sent in hits:
            st, raw = mail.fetch(msg_id, "(BODY.PEEK[])")
            if st != "OK" or not raw:
                errors.append(f"message {msg_id.decode()}: не удалось скачать")
                continue
            payload = None
            for item in raw:
                if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], (bytes, bytearray)):
                    payload = bytes(item[1])
                    break
            if not payload:
                errors.append(f"message {msg_id.decode()}: пустое письмо")
                continue
            msg = email.message_from_bytes(payload)
            subject = decode_text(msg.get("Subject"))
            sent = base.normalize_message_date(msg.get("Date")) or header_sent
            filename, content = base.find_xlsx_in_email(msg)
            if not content:
                errors.append(f"{sent:%d.%m %H:%M}: нет Excel-вложения")
                continue
            try:
                rows, report_date, meta = base.parse_pdz(content)
                parsed.append((report_date or date.min, sent, subject, filename, rows, report_date, meta))
            except Exception as exc:
                errors.append(f"{sent:%d.%m %H:%M}: {filename}: {exc}")
        return parsed, errors
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def main() -> None:
    base.safe_set_import_status("pdz", "running", details="PDZ safe header-first scan v23.4.9")
    report_date = None
    sent = None
    rows = None
    try:
        parsed, parse_errors = parsed_candidates()
        if not parsed:
            detail = "; ".join(parse_errors[-3:])
            raise RuntimeError(
                f"Не найден пригодный отчёт «{base.SUBJECT_MARKER}»"
                + (f". Последние ошибки: {detail}" if detail else "")
            )
        parsed.sort(key=lambda x: (x[0], x[1]))
        _, sent, subject, filename, rows, report_date, meta = parsed[-1]
        base.IMPORT_CONTEXT.update({
            "report_date": report_date.isoformat() if report_date else None,
            "source_message_at": sent.isoformat() if sent else None,
            "row_count": len(rows),
        })
        base.log(f"Выбран PDZ отчёт: «{subject}» от {sent:%d.%m.%Y %H:%M}")
        base.log(f"  Вложение: {filename}, строк с просрочкой: {len(rows)}")
        if report_date is None:
            raise RuntimeError("Не удалось прочитать дату отчёта из файла ПДЗ")
        age = (date.today() - report_date).days
        base.log(f"  Отчёт построен на {report_date:%d.%m.%Y} (возраст: {age} дн.)")
        if age < 0:
            raise RuntimeError(f"Дата отчёта ПДЗ находится в будущем: {report_date:%d.%m.%Y}")
        if age > base.MAX_REPORT_AGE_DAYS:
            raise RuntimeError(
                f"Отчёт ПДЗ построен на {report_date:%d.%m.%Y}, это старше допустимых "
                f"{base.MAX_REPORT_AGE_DAYS} дн. Последний хороший срез сохранён."
            )
        if not rows and not meta.get("validated_zero"):
            raise RuntimeError(
                "В отчёте не разобрано ни одного должника и не подтверждены нулевые итоги менеджеров. "
                "Последний хороший срез сохранён."
            )

        total = sum(float(row.get("debt_overdue") or 0) for row in rows)
        base.replace_debt_table(rows, report_date, sent.isoformat())
        base.safe_set_import_status(
            "pdz", "ok",
            report_date=report_date.isoformat(),
            source_message_at=sent.isoformat(),
            row_count=len(rows),
            details=(
                "ПДЗ отсутствует — отчёт проверен"
                if not rows else f"Просрочено {total:.2f} BYN; файл {filename}; safe scan v23.4.9"
            ),
        )
        base.log(f"✅ PDZ v23.4.9: строк={len(rows)}, просрочено={total:,.2f} BYN")
    except Exception as exc:
        base.safe_set_import_status(
            "pdz", "error",
            report_date=report_date.isoformat() if report_date else None,
            source_message_at=sent.isoformat() if sent else None,
            row_count=len(rows) if isinstance(rows, list) else None,
            details="PDZ safe header-first scan v23.4.9; старый хороший срез не удалён",
            error_text=str(exc)[:2000],
        )
        base.log(f"ОШИБКА PDZ v23.4.9: {exc}")
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)
