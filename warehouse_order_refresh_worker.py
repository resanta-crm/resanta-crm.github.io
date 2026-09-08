#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
MINSK = ZoneInfo("Europe/Minsk")
ACTIVE = {"pending", "waiting"}

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}
WRITE_HEADERS = {**HEADERS, "Prefer": "return=representation"}


def api(method, table, *, params=None, payload=None, timeout=60):
    r = requests.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=WRITE_HEADERS if method in {"POST", "PATCH"} else HEADERS,
        params=params,
        json=payload,
        timeout=timeout,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"Supabase {method} {table}: {r.status_code} {r.text[:600]}")
    return r.json() if r.text else None


def first(table, params):
    rows = api("GET", table, params=params) or []
    return rows[0] if rows else {}


def latest_freshness():
    today = datetime.now(MINSK).date().isoformat()
    cost = first("warehouse_cost_import_log", {
        "select": "report_date,source_email_ts",
        "order": "report_date.desc,source_email_ts.desc",
        "limit": "1",
    })
    stock = first("stock_balances", {
        "warehouse": "eq.Витебск",
        "select": "report_date,updated_at",
        "order": "updated_at.desc",
        "limit": "1",
    })
    sales = first("crm_import_status", {
        "source": "eq.sales",
        "select": "report_date,last_success_at,status,source_message_at",
        "limit": "1",
    })
    chekhov = first("triovist_chekhov_stock", {
        "select": "snapshot_date,imported_at",
        "order": "imported_at.desc",
        "limit": "1",
    })

    f = {
        "today": today,
        "cost_date": cost.get("report_date"),
        "cost_loaded_at": cost.get("source_email_ts"),
        "vitebsk_stock_date": stock.get("report_date"),
        "vitebsk_stock_loaded_at": stock.get("updated_at"),
        "sales_date": sales.get("report_date"),
        "sales_loaded_at": sales.get("last_success_at"),
        "sales_status": sales.get("status"),
        "sales_message_at": sales.get("source_message_at"),
        "chekhov_date": chekhov.get("snapshot_date"),
        "chekhov_loaded_at": chekhov.get("imported_at"),
    }
    f["cost_fresh"] = f["cost_date"] == today
    f["vitebsk_stock_fresh"] = f["vitebsk_stock_date"] == today
    f["sales_fresh"] = f["sales_date"] == today and f["sales_status"] == "ok"
    f["auto_sources_fresh"] = bool(
        f["cost_fresh"] and f["vitebsk_stock_fresh"] and f["sales_fresh"]
    )
    return f


def run_script(name):
    started = time.time()
    try:
        p = subprocess.run(
            [sys.executable, name],
            text=True,
            capture_output=True,
            timeout=3300,
            env=os.environ.copy(),
        )
        combined = ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
        return {
            "script": name,
            "ok": p.returncode == 0,
            "returncode": p.returncode,
            "seconds": round(time.time() - started, 1),
            "tail": combined[-1200:],
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "script": name,
            "ok": False,
            "returncode": -1,
            "seconds": round(time.time() - started, 1),
            "tail": f"Timeout: {exc}",
        }
    except Exception as exc:
        return {
            "script": name,
            "ok": False,
            "returncode": -2,
            "seconds": round(time.time() - started, 1),
            "tail": str(exc)[-1200:],
        }


def patch_request(rid, payload):
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    return api("PATCH", "warehouse_order_refresh_requests", params={"id": f"eq.{rid}"}, payload=payload)


def main():
    rows = api("GET", "warehouse_order_refresh_requests", params={
        "status": "in.(pending,waiting)",
        "select": "*",
        "order": "requested_at.asc",
        "limit": "1",
    }) or []
    if not rows:
        print("Нет активной заявки CRM на подготовку автозаказа.")
        return 0

    row = rows[0]
    rid = row["id"]
    attempt = int(row.get("attempt_count") or 0) + 1
    now = datetime.now(timezone.utc).isoformat()

    patch_request(rid, {
        "status": "running",
        "started_at": row.get("started_at") or now,
        "last_attempt_at": now,
        "attempt_count": attempt,
        "message": f"Попытка {attempt}: проверяю почту 1С и обновляю недостающие источники.",
        "last_error": None,
    })

    before = latest_freshness()
    jobs = []
    if not before["cost_fresh"]:
        jobs.append("import_warehouse_cost.py")
    if not before["vitebsk_stock_fresh"]:
        jobs.append("import_stock.py")
    if not before["sales_fresh"]:
        jobs.append("import_sales.py")

    results = {}
    if jobs:
        print("Запускаю:", ", ".join(jobs))
        with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
            future_map = {pool.submit(run_script, job): job for job in jobs}
            for fut in as_completed(future_map):
                res = fut.result()
                results[res["script"]] = res
                print(json.dumps(res, ensure_ascii=False))
    else:
        print("Все автоматические источники уже свежие.")

    time.sleep(2)
    after = latest_freshness()
    ready = after["auto_sources_fresh"]

    missing = []
    if not after["cost_fresh"]:
        missing.append("себестоимость 1С")
    if not after["vitebsk_stock_fresh"]:
        missing.append("остаток Витебск")
    if not after["sales_fresh"]:
        missing.append("продажи")

    failed = [x for x in results.values() if not x.get("ok")]
    error_text = "\n".join(
        f"{x['script']}: {x.get('tail','')[-500:]}" for x in failed
    )[-2500:] or None

    if ready:
        patch_request(rid, {
            "status": "ready",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "message": "Все автоматические источники свежие. Автозаказ можно пересчитать и выгрузить.",
            "ready_freshness": after,
            "worker_results": {"before": before, "after": after, "imports": results},
            "last_error": None,
        })
        print("✅ Данные готовы:", json.dumps(after, ensure_ascii=False))
        return 0

    if attempt >= 12:
        status = "error"
        message = (
            "За 12 проверок свежие данные не появились. "
            "Последнее ожидание: " + ", ".join(missing) + "."
        )
    else:
        status = "waiting"
        message = (
            "Нового свежего отчёта пока нет: "
            + ", ".join(missing)
            + ". Повторю проверку автоматически через несколько минут."
        )

    patch_request(rid, {
        "status": status,
        "message": message,
        "worker_results": {"before": before, "after": after, "imports": results},
        "last_error": error_text,
    })
    print("⏳", message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
