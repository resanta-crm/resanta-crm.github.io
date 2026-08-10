#!/usr/bin/env python3
"""
Resanta CRM v22.7.23 — безопасное восстановление закрытых месяцев purchase_history.

Назначение:
- один раз восстановить историю продаж из финальных писем 1С;
- далее раз в месяц повторно фиксировать предыдущий закрытый месяц;
- никогда не удалять старый месяц до полной проверки нового отчёта.

Скрипт НЕ создаёт карточки клиентов. Он только перечитывает продажи, безопасно
сопоставляет client_id там, где соответствие однозначно, и атомарно заменяет
месяц через уже установленную RPC replace_purchase_history_month_safe.
"""

import argparse
import calendar
import email
import json
import gzip
import os
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta

import requests

import import_sales as sales

VERSION = "v22.7.23"
REPAIR_START_MONTH = os.environ.get("SALES_REPAIR_START_MONTH", "2025-01")
MAX_FULL_PER_MONTH = max(3, int(os.environ.get("SALES_REPAIR_MAX_EMAILS_PER_MONTH", "16")))
HEADER_DEADLINE = max(60, int(os.environ.get("SALES_REPAIR_HEADER_DEADLINE_SECONDS", "240")))
VERIFY_TOLERANCE = 0.02


def log(msg):
    print(msg, flush=True)


def month_start(value):
    if isinstance(value, date):
        return value.replace(day=1)
    return datetime.strptime(str(value)[:7], "%Y-%m").date().replace(day=1)


def next_month(value):
    value = month_start(value)
    if value.month == 12:
        return date(value.year + 1, 1, 1)
    return date(value.year, value.month + 1, 1)


def previous_month(value=None):
    value = month_start(value or date.today())
    return date(value.year - 1, 12, 1) if value.month == 1 else date(value.year, value.month - 1, 1)


def month_sequence(start, end):
    start, end = month_start(start), month_start(end)
    if start > end:
        raise ValueError("Начальный месяц позже конечного")
    out = []
    cur = start
    while cur <= end:
        out.append(cur)
        cur = next_month(cur)
        if len(out) > 120:
            raise RuntimeError("Слишком большой диапазон восстановления")
    return out


def imap_date(value):
    # IMAP принимает англоязычное сокращение месяца. На GitHub runner locale=C.
    return value.strftime("%d-%b-%Y")


def search_ids(mail, start_date, end_date):
    status, data = mail.search(None, f'(SINCE {imap_date(start_date)} BEFORE {imap_date(end_date)})')
    if status != "OK":
        raise RuntimeError(f"Gmail не вернул список писем {start_date}—{end_date}")
    return (data[0] or b"").split()


def subject_candidates(mail, ids, label):
    if not ids:
        return []
    out = []
    started = time.monotonic()
    batch_size = sales.HEADER_BATCH_SIZE
    total_batches = max(1, (len(ids) + batch_size - 1) // batch_size)
    for batch_no, offset in enumerate(range(0, len(ids), batch_size), 1):
        if time.monotonic() - started > HEADER_DEADLINE:
            raise RuntimeError(f"Gmail слишком долго отдаёт заголовки для {label}; данные не изменены")
        batch = ids[offset:offset + batch_size]
        metas = sales.fetch_message_headers_batch(mail, batch)
        for meta in metas:
            if sales.SUBJECT_MARKER.lower() in meta["subject"].lower():
                out.append(meta)
    out.sort(key=lambda x: x["sent"], reverse=True)
    return out


def fetch_report(mail, meta):
    msg_id, sent, subject = meta["id"], meta["sent"], meta["subject"]
    status, msg_data = mail.fetch(msg_id, "(RFC822)")
    if status != "OK" or not msg_data:
        raise RuntimeError("Gmail не вернул полное письмо")
    raw = next(
        (item[1] for item in msg_data
         if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], (bytes, bytearray))),
        None,
    )
    if not raw:
        raise RuntimeError("Пустое тело письма")
    msg = email.message_from_bytes(raw)
    filename, content = sales.find_xlsx_in_email(msg)
    if not content:
        raise RuntimeError("Нет Excel-вложения")
    month, rows = sales.parse_sales(content)  # внутри уже три контроля 1С
    start_date, end_date = sales.parse_report_bounds(content)
    return {
        "month": month_start(month),
        "period_start": start_date,
        "period_end": end_date,
        "sent": sent,
        "subject": subject,
        "filename": filename,
        "rows": rows,
    }


def latest_valid_report_for_month(mail, target):
    """Берёт самый поздний валидный отчёт конкретного закрытого месяца.

    Основное окно: с 20-го числа месяца до 4-го числа следующего месяца.
    Это позволяет подобрать финальный отчёт месяца и, если 1С ещё присылала
    закрытие в первые дни следующего месяца, взять именно его. Если в окне нет
    подходящего письма, делается один fallback на весь календарный месяц.
    """
    target = month_start(target)
    nxt = next_month(target)
    grace_end = nxt + timedelta(days=4)
    primary_start = target.replace(day=min(20, calendar.monthrange(target.year, target.month)[1]))

    def scan(start_date, end_date, label):
        ids = search_ids(mail, start_date, end_date)
        metas = subject_candidates(mail, ids, label)
        log(f"  {target:%m.%Y}: в окне {start_date:%d.%m}–{(end_date-timedelta(days=1)):%d.%m} найдено {len(metas)} писем «{sales.SUBJECT_MARKER}».")
        errors = []
        for idx, meta in enumerate(metas[:MAX_FULL_PER_MONTH], 1):
            try:
                rep = fetch_report(mail, meta)
            except Exception as exc:
                errors.append(f"{meta['sent']:%d.%m %H:%M}: {exc}")
                continue
            if rep["month"] == target:
                return rep, errors
        return None, errors

    report, errors = scan(primary_start, grace_end, "финальное окно")
    if report:
        return report

    report, fallback_errors = scan(target, nxt, "полный месяц")
    errors.extend(fallback_errors)
    if report:
        return report

    tail = "; ".join(errors[-4:])
    raise RuntimeError(
        f"Не найден валидный отчёт 1С за {target:%m.%Y}. "
        f"История НЕ изменялась." + (f" Последние проверки: {tail}" if tail else "")
    )


def build_client_resolver():
    clients = sales._get_all_rest_rows("clients", "id,name,assortment,manager_name")
    try:
        aliases = sales._get_all_rest_rows("client_aliases", "client_id,alias_name")
    except Exception as exc:
        log(f"⚠️ client_aliases недоступна: {exc}")
        aliases = []

    aliases_by_id = defaultdict(list)
    for a in aliases:
        aliases_by_id[str(a.get("client_id") or "")].append(a.get("alias_name") or "")

    exact = defaultdict(set)
    fuzzy_names = []
    for c in clients:
        cid = str(c.get("id") or "")
        if not cid:
            continue
        manager = str(c.get("manager_name") or "")
        names = sales.client_name_variants(c) + aliases_by_id.get(cid, [])
        for name in names:
            key = sales.canonical_client_key(name)
            norm = sales.normalize_name(name)
            if key:
                exact[key].add(cid)
            if norm:
                fuzzy_names.append((norm, cid, manager, str(name)))

    unique_exact = {key: next(iter(ids)) for key, ids in exact.items() if len(ids) == 1}
    return {"exact": exact, "unique_exact": unique_exact, "fuzzy_names": fuzzy_names}


def apply_client_ids(rows, resolver):
    matched_exact = matched_fuzzy = 0
    ambiguous = set()
    unresolved = set()

    for row in rows:
        row["client_id"] = None
        key = sales.canonical_client_key(row.get("client_name"))
        ids = resolver["exact"].get(key, set())
        if key in resolver["unique_exact"]:
            row["client_id"] = resolver["unique_exact"][key]
            matched_exact += 1
            continue
        if len(ids) > 1:
            ambiguous.add(row.get("client_name") or "")
            continue

        # Вторая ступень — только если найден ровно ОДИН кандидат по безопасному
        # вхождению нормализованного юр. имени и совпадает менеджер. Если ТТ
        # несколько, строка остаётся без client_id: UI объединит её по юрлицу,
        # а мы не припишем продажи случайной торговой точке.
        norm = sales.normalize_name(row.get("client_name"))
        manager = str(row.get("manager_name") or "")
        candidates = set()
        if norm and len(norm) >= 6:
            for cand_norm, cid, cand_manager, _name in resolver["fuzzy_names"]:
                if manager and cand_manager and manager.lower() not in cand_manager.lower() and cand_manager.lower() not in manager.lower():
                    continue
                if sales.names_match(norm, cand_norm):
                    candidates.add(cid)
        if len(candidates) == 1:
            row["client_id"] = next(iter(candidates))
            matched_fuzzy += 1
        elif len(candidates) > 1:
            ambiguous.add(row.get("client_name") or "")
        else:
            unresolved.add(row.get("client_name") or "")

    log(f"    client_id: точно {matched_exact}, безопасно по алиасу/юрлицу {matched_fuzzy}, всего строк {len(rows)}")
    if ambiguous:
        log(f"    ⚠️ Неоднозначные ({len(ambiguous)}): " + "; ".join(sorted(ambiguous)[:12]))
    if unresolved:
        log(f"    ⚠️ Без карточки ({len(unresolved)}): " + "; ".join(sorted(unresolved)[:12]))
    return {"matched_exact": matched_exact, "matched_fuzzy": matched_fuzzy,
            "ambiguous": sorted(ambiguous), "unresolved": sorted(unresolved)}


def month_totals(rows):
    by_manager = defaultdict(float)
    by_client = defaultdict(float)
    total = 0.0
    for r in rows:
        rev = float(r.get("revenue") or 0)
        total += rev
        by_manager[str(r.get("manager_name") or "")] += rev
        by_client[str(r.get("client_name") or "")] += rev
    return total, dict(by_manager), dict(by_client)


def read_db_month(month):
    out = []
    start = 0
    page = 1000
    headers = {"apikey": sales.SUPABASE_KEY, "Authorization": f"Bearer {sales.SUPABASE_KEY}"}
    month_value = month_start(month).isoformat()
    while True:
        resp = requests.get(
            f"{sales.SUPABASE_URL}/rest/v1/purchase_history",
            headers={**headers, "Range": f"{start}-{start + page - 1}"},
            params={"select": "*", "month": f"eq.{month_value}"},
            timeout=120,
        )
        if resp.status_code not in (200, 206):
            raise RuntimeError(f"Проверка месяца {month_value} после записи: {resp.status_code} {resp.text}")
        chunk = resp.json() or []
        out.extend(chunk)
        if len(chunk) < page:
            break
        start += page
    return out


def assert_db_matches(month, expected):
    actual = read_db_month(month)
    exp_total, exp_mgr, exp_clients = month_totals(expected)
    act_total, act_mgr, act_clients = month_totals(actual)
    errors = []
    if abs(exp_total - act_total) > VERIFY_TOLERANCE:
        errors.append(f"итог {act_total:.2f} вместо {exp_total:.2f}")
    for mgr, value in exp_mgr.items():
        if abs(value - act_mgr.get(mgr, 0.0)) > VERIFY_TOLERANCE:
            errors.append(f"{mgr}: {act_mgr.get(mgr,0):.2f} вместо {value:.2f}")
    if len(actual) != len(expected):
        errors.append(f"строк {len(actual)} вместо {len(expected)}")
    if errors:
        raise RuntimeError(f"Контроль Supabase за {month_start(month):%m.%Y} не пройден: " + "; ".join(errors))
    log(f"    ✅ Контроль Supabase: {len(actual)} строк, {act_total:,.2f} BYN — совпало.")
    return {"rows": len(actual), "revenue": round(act_total, 2), "clients": len(act_clients)}


def refresh_totals():
    try:
        resp = requests.post(
            f"{sales.SUPABASE_URL}/rest/v1/rpc/refresh_client_revenue_totals",
            headers=sales._api_headers(), json={}, timeout=180,
        )
        if resp.status_code not in (200, 201, 204):
            log(f"⚠️ Пересчёт clients.revenue_total пропущен: {resp.status_code} {resp.text}")
    except Exception as exc:
        log(f"⚠️ Пересчёт clients.revenue_total не выполнен: {exc}")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--full-history", action="store_true", help="с января 2025 до предыдущего закрытого месяца")
    p.add_argument("--previous-month", action="store_true", help="только предыдущий закрытый месяц")
    p.add_argument("--start", help="первый месяц YYYY-MM")
    p.add_argument("--end", help="последний месяц YYYY-MM")
    p.add_argument("--dry-run", action="store_true", help="только найти и проверить отчёты, ничего не записывать")
    return p.parse_args()


def target_months(args):
    prev = previous_month()
    if args.previous_month:
        return [prev]
    start = month_start(args.start or REPAIR_START_MONTH)
    end = month_start(args.end or prev)
    if end > prev:
        end = prev
    return month_sequence(start, end)


def main():
    args = parse_args()
    months = target_months(args)
    if not months:
        raise RuntimeError("Нет месяцев для восстановления")

    sales.safe_set_import_status(
        "sales_history_repair", "running",
        report_period=f"{months[0]:%Y-%m}..{months[-1]:%Y-%m}",
        details=f"{VERSION}; {'dry-run' if args.dry_run else 'apply'}",
    )

    log(f"{VERSION}: восстановление истории {months[0]:%m.%Y} — {months[-1]:%m.%Y}; месяцев: {len(months)}")
    log("Сначала проверяю ВСЕ месяцы. До успешного окончания этой фазы Supabase не изменяется.")

    mail = sales.imaplib.IMAP4_SSL(sales.IMAP_HOST, sales.IMAP_PORT, timeout=sales.MAIL_TIMEOUT)
    mail.login(sales.IMAP_USER, sales.IMAP_PASS)
    sales.select_mailbox(mail)
    try:
        mail.sock.settimeout(sales.MAIL_TIMEOUT)
    except Exception:
        pass

    staged = []
    try:
        for i, target in enumerate(months, 1):
            log(f"\n[{i}/{len(months)}] Ищу финальный отчёт за {target:%m.%Y}...")
            rep = latest_valid_report_for_month(mail, target)
            total, by_mgr, by_client = month_totals(rep["rows"])
            rep["revenue"] = total
            rep["manager_totals"] = by_mgr
            rep["client_count"] = len(by_client)
            staged.append(rep)
            log(f"  ✅ {target:%m.%Y}: письмо {rep['sent']:%d.%m.%Y %H:%M}, {rep['filename']}; "
                f"{len(rep['rows'])} SKU-строк; {len(by_client)} клиентов; {total:,.2f} BYN")
    finally:
        try:
            mail.logout()
        except Exception:
            pass

    if len(staged) != len(months):
        raise RuntimeError("Не все месяцы прошли предварительную проверку; запись отменена")

    log("\n✅ Предварительная проверка всех месяцев завершена. Старые данные до этого момента не менялись.")

    # Перед первой записью делаем полный технический backup текущих строк
    # восстанавливаемых месяцев. Он сохраняется как artifact GitHub Action и
    # позволяет откатить историю вручную даже при непредвиденной ошибке выбора письма.
    if not args.dry_run:
        log("Создаю резервную копию текущей purchase_history ДО изменений...")
        backup = {}
        for target in months:
            rows_before = read_db_month(target)
            backup[target.strftime("%Y-%m")] = rows_before
            log(f"  backup {target:%m.%Y}: {len(rows_before)} строк")
        with gzip.open("sales_history_backup_before_repair.json.gz", "wt", encoding="utf-8") as fh:
            json.dump({"version": VERSION, "created_at": datetime.now().isoformat(), "months": backup}, fh, ensure_ascii=False)
        log("✅ Backup создан. Только теперь разрешена запись в Supabase.")

    resolver = build_client_resolver()
    summary = {"version": VERSION, "mode": "dry-run" if args.dry_run else "apply", "months": []}

    for i, rep in enumerate(staged, 1):
        month = rep["month"]
        log(f"\n[{i}/{len(staged)}] {'Проверяю' if args.dry_run else 'Восстанавливаю'} {month:%m.%Y}...")
        link = apply_client_ids(rep["rows"], resolver)
        item = {
            "month": month.strftime("%Y-%m"),
            "message_at": rep["sent"].isoformat(),
            "file": rep["filename"],
            "rows": len(rep["rows"]),
            "clients": rep["client_count"],
            "revenue": round(rep["revenue"], 2),
            "manager_totals": {k: round(v, 2) for k, v in rep["manager_totals"].items()},
            "unresolved": link["unresolved"],
            "ambiguous": link["ambiguous"],
        }
        if not args.dry_run:
            sales.replace_month(month.isoformat(), rep["rows"])
            item["db_check"] = assert_db_matches(month, rep["rows"])
        summary["months"].append(item)

    if not args.dry_run:
        refresh_totals()

    with open("sales_history_repair_summary.json", "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)

    total_rows = sum(x["rows"] for x in summary["months"])
    total_rev = sum(x["revenue"] for x in summary["months"])
    sales.safe_set_import_status(
        "sales_history_repair", "ok",
        report_period=f"{months[0]:%Y-%m}..{months[-1]:%Y-%m}",
        report_date=date.today().isoformat(),
        row_count=total_rows,
        details=(f"{VERSION}; {'DRY RUN' if args.dry_run else 'восстановлено'} {len(months)} мес.; "
                 f"сумма проверенных месячных оборотов {total_rev:.2f} BYN"),
    )
    log(f"\nГОТОВО: {'проверено' if args.dry_run else 'восстановлено'} месяцев: {len(months)}; строк: {total_rows}.")
    log("Файл контроля: sales_history_repair_summary.json")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        try:
            sales.safe_set_import_status("sales_history_repair", "error", error_text=str(exc)[:2000])
        except Exception:
            pass
        log(f"ОШИБКА: {exc}")
        sys.exit(1)
