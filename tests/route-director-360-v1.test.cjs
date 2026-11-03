/* Regression checks for isolated director Routes 360 presentation module. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../assets/166-route-director-360-v1.js'),'utf8');
function app(role,plans=[],clients=[],tasks=[]){
 let dashboard=null;
 const node=(tag)=>({id:'',dataset:{},style:{},innerHTML:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
 const title={insertAdjacentElement(place,el){dashboard=el;}};
 const classes=new Set(['active']);
 const page={querySelector:k=>k==='.page-title'?title:null,insertAdjacentElement(){},classList:{contains:k=>classes.has(k),add:k=>classes.add(k),toggle:(k,show)=>show?classes.add(k):classes.delete(k)}};
 const document={readyState:'loading',getElementById(id){return id==='page-routes-boss'?page:dashboard?.id===id?dashboard:null;},createElement:node,head:{appendChild(){}},addEventListener(){}};
 const window={addEventListener(){},renderRoutesBoss(){},goPage(){},loadData:async()=>{}};
 const sandbox={window,document,currentProfile:{role},allClients:clients,allTasks:tasks,allRoutePlans:plans,routeManagerNames:()=>['Руднев','Шкуран'],localStorage:{getItem:()=> '2026-11'},setTimeout(){}};
 vm.runInNewContext(src,sandbox,{filename:'route-director-360-v1.js'});
 const api=window.RESANTA_ROUTE_DIRECTOR_360_V1;api.install();
 return{api,get dashboard(){return dashboard},click(action,other={}){const t={dataset:{action,...other}};dashboard.handlers.click({target:{closest:()=>t}})},change(name,value){dashboard.handlers.change({target:{dataset:{change:name},value}})}};
}
const client=(id,manager='Руднев')=>({id,name:'Клиент '+id,manager_name:manager,client_status:'Рабочий'});
const route=(id,clientId,day='2026-11-02',key=id)=>({id,client_id:clientId,manager_name:'Руднев',visit_date:day,physical_point_key:key,approved:true,review_status:'approved'});
test('only director receives dashboard or snapshot',()=>{
 const m=app('manager',[route('r1','c1')],[client('c1')]);
 assert.equal(m.dashboard,null);assert.equal(m.api.snapshot(),null);
 const b=app('boss',[route('r1','c1')],[client('c1')]);
 assert.ok(b.dashboard);assert.equal(b.api.snapshot().percent,100);
});
test('renders the COMPLETE director screen, not just tabs (blank-screen regression)',()=>{
 const d=app('boss',[route('a','c1')],[client('c1')]);
 const html=d.dashboard.innerHTML;
 for(const section of ['class="rd-grid"','Покрытие клиентов','Краткий брифинг','class="rd-cal"','data-action="edit"','data-action="audit"','data-change="manager"','data-change="month"']){
  assert.ok(html.includes(section),'Missing on rendered screen: '+section);
 }
 assert.ok(html.length>5000,'The dashboard markup was truncated to the toolbar');
 assert.ok(!html.includes('</div>+'),'Accidental concatenation operator displayed as text');
});
test('counts monthly physical visits and scheduled calls, never invents coverage',()=>{
 const p=[route('r1','c1'),route('r2','c1','2026-11-02','r1')];
 const c=[client('c1'),client('c2'),client('c3')];
 const t=[{source:'route_call_monthly',client_id:'c2',due_date:'2026-11-30',done:false,review_status:'approved'}];
 const s=app('boss',p,c,t).api.snapshot();
 assert.equal(s.percent,67);assert.equal(s.missing.length,1);
 assert.equal(s.days['2026-11-02'].count,1);assert.equal(s.filled,1);
 assert.equal(s.pending,0);
});
test('counts office day as filled, not as physical visit',()=>{
 const p=[{id:'office',manager_name:'Руднев',visit_date:'2026-11-03',is_office_day:true,approved:true}];
 const s=app('boss',p,[client('c1')]).api.snapshot();
 assert.equal(s.filled,1);assert.equal(s.days['2026-11-03'].count,0);assert.equal(s.missing.length,1);
});
test('detects physical-point limit by distinct point rather than legal-entity rows',()=>{
 const p=Array.from({length:16},(_,i)=>route('r'+i,'c'+i,'2026-11-02','point'+i));
 const s=app('boss',p,Array.from({length:16},(_,i)=>client('c'+i))).api.snapshot();
 assert.equal(s.over,1);assert.equal(s.days['2026-11-02'].count,16);
});
test('week period is an actual date filter, while month remains the planning month',()=>{
 const p=[route('a','a','2026-11-02'),route('b','b','2026-11-23')];
 const ctx=app('boss',p,[client('a'),client('b')]);
 assert.equal(ctx.api.snapshot().percent,100);
 ctx.click('period',{period:'1'});
 const s=ctx.api.snapshot();
 assert.equal(s.r.from,'2026-11-02');assert.equal(s.r.to,'2026-11-08');
 assert.equal(s.percent,50);
});

test('all-managers dashboard keeps independent daily capacity and office-day counts',()=>{
 const p=[
  ...Array.from({length:10},(_,i)=>route('r'+i,'c'+i,'2026-11-02','point'+i)),
  ...Array.from({length:10},(_,i)=>({id:'s'+i,client_id:'z'+i,manager_name:'Шкуран',visit_date:'2026-11-02',physical_point_key:'other'+i,approved:true})),
  {id:'office',manager_name:'Шкуран',visit_date:'2026-11-03',is_office_day:true,approved:true}
 ];
 const c=[...Array.from({length:10},(_,i)=>client('c'+i)),...Array.from({length:10},(_,i)=>client('z'+i,'Шкуран'))];
 const s=app('boss',p,c).api.snapshot();
 assert.equal(s.days['2026-11-02'].count,20);
 assert.equal(s.days['2026-11-02'].maxLoad,10);
 assert.equal(s.over,0); // 20 total across two managers is not over the individual 15-point limit.
 assert.equal(s.filled,3); // Mon: two managers, Tue: office day for one manager.
 assert.equal(s.working,42); // Two managers × 21 weekdays in Nov 2026.
 assert.equal(s.percent,100);
});
test('all-managers view rejects historical rows for managers outside configured field scope',()=>{
 const p=[route('a','c1'),{...route('b','c2'),manager_name:'Чужой'}];
 const s=app('boss',p,[client('c1'),client('c2','Чужой')]).api.snapshot();
 assert.equal(s.scoped.length,1);
 assert.equal(s.percent,100);
});
test('module has no direct Supabase database mutations or GPS writes',()=>{
 assert.doesNotMatch(src,/db\s*\.\s*from\s*\(|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(/);
 assert.match(src,/db\.rpc\('client360_route_labels_v2'\)/); // Read-only scoped lookup is allowed.
});
