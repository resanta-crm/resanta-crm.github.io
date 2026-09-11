#!/usr/bin/env python3
"""Gate for queued manual 21vek refresh requests.

Uses only stdlib so the workflow can decide whether an expensive parser run is
needed before installing dependencies. Manual CRM requests are claimed through
service-role-only RPC and finalized after the workflow completes.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

SUPABASE_URL=(os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_KEY=(os.environ.get("SUPABASE_KEY") or "").strip()
ACTION=(os.environ.get("REFRESH_GATE_ACTION") or "claim").strip().lower()
GITHUB_OUTPUT=os.environ.get("GITHUB_OUTPUT")


def rpc(name: str, payload: dict) -> dict:
    body=json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        data=body,
        headers={
            "apikey":SUPABASE_KEY,
            "Authorization":f"Bearer {SUPABASE_KEY}",
            "Content-Type":"application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req,timeout=60) as r:
            raw=r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8",errors="replace")
        raise RuntimeError(f"RPC {name} HTTP {e.code}: {raw[:1200]}") from e
    return json.loads(raw) if raw else {}


def write_output(**values):
    if not GITHUB_OUTPUT:
        return
    with open(GITHUB_OUTPUT,"a",encoding="utf-8") as f:
        for k,v in values.items():
            f.write(f"{k}={str(v).lower() if isinstance(v,bool) else v}\n")


def claim():
    event=(os.environ.get("EVENT_NAME") or "").strip()
    schedule=(os.environ.get("EVENT_SCHEDULE") or "").strip()

    result={
        "run":False,"mode":"noop","request_id":"","do_top":False,
        "do_promote":False,"limit":"2500","top_limit":"500","skip_recent":"0"
    }

    if event=="push":
        result.update(run=True,mode="push_test",do_top=True,limit="300",top_limit="12")
    elif event=="workflow_dispatch":
        limit=(os.environ.get("DISPATCH_LIMIT") or "2500").strip() or "2500"
        top=(os.environ.get("DISPATCH_TOP_LIMIT") or "500").strip() or "500"
        result.update(run=True,mode="dispatch_test",do_top=True,limit=limit,top_limit=top)
    elif event=="schedule" and schedule=="17 3 * * *":
        result.update(run=True,mode="daily_main",do_top=True,do_promote=True,limit="2500",top_limit="500")
    elif event=="schedule" and schedule=="17 5 * * *":
        result.update(run=True,mode="daily_backup",do_top=False,do_promote=False,limit="2500",skip_recent="4")
    elif event=="schedule" and schedule=="*/10 * * * *":
        claimed=rpc("triovist_21vek_claim_refresh_v236107",{})
        if claimed.get("claimed"):
            result.update(
                run=True,mode="crm_manual",request_id=str(claimed.get("request_id") or ""),
                do_top=True,do_promote=True,limit="2500",top_limit="500",skip_recent="0"
            )

    write_output(**result)
    print(json.dumps(result,ensure_ascii=False),flush=True)


def finish():
    request_id=(os.environ.get("REQUEST_ID") or "").strip()
    if not request_id:
        return
    ok=(os.environ.get("JOB_STATUS") or "").strip().lower()=="success"
    note=(os.environ.get("FINISH_NOTE") or ("Обновление завершено" if ok else "Ошибка workflow при обновлении 21vek"))[:1800]
    out=rpc("triovist_21vek_finish_refresh_v236107",{
        "p_request_id":request_id,
        "p_ok":ok,
        "p_shadow_run_id":None,
        "p_top_run_id":None,
        "p_note":note,
    })
    print(json.dumps(out,ensure_ascii=False),flush=True)


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL/SUPABASE_KEY are required")
    if ACTION=="claim":
        claim()
    elif ACTION=="finish":
        finish()
    else:
        raise RuntimeError(f"Unknown REFRESH_GATE_ACTION={ACTION}")


if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        print(f"❌ {exc}",file=sys.stderr,flush=True)
        raise
