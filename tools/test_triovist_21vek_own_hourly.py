"""Offline, no-network tests for isolated own 21vek hourly depth-120 watcher."""
import os
os.environ.setdefault("SUPABASE_URL","https://example.invalid")
os.environ.setdefault("SUPABASE_KEY","fake-test-key")
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
import triovist_21vek_own_hourly_watch as watch

class WatchSafetyTests(unittest.TestCase):
    def target(self,donor,key):
        return {"donor_article":donor,"card_key":key,"manager_email":"aleksandrenko_av@resanta.ru","sku":key,"product_name":key}

    def test_positions_are_exact_one_21_60_61_120_and_outside(self):
        ids=[1001,1021,1060,1061,1120,9999]
        targets=[self.target(i,str(i)) for i in ids]
        calls=[]
        def fake_fetch(session,keyword,page,search_id):
            calls.append((page,search_id))
            return {"products":[{"id":x} for x in range(1001+(page-1)*60,1061+(page-1)*60)],
                    "searchId":"same-search","total":400}
        rows,count=watch.collect("шуруповерт",targets,fetch=fake_fetch,session=object())
        self.assertEqual(count,2)
        self.assertEqual(calls,[(1,""),(2,"same-search")])
        self.assertEqual([row["position"] for row in rows],[1,21,60,61,120,None])
        self.assertTrue(all("run_id" not in r for r in rows))
        self.assertTrue(all(r["observed_price"] is None for r in rows))

    def test_failed_second_page_never_mislabels_61_to_120_as_outside(self):
        def fake_fetch(session,keyword,page,search_id):
            if page==2: raise RuntimeError("21vek search HTTP 429")
            return {"products":[{"id":1}],"searchId":"same","total":150}
        with self.assertRaisesRegex(RuntimeError,"429"):
            watch.collect("тест",[self.target(50,"50")],fetch=fake_fetch,session=object())

    def test_no_page_two_when_all_targets_already_found(self):
        calls=[]
        def fake_fetch(session,keyword,page,search_id):
            calls.append(page)
            return {"products":[{"id":500}],"total":10}
        rows,count=watch.collect("тест",[self.target(500,"500")],fetch=fake_fetch,session=object())
        self.assertEqual(calls,[1])
        self.assertEqual(count,1)
        self.assertEqual(rows[0]["position"],1)

    def test_group_by_keyword_and_rotating_batch(self):
        source=[
            {"keyword":"Пилы","donor_article":"555","manager_email":"a","card_key":"1"},
            {"keyword":"пилы","donor_article":"556","manager_email":"b","card_key":"2"},
            {"keyword":"Насосы","donor_article":"557","manager_email":"b","card_key":"3"},
            {"keyword":"Пусто","donor_article":"not-a-number","manager_email":"b","card_key":"4"}
        ]
        groups=watch.group_targets(source)
        self.assertEqual(len(groups),2)
        self.assertEqual(sorted(len(x[1]) for x in groups),[1,2])
        self.assertEqual(len(watch.batch_for_hour(groups,5,1)),1)
        self.assertEqual(len(watch.batch_for_hour(groups,6,1)),1)

    def test_unverified_price_stock_remain_null(self):
        self.assertIsNone(watch.optional_search_price({}))
        self.assertIsNone(watch.optional_search_stock({}))
        self.assertEqual(watch.optional_search_price({"salePrice":"123.50"}),123.5)
        self.assertIs(watch.optional_search_stock({"inStock":False}),False)

    def test_source_never_writes_live_parser_or_card_tables(self):
        from pathlib import Path
        source=Path(__file__).with_name("triovist_21vek_own_hourly_watch.py").read_text()
        self.assertIn("triovist_own_hourly_observations_v1",source)
        self.assertIn("triovist_own_hourly_runs_v1",source)
        self.assertNotIn('rest_upsert("triovist_21vek_top_current"',source)
        self.assertNotIn('rest_upsert("triovist_content_cards"',source)
        self.assertNotIn("triovist_21vek_promote",source)

if __name__=="__main__":
    unittest.main()
