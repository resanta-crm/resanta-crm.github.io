#!/usr/bin/env python3
"""Однократно и быстро перезагружает выбранный файл «Продажи для CRM».

Обычные менеджеры (Руднев, Ачинович, Шкуран) обновляются по своим колонкам.
ООО «Триовист» берётся из общей колонки месяца и распределяется в Supabase
по действующим товарным группам Александренко/Кришталь.

Файл читается ОДИН раз в потоковом режиме. До любого изменения базы проходят:
проверка периода, артикулов и сверка итогов отчёта 1С до копейки.
"""
from __future__ import annotations

import io
import os
import re
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import openpyxl
import requests

import import_sales
from triovist_import_core import ARTICLE_RE, is_triovist, parse_month_header, dec, money, quantity, log

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()
SKIP_NAMES = {"Контрагент", "Номенклатура", "Параметры:", "Отбор:", "Итого", "Артикул"}


def _text(value):
    return str(value or "").strip()


def _number(value):
    if value in (None, ""):
        return 0.0
    return float(value)


def _parse_snapshot(content: bytes):
    if content[:2] != b"PK":
        raise RuntimeError("Нужен файл .xlsx")
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    ws = wb.active

    # Один проход: храним только значения строк и отступ первой колонки.
    raw_rows = []
    header_rows = []
    for row_idx, cells in enumerate(ws.iter_rows(), start=1):
        values = [cell.value for cell in cells]
        if row_idx <= 15:
            header_rows.append(values)
        first = cells[0] if cells else None
        name = _text(first.value if first else None)
        if name:
            raw_rows.append((row_idx, name, int(first.alignment.indent or 0), values))

    # Период из параметров.
    month = None
    for values in header_rows:
        for value in values[:12]:
            match = re.search(r"Период:\s*(\d{2})\.(\d{2})\.(\d{4})", _text(value))
            if match:
                _day, mm, yyyy = match.groups()
                month = f"{yyyy}-{mm}-01"
                break
        if month:
            break
    if not month:
        raise RuntimeError("Не найден период отчёта")

    # Колонки трёх обычных менеджеров.
    manager_cols = {}
    for ridx, values in enumerate(header_rows):
        for cidx, value in enumerate(values):
            short = import_sales.short_manager(_text(value))
            if not short:
                continue
            if ridx + 1 >= len(header_rows):
                continue
            sub = header_rows[ridx + 1]
            qty_col = rev_col = None
            for offset in (0, 1):
                if cidx + offset >= len(sub):
                    continue
                label = _text(sub[cidx + offset]).lower()
                if label.startswith("кол"):
                    qty_col = cidx + offset
                elif label.startswith("выруч"):
                    rev_col = cidx + offset
            if qty_col is not None and rev_col is not None:
                manager_cols[short] = (qty_col, rev_col)
    missing = [m for m in import_sales.ALLOWED_MANAGERS if m not in manager_cols]
    if missing:
        raise RuntimeError("Не найдены колонки менеджеров: " + ", ".join(missing))

    # Общая пара Количество/Выручка за месяц — источник Триовиста.
    tri_qty_col = tri_rev_col = None
    for ridx, values in enumerate(header_rows[:-1]):
        for cidx, value in enumerate(values[:-1]):
            if parse_month_header(value) != month:
                continue
            sub = header_rows[ridx + 1]
            if cidx + 1 < len(sub) and _text(sub[cidx]).lower().startswith("кол") and _text(sub[cidx + 1]).lower().startswith("выруч"):
                tri_qty_col, tri_rev_col = cidx, cidx + 1
    if tri_qty_col is None:
        raise RuntimeError(f"Не найдена общая колонка продаж за {month[:7]}")

    report_total_values = next((values for _ri, name, _ind, values in raw_rows if name.strip().lower()=="итого"), None)
    body = [r for r in raw_rows if r[1] not in SKIP_NAMES]
    if not body:
        raise RuntimeError("Отчёт пустой")
    is_product = [False] * len(body)
    for i in range(len(body) - 1):
        if not ARTICLE_RE.fullmatch(body[i][1]) and ARTICLE_RE.fullmatch(body[i + 1][1]):
            is_product[i] = True
    client_indent = min(r[2] for r in body)

    client = None
    heading_stack = {}
    standard_rows = []
    tri_rows = []
    tri_total_qty = tri_total_revenue = None
    for i, (row_idx, name, indent, values) in enumerate(body):
        if ARTICLE_RE.fullmatch(name):
            continue
        if is_product[i]:
            if not client:
                continue
            headings = [heading_stack[k] for k in sorted(heading_stack) if k > client_indent]
            category = headings[0] if headings else "Без категории"
            subgroup = headings[-1] if len(headings) > 1 else (headings[0] if headings else "Прочее")
            sku = body[i + 1][1]
            for manager, (qcol, rcol) in manager_cols.items():
                revenue = _number(values[rcol] if rcol < len(values) else None)
                if not revenue:
                    continue
                qty = _number(values[qcol] if qcol < len(values) else None)
                standard_rows.append({
                    "client_name": client, "category": category, "subgroup": subgroup,
                    "product": name, "sku": sku, "month": month,
                    "qty": int(qty) if float(qty).is_integer() else qty,
                    "revenue": revenue, "manager_name": manager,
                })
            if is_triovist(client):
                q = quantity(dec(values[tri_qty_col] if tri_qty_col < len(values) else None))
                r = money(dec(values[tri_rev_col] if tri_rev_col < len(values) else None))
                if q != 0 or r != 0:
                    tri_rows.append({
                        "category": category, "subgroup": subgroup, "product": name, "sku": sku,
                        "qty": format(q, "f"), "revenue": format(r, "f"),
                    })
            continue

        if indent <= client_indent:
            client = name
            heading_stack = {}
            if is_triovist(client):
                tri_total_qty = quantity(dec(values[tri_qty_col] if tri_qty_col < len(values) else None))
                tri_total_revenue = money(dec(values[tri_rev_col] if tri_rev_col < len(values) else None))
        else:
            for key in [k for k in heading_stack if k >= indent]:
                del heading_stack[key]
            heading_stack[indent] = name

    import_sales.validate_sku_rows(standard_rows)
    if not standard_rows:
        raise RuntimeError("Не разобраны продажи обычных менеджеров")
    if not tri_rows or tri_total_qty is None or tri_total_revenue is None:
        raise RuntimeError("Не разобраны продажи ООО Триовист")

    # Сверка обычных менеджеров с общей строкой «Итого».
    if report_total_values is not None:
        parsed = {}
        for row in standard_rows:
            parsed[row["manager_name"]] = parsed.get(row["manager_name"], 0.0) + float(row["revenue"])
        errors = []
        for manager, (_qcol, rcol) in manager_cols.items():
            expected = _number(report_total_values[rcol] if rcol < len(report_total_values) else None)
            actual = parsed.get(manager, 0.0)
            tolerance = max(0.01, abs(expected) * 0.00001)
            if abs(actual - expected) > tolerance:
                errors.append(f"{manager}: 1С {expected:.2f}, SKU {actual:.2f}")
        if errors:
            raise RuntimeError("Контроль обычных менеджеров не сошёлся: " + "; ".join(errors))

    parsed_tri_qty = quantity(sum((dec(r["qty"]) for r in tri_rows), Decimal("0")))
    parsed_tri_revenue = money(sum((dec(r["revenue"]) for r in tri_rows), Decimal("0")))
    if parsed_tri_qty != tri_total_qty or parsed_tri_revenue != tri_total_revenue:
        raise RuntimeError(
            f"Контроль Триовиста не сошёлся: 1С {tri_total_qty} шт. / {tri_total_revenue} BYN; "
            f"SKU {parsed_tri_qty} шт. / {parsed_tri_revenue} BYN"
        )
    return month, standard_rows, tri_rows, tri_total_qty, tri_total_revenue


def replace_triovist(month, rows, qty, revenue, source):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/triovist_replace_month_safe",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
        json={
            "p_month": month, "p_rows": rows, "p_source_file": source,
            "p_expected_qty": format(qty, "f"), "p_expected_revenue": format(revenue, "f"),
        }, timeout=240,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase отклонил Триовист: {response.status_code} {response.text}")
    return response.json() if response.text.strip() else {"ok": True}


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/sales_2026-07-final.xlsx")
    if not path.exists():
        raise RuntimeError(f"Файл не найден: {path}")
    month, standard_rows, tri_rows, tri_qty, tri_revenue = _parse_snapshot(path.read_bytes())

    log(f"Файл {path.name}; месяц {month[:7]}")
    by_manager = {}
    for row in standard_rows:
        item = by_manager.setdefault(row["manager_name"], {"qty": 0.0, "revenue": 0.0, "rows": 0})
        item["qty"] += float(row.get("qty") or 0)
        item["revenue"] += float(row.get("revenue") or 0)
        item["rows"] += 1
    for manager, values in sorted(by_manager.items()):
        log(f"  {manager}: {values['rows']} SKU-строк, {values['qty']:g} шт., {values['revenue']:.2f} BYN")
    log(f"  Триовист: {len(tri_rows)} SKU-строк, {tri_qty} шт., {tri_revenue} BYN")

    # Только после всех локальных проверок выполняются транзакционные RPC.
    try:
        import_sales.ensure_clients_exist(standard_rows)
        import_sales.attach_client_ids(standard_rows)
    except Exception as exc:
        log(f"⚠️ Автопривязка клиентов: {exc}")

    import_sales.replace_month(month, standard_rows)
    tri_result = replace_triovist(month, tri_rows, tri_qty, tri_revenue, f"manual snapshot · {path.name}")

    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/refresh_client_revenue_totals",
            headers=import_sales._api_headers(), json={}, timeout=120,
        )
        if response.status_code not in (200, 201, 204):
            log(f"⚠️ Пересчёт оборотов: {response.status_code} {response.text}")
    except Exception as exc:
        log(f"⚠️ Пересчёт оборотов: {exc}")

    total_standard = sum(float(r.get("revenue") or 0) for r in standard_rows)
    import_sales.safe_set_import_status(
        "sales", "ok", report_period=month[:7], row_count=len(standard_rows),
        details=f"Ручная перезагрузка {path.name}; обычные менеджеры {total_standard:.2f} BYN; Триовист {tri_revenue} BYN",
    )
    log(f"✅ Месяц {month[:7]} обновлён для всех пяти менеджеров. Триовист RPC: {tri_result}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ОШИБКА: {exc}")
        sys.exit(1)
