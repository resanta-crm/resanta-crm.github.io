#!/usr/bin/env python3
# RESANTA CRM · robust runner for markdown/discounted goods import
# Fixes fragile mailbox selection/sender filtering without duplicating parser/DB logic.

import email
import imaplib
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

import import_markdown as md


def _select_mailbox(mail):
    """Prefer Gmail All Mail so filters/archive cannot hide 1C reports; fall back to INBOX."""
    candidates = ['"[Gmail]/All Mail"', '"[Google Mail]/All Mail"', 'INBOX']
    for mailbox in candidates:
        try:
            typ, _ = mail.select(mailbox, readonly=True)
            if typ == 'OK':
                md.log(f'IMAP mailbox: {mailbox}')
                return mailbox
        except Exception:
            pass
    raise RuntimeError('Не удалось открыть All Mail или INBOX по IMAP')


def find_latest_robust():
    mail = imaplib.IMAP4_SSL(md.IMAP_HOST, md.IMAP_PORT)
    mail.login(md.IMAP_USER, md.IMAP_PASS)
    _select_mailbox(mail)

    since = (datetime.now(md.MINSK) - timedelta(days=md.LOOKBACK_DAYS)).strftime('%d-%b-%Y')

    # Do not rely on exact FROM: forwarding/aliases can rewrite the sender.
    # Subject + Excel attachment are the stable identifiers for this 1C report.
    typ, data = mail.search(None, 'SINCE', since)
    if typ != 'OK':
        mail.logout()
        raise RuntimeError('IMAP search failed')

    ids = list(reversed(data[0].split()[-400:]))
    matches = []

    for uid in ids:
        typ, hdata = mail.fetch(uid, '(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE FROM)])')
        if typ != 'OK' or not hdata or not isinstance(hdata[0], tuple):
            continue
        hdr = email.message_from_bytes(hdata[0][1])
        subject = md.decoded(hdr.get('Subject'))
        if not md.subject_matches(subject):
            continue
        try:
            sent = parsedate_to_datetime(hdr.get('Date')) if hdr.get('Date') else datetime.now(timezone.utc)
        except Exception:
            sent = datetime.now(timezone.utc)
        if sent.tzinfo is None:
            sent = sent.replace(tzinfo=timezone.utc)
        matches.append((sent, uid, subject))
        if len(matches) >= 30:
            break

    best = None
    for sent, uid, subject in sorted(matches, reverse=True):
        typ, msgdata = mail.fetch(uid, '(RFC822)')
        if typ != 'OK' or not msgdata or not isinstance(msgdata[0], tuple):
            continue
        msg = email.message_from_bytes(msgdata[0][1])
        for part in msg.walk():
            fn = md.decoded(part.get_filename())
            if not fn or not fn.lower().endswith(('.xlsx', '.xls')):
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            candidate = (sent, subject, fn, payload)
            if best is None or sent > best[0]:
                best = candidate
        if best:
            break

    mail.logout()
    return best


if __name__ == '__main__':
    md.find_latest = find_latest_robust
    raise SystemExit(md.main())
