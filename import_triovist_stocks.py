#!/usr/bin/env python3
"""Ручная загрузка остатков 21vek и Чехова из Excel в защищённые таблицы Supabase."""
from __future__ import annotations

import hashlib
import os
import re
import sys
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

import openpyxl
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"].strip()
ARTICLE_RE = re.compile(r"\d+(?:/\d+){1,6}")


def log(message):
    print(message, flush=True)


def dec(value):
    if value in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(value).replace("\xa0", "").replace(" ", "").replace(",", "."))
    except InvalidOperation as exc:
        raise RuntimeError(f"Некорректное число: {value!r}") from exc


def n3(value):
    return format(dec(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP), "f")


def norm(value):
    return re.sub(r"[^a-zа-я0-9]+", "", str(value or "").lower().replace("ё", "е"))


def extract_internal_sku(product):
    matches = ARTICLE_RE.findall(str(product or ""))
    if matches:
        return matches[-1]
    key = norm(product)
    mappings = {
        "асн3000н1с": "63/6/21", "асн3000н1ц": "63/6/21", "asn3000n1c": "63/6/21",
        "clm36li": "70/4/10", "elm1800t": "70/4/5", "dt9208a": "61/10/507",
    }
    for marker, sku in mappings.items():
        if marker in key:
            return sku
    return ""


def parse_partner(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.active
    iterator = ws.iter_rows(values_only=True)
    headers = [str(v or "").strip() for v in next(iterator)]
    index = {norm(name): i for i, name in enumerate(headers)}
    def col(label):
        key = norm(label)
        for h, c in index.items():
            if h == key or h.startswith(key):
                return c
        raise RuntimeError(f"В остатках 21vek нет колонки «{label}»")
    c_partner, c_kind, c_brand, c_product = col("Артикул"), col("Вид"), col("Производитель"), col("Номенклатура")
    sales_cols = [i for i, name in enumerate(headers) if norm(name).startswith("продажиза")]
    if len(sales_cols) < 3:
        raise RuntimeError(f"В остатках 21vek найдено только {len(sales_cols)} колонок продаж; нужно 3 месяца")
    c_m1, c_m2, c_m3 = sales_cols[-3:]
    c_total, c_free, c_transit, c_orders = col("Всего"), col("Свободно"), col("Свободно в пути и резерве"), col("Заказы")
    rows, unmatched = [], []
    for values in iterator:
        product = str(values[c_product] or "").strip()
        if not product:
            continue
        sku = extract_internal_sku(product)
        if not sku:
            unmatched.append(product)
            continue
        partner_sku = str(values[c_partner] or "").strip()
        kind = str(values[c_kind] or "").strip()
        excluded = "+" in product or "комплект" in norm(kind + " " + product) or "невыводить" in norm(product)
        row_key = hashlib.md5(f"{partner_sku}|{sku}|{product}".encode("utf-8")).hexdigest()
        rows.append({
            "row_key": row_key, "partner_sku": partner_sku, "sku": sku,
            "kind": kind, "brand": str(values[c_brand] or "").strip(), "product": product,
            "sales_m1": n3(values[c_m1]), "sales_m2": n3(values[c_m2]), "sales_m3": n3(values[c_m3]),
            "sales_m1_label": headers[c_m1].replace("Продажи за", "").strip(),
            "sales_m2_label": headers[c_m2].replace("Продажи за", "").strip(),
            "sales_m3_label": headers[c_m3].replace("Продажи за", "").strip(),
            "qty_total": n3(values[c_total]), "qty_free": n3(values[c_free]),
            "qty_transit_reserve": n3(values[c_transit]), "qty_orders": n3(values[c_orders]),
            "excluded": excluded, "match_note": "Исключено из рекомендации: комплект" if excluded else None,
        })
    if unmatched:
        raise RuntimeError("Не сопоставлены артикулы 21vek: " + "; ".join(unmatched[:10]))
    if len(rows) < 100:
        raise RuntimeError(f"Слишком мало строк 21vek: {len(rows)}")
    return rows


def parse_chekhov(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.active
    all_rows = ws.iter_rows(values_only=True)
    headers = None
    data_rows = []
    for idx, values in enumerate(all_rows, start=1):
        vals = list(values)
        if headers is None:
            normalized = [norm(v) for v in vals]
            if "номенклатура" in normalized and "артикул" in normalized:
                headers = [str(v or "").strip() for v in vals]
            continue
        data_rows.append(vals)
    if headers is None:
        raise RuntimeError("В остатках Чехова не найдена шапка")
    def find_col(label):
        key = norm(label)
        for i, value in enumerate(headers):
            if norm(value) == key or norm(value).startswith(key):
                return i
        raise RuntimeError(f"В остатках Чехова нет колонки «{label}»")
    c_product, c_sku, c_box = find_col("Номенклатура"), find_col("Артикул"), find_col("Количество в коробке")
    c_stock, c_near, c_total = find_col("Остаток"), find_col("Остаток рядом"), find_col("Сумма")
    rows, seen = [], set()
    for values in data_rows:
        sku = str(values[c_sku] or "").strip().lstrip("'")
        if not re.fullmatch(r"\d+(?:/\d+){1,6}", sku):
            continue
        if sku in seen:
            raise RuntimeError(f"Дубль артикула Чехова: {sku}")
        seen.add(sku)
        product = str(values[c_product] or "").strip()
        rows.append({
            "sku": sku, "product": product, "box_qty": n3(values[c_box]),
            "qty_stock": n3(values[c_stock]), "qty_nearby": n3(values[c_near]),
            "qty_total": n3(values[c_total]),
        })
    if len(rows) < 100:
        raise RuntimeError(f"Слишком мало строк Чехова: {len(rows)}")
    return rows


def replace(source, rows, filename):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/triovist_replace_stock_snapshot",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
        json={"p_source": source, "p_rows": rows, "p_source_file": filename, "p_snapshot_date": date.today().isoformat()},
        timeout=300,
    )
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase отклонил {source}: {response.status_code} {response.text}")
    return response.json() if response.text.strip() else {"ok": True}


def main():
    partner = Path(sys.argv[1] if len(sys.argv) > 1 else "data/stock_21vek.xlsx")
    chekhov = Path(sys.argv[2] if len(sys.argv) > 2 else "data/stock_chekhov.xlsx")
    if not partner.exists() or not chekhov.exists():
        raise RuntimeError(f"Не найдены файлы: {partner}, {chekhov}")
    partner_rows = parse_partner(partner)
    chekhov_rows = parse_chekhov(chekhov)
    log(f"21vek: {len(partner_rows)} строк, исключено комплектов: {sum(1 for r in partner_rows if r['excluded'])}")
    log(f"Чехов: {len(chekhov_rows)} уникальных артикулов")
    log(f"21vek RPC: {replace('partner', partner_rows, partner.name)}")
    log(f"Чехов RPC: {replace('chekhov', chekhov_rows, chekhov.name)}")
    log("✅ Остатки 21vek и Чехова загружены")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"ОШИБКА: {exc}")
        sys.exit(1)
