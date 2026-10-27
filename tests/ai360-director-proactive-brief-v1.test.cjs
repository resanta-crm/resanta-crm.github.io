'use strict';
const fs=require('node:fs');const assert=require('node:assert/strict');
const server=fs.readFileSync('supabase/functions/crm-ai360-director-briefing-v1/index.ts','utf8');
const client=fs.readFileSync('assets/142-resanta-ai360-director-proactive-brief-v1.js','utf8');
const core=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const loader=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261027093000_ai360_triovist_brief_v1.sql','utf8');
const today=()=>{const z=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=k=>z.find(x=>x.type===k).value;return g('year')+'-'+g('month')+'-'+g('day')};
const base=server.replace(/^import [^\n]+\n/m,'')
 .replace('let body:any;','let body;')
 .replaceAll('(x:any)','(x)').replaceAll('(a:any,b:any)','(a,b)')
 .replace("req.headers.get('Origin')!:","req.headers.get('Origin'):")
 .replace('const warnings:string[]=[];','const warnings=[];')
 .replace('const items:any[]=[];','const items=[];');
function harness({guest=false,triUnavailable=false,missingOps=false}={}){
 let handler=null,writes=0,calls=[];
 const snapshots={
  sales:{managers:[{manager_name:'Руднев',plan:159000,actual:147329.12,to_plan:11670.88,plan_pct:92.7},
    {manager_name:'Шкуран',plan:153000,actual:49246.28,to_plan:103753.72,plan_pct:32.2}],
    freshness:{report_date:'2026-10-31',last_success_at:'2026-10-26T17:38:53Z'},warnings:[]},
  operations:{period:{as_of:today()},task_summary:{open_tasks:653,overdue_tasks:452},
   debt_summary:{report_date:'2026-10-26'},
   overdue_debtors:[{client_name:'Клиент 1',debt_overdue:25538.23,
    debt_overdue_days:7,manager_name:'Шкуран'}],
   declining_clients:[{client_name:'Клиент 2',manager_name:'Руднев',loss:21602.41,
    open_tasks:0,next_route:null}],route_summary:{planned_next30:138,approved_next30:138},
   warnings:[]},
  triovist:{revenue:440572.14,plan:681000,revenue_positions:438,partner_stock_date:'2026-10-13'}
 };
 const db={
  auth:{getUser:async()=>({data:{user:{id:guest?'other':'544fb1e2-ef70-44de-bc62-e0e1596a4bfc'}}})},
  rpc:async(n)=>{calls.push(n);
   if(n==='crm_ai360_sales_kpi_snapshot_v1')return {data:snapshots.sales};
   if(n==='crm_ai360_operations_snapshot_v1')return missingOps?{error:{message:'down'}}:{data:snapshots.operations};
   if(n==='crm_ai360_triovist_brief_v1')return triUnavailable?{error:{message:'down'}}:{data:snapshots.triovist};
   throw Error('unexpected RPC '+n);
  },
  from(table){
   if(table==='users')return {select(){return this;},eq(){return this;},
     maybeSingle:async()=>({data:{role:'boss',name:'Александр Паюшин'}})};
   if(table!=='tasks')throw Error('unexpected table '+table);
   return {select(n,options){assert.equal(n,'id');assert.equal(options.head,true);return this;},
    or(){return this;},eq(n,v){this.status=v;return this;},lt(){return this;},
    then(resolve,reject){return Promise.resolve({count:this.status==='approved'?17:174,error:null}).then(resolve,reject);}
   };
  }
 };
 const Deno={env:{get:k=>k==='SUPABASE_URL'?'https://fake.supabase.co':k==='SUPABASE_SERVICE_ROLE_KEY'?'fake-secret':null},serve:fn=>handler=fn};
 class FakeResponse{constructor(body,{status=200}={}){this.body=body;this.status=status;}json(){return JSON.parse(this.body||'{}')}}
 new Function('Deno','createClient','Response','Intl','Date',base)(
  Deno,()=>db,FakeResponse,Intl,Date);
 const req=(kind='director_brief')=>({method:'POST',
  headers:{get:k=>k==='Authorization'?'Bearer synthetic':k==='Origin'?'https://resanta-crm.by':null},
  json:async()=>({kind})});
 return {call:async(kind)=>{const r=await handler(req(kind));return {status:r.status,data:r.json()}},calls,writes:()=>writes};
}
(async()=>{
 const a=harness(),r=await a.call();
 assert.equal(r.status,200);
 assert.equal(r.data.cards.length,5,'five domains');
 assert.equal(r.data.cards[0].id,'sales');
 assert.equal(r.data.cards[0].title,'Отставание от плана: Шкуран');
 assert.deepEqual(r.data.cards.map(x=>x.id),['sales','debt','tasks','routes','triovist']);
 assert(r.data.cards[4].fact.includes('681'), 'Triovist confirmed plan visible');
 assert(r.data.cards[4].fact.includes('устарели'), 'stock freshness flagged');
 assert(r.data.cards[2].fact.includes('требуют пересмотра'), 'stale tasks not labelled confirmed failures');
 assert(r.data.warnings.some(x=>x.includes('позже текущего дня')),'future import date warned');
 assert.equal(r.data.mode,'readonly');
 assert.equal(a.writes(),0,'director briefing never writes');
 const withoutTri=await harness({triUnavailable:true}).call();
 assert.equal(withoutTri.status,200);
 assert.equal(withoutTri.data.cards[4].level,'unknown');
 const noSource=await harness({missingOps:true}).call();
 assert.equal(noSource.status,503);
 const guest=await harness({guest:true}).call();
 assert.equal(guest.status,403);
 const invalid=await harness().call('commit');
 assert.equal(invalid.status,400,'cannot abuse as task endpoint');
 assert(!/\.(?:insert|update|upsert|delete)\s*\(/.test(server+client+sql));
 assert(sql.includes('security invoker'));
 assert(sql.includes('revoke all on function')&&sql.includes('grant execute on function'));
 assert(core.indexOf('crmAI360DirectorBriefHandleV1(query')<core.indexOf('crmAI360SalesHandleV1(query'));
 assert(loader.includes('142-resanta-ai360-director-proactive-brief-v1.js'));
 assert(client.includes('director_daily_brief'));
 assert(!client.includes('setTimeout('),'no scheduled auto-messages');
 console.log('Director proactive briefing: 5 real-source domains, stale warnings, owner-only, fail-closed and no writes PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
