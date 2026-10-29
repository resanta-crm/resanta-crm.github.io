#!/usr/bin/env python3
"""Gate for queued manual 21vek refresh requests and pointer-promotion recovery.

Uses only stdlib so the workflow can decide whether an expensive parser run is
needed before installing dependencies. v23.6.404 adds a parser-free recovery
path: if complete shadow + TOP + manager staging already exist, the 10-minute
check runs only promotion/post-processing instead of collecting 1724 cards again.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime,timezone

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


def rest_get(table: str, params: dict) -> list[dict]:
    query=urllib.parse.urlencode(params)
    request=urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?{query}",
        headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"},
        method="GET")
    with urllib.request.urlopen(request,timeout=35) as response:
        data=json.loads(response.read().decode("utf-8"))
    if not isinstance(data,list):
        raise RuntimeError(f"Invalid recovery response from {table}")
    return data


def recover_failed_top(result: dict, mode: str) -> bool:
    """Lightweight scheduled detection of a failed TOP paired with full cards.

    No DB writes and no staging here. A targeted run reuses only its own
    verified snapshots; repeated failures have bounded cooldown/attempts.
    """
    full=rest_get("triovist_21vek_shadow_runs",{
        "select":"id,started_at,finished_at,total_targets,success_count,error_count,status",
        "status":"eq.complete","order":"started_at.desc","limit":"1"})
    if not full:
        return False
    card=full[0]
    targets=int(card.get("total_targets") or 0)
    if targets<1 or int(card.get("success_count") or -1)!=targets or int(card.get("error_count") or 0)!=0:
        return False
    # A newer card collection, even if it fails, invalidates this TOP pairing.
    next_cards=rest_get("triovist_21vek_shadow_runs",{
        "select":"id","started_at":f"gt.{card['started_at']}","limit":"1"})
    if next_cards:
        return False
    runs=rest_get("triovist_21vek_top_runs",{
        "select":"id,status,parser_version,total_targets,total_keywords,started_at,finished_at,notes",
        "status":"in.(failed,partial)","total_targets":f"eq.{targets}",
        "started_at":f"gte.{card['finished_at']}",
        "order":"started_at.desc","limit":"1"})
    if not runs:
        return False
    run=runs[0]
    if run.get("parser_version")!="top-shadow-v0.7":
        return False
    start=datetime.fromisoformat(str(run["started_at"]).replace("Z","+00:00"))
    age=(datetime.now(timezone.utc)-start).total_seconds()
    if age<0 or age>24*3600:
        return False
    notes=run.get("notes") if isinstance(run.get("notes"),dict) else {}
    attempts=int(notes.get("recovery_attempts") or 0)
    if attempts>=4:
        print(json.dumps({"top_recovery":"exhausted","attempts":attempts,
                          "run_id":run["id"],"latest_complete":False}),flush=True)
        return False
    last=notes.get("last_recovery_at")
    if last:
        since=(datetime.now(timezone.utc)-datetime.fromisoformat(str(last).replace("Z","+00:00"))).total_seconds()
        if since<min(3600,600*(2**max(0,attempts-1))):
            return False
    failed=rest_get("triovist_21vek_top_snapshots",{
        "select":"keyword","run_id":f"eq.{run['id']}",
        "error_text":"not.is.null","limit":"12"})
    if not failed:
        return False
    if len({str(x.get("keyword") or "") for x in failed})>10:
        return False
    result.update(run=True,mode=mode,do_parse=False,do_top=True,do_promote=True,
                  top_resume_run_id=run["id"],limit="2500",top_limit="500",
                  skip_recent="0")
    return True


def apply_recovery(result: dict, mode: str) -> bool:
    recovery=rpc("triovist_21vek_recovery_gate_v236404",{})
    if not recovery.get("recovery_needed"):
        return False

    result.update(
        run=True,
        mode=mode,
        do_parse=False,
        do_top=False,
        do_promote=True,
        limit="2500",
        top_limit="500",
        skip_recent="0",
    )
    return True


def claim():
    event=(os.environ.get("EVENT_NAME") or "").strip()
    schedule=(os.environ.get("EVENT_SCHEDULE") or "").strip()

    result={
        "run":False,
        "mode":"noop",
        "request_id":"",
        "do_parse":False,
        "do_top":False,
        "do_promote":False,
        "limit":"2500",
        "top_limit":"500",
        "skip_recent":"0",
        "top_resume_run_id":"",
    }

    if event=="push":
        claimed=rpc("triovist_21vek_claim_refresh_v236107",{})
        if claimed.get("claimed"):
            result.update(
                run=True,mode="crm_manual_after_push",
                request_id=str(claimed.get("request_id") or ""),
                do_parse=True,do_top=True,do_promote=True,
                limit="2500",top_limit="500",skip_recent="0"
            )
        elif not apply_recovery(result,"promotion_recovery_after_push") and not recover_failed_top(result,"top_keyword_recovery_after_push"):
            # A code push must never create a partial "complete" parser run.
            # If there is nothing to recover, keep this workflow cheap/no-op.
            result.update(
                run=False,mode="push_noop",
                do_parse=False,do_top=False,do_promote=False,
                limit="2500",top_limit="500",skip_recent="0"
            )

    elif event=="workflow_dispatch":
        limit=(os.environ.get("DISPATCH_LIMIT") or "2500").strip() or "2500"
        top=(os.environ.get("DISPATCH_TOP_LIMIT") or "500").strip() or "500"
        result.update(
            run=True,mode="dispatch_test",
            do_parse=True,do_top=True,do_promote=False,
            limit=limit,top_limit=top,skip_recent="0"
        )

    elif event=="schedule" and schedule=="17 3 * * *":
        result.update(
            run=True,mode="daily_main",
            do_parse=True,do_top=True,do_promote=True,
            limit="2500",top_limit="500",skip_recent="0"
        )

    elif event=="schedule" and schedule=="17 5 * * *":
        result.update(
            run=True,mode="daily_backup",
            do_parse=True,do_top=False,do_promote=False,
            limit="2500",top_limit="500",skip_recent="4"
        )

    elif event=="schedule" and schedule=="*/10 * * * *":
        claimed=rpc("triovist_21vek_claim_refresh_v236107",{})
        if claimed.get("claimed"):
            result.update(
                run=True,mode="crm_manual",
                request_id=str(claimed.get("request_id") or ""),
                do_parse=True,do_top=True,do_promote=True,
                limit="2500",top_limit="500",skip_recent="0"
            )
        else:
            if not apply_recovery(result,"promotion_recovery"):
                recover_failed_top(result,"top_keyword_recovery")

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
