import test from 'node:test';import assert from 'node:assert/strict';
import {validateShelfDraft,objectionReply} from '../supabase/functions/crm-tasks-assistant-v4/domain.mjs';
test('shelf/reserve distinct, zero preserved, unknown reserve stays null',()=>{assert.deepEqual(validateShelfDraft({items:[{sku:'75/6/1',shelf_qty:0}]}),[{sku:'75/6/1',shelf_qty:0,reserve_qty:null}]);});
test('repeated SKU needs clarification',()=>assert.throws(()=>validateShelfDraft({items:[{sku:'75/6/1',shelf_qty:1},{sku:'75/6/1',shelf_qty:2}]}),/duplicate/));
test('unknown quantities never become zero',()=>{for(const q of [undefined,null,'2',NaN,Infinity,-1])assert.throws(()=>validateShelfDraft({items:[{sku:'75/6/1',shelf_qty:q}]}));});
test('incomplete sku is rejected',()=>assert.throws(()=>validateShelfDraft({items:[{sku:'75',shelf_qty:2}]}),/sku/));
test('empty extraction cannot save',()=>assert.throws(()=>validateShelfDraft({items:[]})));
test('objection advice never promises unapproved discount',()=>assert.match(objectionReply('дорого'),/без согласования/));
