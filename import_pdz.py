#!/usr/bin/env python3
"""
Импорт ПРОСРОЧЕННОЙ задолженности (ПДЗ) из почты в Supabase.

Как работает:
  1. Заходит на почту по IMAP (payushin_ar@resanta.ru).
  2. Ищет НЕПРОЧИТАННЫЕ письма с темой, содержащей "ПДЗ для CRM"
     (их шлёт 1С по расписанию каждый день в 11:00).
  3. Достаёт из письма вложение .xlsx и разбирает его.
  4. Полностью перезаписывает таблицу client_debt в Supabase.
  5. Помечает письмо прочитанным, чтобы не обрабатывать его повторно.

Что грузим:
  - ТОЛЬКО просрочку (сумма, % и дни). Общий долг клиента не нужен.
  - Только клиентов, у которых просрочка > 0 (остальных пропускаем).
  - Только менеджеров Руднев / Ачинович / Шкуран (см. ALLOWED_MANAGERS).
    Остальных из отчёта 1С (Савон, Азаров и др.) игнорируем.

Структура отчёта 1С:
  - Строка менеджера: ФИО в колонке 0, пусто в колонке имени клиента.
  - Строка клиента:   номер в колонке 0, имя клиента в колонке 1.
  - Строка накладной: заполнена колонка документа ("Объект расчетов").
  ВАЖНО: номера колонок в 1С "плавают" при изменении настроек отчёта,
  поэтому нужные колонки ищем по заголовкам ("Всего", "Просрочено", "Дней"),
  а не по жёстким номерам — см. find_columns().

Все секреты берутся из переменных окружения (в GitHub — из Secrets),
в коде их нет.
"""

import os
import sys
import imaplib
import email
import io
from email.header import decode_header

import pandas as pd
import requests

# ---------- Настройки из переменных окружения ----------
IMAP_HOST = os.environ.get("IMAP_HOST", "imap.resanta.ru")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
IMAP_USER = os.environ["IMAP_USER"]          # payushin_ar@resanta.ru
IMAP_PASS = os.environ["IMAP_PASS"]          # пароль от почты

SUPABASE_URL = os.environ["SUPABASE_URL"]    # https://xxxx.supabase.co
SUPABASE_KEY = os.environ["SUPABASE_KEY"]    # service_role ключ

SUBJECT_MARKER = "ПДЗ для CRM"               # по нему находим нужные письма

# Менеджеры, которых грузим в CRM. Остальных (Савон, Азаров и пр.) игнорируем —
# фильтруем здесь, чтобы не зависеть от настроек отчёта в 1С.
ALLOWED_MANAGERS = ["Руднев", "Ачинович", "Шкуран"]


def log(msg):
    print(msg, flush=True)


def is_allowed_manager(name):
    """Менеджер из отчёта 1С приходит как 'Руднев Александр Александрович'.
    Сверяем по фамилии, чтобы не зависеть от полного написания ФИО."""
    if not name:
        return False
    return any(surname.lower() in name.lower() for surname in ALLOWED_MANAGERS)


def num(value):
    """Безопасно превращает значение ячейки в число (или None)."""
    n = pd.to_numeric(value, errors="coerce")
    return None if pd.isna(n) else float(n)


def find_columns(df):
    """Находит нужные колонки по заголовкам, а не по жёстким номерам.

    Это важно: 1С может менять структуру отчёта при изменении настроек
    (например, добавился блок "Параметры" сверху и разбивка по интервалам —
    из-за чего колонки долгов уехали с 12-16 на 16-20). Ищем по названиям,
    чтобы парсер пережил такие изменения без правок кода.

    Возвращает словарь: doc (колонка документа), total, share, overdue,
    overdue_pct, overdue_days.
    """
    cols = {}

    for i, row in df.iterrows():
        # Ищем строку с заголовком "Долг клиента" — там же рядом "Наш долг".
        for j, val in row.items():
            if pd.isna(val):
                continue
            text = str(val).strip()

            if text == "Объект расчетов" and "doc" not in cols:
                cols["doc"] = j
            if text == "Долг клиента" and "total_header" not in cols:
                # Первая по порядку колонка "Долг клиента" в строке-шапке —
                # именно она содержит итог, дальше идут интервалы просрочки.
                cols["total_header"] = j

        # Строка "Всего | Доля долга, % | Просрочено | % | Дней" — подшапка,
        # по ней точно определяем все нужные колонки.
        labels = {}
        for j, val in row.items():
            if pd.isna(val):
                continue
            labels[str(val).strip()] = j

        if "Всего" in labels and "Просрочено" in labels:
            cols["total"] = labels["Всего"]
            cols["overdue"] = labels["Просрочено"]
            if "Доля долга, %" in labels:
                cols["share"] = labels["Доля долга, %"]
            if "Дней" in labels:
                cols["overdue_days"] = labels["Дней"]
            # Колонка "%" сразу после "Просрочено" — процент просрочки.
            pct_candidates = [j for lab, j in labels.items()
                              if lab == "%" and j > labels["Просрочено"]]
            if pct_candidates:
                cols["overdue_pct"] = min(pct_candidates)
            break  # подшапку нашли, дальше искать незачем

    return cols


def parse_pdz(xlsx_bytes):
    """Разбирает Excel отчёта ПДЗ, возвращает список долгов по клиентам."""
    df = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=0, header=None)

    cols = find_columns(df)
    if "total" not in cols:
        raise RuntimeError(
            "Не нашёл в отчёте колонку с суммой долга ('Всего'). "
            "Возможно, изменилась структура отчёта в 1С."
        )

    c_total = cols["total"]
    c_share = cols.get("share")
    c_overdue = cols.get("overdue")
    c_overdue_pct = cols.get("overdue_pct")
    c_overdue_days = cols.get("overdue_days")
    c_doc = cols.get("doc")

    current_manager = None
    rows = []

    for _, row in df.iterrows():
        col0 = row[0] if 0 in row.index else None
        col1 = row[1] if 1 in row.index else None
        doc = row[c_doc] if (c_doc is not None and c_doc in row.index) else None
        debt_total = num(row[c_total]) if c_total in row.index else None

        # Без суммы долга строка нам не интересна (заголовки, пустые строки).
        if debt_total is None:
            continue

        if pd.notna(col1):
            # Строка КЛИЕНТА (имя клиента во второй колонке).
            client_name = str(col1).strip()
            if client_name in ("Клиент", "Наименование интервала", ""):
                continue
            if not is_allowed_manager(current_manager):
                continue  # клиент чужого менеджера — пропускаем

            overdue = (num(row[c_overdue]) or 0) if c_overdue is not None else 0

            # Грузим ТОЛЬКО просроченную задолженность (ПДЗ). Клиенты, у которых
            # долг есть, но срок оплаты ещё не наступил (просрочка = 0), в CRM
            # не попадают — иначе список забился бы нулями.
            if overdue <= 0:
                continue

            rows.append({
                "client_name": client_name,
                "manager_name": current_manager,
                "debt_overdue": overdue,
                "debt_overdue_pct": num(row[c_overdue_pct]) if c_overdue_pct is not None else None,
                "debt_overdue_days": int(num(row[c_overdue_days]) or 0) if c_overdue_days is not None else 0,
            })
        elif pd.isna(doc):
            # Строка МЕНЕДЖЕРА (нет имени клиента и нет документа накладной).
            name = str(col0).strip() if pd.notna(col0) else ""
            if name and name not in ("№ в группе", "Итого", "№ п/п"):
                current_manager = name

    return rows


def find_xlsx_in_email(msg):
    """Достаёт первое .xlsx-вложение из письма."""
    for part in msg.walk():
        filename = part.get_filename()
        if not filename:
            continue
        # Имя файла может быть закодировано (кириллица) — декодируем.
        decoded = decode_header(filename)[0]
        if isinstance(decoded[0], bytes):
            filename = decoded[0].decode(decoded[1] or "utf-8", errors="replace")
        if filename.lower().endswith(".xlsx"):
            return filename, part.get_payload(decode=True)
    return None, None


def replace_debt_table(rows):
    """Полностью заменяет содержимое client_debt актуальными данными.
    ПДЗ — это срез 'сколько должны сейчас', а не история: если клиент погасил
    долг и исчез из отчёта, он должен исчезнуть и у нас."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    # 1) Чистим старые данные.
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/client_debt?id=gt.0",
        headers=headers,
        timeout=60,
    )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Не удалось очистить client_debt: {resp.status_code} {resp.text}")

    if not rows:
        log("В отчёте нет строк по нашим менеджерам — таблица очищена, писать нечего.")
        return

    # 2) Заливаем новые (порциями, чтобы не упереться в лимит запроса).
    CHUNK = 500
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/client_debt",
            headers={**headers, "Prefer": "return=minimal"},
            json=chunk,
            timeout=60,
        )
        if resp.status_code not in (200, 201, 204):
            raise RuntimeError(f"Не удалось записать долги: {resp.status_code} {resp.text}")

    log(f"Записано долгов в CRM: {len(rows)}")


def main():
    log(f"Подключаюсь к почте {IMAP_HOST}:{IMAP_PORT} как {IMAP_USER}")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    mail.login(IMAP_USER, IMAP_PASS)
    mail.select("INBOX")

    # Ищем непрочитанные письма. Тему проверяем сами (IMAP-поиск по кириллице
    # на разных серверах работает по-разному, надёжнее отфильтровать в коде).
    status, data = mail.search(None, "UNSEEN")
    if status != "OK":
        log("Не удалось получить список писем")
        mail.logout()
        return

    ids = data[0].split()
    if not ids:
        log("Новых писем нет — ничего делать не нужно.")
        mail.logout()
        return

    log(f"Непрочитанных писем: {len(ids)}. Ищу среди них отчёт «{SUBJECT_MARKER}».")

    processed = False

    # Идём с конца — берём самое свежее письмо с отчётом.
    for msg_id in reversed(ids):
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue

        msg = email.message_from_bytes(msg_data[0][1])

        # Декодируем тему (обычно закодирована из-за кириллицы).
        raw_subject = msg.get("Subject", "")
        subject_parts = decode_header(raw_subject)
        subject = "".join(
            p.decode(enc or "utf-8", errors="replace") if isinstance(p, bytes) else p
            for p, enc in subject_parts
        )

        if SUBJECT_MARKER.lower() not in subject.lower():
            continue  # не наше письмо — не трогаем, оставляем непрочитанным

        log(f"Нашёл письмо: {subject}")

        filename, content = find_xlsx_in_email(msg)
        if not content:
            log("  В письме нет .xlsx-вложения — пропускаю.")
            continue

        log(f"  Вложение: {filename} ({len(content)} байт)")

        rows = parse_pdz(content)
        log(f"  Клиентов с просрочкой (по нашим менеджерам): {len(rows)}")

        if rows:
            by_mgr = {}
            for r in rows:
                by_mgr.setdefault(r["manager_name"], 0)
                by_mgr[r["manager_name"]] += r["debt_overdue"]
            for mgr, total in by_mgr.items():
                log(f"    {mgr}: просрочено {total:,.2f} BYN")

        replace_debt_table(rows)

        # Помечаем письмо прочитанным, чтобы не обрабатывать снова.
        mail.store(msg_id, "+FLAGS", "\\Seen")
        log("  Письмо помечено обработанным.")

        processed = True
        break  # обрабатываем только самый свежий отчёт

    if not processed:
        log("Писем с отчётом ПДЗ среди непрочитанных не нашлось.")

    mail.logout()
    log("Готово.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ОШИБКА: {e}")
        sys.exit(1)
