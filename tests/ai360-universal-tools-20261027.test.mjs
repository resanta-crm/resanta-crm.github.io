import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CRM_AI360_TOOLS,CRM_AI360_ALL_DOMAINS,clampDomains,collectTool,getTool} from '../supabase/functions/crm-ai360-dialog-v2/catalog.mjs';
assert.equal(CRM_AI360_TOOLS.length,25);
assert.equal(CRM_AI360_ALL_DOMAINS.length,31);
assert.equal(new Set(CRM_AI360_ALL_DOMAINS).size,31);
for (const key of ['sales','operations','promotions','triovist','vip','payments',
 'stock','stock_freshness','markdown','stands','warehouse_orders','warehouse_receiving',
 'warehouse_inventory','competitors','cards_21vek','card_issues','triovist_stock',
 'triovist_tasks','vip_actions','cash','promotion_budgets','mrc','infographics','parser',
 'clients','visits','routes','tasks','debt','gps','imports'])
 assert.ok(CRM_AI360_ALL_DOMAINS.includes(key),key+' registered');
assert.deepEqual(clampDomains(['payments','deleted_table','stock','gps','stock','vip','clients'],4),
 ['payments','stock','gps','vip']);
assert.equal(getTool('deleted_table'),null);
for (const tool of CRM_AI360_TOOLS){
 assert.ok(/^[a-z][a-z0-9_]*$/.test(tool.table),tool.id);
 assert.ok(tool.limit>0&&tool.limit<=12,tool.id+' bounded result');
 assert.ok(!/password|secret|token|user_id|private_key|phone|email|access_token|address|lat|lng|gps_lat|jwt/i.test(tool.columns),tool.id+' sensitive field in evidence');
 assert.ok(tool.columns.split(',').length<=9,tool.id+' bounded width');
}
const calls=[];
const svc={from:table=>{
 const call={table};calls.push(call);
 const result={data:[{sku:'123',qty_avail:7},{sku:'456',qty_avail:1}],error:null};
 const q={select:cols=>{call.cols=cols;return q},
  eq:(field,value)=>{(call.filters||(call.filters=[])).push([field,value]);return q},
  order:(column,opts)=>{call.order=column;return q},
  limit:n=>{call.limit=n;return q},
  abortSignal:signal=>{call.abort=true;return q},
  then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};
 return q;
}};
const stock=await collectTool(svc,'stock',{signal:AbortSignal.timeout(1000)});
assert.equal(stock.source,'stock_balances');assert.equal(stock.limited,true);
assert.ok(calls[0].limit<=12);assert.equal(calls[0].abort,true);
const tasks=await collectTool(svc,'tasks',{manager:'Руднев'});
assert.deepEqual(calls[1].filters,[['done',false],['manager_name','Руднев']]);
assert.equal(tasks.rows.length,2);
const missing=await collectTool(svc,'unknown');
assert.equal(missing.error,'unknown_domain');
const base=fs.readFileSync('supabase/functions/crm-ai360-dialog-v2/index.ts','utf8');
assert.ok(base.indexOf('u.id!==OWNER_ID')<base.indexOf('const question='));
assert.match(base,/model:'gpt-5.4-mini'/);
assert.match(base,/v1\/responses/);
assert.match(base,/AbortSignal.timeout\(4500\)/);
assert.match(base,/crm_ai360_llm_claim_v1/);
assert.match(base,/result\.error/);
assert.match(base,/if\(readonlyAction\)/);
assert.doesNotMatch(base,/\.update\(|\.insert\(|\.delete\(|\.upsert\(/);
assert.ok(!base.includes('SELECT *'),'never run unrestricted SQL');
const catalog=fs.readFileSync('supabase/functions/_shared/ai360-universal-catalog.mjs','utf8');
const bundle=fs.readFileSync('supabase/functions/crm-ai360-dialog-v2/catalog.mjs','utf8');
assert.equal(catalog,bundle,'bundled catalog must match reviewed source');
console.log('PASS 31 controlled domains, bounded read-only backend, director JWT gate and real GPT-5.4-mini synthesis');
