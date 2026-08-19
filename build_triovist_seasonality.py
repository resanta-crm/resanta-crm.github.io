#!/usr/bin/env python3
"""Build compact seasonality profiles for Triovist stock recommendations.

Uses the already verified 1C history workbook in data/ and produces a static JSON
profile. The browser loads this file lazily, so no extra Supabase RPCs are needed.

Method:
- build monthly quantity series from first sale onward, filling missing months by 0;
- calculate month-of-year factor against the entity's own monthly baseline;
- shrink noisy factors toward 1.0 and clamp them to a safe 0.35..2.50 range;
- expose SKU, subgroup and category levels so the UI can fall back when SKU
  history is too short.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

from triovist_import_core import parse_history_report

VERSION = "v23.5.0"
SOURCE = Path("data/triovist_history_2023-02_to_2026-07.xlsx")
DEST = Path("data/triovist_seasonality.json")
MIN_FACTOR = 0.35
MAX_FACTOR = 2.50


def norm(value: object) -> str:
    text = str(value or "").lower().replace("ё", "е")
    text = re.sub(r"[^a-zа-я0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def main() -> None:
    if not SOURCE.exists():
        raise RuntimeError(f"History file not found: {SOURCE}")

    history = parse_history_report(SOURCE)
    months = [str(month)[:7] for month, *_ in history]
    month_index = {month: idx for idx, month in enumerate(months)}

    # level -> key -> month -> qty
    series: dict[str, dict[str, dict[str, float]]] = {
        "sku": defaultdict(lambda: defaultdict(float)),
        "subgroup": defaultdict(lambda: defaultdict(float)),
        "category": defaultdict(lambda: defaultdict(float)),
    }
    labels: dict[str, dict[str, str]] = {
        "sku": {}, "subgroup": {}, "category": {}
    }

    for month, rows, _qty, _revenue in history:
        mk = str(month)[:7]
        for row in rows:
            qty = float(Decimal(str(row.get("qty") or "0")))
            sku = norm(row.get("sku"))
            subgroup = norm(row.get("subgroup"))
            category = norm(row.get("category"))
            if sku:
                series["sku"][sku][mk] += qty
                labels["sku"].setdefault(sku, str(row.get("sku") or ""))
            if subgroup:
                series["subgroup"][subgroup][mk] += qty
                labels["subgroup"].setdefault(subgroup, str(row.get("subgroup") or ""))
            if category:
                series["category"][category][mk] += qty
                labels["category"].setdefault(category, str(row.get("category") or ""))

    levels: dict[str, dict[str, dict]] = {"sku": {}, "subgroup": {}, "category": {}}

    for level, entities in series.items():
        for key, month_values in entities.items():
            positive = [month_index[m] for m, q in month_values.items() if q > 0 and m in month_index]
            if not positive:
                continue
            first_idx = min(positive)
            active_months = months[first_idx:]
            values = [float(month_values.get(m, 0.0)) for m in active_months]
            total_qty = sum(values)
            if not active_months or total_qty <= 0:
                continue
            baseline = total_qty / len(active_months)
            global_conf = min(1.0, len(active_months) / 24.0) * min(1.0, total_qty / 24.0)

            factors: list[float] = []
            observations: list[int] = []
            for calendar_month in range(1, 13):
                vals = []
                for mk in active_months:
                    if int(mk[5:7]) == calendar_month:
                        vals.append(float(month_values.get(mk, 0.0)))
                observations.append(len(vals))
                if not vals or baseline <= 0:
                    factors.append(1.0)
                    continue
                raw = (sum(vals) / len(vals)) / baseline
                month_conf = min(1.0, len(vals) / 2.0)
                weight = global_conf * month_conf
                shrunk = 1.0 + (raw - 1.0) * weight
                factors.append(round(clamp(shrunk, MIN_FACTOR, MAX_FACTOR), 4))

            levels[level][key] = {
                "label": labels[level].get(key, key),
                "baseline_monthly": round(baseline, 4),
                "factors": factors,
                "confidence": round(global_conf, 4),
                "active_months": len(active_months),
                "total_qty": round(total_qty, 3),
                "observations": observations,
            }

    payload = {
        "version": VERSION,
        "history_from": months[0] if months else None,
        "history_to": months[-1] if months else None,
        "factor_min": MIN_FACTOR,
        "factor_max": MAX_FACTOR,
        "method": "monthly quantity seasonality with shrinkage; SKU -> subgroup -> category fallback",
        "levels": levels,
        "counts": {name: len(values) for name, values in levels.items()},
    }

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"✅ {DEST}: sku={len(levels['sku'])}, subgroup={len(levels['subgroup'])}, "
        f"category={len(levels['category'])}, history={payload['history_from']}..{payload['history_to']}"
    )


if __name__ == "__main__":
    main()
