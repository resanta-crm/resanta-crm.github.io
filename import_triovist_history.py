#!/usr/bin/env python3
"""Однократная (повторяемая) загрузка полной истории Триовиста по месяцам."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

from triovist_import_core import log, parse_history_report

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()


def replace_month(month, rows, qty, revenue, source):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/triovist_replace_month_safe",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "p_month": month,
            "p_rows": rows,
            "p_source_file": source,
            "p_expected_qty": format(qty, "f"),
            "p_expected_revenue": format(revenue, "f"),
        },
        timeout=240,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Месяц {month[:7]} не загружен: {response.status_code} {response.text}")


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/triovist_history_2023-02_to_2026-07.xlsx")
    if not path.exists():
        raise RuntimeError(f"Файл истории не найден: {path}")
    history = parse_history_report(path)
    total_revenue = sum((item[3] for item in history), start=0)
    total_qty = sum((item[2] for item in history), start=0)
    log(f"Проверено до загрузки: {len(history)} месяцев, {total_qty} шт., {total_revenue} BYN с НДС")
    for index, (month, rows, qty, revenue) in enumerate(history, start=1):
        replace_month(month, rows, qty, revenue, f"history · {path.name}")
        log(f"[{index}/{len(history)}] ✅ {month[:7]}: {len(rows)} строк, {qty} шт., {revenue} BYN")
    log("✅ Полная история Триовиста загружена и сверена по каждому месяцу")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ОШИБКА: {exc}")
        sys.exit(1)
