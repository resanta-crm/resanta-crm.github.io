#!/usr/bin/env python3
"""Resanta CRM — payments parser fix v23.4.11.

In the August 1C report a client can have exactly the same full name as a CRM
manager (for example «Ачинович Екатерина Геннадьевна»). The old parser treated
such a client row as another manager row, dropped the following payment and then
rejected the whole August report because the manager control total no longer
matched. The importer then selected the newest older *valid* report — July.

This wrapper preserves all existing mail selection, validation and atomic write
logic, but distinguishes manager rows structurally: a manager row is followed by
a client row; a client row is followed by a payment document.
"""
from __future__ import annotations

import io
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import pandas as pd

import import_payments as base


_old_select_mailbox = base.select_mailbox


def select_mailbox_inbox_first(mail):
    """Use INBOX first; fall back to the previous All Mail logic only if needed."""
    try:
        status, _ = mail.select("INBOX")
        if status == "OK":
            base.log("Ищу отчёт поступлений в INBOX (v23.4.11)")
            return
    except Exception as exc:
        base.log(f"⚠️ INBOX недоступен: {exc}; пробую всю почту")
    return _old_select_mailbox(mail)


def parse_report_v23411(
    payload: bytes,
    managers: list[str],
    client_by_key: dict[str, str],
):
    df = pd.read_excel(io.BytesIO(payload), header=None, dtype=object)
    start, end = base.report_period(df)
    amount_col = base.amount_column(df)

    meaningful = []
    for _, row in df.iterrows():
        text = "" if pd.isna(row.iloc[0]) else str(row.iloc[0]).strip()
        amount = base.as_number(row.iloc[amount_col])
        meaningful.append(bool(text and amount is not None))

    next_is_non_document = [False] * len(df)
    for i in range(len(df)):
        j = i + 1
        while j < len(df) and not meaningful[j]:
            j += 1
        if j < len(df):
            next_text = "" if pd.isna(df.iloc[j, 0]) else str(df.iloc[j, 0]).strip()
            next_is_non_document[i] = base.DOC_RE.match(next_text) is None

    current_manager: str | None = None
    current_client: str | None = None
    expected_total_candidates: dict[str, list[float]] = defaultdict(list)
    raw_docs: list[dict[str, Any]] = []

    for i, row in df.iterrows():
        raw_text = row.iloc[0]
        text = "" if pd.isna(raw_text) else str(raw_text).strip()
        if not text:
            continue
        amount = base.as_number(row.iloc[amount_col])

        matched_manager = base.manager_match(text, managers)
        # Key fix: same-name client rows are followed by a document. A genuine
        # manager row is followed by a non-document client row.
        if matched_manager and amount is not None and next_is_non_document[i]:
            current_manager = matched_manager
            current_client = None
            expected_total_candidates[current_manager].append(float(amount))
            continue

        doc = base.DOC_RE.match(text)
        if doc:
            if current_manager and current_client and amount not in (None, 0):
                stamp = doc.group("date") + " " + (doc.group("time") or "00:00:00")
                document_at = datetime.strptime(stamp, "%d.%m.%Y %H:%M:%S").replace(tzinfo=timezone.utc)
                raw_docs.append({
                    "manager_name": current_manager,
                    "client_name": current_client,
                    "client_id": client_by_key.get(base.normalize_name(current_client)),
                    "document_type": doc.group("doc_type").strip(),
                    "document_number": doc.group("number").strip(),
                    "document_at": document_at.isoformat(),
                    "amount": round(amount, 2),
                })
            continue

        if amount is None:
            continue

        # A non-document row followed by another non-document row is a manager
        # or foreign top-level block. Unknown blocks clear the active manager.
        if next_is_non_document[i]:
            current_manager = None
            current_client = None
            continue

        if current_manager and text.lower() not in {"менеджер", "партнер", "регистратор"}:
            current_client = text

    if not raw_docs:
        raise RuntimeError("В отчёте не найдено поступлений по менеджерам CRM")

    aggregate: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in raw_docs:
        key = (row["manager_name"], row["client_name"], row["document_number"], row["document_at"])
        if key not in aggregate:
            aggregate[key] = dict(row)
        else:
            aggregate[key]["amount"] = round(aggregate[key]["amount"] + row["amount"], 2)

    result = sorted(
        aggregate.values(),
        key=lambda x: (x["manager_name"], x["client_name"], x["document_at"], x["document_number"]),
    )
    parsed_totals: dict[str, float] = defaultdict(float)
    for row in result:
        parsed_totals[row["manager_name"]] += float(row["amount"])

    validation_warnings: list[str] = []
    for manager, candidates in expected_total_candidates.items():
        actual = round(parsed_totals.get(manager, 0.0), 2)
        positive = [round(float(x), 2) for x in candidates if x is not None and float(x) >= 0]
        if not positive or actual <= 0:
            continue
        closest = min(positive, key=lambda x: abs(x - actual))
        delta = abs(closest - actual)
        tolerance = max(0.05, actual * 0.001)
        if delta <= tolerance:
            continue
        ratio = closest / actual if actual else 0.0
        if 0 <= ratio < 0.02:
            validation_warnings.append(
                f"{manager}: число {closest:.2f} в строке менеджера не похоже на итог; "
                f"использована сумма документов {actual:.2f} BYN"
            )
            continue
        raise RuntimeError(
            f"Контроль суммы не пройден: {manager}: ближайший итог отчёта {closest:.2f}, "
            f"разобрано {actual:.2f} BYN"
        )

    outside = []
    for row in result:
        try:
            d = datetime.fromisoformat(str(row["document_at"]).replace("Z", "+00:00")).date()
            if d < start or d > end:
                outside.append(row)
        except Exception:
            outside.append(row)
    if outside and len(outside) > max(3, int(len(result) * 0.05)):
        raise RuntimeError(f"Слишком много документов вне периода отчёта: {len(outside)} из {len(result)}")
    if outside:
        validation_warnings.append(f"Документов вне границ периода: {len(outside)} из {len(result)}")

    return start, end, result, dict(parsed_totals), validation_warnings


base.select_mailbox = select_mailbox_inbox_first
base.parse_report = parse_report_v23411


def main() -> None:
    base.main()


if __name__ == "__main__":
    main()
