import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const compact=read('assets/51-warehouse-compact-days-v23637.js');
const core=read('assets/36-warehouse-control-v23620.js');
const loader=read('assets/66-performance-root-v23657.js');
const html=read('index.html');
const sql=read('docs/warehouse_autoorder_abc_classes_v1.sql');

test('one added category header exists only in order mode',()=>{
 assert.doesNotThrow(()=>new Function(compact));
 assert.doesNotThrow(()=>new Function(loader));
 assert.match(compact,/mode==='order'\?'<th class="c-abc">Категория<\/th>':'/);
 assert.match(compact,/data-wc-abc-sku=/);
 assert.match(compact,/if\(mode==='order'\)void decorateAbcOrder\(data,root\)/);
 assert.match(compact,/wc-compact\.wc-abc-order/);
 assert.match(compact,/const FIXED_HORIZON=14/);
 assert.match(compact,/warehouse_control_get_items_v2/);
 assert.match(compact,/attachOrderRows/);
 assert.match(core,/function renderItems\(data\)/);
});
test('only real ABC labels are displayed, with unknown SKU as dash',()=>{
 assert.match(compact,/warehouse_control_abc_classes_v1/);
 assert.match(compact,/p_month:month\+'-01'/);
 assert.match(compact,/ABC-категория автозаказа временно недоступна/);
 assert.match(compact,/\['A','B','C','N','R'\]\.includes\(cls\)\?cls:'—'/);
 assert.match(compact,/cell\.textContent=label/);
 assert.doesNotMatch(compact,/warehouse_control_set_/);
});
test('RPC is boss-only and keeps existing 1C order and export math untouched',()=>{
 assert.match(sql,/warehouse_is_boss\(\)/);
 assert.match(sql,/security definer/);
 assert.match(sql,/revoke all on function public\.warehouse_control_abc_classes_v1\(date\) from public, anon/);
 assert.match(sql,/grant execute on function public\.warehouse_control_abc_classes_v1\(date\) to authenticated, service_role/);
 assert.match(sql,/from public\.purchase_history/);
 assert.match(sql,/prior_revenue\/nullif\(r\.positive_total,0\)<0\.80/);
 assert.match(sql,/prior_revenue\/nullif\(r\.positive_total,0\)<0\.95/);
 assert.doesNotMatch(sql,/\b(update|delete|insert|truncate|alter table)\s+public\./i);
 assert.match(compact,/const headers=\['Артикул','Товар','Остаток Витебск'/);
 assert.match(compact,/const mapper=r=>\[r\.sku,r\.product,n\(r\.vitebsk_avail\)/);
});
test('only warehouse compact renderer receives a new cache-key',()=>{
 assert.match(loader,/path==='assets\/51-warehouse-compact-days-v23637\.js'\?'20261109-warehouse-abc-column1'/);
 assert.match(loader,/RESANTA_WAREHOUSE_COMPACT_V23637:'v23\.6\.320'/);
 assert.match(html,/66-performance-root-v23657\.js\?v=20261106-manager-feedback&abcOrder=20261109-1/);
});
