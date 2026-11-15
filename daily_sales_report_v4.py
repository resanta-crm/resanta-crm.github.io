"""Read-only parser for the separate daily 1C report. Never imports monthly sales."""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

SUBJECT = "CRM — Реализации за день — Витебск"
VERSION = "daily-sales-v4.1"
SKU = re.compile(r"^\d{1,8}(?:/\d{1,8}){1,6}$")
PERIOD = re.compile(r"Период:\s*(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})", re.I)


def number(value):
    if value is None or str(value).strip() == "":
        return Decimal(0)
    try:
        n = Decimal(str(value).replace("\xa0", "").replace(" ", "").replace(",", "."))
    except InvalidOperation as exc:
        raise ValueError("Invalid numeric cell") from exc
    if not n.is_finite():
        raise ValueError("Non-finite numeric cell")
    return n


@dataclass
class Cell:
    value: object
    indent: int = 0


def read_cells(content: bytes):
    if len(content) > 30_000_000:
        raise ValueError("Report exceeds 30 MB")
    if content.startswith(b"PK"):
        import openpyxl
        book = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = book.active
        return [[Cell(c.value, int(c.alignment.indent or 0)) for c in row] for row in sheet]
    if content.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
        import xlrd
        book = xlrd.open_workbook(file_contents=content, formatting_info=True)
        sheet = book.sheet_by_index(0)
        if sheet.nrows > 100000 or sheet.ncols > 300:
            raise ValueError("Unexpected report dimensions")
        return [[Cell(sheet.cell_value(r, c), book.xf_list[sheet.cell(r, c).xf_index].alignment.indent_level)
                 for c in range(sheet.ncols)] for r in range(sheet.nrows)]
    raise ValueError("Expected a real XLS or XLSX attachment")


def parse_cells(grid):
    if not grid or len(grid) > 100000:
        raise ValueError("Empty or oversized workbook")
    texts = [str(c.value or "").strip() for row in grid[:25] for c in row]
    if not any("Валовая прибыль предприятия" in x for x in texts):
        raise ValueError("Unknown 1C report")
    match = next((PERIOD.search(x) for x in texts if PERIOD.search(x)), None)
    if not match:
        raise ValueError("Daily report period is missing")
    start, end = [datetime.strptime(x, "%d.%m.%Y").date() for x in match.groups()]
    if start != end:
        raise ValueError("Daily importer rejects multi-day/monthly reports")
    # This feed must cover the whole branch; per-client/per-manager selections
    # cannot safely replace a complete daily snapshot.
    filters = [x for x in texts if "Подразделение" in x]
    if len(filters) != 1 or '"Витебск"' not in filters[0] or any(
        x in " ".join(texts) for x in ("Менеджер Равно", "Контрагент Равно", "Номенклатура Равно")
    ):
        raise ValueError("Expected unfiltered Vitebsk branch report")
    flat = {x for x in texts}
    if not {"Контрагент", "Номенклатура", "Артикул"}.issubset(flat):
        raise ValueError("Required client/product/SKU headers are missing")
    total_indices = [i for i, row in enumerate(grid) if str(row[0].value or "").strip() == "Итого"]
    if len(total_indices) != 1:
        raise ValueError("A unique grand total is required")
    total_index = total_indices[0]
    pairs = []
    header_index = None
    for i, row in enumerate(grid[:25]):
        for c in range(len(row)-1):
            if str(row[c].value or "").strip() == "Количество" and str(row[c+1].value or "").strip() == "Выручка":
                pairs.append((c, c+1))
                header_index = i
    # An explicit empty report from 1C has no numeric columns at all.
    if not pairs:
        allowed = {"", "Контрагент", "Номенклатура", "Артикул", "Итого"}
        body = grid[next(i for i, row in enumerate(grid) if str(row[0].value or "").strip() == "Контрагент"):]
        if any(str(c.value or "").strip() not in allowed for row in body for c in row):
            raise ValueError("Report has data but no quantity/revenue columns")
        return {"report_day": start.isoformat(), "branch": "Витебск", "rows": [],
                "explicit_empty": True, "total_qty": 0, "total_revenue": 0, "parser": VERSION}
    # The leftmost pair is the branch/company total; subsequent month or manager
    # columns repeat it and must not be added again.
    qty_col, revenue_col = min(pairs)
    def amounts(i):
        row = grid[i]
        return number(row[qty_col].value), number(row[revenue_col].value)
    body = [(i, str(row[0].value or "").strip(), row[0].indent)
            for i, row in enumerate(grid) if i > header_index and i < total_index and str(row[0].value or "").strip()]
    products = {i for i in range(len(body)-1) if not SKU.fullmatch(body[i][1]) and SKU.fullmatch(body[i+1][1])}
    headers = [(i, name, indent) for p, (i, name, indent) in enumerate(body)
               if p not in products and not SKU.fullmatch(name) and any(amounts(i))]
    if not headers and body:
        raise ValueError("Cannot identify client totals")
    client_indent = min((x[2] for x in headers), default=0)
    clients = {}
    rows = []
    client = None
    for p, (i, name, indent) in enumerate(body):
        if p in products:
            if client is None:
                raise ValueError("Product is not linked to a client")
            sku = body[p+1][1]
            q, r = amounts(i)
            sq, sr = amounts(body[p+1][0])
            if (q, r) != (sq, sr):
                raise ValueError("Product and SKU totals disagree")
            if q or r:
                rows.append({"client_name": client, "sku": sku, "product": name,
                             "qty": float(q), "revenue": float(r)})
        elif not SKU.fullmatch(name) and indent == client_indent:
            if name in clients:
                raise ValueError("Repeated client heading")
            client = name
            clients[name] = amounts(i)
    for name, expected in clients.items():
        actual = (sum((number(x["qty"]) for x in rows if x["client_name"] == name), Decimal(0)),
                  sum((number(x["revenue"]) for x in rows if x["client_name"] == name), Decimal(0)))
        if abs(actual[0]-expected[0]) > Decimal("0.0001") or abs(actual[1]-expected[1]) > Decimal("0.02"):
            raise ValueError("SKU detail does not reconcile with client totals")
    total_qty, total_revenue = amounts(total_index)
    if abs(sum((number(x["qty"]) for x in rows), Decimal(0))-total_qty) > Decimal("0.0001") or abs(
        sum((number(x["revenue"]) for x in rows), Decimal(0))-total_revenue) > Decimal("0.02"):
        raise ValueError("SKU detail does not reconcile with report total")
    if not rows and (total_qty or total_revenue or body):
        raise ValueError("Nonempty report has no valid SKU detail")
    return {"report_day": start.isoformat(), "branch": "Витебск", "rows": rows,
            "explicit_empty": not rows, "total_qty": float(total_qty),
            "total_revenue": float(total_revenue), "parser": VERSION}


def parse_report(content):
    return parse_cells(read_cells(content))
