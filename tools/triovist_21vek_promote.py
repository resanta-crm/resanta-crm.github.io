#!/usr/bin/env python3
"""Safely promote the latest complete own 21vek snapshots into working Triovist.

v23.6.403:
- validate one complete card run + one complete TOP run;
- stage each manager independently without touching current working data;
- atomically switch both managers only after both stages are complete;
- rebuild content issues and reconcile existing AI tasks after activation;
- retry transient PostgREST/statement-timeout failures without losing the staged data.
"""
import json
import os
import sys
import time

import requests

SUPABASE_URL=os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY=os.environ["SUPABASE_KEY"].strip()


def retryable(message: str) -> bool:
    s=str(message or "").lower()
    return any(x in s for x in (
        "57014","statement timeout","timed out","timeout",
        "502","503","504","connection reset","connection refused"
    ))


def rpc(name,payload,attempts=3):
    last=None
    for attempt in range(1,attempts+1):
        try:
            r=requests.post(
                f"{SUPABASE_URL}/rest/v1/rpc/{name}",
                headers={
                    "apikey":SUPABASE_KEY,
                    "Authorization":f"Bearer {SUPABASE_KEY}",
                    "Content-Type":"application/json",
                },
                json=payload,
                timeout=180,
            )
            if r.status_code<300:
                return r.json() if r.text else None
            last=RuntimeError(f"RPC {name} {r.status_code}: {r.text[:2000]}")
            if not retryable(str(last)) or attempt>=attempts:
                raise last
        except (requests.Timeout,requests.ConnectionError) as exc:
            last=exc
            if attempt>=attempts:
                raise
        time.sleep(float(attempt))
    raise last or RuntimeError(f"RPC {name} failed")


def main():
    plan=rpc("triovist_21vek_promotion_plan_v236403",{})
    if not isinstance(plan,dict) or not plan.get("ok"):
        raise RuntimeError("Promotion plan did not return ok=true")

    run_id=plan.get("run_id")
    top_run_id=plan.get("top_run_id")
    source_file=plan.get("source_file")
    managers=plan.get("managers") or []
    if not run_id or not top_run_id or len(managers)!=2:
        raise RuntimeError(f"Unsafe promotion plan: run={run_id} top={top_run_id} managers={len(managers)}")

    print("PLAN:",json.dumps(plan,ensure_ascii=False),flush=True)

    staged=[]
    if not plan.get("already_promoted"):
        for manager in managers:
            email=manager.get("manager_email")
            if not email:
                raise RuntimeError("Promotion plan contains manager without email")
            row=rpc("triovist_21vek_stage_shadow_v236403",{
                "p_run_id":run_id,
                "p_top_run_id":top_run_id,
                "p_manager_email":email,
            })
            if not isinstance(row,dict) or not row.get("ok") or not row.get("import_id"):
                raise RuntimeError(f"Staging failed for {email}: {row}")
            staged.append(row)
            print("STAGE:",json.dumps(row,ensure_ascii=False),flush=True)
    else:
        print("Latest complete snapshot is already current; validating post-activation steps.",flush=True)

    activated=rpc("triovist_21vek_activate_shadow_v236403",{
        "p_run_id":run_id,
        "p_top_run_id":top_run_id,
    })
    if not isinstance(activated,dict) or not activated.get("ok"):
        raise RuntimeError(f"Activation failed: {activated}")
    rows=activated.get("results") or []
    if len(rows)!=2:
        raise RuntimeError(f"Expected two activated manager imports, got {len(rows)}")
    print("ACTIVATE:",json.dumps(activated,ensure_ascii=False),flush=True)

    post=[]
    for row in rows:
        import_id=row.get("import_id")
        if not import_id:
            raise RuntimeError("Activated row has no import_id")

        issues=rpc("triovist_21vek_rebuild_issues_v236403",{"p_import_id":import_id})
        print("ISSUES:",json.dumps(issues,ensure_ascii=False),flush=True)

        reconciled=rpc("triovist_tasks_reconcile_import",{"p_import_id":import_id})
        print("RECONCILE:",json.dumps(reconciled,ensure_ascii=False),flush=True)
        post.append({"import_id":import_id,"issues":issues,"reconcile":reconciled})

    print("✅ Own 21vek safe promotion complete:",json.dumps({
        "source_file":source_file,
        "run_id":run_id,
        "top_run_id":top_run_id,
        "staged":len(staged),
        "activated":len(rows),
        "post_checks":len(post),
    },ensure_ascii=False),flush=True)
    return 0


if __name__=="__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"❌ {exc}",file=sys.stderr,flush=True)
        raise
