import test from 'node:test';
import assert from 'node:assert/strict';
test('sanity',()=>assert.equal(2+2,4));

import {chooseClientMatch} from '../supabase/functions/crm-ai360-dialog-v4/client-universal.mjs';
test('finds client name in full question',()=>{
 const list=[{id:'first',name:'Альфа',manager_name:'Тестовый'}];
 assert.equal(chooseClientMatch('Что у Альфы?',list).id,'first');
});

test('customer followup uses verified context',()=>{
 const data=[{id:'first',name:'Альфа',manager_name:'Тестовый'}];
 const x=chooseClientMatch('А какие артикулы?',data,{memoryClient:'Альфа'});
 assert.equal(x.id,'first');
});
test('unknown customer is not assigned automatically',()=>{
 const data=[{id:'first',name:'Альфа',manager_name:'Тестовый'}];
 assert.ok(chooseClientMatch('Что у Неизвестной компании?',data).error);
});
