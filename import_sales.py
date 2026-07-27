#!/usr/bin/env python3
"""
Импорт ежемесячного отчёта продаж из почты в Supabase (purchase_history).

Как работает:
  1. Заходит на почту по IMAP (Gmail).
  2. Ищет письма за последние LOOKBACK_DAYS дней с темой "Продажи для CRM"
     и берёт САМОЕ СВЕЖЕЕ.
  3. Достаёт вложение .xlsx и разбирает его.
  4. Заменяет в purchase_history данные ЗА МЕСЯЦ ИЗ ОТЧЁТА на новые
     (старые месяцы не трогает — история накапливается, на ней стоит маст-лист).

ДВЕ ИСПРАВЛЕННЫЕ ОШИБКИ (из-за них продажи молча не обновлялись):

  1. Поиск писем шёл по флагу UNSEEN — только непрочитанные. Стоило кому-то
     открыть письмо в Gmail, и скрипт переставал его видеть: писал "новых писем
     нет" и завершался УСПЕШНО. Данные в CRM застывали, Action был зелёный.
     Теперь флаг прочтения не участвует: ищем по теме и дате.

  2. replace_month() СНАЧАЛА удалял месяц и только потом смотрел, есть ли что
     писать. Иерархия в отчёте держится на ОТСТУПАХ ячеек — стоит 1С изменить
     оформление, и парсер вернёт 0 строк. Месяц бы стёрся, а маст-лист у всех
     менеджеров опустел. Теперь пустой разбор — это ошибка, и до удаления
     дело не доходит.

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
from email.utils import parsedate_to_datetime
from datetime import datetime, date, timedelta

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

# За сколько дней искать письма. Отчёт по продажам приходит ежедневно в 10:00.
LOOKBACK_DAYS = int(os.environ.get("SALES_LOOKBACK_DAYS", "7"))

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


import re as _re

# Артикул в отчётах Ресанты — числа через слэш: "70/1/67", "73/7/2/32", "64/40".
# Число частей разное (2-4), поэтому шаблон — просто цифры и слэши.
_ARTICLE_RE = _re.compile(r"^\d+(?:/\d+){1,4}$")


def parse_sales(xlsx_bytes):
    """Разбирает отчёт продаж. Возвращает (month, rows).

    УСТОЙЧИВОСТЬ К ОТСТУПАМ: раньше уровни (клиент/категория/подгруппа/товар)
    определялись по жёстким числам indent (0/2/4/6). Стоило в 1С изменить
    отчёт (добавить артикул) — отступы стали 0/3/6/9/12/15, и парсер перестал
    находить товары. Теперь роль строки определяем ПО СОДЕРЖИМОМУ и по ПОРЯДКУ
    отступов, а не по конкретным числам:
      - самый маленький indent = клиент;
      - строки КАПСОМ (или следующий уровень) = категория;
      - следующий = подгруппа;
      - строка с выручкой и обычным названием = товар;
      - строка вида "70/1/67" = артикул предыдущего товара.
    """
    # Парсер работает с .xlsx (openpyxl). Если рассылка 1С внезапно шлёт старый
    # .xls (начинается с байтов D0CF, а не PK) — не пытаемся гадать, а говорим
    # прямо: переключите формат вложения на .xlsx.
    if xlsx_bytes[:2] != b"PK":
        raise RuntimeError(
            "Отчёт продаж пришёл в старом формате .xls. Скрипт читает .xlsx. "
            "В рассылке 1С выберите формат вложения «Лист Excel 2007-...» (.xlsx)."
        )
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
    ws = wb.active

    month = parse_period(ws)
    managers = find_manager_columns(ws)
    log(f"  Месяц отчёта: {month}")
    log(f"  Менеджеры в отчёте: {', '.join(managers.keys())}")

    # Собираем значимые строки с отступами.
    body = []
    for row_idx in range(1, ws.max_row + 1):
        cell = ws.cell(row=row_idx, column=1)
        name = cell.value
        if not name or not str(name).strip():
            continue
        name = str(name).strip()
        if name in ("Контрагент", "Номенклатура", "Параметры:", "Отбор:", "Итого", "Артикул"):
            continue
        body.append((row_idx, name, cell.alignment.indent or 0))

    # НАДЁЖНЫЙ ПРИЗНАК ТОВАРА: строка, СРАЗУ ПОД которой идёт строка-артикул.
    # Раздел (категория/подгруппа/под-подгруппа) артикула под собой не имеет.
    # Это не зависит ни от отступов, ни от глубины иерархии, ни от КАПСа —
    # поэтому переживёт любые изменения структуры отчёта в 1С.
    is_product = [False] * len(body)
    for i in range(len(body) - 1):
        nxt_name = body[i + 1][1]
        if not _ARTICLE_RE.match(body[i][1]) and _ARTICLE_RE.match(nxt_name):
            is_product[i] = True

    # Уровни отступов только для определения клиента (самый левый отступ).
    lvl_client = min((ind for _, _, ind in body), default=0)

    rows = []
    client = None
    # Категорию/подгруппу отслеживаем как "последний не-товар над товаром".
    # Для задач важнее всего категория верхнего уровня — берём самый левый
    # не-товарный заголовок из текущей цепочки.
    heading_stack = {}   # indent -> name

    for i, (row_idx, name, indent) in enumerate(body):
        if _ARTICLE_RE.match(name):
            continue  # артикулы обрабатываем при товаре

        if is_product[i]:
            if not client:
                continue
            # Категория = самый левый заголовок выше клиента; подгруппа = самый
            # глубокий. Собираем из стека заголовков, что накопился.
            headings = [heading_stack[k] for k in sorted(heading_stack) if k > lvl_client]
            category = headings[0] if headings else "Без категории"
            subgroup = headings[-1] if len(headings) > 1 else (headings[0] if headings else "Прочее")

            # SKU — из следующей строки.
            sku = body[i + 1][1] if i + 1 < len(body) and _ARTICLE_RE.match(body[i + 1][1]) else None

            for mgr, cols in managers.items():
                qty = num(ws.cell(row=row_idx, column=cols["qty"]).value)
                revenue = num(ws.cell(row=row_idx, column=cols["revenue"]).value)
                if not revenue:
                    continue
                rows.append({
                    "client_name": client,
                    "category": category,
                    "subgroup": subgroup,
                    "product": name,
                    "sku": sku,
                    "month": month,
                    "qty": int(qty) if qty is not None else 0,
                    "revenue": revenue,
                    "manager_name": mgr,
                })
            continue

        # Это ЗАГОЛОВОК (не товар, не артикул).
        if indent <= lvl_client:
            client = name
            heading_stack = {}   # новый клиент — сбрасываем цепочку разделов
        else:
            # Убираем из стека всё, что глубже или равно текущему уровню, и
            # кладём себя — так стек всегда отражает актуальную цепочку.
            for k in [k for k in heading_stack if k >= indent]:
                del heading_stack[k]
            heading_stack[indent] = name

    return month, rows


# ===== АВТОЗАВЕДЕНИЕ КЛИЕНТОВ ИЗ 1С =====
# Проблема, которую это решает: клиент заведён в 1С, покупает, его закупки
# лежат в purchase_history — а карточки в CRM нет. Значит он не виден в списке
# клиентов, не попадает в маршруты, в задачи и в ИИ-анализ. Самые свежие
# клиенты были невидимы для менеджеров.
#
# ВАЖНО: заводим ТОЛЬКО из отчёта продаж. В отчёте ПДЗ названия идут как
# "ТТ, ИТ технологии ЧП Могилёвская обл, ..." — это торговые точки, а не
# юрлица; из них мы бы наплодили мусор.

# Юр. формы, которые надо отбросить при сравнении имён. Список тот же, что в
# CRM (normalizeClientName) — иначе "Аникогрупп ЧТПУП" из 1С не совпадёт с
# "Аникогрупп ЧТПУП" из базы и заведётся дубль.
NAME_STOP = {"ооо", "одо", "уп", "чуп", "чтуп", "чпуп", "чтпуп", "ип",
             "оао", "зао", "учп", "чп", "тт", "головной"}


def normalize_name(name):
    """Приводит название к виду, по которому можно сравнивать.

    Кириллица + \b в регэкспах не дружат, поэтому режем по токенам, как в CRM.
    """
    s = str(name or "").strip().lower()
    s = re.sub(r"[«»\"'.,()\-–—]", " ", s)
    tokens = [t for t in s.split() if t and t not in NAME_STOP]
    return " ".join(tokens)


def names_match(a, b):
    """Совпадение имён: точное или по вхождению.

    Вхождение проверяем только для достаточно длинных строк — иначе короткое
    "рудбуд" склеится с чем попало.
    """
    if not a or not b:
        return False
    if a == b:
        return True
    if len(a) >= 6 and len(b) >= 6:
        return a in b or b in a
    return False


ALIAS_RE = re.compile(r"\[\[CRM_ALIASES:([^\]]*)\]\]\s*$")

def client_name_variants(row):
    """Все имена объединённых ТТ, по которым может прийти продажа из 1С."""
    names = [row.get("name") or ""]
    assortment = str(row.get("assortment") or "")
    m = ALIAS_RE.search(assortment)
    if m:
        try:
            import urllib.parse, json
            names.extend(json.loads(urllib.parse.unquote(m.group(1))) or [])
        except Exception:
            pass
    # Поддержка старых объединений, где все названия оставили в одной строке.
    legal = re.compile(r"(?:^|[\s,;/]+)(ООО|ОДО|УП|ЧУП|ЧТУП|ЧПУП|ЧТПУП|ИП|ОАО|ЗАО|УЧП|ЧП)\s+", re.I)
    s = str(row.get("name") or "").strip()
    starts = [m.start(1) for m in legal.finditer(s)]
    if len(starts) > 1:
        for i, start in enumerate(starts):
            part = s[start:(starts[i+1] if i+1 < len(starts) else len(s))].strip(" ,;/")
            if part:
                names.append(part)
    return list(dict.fromkeys(n for n in names if n))

def canonical_client_key(name):
    """Ключ клиента для точной привязки истории продаж к карточке CRM."""
    return re.sub(r"[^a-zа-я0-9]+", "", normalize_name(name).replace("ё", "е"))


def attach_client_ids(rows):
    """Добавляет purchase_history.client_id по текущей карточке и её алиасам.

    Автоматически используем только ОДНОЗНАЧНЫЙ точный ключ. Если одинаковый
    алиас относится к двум карточкам, строка остаётся без client_id и попадает в
    контроль качества данных — так безопаснее, чем приписать продажи не тому.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    clients = _get_all_rest_rows("clients", "id,name,assortment")
    aliases = []
    try:
        aliases = _get_all_rest_rows("client_aliases", "client_id,alias_name")
    except Exception as exc:
        log(f"  ⚠️ Таблица client_aliases недоступна, использую имена из карточек: {exc}")

    keys = {}
    for c in clients:
        cid = str(c.get("id") or "")
        names = client_name_variants(c)
        names.extend(a.get("alias_name") for a in aliases if str(a.get("client_id") or "") == cid)
        for name in names:
            key = canonical_client_key(name)
            if not key:
                continue
            keys.setdefault(key, set()).add(cid)

    unique = {k: next(iter(ids)) for k, ids in keys.items() if len(ids) == 1}
    matched = 0
    unresolved = set()
    ambiguous = set()

    # PostgREST требует одинаковый набор ключей во всех объектах массовой
    # вставки. Поэтому client_id присутствует у КАЖДОЙ строки: UUID либо null.
    # Раньше ключ добавлялся только найденным клиентам, из-за чего импорт падал
    # с PGRST102 «All object keys must match».
    for row in rows:
        row["client_id"] = None

    for row in rows:
        key = canonical_client_key(row.get("client_name"))
        ids = keys.get(key, set())
        if key in unique:
            row["client_id"] = unique[key]
            matched += 1
        elif len(ids) > 1:
            ambiguous.add(row.get("client_name") or "")
        else:
            unresolved.add(row.get("client_name") or "")

    log(f"  Прямая привязка purchase_history.client_id: {matched} из {len(rows)} строк")
    if ambiguous:
        log(f"  ⚠️ Неоднозначные названия ({len(ambiguous)}) — client_id не проставлен:")
        for name in sorted(ambiguous)[:20]:
            log(f"    ! {name}")
    if unresolved:
        log(f"  ⚠️ Пока не сопоставлены с карточкой ({len(unresolved)}):")
        for name in sorted(unresolved)[:20]:
            log(f"    ? {name}")


def ensure_clients_exist(rows):
    """Заводит в CRM клиентов, которые покупают, но карточки не имеют."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/clients?select=id,name,manager_name,assortment",
        headers=headers, timeout=60,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Не удалось получить клиентов: {resp.status_code} {resp.text}")
    existing = resp.json()
    # Включаем прежние названия объединённых торговых точек. Главный источник —
    # client_aliases; скрытый хвост assortment остаётся запасным вариантом.
    aliases = []
    try:
        aliases = _get_all_rest_rows("client_aliases", "client_id,alias_name")
    except Exception as exc:
        log(f"  ⚠️ Алиасы клиентов не прочитаны при проверке дублей: {exc}")

    aliases_by_id = {}
    for a in aliases:
        aliases_by_id.setdefault(str(a.get("client_id") or ""), []).append(a.get("alias_name") or "")

    existing_norm = []
    for c in existing:
        names = client_name_variants(c) + aliases_by_id.get(str(c.get("id") or ""), [])
        existing_norm.extend(normalize_name(n) for n in names if normalize_name(n))

    # Кто покупает по данным отчёта (имя -> менеджер + выручка за месяц).
    from_1c = {}
    for r in rows:
        key = r["client_name"]
        d = from_1c.setdefault(key, {"manager": r["manager_name"], "revenue": 0.0})
        d["revenue"] += r["revenue"]

    to_create = []
    seen = set()      # защита от дублей внутри самого отчёта
    fuzzy = []        # неточные совпадения — их стоит показать человеку

    for name, info in from_1c.items():
        norm = normalize_name(name)
        if not norm or norm in seen:
            continue

        exact = any(norm == e for e in existing_norm)
        if exact:
            continue

        # Совпадение по ВХОЖДЕНИЮ — рискованное место: "иванов" входит в
        # "иванова", и это разные ИП. Автоматически различить нельзя, поэтому
        # НЕ заводим (лучше пропустить, чем создать дубль), но сообщаем.
        near = [e for e in existing_norm if names_match(norm, e)]
        if near:
            fuzzy.append((name, near[0]))
            continue

        seen.add(norm)
        to_create.append({
            "name": name.strip(),
            "manager_name": info["manager"],
            "client_status": "Рабочий",   # он покупает — значит рабочий
            "auto_created": True,
            "created_from": "1С: продажи",
            "reviewed": False,
        })

    if fuzzy:
        log(f"  ⚠️ Похожи на существующих — НЕ заведены, проверьте вручную ({len(fuzzy)}):")
        for name, near in fuzzy:
            log(f"    ? «{name}» похож на «{near}»")

    if not to_create:
        log("  Новых клиентов из 1С нет — все уже заведены.")
        return

    log(f"  НОВЫЕ КЛИЕНТЫ ИЗ 1С: {len(to_create)}")
    for c in to_create:
        log(f"    + {c['name']} ({c['manager_name']}, закупки {from_1c[c['name']]['revenue']:,.2f} BYN)")

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/clients",
        headers={**headers, "Prefer": "return=minimal"},
        json=to_create, timeout=60,
    )
    if resp.status_code not in (200, 201, 204):
        # Не валим весь импорт: продажи важнее. Клиентов заведём в следующий раз.
        log(f"  ⚠️ Не удалось завести клиентов: {resp.status_code} {resp.text}")
        return
    log(f"  Заведено карточек: {len(to_create)}. Разберите их в CRM "
        f"(адрес, категория, ассортимент) — раздел «Контроль».")


def _get_all_rest_rows(table, select):
    """Читает большую таблицу Supabase постранично (PostgREST Range)."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    out = []
    page = 1000
    start = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?select={select}",
            headers={**headers, "Range": f"{start}-{start + page - 1}"},
            timeout=120,
        )
        if resp.status_code not in (200, 206):
            raise RuntimeError(f"Не удалось прочитать {table}: {resp.status_code} {resp.text}")
        chunk = resp.json() or []
        out.extend(chunk)
        if len(chunk) < page:
            break
        start += page
    return out


def refresh_merged_client_turnover():
    """Устаревшая функция оставлена для совместимости.

    ВАЖНО: ничего не записывает в clients.revenue_total. Источник правды —
    purchase_history, а CRM пересчитывает оборот после входа. Это защищает от
    массового обнуления, если REST-чтение истории вернуло пустой набор из-за RLS.
    """
    log("  Оборот клиентов пересчитывает CRM из purchase_history; поле clients.revenue_total не изменяется.")

def replace_month(month, rows):
    """Атомарно заменяет данные месяца через SQL-функцию Supabase.

    Удаление и вставка выполняются в ОДНОЙ транзакции. Если хотя бы одна строка
    некорректна, старая история месяца остаётся на месте. Это устраняет риск,
    при котором прежний импорт сначала удалял месяц, а затем мог упасть.
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    if not rows:
        raise RuntimeError(
            f"Из отчёта не разобрано ни одной строки продаж за {month}. "
            f"Данные в CRM НЕ тронуты. Вероятно, в 1С изменилась структура отчёта."
        )

    # Единая схема всех JSON-объектов. Даже несопоставленная строка содержит
    # client_id=null — PostgREST больше не получает разные наборы ключей.
    fields = (
        "client_name", "category", "subgroup", "product", "sku", "month",
        "qty", "revenue", "manager_name", "client_id",
    )
    clean_rows = [{field: row.get(field) for field in fields} for row in rows]

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/replace_purchase_history_month_safe",
        headers=headers,
        json={"p_month": month, "p_rows": clean_rows},
        timeout=180,
    )
    if resp.status_code not in (200, 201, 204):
        if resp.status_code in (404, 400) and (
            "PGRST202" in resp.text or "replace_purchase_history_month_safe" in resp.text
        ):
            raise RuntimeError(
                "В Supabase не установлена безопасная функция импорта. "
                "Сначала запустите install-safe-sales-import.sql, затем повторите workflow."
            )
        raise RuntimeError(
            f"Не удалось безопасно заменить продажи за {month}: "
            f"{resp.status_code} {resp.text}"
        )

    try:
        inserted = int(resp.json())
    except Exception:
        inserted = len(clean_rows)
    log(f"  Безопасно заменены данные за {month}: {inserted} строк")

def find_xlsx_in_email(msg):
    for part in msg.walk():
        filename = part.get_filename()
        if not filename:
            continue
        decoded = decode_header(filename)[0]
        if isinstance(decoded[0], bytes):
            filename = decoded[0].decode(decoded[1] or "utf-8", errors="replace")
        if filename.lower().endswith((".xlsx", ".xls")):
            return filename, part.get_payload(decode=True)
    return None, None


def check_period(month):
    """Сверяет месяц отчёта с текущим.

    Зачем: у отчёта продаж в 1С есть параметр ПЕРИОДА. Если он зафиксирован
    конкретными датами (01.07.2026 - 31.07.2026), то с наступлением августа
    рассылка продолжит исправно приходить — но с июльскими данными. Продажи
    в CRM просто застынут, и никто этого не заметит. Ровно та же болезнь,
    что была у ПДЗ с «Произвольной датой».

    Допускаем текущий месяц и предыдущий: в первых числах 1С может присылать
    закрытие прошлого месяца, и это нормально.
    """
    today = date.today()
    cur = date(today.year, today.month, 1)
    prev = date(cur.year - 1, 12, 1) if cur.month == 1 else date(cur.year, cur.month - 1, 1)

    rep = datetime.strptime(month, "%Y-%m-%d").date()

    if rep == cur:
        log(f"  Период отчёта: {rep:%m.%Y} — текущий месяц, всё верно.")
        return
    if rep == prev:
        log(f"  ⚠️ Период отчёта: {rep:%m.%Y} — это ПРОШЛЫЙ месяц. Гружу (закрытие месяца), "
            f"но если так придёт и завтра — проверьте период в рассылке 1С.")
        return

    raise RuntimeError(
        f"Отчёт за {rep:%m.%Y}, а сейчас {cur:%m.%Y}. Данные НЕ загружены, чтобы не "
        f"перезаписать историю устаревшими цифрами. Причина обычно одна: в 1С у отчёта "
        f"«Продажи для CRM» период задан конкретными датами вместо «Этот месяц» — "
        f"проверьте параметр периода В ОТЧЁТЕ И В РАССЫЛКЕ."
    )


def main():
    log(f"Подключаюсь к почте {IMAP_HOST}:{IMAP_PORT}")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    mail.login(IMAP_USER, IMAP_PASS)
    mail.select("INBOX")

    # ИЩЕМ ПО ДАТЕ, А НЕ ПО ФЛАГУ "НЕПРОЧИТАННОЕ" (см. шапку файла).
    since = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
    status, data = mail.search(None, f'(SINCE {since})')
    if status != "OK":
        raise RuntimeError("Не удалось получить список писем")

    ids = data[0].split()
    log(f"Писем за последние {LOOKBACK_DAYS} дн.: {len(ids)}. Ищу «{SUBJECT_MARKER}».")

    # Берём самое свежее письмо ПО ДАТЕ ОТПРАВКИ: порядок ID её не гарантирует.
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
        candidates.append((sent, subject, msg))

    if not candidates:
        # ОШИБКА, А НЕ ТИХИЙ УСПЕХ. Раньше здесь скрипт молча выходил, и продажи
        # неделями не обновлялись при зелёном GitHub Action.
        raise RuntimeError(
            f"За последние {LOOKBACK_DAYS} дн. не найдено ни одного письма с темой "
            f"«{SUBJECT_MARKER}». Проверьте рассылку в 1С и фильтр Zimbra."
        )

    candidates.sort(key=lambda x: x[0])
    sent, subject, msg = candidates[-1]
    log(f"Самое свежее письмо: «{subject}» от {sent:%d.%m.%Y %H:%M}")

    filename, content = find_xlsx_in_email(msg)
    if not content:
        raise RuntimeError("В письме нет .xlsx-вложения.")
    log(f"  Вложение: {filename} ({len(content)} байт)")

    month, rows = parse_sales(content)
    log(f"  Разобрано строк: {len(rows)}")

    check_period(month)

    by_mgr = {}
    for r in rows:
        by_mgr.setdefault(r["manager_name"], {"rev": 0, "clients": set()})
        by_mgr[r["manager_name"]]["rev"] += r["revenue"]
        by_mgr[r["manager_name"]]["clients"].add(r["client_name"])
    for mgr, d in by_mgr.items():
        log(f"    {mgr}: {len(d['clients'])} клиентов, {d['rev']:,.2f} BYN")
    log(f"  ИТОГО выручка за {month}: {sum(r['revenue'] for r in rows):,.2f} BYN")

    # Сначала убеждаемся, что покупающие клиенты существуют в CRM, затем
    # проставляем каждой строке продаж прямой client_id. Если автозаведение
    # не сработало, сам импорт всё равно продолжится — строки останутся с именем.
    try:
        ensure_clients_exist(rows)
    except Exception as e:
        log(f"  ⚠️ Автозаведение клиентов не отработало: {e}")

    try:
        attach_client_ids(rows)
    except Exception as e:
        log(f"  ⚠️ Прямая привязка client_id не отработала: {e}")

    replace_month(month, rows)

    # После импорта безопасно обновляем обороты через алиасы. Если функция ещё
    # не установлена, импорт не падает — CRM всё равно рассчитает данные при входе.
    try:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/refresh_client_revenue_totals",
            headers=headers, json={}, timeout=120,
        )
        if resp.status_code not in (200, 201, 204):
            log(f"  ⚠️ Пересчёт оборотов после импорта пропущен: {resp.status_code} {resp.text}")
    except Exception as e:
        log(f"  ⚠️ Пересчёт оборотов после импорта не выполнен: {e}")

    # Оборот в CRM рассчитывается из purchase_history при загрузке сайта.
    # Импортёр намеренно НЕ переписывает clients.revenue_total: если чтение
    # истории ограничено политиками Supabase, нельзя обнулять карточки.

    # Письмо НЕ помечаем прочитанным: логика от этого флага больше не зависит.
    mail.logout()
    log("Готово.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ОШИБКА: {e}")
        sys.exit(1)
