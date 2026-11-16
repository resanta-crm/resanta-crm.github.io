import test from 'node:test';import assert from 'node:assert/strict';
import {compactTaskFacts,taskModelInput} from '../supabase/functions/crm-tasks-assistant-v4/model-context.mjs';
import {purchaseAnalysis} from '../supabase/functions/crm-tasks-assistant-v4/assortment.mjs';
test('all months, ABC, prior season and returns survive compaction without source mutation',()=>{
 const rows=[{sku:'a',product:'Шуруповёрт',month:'2025-10-01',qty:5,revenue:100},{sku:'a',product:'Шуруповёрт',month:'2025-10-01',qty:-1,revenue:-20},{sku:'a',product:'Шуруповёрт',month:'2026-10-01',qty:2,revenue:50},{sku:'b',product:'Конвектор',month:'2024-01-01',qty:3,revenue:80}];
 const analysis=purchaseAnalysis(rows,'2026-11-17');const f={purchase_history:rows,purchase_analysis:analysis,candidates:[{sku:'a',available:7,purchase_evidence:analysis.items[0]}],shelf:[{sku:'a',qty:1}]};
 const before=JSON.stringify(f),c=compactTaskFacts(f);assert.equal(JSON.stringify(f),before);
 assert.deepEqual(c.purchase_history.rows,[['a','2025-10',4,80],['a','2026-10',2,50],['b','2024-01',3,80]]);
 assert.deepEqual(c.purchase_analysis.items[0].previous_autumn,analysis.items[0].previous_autumn);
 assert.equal(c.purchase_analysis.items[0].abc,analysis.items[0].abc);assert.deepEqual(c.shelf,f.shelf);
 assert.equal(c.candidates[0].available,7);assert.equal(c.candidates[0].purchase_evidence,undefined);
});
test('repeated history shrinks substantially without dropping any SKU/month',()=>{
 const rows=Array.from({length:1000},(_,i)=>({id:'transaction-'+i,sku:'75/6/'+i%20,product:'Шуруповёрт аккумуляторный Ресанта',category:'Инструмент',subgroup:'Шуруповёрты',month:'2026-10-01',qty:1,revenue:100}));
 const a=purchaseAnalysis(rows,'2026-11-17'),f={purchase_history:rows,purchase_analysis:a,candidates:a.items.map(x=>({sku:x.sku,purchase_evidence:x}))};
 const old=JSON.stringify(f).length,after=taskModelInput(f).length;
 assert(after<old*.2);assert.equal(compactTaskFacts(f).purchase_history.rows.reduce((n,x)=>n+x[2],0),1000);
 console.log(JSON.stringify({fixture_chars_before:old,fixture_chars_after:after}));
});
test('oversized context fails before transport, non-purchase actions remain unchanged',()=>{
 assert.throws(()=>taskModelInput({request:'a'.repeat(90001)}),/TASK_CONTEXT_TOO_LARGE/);
 const f={request:'Запиши результат',client:{id:'c'}};assert.equal(compactTaskFacts(f),f);
});
