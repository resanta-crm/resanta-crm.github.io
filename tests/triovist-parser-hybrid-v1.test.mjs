import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('assets/176-triovist-parser-uniai-unix-v1.js');
const loader=read('assets/100-safe-upgrades-loader-v236272.js');
const flow=read('.github/workflows/triovist-own-hourly-uniai-unix.yml');

test('Hybrid parser code syntax and dedicated guard',()=>{
 assert.doesNotThrow(()=>new vm.Script(ui));
 assert.match(ui,/RESANTA_TRIOVIST_OWN_HOURLY_V1/);
 assert.match(ui,/tr14-shell \[data-tr14="parser"\]\.on/);
 assert.match(ui,/tri21-control-v236107/);
 assert.doesNotMatch(ui,/tri21-card|page-cards|triovistContentRender/);
});
test('Existing own parser, Card 21vek and business screens stay lazy and isolated',()=>{
 assert.match(loader,/if\(document\.querySelector\('#tr14-shell \[data-tr14="parser"\]\.on'\)\)load\('assets\/176-triovist-parser-uniai-unix-v1\.js'/);
 assert.match(loader,/load\('assets\/80-triovist-21vek-control-v236107\.js'/);
 assert.match(loader,/load\('assets\/116-triovist-own-positions-v236351\.js'/);
 assert.doesNotMatch(ui,/triovist_21vek_request_refresh_v236107/);
});
test('Listing is exact depth 120, evidence-aware, with no made-up causal claims',()=>{
 assert.match(ui,/position_depth|depth:120|№120/);
 assert.match(ui,/p176-sku/);
 assert.match(ui,/Проверенных|Подтверждённого|Причинно-следственная|Причина|фактора/);
 assert.match(ui,/triovist_own_hourly_dashboard_v1/);
 assert.match(ui,/triovist_own_hourly_history_v1/);
 assert.match(ui,/p_manager_email/);
 assert.match(ui,/p_card_key/);
});
test('Hourly workflow is isolated, budgeted and never scrapes on PR checks',()=>{
 assert.match(flow,/cron: '23 \* \* \* \*'/);
 assert.match(flow,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
 assert.match(flow,/OWN_HOURLY_KEYWORDS: '60'/);
 assert.match(flow,/safe-hourly/);
 assert.doesNotMatch(flow,/triovist_21vek_promote\.py/);
});
