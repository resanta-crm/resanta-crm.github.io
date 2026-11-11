import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../assets/106-triovist-competitors-v236218.js',import.meta.url),'utf8');
const native=fs.readFileSync(new URL('../assets/173-triovist-native-sections-v1.js',import.meta.url),'utf8');
const router=fs.readFileSync(new URL('../assets/34-triovist-root-v23614.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('new competitor module parses and keeps existing APIs and routes',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 for(const name of ['function rowHtml(','function listingInline(','function competitorPriceTrend(',
  'function listingHistoryBlock(','function competitorPositionHistoryBlock(','function exportExcel(',
  'function ourSkuCardHtml(','data-f-view','data-f-price-trend','data-f-brand','data-f-sku',
  'data-f-trend','data-f-mrc','data-f-top10','data-f-analysis-state','data-f-competitor-kind'])
  assert.ok(src.includes(name),'missing '+name);
 assert.match(src,/competitorPriceFilters:\[3,7,10,14,20,30\]/);
 assert.match(src,/automaticMarket:true,lazyMarketByScope:true/);
 assert.match(router,/RESANTA_TRIOVIST_COMPETITORS_V236218/);
 assert.match(index,/173-triovist-native-sections-v1\.js/);
});
test('old listing cannot be hidden by generic competitor briefing',()=>{
 assert.match(native,/tx7-hide-competitors \[data-tm224-rows\]/);
 assert.match(src,/#tr14-panel\.tx7-hide-competitors \[data-tm224-rows\]\{display:block!important\}/);
 assert.match(src,/#tr14-panel > \.tx7\{display:none!important\}/);
 assert.match(src,/data-tm225/);
 assert.match(src,/uniCompetitorBrief\(panel,d,scope,rows,base,listing,priceDays\)/);
 assert.match(src,/data-tm224-product/);
});
test('category and search filter all scopes, not only a sample category',()=>{
 const start=src.indexOf('function scopeSearchNorm(v){');
 const end=src.indexOf('function scopeHtml(',start);
 const helpers=src.slice(start,end);
 const select={value:'',innerHTML:''},category={value:''};
 const panel={querySelector:x=>x==='[data-f-scope]'?select:x==='[data-f-category]'?category:null};
 const ctx={panel,E:x=>String(x??''),scopes:Array.from({length:45},(_,i)=>({
  category:i<14?'Инструмент':i<20?'Климатическое оборудование':'Садовая техника',
  subgroup:i===16?'Конвекторы':'Товарная подгруппа '+i,search_query:i===16?'конвектор':'набор',
  profile_key:'profile'+i,scope_key:'scope-'+i
 }))};
 vm.runInNewContext(helpers+';this.filterScopeSelect=filterScopeSelect;',ctx);
 assert.equal(ctx.filterScopeSelect(panel,ctx.scopes,'').length,45);
 assert.equal(ctx.filterScopeSelect(panel,ctx.scopes,'конвекторы').length,1);
 assert.match(select.innerHTML,/Конвекторы/);
 category.value='Климатическое оборудование';
 assert.equal(ctx.filterScopeSelect(panel,ctx.scopes,'').length,6);
 assert.equal(ctx.filterScopeSelect(panel,ctx.scopes,'конвекторы').length,1);
 category.value='Инструмент';
 assert.equal(ctx.filterScopeSelect(panel,ctx.scopes,'конвекторы').length,0);
});
test('search automatically chooses unique matching scope but does not auto-select ambiguous ones',()=>{
 assert.match(src,/found\.length===1/);
 assert.match(src,/setTimeout\(\(\)=>\{if\(!panel\.isConnected\|\|scopeSearch\.value!==value\)return/);
 assert.match(src,/sel\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
 assert.match(src,/data-f-scope-hint/);
 assert.match(src,/data-f-reset/);
});
test('old responses from rapid scope and period changes cannot overwrite current listing',()=>{
 assert.match(src,/ticket=\+\+scopeEpoch/);
 assert.match(src,/ticket===scopeEpoch/);
 assert.match(src,/panel\.querySelector\('\[data-tm225\]'\)===root/);
 assert.ok((src.match(/if\(!current\(\)\)return/g)||[]).length>=6);
 assert.match(src,/ticket!==scopeEpoch\|\|panel\.querySelector\('\[data-f-price-days\]'\)/);
 assert.match(src,/ticket!==scopeEpoch\|\|panel\.querySelector\('\[data-f-days\]'\)/);
});
test('briefing reads existing snapshots, never guesses causes or confirmed promotions',()=>{
 const start=src.indexOf('function uniCompetitorBrief(');
 const end=src.indexOf('function scopeSearchNorm(',start);
 const code=src.slice(start,end);
 assert.doesNotMatch(code,/(?:\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|fetch\(|setInterval\()/);
 assert.match(code,/Само по себе не подтверждает акцию/);
 assert.match(code,/Падение позиции не доказывает причину/);
 const el={innerHTML:''},panel={querySelector:()=>el},scopes=Array.from({length:45},(_,i)=>({subgroup:'Подгруппа '+i,scope_key:'k'+i,competitors:i+1,gaps:i%3,insufficient_data:2})) ;
 const ctx={panel,d:{scopes,summary:{products:4146,confirmed_gaps:148,insufficient_data:320},last_run:{finished_at:'2026-11-05'}},
  E:x=>String(x??'').replace(/&/g,'&amp;'),N:x=>(x===null||x===undefined||x==='')?null:Number(x),dt:x=>String(x||'')};
 vm.runInNewContext(code+';uniCompetitorBrief(panel,d,"",[],[],null,7);',ctx);
 assert.match(el.innerHTML,/4\s146/);
 assert.match(el.innerHTML,/Подгруппа/);
 assert.equal((el.innerHTML.match(/class="tm225-item (?:bad|warn)"/g)||[]).length,5);
});
test('no unrelated files or rights are touched by this feature',()=>{
 assert.match(src,/fullMarketAccess:true/);
 assert.match(src,/read-only/i);
 assert.match(native,/cards:\{name:'Карточки 21vek'/);
});


test('all-category overview gives measurable actions, not duplicate generic commands or empty dynamics',()=>{
 const start=src.indexOf('function uniCompetitorBrief(');
 const end=src.indexOf('function scopeSearchNorm(',start);
 const code=src.slice(start,end);
 const el={innerHTML:''};
 const panel={querySelector:()=>el};
 const ctx={
  panel,
  d:{
   scopes:[
    {scope_key:'humidifiers',subgroup:'Увлажнители воздуха',competitors:117,confirmed_gaps:67,insufficient_data:0},
    {scope_key:'rotary',subgroup:'Перфораторы',competitors:103,confirmed_gaps:47,insufficient_data:0},
    {scope_key:'planers',subgroup:'Рубанки',competitors:107,confirmed_gaps:24,insufficient_data:39},
    {scope_key:'saws',subgroup:'Вибропилы',competitors:83,confirmed_gaps:7,insufficient_data:41},
    {scope_key:'garden',subgroup:'Садовая техника',competitors:50,confirmed_gaps:5,insufficient_data:33}
   ],
   summary:{products:4039,confirmed_gaps:153,insufficient_data:1884},
   last_run:{finished_at:'2026-11-11T02:37:00Z'}
  },
  E:x=>String(x??'').replace(/&/g,'&amp;'),
  N:x=>x===null||x===undefined||x===''?null:Number(x),
  dt:x=>String(x||'')
 };
 vm.runInNewContext(code+';uniCompetitorBrief(panel,d,"",[],[],null,7);',ctx);
 const html=el.innerHTML;
 assert.match(html,/Что делать сегодня/);
 assert.match(html,/Увлажнители воздуха/);
 assert.match(html,/67/);
 assert.match(html,/Показать 67 пробелов/);
 assert.match(html,/data-tm225-filter="confirmed_gap"/);
 assert.match(html,/data-tm225-filter="insufficient_data"/);
 assert.match(html,/Где больше пробелов/);
 assert.doesNotMatch(html,/Динамика конкурентов/);
 assert.doesNotMatch(html,/Открыть подгруппу и проверить её листинг/);
 assert.match(src,/if\(proofFilter&&proofSelect\)proofSelect\.value=proofFilter/);
 assert.equal((html.match(/class="tm225-item /g)||[]).length,5);
});
