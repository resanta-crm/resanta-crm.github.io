from pathlib import Path

p=Path('tools/triovist_21vek_shadow_sync.py')
s=p.read_text(encoding='utf-8')
s=s.replace('DELAY=max(0.05,float(os.environ.get("SHADOW_DELAY_SECONDS","0.14")))\nWORKERS=max(1,min(24,int(os.environ.get("SHADOW_WORKERS","14"))))', 'DELAY=max(0.10,float(os.environ.get("SHADOW_DELAY_SECONDS","0.35")))\nWORKERS=max(1,min(16,int(os.environ.get("SHADOW_WORKERS","8"))))')
s=s.replace('PARSER_VERSION="shadow-v0.7"\nUA="ResantaCRM-21vekShadow/0.7 (+https://resanta-crm.by)"', 'PARSER_VERSION="shadow-v0.8"\nUA="ResantaCRM-21vekShadow/0.8 (+https://resanta-crm.by)"')
s=s.replace('_next_request_at=0.0\n', '_next_request_at=0.0\n_blocked_until=0.0\n', 1)
old='''def wait_rate_slot() -> None:\n    global _next_request_at\n    with _rate_lock:\n        now=time.monotonic()\n        slot=max(now,_next_request_at)\n        _next_request_at=slot+DELAY\n    wait=slot-now\n    if wait>0:\n        time.sleep(wait)\n\n\ndef fetch_product(session: requests.Session, url: str) -> requests.Response:\n'''
new='''def wait_rate_slot() -> None:\n    global _next_request_at\n    with _rate_lock:\n        now=time.monotonic()\n        slot=max(now,_next_request_at,_blocked_until)\n        _next_request_at=slot+DELAY\n    wait=slot-now\n    if wait>0:\n        time.sleep(wait)\n\n\ndef apply_rate_limit_cooldown(response: requests.Response) -> None:\n    \"\"\"Respect 21vek throttling globally so parallel workers do not avalanche 429s.\"\"\"\n    global _blocked_until,_next_request_at\n    retry_after=response.headers.get(\"Retry-After\")\n    try:\n        seconds=float(retry_after) if retry_after else 5.0\n    except Exception:\n        seconds=5.0\n    seconds=max(3.0,min(30.0,seconds))\n    with _rate_lock:\n        until=time.monotonic()+seconds\n        _blocked_until=max(_blocked_until,until)\n        _next_request_at=max(_next_request_at,_blocked_until)\n\n\ndef fetch_product(session: requests.Session, url: str) -> requests.Response:\n'''
if old not in s:
    raise SystemExit('rate block not found')
s=s.replace(old,new,1)
old='''            error=RuntimeError(f"HTTP {response.status_code}")\n            if response.status_code<500 and response.status_code not in (408,425,429):\n                raise error\n            last_error=error\n'''
new='''            error=RuntimeError(f"HTTP {response.status_code}")\n            if response.status_code==429:\n                apply_rate_limit_cooldown(response)\n            if response.status_code<500 and response.status_code not in (408,425,429):\n                raise error\n            last_error=error\n'''
if old not in s:
    raise SystemExit('response retry block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
