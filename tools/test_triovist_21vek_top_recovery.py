#!/usr/bin/env python3
"""Regression: temporary 21vek HTTP 424 and only-failed-keyword TOP recovery.

Runs fully offline with fake PostgREST, never executes any database update.
"""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
os.environ.setdefault('SUPABASE_URL','https://offline.invalid')
os.environ.setdefault('SUPABASE_KEY','test-only')
sys.path.insert(0,str(Path(__file__).parent))
import triovist_21vek_top_shadow as top
import triovist_21vek_refresh_gate as gate

class Response:
    def __init__(self,status,payload=None):
        self.status_code=status
        self.headers={}
        self.text='{"message":"ML request error"}'
        self.payload=payload
    def json(self):
        return self.payload or {'products':[], 'total':0}

class Session:
    def __init__(self,responses):
        self.responses=iter(responses);self.calls=0
    def post(self,*args,**kwargs):
        self.calls+=1
        return next(self.responses)

class SearchRetryTests(unittest.TestCase):
    def test_transient_424_is_retried_without_false_empty_ranking(self):
        s=Session([Response(424),Response(200,{'products':[{'id':33}],'total':1})])
        with patch.object(top,'wait_delay'),patch.object(top.time,'sleep'):
            out=top.search_page(s,'Поршневая группа',1,'')
        self.assertEqual(len(out['products']),1)
        self.assertEqual(s.calls,2)
    def test_permanent_424_fails_closed_after_bounded_attempts(self):
        s=Session([Response(424)]*5)
        with patch.object(top,'wait_delay'),patch.object(top.time,'sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError,'HTTP 424'):
                top.search_page(s,'Поршневая группа',1,'')
        self.assertEqual(s.calls,5)
        self.assertLessEqual(sleep.call_count,4)
    def test_http_400_not_retried(self):
        s=Session([Response(400)])
        with patch.object(top,'wait_delay'),patch.object(top.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'HTTP 400'):
                top.search_page(s,'несуществующая категория',1,'')
        self.assertEqual(s.calls,1)

def targets():
    return [
      {'manager_email':'a@example.com','card_key':'a','sku':'1','donor_article':'10','keyword':'Поршневая группа'},
      {'manager_email':'b@example.com','card_key':'b','sku':'2','donor_article':'20','keyword':'Сварочный инвертор'}
    ]

class ResumeTests(unittest.TestCase):
    def setUp(self):
        self.rows=[
          {'id':1,'run_id':'11111111-1111-4111-8111-111111111111',
           'manager_email':'a@example.com','card_key':'a','keyword':'Поршневая группа',
           'position_exact':False,'top30':None,'top60':None,'error_text':'HTTP 424'},
          {'id':2,'run_id':'11111111-1111-4111-8111-111111111111',
           'manager_email':'b@example.com','card_key':'b','keyword':'Сварочный инвертор',
           'position_exact':True,'top30':True,'top60':True,'error_text':None}
        ]
        self.run={'id':'11111111-1111-4111-8111-111111111111',
                  'status':'failed','parser_version':'top-shadow-v0.7',
                  'total_targets':2,'total_keywords':2,'requests_count':1,'notes':{},
                  'started_at':'2026-10-29T10:10:00+00:00'}
        self.shadow={'id':'card-run','status':'complete','started_at':'2026-10-29T09:58:00+00:00',
                     'finished_at':'2026-10-29T10:08:00+00:00','total_targets':2,
                     'success_count':2,'error_count':0}
        self.patches=[];self.upserts=[]
    def fake_get(self,table,query,**kw):
        if table=='triovist_21vek_top_runs':return [self.run]
        if table=='triovist_21vek_shadow_runs':
            return [self.shadow] if 'status' in query else []
        raise AssertionError(table)
    def fake_all(self,table,query,**kw):
        if table!='triovist_21vek_top_snapshots':raise AssertionError(table)
        if query.get('select')=='*':return self.rows
        return [{k:v for k,v in x.items() if k in ('manager_email','card_key','keyword','error_text')} for x in self.rows]
    def fake_patch(self,table,filter,values,**kwargs):
        self.patches.append(dict(values))
        if 'status' in values:self.run['status']=values['status']
        if 'notes' in values:self.run['notes']=values['notes']
    def fake_upsert(self,table,rows,conflict,**kw):
        self.upserts.append((table,rows,conflict))
        if table=='triovist_21vek_top_snapshots':
            self.assertEqual(len(rows),1)
            self.assertEqual(rows[0]['card_key'],'a')
            self.rows[0].update(rows[0])
    def fake_collect(self,run_id,keyword,items):
        self.assertEqual(keyword,'Поршневая группа')
        self.assertEqual(len(items),1)
        return {'keyword':keyword,'targets':1,'request_count':1,
            'keyword_error':None,'snapshots':[{
             'run_id':run_id,'manager_email':'a@example.com','card_key':'a',
             'keyword':keyword,'position_exact':True,'top30':True,'top60':True,
             'error_text':None,'position':1}]}
    def run_resume(self):
        groups=[('Поршневая группа',[targets()[0]]),('Сварочный инвертор',[targets()[1]])]
        with patch.object(top,'rest_get',side_effect=self.fake_get),\
             patch.object(top,'rest_get_all',side_effect=self.fake_all),\
             patch.object(top,'rest_patch',side_effect=self.fake_patch),\
             patch.object(top,'rest_upsert',side_effect=self.fake_upsert),\
             patch.object(top,'collect_keyword',side_effect=self.fake_collect):
             top.resume_failed_run(self.run['id'],targets(),groups)
    def test_only_failed_keyword_retried_and_all_cards_verified(self):
        self.run_resume()
        self.assertEqual(self.run['status'],'complete')
        self.assertEqual(self.run['notes']['recovery_attempts'],1)
        self.assertEqual(self.run['notes']['recovered_keywords'],1)
        self.assertEqual(self.upserts[0][0],'triovist_21vek_top_snapshots')
        self.assertEqual(self.upserts[0][2],'run_id,manager_email,card_key')
        self.assertEqual(self.upserts[-1][0],'triovist_21vek_top_current')
        self.assertEqual(len(self.upserts[-1][1]),2)
        self.assertNotIn('id',self.upserts[-1][1][0])
        self.assertEqual(self.patches[-1]['error_count'],0)
    def test_keyword_change_fails_before_any_writes(self):
        changed=targets()
        changed[0]['keyword']='чужая категория'
        groups=[('чужая категория',[changed[0]]),('Сварочный инвертор',[changed[1]])]
        with patch.object(top,'rest_get',side_effect=self.fake_get),\
             patch.object(top,'rest_get_all',side_effect=self.fake_all),\
             patch.object(top,'rest_patch',side_effect=self.fake_patch):
            with self.assertRaisesRegex(RuntimeError,'failed keyword no longer matches|keyword changed'):
                top.resume_failed_run(self.run['id'],changed,groups)
        self.assertEqual(self.patches,[])
    def test_four_attempts_cannot_loop_forever(self):
        self.run['notes']={'recovery_attempts':4}
        with patch.object(top,'rest_get',side_effect=self.fake_get):
            with self.assertRaisesRegex(RuntimeError,'limit reached'):
                top.resume_failed_run(self.run['id'],targets(),[('Поршневая группа',[targets()[0]]),('Сварочный инвертор',[targets()[1]])])

class GateTests(unittest.TestCase):
    def test_failed_top_is_detected_after_missing_paired_complete_run(self):
        now=datetime.now(timezone.utc)
        d=lambda t:(now-timedelta(minutes=t)).isoformat()
        card={'id':'full','status':'complete','started_at':d(25),'finished_at':d(20),
              'total_targets':2,'success_count':2,'error_count':0}
        run={'id':'11111111-1111-4111-8111-111111111111','status':'failed',
             'parser_version':'top-shadow-v0.7','total_targets':2,
             'total_keywords':2,'started_at':d(18),'finished_at':d(16),
             'notes':{'fatal_error':'TOP shadow completeness check failed'}}
        def fake(table,params):
            if table=='triovist_21vek_shadow_runs':
                return [card] if 'status' in params else []
            if table=='triovist_21vek_top_runs':return [run]
            if table=='triovist_21vek_top_snapshots':return [{'keyword':'Поршневая группа'}]
            raise AssertionError(table)
        out={'run':False}
        with patch.object(gate,'rest_get',side_effect=fake):
            self.assertTrue(gate.recover_failed_top(out,'top_keyword_recovery'))
        self.assertTrue(out['run']);self.assertFalse(out['do_parse'])
        self.assertTrue(out['do_top']);self.assertTrue(out['do_promote'])
        self.assertEqual(out['top_resume_run_id'],run['id'])
    def test_exhausted_recovery_not_restarted(self):
        now=datetime.now(timezone.utc).isoformat()
        card={'id':'full','started_at':now,'finished_at':now,'total_targets':2,'success_count':2,'error_count':0}
        run={'id':'test','status':'failed','parser_version':'top-shadow-v0.7',
             'total_targets':2,'total_keywords':2,'started_at':now,
             'notes':{'recovery_attempts':4}}
        def fake(table,params):
            if table=='triovist_21vek_shadow_runs':
                return [card] if 'status' in params else []
            if table=='triovist_21vek_top_runs':return [run]
            raise AssertionError(table)
        with patch.object(gate,'rest_get',side_effect=fake):
            self.assertFalse(gate.recover_failed_top({},'recovery'))

if __name__=='__main__':
    unittest.main()
