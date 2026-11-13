/* RESANTA Lera 360 agent actions v1.
   User-authenticated two-step task and CONNECT chat operations.
   The LLM only proposes a structured draft; it never writes to the database.
   Existing CRM tools and privileges are preserved. */
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const EXEC='a24954b8-2fe1-4852-b629-d8f351e1bd36';
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const STAFF=new Set([SID,'19dd9943-99ae-47c4-a39c-4f82a11059a6','3d935a76-c6fe-44b6-b248-fcbe58c6bf1c','4fd79fa0-232d-4768-8099-25f47923cc4f','6efa656e-45c6-473b-a853-89eccb9ee43a','9076ccde-a8cc-47e3-b71e-c31170b693ff']);
const SOURCE='lera_agent360_confirmed_v1';
const norm=x=>String(x||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
const esc=x=>String(x||'').trim().replace(/[\r\n\t]+/g,' ').slice(0,500);
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x||''));
const headers=o=>({'Access-Control-Allow-Origin':ORIGINS.has(o||'')?o:'https://resanta-crm.by','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin','Content-Type':'application/json; charset=utf-8'});
const respond=(req,x,status=200)=>new Response(JSON.stringify(x),{status,headers:headers(req.headers.get('Origin'))});
const fail=(req,error,status=400)=>respond(req,{error,created:0,read_only:true},status);
const enc=new TextEncoder();
function localDate(){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const v=k=>p.find(x=>x.type===k)?.value||'';
 return {date:v('year')+'-'+v('month')+'-'+v('day'),time:v('hour')+':'+v('minute')};
}
function dateIsValid(d,t,now){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
 const n=Date.parse(d+'T00:00:00Z'),base=Date.parse(now.date+'T00:00:00Z');
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==d||n<base||n>base+90*86400000)return false;
 if(t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))return false;
 return d!==now.date||!t||t>now.time;
}
async function signature(secret,userId,draft,until){
 const msg=enc.encode(JSON.stringify({v:1,user:userId,until,draft}));
 const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const h=await crypto.subtle.sign('HMAC',k,msg);
 return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function prepareToken(secret,userId,draft){
 const until=Date.now()+300000;
 return {token:String(until)+'.'+await signature(secret,userId,draft,until),expires_at:new Date(until).toISOString()};
}
async function verifyToken(secret,userId,draft,token){
 const m=/^(\d{13})\.([a-f0-9]{64})$/.exec(String(token||''));
 if(!m)return false;
 const until=Number(m[1]),now=Date.now();
 if(!Number.isSafeInteger(until)||until<=now||until>now+300000)return false;
 const expected=await signature(secret,userId,draft,until);
 // Comparing fixed-length hex digests without an early mismatch return.
 let difference=0;
 for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^m[2].charCodeAt(i);
 return difference===0;
}
function actorFor(user,profile){
 const id=user?.id;
 if(!uuid(id)||!profile||profile.id!==id)return null;
 if(id===OWNER&&profile.role==='boss'&&norm(profile.name)==='александр паюшин')
   return {id,name:profile.name,tier:'network_director'};
 if(id===EXEC&&profile.role==='boss'&&profile.region==='Все филиалы'&&
    norm(profile.name)==='руководство компании'&&
    norm(user.email)==='petrovichev@resanta.ru'&&user.email_confirmed_at)
   return {id,name:profile.name,tier:'network_director'};
 if(id===SID&&profile.role==='boss'&&profile.region==='Витебск'&&norm(profile.name)==='сидарович к.н.')
   return {id,name:profile.name,tier:'branch_director'};
 if(STAFF.has(id)&&profile.role==='manager'&&['Витебск','Триовист / 21vek.by'].includes(profile.region))
   return {id,name:profile.name,tier:'employee'};
 return null;
}
async function targetStaff(svc,actor){
 let q=svc.from('users').select('id,name,role,region').in('role',['boss','manager']).limit(70);
 if(actor.tier==='branch_director')q=q.eq('region','Витебск').eq('role','manager');
 if(actor.tier==='employee')q=q.eq('id',actor.id);
 const r=await q;
 if(r.error)throw Error('staff_directory_unavailable');
 return (r.data||[]).filter(x=>uuid(x.id)&&(
  x.role==='manager' || (x.id===SID&&actor.tier==='network_director')
 )).slice(0,60);
}
function matchOne(name,people){
 const search=norm(name).replace(/\s*к\.?\s*н\.?$/i,'').trim();
 if(!search)return null;
 const alias=search==='сидорович'?'сидарович':search;
 const found=people.filter(p=>{
   const nm=norm(p.name);
   return nm===alias||nm.split(' ')[0]===alias||
      (alias.length>=5&&nm.startsWith(alias)&&!(alias==='менеджер'));
 });
 return found.length===1?found[0]:null;
}
async function callModel(openai,question,names,now,svc,userId){
 // The same atomic per-user daily quota and monthly RUB budget as Lera's chat.
 const claim=await svc.rpc('crm_ai360_core_claim_v2',{p_user_id:userId,p_reserve_rub:3});
 if(claim.error||claim.data?.allowed!==true)throw Error('agent_action_budget_unavailable');
 const claimId=String(claim.data.claim_id||'');
 let status='failed',inputTokens=0,outputTokens=0,received=null;
 try{
   received=await callModelClaimed(openai,question,names,now);
   inputTokens=received.inputTokens;outputTokens=received.outputTokens;
   status='ok';
 }finally{
   const rub=Math.min(3,(inputTokens*0.75+outputTokens*4.5)*100/1000000);
   const finish=await svc.rpc('crm_ai360_core_finish_v2',{
     p_claim_id:claimId,p_actual_rub:Number(rub.toFixed(4)),
     p_input_tokens:inputTokens,p_output_tokens:outputTokens,p_rounds:1,p_status:status
   });
   if(finish.error||finish.data?.ok!==true)throw Error('agent_action_budget_settlement_failed');
 }
 return received.result;
}
async function callModelClaimed(openai,question,names,now){
 const schema={type:'object',additionalProperties:false,properties:{
   action:{type:'string',enum:['task','chat','meeting','visit','none']},
   assignee:{type:'string'},title:{type:'string'},details:{type:'string'},
   due_date:{type:'string'},due_time:{type:'string'},
   room_kind:{type:'string',enum:['direct','group']},room_title:{type:'string'},
   participants:{type:'array',items:{type:'string'}},
   client_name:{type:'string'},location:{type:'string'},
   event_format:{type:'string',enum:['in_person','remote','internal']},duration_minutes:{type:'integer'}
 },required:['action','assignee','title','details','due_date','due_time','room_kind','room_title','participants','client_name','location','event_format','duration_minutes']};
 const body={model:'gpt-5.4-mini',store:false,max_output_tokens:500,reasoning:{effort:'low'},
  input:[{role:'system',content:[
    'Извлеки намерение СОЗДАТЬ задачу, чат CONNECT, встречу или плановый визит из естественной русской речи.',
    'Фраза «у меня встреча» НЕ команда на создание: action=none. «Подготовь меня к встрече» тоже action=none.',
    'Встреча — action=meeting; физический маршрутный визит МПП — action=visit.',
    'Никогда не превращай плановую встречу в фактическое GPS-посещение.',
    'Это только черновик, ничего не создавай. Не выдумывай сотрудников, даты, время, участников и их имена.',
    'Сегодня в часовом поясе Минска '+now.date+', время '+now.time+'. Завтра означает следующий календарный день.',
    'Дата и время обязательны для встречи и визита; не выдумывай их.',
    'client_name — клиент только если произнесён явно. location — место только если произнесено.',
    'event_format — in_person, remote или internal; duration_minutes по умолчанию 60, если не указана.',
    'Если дата не указана, due_date пустая строка. Если время не указано, due_time пустая строка.',
    'Исполнитель и участники должны соответствовать названиям из списка, либо оставь пустым.',
    'Для задачи: title — короткое действие минимум 8 символов; details — чёткая цель минимум 12 символов.',
    'Для личного чата room_kind=direct и один участник. Для группового — group и название от 3 символов.',
    'Не трактуй просьбу рассказать о задачах, чатах, визитах, встречах как создание.',
    'Доступные сотрудники: '+names.join('; ')
  ].join(' ')},{role:'user',content:question}],
  text:{format:{type:'json_schema',name:'lera360_action_draft_v1',strict:true,schema}}};
 const resp=await fetch('https://api.openai.com/v1/responses',{method:'POST',
  headers:{Authorization:'Bearer '+openai,'Content-Type':'application/json'},body:JSON.stringify(body),
  signal:AbortSignal.timeout(18000)});
 if(!resp.ok)throw Error('llm_unavailable');
 const data=await resp.json();
 const raw=(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[])
   .filter(x=>x.type==='output_text').map(x=>String(x.text||'')).join('');
 let result;try{result=JSON.parse(raw);}catch{throw Error('draft_not_structured');}
 return {result,inputTokens:Math.max(0,Math.floor(Number(data.usage?.input_tokens)||0)),outputTokens:Math.max(0,Math.floor(Number(data.usage?.output_tokens)||0))};
}
async function makeDraft({req,kind,question,actor,svc,caller,secret,openai}){
 const now=localDate();
 if(kind!=='prepare'||typeof question!=='string'||question.length<5||question.length>500)
  return fail(req,'invalid_question');
 const staff=await targetStaff(svc,actor);
 let directory=[];
 try{
   const r=await caller.rpc('connect_directory_v1');
   if(!r.error&&Array.isArray(r.data))directory=r.data.filter(x=>uuid(x.id)&&x.id!==actor.id).slice(0,80);
 }catch{}
 const names=[...new Set([...staff,...directory].map(x=>String(x.name||'')))].slice(0,70);
 let model;
 try{model=await callModel(openai,question,names,now,svc,actor.id);}
 catch{return fail(req,'action_understanding_unavailable',503);}
 if(model.action==='none')return respond(req,{mode:'not_an_action',read_only:true,created:0});
 if(model.action==='task'){
   const who=matchOne(model.assignee,staff);
   if(!who)return respond(req,{mode:'needs_details',question:'Кому именно поставить задачу? Назови сотрудника.',created:0});
   const date=esc(model.due_date),time=esc(model.due_time);
   if(!date)return respond(req,{mode:'needs_details',question:'На какую дату поставить поручение?',created:0});
   if(!dateIsValid(date,time,now))return respond(req,{mode:'needs_details',question:'Уточни будущую дату и время поручения.',created:0});
   const title=esc(model.title).slice(0,110),details=esc(model.details).slice(0,500);
   if(title.length<8||details.length<12)return respond(req,{mode:'needs_details',question:'Что конкретно нужно сделать и какой ожидается результат?',created:0});
   const draft={action:'task',assignee_id:who.id,assignee_name:who.name,
    title,due_date:date,due_time:time,details,source:SOURCE};
   const proof=await prepareToken(secret,actor.id,draft);
   const summary='Поручение для '+who.name+': '+title+'. Срок '+date+(time?' в '+time+' (Минск)':'')+'. '+details;
   return respond(req,{mode:'prepared',draft,summary,approval_token:proof.token,expires_at:proof.expires_at,requires_confirmation:true,created:0});
 }
 if(model.action==='chat'){
   const kind=model.room_kind==='group'?'group':'direct';
   const named=Array.isArray(model.participants)?model.participants.slice(0,12):[];
   const people=named.map(x=>matchOne(x,directory));
   if(!named.length||people.some(x=>!x)||new Set(people.map(x=>x.id)).size!==people.length||
      (kind==='direct'&&people.length!==1))
     return respond(req,{mode:'needs_details',question:'С кем создать чат? Назови точных участников.',created:0});
   const room_title=kind==='group'?esc(model.room_title).slice(0,100):'';
   if(kind==='group'&&room_title.length<3)
     return respond(req,{mode:'needs_details',question:'Как назвать групповой чат?',created:0});
   const draft={action:'chat',room_kind:kind,room_title,
     participant_ids:people.map(x=>x.id),participant_names:people.map(x=>x.name),source:SOURCE};
   const proof=await prepareToken(secret,actor.id,draft);
   return respond(req,{mode:'prepared',draft,summary:(kind==='direct'?'Личный чат с ':'Групповой чат «'+room_title+'» с ')+people.map(x=>x.name).join(', ')+'.',approval_token:proof.token,expires_at:proof.expires_at,requires_confirmation:true,created:0});
 }
 return fail(req,'action_not_available',400);
}
async function stableTaskId(actor,draft){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode([
  SOURCE,actor.id,draft.assignee_id,draft.due_date,draft.due_time,draft.title,draft.details
 ].join('|'))));
 const b=bytes.slice(0,16);b[6]=(b[6]&15)|0x80;b[8]=(b[8]&63)|0x80;
 const h=Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
async function execute(req,body,actor,svc,caller,secret){
 const draft=body?.draft,token=body?.approval_token;
 if(!draft||typeof draft!=='object'||draft.source!==SOURCE||!await verifyToken(secret,actor.id,draft,token))
   return fail(req,'approval_invalid_or_expired',403);
 if(body?.confirmation!=='подтверждаю')return fail(req,'explicit_confirmation_required',403);
 if(draft.action==='task'){
   const staff=await targetStaff(svc,actor),target=staff.find(x=>x.id===draft.assignee_id);
   if(!target||target.name!==draft.assignee_name||!dateIsValid(draft.due_date,draft.due_time,localDate())||
      !draft.title||draft.title.length<8||draft.title.length>110||
      !draft.details||draft.details.length<12||draft.details.length>500)
     return fail(req,'task_parameters_changed',403);
   const id=await stableTaskId(actor,draft);
   const duplicate=await svc.from('tasks').select('id').eq('id',id).limit(1);
   if(duplicate.error)return fail(req,'task_check_unavailable',503);
   if(duplicate.data?.length)return respond(req,{mode:'already_exists',created:0,task_id:id,assigned_to:target.name});
   const dueText=draft.due_time?' К '+draft.due_time+' по минскому времени.':'';
   const row={id,manager_id:target.id,manager_name:target.name,client_id:null,
    title:draft.title,text:draft.details+dueText,due_date:draft.due_date,
    done:false,auto_generated:false,review_status:'approved',reviewed_by:actor.name,
    reviewed_at:new Date().toISOString(),source:SOURCE,priority:'средний',
    basis:'Поручение создано Лерой после подтверждения авторизованного сотрудника.',
    expected_result:'Исполнитель сообщил результат поручения.',criteria:'Результат зафиксирован в CRM.',
    ai_reason:'Подтверждённое человеком действие AI Agent 360°.',
    ai_selection_context:{confirmed_by:actor.id,actor_tier:actor.tier,due_time:draft.due_time||null,
      confirmation:'explicit_user_confirmation',confirmed_at:new Date().toISOString()}};
   const inserted=await svc.from('tasks').insert(row).select('id,manager_name,source').single();
   if(inserted.error){
     if(inserted.error.code==='23505')return respond(req,{mode:'already_exists',created:0,task_id:id});
     return fail(req,'task_create_failed',503);
   }
   if(inserted.data?.id!==id||inserted.data?.manager_name!==target.name||inserted.data?.source!==SOURCE)
     return fail(req,'task_write_verification_failed',503);
   return respond(req,{mode:'created_task',created:1,task_id:id,assigned_to:target.name,
    note:draft.due_time?'Время указано в тексте задачи. Отдельное автоматическое напоминание не настроено.':''});
 }
 if(draft.action==='chat'){
   const perms=await caller.from('connect_permissions_v1').select('chat_enabled').eq('user_id',actor.id).maybeSingle();
   if(perms.error||perms.data?.chat_enabled!==true)return fail(req,'connect_chat_not_authorized',403);
   const directory=await caller.rpc('connect_directory_v1');
   if(directory.error)return fail(req,'connect_directory_unavailable',503);
   const memberIds=draft.participant_ids;
   if(!Array.isArray(memberIds)||memberIds.length<1||memberIds.length>12||
     memberIds.some(x=>!uuid(x)||x===actor.id)||
     new Set(memberIds).size!==memberIds.length)return fail(req,'invalid_members',400);
   const members=memberIds.map(x=>(directory.data||[]).find(y=>y.id===x));
   if(members.some((x,i)=>!x||x.name!==draft.participant_names?.[i]))
     return fail(req,'chat_members_changed',403);
   if(!['direct','group'].includes(draft.room_kind)||draft.room_kind==='direct'&&memberIds.length!==1||
      draft.room_kind==='group'&&(typeof draft.room_title!=='string'||draft.room_title.length<3||draft.room_title.length>100))
     return fail(req,'chat_parameters_invalid',400);
   // This existing SECURITY DEFINER RPC checks auth.uid(), membership, role and
   // protects against duplicate direct rooms. Never call with service-role JWT.
   const created=await caller.rpc('connect_create_room_v1',{p_kind:draft.room_kind,
     p_title:draft.room_title,p_other_members:memberIds});
   if(created.error||!uuid(created.data))return fail(req,'connect_create_failed',503);
   const check=await caller.from('connect_room_members_v1').select('user_id').eq('room_id',created.data).eq('user_id',actor.id).maybeSingle();
   if(check.error||check.data?.user_id!==actor.id)return fail(req,'chat_write_verification_failed',503);
   return respond(req,{mode:'created_chat',created:1,room_id:created.data,
     participants:draft.participant_names});
 }
 return fail(req,'unsupported_action',400);
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req.headers.get('Origin'))});
 if(req.method!=='POST')return fail(req,'method_not_allowed',405);
 const origin=req.headers.get('Origin');
 if(origin&&!ORIGINS.has(origin))return fail(req,'origin_not_allowed',403);
 const bearer=String(req.headers.get('Authorization')||'');
 if(!bearer.startsWith('Bearer ')||bearer.length<22||bearer.length>6100)return fail(req,'not_authorized',401);
 const jwt=bearer.slice(7);
 const url=Deno.env.get('SUPABASE_URL')||'',secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
   anon=Deno.env.get('SUPABASE_ANON_KEY')||'',openai=Deno.env.get('OPENAI_API_KEY')||'';
 if(!url||!secret||!anon||!openai)return fail(req,'service_unconfigured',503);
 const svc=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const userResult=await svc.auth.getUser(jwt).catch(()=>null),user=userResult?.data?.user;
 if(!user?.id)return fail(req,'not_authorized',403);
 const prof=await svc.from('users').select('id,name,role,region,email,access_scope').eq('id',user.id).maybeSingle();
 if(prof.error)return fail(req,'user_profile_unavailable',503);
 const actor=actorFor(user,prof.data);
 if(!actor)return fail(req,'not_authorized_role',403);
 const caller=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},
   global:{headers:{Authorization:'Bearer '+jwt}}});
 let body;try{body=await req.json();}catch{return fail(req,'bad_json');}
 if(body?.kind==='capabilities')return respond(req,{mode:'lera_action_v1',
   task:true,chat:true,confirmation_required:true,no_automatic_writes:true});
 try{
   if(body?.kind==='prepare')return await makeDraft({req,kind:'prepare',
     question:body.question,actor,svc,caller,secret,openai});
   if(body?.kind==='commit')return await execute(req,body,actor,svc,caller,secret);
   return fail(req,'unknown_action',400);
 }catch(e){
   console.warn('Lera action safe error',String(e?.message||'error').slice(0,75));
   return fail(req,'action_temporarily_unavailable',503);
 }
});
