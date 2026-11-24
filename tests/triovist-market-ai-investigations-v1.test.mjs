import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const get=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const edge=get('supabase/functions/triovist-market-investigate-v1/index.ts');
const ui=get('assets/266-triovist-market-ai-investigations-v1.js');
const index=get('index.html');
const sql=get('supabase/migrations/20261111134000_triovist_market_ai_investigations_v1.sql');
const action=get('.github/workflows/triovist-market-ai-investigations.yml');

test('new UI and isolated Edge source parse; no direct mutations to competitor parser',()=>{
 assert.doesNotThrow(()=>new vm.Script(ui));
 assert.doesNotThrow(()=>new vm.Script(edge.replace(/^import .*;$/m,'')));
 assert.match(index,/266-triovist-market-ai-investigations-v1\.js\?v=20261124-competitors-ai-work1/);
 assert.match(ui,/#tr14-panel \[data-tm266-container\]\[open\] \[data-tm266\]/);
 assert.match(ui,/document\.addEventListener\('toggle'/);
 assert.doesNotMatch(ui,/\b(?:delete from|alter table|update public\.triovist_market|insert into public\.triovist_market)/i);
});
test('all market scopes are discovered dynamically: no two-category pilot',()=>{
 assert.match(edge,/triovist_market_dashboard_meta_cache_v236357/);
 assert.match(edge,/m\.scopes\.map/);
 assert.match(edge,/scopes_total:groups\.length/);
 assert.match(edge,/triovist_21vek_position_metrics_v236351/);
 assert.match(edge,/triovist_market_comp_position_current_v236352/);
 assert.match(ui,/Все подключённые подгруппы/);
 assert.match(ui,/Групп с сигналами/);
 assert.doesNotMatch(edge,/const (?:ACTIVE|ENABLED|PILOT)_SCOPES\s*=/);
});
test('significance is based on actual ranking changes, not a made-up position',()=>{
 const start=edge.indexOf('function signal(s){');
 const end=edge.indexOf('async function feed(',start);
 const code=edge.slice(start,end);
 const ctx={num:x=>x===null||x===undefined||x===''?null:Number(x)};
 vm.runInNewContext(code+';this.signal=signal;',ctx);
 const fall=ctx.signal({kind:'own',movement:'down',previous_position:25,position:37});
 assert.equal(fall.delta,-12);
 assert.ok(fall.priority>0);
 assert.equal(ctx.signal({kind:'own',movement:'down',previous_position:25,position:27}),null);
 const grow=ctx.signal({kind:'competitor',movement:'up',previous_position:85,position:64});
 assert.equal(grow.delta,21);
 assert.equal(ctx.signal({kind:'competitor',movement:'up',previous_position:85,position:82}),null);
 assert.equal(ctx.signal({kind:'competitor',movement:'outside',previous_position:null,position:null}),null);
});
test('only named live CRM accounts can access service; service key only as cron',()=>{
 assert.match(edge,/svc\.auth\.getUser\(token\)/);
 assert.match(edge,/\.from\("users"\)\.select\("id,email,role,access_scope"\)/);
 assert.match(edge,/prof\.role==="boss"/);
 assert.match(edge,/prof\.access_scope==="triovist"/);
 assert.match(edge,/body\.action==="daily" && key && token===key && !origin/);
 assert.match(edge,/if\(actor\.cron&&body\.action!=="daily"\)/);
 assert.match(edge,/if\(!actor\.leader\)throw fail\("director_only",403\)/);
 assert.match(edge,/item\.manager_email!==actor\.email/);
 assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY/);
});
test('AI uses grounded server-fetched evidence, never browser supplied facts',()=>{
 assert.match(edge,/async function itemEvidence\(svc,scope,kind,key\)/);
 assert.match(edge,/triovist_market_own_position_snapshots_v1/);
 assert.match(edge,/triovist_market_comp_position_snapshots_v236352/);
 assert.match(edge,/triovist_content_cards/);
 assert.match(edge,/Source|source/i);
 assert.match(edge,/Причинность НЕ следует из корреляции/);
 assert.match(edge,/Никаких выдуманных цифр/);
 assert.match(ui,/не доказывает причинность/);
 assert.match(edge,/заявление, не доказательство/);
});
test('AI calls are budgeted, shared with Lera and cached by day',()=>{
 assert.match(edge,/MAX_DAILY_AI=24,MAX_CRON_AI=6/);
 assert.match(edge,/crm_ai360_core_claim_v2/);
 assert.match(edge,/crm_ai360_core_finish_v2/);
 assert.match(edge,/p_reserve_rub:4/);
 assert.match(edge,/if\(existing\.ai_status==="ready"\)/);
 assert.match(sql,/unique \(snapshot_day,scope_key,kind,entity_key\)/);
 assert.match(action,/cron: '35 6 \* \* \*'/);
 assert.match(action,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
 assert.match(action,/SUPABASE_KEY: \$\{\{ secrets\.SUPABASE_KEY \}\}/);
});
test('recorded answers preserve their provenance; checks require a fresh observation',()=>{
 assert.match(edge,/manager_answer_at/);
 assert.match(edge,/manager_source/);
 assert.match(edge,/director_reviewed_at/);
 assert.match(edge,/checked_3d_position/);
 assert.match(edge,/checked_7d_position/);
 assert.match(edge,/Date\.parse\(cur\.data\.observed_at\)<Date\.parse\(row\.created_at\)\+3\*864e5/);
 assert.doesNotMatch(ui,/Источник проверки|Утвердить действие/);
 assert.match(ui,/Ждём свежий снимок 21vek/);
 assert.match(ui,/Результат подтверждён снимком/);
 assert.match(edge,/latest_full_parser/);
});
test('new tables are RLS protected, inaccessible directly to public/anon/authenticated',()=>{
 assert.match(sql,/alter table public\.triovist_market_ai_investigations_v1 enable row level security/);
 assert.match(sql,/alter table public\.triovist_market_ai_daily_runs_v1 enable row level security/);
 assert.match(sql,/revoke all on public\.triovist_market_ai_investigations_v1 from public,anon,authenticated/);
 assert.match(sql,/revoke all on public\.triovist_market_ai_daily_runs_v1 from public,anon,authenticated/);
 assert.doesNotMatch(sql,/alter table public\.(?!triovist_market_ai_)/i);
});

test('AI investigation rejects missing, unchanged and incomparable rank history before charging budget',()=>{
 assert.match(edge,/if\(before===null\|\|after===null\|\|Math\.abs\(before-after\)<\(kind==="own"\?7:12\)\)/);
 assert.match(edge,/throw fail\("insufficient_rank_evidence",422\)/);
 assert.match(edge,/observations\.length<2/);
 assert.match(edge,/throw fail\("rank_history_not_comparable",422\)/);
 const proof=edge.indexOf('const evidence=await itemEvidence(svc,scope,kind,key);');
 const claim=edge.indexOf('const ai=await llm(svc,actor.id');
 assert.ok(proof>=0 && claim>proof,'the server must verify evidence before calling AI');
 assert.match(edge,/triovist_market_own_position_snapshots_v1/);
 assert.match(edge,/history=new Map\(\)/);
 assert.match(ui,/По этому товару пока нет двух сопоставимых подтверждённых позиций/);
});

test('pilot and original CRM pass only their own preflight, and feed still requires a user token',async()=>{
 let handle;
 const ctx={Deno:{serve:fn=>{handle=fn},env:{get:()=>'fixture'}},Request,Response,createClient:()=>({}),console:{error(){}}};
 vm.runInNewContext(edge.replace(/^import .*;$/m,''),ctx);
 const pilot='https://resanta-director-pilot-20261119.wigglybean257.chatgpt.site';
 for(const origin of [pilot,'https://resanta-crm.by','https://www.resanta-crm.by']){
  const preflight=await handle(new Request('https://fixture.example',{method:'OPTIONS',headers:{Origin:origin}}));
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
 }
 const denied='https://unrelated.example';
 const preflight=await handle(new Request('https://fixture.example',{method:'OPTIONS',headers:{Origin:denied}}));
 assert.equal(preflight.status,403);
 assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),null);
 const feed=await handle(new Request('https://fixture.example',{method:'POST',headers:{Origin:pilot},body:JSON.stringify({action:'feed'})}));
 assert.equal(feed.status,401);
 assert.equal((await feed.json()).error,'not_authorized');
});

test('own SKU feed selects our signals before the per-group limit',async()=>{
 const seen=[];
 const start=edge.indexOf('function signal(s){');
 const end=edge.indexOf('async function itemEvidence(',start);
 const scope='wrench', observed='2026-11-23T09:00:00Z';
 const ctx={
  Date,S:String,clip:String,MAX_DAILY_AI:24,MAX_CRON_AI:6,
  num:x=>x==null?null:Number(x),
  meta:async()=>({scopes:[{scope_key:scope,subgroup:'Гайковёрты'}]}),
  page:async(_svc,table)=>{
   seen.push(table);
   if(table.includes('metrics'))return [{sku:'74/3/100',manager_email:'manager',product_name:'Наш гайковёрт'}];
   if(table.includes('own_positions'))return [{scope_key:scope,sku:'74/3/100',position:23}];
   if(table.includes('own_position_snapshots'))return [
    {scope_key:scope,sku:'74/3/100',position:23,observed_at:observed},
    {scope_key:scope,sku:'74/3/100',position:12,observed_at:'2026-11-22T09:00:00Z'}
   ];
   return Array.from({length:4},(_,i)=>({scope_key:scope,product_key:'foreign-'+i,position:5,previous_position:110-i,movement:'up',observed_at:observed}));
  }
 };
 vm.runInNewContext(edge.slice(start,end)+';globalThis.feed=feed;',ctx);
 const own=await ctx.feed({},'own');
 assert.equal(own.signals_total,1);
 assert.equal(own.groups[0].signals,1);
 assert.equal(own.cases[0].entity_key,'74/3/100');
 assert.equal(own.cases[0].kind,'own');
 assert.equal(seen.some(x=>x.includes('comp_position')),false);
 assert.equal((await ctx.feed({},'own','another-manager')).signals_total,0);
 assert.equal((await ctx.feed({},'own','manager')).signals_total,1);
 const legacy=await ctx.feed({});
 assert.equal(legacy.cases.length,3);
 assert.ok(legacy.cases.every(x=>x.kind==='competitor'));
 assert.match(edge,/if\(kind==="own"\)q=q\.eq\("kind","own"\)/);
 assert.match(ui,/call\(\{action:'feed',kind:'own'\}\)/);
 assert.match(ui,/action:'investigate',entity_key:pick\.dataset\.tm266Investigate,kind:'own'/);
});

test('an assigned manager reply is saved before assessment, reused unchanged, and can be retried after failure',async()=>{
 const first={
  id:'id',kind:'own',entity_key:'68/3/52',title:'Насос',manager_email:'manager',updated_at:'before',
  status:'research',position_before:24,position_at_start:78,
  evidence:{current:{price:299},history:[{position:24},{position:78}]},
  ai_result:{manager_question:'Изменилось ли наличие?'}
 };
 let row=structuredClone(first),calls=0,unavailable=false,run=0;
 const svc={from:()=>({
  update(patch){
   const predicates=[];
   return {
    eq(field,value){predicates.push([field,value]);return this},
    select(){return this},
    async maybeSingle(){
     const fields={...row,'evidence->manager_reply_review->>run_id':row.evidence.manager_reply_review?.run_id};
     if(predicates.some(([field,value])=>fields[field]!==value))return {data:null};
     row={...row,...structuredClone(patch)};
     return {data:structuredClone(row)};
    }
   };
  }
 })};
 const ctx={U:'investigations',REPLY_LEASE_MS:90_000,DAY_MS:86400000,S:x=>String(x??'').trim(),clip:(x,n)=>String(x??'').trim().slice(0,n),
  crypto:{randomUUID:()=>String(++run)},check:res=>res.data,fail:code=>Error(code),
  llm:async(_svc,id,input,isAnswer)=>{
   calls++;
   assert.equal(id,'manager-id');
   assert.equal(isAnswer,true);
   if(input.manager_reply.answer!=='Пробный ответ'){
    assert.equal(row.manager_answer,input.manager_reply.answer);
    assert.equal(row.manager_source,input.manager_reply.source??null);
    assert.equal(row.evidence.manager_reply_review.status,'pending');
   }
   assert.equal(input.history[1].position,78);
   return unavailable?{error:'ai_unavailable'}:{result:{assessment:'Проверить наличие',task:{
    action:'Проверить поставку насоса 68/3/52 на 21vek',result:'Товар вновь доступен на 21vek',metric:'availability'
   }}};
  }
 };
 const context=edge.slice(edge.indexOf('function replyContext('),edge.indexOf('async function fullParserRun('));
 const start=edge.indexOf('function workFromTask(');
 vm.runInNewContext(context+'async function liveReplyContext(_svc,item,answer,source){return replyContext(item,answer,source)}'
  +edge.slice(start,edge.indexOf('function queueEntry(',start))+';globalThis.assess=assessManagerReply;',ctx);
 const actor={id:'manager-id',email:'manager',leader:false};
 const answer={action:'answer',answer:'Не было в наличии'};
 await assert.rejects(ctx.assess(svc,{...actor,email:'other'},row,answer),/not_assigned/);
 const trial=await ctx.assess(svc,actor,row,{action:'preview_answer',answer:'Пробный ответ'});
 assert.equal(trial.preview.task.metric,'availability');
 assert.deepEqual(row,first);
 assert.equal(calls,1);
 const completed=await ctx.assess(svc,actor,row,answer);
 assert.equal(completed.case.status,'manager_answered');
 assert.equal(completed.case.ai_result.manager_question,'Изменилось ли наличие?');
 assert.equal(completed.case.evidence.current.price,299);
 assert.equal(completed.case.evidence.market_work.status,'queued');
 assert.match(completed.case.evidence.market_work.action,/68\/3\/52/);
 assert.equal(completed.case.manager_source,null);
 await ctx.assess(svc,actor,row,answer);
 assert.equal(calls,2);
 unavailable=true;
 const updated={...answer,answer:'Проверены остаток и цена сегодня'};
 const failed=await ctx.assess(svc,actor,row,updated);
 assert.equal(failed.case.manager_answer,updated.answer);
 assert.equal(failed.case.evidence.manager_reply_review.status,'unavailable');
 await ctx.assess(svc,actor,row,updated);
 assert.equal(calls,3);
 unavailable=false;
 const retried=await ctx.assess(svc,actor,row,{action:'analyze_answer'});
 assert.equal(retried.case.manager_answer_at,failed.case.manager_answer_at);
 assert.equal(retried.case.evidence.manager_reply_review.status,'ready');
 assert.equal(calls,4);
 assert.equal(retried.case.evidence.work_history.length,1);
});

test('queue distinguishes unanswered cases, new work and overdue work without counting a verified result',()=>{
 const ctx={DAY_MS:86400000};
 vm.runInNewContext(edge.slice(edge.indexOf('function queueEntry('),edge.indexOf('async function workQueue('))+';globalThis.queueEntry=queueEntry;',ctx);
 const item={id:'case',title:'Насос',entity_key:'68/3/52',manager_email:'manager',created_at:'2026-11-22T12:00:00Z'};
 const now=Date.parse('2026-11-24T12:00:00Z');
 assert.equal(ctx.queueEntry(item,now).stage,'awaiting_reply');
 assert.equal(ctx.queueEntry(item,now).overdue,true);
 item.manager_answer='Проверил поставку';
 item.evidence={market_work:{status:'queued',due_at:'2026-11-25T12:00:00Z'}};
 assert.equal(ctx.queueEntry(item,now).stage,'awaiting_take');
 assert.equal(ctx.queueEntry(item,now).overdue,false);
 item.evidence.market_work={status:'verified',due_at:'2026-11-23T12:00:00Z'};
 assert.equal(ctx.queueEntry(item,now).overdue,false);
});

test('work verification distinguishes a fresh SKU observation from a manager report and handles rank and availability separately',async()=>{
 let stock={in_stock:false,observed_at:'2026-11-24T10:00:00Z'};
 let rank={position:33,observed_at:'2026-11-24T10:01:00Z'};
 const ctx={num:x=>x==null?null:Number(x),fullParserRun:async()=>'run',parserStock:async()=>stock};
 const svc={from:()=>({select(){return this},eq(){return this},async maybeSingle(){return {data:rank}}})};
 vm.runInNewContext(edge.slice(edge.indexOf('async function observeWork('),edge.indexOf('async function workAction('))+';globalThis.observe=observeWork;',ctx);
 const item={entity_key:'68/3/52',scope_key:'pumps'};
 let work={metric:'availability',taken_at:'2026-11-24T09:00:00Z'};
 assert.equal((await ctx.observe(svc,item,work)).state,'not_met');
 stock={...stock,in_stock:true};
 assert.equal((await ctx.observe(svc,item,work)).state,'verified');
 stock={...stock,observed_at:'2026-11-24T08:00:00Z'};
 assert.equal((await ctx.observe(svc,item,work)).state,'waiting');
 work={...work,metric:'rank',baseline_rank:78};
 assert.equal((await ctx.observe(svc,item,work)).state,'verified');
 rank={...rank,position:null};
 assert.equal((await ctx.observe(svc,item,work)).state,'waiting');
 assert.equal((await ctx.observe(svc,item,{...work,metric:'manual'})).state,'waiting');
});
