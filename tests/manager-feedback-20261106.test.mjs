import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {kpiMetric,kpiAnswer,questionMonth} from '../supabase/functions/crm-ai360-staff-dialog-v1/kpi-answer.mjs';
import {formatManagerSales,isManagerSalesQuestion} from '../supabase/functions/crm-ai360-dialog-v4/manager-sales.mjs';
const require=createRequire(import.meta.url);
const {buildPlans,rowKeysForPlans,uniqueDisplayRowsForPlans}=require('../assets/184-client-route-catalog-v3.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const card=(id,name='Магазин',group='legal',city='Город',addr='Улица, 10',points=null)=>({
 client:{id,name,manager_name:'Руднев',client_status:'Рабочий',city,address:addr,role_type:'A'},
 entity_id:group,entity_name:group?'ООО Магазин':null,
 points:points||[{id:'point-'+id,city,address:addr,lat:null,lng:null}]
});
test('confirmed same-address aliases collapse without mutating source history',()=>{
 const records=[card('a','Старая карточка'),card('b','Новая карточка')],before=structuredClone(records);
 const plans=buildPlans(records);assert.equal(plans.length,1);assert.equal(plans[0].linked.length,2);assert.equal(plans[0].visits,4);
 assert.deepEqual(records,before);
 const row=id=>({manager_name:'Руднев',physical_point_id:'point-'+id,client_id:id,city:'Город',address:'Улица, 10'});
 assert.deepEqual(rowKeysForPlans(row('a'),plans),rowKeysForPlans(row('b'),plans));
 const route=[{...row('a'),visit_date:'2026-11-07'}, {...row('b'),visit_date:'2026-11-07'}];
 assert.equal(uniqueDisplayRowsForPlans(route,plans).length,1);
 assert.equal(uniqueDisplayRowsForPlans(route,plans,r=>r.physical_point_id==='point-b').length,2);
});
test('different addresses, unrelated clients and conflicting GPS are never collapsed',()=>{
 assert.equal(buildPlans([card('a'),card('b','Б','legal','Город','Улица, 12')]).length,2);
 assert.equal(buildPlans([card('a','А',null),card('b','Б',null)]).length,2);
 const a=card('a'),b=card('b');a.points[0].lat=55;a.points[0].lng=30;b.points[0].lat=56;b.points[0].lng=30;
 assert.equal(buildPlans([a,b]).length,2);
});
test('all physical addresses of a client are selectable, including clients without SKUs',()=>{
 const c=card('a','Магазин','legal','Город','Улица, 10',[{id:'p1',city:'Город',address:'Улица, 10'},{id:'p2',city:'Город',address:'Гагарина, 25'}]);
 const plans=buildPlans([c]);assert.equal(plans.length,2);
 assert.deepEqual(rowKeysForPlans({manager_name:'Руднев',client_id:'a',physical_point_id:'p2'},plans),['p2']);
 assert.deepEqual(rowKeysForPlans({manager_name:'Руднев',client_id:'a'},plans),[]);
 const fresh=card('new','Новая ТТ',null);fresh.points=[];fresh.client.client_status='Потенциальный';
 assert.equal(buildPlans([fresh]).length,1);
});
const evidence={answer_verified:true,read_only:true,domain:'sales',scope:{role:'field_manager',managers:['Ачинович']},data:{source:'crm_ai360_sales_kpi_snapshot_v1',month:'2026-11',freshness_status:'ok',managers:[{manager_name:'Ачинович',plan:105000,actual:14034.05,akb:10,akb_plan:35}]}};
test('Lera answers AKB in customers and money in BYN with no thousand-fold inflation',()=>{
 assert.equal(kpiMetric('Расскажи, сколько АКБ сделано по Ачиновичу за ноябрь месяц?'),'akb');
 assert.equal(kpiMetric('Какое выполнение плана продаж?'),'sales');
 assert.equal(kpiMetric('Остатки аккумуляторов АКБ по артикулам'),null);
 const akb=kpiAnswer(evidence,['Ачинович'],'2026-11','akb');assert.match(akb,/10 клиентов при плане 35/);assert.match(akb,/28,6%/);assert.doesNotMatch(akb,/рубл/);
 const sales=kpiAnswer(evidence,['Ачинович'],'2026-11','sales');assert.match(sales,/105\s000 белорусских рублей/);assert.match(sales,/14\s034/);assert.match(sales,/13,4%/);assert.doesNotMatch(sales,/млн|667|645/);
 assert.equal(kpiAnswer(evidence,['Руднев'],'2026-11','sales'),null);
 assert.equal(kpiAnswer(evidence,['Ачинович'],'2026-10','sales'),null);
 const missing=structuredClone(evidence);delete missing.data.managers[0].akb;assert.equal(kpiAnswer(missing,['Ачинович'],'2026-11','akb'),null);
});
test('spoken months and director AKB use the same verified data',()=>{
 assert.equal(questionMonth('За октябрь','2026-11','2026-11-06'),'2026-10');
 assert.equal(questionMonth('За прошлый месяц','2026-11','2026-11-06'),'2026-10');
 assert.equal(isManagerSalesQuestion('Сколько АКБ у Ачиновича',{managerNames:['Ачинович']}),true);
 const data={month:'2026-11',managers:[{...evidence.data.managers[0],plan_pct:13.4}]};
 const r=formatManagerSales({question:'Сколько АКБ у Ачиновича',data,month:'2026-11',managerNames:['Ачинович']});assert.match(r.brief,/АКБ 10 клиентов, план 35/);
});
test('failed client insert keeps the form and retry ID, successful insert becomes visible',async()=>{
 const core=read('assets/01-crm-core.js');
 const code=core.slice(core.indexOf('async function saveNewClient(){'),core.indexOf('// openAddTask defined above'));
 const ids=new Map(Object.entries({'nc-name':'Новая ТТ','nc-manager':'Руднев','nc-city':'Город','nc-address':'Гагарина, 25','nc-status':'Потенциальный','nc-region':'Витебск','nc-contact':'','nc-phone':'','nc-code':'','nc-rev':'','client-search':'Старый поиск'}).map(([id,value])=>[id,{value}]));
 ids.set('nc-result',{textContent:''});ids.set('nc-save',{disabled:false,dataset:{}});
 let fail=true,closed=0,payload;
 const ctx={document:{getElementById:id=>ids.get(id)},currentProfile:{role:'boss'},currentUser:{id:'boss'},allClients:[],
 crypto:{randomUUID:()=> 'new-id'},db:{from:()=>({insert:p=>{payload=p;return {select:()=>({single:async()=>fail?{error:{message:'Нет связи'}}:{data:p}})}}})},
 window:{dispatchEvent(){}},Event:class{},closeModal:()=>closed++,renderClients(){},openClient(){},
 _clientNameMatchCache:null,_phClientMatchCache:null,_phNameSet:null,regionFilter:'Гомель',managerFilter:'Шкуран',statusFilter:'Рабочий'};
 vm.createContext(ctx);vm.runInContext(code,ctx);await ctx.saveNewClient();
 assert.equal(closed,0);assert.equal(ids.get('nc-name').value,'Новая ТТ');assert.equal(ids.get('nc-save').dataset.clientId,'new-id');assert.equal(ids.get('nc-save').disabled,false);assert.match(ids.get('nc-result').textContent,/не сохранён/);
 fail=false;await ctx.saveNewClient();assert.equal(closed,1);assert.equal(ctx.allClients.length,1);assert.equal(payload.manager_name,'Руднев');assert.equal(payload.address,'Гагарина, 25');assert.equal(payload.client_status,'Потенциальный');assert.equal(ctx.managerFilter,'all');
});
test('silent GPS refresh cannot open first or previous manager',()=>{
 const source=read('assets/21-gps-control-performance-v2357.js');
 const code=source.match(/function viewerUrl\(id\)[\s\S]*?(?=window.crmOpenGpsViewer)/)[0];
 const opened=[];const window={open:url=>opened.push(url),crmMobileGpsOpenV1:()=>false};
 const ctx={window};vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.openViewer('first-manager',true);assert.equal(opened.length,0);
 ctx.openViewer('chosen-manager');assert.equal(opened.length,1);assert.match(opened[0],/workday=chosen-manager/);
 assert.match(read('assets/26-gps-visit-order-v2364.js'),/if\(!id\|\|silent===true\)return/);
});
test('new server catalog is authorized and routes keep exact physical IDs',()=>{
 const sql=read('supabase/migrations/20261106081021_manager_feedback_routes_kpi_v3.sql');
 assert.match(sql,/auth\.uid\(\) IS NULL OR v_role IS NULL/);
 assert.match(sql,/v_role='boss' OR c.manager_name=v_name/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/p_point_id uuid DEFAULT NULL/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM)\s+public\.(?:gps_track_points|visits|client_purchases)\b/i);
 assert.match(sql,/d.akb::int akb/);
 assert.match(read('assets/03-triovist-routes.js'),/p_point_id:selected.physical_point_id/);
});
