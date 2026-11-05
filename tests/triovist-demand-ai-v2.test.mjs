import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('assets/179-triovist-demand-ai-v1.js');
const month=new Date().toISOString().slice(0,7);
const MANAGERS=['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'];
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();await new Promise(r=>setImmediate(r))};
function fixture(role='boss'){
 let root=null,confirmation=false,rerendered=0;
 const listeners={};const calls=[];let monthTasks=0;
 const manager=role==='boss'?{role:'boss',email:'payushin_ar@resanta.ru'}:
  {role:'manager',access_scope:'triovist',email:MANAGERS[0]};
 const container={prepend(n){root=n},style:{},dataset:{}};
 const page={classList:{contains:k=>k==='active'}};
 const d={
  getElementById:id=>id==='tri-task-card'?container:id==='page-triovist'?page:id==='tri-ai179'?root:null,
  createElement:tag=>({tag,isConnected:true,style:{},innerHTML:'',dataset:{},setAttribute(){},id:''}),
  head:{appendChild(){}},
  querySelector:s=>s==='#tr14-shell [data-tr14="tasks"]'?{classList:{contains:k=>k==='on'}}:null,
  addEventListener:(type,fn)=>{listeners[type]=fn},
  readyState:'complete',hidden:false
 };
 const groups=[
  {manager_email:MANAGERS[0],group:'Климатическое оборудование',proposed:309334.52,
   last_year:235732.57,previous_month:562611.56,season_ratio:.25,
   readiness:'review',action:'Проверить листинг'},
  {manager_email:MANAGERS[1],group:'Садовая техника',proposed:153414.10,
   last_year:134711.03,previous_month:235863.98,season_ratio:.67,
   readiness:'review',action:'Проверить листинг'}
 ];
 const data={version:'uni-demand-20261105-v1',month,sources:{partner_date:month+'-04',
  vitebsk_date:month+'-04',chekhov_date:month+'-04',transit_warning:'not verified'},
  managers:[
   {email:MANAGERS[0],name:'Александренко',suggested:309334.52,last_year:235732.57,previous_month:562611.56,included_groups:9,total_groups:10,requires_review:true},
   {email:MANAGERS[1],name:'Кришталь',suggested:153414.10,last_year:134711.03,previous_month:235863.98,included_groups:4,total_groups:5,requires_review:true}
  ],groups};
 const stock={items:[
  {sku:'67/4/8',product:'Конвектор',assigned_group:'Климатическое оборудование',
   manager_email:MANAGERS[0],sales_90:483,partner_free:213,own_qty:45,chekhov_qty:100,recommended:10},
  {sku:'70/1/1',product:'Садовое',assigned_group:'Садовая техника',
   manager_email:MANAGERS[1],sales_90:37,partner_free:0,own_qty:20,chekhov_qty:50,recommended:10},
  {sku:'900/1/1',product:'Excluded',assigned_group:'Садовая техника',
   manager_email:MANAGERS[1],sales_90:120,partner_free:10,own_qty:100,recommended:10}
 ]};
 const w={currentProfile:manager,confirm:()=>confirmation,
  db:{rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='triovist_ai_demand_preview_v20261105')return {data};
   if(name==='triovist_get_stock_dashboard')return {data:stock};
   if(name==='triovist_ai_task_draft_v20261105')return {data:{ok:true,created:true,status:'pending_approval',id:'test-id'}};
   throw Error('Unexpected RPC '+name);
  }},
  TRIOVIST_DATA_HUB_V227315:{invalidate(){}},
  RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651:{async render(){monthTasks++}},
  RESANTA_TRIOVIST_TASKS360_V1:{enhance(){rerendered++}}
 };
 vm.runInNewContext(code,{window:w,document:d,Date,Set,Map,JSON,Number,Math,Intl,
  setTimeout:fn=>fn(),console});
 return {w,d,calls,groups,stock,api:w.RESANTA_TRIOVIST_DEMAND_AI_V1,root:()=>root,
  confirm:v=>confirmation=v,fire:(selector,data={})=>{
   const t={dataset:data,closest:s=>s===selector?t:null};
   listeners.click?.({target:t});
  },get monthTasks(){return monthTasks},get rerendered(){return rerendered}};
}
test('new UI parses and never uses the retired random-quantity generator',()=>{
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.doesNotMatch(code,/triovist_tasks_generate_subgroup|triovist_tasks_generate_monthly|8\s*\/\s*10\s*\/\s*12\s*\/\s*15\s*задач/);
 assert.match(code,/triovist_ai_demand_preview_v20261105/);
 assert.match(code,/triovist_ai_task_draft_v20261105/);
 assert.doesNotMatch(code,/setInterval\(|location\.reload\(/);
});
test('all owned groups calculated from RPC, no task side effects after loading and no group 900',async()=>{
 const f=fixture();await f.api.open();
 assert.match(f.root().innerHTML,/309/);
 assert.match(f.root().innerHTML,/153/);
 assert.match(f.root().innerHTML,/\+15%/);
 assert.doesNotMatch(f.root().innerHTML,/900\/1\/1|Excluded/);
 assert.equal(f.calls.filter(z=>z.name==='triovist_ai_task_draft_v20261105').length,0);
 assert.equal(f.calls.filter(z=>z.name==='triovist_get_stock_dashboard').length,1);
 assert.equal(f.api.pickCandidates(f.stock.items,f.groups).length,2);
});
test('manager only sees own plan even if RPC accidentally returns both managers',async()=>{
 const f=fixture('manager');await f.api.open();
 assert.match(f.root().innerHTML,/Александренко/);
 assert.doesNotMatch(f.root().innerHTML,/Кришталь|Садовая техника|data-ai179-draft/);
 assert.equal(f.calls.filter(x=>x.name==='triovist_ai_task_draft_v20261105').length,0);
});
test('explicit leader confirmation required to create individual pending-approval task',async()=>{
 const f=fixture();await f.api.open();
 f.fire('[data-ai179-draft]',{ai179Draft:'67/4/8',ai179Manager:MANAGERS[0],ai179Action:'listing_review'});
 await tick();
 assert.equal(f.calls.filter(x=>x.name==='triovist_ai_task_draft_v20261105').length,0);
 f.confirm(true);
 f.fire('[data-ai179-draft]',{ai179Draft:'67/4/8',ai179Manager:MANAGERS[0],ai179Action:'listing_review'});
 await tick();
 const calls=f.calls.filter(x=>x.name==='triovist_ai_task_draft_v20261105');
 assert.equal(calls.length,1);
 assert.equal(calls[0].args.p_sku,'67/4/8');
 assert.equal(calls[0].args.p_action,'listing_review');
 assert.equal(f.monthTasks,1);
});
test('source and root keep budget content and approval UX separate',()=>{
 const index=read('index.html'),root=read('assets/34-triovist-root-v23614.js');
 assert.match(index,/179-triovist-demand-ai-v1\.js\?v=20261105-uni-demand-v2/);
 assert.match(index,/175-triovist-motivation-director-v1\.js\?v=20261105-uni-demand-v2/);
 assert.match(root,/RESANTA_TRIOVIST_DEMAND_AI_V1\?\.open/);
 assert.match(root,/function resumeView/);
 assert.match(root,/readOnlyResume:true,resumeView/);
 assert.match(read('assets/178-crm-view-resume-v1.js'),/if\(hidden\)w\.RESANTA_TRIOVIST_ROOT_V23614\?\.resumeView\?\.\(\)/);
});
