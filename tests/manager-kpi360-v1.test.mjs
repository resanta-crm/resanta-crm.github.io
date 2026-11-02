import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync('assets/159-manager-kpi360-v1.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261102_manager_kpi360_yoy_v1.sql','utf8');
test('KPI360 script parses and aggregates without changing KPI math',()=>{
 new vm.Script(js);
 const window={currentProfile:{role:'boss'}};
 const document={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(js,{window,document});
 const s=window.crmKpi360.sum([{shipment:170,akb:47,new_clients:6},{shipment:102,akb:33,new_clients:5},{shipment:73,akb:19,new_clients:4}],[]);
 assert.equal(s.shipment,345);assert.equal(s.akb,99);assert.equal(s.new_clients,15);
});
test('Period races and last import are handled in new controller',()=>{
 assert.match(js,/idRequest=\+\+sequence/);
 assert.match(js,/idRequest!==sequence\|\|!active\(\)\|\|month\(\)!==at/);
 assert.match(js,/latestDataMonth/);
 assert.match(js,/function exportReport/);
});
test('Historical ownership is explicit and SQL reads are scoped',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/actor\.role='manager'/);
 assert.match(sql,/having count\(distinct id\)=1/);
 assert.match(sql,/grant execute on function/);
});
