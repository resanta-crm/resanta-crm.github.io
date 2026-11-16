import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseAnalysis} from '../supabase/functions/crm-tasks-assistant-v4/assortment.mjs';
import {compactTaskFacts,denseTaskFacts,directionFacts,taskModelInput,MAX_TASK_INPUT_BYTES} from '../supabase/functions/crm-tasks-assistant-v4/model-context.mjs';
import {canonicalModelInput} from '../supabase/functions/crm-tasks-assistant-v4/model-cache.mjs';

const tableRows=value=>value.rows.map(values=>Object.fromEntries(value.columns.map((key,index)=>[key,values[index]])));
function decodeProducts(table,dictionaries){
 return tableRows(table).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>{
  if(key==='product_ref')return ['product',dictionaries.products[value]];
  if(key==='category_ref'||key==='subgroup_ref')return [key.replace('_ref',''),dictionaries.groups[value]];
  if(key==='historical_group_refs')return ['historical_groups',value.map(index=>dictionaries.groups[index])];
  if(key==='previous_autumn_october_november_december')return ['previous_autumn',{october:value[0],november:value[1],december:value[2]}];
  return [key,value];
 })));
}
function decodeHistory(value){
 return value.rows.flatMap(([sku,monthly])=>monthly.map(([month,qty,revenue])=>[sku,value.months[month],qty,revenue]));
}
const sortRows=rows=>[...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));

function factsFor(rows){
 const analysis=purchaseAnalysis(rows,'2026-11-17');
 return {
  client:{id:'client-fixture',client_status:'Рабочий',notes:'Клиент просил сохранить основной ассортимент инструмента.'},
  route:{id:'route-fixture',visit_date:'2026-11-17',address:'Точка № 2'},
  season:{date:'2026-11-17',winter:true,priority:'Климат плюс основной ассортимент; инверторная сварка запрещена.'},
  purchase_restriction:{no_new_products:true,date:'2026-11-10',evidence:'До следующего визита не покупать новые марки.'},
  visits:[{date:'2026-11-10',text:'Уточнить сезонный спрос',agreements:'Повторный ассортимент допустим',objections:'Не предлагать новые марки'}],
  tasks:[{id:'historical-task',title:'Согласовать ассортимент',fact_result:'Контакт состоялся',next_action:'Уточнить остаток',done:false}],
  shelf:[{created_at:'2026-11-10',items:[{sku:rows[0].sku,shelf_qty:2,reserve_qty:0}]}],
  field_policy:'Инверторные сварочные аппараты запрещены всем клиентам выездных менеджеров.',
  request:'Сохранить ABC и повторные закупки вместе с сезонными возможностями.',
  purchase_analysis:analysis,purchase_history:rows,
  candidates:analysis.items.slice(0,5).map(item=>({sku:item.sku,product:item.product,category:'Инструмент',subgroup:'Шуруповёрты',available:17,winter_priority:false,purchase_evidence:item}))
 };
}

test('dense plan round-trips every SKU/month amount, ABC, prior season and product name without changing source facts',()=>{
 const rows=[
  {sku:'75/6/1',product:'Шуруповёрт Ресанта',category:'Инструмент',subgroup:'Шуруповёрты',month:'2025-10-01',qty:5,revenue:100},
  {sku:'75/6/1',product:'Шуруповёрт Ресанта',category:'Инструмент',subgroup:'Шуруповёрты',month:'2025-10-01',qty:-1,revenue:-20},
  {sku:'75/6/1',product:'Шуруповёрт Ресанта',category:'Инструмент',subgroup:'Шуруповёрты',month:'2025-11-01',qty:3,revenue:80},
  {sku:'75/6/1',product:'Шуруповёрт Ресанта',category:'Инструмент',subgroup:'Шуруповёрты',month:'2025-12-01',qty:2,revenue:60},
  {sku:'67/4/2',product:'Конвектор Ресанта',category:'Климат',subgroup:'Конвекторы',month:'2026-10-01',qty:2,revenue:200},
  {sku:'67/4/2',product:'Старое название конвектора',category:'Климат',subgroup:'Конвекторы',month:'2024-01-01',qty:3,revenue:80}
 ];
 const facts=factsFor(rows);facts.winter_products=[{sku:'67/4/2',product:'Конвектор Ресанта',subgroup:'Конвекторы'}];
 const before=JSON.stringify(facts),compact=compactTaskFacts(facts),dense=denseTaskFacts(facts);
 assert.equal(JSON.stringify(facts),before);
 assert.deepEqual(sortRows(decodeHistory(dense.purchase_history)),sortRows(compact.purchase_history.rows));
 assert.equal(decodeHistory(dense.purchase_history).find(row=>row[0]==='75/6/1'&&row[1]==='2025-10')[2],4);
 assert.deepEqual(decodeProducts(dense.purchase_analysis.items,dense.dictionaries),compact.purchase_analysis.items);
 assert.deepEqual(dense.candidates,compact.candidates);
 assert.deepEqual(dense.winter_products,facts.winter_products);
 for(const key of ['client','visits','tasks','shelf','season','purchase_restriction','request','field_policy'])assert.deepEqual(dense[key],facts[key]);
});

test('direction stage keeps assortment evidence and constraints while final plan retains the full monthly ledger',()=>{
 const rows=[
  {sku:'a',product:'Шуруповёрт',category:'Инструмент',subgroup:'Шуруповёрты',month:'2025-10',qty:4,revenue:100},
  {sku:'a',product:'Шуруповёрт',category:'Другая импортная категория',subgroup:'Шуруповёрты',month:'2025-11',qty:2,revenue:50},
  {sku:'b',product:'Конвектор',category:'Климат',subgroup:'Конвекторы',month:'2025-12',qty:2,revenue:150}
 ];
 const facts=factsFor(rows),winter=[{sku:'b',product:'Конвектор',subgroup:'Конвекторы'}],subgroups=['Шуруповёрты','Конвекторы'];
 const before=JSON.stringify(facts),directions=directionFacts(facts,winter,subgroups);
 assert.equal(JSON.stringify(facts),before);
 assert.equal(directions.purchase_history,undefined);
 assert.deepEqual(directions.purchase_analysis.coverage_months,facts.purchase_analysis.coverage_months);
 for(const key of ['client','visits','tasks','shelf','season','purchase_restriction','request','field_policy'])assert.deepEqual(directions[key],facts[key]);
 assert.deepEqual(directions.winter_products,winter);assert.deepEqual(directions.subgroups,subgroups);
 assert.deepEqual(directions.route,{visit_date:facts.route.visit_date,address:facts.route.address});
 assert.deepEqual(directions.purchase_analysis.items.find(row=>row.sku==='a').historical_groups,['Другая импортная категория','Инструмент','Шуруповёрты']);
 for(const item of directions.purchase_analysis.items){
  const source=facts.purchase_analysis.items.find(row=>row.sku===item.sku);
  for(const key of ['sku','product','abc','revenue','qty','last_purchase','purchase_months','previous_autumn'])assert.deepEqual(item[key],source[key]);
 }
 const dense=denseTaskFacts(directions);
 assert.deepEqual(decodeProducts(dense.purchase_analysis.items,dense.dictionaries),directions.purchase_analysis.items);
 assert.equal(decodeHistory(denseTaskFacts(facts).purchase_history).length,3);
});

test('a 1,720-row, 279-SKU, 41-month client prepares without the former 90k-character rejection or data loss',()=>{
 const months=Array.from({length:41},(_,index)=>new Date(Date.UTC(2023,6+index,1)).toISOString().slice(0,7));
 const rows=Array.from({length:1720},(_,index)=>({
  id:'purchase-'+index,sku:'75/6/'+index%279,
  product:'Аккумуляторный шуруповёрт Ресанта — полный канонический товар № '+index%279,
  category:'Электроинструмент',subgroup:'Шуруповёрты аккумуляторные',month:months[index%41],qty:index%13===0?-1:3,revenue:index%13===0?-100:300
 }));
 const facts=factsFor(rows),compact=compactTaskFacts(facts);
 assert(JSON.stringify(facts).length>90000);
 const text=taskModelInput(facts),dense=JSON.parse(text.slice(text.indexOf('\n')+1));
 assert.deepEqual(sortRows(decodeHistory(dense.purchase_history)),sortRows(compact.purchase_history.rows));
 assert.equal(dense.purchase_history.months.length,41);
 assert.equal(dense.purchase_analysis.items.rows.length,279);
 assert.deepEqual(decodeProducts(dense.purchase_analysis.items,dense.dictionaries),compact.purchase_analysis.items);
 assert(new TextEncoder().encode(text).length<MAX_TASK_INPUT_BYTES);
 const directional=taskModelInput(directionFacts(facts,[],['Шуруповёрты аккумуляторные']));
 assert(directional.length<text.length);
});

test('guard is a conservative runaway bound, and non-purchase voice facts stay intact',()=>{
 const facts={request:'Запиши результат',client:{id:'c'},history:[{date:'2026-11-16',text:'Договорились о следующем шаге'}]};
 assert.deepEqual(denseTaskFacts(facts),facts);
 assert.doesNotThrow(()=>taskModelInput({request:'a'.repeat(100000)}));
 assert.throws(()=>taskModelInput({request:'a'.repeat(MAX_TASK_INPUT_BYTES)}),/TASK_CONTEXT_TOO_LARGE/);
});

test('reordering catalog/history object keys and rows does not invalidate canonical paid preparation',()=>{
 const rows=[{sku:'b',product:'Конвектор',month:'2026-10',qty:1,revenue:100},{sku:'a',product:'Шуруповёрт',month:'2025-11',qty:2,revenue:200}];
 const facts=factsFor(rows);facts.winter_products=[{sku:'b',product:'Конвектор',subgroup:'Конвекторы'},{sku:'c',product:'Бензопила',subgroup:'Пилы'}];
 const reordered=structuredClone(facts);
 reordered.purchase_history.reverse();reordered.purchase_analysis.items.reverse();reordered.candidates.reverse();reordered.winter_products.reverse();
 for(const key of ['candidates','winter_products'])reordered[key]=reordered[key].map(item=>Object.fromEntries(Object.entries(item).reverse()));
 assert.equal(canonicalModelInput(taskModelInput(reordered)),canonicalModelInput(taskModelInput(facts)));
});

test('offer and winter catalogs keep literal adjacent SKU/name pairs without unused product dictionary entries',()=>{
 const facts=factsFor([{sku:'history',product:'Исторический товар',month:'2026-10',qty:1,revenue:100}]);
 facts.candidates=[{available:7,product:'Бензопила Huter',sku:'70/6/4',subgroup:'Бензопилы'}];
 facts.winter_products=[{subgroup:'Климат',product:'Конвектор Ресанта',sku:'67/1/24'}];
 const dense=denseTaskFacts(facts);
 assert.deepEqual(Object.keys(dense.candidates[0]).slice(0,2),['sku','product']);
 assert.deepEqual(Object.keys(dense.winter_products[0]).slice(0,2),['sku','product']);
 assert.equal(dense.candidates[0].product,'Бензопила Huter');assert.equal(dense.candidates[0].product_ref,undefined);
 assert.deepEqual(dense.dictionaries.products,['Исторический товар']);
 assert.equal(dense.winter_products[0].product,'Конвектор Ресанта');
});
