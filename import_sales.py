#!/usr/bin/env python3
"""
Импорт ежемесячного отчёта продаж из почты в Supabase (purchase_history).

Как работает:
  1. Заходит на почту по IMAP (Gmail).
  2. Ищет НЕПРОЧИТАННЫЕ письма с темой, содержащей "Продажи для CRM".
  3. Достаёт вложение .xlsx и разбирает его.
  4. Заменяет в purchase_history данные ЗА ЭТОТ МЕСЯЦ на новые
     (старые месяцы не трогает — история накапливается).
  5. Помечает письмо прочитанным.

Зачем: на основе purchase_history в CRM строится МАСТ-ЛИСТ клиента —
"какие товары этот клиент покупает". Раньше историю грузили вручную.

Структура отчёта 1С ("Валовая прибыль предприятия"):
  Иерархия задана ОТСТУПАМИ в первой колонке:
    отступ 0 — Клиент          (напр. "Руд Буд ЧТУП")
    отступ 2 — Категория       (напр. "САДОВАЯ ТЕХНИКА")
    отступ 4 — Подгруппа       (напр. "Прочее")
    отступ 6 — Товар           (напр. "Опрыскиватель SP-10AC Huter")
  Менеджеры — в КОЛОНКАХ (у каждого своя пара "Количество"/"Выручка"),
  их имена записаны в строке-шапке. Мы находим эти колонки по именам,
  чтобы не зависеть от их порядка и количества.
  Период (месяц) берём из строки "Параметры: Период: 01.07.2026 - 31.07.2026".

Все секреты — из переменных окружения (в GitHub из Secrets).
"""

import os
import sys
import re
import imaplib
import email
import io
from email.header import decode_header
from datetime import datetime

import openpyxl
import requests

# ---------- Настройки ----------
IMAP_HOST = os.environ.get("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
IMAP_USER = os.environ["IMAP_USER"].strip()
# Пароль приложения Google копируется с неразрывными пробелами — вычищаем их.
IMAP_PASS = "".join(os.environ["IMAP_PASS"].split()).replace("\xa0", "")

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()

SUBJECT_MARKER = "Продажи для CRM"

# Менеджеры, чьи продажи грузим. Остальных (Савон, Азаров и др.) игнорируем.
ALLOWED_MANAGERS = ["Руднев", "Ачинович", "Шкуран"]

# Уровни иерархии по отступу в Excel.
LEVEL_CLIENT, LEVEL_CATEGORY, LEVEL_SUBGROUP, LEVEL_PRODUCT = 0, 2, 4, 6

MONTHS_RU = {
    1: "янв", 2: "фев", 3: "мар", 4: "апр", 5: "май", 6: "июн",
    7: "июл", 8: "авг", 9: "сен", 10: "окт", 11: "ноя", 12: "дек",
}


def log(msg):
    print(msg, flush=True)


def short_manager(full_name):
    """'Руднев Александр Александрович' -> 'Руднев' (как в CRM)."""
    for surname in ALLOWED_MANAGERS:
        if surname.lower() in (full_name or "").lower():
            return surname
    return None


def parse_period(ws):
    """Достаёт месяц отчёта из строки 'Период: 01.07.2026 - 31.07.2026'.
    Возвращает '2026-07-01' — как хранится month в purchase_history."""
    for row in ws.iter_rows(min_row=1, max_row=12, max_col=6):
        for cell in row:
            if not cell.value:
                continue
            m = re.search(r"Период:\s*(\d{2})\.(\d{2})\.(\d{4})", str(cell.value))
            if m:
                day, month, year = m.groups()
                return f"{year}-{month}-01"
    raise RuntimeError("Не нашёл период в отчёте (строка 'Период: ...')")


def find_manager_columns(ws):
    """Находит, в каких колонках лежат данные каждого менеджера.

    В шапке отчёта имена менеджеров стоят над их парой колонок
    'Количество' / 'Выручка'. Ищем имена, затем под ними — заголовки колонок.
    Возвращает {'Руднев': {'qty': 13, 'revenue': 14}, ...} (1-based).
    """
    managers = {}
    header_row = None

    for row_idx in range(1, 15):
        for col_idx in range(1, ws.max_column + 1):
            val = ws.cell(row=row_idx, column=col_idx).value
            if not val:
                continue
            short = short_manager(str(val))
            if short:
                managers[short] = {"name_col": col_idx}
                header_row = row_idx

    if not managers:
        raise RuntimeError("Не нашёл в отчёте ни одного из менеджеров: " + ", ".join(ALLOWED_MANAGERS))

    # Под строкой с именами идёт строка с 'Количество' / 'Выручка'.
    sub_row = header_row + 1
    for short, info in managers.items():
        c = info["name_col"]
        qty_col = rev_col = None
        # Имя менеджера стоит над первой из его двух колонок.
        for offset in (0, 1):
            label = ws.cell(row=sub_row, column=c + offset).value
            if not label:
                continue
            label = str(label).strip().lower()
            if label.startswith("кол"):
                qty_col = c + offset
            elif label.startswith("выруч"):
                rev_col = c + offset
        if qty_col is None or rev_col is None:
            raise RuntimeError(f"Не нашёл колонки Количество/Выручка для менеджера {short}")
        info["qty"] = qty_col
        info["revenue"] = rev_col

    return managers


def num(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_sales(xlsx_bytes):
    """Разбирает отчёт продаж. Возвращает (month, rows)."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
    ws = wb.active

    month = parse_period(ws)
    managers = find_manager_columns(ws)
    log(f"  Месяц отчёта: {month}")
    log(f"  Менеджеры в отчёте: {', '.join(managers.keys())}")

    rows = []
    client = category = subgroup = None

    for row_idx in range(1, ws.max_row + 1):
        cell = ws.cell(row=row_idx, column=1)
        name = cell.value
        if not name or not str(name).strip():
            continue
        name = str(name).strip()

        # Служебные строки шапки пропускаем.
        if name in ("Контрагент", "Номенклатура", "Параметры:", "Отбор:", "Итого"):
            continue

        indent = cell.alignment.indent or 0

        if indent == LEVEL_CLIENT:
            client, category, subgroup = name, None, None
            continue
        if indent == LEVEL_CATEGORY:
            category, subgroup = name, None
            continue
        if indent == LEVEL_SUBGROUP:
            subgroup = name
            continue
        if indent != LEVEL_PRODUCT:
            continue  # неизвестный уровень — пропускаем

        # Это строка ТОВАРА. Раскладываем по менеджерам: у кого есть выручка
        # в его колонке — тот и продал этот товар этому клиенту.
        if not client:
            continue

        for mgr, cols in managers.items():
            qty = num(ws.cell(row=row_idx, column=cols["qty"]).value)
            revenue = num(ws.cell(row=row_idx, column=cols["revenue"]).value)
            if not revenue:
                continue  # этот менеджер данный товар клиенту не продавал
            rows.append({
                "client_name": client,
                "category": category or "Без категории",
                "subgroup": subgroup or "Прочее",
                "product": name,
                "month": month,
                "qty": int(qty) if qty is not None else 0,
                "revenue": revenue,
                "manager_name": mgr,
            })

    return month, rows


def replace_month(month, rows):
    """Заменяет в purchase_history данные ЗА ЭТОТ МЕСЯЦ.

    Старые месяцы не трогаем — история накапливается. Если отчёт за тот же
    месяц пришлют повторно (данные уточнились), старые строки этого месяца
    удалятся и запишутся новые — дублей не будет.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/purchase_history?month=eq.{month}",
        headers=headers, timeout=120,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Не удалось очистить месяц {month}: {resp.status_code} {resp.text}")
    log(f"  Старые данные за {month} удалены")

    if not rows:
        log("  Новых строк нет — записывать нечего.")
        return

    CHUNK = 500
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/purchase_history",
            headers={**headers, "Prefer": "return=minimal"},
            json=chunk, timeout=120,
        )
        if resp.status_code not in (200, 201, 204):
            raise RuntimeError(f"Не удалось записать продажи: {resp.status_code} {resp.text}")
        log(f"  Записано {min(i + CHUNK, len(rows))} / {len(rows)}")


def find_xlsx_in_email(msg):
    for part in msg.walk():
        filename = part.get_filename()
        if not filename:
            continue
        decoded = decode_header(filename)[0]
        if isinstance(decoded[0], bytes):
            filename = decoded[0].decode(decoded[1] or "utf-8", errors="replace")
        if filename.lower().endswith(".xlsx"):
            return filename, part.get_payload(decode=True)
    return None, None


def main():
    log(f"Подключаюсь к почте {IMAP_HOST}:{IMAP_PORT}")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    mail.login(IMAP_USER, IMAP_PASS)
    mail.select("INBOX")

    status, data = mail.search(None, "UNSEEN")
    if status != "OK":
        log("Не удалось получить список писем")
        mail.logout()
        return

    ids = data[0].split()
    if not ids:
        log("Новых писем нет.")
        mail.logout()
        return

    log(f"Непрочитанных писем: {len(ids)}. Ищу «{SUBJECT_MARKER}».")
    processed = False

    for msg_id in reversed(ids):
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue

        msg = email.message_from_bytes(msg_data[0][1])
        raw_subject = msg.get("Subject", "")
        subject = "".join(
            p.decode(enc or "utf-8", errors="replace") if isinstance(p, bytes) else p
            for p, enc in decode_header(raw_subject)
        )

        if SUBJECT_MARKER.lower() not in subject.lower():
            continue

        log(f"Нашёл письмо: {subject}")

        filename, content = find_xlsx_in_email(msg)
        if not content:
            log("  Нет .xlsx-вложения — пропускаю.")
            continue
        log(f"  Вложение: {filename} ({len(content)} байт)")

        month, rows = parse_sales(content)
        log(f"  Разобрано строк: {len(rows)}")

        by_mgr = {}
        for r in rows:
            by_mgr.setdefault(r["manager_name"], {"rev": 0, "clients": set()})
            by_mgr[r["manager_name"]]["rev"] += r["revenue"]
            by_mgr[r["manager_name"]]["clients"].add(r["client_name"])
        for mgr, d in by_mgr.items():
            log(f"    {mgr}: {len(d['clients'])} клиентов, {d['rev']:,.2f} BYN")

        replace_month(month, rows)

        mail.store(msg_id, "+FLAGS", "\\Seen")
        log("  Письмо обработано.")
        processed = True
        break

    if not processed:
        log("Писем с отчётом продаж не нашлось.")

    mail.logout()
    log("Готово.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ОШИБКА: {e}")
        sys.exit(1)
