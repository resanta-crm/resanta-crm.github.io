import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261105093000_triovist_parser_hourly_uniai_unix_v1.sql',import.meta.url),'utf8');
test('new tables are separate from published 21vek parser data',()=>{
 assert.match(sql,/create table if not exists public\.triovist_own_hourly_runs_v1/);
 assert.match(sql,/create table if not exists public\.triovist_own_hourly_observations_v1/);
 assert.doesNotMatch(sql,/drop table|truncate table|alter table public\.triovist_content|alter table public\.triovist_21vek_top_current/i);
});
test('both new tables use RLS and block browser direct access',()=>{
 assert.match(sql,/alter table public\.triovist_own_hourly_runs_v1 enable row level security/);
 assert.match(sql,/alter table public\.triovist_own_hourly_observations_v1 enable row level security/);
 assert.match(sql,/revoke all on public\.triovist_own_hourly_runs_v1 from public,anon,authenticated/);
 assert.match(sql,/revoke all on public\.triovist_own_hourly_observations_v1 from public,anon,authenticated/);
});
test('read RPCs verify manager identity, secure own SKU history',()=>{
 assert.match(sql,/triovist_own_hourly_dashboard_v1/);
 assert.match(sql,/triovist_own_hourly_history_v1/);
 assert.match(sql,/a\.actor_role='boss'/);
 assert.match(sql,/a\.actor_scope='triovist'/);
 assert.match(sql,/v_manager := a\.actor_email/);
 assert.match(sql,/if v_manager<>a\.actor_email/);
 assert.match(sql,/revoke all on function public\.triovist_own_hourly_dashboard_v1/);
 assert.match(sql,/revoke all on function public\.triovist_own_hourly_history_v1/);
});
test('only verified ranks 1 to 120 are stored and stale matches are excluded',()=>{
 assert.match(sql,/check\(position between 1 and 120\)/);
 assert.match(sql,/observed_at >= now\(\)-interval '45 days'/);
 assert.match(sql,/and p\.keyword=l\.keyword/);
 assert.match(sql,/position_label/);
 assert.match(sql,/Причинно-следственная|Изменение|не доказывает причину/);
});
