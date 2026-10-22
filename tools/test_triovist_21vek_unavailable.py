#!/usr/bin/env python3
"""Regression checks: a missing public 21vek page must not invalidate all cards."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
sys.path.insert(0, str(Path(__file__).parent))
import triovist_21vek_shadow_sync as sync


class FakeSession:
    def __init__(self, statuses):
        self.statuses = iter(statuses)
        self.calls = 0

    def get(self, url, timeout, allow_redirects):
        self.calls += 1
        status = next(self.statuses)
        return type("Response", (), {"status_code": status, "text": "html"})()


class UnavailableProductTests(unittest.TestCase):
    def test_confirmed_404_is_terminal(self):
        s = FakeSession([404, 404])
        with patch.object(sync, "wait_rate_slot"), patch.object(sync.time, "sleep"):
            with self.assertRaises(sync.PublicProductUnavailable) as exc:
                sync.fetch_product(s, "https://www.21vek.by/example.html")
        self.assertEqual(exc.exception.status_code, 404)
        self.assertEqual(s.calls, 2)

    def test_single_404_does_not_hide_recovered_page(self):
        s = FakeSession([404, 200])
        with patch.object(sync, "wait_rate_slot"), patch.object(sync.time, "sleep"):
            result = sync.fetch_product(s, "https://www.21vek.by/example.html")
        self.assertEqual(result.status_code, 200)

    def test_http_500_is_still_an_error(self):
        s = FakeSession([500] * 5)
        with patch.object(sync, "wait_rate_slot"), patch.object(sync.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "HTTP 500"):
                sync.fetch_product(s, "https://www.21vek.by/example.html")

    def test_verified_removed_card_is_not_a_live_price(self):
        source = {
            "card_key": "donor:7350059", "sku": "63/6/39",
            "manager_email": "manager@example.com",
            "product_name": "Resanta LUX", "product_url": "https://www.21vek.by/example.html",
            "price": 194, "in_stock": True,
            "description_present": True,
        }
        parsed = sync.unavailable_product(source, 404)
        self.assertTrue(sync.is_unavailable(parsed))
        self.assertIsNone(parsed["card"]["price"])
        self.assertFalse(parsed["card"]["in_stock"])
        self.assertTrue(parsed["card"]["description_present"])
        self.assertFalse(parsed["extra"]["parser_sources"]["price_is_live"])
        row = sync.snapshot_row("run-test", source, parsed)
        self.assertIsNone(row["error_text"])
        self.assertIsNone(row["current_price"])
        self.assertFalse(row["in_stock"])
        self.assertEqual(row["parser_payload"]["parser_sources"]["collection_status"], "unavailable_http_404")


if __name__ == "__main__":
    unittest.main()
