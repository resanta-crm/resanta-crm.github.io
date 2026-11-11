import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {scopeForVoice,permittedBudgetClients,summarizeBudget,answerBudgetVoice,fold} from './finance.mjs';

// Isolated deterministic finance gateway. No user-controlled scopes, no LLM,
// no DB writes, no polling, no hot microphone. Auth and branch checks run server side.
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by','http://localhost','capacitor://localhost']);
const NETWORK_ID='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const headers=req=>({
 'Access-Control-Allow-Origin':ORIGINS.has(req.headers.get('Origin'))?req.headers.get('Origin'):'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store','Vary':'Origin'
});
const respond=(req,obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:headers(req)});
const err=(code,status)=>({code,status});

async function loadFinance(svc,scope){
 const staffResult=await svc.from('users').select('id,name,email,role,region').in('role',['boss','manager']).limit(300);
 if(staffResult.error||(staffResult.data||[]).length>=300)throw err('staff_scope_unavailable',503);
 const staff=staffResult.data||[];
 const clientQuery=await svc.from('clients').select('id,name,manager_name,region').limit(1500);
 if(clientQuery.error||(clientQuery.data||[]).length>=1500)throw err('client_source_incomplete',503);
 const clients=permittedBudgetClients(scope,clientQuery.data||[],staff);
 if(!clients.length)return {entries:[],clients,staff};
 if(clients.length>=400)throw err('client_scope_too_large',503);
 const clientIds=clients.map(c=>c.id);
 const budgetResult=await svc.from('promotion_budgets')
  .select('id,client_id,client_name,manager_name,opening_balance,budget_total,period_start,period_end')
  .in('client_id',clientIds).limit(500);
 if(budgetResult.error||(budgetResult.data||[]).length>=500)throw err('budget_source_unavailable',503);
 const budgets=budgetResult.data||[];
 if(!budgets.length)return {entries:[],clients,staff};
 const ids=budgets.map(b=>b.id);
 const [movements,promotions]=await Promise.all([
  svc.from('promotion_budget_movements')
   .select('id,budget_id,amount,movement_type,promotion_id').in('budget_id',ids).limit(1500),
  svc.from('promotions')
   .select('id,budget_id,client_id,title,status,budget_reserved,actual_spend').in('budget_id',ids).limit(1500)
 ]);
 if(movements.error||promotions.error||(movements.data||[]).length>=1500||(promotions.data||[]).length>=1500)
  throw err('budget_history_incomplete',503);
 const clientById=new Map(clients.map(c=>[String(c.id),c]));
 return {entries:budgets.map(b=>{
  const client=clientById.get(String(b.client_id));
  if(!client)return null;
  const relevant=(promotions.data||[]).filter(p=>String(p.budget_id)===String(b.id));
  return {client,budget:b,metrics:summarizeBudget(b,movements.data||[],relevant),promotions:relevant};
 }).filter(Boolean),clients,staff};
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)});
 if(req.method!=='POST')return respond(req,{error:'method_not_allowed'},405);
 const origin=req.headers.get('Origin');
 if(origin&&!ORIGINS.has(origin))return respond(req,{error:'origin_forbidden'},403);
 const token=String(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token||token.length>6000)return respond(req,{error:'not_authorized'},401);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!key)return respond(req,{error:'service_unavailable'},503);
 const svc=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const auth=await svc.auth.getUser(token);
  const userId=auth?.data?.user?.id;
  if(auth.error||!userId)return respond(req,{error:'not_authorized'},403);
  const user=await svc.from('users').select('id,name,email,role,region').eq('id',userId).maybeSingle();
  if(user.error||!user.data||String(user.data.id)!==String(userId))return respond(req,{error:'not_authorized'},403);
  const staff=await svc.from('users').select('id,name,email,role,region').in('role',['boss','manager']).limit(300);
  if(staff.error||(staff.data||[]).length>=300)return respond(req,{error:'staff_scope_unavailable'},503);
  const scope=scopeForVoice(user.data,staff.data||[],NETWORK_ID);
  if(!scope)return respond(req,{error:'not_authorized'},403);
  const body=await req.json().catch(()=>({}));
  const question=String(body?.question||body?.message||'').trim().slice(0,220);
  if(question.length<3)return respond(req,{error:'question_invalid'},400);
  const prev=body?.memory&&typeof body.memory==='object'?body.memory:{};
  const memory={client_id:/^[a-f0-9-]{36}$/i.test(String(prev.client_id||''))?prev.client_id:'',domain:String(prev.domain||'').slice(0,36)};
  const finance=await loadFinance(svc,scope);
  const debt=/пдз|просроч|долг|задолж|сколько должен|нам должен/i.test(fold(question));
  let debtRows=[];
  if(debt&&finance.entries.length){
   const allowedManagers=[...new Set(finance.entries.map(x=>x.client.manager_name))];
   const debts=await svc.from('client_debt').select('client_name,manager_name,debt_overdue,report_date')
    .in('manager_name',allowedManagers).order('report_date',{ascending:false}).limit(1000);
   if(debts.error||(debts.data||[]).length>=1000)return respond(req,{error:'debt_source_incomplete'},503);
   debtRows=debts.data||[];
  }
  const result=answerBudgetVoice(question,finance.entries,memory,debtRows);
  const asOf=new Date().toISOString();
  const remembered={client_id:result.client_id||'',domain:'promotion_budgets'};
  const staffMode=scope.tier!=='network_director';
  return respond(req,{
   mode:staffMode?'staff_ai360_shared_core_v1':'director_readonly_v4',
   answer_verified:true,read_only:true,scope:scope.region,role:scope.tier,
   subject_manager:scope.subject_manager,domains_used:['promotion_budgets'],
   as_of:asOf,answer:result.answer,brief:result.answer,detail:'',
   memory:remembered,source:'promotion_budget_truth_v1',
   budget_data_scope:scope.tier
  });
 }catch(e){
  const code=typeof e?.code==='string'?e.code:'budget_read_unavailable';
  const status=Number(e?.status)||503;
  console.error('ai360-budget-read',code); // No tokens, names, amounts or query content in logs.
  return respond(req,{error:code,answer_verified:false},status);
 }
});
