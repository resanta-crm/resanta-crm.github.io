import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {greet} from '../supabase/functions/crm-stands-telegram-v1/stands-brief.mjs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261111161000_stands360_uniai_data_trust_v2.sql');
const ui=read('assets/268-stands360-uniai-unix-v2.js');
const css=read('assets/268-stands360-uniai-unix-v2.css');
const shell=read('assets/115-stands-v236367.js');
const loader=read('assets/100-safe-upgrades-loader-v236272.js');
const index=read('index.html');
test('Lera calls director «родной» by user ID even if name starts with Александр',()=>{
 assert.equal(greet({id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',name:'Александр Паюшин'}),'родной');
 assert.equal(greet({name:'Александр Паюшин'}),'родной');
 assert.equal(greet({id:'19dd9943-99ae-47c4-a39c-4f82a11059a6',name:'Руднев'}),'Саня');
 assert.equal(greet({id:'3d935a76-c6fe-44b6-b248-fcbe58c6bf1c',name:'Ачинович'}),'Катюшка');
 assert.equal(greet({id:'4fd79fa0-232d-4768-8099-25f47923cc4f',name:'Шкуран'}),'Танюшка');
});
test('one director screen and a separate collapsible legacy document section',()=>{
 for(const term of ['Обзор','Все стенды','Решения','Учёт и документы','Заявки','История','ОС'])
  assert.ok(ui.includes(term),term);
 assert.match(ui,/data-s268-detail/);
 assert.match(ui,/s268-issue/);
 assert.match(ui,/s268-table/);
 assert.match(shell,/if\(state\.tab==='overview360'\)return ''/);
 assert.match(loader,/268-stands360-uniai-unix-v2\.js/);
 assert.match(index,/20261112-stands360-feedback-v3/);
 assert.match(css,/s268-pipeline/);
});
test('unverified stock descriptions cannot be labelled zero sales and source 1C remains protected',()=>{
 assert.match(ui,/Не сопоставлено/);
 assert.match(ui,/client_ship_6m/);
 assert.match(ui,/sales_confidence/);
 assert.match(sql,/client_history_rows/);
 assert.match(sql,/sku_unverified/);
 assert.match(sql,/sum\(h\.revenue\)/);
 assert.match(sql,/upper\(btrim\(h\.sku\)\)=upper\(btrim\(sku_list\.sku\)\)/);
 assert.doesNotMatch(sql,/delete from public\.stand_placement_items_v236346/i);
 assert.doesNotMatch(sql,/update public\.purchase_history/i);
});
test('SKU is confirmed against the exact catalog and original descriptions remain audited',()=>{
 assert.match(sql,/in_full_catalog is true/);
 assert.match(sql,/stand_360_sku_link_audit_v2/);
 assert.match(sql,/stand_360_sku_links_v2/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/p\.manager_name is distinct from n/);
 assert.match(sql,/Список нескольких SKU|список нескольких SKU/i);
 assert.match(ui,/crm_stands_catalog_v236350/);
 assert.match(ui,/crm_stands_sku_link_v2/);
});
test('Vision and seller photographs stay route/GPS-independent, return is never automatic',()=>{
 assert.match(ui,/crm_stands_photo_control_v1/);
 assert.match(ui,/crm_stands_photo_request_v1/);
 assert.match(ui,/crm-stands-vision-v236347/);
 assert.match(ui,/GPS не требуется/);
 assert.doesNotMatch(ui,/crm_stands_return_placement_v236346/);
 assert.doesNotMatch(sql,/delete from public\.stand_photos_v236346/i);
});
