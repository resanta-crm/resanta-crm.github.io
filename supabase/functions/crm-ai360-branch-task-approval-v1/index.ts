// Branch director real tasks. Two-phase signed authorization; no AI-driven writes.
// Only Sidarovich; exactly one named Vitebsk manager and optional verified assigned client.
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {staffPermission,targetManagers,norm} from './permissions.mjs';
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const SOURCE='ai360_branch_voice_approved',CONFIRM='подтверждаю создание поручения';
const HEADER=origin=>({
 'Access-Control-Allow-Origin':ORIGINS.has(origin||'')?origin:'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin',
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'
});
const reply=(req,body,status=200)=>new Response(JSON.stringify(body),
 {status,headers:HEADER(req.headers.get('Origin'))});
const fail=(req,code,status=409)=>reply(req,{error:code,created:0},status);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function today(){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=x=>p.find(y=>y.type===x)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
function dueValid(str,day){
 if(typeof str!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(str))return false;
 const v=new Date(str+'T00:00:00Z');
 return !Number.isNaN(v.valueOf())&&v.toISOString().slice(0,10)===str&&
  str>day&&v.valueOf()-Date.parse(day+'T00:00:00Z')<=90*86400000;
}
function trimmed(x,max){return typeof x==='string'&&x.length<=max?x.trim():'';}
function taskInput(body,day){
 if(!body||!['validate','commit'].includes(body.kind)||!uuid(body.approval_id))return null;
 if(body.kind==='commit'&&body.confirmation!==CONFIRM)return null;
 const manager_name=trimmed(body.manager_name,90);
 const client_name=trimmed(body.client_name??'',180);
 const title=trimmed(body.title,110),text=trimmed(body.text,500);
 const expected_result=trimmed(body.expected_result??'',250);
 const criteria=trimmed(body.criteria??'',250);
 const due_date=trimmed(body.due_date,10);
 if(!manager_name||!title||title.length<8||!text||text.length<12||
  !dueValid(due_date,day)||title.includes('\n')||text.includes('\u0000')||
  client_name.includes('\u0000'))return null;
 return {manager_name,client_name,title,text,expected_result,criteria,due_date};
}
const enc=new TextEncoder();
async function key(secret){
 return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
function message(userId,approvalId,expiry,data){
 return enc.encode(JSON.stringify({v:1,scope:SOURCE,userId,approvalId,expiry,data}));
}
async function sign(secret,userId,approvalId,data){
 const expiry=Date.now()+600000;
 const sig=await crypto.subtle.sign('HMAC',await key(secret),message(userId,approvalId,expiry,data));
 return String(expiry)+'.'+Array.from(new Uint8Array(sig)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function verify(secret,userId,approvalId,data,token){
 const match=/^(\d{13})\.([a-f0-9]{64})$/.exec(String(token||''));
 if(!match)return false;
 const expiry=Number(match[1]),now=Date.now();
 if(!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+600000)return false;
 const sig=Uint8Array.from(match[2].match(/../g)||[],s=>parseInt(s,16));
 return crypto.subtle.verify('HMAC',await key(secret),sig,message(userId,approvalId,expiry,data));
}
async function taskId(data){
 // Canonical content ID prevents repeat creation even across different approvals and
 // after a manager closes a previous task. Title/date/client variations are intentional new tasks.
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',
  enc.encode(SOURCE+'|'+data.manager_id+'|'+data.client_id+'|'+norm(data.title)+'|'+data.due_date+'|'+norm(data.text))));
 const b=digest.slice(0,16);b[6]=(b[6]&15)|0x80;b[8]=(b[8]&63)|0x80;
 const hex=Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADER(origin)});
 if(req.method!=='POST')return fail(req,'method_not_allowed',405);
 if(origin&&!ORIGINS.has(origin))return fail(req,'origin_not_allowed',403);
 const auth=req.headers.get('Authorization')||'';
 const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 if(token.length<15||token.length>6000)return fail(req,'not_authorized',401);
 const url=Deno.env.get('SUPABASE_URL')||'',secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!secret)return fail(req,'service_unavailable',503);
 const svc=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const authed=await svc.auth.getUser(token).catch(()=>null);
 const userId=authed?.data?.user?.id;
 if(!userId||userId!==SID)return fail(req,'not_authorized',403);
 const profile=await svc.from('users').select('id,name,role,region').eq('id',userId).maybeSingle();
 if(profile.error)return fail(req,'profile_unavailable',503);
 const perm=staffPermission(userId,profile.data);
 if(!perm||perm.tier!=='branch_director')return fail(req,'not_authorized',403);
 let body;try{body=await req.json();}catch{return fail(req,'bad_json',400);}
 const day=today(),draft=taskInput(body,day);
 if(!draft)return fail(req,'invalid_draft_or_confirmation',400);
 const names=targetManagers(perm,'tasks',draft.manager_name);
 if(!names||names.length!==1)return fail(req,'manager_outside_branch',403);
 const m=await svc.from('users').select('id,name,role,region')
  .eq('name',names[0]).eq('role','manager').eq('region','Витебск').limit(2);
 if(m.error||(m.data||[]).length!==1)return fail(req,'manager_directory_unavailable',503);
 const manager=m.data[0];
 let client=null;
 if(draft.client_name){
  // No arbitrary client_id is trusted from the browser. Resolve exact name in allowed portfolio.
  const escaped=draft.client_name.replace(/[\\%_]/g,'\\$&');
  const c=await svc.from('clients').select('id,name,manager_name,is_archived,to_delete')
   .ilike('name',escaped).eq('manager_name',manager.name).limit(2);
  if(c.error)return fail(req,'client_directory_unavailable',503);
  if((c.data||[]).length!==1||c.data[0].is_archived||c.data[0].to_delete)
   return fail(req,'client_not_assigned_to_manager',403);
  client=c.data[0];
 }
 const canonical={manager_id:manager.id,manager_name:manager.name,
  client_id:client?.id||null,client_name:client?.name||null,
  title:draft.title,text:draft.text,due_date:draft.due_date,
  expected_result:draft.expected_result||'Проверить результат поручения и отразить его в CRM.',
  criteria:draft.criteria||'Менеджер зафиксировал результат и следующий шаг.'};
 const id=await taskId(canonical);
 const duplicate=await svc.from('tasks').select('id,source,done').eq('id',id).limit(1);
 if(duplicate.error)return fail(req,'task_verification_unavailable',503);
 if(duplicate.data?.length)return reply(req,{mode:'already_exists',created:0,task_id:id});
 // Reject an existing open task on the same customer; for general tasks reject exact
 // same manager/title/due-date to avoid a second open assignment.
 let query=svc.from('tasks').select('id').eq('manager_name',manager.name)
  .or('done.eq.false,done.is.null').limit(1);
 if(client)query=query.eq('client_id',client.id);
 else query=query.is('client_id',null).eq('title',draft.title).eq('due_date',draft.due_date);
 const prior=await query;
 if(prior.error)return fail(req,'task_conflict_check_unavailable',503);
 if(prior.data?.length)return fail(req,'open_task_already_exists',409);
 if(body.kind==='validate'){
  const approval_token=await sign(secret,userId,body.approval_id,canonical);
  return reply(req,{mode:'ready_branch',created:0,approval_token,expires_in_seconds:600,
   proposal:{...canonical,client_name:canonical.client_name}});
 }
 if(!await verify(secret,userId,body.approval_id,canonical,body.approval_token))
  return fail(req,'approval_token_invalid_or_expired',403);
 const row={id,manager_id:manager.id,manager_name:manager.name,
  client_id:client?.id||null,
  title:draft.title,text:draft.text,due_date:draft.due_date,
  done:false,auto_generated:false,review_status:'approved',
  reviewed_by:profile.data.name,reviewed_at:new Date().toISOString(),
  source:SOURCE,priority:'средний',
  basis:'Поручение директора Витебского филиала, подтверждено в РЕСАНТА AI 360°.',
  expected_result:canonical.expected_result,criteria:canonical.criteria,
  ai_reason:'Согласованное персональное поручение директора филиала.',
  ai_selection_context:{branch:'Витебск',role:'branch_director',
   approval_id:body.approval_id,confirmed_at:new Date().toISOString()}};
 const inserted=await svc.from('tasks').insert(row).select('id,source,review_status,manager_name');
 if(inserted.error){
  if(inserted.error.code==='23505')return fail(req,'duplicate_task_blocked',409);
  return fail(req,'create_failed',503);
 }
 if(inserted.data?.length!==1||inserted.data[0].id!==id||
  inserted.data[0].source!==SOURCE||inserted.data[0].review_status!=='approved')
  return fail(req,'write_verification_failed',503);
 return reply(req,{mode:'created_branch',created:1,task_id:id,
  assigned_to:manager.name,visible_to_manager:true,source:SOURCE});
});
