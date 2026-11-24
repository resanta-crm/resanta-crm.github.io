import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const window={};
const document={readyState:'loading',addEventListener(){}};
const source=readFileSync(new URL('../assets/160-manager-kpi360-visual-v2.js',import.meta.url),'utf8');
vm.runInNewContext(source,{window,document});
const {summarizePeriod}=window.RESANTA_KPI360_VISUAL_V2;

function snapshot(month,entries,sales,shipmentPlan){
 const manager_name='Менеджер';
 const clients=entries.map(([client_key,type])=>({client_key,type,manager_name}));
 const first=clients.filter(client=>client.type==='first').length;
 const returned=clients.filter(client=>client.type==='returned').length;
 const summary={akb:clients.length,first,returned,bonus:first+returned};
 return {month,latest_sales_month:'2026-11',summary,clients,
  sales:[{manager_name,shipment:sales,shipment_plan:shipmentPlan,akb_plan:8}],
  managers:[{manager_name,...summary}]};
}
const range={from:'2025-11',to:'2026-01'};
const november=snapshot('2025-11',[['a','first'],['b','returned'],['d','active']],100,105);
const december=snapshot('2025-12',[['a','active'],['b','active'],['c','first']],50,100);
const january=snapshot('2026-01',[['a','active'],['c','active'],['e','returned']],88,0);

test('the same client is counted once per period, including across years',()=>{
 const main=summarizePeriod(range,[november,december,january]);
 const previous=summarizePeriod({from:'2025-11',to:'2025-11'},[november]);
 assert.equal(main.available,true);
 assert.equal(main.totals.akb,5);
 assert.equal(main.totals.first,2);
 assert.equal(main.totals.returned,2);
 assert.equal(main.rows[0].bonus,4);
 assert.equal(main.rows[0].akb_for_plan,9);
 assert.equal(main.totals.first-previous.totals.first,1);
 assert.equal(main.totals.sales,238);
 assert.equal(main.totals.sales_plan,null);
});

test('incomplete clients do not turn into false zeroes or hide valid sales',()=>{
 const missingClients={...december,clients:december.clients.slice(1)};
 const comparison=summarizePeriod(range,[november,missingClients,january]);
 assert.equal(comparison.totals.first,null);
 assert.equal(comparison.rows[0].returned,null);
 assert.equal(comparison.totals.sales,238);
 assert.equal(summarizePeriod(range,[november,december]).available,false);
});
