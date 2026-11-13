import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const crm=read('index.html');
const dash=read('assets/36-warehouse-control-v23620.js');
const compact=read('assets/51-warehouse-compact-days-v23637.js');
const screen=read('assets/195-warehouse-vitebsk360-v1.js');
const inventory=read('inventory.html');
const hub=read('tsd.html');
const truth=read('supabase/migrations/20261109_warehouse_vitebsk360_truth_v1.sql');
const approval=read('supabase/migrations/20261109_warehouse_vitebsk360_order_approval_v1.sql');
const exportSql=read('supabase/migrations/20261109_warehouse_vitebsk360_approved_document_v1.sql');
const scripts=[...inventory.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);

test('all warehouse scripts and all embedded TSD scripts compile',()=>{
 for(const content of [dash,compact,screen,...scripts])assert.doesNotThrow(()=>new vm.Script(content));
});
test('existing warehouse dashboard calls separate director stock truth, preserves other tabs and sales data',()=>{
 assert.match(dash,/crmWarehouseVitebsk360V1\?\.mount/);
 assert.match(dash,/crmWarehouseVitebsk360V1\?\.attachOrderRows/);
 assert.match(compact,/crmWarehouseVitebsk360V1\?\.attachOrderRows/);
 assert.match(crm,/195-warehouse-vitebsk360-v1\.js\?v=20261109-vitebsk360-1/);
 assert.match(crm,/APP_VERSION = '2026-11-13-lera-professional-names-v1'/);
});
test('physical Vitebsk is separate from cost and Chekhov and missing stock is never fabricated as zero',()=>{
 assert.match(truth,/WHERE warehouse='Витебск' AND report_date=v_stock_date/);
 assert.match(truth,/FULL OUTER JOIN costs c USING\(sku\)/);
 assert.match(truth,/not_in_physical_snapshot/);
 assert.match(truth,/unknown_not_zero/);
 assert.match(truth,/v_other_unavailable:=v_onhand-v_reserve-v_free/);
 assert.match(truth,/public\.warehouse_norm_factor\(v_cost_month\)/);
 assert.match(truth,/status='active'/);
 assert.match(truth,/stock_report_date/);
});
test('director sees original SN components and separate 14-day per-SKU demand, packaging and source dates',()=>{
 assert.match(dash,/SN = MAX\(0; OT − VF × NO\)/);
 assert.match(screen,/expense_cost_byn/);
 assert.match(screen,/opening_cost_byn/);
 assert.match(screen,/avg3_qty/);
 assert.match(screen,/ly_qty/);
 assert.match(screen,/forecast_source/);
 assert.match(screen,/vitebsk_avail/);
 assert.match(screen,/recommended_order_qty/);
 assert.match(screen,/chekhov_stock_date/);
 assert.match(compact,/FIXED_HORIZON=14/);
});
test('order approval is separately checked by server from all pages, stored immutably, and does not post to 1C',()=>{
 assert.match(approval,/ENABLE ROW LEVEL SECURITY/);
 assert.match(approval,/REVOKE ALL ON public\.warehouse_vitebsk360_order_approvals_v1 FROM PUBLIC,anon,authenticated/);
 assert.match(approval,/IF NOT public\.warehouse_is_boss\(\) OR auth\.uid\(\) IS NULL/);
 assert.match(approval,/p_expected_stock_date IS DISTINCT FROM v_current_stock/);
 assert.match(approval,/current_date-v_current_stock>2/);
 assert.match(approval,/warehouse_control_get_items_v2\(v_month,'order','',500,v_offset\)/);
 assert.match(approval,/v_offset:=v_offset\+jsonb_array_length\(v_page\)/);
 assert.match(approval,/ON CONFLICT\(fingerprint\) DO NOTHING/);
 assert.match(approval,/No order placement or 1C write/i);
 assert.match(exportSql,/posting_status','not_sent_to_1c_or_chekhov'/);
 assert.match(screen,/confirm\(msg\)/);
 assert.match(screen,/warehouse_vitebsk360_approved_document_v1/);
});
test('no modifications to original inventory, source stock or financial figures in SQL',()=>{
 const migration=[truth,approval,exportSql].join('\n');
 assert.doesNotMatch(migration,/(?:UPDATE|DELETE FROM|TRUNCATE|DROP TABLE)\s+(?:public\.)?(?:stock_balances|warehouse_inventory_sessions|warehouse_inventory_events|warehouse_cost_snapshots|warehouse_cost_import_log|triovist_chekhov_stock)\b/i);
 assert.doesNotMatch(migration,/PERFORM\s+public\.warehouse_inventory_finish/);
});
test('hardware scanner and manual keypad support one Enter/idle submit path, preserving original UUID on offline replay',()=>{
 assert.match(inventory,/id="keypad-grid"/);
 for(const digit of ['1','2','3','4','5','6','7','8','9','/','0']) assert.ok(inventory.includes('data-digit="'+digit+'"'));
 assert.match(inventory,/id="keypad-abc"/);
 assert.match(inventory,/function submitIntent\(v,mode='scan'\)/);
 assert.match(inventory,/inputAutoTimer=setTimeout/);
 assert.doesNotMatch(inventory,/recentlySubmitted\(/);
 assert.doesNotMatch(inventory,/lastSubmittedCode/);
 assert.doesNotMatch(inventory,/document\.addEventListener\('keypress'/);
 assert.match(inventory,/p_client_event_id:eventId/);
 assert.match(inventory,/p_client_event_id:x\.id/);
 assert.match(inventory,/ql\.push\(\{id:eventId/);
 assert.match(inventory,/Сканы не удалены/);
 assert.match(inventory,/В 1С корректировки автоматически НЕ проводятся/);
});
test('TSД new version is linked coherently and its login recovery and offline queue remain',()=>{
 assert.match(hub,/\/inventory\.html\?legacy-module=1&v=381/);
 assert.match(inventory,/2026-11-09-v23\.6\.381-vitebsk360-tsd/);
 assert.match(inventory,/\/inventory\.html\?legacy-module=1&v=381&ts=/);
 assert.match(inventory,/function queue\(\)/);
 assert.match(inventory,/function flushQueue\(\)/);
 assert.match(inventory,/showFreshLogin\('Сессия истекла/);
});
