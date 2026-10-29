import test from 'node:test';
import assert from 'node:assert/strict';
test('sanity',()=>assert.equal(2+2,4));

import {chooseClientMatch} from '../supabase/functions/crm-ai360-dialog-v4/client-universal.mjs';
test('finds client name in full question',()=>{
 const list=[{id:'first',name:'Альфа',manager_name:'Тестовый'}];
 assert.equal(chooseClientMatch('Что у Альфы?',list).id,'first');
});
