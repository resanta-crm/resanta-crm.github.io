#!/usr/bin/env python3
"""Promote the latest safe 21vek shadow snapshots into working Triovist data.

The database RPC performs all strict coverage checks before changing the current
content imports. After a successful promotion, existing Triovist tasks are
reconciled against the new working snapshots.
"""
import json
import os
import sys

import requests

SUPABASE_URL=os.environ["SUPABASE_URL"].strip().rstrip("/")
SUPABASE_KEY=os.environ["SUPABASE_KEY"].strip()


def rpc(name,payload):
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
    if r.status_code>=300:
        raise RuntimeError(f"RPC {name} {r.status_code}: {r.text[:2000]}")
    return r.json() if r.text else None


def main():
    promoted=rpc("triovist_21vek_promote_shadow_v1",{})
    print("PROMOTE:",json.dumps(promoted,ensure_ascii=False),flush=True)
    if not isinstance(promoted,dict) or not promoted.get("ok"):
        raise RuntimeError("Promotion did not return ok=true")
    if promoted.get("skipped"):
        print("Already promoted; no task reconciliation required.",flush=True)
        return 0

    reconciled=[]
    for row in promoted.get("results") or []:
        import_id=row.get("import_id")
        if not import_id:
            raise RuntimeError("Promotion result has no import_id")
        result=rpc("triovist_tasks_reconcile_import",{"p_import_id":import_id})
        reconciled.append(result)
        print("RECONCILE:",json.dumps(result,ensure_ascii=False),flush=True)

    if len(reconciled)!=2:
        raise RuntimeError(f"Expected two manager reconciliations, got {len(reconciled)}")
    print("✅ Own 21vek data promoted and Triovist tasks reconciled.",flush=True)
    return 0


if __name__=="__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"❌ {exc}",file=sys.stderr,flush=True)
        raise
