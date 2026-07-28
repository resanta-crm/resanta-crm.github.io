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
from datetime import datetime, date, timedelta, timezone
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



IMPORT_CONTEXT = {"report_period": None, "report_date": None, "source_message_at": None, "row_count": None}


def _api_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def set_import_status(source, status, *, report_period=None, report_date=None,
                      source_message_at=None, row_count=None, details=None,
                      error_text=None):
    """Записывает фактический статус импорта в Supabase.

    Ошибка этой служебной записи не должна уничтожать основной импорт, поэтому
    вызывающая сторона использует safe_set_import_status().
    """
    payload = {
        "p_source": source,
        "p_status": status,
        "p_report_period": report_period,
        "p_report_date": report_date,
        "p_source_message_at": source_message_at,
        "p_row_count": row_count,
        "p_details": details,
        "p_error_text": error_text,
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/crm_set_import_status",
        headers=_api_headers(), json=payload, timeout=30,
    )
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"Не удалось записать статус импорта: {resp.status_code} {resp.text}")


def safe_set_import_status(source, status, **kwargs):
    try:
        set_import_status(source, status, **kwargs)
    except Exception as exc:
        log(f"  ⚠️ Статус импорта не записан: {exc}")


def normalize_message_date(value):
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def select_mailbox(mail):
    """Ищет папку Gmail с флагом \\All, чтобы импорт видел даже архивированные
    фильтром письма. Если специальная папка недоступна, использует INBOX.
    """
    try:
        status, boxes = mail.list()
        if status == "OK":
            for raw in boxes or []:
                if b"\\All" not in raw:
                    continue
                match = re.search(br'\)\s+"[^"]*"\s+(.+)$', raw)
                if not match:
                    continue
                token = match.group(1).strip()
                if token.startswith(b'"') and token.endswith(b'"'):
                    token = token[1:-1]
                mailbox = token.decode("ascii", errors="ignore")
                if mailbox:
                    select_arg = f'"{mailbox}"' if " " in mailbox else mailbox
                    st, _ = mail.select(select_arg)
                    if st == "OK":
                        log(f"Ищу письма во всей почте: {mailbox}")
                        return mailbox
    except Exception as exc:
        log(f"  ⚠️ Не удалось открыть папку всей почты: {exc}")
    st, _ = mail.select("INBOX")
    if st != "OK":
        raise RuntimeError("Не удалось открыть INBOX")
    log("Ищу письма в INBOX")
    return "INBOX"


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


def replace_debt_table(rows, report_date, source_message_at):
    """Атомарно заменяет ПДЗ через SQL-функцию Supabase.

    Старый срез не удаляется, если новая вставка не прошла. В той же транзакции
    фиксируется время успешной загрузки, дата отчёта и число должников.
    """
    if not rows:
        raise RuntimeError("Нельзя заменить ПДЗ пустым набором строк")
    fields = (
        "client_name", "manager_name", "debt_overdue", "debt_overdue_pct",
        "debt_overdue_days", "report_date",
    )
    clean_rows = [{field: row.get(field) for field in fields} for row in rows]
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/replace_client_debt_safe",
        headers=_api_headers(),
        json={
            "p_rows": clean_rows,
            "p_report_date": report_date.isoformat() if report_date else None,
            "p_source_message_at": source_message_at,
        },
        timeout=180,
    )
    if resp.status_code not in (200, 201, 204):
        if "replace_client_debt_safe" in resp.text or "PGRST202" in resp.text:
            raise RuntimeError(
                "В Supabase не установлена безопасная функция ПДЗ. "
                "Запустите install-import-control.sql и повторите workflow."
            )
        raise RuntimeError(f"Не удалось атомарно записать ПДЗ: {resp.status_code} {resp.text}")
    try:
        inserted = int(resp.json())
    except Exception:
        inserted = len(clean_rows)
    log(f"Атомарно записано долгов в CRM: {inserted}")


def main():
    safe_set_import_status("pdz", "running")
    log(f"Подключаюсь к почте {IMAP_HOST}:{IMAP_PORT} как {IMAP_USER}")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    mail.login(IMAP_USER, IMAP_PASS)
    select_mailbox(mail)

    since = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
    status, data = mail.search(None, f'(SINCE {since})')
    if status != "OK":
        raise RuntimeError("Не удалось получить список писем")

    ids = data[0].split()
    log(f"Писем за последние {LOOKBACK_DAYS} дн.: {len(ids)}. Ищу отчёт «{SUBJECT_MARKER}».")

    # Выбираем письмо по ДАТЕ ВНУТРИ ОТЧЁТА, а не только по времени отправки.
    # Если 1С повторно прислала старый файл позже нового, CRM больше не откатится.
    parsed_candidates = []
    parse_errors = []
    for msg_id in ids:
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue
        msg = email.message_from_bytes(msg_data[0][1])
        raw_subject = msg.get("Subject", "")
        subject = "".join(
            part.decode(enc or "utf-8", errors="replace") if isinstance(part, bytes) else part
            for part, enc in decode_header(raw_subject)
        )
        if SUBJECT_MARKER.lower() not in subject.lower():
            continue
        sent = normalize_message_date(msg.get("Date"))
        filename, content = find_xlsx_in_email(msg)
        if not content:
            parse_errors.append(f"{sent:%d.%m %H:%M}: нет Excel-вложения")
            continue
        try:
            rows, report_date = parse_pdz(content)
            parsed_candidates.append((report_date or date.min, sent, subject, filename, rows, report_date))
        except Exception as exc:
            parse_errors.append(f"{sent:%d.%m %H:%M}: {exc}")

    if not parsed_candidates:
        detail = "; ".join(parse_errors[-3:])
        raise RuntimeError(
            f"Не найден пригодный отчёт «{SUBJECT_MARKER}» за последние {LOOKBACK_DAYS} дн."
            + (f" Последние ошибки: {detail}" if detail else "")
        )

    parsed_candidates.sort(key=lambda x: (x[0], x[1]))
    _, sent, subject, filename, rows, report_date = parsed_candidates[-1]
    IMPORT_CONTEXT.update({
        "report_date": report_date.isoformat() if report_date else None,
        "source_message_at": sent.isoformat(),
        "row_count": len(rows),
    })
    log(f"Выбран отчёт: «{subject}» от {sent:%d.%m.%Y %H:%M}")
    log(f"  Вложение: {filename}, строк с просрочкой: {len(rows)}")

    if report_date is None:
        raise RuntimeError("Не удалось прочитать дату отчёта из файла ПДЗ")
    age = (date.today() - report_date).days
    log(f"  Отчёт построен на {report_date:%d.%m.%Y} (возраст: {age} дн.)")
    if age > MAX_REPORT_AGE_DAYS:
        raise RuntimeError(
            f"Отчёт построен на {report_date:%d.%m.%Y}, это старше {MAX_REPORT_AGE_DAYS} дн. "
            "Старый рабочий срез ПДЗ сохранён. Проверьте параметр даты отчёта и рассылку 1С."
        )
    if age > 0:
        log("  ⚠️ Отчёт пока не сегодняшний, но в допустимом окне — гружу и отмечаю дату на экране CRM.")

    if not rows:
        raise RuntimeError(
            "В отчёте нет ни одного клиента с просрочкой по нашим менеджерам. "
            "Это подозрительно — прежний срез сохранён, проверьте отчёт в 1С."
        )

    by_mgr = {}
    for row in rows:
        by_mgr.setdefault(row["manager_name"], 0)
        by_mgr[row["manager_name"]] += row["debt_overdue"]
    for mgr, total in by_mgr.items():
        log(f"    {mgr}: просрочено {total:,.2f} BYN")
    log(f"  ИТОГО просрочено: {sum(row['debt_overdue'] for row in rows):,.2f} BYN")

    replace_debt_table(rows, report_date, sent.isoformat())
    mail.logout()
    log("Готово.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        safe_set_import_status(
            "pdz", "error",
            report_date=IMPORT_CONTEXT.get("report_date"),
            source_message_at=IMPORT_CONTEXT.get("source_message_at"),
            row_count=IMPORT_CONTEXT.get("row_count"),
            error_text=str(e)[:2000],
        )
        log(f"ОШИБКА: {e}")
        sys.exit(1)
