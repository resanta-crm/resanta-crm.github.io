#!/usr/bin/env python3
"""
Импорт отчёта остатков склада из почты в Supabase (stock_balances).

Как работает:
  1. Заходит на почту по IMAP.
  2. Ищет письма за последние LOOKBACK_DAYS дней с темой "Остатки" + "CRM"
     и берёт САМОЕ СВЕЖЕЕ.
  3. Достаёт вложение .xlsx и разбирает его.
  4. Полностью перезаписывает таблицу stock_balances для склада Витебск.

Зачем: чтобы ИИ-планировщик предлагал клиентам ТОЛЬКО то, что реально есть
на складе. Ключ связки с продажами и прайсом — артикул (sku).

Структура отчёта 1С ("Остатки и доступность товаров"):
  Строка с "Параметры:" содержит склад.
  Шапка таблицы (строка с "Артикул"): колонки
    Артикул | Номенклатура | Ед.изм. | В наличии | Отгружается | В резерве |
    Доступно | Приход | Расход | Остаток
  Первая строка под шапкой — итог по складу (в колонке 1 стоит имя склада,
  а не артикул), её пропускаем.
  Товарная строка: в колонке 1 артикул вида "67/4/48".

ВАЖНО (та же защита, что у ПДЗ):
  - поиск по теме и дате, а не по флагу "непрочитанное";
  - нет свежего письма -> падаем с ошибкой (не тихий успех);
  - пустой разбор -> НЕ трогаем базу.

Все секреты — из переменных окружения (в GitHub из Secrets).
"""

import os
import re
import sys
import imaplib
import email
import io
from datetime import datetime, date, timedelta
from email.header import decode_header
from email.utils import parsedate_to_datetime

import openpyxl
import requests

# ---------- Настройки ----------
IMAP_HOST = os.environ.get("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
IMAP_USER = os.environ["IMAP_USER"].strip()
IMAP_PASS = "".join(os.environ["IMAP_PASS"].split()).replace("\xa0", "")

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()

# Тему письма ищем по двум признакам — "остатк" и "crm", регистр и порядок
# слов не важны. Так рассылку не сломает переименование вроде "Остатки CRM"
# vs "Остатки для CRM" vs "Остатки Витебск для CRM".
SUBJECT_KEYS = ("остатк", "crm")

WAREHOUSE = os.environ.get("STOCK_WAREHOUSE", "Витебск")
LOOKBACK_DAYS = int(os.environ.get("STOCK_LOOKBACK_DAYS", "7"))
MAX_REPORT_AGE_DAYS = int(os.environ.get("STOCK_MAX_AGE_DAYS", "3"))


def log(msg):
    print(msg, flush=True)


def num(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def read_report_date(ws):
    """Дата, на которую построен отчёт. В этом отчёте она в шапке колонки
    'Сейчас'/'В наличии' может отсутствовать явной строкой 'Дата', поэтому
    ищем и 'Дата', и 'Параметры'/'Период'. Если не нашли — вернём None,
    свежесть проверим по дате письма."""
    for row in ws.iter_rows(min_row=1, max_row=12, max_col=14):
        for cell in row:
            if not cell.value:
                continue
            m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", str(cell.value))
            if m:
                d, mth, y = (int(x) for x in m.groups())
                try:
                    return date(y, mth, d)
                except ValueError:
                    return None
    return None


def find_header_row(ws):
    """Строка, где в первой колонке написано 'Артикул'."""
    for r in range(1, 20):
        v = ws.cell(row=r, column=1).value
        if v and str(v).strip().lower() == "артикул":
            return r
    raise RuntimeError("Не нашёл строку-шапку с 'Артикул' — структура отчёта изменилась?")


def col_index(ws, header_row, *names):
    """Ищет колонку по заголовку (любое из names, по началу строки)."""
    for c in range(1, ws.max_column + 1):
        v = ws.cell(row=header_row, column=c).value
        if not v:
            continue
        low = str(v).strip().lower()
        for n in names:
            if low.startswith(n):
                return c
    return None


def parse_stock(xlsx_bytes):
    """Разбирает отчёт остатков. Возвращает (rows, report_date)."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
    ws = wb.active

    report_date = read_report_date(ws)
    hr = find_header_row(ws)

    c_sku   = col_index(ws, hr, "артикул")
    c_name  = col_index(ws, hr, "номенклатура")
    c_unit  = col_index(ws, hr, "ед")
    c_onh   = col_index(ws, hr, "в наличии", "наличи")
    c_res   = col_index(ws, hr, "в резерве", "резерв")
    c_avail = col_index(ws, hr, "доступно")

    if c_sku is None or c_avail is None:
        raise RuntimeError("В отчёте нет колонок 'Артикул' или 'Доступно' — проверьте настройки отчёта.")

    rows = []
    seen = set()
    for r in range(hr + 1, ws.max_row + 1):
        sku = ws.cell(row=r, column=c_sku).value
        if sku is None:
            continue
        sku = str(sku).strip()
        # Товарный артикул в этом отчёте — вида "67/4/48". Строка-итог по складу
        # содержит имя склада ("Витебск") без слэшей — её отбрасываем.
        if "/" not in sku:
            continue
        if sku in seen:
            continue
        seen.add(sku)

        name = ws.cell(row=r, column=c_name).value if c_name else None
        avail = num(ws.cell(row=r, column=c_avail).value)
        onh   = num(ws.cell(row=r, column=c_onh).value) if c_onh else None
        res   = num(ws.cell(row=r, column=c_res).value) if c_res else None

        rows.append({
            "sku": sku,
            "product": (str(name).strip() if name else None),
            "warehouse": WAREHOUSE,
            "unit": (str(ws.cell(row=r, column=c_unit).value).strip() if c_unit and ws.cell(row=r, column=c_unit).value else None),
            "qty_onhand": onh,
            "qty_reserve": res,
            "qty_avail": avail,
            "report_date": report_date.isoformat() if report_date else None,
        })

    return rows, report_date


def replace_stock(rows):
    """Перезаписывает остатки склада: сначала проверка, потом удаление, потом
    запись. Порядок важен — пустой разбор не должен обнулить склад."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    if not rows:
        raise RuntimeError(
            "Из отчёта не разобрано ни одной позиции. Остатки в CRM НЕ тронуты. "
            "Проверьте структуру отчёта 'Остатки ... для CRM'."
        )

    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/stock_balances?warehouse=eq.{WAREHOUSE}",
        headers=headers, timeout=120,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Не удалось очистить остатки {WAREHOUSE}: {resp.status_code} {resp.text}")
    log(f"  Старые остатки склада «{WAREHOUSE}» удалены")

    CHUNK = 500
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/stock_balances",
            headers={**headers, "Prefer": "return=minimal"},
            json=chunk, timeout=120,
        )
        if resp.status_code not in (200, 201, 204):
            raise RuntimeError(f"Не удалось записать остатки: {resp.status_code} {resp.text}")
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


def subject_matches(subject):
    low = subject.lower()
    return all(k in low for k in SUBJECT_KEYS)


def main():
    log(f"Подключаюсь к почте {IMAP_HOST}:{IMAP_PORT}")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    mail.login(IMAP_USER, IMAP_PASS)
    mail.select("INBOX")

    since = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
    status, data = mail.search(None, f'(SINCE {since})')
    if status != "OK":
        raise RuntimeError("Не удалось получить список писем")

    ids = data[0].split()
    log(f"Писем за последние {LOOKBACK_DAYS} дн.: {len(ids)}. Ищу отчёт остатков.")

    candidates = []
    for msg_id in ids:
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue
        msg = email.message_from_bytes(msg_data[0][1])

        raw_subject = msg.get("Subject", "")
        subject = "".join(
            p.decode(enc or "utf-8", errors="replace") if isinstance(p, bytes) else p
            for p, enc in decode_header(raw_subject)
        )
        if not subject_matches(subject):
            continue

        try:
            sent = parsedate_to_datetime(msg.get("Date"))
        except Exception:
            sent = datetime.min
        candidates.append((sent, subject, msg))

    if not candidates:
        raise RuntimeError(
            f"За последние {LOOKBACK_DAYS} дн. не найдено письма с остатками "
            f"(тема должна содержать «остатк» и «CRM»). Проверьте рассылку в 1С."
        )

    candidates.sort(key=lambda x: x[0])
    sent, subject, msg = candidates[-1]
    log(f"Самое свежее письмо: «{subject}» от {sent:%d.%m.%Y %H:%M}")

    filename, content = find_xlsx_in_email(msg)
    if not content:
        raise RuntimeError("В письме нет .xlsx-вложения.")
    log(f"  Вложение: {filename} ({len(content)} байт)")

    rows, report_date = parse_stock(content)
    log(f"  Позиций с артикулом: {len(rows)}")

    if report_date is None:
        log("  ⚠️ Дата отчёта в файле не найдена — свежесть проверяю по дате письма.")
        if (date.today() - sent.date()).days > MAX_REPORT_AGE_DAYS:
            raise RuntimeError(
                f"Письмо с остатками от {sent:%d.%m.%Y} старше {MAX_REPORT_AGE_DAYS} дн. "
                f"Данные НЕ загружены. Проверьте рассылку остатков в 1С."
            )
    else:
        age = (date.today() - report_date).days
        log(f"  Отчёт на {report_date:%d.%m.%Y} (возраст: {age} дн.)")
        if age > MAX_REPORT_AGE_DAYS:
            raise RuntimeError(
                f"Отчёт остатков на {report_date:%d.%m.%Y} старше {MAX_REPORT_AGE_DAYS} дн. "
                f"Данные НЕ загружены, чтобы не предлагать клиентам товар по устаревшим "
                f"остаткам. Проверьте период/дату в отчёте и рассылке 1С."
            )

    total_avail = sum(r["qty_avail"] or 0 for r in rows)
    log(f"  Суммарно доступно к отгрузке: {total_avail:,.0f} шт по {len(rows)} артикулам")

    replace_stock(rows)

    mail.logout()
    log("Готово.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ОШИБКА: {e}")
        sys.exit(1)
