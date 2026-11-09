import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
os.environ.setdefault("SUPABASE_URL","https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY","test-only")
import triovist_21vek_search360 as s

def products(start,count):
    return [{"id":str(i),"name":"Товар "+str(i),"url":"/test/product-"+str(i)}
            for i in range(start,start+count)]

class Search360Tests(unittest.TestCase):
    def test_first_text_suggestion_skips_product_cards(self):
        inp={"suggestions":[{"type":"product","query":"single card","productUrl":"/x"},
            {"type":"query","query":"перфораторы"},{"query":"перфоратор makita"}]}
        self.assertEqual(s.parse_first_text_suggestion(inp),("перфораторы","suggestions"))
        self.assertEqual(s.parse_first_text_suggestion({"data":{"querySuggestions":[{"query":"сварочные аппараты"}]}}),
                         ("сварочные аппараты","data.querySuggestions"))

    def test_no_unverified_suggestion_invented(self):
        with patch.dict(os.environ,{"SEARCH360_SUGGEST_URL":""}):
            found=s.resolve_search_phrase(None,"  насос  дренажный ",
                         fetch=lambda _url,_phrase:{'data':[]})
        self.assertEqual(found[0],"насос дренажный")
        self.assertEqual(found[1],"suggestion_missing")
        self.assertIsNone(found[2])
        self.assertIn("21vek.by",found[3])

    def test_21vek_group_order_skips_categories(self):
        payload={'data':[{'group_type':'popular_categories','items':[{'title':'Перфораторы','url':'/category'}]},
                         {'group_type':'popular_requests','items':[{'text':'перфораторы бош'},
                                                                  {'text':'перфораторы макита'}]}]}
        self.assertEqual(s.parse_first_text_suggestion(payload),('перфораторы бош','data.popular_requests'))

    def test_actual_21vek_suggest_reply_chooses_first_text_row(self):
        data={'total':9,'request':'перфоратор','data':[
            {'group_type':'popular_categories','items':[]},
            {'group_type':'popular_requests','items':[]},
            {'group_type':'suggest','items':[{'type':'suggest','name':'перфоратор'}]},
            {'group_type':'completions','items':[{'type':'completion','name':'перфоратор аккумуляторный'}]},
            {'group_type':'products','items':[{'type':'product','name':'Перфоратор Forsage'}]}]}
        self.assertEqual(s.parse_first_text_suggestion(data),('перфоратор','data.suggest'))
        data['data'][2]['items']=[]
        self.assertEqual(s.parse_first_text_suggestion(data),('перфоратор аккумуляторный','data.completions'))

    def test_unsafe_suggestion_endpoint_rejected(self):
        with patch.dict(os.environ,{"SEARCH360_SUGGEST_URL":"https://untrusted.test/redirect"}):
            with self.assertRaises(ValueError):s.trusted_suggest_endpoint()

    def test_deep_rank_reaches_position_125(self):
        visited=[]
        def fetch(_session,query,page,sid):
            visited.append((query,page,sid))
            if page==1:return {"total":129,"searchId":"session1","products":products(1000,60)}
            if page==2:return {"total":129,"searchId":"session1","products":products(1060,60)}
            return {"total":129,"searchId":"session1","products":products(1120,9)}
        req={"id":"123","query_text":"перфоратор","max_depth":600}
        with patch.object(s.top,"top_session",return_value=object()):
            result=s.collect_listing(req,fetch_page=fetch,
                suggestion=("перфораторы","first_text_suggestion","перфораторы","21vek"),sleep=lambda _x:None)
        self.assertEqual(result["status"],"complete")
        self.assertEqual(result["pages_checked"],3)
        self.assertEqual(result["rows"][124]["position"],125)
        self.assertEqual(result["resolved_query"],"перфораторы")
        self.assertEqual(visited,[
            ("перфораторы",1,""),("перфораторы",2,"session1"),("перфораторы",3,"session1")])

    def test_depth_ceiling_and_no_fake_outside_position(self):
        pages=[]
        def fetch(_session,query,page,sid):
            pages.append(page)
            return {"total":1000,"searchId":"sid","products":products(page*1000,60)}
        with patch.object(s.top,"top_session",return_value=object()):
            result=s.collect_listing({"id":"123","query_text":"перфоратор","max_depth":600},
                                     fetch_page=fetch,
                                     suggestion=("перфоратор","suggestion_unavailable",None,None),
                                     sleep=lambda _x:None)
        self.assertEqual(pages,list(range(1,11)))
        self.assertEqual(len(result["rows"]),600)
        self.assertEqual(result["rows"][-1]["position"],600)
        self.assertEqual(result["status"],"complete")
        self.assertGreater(result["search_total"],600)

    def test_failed_second_page_keeps_partial_and_never_invents_further_rank(self):
        def fetch(_ses,_q,page,_sid):
            if page==2:raise RuntimeError("HTTP 429")
            return {"total":200,"searchId":"sid","products":products(1,60)}
        with patch.object(s.top,"top_session",return_value=object()):
            result=s.collect_listing({"id":"123","query_text":"перфоратор","max_depth":600},
                                     fetch_page=fetch,
                                     suggestion=("перфоратор","suggestion_unavailable",None,None),
                                     sleep=lambda _x:None)
        self.assertEqual(result["status"],"partial")
        self.assertEqual(result["pages_checked"],1)
        self.assertEqual(len(result["rows"]),60)
        self.assertIn("429",result["error_text"])

    def test_duplicate_across_pages_invalidates_complete_status(self):
        def fetch(_ses,_q,page,_sid):
            return {"total":120,"searchId":"sid","products":products(1,60)}
        with patch.object(s.top,"top_session",return_value=object()):
            result=s.collect_listing({"id":"123","query_text":"перфоратор","max_depth":600},
                                     fetch_page=fetch,
                                     suggestion=("перфоратор","suggestion_missing",None,None),
                                     sleep=lambda _x:None)
        self.assertEqual(result["status"],"partial")
        self.assertEqual(result["pages_checked"],2)
        self.assertEqual(len(result["rows"]),60)

    def test_card_links_are_only_https_21vek(self):
        self.assertEqual(s.product_url({"url":"javascript:alert(1)"}),None)
        self.assertEqual(s.product_url({"url":"https://evil.com/sku"}),None)
        self.assertEqual(s.product_url({"url":"/product/abc"}),"https://www.21vek.by/product/abc")

    def test_latest_negative_rpc_does_not_equal_latest_review(self):
        sql=Path("supabase/migrations/20261109_triovist_search360_isolated_v1.sql").read_text()
        self.assertIn("dateTimestamp' DESC",sql)
        self.assertIn("last_negative_text",sql)
        self.assertIn("last_negative_answered",sql)
        self.assertIn("triovist_21vek_shadow_raw_current",sql)
        self.assertIn("ENABLE ROW LEVEL SECURITY",sql)
        self.assertNotIn("UPDATE public.triovist_21vek_top_current",sql)

if __name__=="__main__":unittest.main()
