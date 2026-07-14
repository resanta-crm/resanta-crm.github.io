#!/usr/bin/env python3
"""
Импорт ПРОСРОЧЕННОЙ задолженности (ПДЗ) из почты в Supabase.

Как работает:
  1. Заходит на почту по IMAP (payushin_ar@resanta.ru).
  2. Ищет письма за последние LOOKBACK_DAYS дней с темой "ПДЗ для CRM"
     (их шлёт 1С по расписанию каждый день в 11:00) и берёт САМОЕ СВЕЖЕЕ.
  3. Достаёт из письма вложение .xlsx, читает дату отчёта и разбирает его.
  4. Полностью перезаписывает таблицу client_debt в Supabase.

ВАЖНО (была ошибка, из-за неё ПДЗ месяцами не обновлялась):
  Раньше скрипт искал письма по флагу UNSEEN — только непрочитанные. Стоило
  кому-то открыть письмо в Gmail (с телефона, из браузера, да хоть случайно) —
  и скрипт его больше не видел: писал "новых писем нет" и завершался УСПЕШНО.
  GitHub Action зелёный, а данные в CRM тихо устаревали, и никто не знал.
  Теперь флаг прочтения игнорируется: ищем по теме и дате, берём самое свежее
  письмо, а если свежего отчёта нет — падаем с ошибкой, чтобы это было видно.

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
import re
import sys
import imaplib
import email
import io
from datetime import datetime, date, timedelta
from email.header import decode_header
from email.utils import parsedate_to_datetime

import pandas as pd
import requests

# ---------- Настройки из переменных окружения ----------
IMAP_HOST = os.environ.get("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))
IMAP_USER = os.environ["IMAP_USER"].strip()

# Пароль приложения Google показывается с пробелами (вида "abcd efgh ijkl mnop"),
# причём это НЕРАЗРЫВНЫЕ пробелы (\xa0). При копировании они попадают в секрет и
# ломают авторизацию ('ascii' codec can't encode character '\xa0').
# Чистим все виды пробелов — тогда неважно, как пароль был скопирован.
IMAP_PASS = "".join(os.environ["IMAP_PASS"].split()).replace("\xa0", "")

SUPABASE_URL = os.environ["SUPABASE_URL"]    # https://xxxx.supabase.co
SUPABASE_KEY = os.environ["SUPABASE_KEY"]    # service_role ключ

SUBJECT_MARKER = "ПДЗ для CRM"               # по нему находим нужные письма

# За сколько дней назад искать письма. 1С шлёт ежедневно; берём запас на
# выходные и сбои рассылки.
LOOKBACK_DAYS = int(os.environ.get("PDZ_LOOKBACK_DAYS", "7"))

# Насколько устаревшим может быть отчёт, чтобы его ещё грузить. Если 1С снова
# зафиксирует дату и начнёт слать вчерашние данные — лучше знать об этом.
MAX_REPORT_AGE_DAYS = int(os.environ.get("PDZ_MAX_AGE_DAYS", "3"))

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


def read_report_date(df):
    """Достаёт дату, НА КОТОРУЮ построен отчёт (ячейка вида "Дата отчета: 14.07.2026").

    Зачем: в 1С параметр "Дата отчёта" можно зафиксировать конкретным числом.
    Тогда рассылка будет исправно приходить каждый день, но с ОДНИМИ И ТЕМИ ЖЕ
    вчерашними данными. Внешне всё работает, а CRM показывает липу. Поэтому
    дату читаем из самого файла и сверяем с сегодняшней.
    """
    for _, row in df.iterrows():
        for val in row:
            if pd.isna(val):
                continue
            m = re.search(r"Дата отчета:\s*(\d{2})\.(\d{2})\.(\d{4})", str(val))
            if m:
                d, mth, y = (int(x) for x in m.groups())
                try:
                    return date(y, mth, d)
                except ValueError:
                    return None
    return None


def parse_pdz(xlsx_bytes):
    """Разбирает Excel отчёта ПДЗ, возвращает (список долгов, дата отчёта)."""
    df = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=0, header=None)

    report_date = read_report_date(df)

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
                "report_date": report_date.isoformat() if report_date else None,
            })
        elif pd.isna(doc):
            # Строка МЕНЕДЖЕРА (нет имени клиента и нет документа накладной).
            name = str(col0).strip() if pd.notna(col0) else ""
            if name and name not in ("№ в группе", "Итого", "№ п/п"):
                current_manager = name

    return rows, report_date


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
    # Колонка report_date могла быть ещё не добавлена (миграция v19). Чтобы
    # скрипт не падал из-за этого, при ошибке про неизвестную колонку пробуем
    # ещё раз без неё — данные важнее, чем метка даты.
    CHUNK = 500
    drop_report_date = False

    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        payload = [{k: v for k, v in r.items() if k != "report_date"} for r in chunk] \
            if drop_report_date else chunk

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/client_debt",
            headers={**headers, "Prefer": "return=minimal"},
            json=payload,
            timeout=60,
        )

        if resp.status_code not in (200, 201, 204) and "report_date" in resp.text and not drop_report_date:
            log("  ⚠️ В client_debt нет колонки report_date — гружу без неё. "
                "Прогоните миграцию v19, чтобы CRM показывала дату актуальности данных.")
            drop_report_date = True
            payload = [{k: v for k, v in r.items() if k != "report_date"} for r in chunk]
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/client_debt",
                headers={**headers, "Prefer": "return=minimal"},
                json=payload,
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

    # ИЩЕМ ПО ДАТЕ, А НЕ ПО ФЛАГУ "НЕПРОЧИТАННОЕ".
    # Раньше здесь было mail.search(None, "UNSEEN"), и это была главная ошибка:
    # достаточно было один раз открыть письмо в Gmail, чтобы скрипт перестал его
    # видеть. Флаг прочтения — свойство почтового клиента, а не признак того,
    # загрузили мы данные или нет. Теперь он вообще не участвует в логике.
    since = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
    status, data = mail.search(None, f'(SINCE {since})')
    if status != "OK":
        raise RuntimeError("Не удалось получить список писем")

    ids = data[0].split()
    log(f"Писем за последние {LOOKBACK_DAYS} дн.: {len(ids)}. Ищу отчёт «{SUBJECT_MARKER}».")

    # Собираем ВСЕ письма с отчётом и берём самое свежее по дате отправки.
    # Идти "с конца списка" недостаточно: порядок ID не гарантирует порядок дат.
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
        if SUBJECT_MARKER.lower() not in subject.lower():
            continue

        try:
            sent = parsedate_to_datetime(msg.get("Date"))
        except Exception:
            sent = datetime.min
        candidates.append((sent, msg_id, subject, msg))

    if not candidates:
        # ОШИБКА, А НЕ "ВСЁ ХОРОШО". Раньше здесь был тихий выход с успехом —
        # поэтому месяцами никто не замечал, что данные не обновляются.
        raise RuntimeError(
            f"За последние {LOOKBACK_DAYS} дн. не найдено ни одного письма с темой "
            f"«{SUBJECT_MARKER}». Проверьте рассылку в 1С и фильтр Zimbra."
        )

    candidates.sort(key=lambda x: x[0])
    sent, msg_id, subject, msg = candidates[-1]
    log(f"Самое свежее письмо: «{subject}» от {sent:%d.%m.%Y %H:%M}")

    filename, content = find_xlsx_in_email(msg)
    if not content:
        raise RuntimeError("В письме нет .xlsx-вложения.")
    log(f"  Вложение: {filename} ({len(content)} байт)")

    rows, report_date = parse_pdz(content)

    # СВЕРКА ДАТЫ ОТЧЁТА. Письмо может приходить исправно каждый день, но с
    # зафиксированной в 1С датой — тогда в CRM попадёт вчерашняя задолженность,
    # а ИИ будет ставить задачи по несуществующим долгам.
    if report_date is None:
        log("  ⚠️ Не удалось прочитать дату отчёта из файла — проверьте структуру.")
    else:
        age = (date.today() - report_date).days
        log(f"  Отчёт построен на {report_date:%d.%m.%Y} (возраст: {age} дн.)")
        if age > MAX_REPORT_AGE_DAYS:
            raise RuntimeError(
                f"Отчёт построен на {report_date:%d.%m.%Y}, это старше {MAX_REPORT_AGE_DAYS} дн. "
                f"Данные НЕ загружены, чтобы не затереть базу устаревшими долгами. "
                f"Причина обычно одна: в 1С у параметра «Дата отчёта» снова стоит "
                f"«Произвольная дата» вместо «Начало этого дня» — проверьте отчёт И рассылку."
            )
        if age > 0:
            log(f"  ⚠️ Отчёт не сегодняшний, но в пределах допустимого — гружу.")

    log(f"  Клиентов с просрочкой (по нашим менеджерам): {len(rows)}")
    if not rows:
        raise RuntimeError(
            "В отчёте нет ни одного клиента с просрочкой по нашим менеджерам. "
            "Это подозрительно — база НЕ очищена. Проверьте отчёт в 1С."
        )

    by_mgr = {}
    for r in rows:
        by_mgr.setdefault(r["manager_name"], 0)
        by_mgr[r["manager_name"]] += r["debt_overdue"]
    for mgr, total in by_mgr.items():
        log(f"    {mgr}: просрочено {total:,.2f} BYN")
    log(f"  ИТОГО просрочено: {sum(r['debt_overdue'] for r in rows):,.2f} BYN")

    replace_debt_table(rows)

    # Письмо больше НЕ помечаем прочитанным: логика от этого флага не зависит,
    # а менять состояние чужого почтового ящика скрипту незачем.
    mail.logout()
    log("Готово.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ОШИБКА: {e}")
        sys.exit(1)
