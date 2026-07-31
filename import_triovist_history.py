#!/usr/bin/env python3
"""Повторяемая загрузка полной истории Триовиста с финальной проверкой базы."""
from __future__ import annotations

import os
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

import requests

from triovist_import_core import log, parse_history_report

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()


def rpc(name: str, payload: dict, timeout: int = 240):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"RPC {name} отклонён: {response.status_code} {response.text}")
    if response.status_code == 204 or not response.text.strip():
        return None
    return response.json()


def replace_month(month, rows, qty, revenue, source):
    return rpc(
        "triovist_replace_month_safe",
        {
            "p_month": month,
            "p_rows": rows,
            "p_source_file": source,
            "p_expected_qty": format(qty, "f"),
            "p_expected_revenue": format(revenue, "f"),
        },
    )


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/triovist_history_2023-02_to_2026-07.xlsx")
    if not path.exists():
        raise RuntimeError(f"Файл истории не найден: {path}")

    history = parse_history_report(path)
    total_revenue = sum((item[3] for item in history), start=Decimal("0"))
    total_qty = sum((item[2] for item in history), start=Decimal("0"))
    category_totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for _month, rows, _qty, _revenue in history:
        for row in rows:
            category_totals[row["category"]] += Decimal(row["revenue"])

    if len(history) != 42:
        raise RuntimeError(f"Ожидалось 42 месяца, разобрано {len(history)}. База не изменялась.")
    if len(category_totals) < 15:
        raise RuntimeError(
            f"Ожидалось не менее 15 исходных категорий, разобрано {len(category_totals)}: "
            + ", ".join(sorted(category_totals))
        )

    log(f"Проверено до загрузки: {len(history)} месяцев, {total_qty} шт., {total_revenue} BYN с НДС")
    log("Категории исходного файла: " + "; ".join(
        f"{name}={value.quantize(Decimal('0.01'))}" for name, value in sorted(category_totals.items())
    ))

    for index, (month, rows, qty, revenue) in enumerate(history, start=1):
        result = replace_month(month, rows, qty, revenue, f"history · {path.name}")
        log(f"[{index}/{len(history)}] ✅ {month[:7]}: {len(rows)} строк, {qty} шт., {revenue} BYN · {result}")

    verification = rpc(
        "triovist_verify_history",
        {
            "p_from_month": history[0][0],
            "p_to_month": history[-1][0],
            "p_expected_months": len(history),
            "p_expected_groups": 16,
            "p_expected_qty": format(total_qty, "f"),
            "p_expected_revenue": format(total_revenue, "f"),
        },
        timeout=120,
    )
    log(f"Финальная проверка Supabase: {verification}")
    log("✅ Полная история Триовиста загружена: 42 месяца, 16 распределённых групп, итоги совпали до копейки")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ОШИБКА: {exc}")
        sys.exit(1)
