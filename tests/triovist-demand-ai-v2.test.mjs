import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('assets/179-triovist-demand-ai-v1.js');
const A='aleksandrenko_av@resanta.ru',K='krishtal_na@resanta.ru';
const m=()=>{const t=new Date();return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')};
const proposal=(email,subgroup)=>({
 manager_email:email,manager_name:email===A?'Александренко':'Кришталь',
 group:'Инструмент Ресанта',subgroup,
 sales_previous_year:44647.49,sales_current_year:27514.09,loss:17133.40,
 change_pct:-38.4,analogous_month_last_year:3751.06,suggested_target:4300,
 sku_count:10,partner_free:13,vitebsk_qty:30,chekhov_reference:2689,
 positions_known:6,rank_unknown:4,outside_top60:0,card_issues:1,priority_rank:11,
 target_note:'Аналогичный месяц прошлого года ×1,15',
 listing_skus:[{sku:'75/3/1',position:8,listing_state:'current_confirmed'}, {sku:'75/3/5',position:null,listing_state:'out_of_stock',position_last_exact:11,position_last_seen:'2026-10-20T08:42:57+00:00'}]
});
const managers=[
 {email:A,name:'Александренко',active_tasks:0,declining_subgroups:66,offered:30},
 {email:K,name:'Кришталь',active_tasks:0,declining_subgroups:15,offered:15}
];
function fixture({email='payushin_ar@resanta.ru',role='boss',confirm=false,oversized=false}={}){
 let node=null,confirmed=confirm,refreshCount=0; const confirmations=[];
 const handlers={},rpcCalls=[];
 const parent={prepend(e){node=e}};
 const doc={
  getElementById(id){if(id==='page-triovist')return{classList:{contains:()=>true}};
   if(id==='tri-task-card')return parent;if(id==='tri-ai179')return node;return null},
  createElement(tag){return {tag,id:'',style:{},innerHTML:'',setAttribute(){}}},
  head:{appendChild(){}},
  querySelector(q){if(q==='#tr14-shell [data-tr14="tasks"]')return{classList:{contains:()=>true}};return null},
  addEventListener(type,fn){(handlers[type]??=[]).push(fn)}
 };
 const preview={
  version:'uni-brainstorm-subgroup-v2',month:m(),
  timeframe:{current_start:'2026-01-01',current_end:'2026-10-31',
   last_year_start:'2025-01-01',last_year_end:'2025-10-31'},
  quality:{complete:true,partner_date:'2026-11-04',vitebsk_date:'2026-11-04',
    chekhov_date:'2026-11-04',transit_note:'Не прибавлять в пути'},
  managers,proposals:[proposal(A,'Перфораторы Ресанта'),proposal(K,'Мойки высокого давления')]
 };
 if(oversized)preview.proposals=Array.from({length:31},(_,i)=>proposal(A,'Подгруппа '+i));
 const w={
  currentProfile:{role,email,access_scope:role==='boss'?'all':'triovist'},
  confirm:(text)=>{confirmations.push(text);return confirmed;}, 
  RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651:{getMonth:m,async render(){refreshCount++}},
  RESANTA_TRIOVIST_TASKS360_V1:{enhance(){}},
  TRIOVIST_DATA_HUB_V227315:{invalidate(){}},
  db:{rpc:async(name,args)=>{
   rpcCalls.push({name,args});
   if(name==='triovist_ai_brainstorm_preview_v20261105')return{data:preview,error:null};
   if(name==='triovist_ai_brainstorm_approve_v20261105')return{data:{ok:true,status:'new',approved:true},error:null};
   throw Error('Unexpected RPC '+name);
  }}
 };
 vm.runInNewContext(src,{window:w,document:doc,Date,Math,Set,Map,Number,Intl,
  setTimeout:fn=>fn(),console});
 const api=w.RESANTA_TRIOVIST_DEMAND_AI_V1;
 function click(selector,dataset={}){
  const target={dataset,closest(sel){
   if(sel==='#tri-ai179')return {};
   return sel===selector?target:null;
  }};
  for(const fn of handlers.click||[])fn({target});
 }
 function input(field,k,value){
  const target={value,dataset:{abField:field},
   closest(sel){return sel==='#tri-ai179'?{}:sel==='[data-ab-card]'?{dataset:{abCard:k}}:null},
   matches(sel){return sel==='[data-ab-field]'}
  };
  for(const fn of handlers.input||[])fn({target});
 }
 return {api,w,doc,rpcCalls,click,input,node:()=>node,setConfirm:x=>confirmed=x,
  refreshCount:()=>refreshCount,preview,confirmations};
}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();await new Promise(r=>setImmediate(r))};

test('browser module parses, cannot generate on open and has no SKU-level API',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.doesNotMatch(src,/triovist_ai_task_draft_v20261105|triovist_tasks_generate_subgroup_v236254/);
 assert.match(src,/triovist_ai_brainstorm_preview_v20261105/);
 assert.match(src,/triovist_ai_brainstorm_approve_v20261105/);
 assert.match(src,/onlyPayushinApproves:true/);
 assert.doesNotMatch(src,/setInterval\(|location\.reload\(/);
 const f=fixture();assert.equal(f.api.open(),true);assert.equal(f.rpcCalls.length,0);
 assert.match(f.node().innerHTML,/Сформировать задачи ИИ/);
});
test('explicit brainstorm proposes only declining subgroups and no DB writes',async()=>{
 const f=fixture();await f.api.brainstorm();
 assert.equal(f.rpcCalls.length,1);
 assert.equal(f.rpcCalls[0].name,'triovist_ai_brainstorm_preview_v20261105');
 assert.match(f.node().innerHTML,/Перфораторы Ресанта/);
 assert.match(f.node().innerHTML,/44[\s\u00a0\u202f]?647,49 BYN/);
 assert.match(f.node().innerHTML,/27[\s\u00a0\u202f]?514,09 BYN/);
 assert.match(f.node().innerHTML,/Подтверждённые позиции/);assert.match(f.node().innerHTML,/21vek: нет в наличии/);assert.match(f.node().innerHTML,/ранее №11/);
 assert.doesNotMatch(f.node().innerHTML,/создано задач: 30/);
});
test('authorisation: managers and the other boss do not see brainstorm or call RPC',async()=>{
 for(const a of [{role:'manager',email:A},{role:'boss',email:'sidarovich_kn@resanta.ru'}]){
  const f=fixture(a);assert.equal(f.api.open(),false);assert.equal(await f.api.brainstorm(),false);
  assert.equal(f.rpcCalls.length,0);
 }
});
test('server limit of max 30 per manager is checked on preview response',async()=>{
 const f=fixture({oversized:true});assert.equal(await f.api.brainstorm(),false);
 assert.match(f.node().innerHTML,/Превышен лимит 30 предложений/);
});
test('approve is per subgroup only after explicit confirm; can manually edit target and listing',async()=>{
 const f=fixture();await f.api.brainstorm();
 const k=[A,'Инструмент Ресанта','Перфораторы Ресанта'].map(x=>x.toLocaleLowerCase('ru')).join('|');
 f.click('[data-ab-approve]',{abApprove:k});await tick();
 assert.equal(f.rpcCalls.filter(x=>x.name==='triovist_ai_brainstorm_approve_v20261105').length,0);
 f.click('[data-ab-edit]',{abEdit:k});
 f.input('target',k,'10000');
 f.input('note',k,'Руководитель подтверждает дополнительный объём и пополнение.');
 f.input('listing',k,'Проверить десять карточек и зафиксировать изменения позиций с подтверждением.');
 f.setConfirm(true);
 f.click('[data-ab-approve]',{abApprove:k});await tick();
 const calls=f.rpcCalls.filter(x=>x.name==='triovist_ai_brainstorm_approve_v20261105');
 assert.equal(calls.length,1);
 assert.equal(calls[0].args.p_target_revenue,10000);
 assert.equal(calls[0].args.p_subgroup,'Перфораторы Ресанта');
 assert.equal(calls[0].args.p_manager_email,A);
 assert.match(calls[0].args.p_listing_text,/десять карточек/);
 assert.equal(f.refreshCount(),1);
});
test('past month tasks, old parser and approved plans are not touched',()=>{
 const html=read('index.html');
 assert.match(html,/179-triovist-demand-ai-v1\.js\?v=20261105-subgroup-listing-fix3/);
 assert.match(html,/61-triovist-task-month-safe-v23651\.js\?v=(?:20261105-subgroup-brainstorm-v2|20261109-decisions360-fact1)/);
 assert.match(html,/169-triovist-tasks360-ux-v1\.js\?v=(?:20261105-subgroup-brainstorm-v2|20261109-decisions360-motivation1)/);
 const task=read('assets/61-triovist-task-month-safe-v23651.js');
 assert.match(task,/isBrainstormTask/);
 assert.match(task,/triovist_ai_brainstorm_verify_v20261105/);
 assert.match(task,/isPayushin\(\)/);
 const sql=read('supabase/migrations/20261105_triovist_ai_brainstorm_approve_v2.sql');
 assert.match(sql,/period_month=v_month/);
 assert.match(sql,/v_existing>=30/);
 assert.match(sql,/v_month<>date_trunc\('month',current_date\)::date/);
 assert.match(sql,/triovist_tasks_action\(v_id,'approve'/);
 assert.doesNotMatch(sql,/DELETE FROM public\.triovist_ai_tasks|TRUNCATE/);
});

test('director may approve 30 000 BYN without a separately typed note; visible confirmation warns about exceeding AI proposal',async()=>{
 const f=fixture();await f.api.brainstorm();
 const key=[A,'Инструмент Ресанта','Перфораторы Ресанта'].map(x=>x.toLocaleLowerCase('ru')).join('|');
 f.click('[data-ab-edit]',{abEdit:key});
 f.input('target',key,'30000');
 // The note is deliberately left empty, just as in the attached screenshot.
 f.setConfirm(true);
 f.click('[data-ab-approve]',{abApprove:key});await tick();
 const rpc=f.rpcCalls.filter(x=>x.name==='triovist_ai_brainstorm_approve_v20261105');
 assert.equal(rpc.length,1);
 assert.equal(rpc[0].args.p_target_revenue,30000);
 assert.equal(rpc[0].args.p_task_note,'');
 assert.match(f.confirmations[0],/в 7\.0 раза/);
 assert.match(f.confirmations[0],/30[\s\u00a0\u202f]?000,00 BYN/);
 assert.equal(f.refreshCount(),1);
});
test('new server audit preserves manual target without typed comment and shows historical listing as historical only',()=>{
 const sql=read('supabase/migrations/20261105_triovist_ai_brainstorm_manual_target_fix_v3.sql');
 assert.match(sql,/v_note:='Ручная цель руководителя:/);
 assert.match(sql,/a\.actor_email IS DISTINCT FROM 'payushin_ar@resanta\.ru'/);
 assert.doesNotMatch(sql,/length\(v_note\)<15/);
 const listing=read('supabase/migrations/20261105_triovist_ai_brainstorm_listing_provenance_v3.sql');
 assert.match(listing,/last_exact_position/);
 assert.match(listing,/last_exact_seen/);
 assert.match(listing,/not_in_fresh_registry/);
 assert.match(listing,/out_of_stock/);
 assert.match(listing,/order_no<=24/);
});
