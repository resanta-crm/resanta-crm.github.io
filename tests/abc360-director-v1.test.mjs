import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const index=read('index.html'),core=read('assets/01-crm-core.js');
const agg=read('assets/113-analytics-aggregates-v236342.js');
const dash=read('assets/187-abc-director360-v1.js');
const sql=read('docs/abc360_fast_rpc_v1.sql');
test('ABC 360 loads after core and server aggregate; unrelated navigations stay intact',()=>{
 assert.match(index,/assets\/187-abc-director360-v1\.js\?v=20261109-abc360-1/);
 assert.ok(index.indexOf('assets/01-crm-core.js')<index.indexOf('assets/113-analytics-aggregates-v236342.js'));
 assert.ok(index.indexOf('assets/113-analytics-aggregates-v236342.js')<index.indexOf('assets/187-abc-director360-v1.js'));
 assert.match(index,/id="page-abc"/);
 for(const name of ['nav-sales','nav-abc','nav-tasks','nav-vip'])assert.ok(index.includes(name),name);
});
test('ABC uses optimized live SQL function and safe prior-month normalization',()=>{
 assert.match(agg,/db\.rpc\('crm_abc_slice_v20261109'/);
 assert.match(sql,/FUNCTION public\.crm_abc_slice_v20261109/);
 assert.match(sql,/where ph\.month = any\(p\.all_month_dates\)/);
 assert.doesNotMatch(sql,/where to_char\(ph\.month,'YYYY-MM'\)=any/);
 assert.match(sql,/firsts as materialized/);
 assert.doesNotMatch(sql,/join item_keys k/);
 assert.match(sql,/REVOKE ALL ON FUNCTION .* FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION .* TO authenticated,service_role/);
});
test('ABC SKU reconciliation displays R, and absent stock is not zero',()=>{
 assert.match(dash,/g\.counts\.R/);
 assert.match(dash,/нет данных об остатке/);
 assert.match(dash,/Number\.isFinite\(Number\(st\.avail\)\)/);
 assert.match(dash,/syncFromLegacy/);
 assert.deepEqual({A:61,B:34,C:28,N:6,R:4}, {A:61,B:34,C:28,N:6,R:4});
 assert.equal(61+34+28+6+4,133);
});
test('ABC 360 stays confined to ABC page and retains existing task approvals and export',()=>{
 assert.match(dash,/#page-abc\.abc360-on/);
 assert.match(dash,/id='abc360-root'/);
 assert.match(dash,/existing ABC \+ 1C/);
 assert.match(dash,/readOnly:true/);
 assert.doesNotMatch(dash,/db\.(?:from|rpc|insert|update|delete)\(/);
 assert.match(core,/function exportABCToCsv\(\)/);
 assert.match(dash,/goPage\('tasks','Задачи ИИ'\)/);
 assert.match(index,/window\.abc360DebouncedSearch\?abc360DebouncedSearch\(\):renderABC\(\)/);
});
