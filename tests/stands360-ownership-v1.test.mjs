import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261111143000_stands_360_ownership_photo_sales_v1.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../assets/267-stands360-director-ui-v1.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../assets/115-stands-v236367.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('../assets/100-safe-upgrades-loader-v236272.js',import.meta.url),'utf8');
test('authenticated per-placement scope, not name-only client or GPS',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/p\.client_id/);
 assert.match(sql,/manager_name<>v_name/);
 assert.match(sql,/p\.manager_name=n/);
 assert.match(sql,/client_code/);
 assert.match(sql,/physical_point_links/);
 assert.doesNotMatch(sql,/gps_verified|gps_lat|gps_lng|check_in/i);
});
test('stand photo capture does not delete, overwrite or invent exact SKU',()=>{
 const safe=sql.slice(sql.indexOf('create or replace function public.crm_stands_photo_control_v1'),sql.indexOf('create or replace function public.crm_stands_360_v1'));
 assert.match(safe,/from storage\.objects/);
 assert.match(safe,/stand_360_photo_sources_v1/);
 assert.match(safe,/seller/);
 assert.match(safe,/stand_360_photo_sources_v1/);
 assert.doesNotMatch(safe,/delete from public\.stand_placement_items_v236346/);
 assert.doesNotMatch(safe,/update public\.stand_assets_v236346/);
});
test('1C shipment proxy stays scoped to registered exact SKU and monthly precision',()=>{
 assert.match(sql,/btrim\(h\.sku\)=btrim\(i\.sku\)/);
 assert.match(sql,/h\.client_id=p\.client_id/);
 assert.match(sql,/data_granularity.*month/);
 assert.doesNotMatch(sql,/daily_receipt|exact_shipment_day/);
});
test('existing inventory and histories remain reachable, UI has executive view and two photo sources',()=>{
 assert.match(shell,/overview360/);
 assert.match(shell,/Действующие \/ ОС/);
 assert.match(loader,/267-stands360-director-ui-v1/);
 assert.match(ui,/Прислал продавец/);
 assert.match(ui,/Маршрут не|GPS и маршрут не нужны/);
 assert.match(ui,/crm_stands_photo_control_v1/);
 assert.match(ui,/crm_stands_360_skus_v1/);
 assert.match(ui,/Решение руководителя|Возврат оборудования/);
 assert.doesNotMatch(ui,/\.from\(['"]purchase_history['"]\)/);
});
