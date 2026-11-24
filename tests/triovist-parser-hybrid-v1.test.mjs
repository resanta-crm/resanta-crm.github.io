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
 assert.match(ui,/Движение позиции само по себе не объясняет причину/);
 assert.match(ui,/triovist_own_hourly_dashboard_v1/);
 assert.match(ui,/triovist_own_hourly_history_v1/);
 assert.match(ui,/p_manager_email/);
 assert.match(ui,/p_card_key/);
});
test('priorities are short, use fresh declines and give an action grounded in observed stock or price',()=>{
 const w={};
 vm.runInNewContext(ui.replace(/\}\)\(\);?\s*$/, 'window.fixture={priority};})();'),{
  window:w,document:{addEventListener(){}},setTimeout(){},setInterval(){}
 });
 const now=Date.parse('2026-11-23T11:00:00Z');
 const row={card_key:'card1',manager_email:'manager',sku:'74/3/27',keyword:'Пневматический краскопульт',
  movement:'exited',previous_position:118,position:null,observed_at:'2026-11-23T10:53:00Z',
  observed_stock:false,previous_observed_stock:true};
 const html=w.fixture.priority([row,{...row,sku:'старый',observed_at:'2026-11-23T04:53:00Z'},
  {...row,sku:'небольшое снижение',movement:'down',position_delta:-8}],now);
 assert.match(html,/74\/3\/27/);
 assert.match(html,/№118 → Вне TOP-120/);
 assert.match(html,/Наличие в выдаче сменилось на «нет». Сверить остаток/);
 assert.doesNotMatch(html,/старый|небольшое снижение/);
 assert.equal(w.fixture.priority([{...row,observed_at:'2026-11-23T04:53:00Z'}],now),'');
});
test('daily source and MRC technical metadata are tooltip content, independent of hourly view',()=>{
 const daily=read('assets/80-triovist-21vek-control-v236107.js');
 assert.match(daily,/snapshotHelp=help\('tri21-snapshot-tip'/);
 assert.match(daily,/help\('tri21-mrc-tip','Источник МРЦ и цен'/);
 assert.match(daily,/Удалённые страницы товаров/);
 assert.match(daily,/dailyBody\(root\)\.innerHTML/);
 assert.match(daily,/Promise\.allSettled\(\[status\(force\),mrcStatus\(force\)\]\)/);
 assert.match(ui,/Позиции и история SKU/);
 assert.match(ui,/hint\('p176-list-tip'[^\n]+\n\s*listingInfo/);
 assert.match(ui,/hint\('p176-method'[^\n]+\n\s*freshness/);
 assert.doesNotMatch(ui,/Почему упали и что делать|Обновить брифинг|overviewBars/);
});
test('daily collection stays above hourly search and the old navigation stays hidden',()=>{
 const daily=read('assets/80-triovist-21vek-control-v236107.js');
 const router=read('assets/34-triovist-root-v23614.js');
 assert.match(daily,/root\.insertBefore\(body,root\.querySelector\(':scope > #p176'\)\)/);
 assert.match(ui,/root\.appendChild\(el\);render\(\)/);
 assert.match(router,/#page-triovist\[data-triovist-view\] #tri-v22728-tabs\{display:none!important\}/);
});
test('Hourly workflow is isolated, budgeted and never scrapes on PR checks',()=>{
 assert.match(flow,/cron: '23 \* \* \* \*'/);
 assert.match(flow,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
 assert.match(flow,/OWN_HOURLY_KEYWORDS: '60'/);
 assert.match(flow,/safe-hourly/);
 assert.doesNotMatch(flow,/triovist_21vek_promote\.py/);
});
