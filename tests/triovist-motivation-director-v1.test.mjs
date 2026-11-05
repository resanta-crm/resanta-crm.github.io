import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('assets/175-triovist-motivation-director-v1.js');
const safe=read('assets/104-safe-triovist-v236200.js');
const native=read('assets/173-triovist-native-sections-v1.js');
const loader=read('assets/100-safe-upgrades-loader-v236272.js');
const index=read('index.html');
const original=read('assets/03-triovist-routes.js');
const M=['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'];
const month='2026-11';
const today='2026-11-05';
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();await new Promise(r=>setImmediate(r))};
function mock(role='boss',options={}){
 const profile=role==='boss'?{role:'boss',email:'payushin_ar@resanta.ru'}:
 {role:'manager',access_scope:'triovist',email:M[0]};
 const monthState=new Map();
 const createSnap=m=>({
  end_month:m,items:[
   {manager_email:M[0],current_revenue:m==='2026-11'?10000:0,previous_revenue:50000},
   {manager_email:M[1],current_revenue:m==='2026-11'?8000:0,previous_revenue:40000}
  ],available_months:[m,'2025-'+m.slice(5,7)],selected_month_plans:[],last_import:{month:m},history:{months:18}
 });
 const snapshot=m=>{if(!monthState.has(m))monthState.set(m,createSnap(m));return monthState.get(m)};
 const calls=[],listeners={},planSaves=[],style=[],errors=[];
 let confirmValue=false,failSnapshot=!!options.failSnapshot;
 const body={innerHTML:''};
 const host={dataset:{},classList:{add(){}},querySelector:q=>q==='[data-mbody]'?body:null,addEventListener(name,fn){listeners[name]=fn}};
 const doc={getElementById:id=>id==='page-triovist'?{classList:{contains:v=>v==='active'}}:null,
  querySelector:q=>q==='#tr14-shell [data-tr14].on'?{dataset:{tr14:'motivation'}}:null,
  createElement:()=>({id:'',textContent:''}),head:{appendChild:st=>style.push(st)}};
 const row=(manager,name,reportMonth='2026-11',old=false)=>{
  const A=manager===M[0],value=A?10000:8000;
  return {manager_email:manager,manager_name:name,month:reportMonth,
   fact:old?90000:value,plan:old?80000:0,plan_pct:old?112:0,growth_pct:old?12:-90,task_score:old?100:0,team_pct:old?100:0,
   base_rate:.015,plan_rate:old?.002:0,growth_rate:old?.001:0,task_rate:0,team_rate:0,total_rate:old?.018:.015};
 };
 const compare={month:'2026-11-01',compare_month:'2026-10-01',rows:[
  row(M[0],'Александренко'),row(M[1],'Кришталь'),
  row(M[0],'Александренко','2026-10',true),row(M[1],'Кришталь','2026-10',true)
 ]};
 const w={TODAY:today,currentProfile:profile,confirm:()=>confirmValue,
  db:{rpc:async(name,args)=>{
   calls.push({name,args:JSON.parse(JSON.stringify(args))});
   if(name==='triovist_get_dashboard'){
    if(failSnapshot)return {error:{message:'503 недоступно'}};
    return {data:JSON.parse(JSON.stringify(snapshot(args.p_end_month))),error:null};
   }
   if(name==='triovist_ai_demand_preview_v20261105'){
    return {data:{version:'uni-demand-20261105-v1',month:args.p_month.slice(0,7),sources:{
      history_complete:true,partner_date:'2026-11-04',vitebsk_date:'2026-11-04',chekhov_date:'2026-11-04',
      transit_warning:'Transit not verified'
    },groups:[
     {group:'Инструмент',manager_email:M[0],last_year:235732.57,previous_month:562611.56,season_ratio:0.6,proposed:309334.52,partner_free:200,vitebsk_qty:50,chekhov_qty_reference:100,readiness:'review',action:'Проверить листинг'},
     {group:'Садовая техника',manager_email:M[1],last_year:134711.03,previous_month:235863.98,season_ratio:0.67,proposed:153414.1,partner_free:300,vitebsk_qty:80,chekhov_qty_reference:60,readiness:'review',action:'Проверить листинг'}
    ],managers:[
     {email:M[0],name:'Александренко',suggested:309334.52,last_year:235732.57,previous_month:562611.56,included_groups:9,total_groups:10,requires_review:true},
     {email:M[1],name:'Кришталь',suggested:153414.1,last_year:134711.03,previous_month:235863.98,included_groups:4,total_groups:5,requires_review:true}
    ]},error:null};
   }
   if(name==='triovist_set_plan'){
    planSaves.push(args);
    if(options.failManager&&args.p_manager_email===options.failManager)return {error:{message:'write failed'}};
    const v=snapshot(args.p_period_month);
    v.selected_month_plans=v.selected_month_plans.filter(x=>x.manager_email!==args.p_manager_email);
    v.selected_month_plans.push({manager_email:args.p_manager_email,plan_amount:args.p_plan_amount});
    return {data:{ok:true,period_month:args.p_period_month,manager_email:args.p_manager_email,plan_amount:args.p_plan_amount},error:null};
   }
   throw Error('Unexpected '+name);
  }},
  RESANTA_SAFE_TRIOVIST_V236200:{refresh:async()=>{calls.push({name:'refresh',args:{}})}},
  TRIOVIST_DATA_HUB_V227315:{invalidate:()=>{calls.push({name:'invalidate',args:{}})}}
 };
 vm.runInNewContext(ui,{window:w,document:doc,currentProfile:profile,Date,Number,Set,Map,Intl,console});
 const api=w.RESANTA_TRIOVIST_MOTIVATION_DIRECTOR_V1;
 const fire=(name,selector,data={})=>{
  const t={...data,closest:q=>q===selector?t:null};
  listeners[name]?.({target:t});
 };
 return {w,api,host,body,calls,planSaves,compare,fire,
  updateSnap:(m,manager,amount)=>{
   const x=snapshot(m);x.selected_month_plans=x.selected_month_plans.filter(z=>z.manager_email!==manager);
   x.selected_month_plans.push({manager_email:manager,plan_amount:amount});
  },
  setConfirm:v=>confirmValue=v,
  restoreSnapshot:()=>failSnapshot=false,
  paint:()=>api.paint(host,month,compare),
  style,errors
 };
}
test('UI compiles, keeps original server payroll RPC and never runs heavy parsers or automatic DB writes',()=>{
 assert.doesNotThrow(()=>new vm.Script(ui));
 assert.match(ui,/readOnlyPayroll:true/);
 assert.match(ui,/manualApproval:true,noAutoSave:true/);
 assert.match(ui,/triovist_get_dashboard/);
 assert.match(ui,/triovist_set_plan/);
 assert.match(safe,/triovist_motivation_compare_v236199/);
 assert.match(safe,/RESANTA_TRIOVIST_MOTIVATION_DIRECTOR_V1\?\.paint/);
 assert.match(safe,/Triovist motivation native screen fallback/);
 assert.doesNotMatch(ui,/\.insert\(|\.update\(|\.upsert\(|setInterval\(|MutationObserver|fetch\(/);
 assert.match(original,/window\.triovistSavePlans=async function/);
 assert.match(original,/triovist_set_plan/);
});
test('director screen includes four KPI, explanation, real manager rates and 4 actual components',async()=>{
 const x=mock();assert.equal(x.paint(),true);await tick();
 let h=x.body.innerHTML;
 assert.equal((h.match(/class="trmot-kpi"/g)||[]).length,4);
 assert.match(h,/Базовая ставка/);assert.match(h,/Дополнительный KPI/);
 assert.match(h,/Планы на месяц/);assert.match(h,/Короткий директорский брифинг/);
 assert.match(h,/Александренко/);assert.match(h,/Кришталь/);
 assert.match(h,/−0,30 п.п.|-0,30 п.п./);
 assert.match(h,/Подтверждённые задачи/);assert.match(h,/Рост к прошлому году/);
 assert.match(h,/План не задан/);
 assert.match(h,/trmot-track/);
 assert.match(h,/Продажи: 10[ \u00a0\u202f]?000,00 BYN · план: План не задан/);
});
test('manager sees only self, no AI plan generator, no save, and no other manager fact even if server returned both',async()=>{
 const x=mock('manager');x.paint();await tick();
 const h=x.body.innerHTML;
 assert.match(h,/Александренко/);
 assert.doesNotMatch(h,/Кришталь/);
 assert.doesNotMatch(h,/data-trmot-calc|data-trmot-save|data-trmot-input/);
 assert.equal(x.calls.filter(r=>r.name==='triovist_set_plan').length,0);
});
test('new evidence formula uses only audited seasonal and stock-backed monthly preview, not +30% legacy',()=>{
 const x=mock();
 const base={version:'uni-demand-20261105-v1',sources:{history_complete:true},managers:[
  {email:M[0],suggested:309334.52,last_year:235732.57,previous_month:562611.56,included_groups:9,total_groups:10},
  {email:M[1],suggested:153414.1,last_year:134711.03,previous_month:235863.98,included_groups:4,total_groups:5}
 ],groups:[]};
 const a=x.api.forecast(base,month,M[0]),k=x.api.forecast(base,month,M[1]);
 assert.equal(a.amount,309334.52);assert.equal(k.amount,153414.1);
 assert.equal(a.prior,235732.57);assert.equal(a.previousMonth,562611.56);
 assert.equal(k.growth,0.15);
 assert.equal(x.api.forecast({...base,sources:{history_complete:false}},month,M[0]),null);
});
test('AI button produces drafts only after explicit second click; without user approval nothing is written',async()=>{
 const x=mock();x.paint();await tick();
 x.fire('click','[data-trmot-calc]');await tick();
 assert.equal(x.calls.filter(c=>c.name==='triovist_set_plan').length,0);
 assert.match(x.body.innerHTML,/309[ \u00a0\u202f]?334,52 BYN/);
 assert.match(x.body.innerHTML,/153[ \u00a0\u202f]?414,10 BYN/);
 x.fire('click','[data-trmot-use]');await tick();
 assert.match(x.body.innerHTML,/value="309334\.52"/);
 assert.match(x.body.innerHTML,/value="153414\.10"/);
 assert.equal(x.planSaves.length,0);
});
test('save requires confirm, uses exact target period and original protected RPC; after confirmation saved values refresh',async()=>{
 const x=mock();x.paint();await tick();
 x.fire('click','[data-trmot-calc]');await tick();
 x.fire('click','[data-trmot-use]');
 x.fire('click','[data-trmot-save]');await tick();
 assert.equal(x.planSaves.length,0,'no write without user confirm');
 x.setConfirm(true);
 x.fire('click','[data-trmot-save]');await tick();
 assert.equal(x.planSaves.length,2);
 assert.deepEqual(x.planSaves.map(z=>z.p_manager_email),M);
 assert.deepEqual(x.planSaves.map(z=>z.p_period_month),['2026-11','2026-11']);
 assert.deepEqual(x.planSaves.map(z=>z.p_plan_amount),[309334.52,153414.1]);
 assert.ok(x.calls.some(z=>z.name==='refresh'));
});
test('save detects concurrent plan overwrite and never writes stale recommendations',async()=>{
 const x=mock();x.paint();await tick();
 x.fire('click','[data-trmot-calc]');await tick();
 x.fire('click','[data-trmot-use]');
 x.updateSnap('2026-11',M[0],90000);
 x.setConfirm(true);
 x.fire('click','[data-trmot-save]');await tick();
 assert.equal(x.planSaves.length,0);
 assert.match(x.body.innerHTML,/изменился другим пользователем/);
});
test('partial save failure is surfaced, never claimed as both saved',async()=>{
 const x=mock('boss',{failManager:M[1]});x.paint();await tick();
 x.fire('click','[data-trmot-calc]');await tick();
 x.fire('click','[data-trmot-use]');
 x.setConfirm(true);
 x.fire('click','[data-trmot-save]');await tick();
 assert.equal(x.planSaves.length,2);
 assert.match(x.body.innerHTML,/Частично сохранено/);
 assert.doesNotMatch(x.body.innerHTML,/Планы подтверждены/);
});
test('no retry storm on a failed plan read and button explicitly retries',async()=>{
 const x=mock('boss',{failSnapshot:true});x.paint();await tick();
 assert.equal(x.calls.filter(z=>z.name==='triovist_get_dashboard').length,1);
 assert.match(x.body.innerHTML,/Ошибка загрузки/);
 x.restoreSnapshot();
 x.fire('click','[data-trmot-retry]');await tick();
 assert.equal(x.calls.filter(z=>z.name==='triovist_get_dashboard').length,2);
 assert.match(x.body.innerHTML,/Данные проверены/);
});
test('manager isolation, no backdating, clear percentage points, correct source and cache versions',()=>{
 const x=mock();
 assert.equal(x.api.parseAmount('100 000,25'),100000.25);
 assert.equal(x.api.parseAmount('-1'),null);
 assert.equal(x.api.parseAmount('100000,255'),null);
 assert.equal(x.api.parseAmount('0'),null);
 assert.match(ui,/planMonth<currentMonth\(\)/);
 assert.match(native,/if\(k==='groups'\|\|k==='stock'\|\|k==='tasks'\|\|k==='motivation'\)return false/);
 assert.match(loader,/20261105-motivation-director-1/);
 assert.match(index,/175-triovist-motivation-director-v1\.js\?v=20261105-uni-demand-v2/);
 assert.match(index,/173-triovist-native-sections-v1\.js\?v=20261105-motivation-director-1/);
});
