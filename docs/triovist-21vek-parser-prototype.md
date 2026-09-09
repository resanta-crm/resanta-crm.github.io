# Triovist 21vek parser prototype

Isolated prototype branch. It does **not** change Resanta CRM runtime or Supabase.

## Purpose
1. Probe a small set of public 21vek product pages from the current paid-parser reports.
2. Identify stable public structured data before designing production ingestion.
3. Stop on ordinary HTTP/HTML access; no CAPTCHA solving, login bypass, cookie theft, or stealth plugins.

## Safety
- sequential requests only;
- 1 second pause between product pages;
- no writes to 21vek;
- no writes to Supabase;
- no files on `main` until the prototype is validated.
