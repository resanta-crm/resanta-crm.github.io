#!/usr/bin/env python3
"""Resanta CRM — PDZ parser compatibility fix v23.4.11.

1C moved the client name from column 1 to the column headed «Клиент» (currently
column 3). The legacy parser hard-coded column 1, so it recognized manager
summary rows but never recognized client rows and correctly refused to replace
the last good snapshot with a false zero.

This wrapper keeps the proven inbox-first mail selection/writer from v23.4.10,
but replaces only the parser with a header-driven implementation and validates
that client overdue totals equal the allowed managers' summary totals.
"""
from __future__ import annotations

import io
import pandas as pd

import import_pdz as base
import import_pdz_safe as safe


def _find_exact_column(df: pd.DataFrame, label: str) -> int | None:
    for _, row in df.iterrows():
        for col, value in row.items():
            if pd.notna(value) and str(value).strip() == label:
                return int(col)
    return None


def parse_pdz_v23411(xlsx_bytes: bytes):
    df = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=0, header=None)
    report_date = base.read_report_date(df)
    cols = base.find_columns(df)
    if "total" not in cols or "overdue" not in cols:
        raise RuntimeError("Не найдены контрольные колонки ПДЗ «Всего/Просрочено»")

    c_client = _find_exact_column(df, "Клиент")
    if c_client is None:
        raise RuntimeError("Не найдена колонка клиента по заголовку «Клиент»")
    c_doc = cols.get("doc")
    if c_doc is None:
        c_doc = _find_exact_column(df, "Объект расчетов")
    if c_doc is None:
        raise RuntimeError("Не найдена колонка документа «Объект расчетов»")

    c_total = cols["total"]
    c_overdue = cols["overdue"]
    c_overdue_pct = cols.get("overdue_pct")
    c_overdue_days = cols.get("overdue_days")

    current_manager = None
    rows = []
    recognized_managers = set()
    manager_overdue_totals = {}

    for _, row in df.iterrows():
        debt_total = base.num(row[c_total]) if c_total in row.index else None
        if debt_total is None:
            continue

        client_value = row[c_client] if c_client in row.index else None
        doc_value = row[c_doc] if c_doc in row.index else None

        # Client row is identified by the actual «Клиент» header, never by a
        # fixed column number. This survives future 1C column shifts.
        if pd.notna(client_value):
            client_name = str(client_value).strip()
            if not client_name or client_name == "Клиент":
                continue
            if not base.is_allowed_manager(current_manager):
                continue
            overdue = base.num(row[c_overdue]) or 0
            if overdue <= 0:
                continue
            rows.append({
                "client_name": client_name,
                "manager_name": current_manager,
                "debt_overdue": overdue,
                "debt_overdue_pct": base.num(row[c_overdue_pct]) if c_overdue_pct is not None else None,
                "debt_overdue_days": int(base.num(row[c_overdue_days]) or 0) if c_overdue_days is not None else 0,
                "report_date": report_date.isoformat() if report_date else None,
            })
            continue

        # Manager summary row: no client and no document.
        if pd.isna(doc_value):
            raw = row[0] if 0 in row.index else None
            name = str(raw).strip() if pd.notna(raw) else ""
            if name and name not in ("№ в группе", "Итого", "№ п/п"):
                current_manager = name
                if base.is_allowed_manager(name):
                    short = next((x for x in base.ALLOWED_MANAGERS if x.lower() in name.lower()), name)
                    recognized_managers.add(short)
                    manager_overdue_totals[short] = base.num(row[c_overdue]) or 0

    expected = round(sum(float(v or 0) for v in manager_overdue_totals.values()), 2)
    actual = round(sum(float(r.get("debt_overdue") or 0) for r in rows), 2)
    tolerance = max(0.05, expected * 0.001)
    if recognized_managers and abs(expected - actual) > tolerance:
        raise RuntimeError(
            f"Контроль ПДЗ не пройден: итоги менеджеров {expected:.2f} BYN, "
            f"разобрано клиентов {actual:.2f} BYN. Старый хороший срез сохранён."
        )

    meta = {
        "recognized_managers": sorted(recognized_managers),
        "manager_overdue_totals": manager_overdue_totals,
        "validated_zero": bool(recognized_managers) and expected <= 0 and actual <= 0,
        "client_column": c_client,
        "validated_total": actual,
    }
    return rows, report_date, meta


# Patch both references used by the inbox-first importer.
base.parse_pdz = parse_pdz_v23411
safe.base.parse_pdz = parse_pdz_v23411


def main() -> None:
    safe.main()


if __name__ == "__main__":
    main()
