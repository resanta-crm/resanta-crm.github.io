// @ts-nocheck
// Import interoperability with the established JS-only AI360 v4 core.
// AIR3 reuses the SAME AI360 tool catalogue, model orchestration and guard
// as crm-ai360-dialog-v4. Different transport; not a second assistant brain.
import { CRM_AI360_ALL_DOMAINS, CRM_AI360_TOOLS, getTool, collectTool, inferVoiceDomain } from '../crm-ai360-dialog-v4/catalog.mjs';
import { runToolCore } from '../crm-ai360-dialog-v4/core.mjs';
import { requestContext, effectiveManager, guardVoicePair } from '../crm-ai360-dialog-v4/context.mjs';
import { ADMIN, OWNER, deny, quota, stillAllowed } from './auth.ts';
import { publishNavigation } from './stage.ts';

const domains=CRM_AI360_ALL_DOMAINS.filter(x=>x!=='client_detail'&&x!=='client_schedule');
const normal=x=>String(x||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'})
 .format(new Date()).replaceAll('/','-');
const monthVal=(input, fallback)=>typeof input==='string'&&/^20\d\d-(?:0[1-9]|1[0-2])$/.test(input)&&input<=fallback?input:fallback;
const small=x=>String(x||'').replace(/[\r\n<>]/g,' ').slice(0,450);
const sectionNames=Object.freeze({
 'сводк':'operations','дашборд':'operations','главн':'operations','продаж':'sales',
 'долг':'debt','задолж':'debt','пдз':'debt','триовист':'triovist','21vek':'triovist',
 'вип':'vip','vip':'vip','акци':'promotions','маршрут':'routes','gps':'gps',
 'задач':'tasks','остатк':'stock','склад':'stock','клиент':'clients',
 'платеж':'payments','конкурент':'competitors','карточк':'cards_21vek',
 'инфограф':'infographics','мотивац':'motivation','уценк':'markdown',
 'стенд':'stands','поступлен':'cash','парсер':'parser'
});
export function navigationIntent(phrase){
 const q=normal(phrase).replace(/[,.!?;:]+/g,' ').replace(/\s+/g,' ').trim();
 if(!/^(?:(?:привет\s+(?:ресанта|лера)|лера|эй\s+лера)\s+)?(?:открой|перейди|покажи(?:\s+раздел)?|выведи(?:\s+раздел)?|отобрази(?:\s+раздел)?|вернись\s+в)/.test(q))
  return null;
 for(const [word,section] of Object.entries(sectionNames)){
  if(q.includes(word)&&domains.includes(section))return section;
 }
 return null;
}
function monthNow(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;}
async function managed(domain,manager,month,today){
 const rpc=async(name,args)=>{
  const r=await ADMIN.rpc(name,args);if(r.error||!r.data)throw Error('source_unavailable');return r.data;
 };
 if(domain==='sales'){
  const d=await rpc('crm_ai360_sales_kpi_snapshot_v1',{p_month:month+'-01'});
  const all=Array.isArray(d.managers)?d.managers:[];
  const filtered=manager?all.filter(x=>normal(x.manager_name)===normal(manager)):all.slice(0,15);
  return {domain,source:'crm_ai360_sales_kpi_snapshot_v1',scope:manager?'manager':'network',
   manager:manager||null,month,currency:'BYN',as_of:d.freshness?.last_success_at||null,
   network_revenue:manager?null:d.network_revenue,managers:filtered,partial:!manager&&all.length>filtered.length};
 }
 if(domain==='debt'){
  const d=await rpc('crm_ai360_debt_snapshot_v1',{p_manager:manager});
  if(manager&&normal(d.scope)!==normal(manager))throw Error('manager_scope_mismatch');
  return {domain,source:'crm_ai360_debt_snapshot_v1',scope:manager||'network',currency:'BYN',
   debt_summary:d.debt_summary,manager_totals:(d.manager_totals||[]).slice(0,10),
   overdue_debtors:(d.overdue_debtors||[]).slice(0,8),partial:true};
 }
 if(domain==='operations'){
  const d=await rpc('crm_ai360_operations_snapshot_v1',{p_manager:manager,p_month:month+'-01'});
  if(manager&&normal(d.scope)!==normal(manager))throw Error('manager_scope_mismatch');
  return {domain,source:'crm_ai360_operations_snapshot_v1',scope:d.scope,month,currency:'BYN',
   task_summary:d.task_summary,client_summary:d.client_summary,debt_summary:d.debt_summary,
   route_summary:d.route_summary,visit_summary:d.visit_summary,
   declining_clients:(d.declining_clients||[]).slice(0,5),partial:true};
 }
 if(domain==='triovist'){
  const d=await rpc('crm_ai360_triovist_brief_v1',{p_month:month+'-01'});
  return {domain,source:'crm_ai360_triovist_brief_v1',scope:'client_all',owner:'Триовист',
   currency:'BYN',month,as_of:d.sales_import_at,plan:d.plan,revenue:d.revenue,
   new_tasks:d.new_tasks,pending_approval:d.pending_approval,
   partner_stock_date:d.partner_stock_date,chekhov_stock_date:d.chekhov_stock_date,
   partial:false,warning:'Общие показатели клиента, не персональные продажи менеджера'};
 }
 if(domain==='promotions'){
  const r=await ADMIN.from('promotions').select('title,client_name,start_date,end_date,sales_plan,confirmed_sales,actual_spend,status')
   .eq('status','in_work').lte('start_date',today).gte('end_date',today).order('end_date').limit(12);
  if(r.error)throw Error('source_unavailable');
  return {domain,source:'promotions',as_of:today,rows:r.data||[],partial:true};
 }
 if(domain==='payments'){
  const r=await ADMIN.from('payment_registry').select('description,amount,currency,status,due_date')
   .in('status',['submitted','approved']).order('created_at',{ascending:false}).limit(12);
  if(r.error)throw Error('source_unavailable');
  return {domain,source:'payment_registry',rows:r.data||[],partial:true};
 }
 if(domain==='vip'){
  const r=await ADMIN.from('vip_membership_v236429').select('client_name,department,client_id')
   .eq('active',true).limit(30);
  if(r.error)throw Error('source_unavailable');
  return {domain,source:'vip_membership_v236429',rows:r.data||[],partial:true,
   warning:'Членство в VIP без расчёта продаж'};
 }
 return null;
}
async function resolveManager(name,names){
 if(!name)return null;
 const n=normal(name);
 const matches=names.filter(x=>normal(x)===n||normal(x).split(/\s+/).includes(n));
 if(matches.length!==1)throw Error('manager_not_unique');
 return matches[0];
}
async function createRead(question,memory,dayValue){
 const staff=await ADMIN.from('users').select('name').eq('role','manager').limit(100);
 if(staff.error)deny('staff_directory_unavailable',503);
 const names=(staff.data||[]).map(x=>String(x.name||'')).filter(Boolean);
 const subject=requestContext(question,memory,names);
 const currentMonth=monthNow(),baseMonth=monthVal(memory.month,currentMonth);
 const results=[];
 let lastDomain='', lastMonth=baseMonth,lastManager='';
 const read=async args=>{
  const domain=String(args.domain||'');
  if(!domains.includes(domain))return {domain,error:'domain_not_approved'};
  const target=effectiveManager(domain,subject);
  if(target.error)return {domain,error:target.error};
  try{
   const manager=await resolveManager(target.manager,names);
   const month=monthVal(args.month,baseMonth);
   lastManager=manager||'';lastMonth=month;lastDomain=domain;
   const r=(await managed(domain,manager,month,dayValue))||
    await collectTool(ADMIN,domain,{manager,offset:Math.min(200,Math.max(0,Number(args.offset)||0)),
      signal:AbortSignal.timeout(4500)});
   const value={...r,scope:r.scope||(manager?'manager':'network'),manager:manager||null};
   results.push(value);return value;
  }catch{return {domain,error:'source_unavailable'};}
 };
 return {read,results,names,subject,getState:()=>({domain:lastDomain,manager:lastManager,month:lastMonth})};
}
async function finishClaim(id,rub,input,output,rounds,status){
 const x=await ADMIN.rpc('crm_ai360_core_finish_v2',{
  p_claim_id:id,p_actual_rub:Number(rub.toFixed(4)),p_input_tokens:input,
  p_output_tokens:output,p_rounds:rounds,p_status:status
 });
 if(x.error||x.data?.ok!==true)deny('budget_settlement_unavailable',503);
}
export async function section(s,domain){
 await quota('air3-v2-read-'+OWNER,30,60);
 if(!domains.includes(domain))deny('section_not_permitted',403);
 // Navigate the original CRM on the projector independently of the read-only
 // summary returned to the glasses. No CRM write/action is ever delegated.
 try{await publishNavigation(s,domain);}catch(_){}
 const date=day();
 const ctx=await createRead('Открой '+domain,{},date);
 const data=await ctx.read({domain,month:null,offset:0});
 await stillAllowed(s);
 if(data.error)deny('section_unavailable',503);
 return {kind:'section',section:domain,data,answer:'Открываю раздел '+(getTool(domain)?.label||domain)+'. Данные из CRM.'};
}
export async function ask(s,message,historyRaw,memoryRaw){
 const question=String(message||'').trim().slice(0,400);
 if(question.length<2)deny('question_invalid',400);
 const route=navigationIntent(question);
 if(route)return section(s,route);
 await quota('air3-v2-ask-'+OWNER,20,60);
 const claim=await ADMIN.rpc('crm_ai360_core_claim_v2',{p_user_id:OWNER,p_reserve_rub:8});
 if(claim.error)deny('budget_meter_unavailable',503);
 if(claim.data?.allowed!==true)deny(String(claim.data?.reason||'budget_limit_reached'),429);
 const claimId=String(claim.data.claim_id||'');
 let inTokens=0,outTokens=0,rounds=0,output=null;
 const memory=memoryRaw&&typeof memoryRaw==='object'?{
  manager:String(memoryRaw.manager||'').slice(0,90),month:String(memoryRaw.month||'').slice(0,7),
  domain:String(memoryRaw.domain||'').slice(0,30),subject:String(memoryRaw.subject||'').slice(0,20)
 }:{};
 const history=Array.isArray(historyRaw)?historyRaw.slice(-6).map(x=>({
  role:x?.role==='assistant'?'assistant':'user',content:String(x?.content||'').slice(0,350)
 })):[];
 const ctx=await createRead(question,memory,day());
 const preferred=inferVoiceDomain(question)||(
  /^(а\s|и\s|еще|ещё|покажи|расскажи|дальше)/i.test(question)&&domains.includes(memory.domain)?memory.domain:null);
 // During a real question, open the matching ORIGINAL visual CRM page on
 // the projector as well as returning the answer to Lera in the glasses.
 if(preferred&&domains.includes(preferred)){
  try{await publishNavigation(s,preferred);}catch(_){}
 }
 try{
  const request=async payload=>{
   const key=Deno.env.get('OPENAI_API_KEY')||'';
   if(!key)throw Error('openai_unconfigured');
   const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(14000)
   });
   if(!response.ok)throw Error('openai_upstream_'+response.status);
   const v=await response.json();
   inTokens+=Math.max(0,Number(v?.usage?.input_tokens||0));
   outTokens+=Math.max(0,Number(v?.usage?.output_tokens||0));
   rounds++;return v;
  };
  output=await runToolCore({question,history,memory:{
   ...memory,manager:ctx.subject.manager||'',subject:ctx.subject.subject,
   client:'',today:day(),catalog:CRM_AI360_TOOLS.map(t=>t.id+': '+t.label).join('; '),
   available_domains:domains},domains,readTool:ctx.read,request,preferredDomain:preferred});
 }catch{output={pair:null,error:'analysis_unavailable',used:[]};}
 const actual=Math.min(8,(inTokens*0.75+outTokens*4.5)*100/1000000);
 await finishClaim(claimId,actual,Math.floor(inTokens),Math.floor(outTokens),rounds,output?.pair?'ok':'failed');
 await stillAllowed(s);
 const pair=ctx.results.length?guardVoicePair(output?.pair,{
  evidence:ctx.results,managers:ctx.names,question,period:monthNow()}):null;
 if(!pair){
  return {kind:'answer',answer:'Не смогла получить подтверждённый ответ. Данные CRM не изменены.',
   error:'analysis_unavailable',memory};
 }
 const state=ctx.getState();
 return {kind:'answer',answer:small(pair.brief),detail:String(pair.detail||'').replace(/<[^>]*>/g,'').trim().slice(0,3000),
  followup_question:small(pair.offer),sources:output.used||[],memory:{...memory,
   month:state.month,manager:state.manager,domain:state.domain||memory.domain,subject:ctx.subject.subject}};
}
export const sections=domains;
