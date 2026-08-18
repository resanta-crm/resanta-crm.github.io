#!/usr/bin/env python3
"""Shared guard for CRM finance imports v23.4.9.

Sets a finite socket timeout before any IMAP module is imported. This prevents a
stuck Gmail connection from hanging a workflow indefinitely. The actual parsing
and safe database replacement remain in the dedicated import modules.
"""
from __future__ import annotations

import os
import socket
import sys

SOCKET_TIMEOUT = max(15, min(180, int(os.environ.get("FINANCE_SOCKET_TIMEOUT_SECONDS", "45"))))
socket.setdefaulttimeout(SOCKET_TIMEOUT)


def main() -> None:
    mode = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
    if mode == "pdz":
        import import_pdz_safe
        import_pdz_safe.main()
        return
    if mode == "payments":
        import import_payments
        import_payments.main()
        return
    raise SystemExit("Usage: finance_import_runner.py pdz|payments")


if __name__ == "__main__":
    main()
