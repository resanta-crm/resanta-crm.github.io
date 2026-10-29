// Same AI360 tool-orchestrator as director v4, but every data read is reauthorized
// through the existing staff-scoped Edge gateway under the caller's own JWT.
// No write APIs, no service-role data returned to LLM without a branch-scope check.
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {runToolCore,CORE_MODEL} from './core.mjs';
import {staffPermission} from './permissions.mjs';
const NAMES=['Руднев','Ачинович','Шкуран'];
const TRI_NAMES=['Александренко','Кришталь'];
const DOMAINS=['sales','debt','clients','tasks','routes','visits','gps','stock','client_detail',
 'triovist_tasks','triovist_groups','triovist_cards','triovist_issues','triovist_positions','triovist_infographics'];
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const h=origin=>({
 'Access-Control-Allow-Origin':ORIGINS.has(origin||'')?origin:'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store',
 'Content-Type':'application/json; charset=utf-8'
});
const reply=(req,data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:h(req.headers.get('Origin'))
});
const norm=s=>String(s||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
function today(){
 const parts=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date());
 const v=k=>parts.find(x=>x.type===k)?.value||'';
 return v('year')+'-'+v('month')+'-'+v('day');
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h(origin)});
 if(req.method!=='POST')return reply(req,{error:'method_not_allowed'},405);
 if(origin&&!ORIGINS.has(origin))return reply(req,{error:'origin_not_allowed'},403);
 const token=String(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(token.length<15||token.length>6000)return reply(req,{error:'not_authorized'},401);
 const url=Deno.env.get('SUPABASE_URL')||'';
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 const openai=Deno.env.get('OPENAI_API_KEY')||'';
 if(!url||!key||!anon||!openai)return reply(req,{error:'server_unconfigured'},503);
 const svc=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const logged=await svc.auth.getUser(token).catch(()=>null);
 const userId=logged?.data?.user?.id;
 if(!userId)return reply(req,{error:'not_authorized'},403);
 const prof=await svc.from('users').select('id,name,role,region').eq('id',userId).maybeSingle();
 const permission=staffPermission(userId,prof.data);
 if(prof.error||!permission||!['branch_director','field_manager','triovist_category'].includes(permission.tier))
  return reply(req,{error:'not_authorized'},403);
 const permitted=permission.tier==='branch_director'?NAMES:[permission.name];
 const domains=permission.domains.filter(d=>DOMAINS.includes(d));
 let body;
 try{body=await req.json();}catch{return reply(req,{error:'bad_json'},400);}
 const question=typeof body?.question==='string'?body.question.trim().slice(0,350):'';
 if(!question)return reply(req,{error:'empty_question'},400);
 const day=today(),currentMonth=day.slice(0,7);
 const requestedMonth=String(body?.month||'').slice(0,7);
 const month=/^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth)&&
   requestedMonth>='2025-01'&&requestedMonth<=currentMonth?requestedMonth:currentMonth;
 const directMatches=[...NAMES,...TRI_NAMES].filter(name=>norm(question).includes(norm(name).slice(0,4)));
 if(directMatches.length>1)return reply(req,{error:'ambiguous_manager'},400);
 const priorManager=NAMES.find(x=>norm(x)===norm(body?.memory?.manager||''))||null;
 const contextFollowup=/^(?:а |и |ещё|еще|что ещё|что еще|расскажи|дальше|покажи|сколько)/i.test(question);
 // Never allow a manager to select another employee. A named colleague in the
 // question is not an authorization; reject before any LLM or CRM source reads.
 if(permission.tier!=='branch_director'&&directMatches.some(x=>x!==permission.name))
  return reply(req,{error:'manager_outside_own_portfolio'},403);
 const subject=permission.tier!=='branch_director'?permission.name:
   directMatches[0]||(contextFollowup?priorManager:null);
 const memory={
  manager:subject||'',month,domain:'',
  client:typeof body.memory?.client==='string'?body.memory.client.slice(0,120):'',
  group:typeof body.memory?.group==='string'?body.memory.group.slice(0,100):'',
  subgroup:typeof body.memory?.subgroup==='string'?body.memory.subgroup.slice(0,100):'',
  level:['groups','subgroups','sku'].includes(body.memory?.level)?body.memory.level:'',
  offset:Number.isSafeInteger(body.memory?.offset)?Math.max(0,Math.min(200,body.memory.offset)):0
 };
 const history=Array.isArray(body?.history)?body.history.slice(-6).map(x=>({
  role:x?.role==='assistant'?'assistant':'user',
  content:String(x?.content||'').slice(0,250)
 })):[];
 // Claim before ALL LLM requests: same per-user budget as director and paid voice.
 const claim=await svc.rpc('crm_ai360_core_claim_v2',{p_user_id:userId,p_reserve_rub:8});
 if(claim.error)return reply(req,{error:'budget_unavailable'},503);
 if(claim.data?.allowed!==true)return reply(req,{
  error:'ai360_daily_or_monthly_limit',reason:claim.data?.reason||'budget_reached'
 },429);
 const claimId=String(claim.data.claim_id||'');
 let inputTokens=0,outputTokens=0,rounds=0;
 const request=async payload=>{
  const res=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',headers:{Authorization:'Bearer '+openai,'Content-Type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(14000)
  });
  if(!res.ok)throw Error('openai_upstream_'+res.status);
  const result=await res.json();
  inputTokens+=Math.max(0,Number(result?.usage?.input_tokens||0));
  outputTokens+=Math.max(0,Number(result?.usage?.output_tokens||0));
  rounds++;
  return result;
 };
 // Server rescopes tool arguments, regardless of what an LLM proposes.
 const readTool=async args=>{
  const domain=typeof args.domain==='string'?args.domain:'';
  if(!domains.includes(domain))return {domain,error:'not_authorized_domain'};
  const proposed=typeof args.manager==='string'?args.manager.slice(0,90):null;
  const selected=subject||proposed;
  if(selected&&!permitted.some(x=>norm(x)===norm(selected)))
   return {domain,error:'outside_branch_scope'};
  const outgoing={
   kind:'read',domain,manager:permission.tier!=='branch_director'?permission.name:subject||selected||null,month,
   offset:Number.isSafeInteger(args.offset)?Math.min(200,Math.max(0,args.offset)):0,
   client_name:typeof args.client==='string'?args.client.slice(0,150):null,
   level:args.level||'groups',group:args.group||null,subgroup:args.subgroup||null,
   when:domain==='routes'&&/сегодня|на сегодня/i.test(question)?'today':null
  };
  let response;
  try{
   response=await fetch(url+'/functions/v1/crm-ai360-staff-read-v1',{
    method:'POST',
    headers:{'Authorization':'Bearer '+token,'apikey':anon,'Content-Type':'application/json'},
    body:JSON.stringify(outgoing),signal:AbortSignal.timeout(6000)
   });
  }catch{return {domain,error:'source_timeout'};}
  if(!response.ok)return {domain,error:'source_not_authorized_or_unavailable'};
  const evidence=await response.json().catch(()=>null);
  if(!evidence||evidence.answer_verified!==true||evidence.read_only!==true||
     evidence.scope?.role!==permission.tier||evidence.domain!==domain||
     !Array.isArray(evidence.scope.managers)||!evidence.scope.managers.length||
     evidence.scope.managers.some(x=>!permitted.includes(x))||
     (subject&&evidence.scope.managers.some(x=>x!==subject)))
    return {domain,error:'source_scope_invalid'};
  // Evidence is the staff gateway's already-minimized, verified payload.
  return {domain,source:evidence.data?.source||'crm_staff_read',
   scope:'authorized_vitebsk',managers:evidence.scope.managers,
   as_of:evidence.as_of,...evidence.data};
 };
 const output=await runToolCore({
  question,history,memory:{...memory,today:day,
   role:permission.tier,permitted_managers:permitted,
   instruction:permission.tier==='triovist_category'?
     'Только личные категории Триовиста и 21vek. Смотри свежесть импорта, карточки, позиции, ошибки, инфографику и свои задачи. Не выдумывай данные конкурентов; если они запрещены — скажи об этом. Создание поручений строго запрещено.':
     permission.tier==='field_manager'?'Только собственные клиенты и показатели. Создание поручений строго запрещено.':
     'Только Витебск. Поручения создавать только через отдельное подтверждение директора филиала.'},
  domains,readTool,request,preferredDomain:null
 });
 const cost=Math.min(8,(inputTokens*.75+outputTokens*4.5)*100/1000000);
 const settle=await svc.rpc('crm_ai360_core_finish_v2',{
  p_claim_id:claimId,p_actual_rub:Number(cost.toFixed(4)),
  p_input_tokens:Math.floor(inputTokens),p_output_tokens:Math.floor(outputTokens),
  p_rounds:rounds,p_status:output?.pair?'ok':'failed'
 });
 if(settle.error||settle.data?.ok!==true)return reply(req,{error:'budget_settlement_unavailable'},503);
 if(!output?.pair)return reply(req,{error:'verified_dialog_unavailable',answer_verified:false},503);
 const pair=output.pair;
 const answer=[pair.brief,pair.detail,pair.offer].map(x=>String(x||'').trim()).filter(Boolean).join('\n');
 return reply(req,{mode:'staff_ai360_shared_core_v1',answer_verified:true,read_only:true,
  model:CORE_MODEL,scope:permission.tier==='triovist_category'?'Триовист / 21vek.by':'Витебск',role:permission.tier,subject_manager:subject,month,
  answer:answer.slice(0,4000),speech_summary:pair.brief.slice(0,400),offer:pair.offer,
  domains_used:output.used,as_of:day,
  memory:{manager:subject||'',month,client:memory.client,group:memory.group,subgroup:memory.subgroup,
   level:memory.level,offset:memory.offset}});
});
