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
 assert.match(src,/uniCompetitorBrief\(panel,d,scope,rows,listing,priceDays,review\)/);
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
 const start=src.indexOf('function marketHelp(');
 const end=src.indexOf('function scopeSearchNorm(',start);
 const code=src.slice(start,end);
 assert.doesNotMatch(code,/(?:\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|fetch\(|setInterval\()/);
 assert.match(src,/Снижение цены само по себе не подтверждает акцию/);
 assert.match(src,/Падение позиции не доказывает причину/);
 const el={innerHTML:''},panel={querySelector:()=>el},scopes=Array.from({length:45},(_,i)=>({subgroup:'Подгруппа '+i,scope_key:'k'+i,competitors:i+1,gaps:i%3,insufficient_data:2})) ;
 const ctx={panel,d:{scopes,summary:{products:4146,confirmed_gaps:148,insufficient_data:320},last_run:{finished_at:'2026-11-05'}},
  E:x=>String(x??'').replace(/&/g,'&amp;'),N:x=>(x===null||x===undefined||x==='')?null:Number(x),dt:x=>String(x||'')};
 vm.runInNewContext(code+';uniCompetitorBrief(panel,d,"",[],null,7);',ctx);
 assert.equal(el.hidden,true);
 assert.equal(el.innerHTML,'');
});
test('no unrelated files or rights are touched by this feature',()=>{
 assert.match(src,/fullMarketAccess:true/);
 assert.match(src,/read-only/i);
 assert.match(native,/cards:\{name:'Карточки 21vek'/);
});


test('assortment priorities are hidden while subgroup review remains available from filters',()=>{
 assert.doesNotMatch(src,/Приоритеты по ассортименту|data-tm225-filter/);
 assert.match(src,/const review=scope&&view==='market'&&\(analysis==='confirmed_gap'\|\|analysis==='insufficient_data'\)/);
 assert.match(src,/data-tm224-priorities hidden>Все подгруппы/);
});

test('empty snapshots skip the priority block and current positions include their previous value',()=>{
 const start=src.indexOf('function marketHelp(');
 const end=src.indexOf('function scopeSearchNorm(',start);
 const el={innerHTML:'',hidden:false};
 const ctx={el, panel:{querySelector:()=>el}, N:Number, E:String};
 vm.runInNewContext(src.slice(start,end)+';uniCompetitorBrief(panel,{scopes:[]},"",[],null,7);',ctx);
 assert.equal(el.hidden,true);
 assert.equal(el.innerHTML,'');
 const position=src.slice(src.indexOf('function positionMovementText('),src.indexOf('function freshnessInfo('));
 vm.runInNewContext(position+';globalThis.movement=positionMovementText;',ctx);
 const update=__positionWatch=>ctx.movement({__positionWatch});
 assert.equal(update({movement:'down',previous_position:12,position:96,position_delta:-84}),'№12 → №96 · ↓ 84');
 assert.equal(update({movement:'exited',previous_position:119,listing_state:'outside_top120'}),'№119 → Вне TOP-120');
 assert.equal(update({movement:'entered',previous_state:'outside_top120',position:87}),'Вне TOP-120 → №87');
});

test('assortment review uses the recorded rank and presents only supported comparison fields',()=>{
 const a=src.indexOf('const REVIEW_PROFILES='),b=src.indexOf('function css(){',a);
 const n=x=>x==null?null:Number(x),code=src.slice(a,b);
 const ctx={N:n,E:String,money:x=>x+' BYN',analysisState:r=>r.analysis_state,
  humidifierValue:(_key,x)=>String(x),rotaryHammerValue:(_key,x)=>String(x),
  constructionHeatGunValue:(_key,x)=>String(x)};
 vm.runInNewContext(code+';globalThis.review={reviewOrder,reviewFields,reviewText};',ctx);
 const model={model:'Термопистолет X',profile_key:'construction_heat_gun',analysis_state:'insufficient_data',
  snapshotPosition:4,snapshotPrice:119,position:31,our_sku:'67/1/1',our_specs:{input_power_w:2000},
  competitor_specs:{input_power_w:1800,heating_time_sec:null}};
 const ordered=ctx.review.reviewOrder([{snapshotPosition:null},{snapshotPosition:17},model,{snapshotPosition:2}]);
 assert.deepEqual(Array.from(ordered,v=>v.snapshotPosition),[2,4,17,null]);
 const html=ctx.review.reviewFields(model);
 assert.match(html,/Воздушный поток/);
 assert.match(html,/1800.*2000/);
 assert.match(html,/Время нагрева.*Уточнить/);
 assert.match(ctx.review.reviewText(model,'Термопистолеты'),/№4 в выдаче на момент снимка/);
 assert.match(ctx.review.reviewText(model,'Термопистолеты'),/67\/1\/1/);
});
