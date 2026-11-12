import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../supabase/migrations/20261112165000_stands360_batch_timeout_hotfix_v1.sql',import.meta.url),'utf8');
const overview=source.split('CREATE OR REPLACE FUNCTION public.crm_stands_360_v3')[1].split('CREATE OR REPLACE FUNCTION public.crm_stands_360_skus_v3')[0];
const detail=source.split('CREATE OR REPLACE FUNCTION public.crm_stands_360_skus_v3')[1];
test('new overview has no per-stand RPC invocation (N+1 timeout regression)',()=>{
 assert.doesNotMatch(overview,/crm_stands_360_skus_v3\(/i);
 assert.doesNotMatch(overview,/crm_stands_360_v2\(/i);
 assert.match(overview,/sku_keys AS MATERIALIZED/i);
 assert.match(overview,/ship_stats AS MATERIALIZED/i);
 assert.match(overview,/history AS MATERIALIZED/i);
});
test('uses real price catalog instead of expensive cross-import view',()=>{
 assert.match(overview,/public\.price_list/i);
 assert.doesNotMatch(overview,/crm_promotion_catalog_v236215/i);
 assert.match(detail,/public\.price_list/i);
 assert.doesNotMatch(detail,/crm_promotion_catalog_v236215/i);
});
test('role scoping before joining source data and manual client bindings retained',()=>{
 assert.match(overview,/role_text NOT IN \('dfs','df','manager'\)/);
 assert.match(overview,/p\.manager_name=person/);
 assert.match(overview,/coalesce\(lb\.legal_client_id,p\.client_id\)/);
 assert.match(overview,/public\.stand_360_multi_sku_v3/);
 assert.match(overview,/public\.stand_360_sku_links_v2/);
 assert.match(detail,/private\.crm_stands_v3_check\(p_placement_id,false\)/);
});
test('unverified SKUs do not count as zero commercial performance',()=>{
 assert.match(overview,/sku_unverified/);
 assert.match(overview,/client_id_unlinked/);
 assert.match(overview,/verified_monthly_client_shipments/);
 assert.match(overview,/jsonb_build_object/);
 assert.match(overview,/month>=date_trunc\('month',current_date\)/);
});
test('read-only fast path keeps existing 1C, GPS, photos and all source records unchanged',()=>{
 for(const unsafe of [/UPDATE\s+public\.purchase_history/i,/DELETE\s+FROM\s+public\.purchase_history/i,/UPDATE\s+public\.stand_placements_v236346/i,/DELETE\s+FROM\s+public\.stand_photos_v236346/i,/gps_verified|gps_check_in/i])assert.doesNotMatch(source,unsafe);
 assert.match(source,/STABLE SECURITY DEFINER/);
});
