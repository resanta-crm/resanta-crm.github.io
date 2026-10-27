import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

// Director pilot of one natural-language, read-only gateway.
// Authentication, tool selection, CRM evidence and response generation all run server-side.
// Never interpret conversational consent as permission to mutate CRM.
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const OWNER_ID='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const DOMAINS=new Set(['sales','operations','promotions','triovist','vip','payments']);
const ru=(s:any)=>String(s||'').trim().toLocaleLowerCase('ru-RU').replaceAll('ё','е');
const safe=(s:any)=>String(s??'').replace(/[\r\n]+/g,' ').trim().slice(0,160);
const cash=(n:any)=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const cors=(o:string|null)=>({'Access-Control-Allow-Origin':o && ORIGINS.has(o)?o:'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'OPTIONS,POST','Vary':'Origin'});
const reply=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 ...cors(req.headers.get('Origin')),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function minskDate(){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(t:string)=>p.find(x=>x.type===t)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
function priorMonth(d:string){const x=new Date(d.slice(0,7)+'-01T12:00:00Z');x.setUTCMonth(x.getUTCMonth()-1);return x.toISOString().slice(0,7);}
function lastYear(m:string){return String(Number(m.slice(0,4))-1)+m.slice(4);}
function baseline(q:string){
 const s=ru(q);const d=[];
 if(/акци|промо|бонус|эффективност/.test(s))d.push('promotions');
 if(/платеж|оплат|счет|счёт|реестр безнал/.test(s))d.push('payments');
 if(/триовист|21век|21vek|21 век/.test(s))d.push('triovist');
 if(/вип|vip/.test(s))d.push('vip');
 if(/продаж|выруч|оборот|план|кпи/.test(s))d.push('sales');
 if(/задолж|пдз|долг|маршрут|посещ|задач|клиент|визит/.test(s))d.push('operations');
 return d.length?d:['sales','operations'];
}
async function modelJSON(key:string,system:string,user:unknown,maxTokens=300):Promise<any>{
 const resp=await fetch('https://api.openai.com/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:'gpt-4o-mini',temperature:0,response_format:{type:'json_object'},
   max_tokens:maxTokens,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}]}),
  signal:AbortSignal.timeout(12000)});
 if(!resp.ok)throw new Error('llm_'+resp.status);
 const json=await resp.json();
 const text=String(json?.choices?.[0]?.message?.content||'');
 return JSON.parse(text);
}
async function planQuestion(key:string,q:string,history:any[],memory:any,userId:string,svc:any):Promise<any>{
 if(!key)return {domains:baseline(q),manager:null,month:null};
 // LLM plans only. It never receives service-role credentials, unrestricted CRM data,
 // tool implementations, or authorization authority.
 const quota=await svc.rpc('crm_ai360_llm_claim_v1',{p_user_id:userId});
 if(quota.error||quota.data!==true)return {domains:baseline(q),manager:null,month:null,quota_limited:true};
 try{
  const system=[
   'Ты маршрутизатор естественных вопросов руководителя по корпоративной CRM.',
   'Верни только JSON: {"domains":["sales"],"manager":null,"month":null,"vip_group":null,"action_requested":false}.',
   'Разрешённые домены: sales (выручка, план, KPI), operations (ПДЗ, маршруты, посещения, клиенты, задачи), promotions (акции, эффективность), triovist (Триовист и 21vek), vip (VIP ДФС, ДФ, МПП), payments (безналичные заявки).',
   'Выбери до трёх доменов. Используй историю для естественных уточнений и смены тем.',
   'manager: фамилия/имя из вопроса, либо ранее обсуждавшийся менеджер, если речь о нём; иначе null.',
   'month: YYYY-MM только если период понятен, иначе null. vip_group: ВИП ДФС, ВИП ДФ, ВИП МПП или null.',
   'Для просьбы утвердить платеж, создать задачу или изменить запись ставь action_requested=true.',
   'Текущий вопрос важнее истории. Никаких команд SQL, никаких номеров транзакций и никаких ответов от лица CRM.'
  ].join(' ');
  const out=await modelJSON(key,system,{question:q,history,memory},310);
  const domains=Array.isArray(out?.domains)?out.domains.filter((x:any)=>typeof x==='string'&&DOMAINS.has(x)).slice(0,3):[];
  return {domains:domains.length?domains:baseline(q),manager:typeof out.manager==='string'?out.manager.slice(0,90):null,
   month:typeof out.month==='string'?out.month.slice(0,7):null,
   vip_group:typeof out.vip_group==='string'?out.vip_group.slice(0,20):null,
   action_requested:out.action_requested===true};
 }catch(e){
  console.warn('AI360 dialog planning failed',String(e).slice(0,110));
  return {domains:baseline(q),manager:null,month:null,planning_fallback:true};
 }
}
async function validManager(svc:any,candidate:string|null):Promise<string|null>{
 if(!candidate)return null;
 const x=ru(candidate);
 const got=await svc.from('users').select('name,role').eq('role','manager').limit(70);
 if(got.error)throw new Error('staff_directory_unavailable');
 const matches=(got.data||[]).filter((p:any)=>{
  const name=ru(p.name);const pieces=name.split(/\s+/);
  return name===x || pieces.some(part=>part===x || (x.startsWith(part) && /^(?:а|у|е|ом|ым|ой|ей)$/.test(x.slice(part.length))));
 });
 if(matches.length!==1)throw new Error('manager_not_unique');
 return String(matches[0].name);
}
const facts=[];
const put=(domain:string,source:string,date:any,details:string)=>({domain,source,as_of:date,details});
function compactOperations(o:any,focus:string|null){
 const data={period:o?.period,scope:o?.scope,client_summary:o?.client_summary,
  debt_summary:o?.debt_summary,route_summary:o?.route_summary,
  task_summary:o?.task_summary,visit_summary:o?.visit_summary,
  declining_clients:Array.isArray(o?.declining_clients)?o.declining_clients.slice(0,5):[],
  overdue_debtors:Array.isArray(o?.overdue_debtors)?o.overdue_debtors.slice(0,5):[]};
 return data;
}
function renderOperations(d:any,focus:string|null,question:string){
 const s=[],v=d.client_summary||{},debt=d.debt_summary||{},route=d.route_summary||{},tasks=d.task_summary||{};
 const targeted=ru(question);
 if(/долг|задолж|дебит|пдз|критич|оплат/.test(targeted))
  s.push('Просроченная ПДЗ: '+cash(debt.amount)+', записей должников '+Number(debt.debtor_rows||0)+'. Отчёт на '+String(debt.report_date||'не указан')+'.');
 if(/маршрут|посещ|визит|клиент|куда|заех|забы/.test(targeted)){
  s.push('Клиенты: закреплённых '+Number(v.active_clients||0)+', со снижением закупок за закрытый месяц '+Number(v.yoy_down_clients||0)+'.');
  s.push('Маршруты на 30 дней: '+Number(route.planned_next30||0)+' запланировано, '+Number(route.approved_next30||0)+' согласовано. План маршрута не подтверждает посещение.');
 }
 if(/задач|поруч|просроч/.test(targeted))s.push('Открыто задач: '+Number(tasks.open_tasks||0)+', с истекшим сроком '+Number(tasks.overdue_tasks||0)+'. Статус выполнения нужно проверить.');
 if(!s.length)s.push('ПДЗ: '+cash(debt.amount)+'. Клиентов со снижением закупок: '+Number(v.yoy_down_clients||0)+'. Открытых задач: '+Number(tasks.open_tasks||0)+'.');
 if(d.declining_clients?.length && /клиент|почему|кому|куда|заех|забы|план|что делать/.test(targeted)){
  const names=d.declining_clients.slice(0,3).map((x:any)=>safe(x.client_name)+' (снижение '+cash(x.loss)+', визит '+String(x.last_visit||'нет даты')+', маршрут '+String(x.next_route||'нет даты')+')');
  s.push('Требуют проверки: '+names.join('; ')+'.');
 }
 return (focus?'По '+focus+'. ':'')+s.join(' ');
}
function renderSales(s:any,manager:string|null){
 const m=Array.isArray(s?.managers)?s.managers:[];
 if(manager){
  const x=m.find((x:any)=>ru(x.manager_name)===ru(manager));
  if(!x)return 'Для '+manager+' нет подтверждённого KPI за выбранный месяц. Нельзя подставлять общий оборот вместо персонального плана.';
  return 'По '+manager+': план '+cash(x.plan)+', факт '+cash(x.actual)+', выполнение '+Number(x.plan_pct||0).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%, до плана '+cash(Math.max(0,Number(x.to_plan)||0))+'.';
 }
 const total=Array.isArray(m)?m.slice(0,6).map(x=>safe(x.manager_name)+' — '+cash(x.actual)+', выполнение '+Number(x.plan_pct||0)+'%'):[];
 return 'Общая выручка импортированных продаж '+cash(s?.network_revenue)+'. KPI менеджеров: '+total.join('; ')+'. Не путать общую выручку с суммой планов менеджеров.';
}
function renderPromotions(rows:any[],count:number,question:string){
 if(!count)return 'Сейчас нет действующих акций со статусом «В работе».';
 const efficient=/эффектив|отклон|выполн|результ|окуп|сравн|расход/.test(ru(question));
 const list=rows.slice(0,6).map(x=>{
  const p=Number(x.sales_plan||0),fact=Number(x.confirmed_sales||0);
  const valid=Number.isFinite(fact)&&Number.isFinite(p)&&p>0&&x.confirmed_sales!==null;
  const ratio=valid?' подтверждённые продажи '+cash(fact)+', выполнение плана '+(fact/p*100).toFixed(1)+'%':' подтверждённый факт/план для расчёта не получен';
  return safe(x.title)+' ('+safe(x.client_name)+', до '+x.end_date+')'+(efficient?','+ratio:'');
 });
 return 'Действующих акций: '+count+'. '+list.join('; ')+'. Выполнение плана не является доказательством дополнительной прибыли: для рентабельности нужны затраты и сопоставимая база.';
}
function renderPayments(rows:any[],count:number){
 if(!count)return 'Заявок со статусами «На согласовании» и «Согласовано» сейчас не найдено.';
 return 'Безналичных заявок в очереди: '+count+'. '+rows.slice(0,5).map(x=>
   safe(x.description)+' — '+Number(x.amount||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' '+safe(x.currency||'')+
   ', статус '+safe(x.status)+', срок '+String(x.due_date||'не указан')).join('; ')+
   '. Могу подготовить проект решения, но голосом ничего не утвердил.';
}
function renderTriovist(t:any){
 const plan=Number(t.plan||0),fact=Number(t.revenue||0);
 return 'Триовист: месяц '+String(t.month)+', отгрузки '+cash(fact)+', план '+cash(plan)+
   (plan>0?', выполнение '+(fact/plan*100).toFixed(1)+'%':', подтверждённый план не найден')+
   '. Последний импорт продаж '+String(t.sales_import_at||'не указан')+
   '. Новых задач '+Number(t.new_tasks||0)+', ожидают согласования '+Number(t.pending_approval||0)+'.';
}
function renderVIP(members:any[],salesMonth:string,previousMonth:string,rows:any[],group:string|null){
 const groups:Record<string,any>={};
 for(const m of members){
  const key=safe(m.department),g=groups[key]||(groups[key]={members:0,with_id:0,actual:0,previous:0,byCategory:{}});
  g.members++;if(m.client_id)g.with_id++;
 }
 const idMap=new Map<string,string>(members.filter(x=>x.client_id).map(x=>[String(x.client_id),safe(x.department)]));
 for(const x of rows){
  const dep=idMap.get(x.client_id);
  if(!dep)continue;
  const g=groups[dep];const revenue=Number(x.revenue||0);
  if(x.month===salesMonth+'-01'){
   g.actual+=revenue;
   const cat=safe(x.category||'Без группы');g.byCategory[cat]=(g.byCategory[cat]||0)+revenue;
  }else if(x.month===previousMonth+'-01')g.previous+=revenue;
 }
 const filter=ru(group||'');const lines=[];
 for(const [name,g] of Object.entries(groups) as Array<[string,any]>){
  if(filter && ru(name)!==filter)continue;
  const cat=(Object.entries(g.byCategory) as Array<[string,number]>).sort((a,b)=>b[1]-a[1]).slice(0,3)
   .map(([name,amount])=>name+': '+cash(amount));
  lines.push(name+': клиентов '+g.members+', с подтверждённым client_id '+g.with_id+
   ', продажи за '+salesMonth+' по этим ID '+cash(g.actual)+
   ', за '+previousMonth+' '+cash(g.previous)+'. Группы: '+(cat.join(', ')||'нет связанных позиций')+'.');
 }
 if(!lines.length)return 'Подтверждённых VIP-клиентов в выбранной группе не найдено.';
 return lines.join(' ')+' Данные частичные для клиентов без client_id и ограничены связанными позициями. Полное сопоставление требует VIP-отчёта.';
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req.headers.get('Origin'))});
 if(req.method!=='POST')return reply(req,{error:'method_not_allowed'},405);
 const origin=req.headers.get('Origin');
 if(origin&&!ORIGINS.has(origin))return reply(req,{error:'origin_not_allowed'},403);
 const token=String(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!token||token.length>6000)return reply(req,{error:'not_authorized'},401);
 const url=Deno.env.get('SUPABASE_URL')||'',secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!secret)return reply(req,{error:'server_configuration_missing'},503);
 const svc=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
 const verified=await svc.auth.getUser(token).catch(()=>null);
 const u=verified?.data?.user;
 if(!u?.id||u.id!==OWNER_ID)return reply(req,{error:'not_authorized'},403);
 const profile=await svc.from('users').select('id,role,name').eq('id',u.id).maybeSingle();
 if(profile.error||profile.data?.role!=='boss'||ru(profile.data?.name)!=='александр паюшин')
   return reply(req,{error:'not_authorized'},403);
 let b:any;
 try{b=await req.json();}catch{return reply(req,{error:'bad_json'},400);}
 if(b?.kind==='status')return reply(req,{ready:true,mode:'director_pilot_readonly',domains:[...DOMAINS]});
 const question=String(b?.message||'').trim().slice(0,400);
 if(question.length<2)return reply(req,{error:'question_invalid'},400);
 const history=Array.isArray(b?.history)?b.history.slice(-10).map((x:any)=>({role:x?.role==='assistant'?'assistant':'user',
  text:String(x?.content||'').slice(0,350)})):[];
 const memory=typeof b?.memory==='object'&&b.memory?{
  manager:String(b.memory.manager||'').slice(0,80),month:String(b.memory.month||'').slice(0,7),
  domain:String(b.memory.domain||'').slice(0,30)
 }:{};
 let plan=await planQuestion(Deno.env.get('OPENAI_API_KEY')||'',question,history,memory,u.id,svc);
 const network=/по всей сети|все менеджеры|всех менеджеров|общ(?:ая|ие) продаж|в целом по сети/i.test(question);
 const sameEmployeeTopic=plan.domains.every((domain:string)=>domain==='sales'||domain==='operations') &&
  ['sales','operations'].includes(String(memory.domain||''));
 const candidate=network?null:(plan.manager||(sameEmployeeTopic?memory.manager:null));
 let manager=null;
 try{manager=await validManager(svc,candidate);}catch(e){
  return reply(req,{answer:'Уточни, пожалуйста, фамилию менеджера: я не могу однозначно подтвердить сотрудника в CRM.',
   intent:'clarification',answer_verified:false,source:'CRM users'});
 }
 const now=minskDate(),currentMonth=now.slice(0,7);
 const picked=plan.month||(!network?memory.month:null)||currentMonth;
 const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(picked)&&picked>='2025-01'&&picked<=currentMonth?picked:currentMonth;
 const domains=[...new Set<string>(plan.domains as string[])].filter(x=>DOMAINS.has(x)).slice(0,3);
 const reports:Array<{domain:string;source:string;as_of:any;details:string}>=[],failed:string[]=[];
 await Promise.all(domains.map(async domain=>{
  try{
   if(domain==='sales'){
    const r=await svc.rpc('crm_ai360_sales_kpi_snapshot_v1',{p_month:month+'-01'});
    if(r.error||!r.data)throw new Error('sales_snapshot');
    const snapshot=r.data;
    if(manager)snapshot.managers=(snapshot.managers||[]).filter((x:any)=>ru(x.manager_name)===ru(manager));
    reports.push(put(domain,'crm_ai360_sales_kpi_snapshot_v1',snapshot?.freshness?.last_success_at||now,
      renderSales(snapshot,manager)));return;
   }
   if(domain==='operations'){
    const r=await svc.rpc('crm_ai360_operations_snapshot_v1',{p_manager:manager,p_month:month+'-01'});
    if(r.error||!r.data)throw new Error('operations_snapshot');
    const d=compactOperations(r.data,manager);
    if(manager&&ru(d.scope)!==ru(manager))throw new Error('manager_scope_mismatch');
    reports.push(put(domain,'crm_ai360_operations_snapshot_v1',d.period?.as_of||now,
      renderOperations(d,manager,question)));return;
   }
   if(domain==='promotions'){
    const r=await svc.from('promotions').select('title,client_name,start_date,end_date,sales_plan,confirmed_sales,actual_spend,status',{count:'exact'})
      .eq('status','in_work').lte('start_date',now).gte('end_date',now).order('end_date').limit(40);
    if(r.error)throw new Error('promotions_read_failed');
    reports.push(put(domain,'promotions (in_work, date_valid)',now,renderPromotions(r.data||[],r.count??(r.data||[]).length,question)));return;
   }
   if(domain==='payments'){
    const r=await svc.from('payment_registry')
     .select('id,description,amount,currency,status,due_date,category',{count:'exact'})
     .in('status',['submitted','approved']).order('created_at',{ascending:false}).limit(30);
    if(r.error)throw new Error('payments_read_failed');
    reports.push(put(domain,'payment_registry (read-only)',now,renderPayments(r.data||[],r.count??(r.data||[]).length)));return;
   }
   if(domain==='triovist'){
    const r=await svc.rpc('crm_ai360_triovist_brief_v1',{p_month:month+'-01'});
    if(r.error||!r.data)throw new Error('triovist_snapshot');
    reports.push(put(domain,'crm_ai360_triovist_brief_v1',r.data.sales_import_at||now,renderTriovist(r.data)));return;
   }
   if(domain==='vip'){
    const m=await svc.from('vip_membership_v236429').select('client_name,department,client_id').eq('active',true).limit(200);
    if(m.error)throw new Error('vip_membership_failed');
    const members=m.data||[],ids=[...new Set(members.map(x=>x.client_id).filter(Boolean))];
    const closed=priorMonth(now),prev=lastYear(closed);
    let rows:any[]=[];
    if(ids.length){
     const s=await svc.from('purchase_history').select('client_id,month,category,revenue')
      .in('client_id',ids).in('month',[closed+'-01',prev+'-01']).limit(4500);
     if(s.error)throw new Error('vip_sales_failed');
     rows=s.data||[];
    }
    const group=plan.vip_group;
    reports.push(put(domain,'vip_membership_v236429 + linked purchase_history',closed,
      renderVIP(members,closed,prev,rows,group)));return;
   }
  }catch(e){
   console.warn('AI360 domain unavailable',domain,String(e).slice(0,100));
   failed.push(domain);
  }
 }));
 const order=['sales','operations','promotions','payments','vip','triovist'];
 reports.sort((a,b)=>order.indexOf(a.domain)-order.indexOf(b.domain));
 const pieces=reports.map(x=>x.details);
 let answer=pieces.join('\n\n');
 if(failed.length)answer+='\n\nИсточники временно недоступны: '+failed.join(', ')+'. Не заменяю их предположениями.';
 if(plan.action_requested||/согласовано|согласуй|утверди|оплати|создай поручен/i.test(question))
  answer+='\n\nЭто анализ и подготовка решения, не фактическое согласование или запись. Конкретное действие проводится отдельно через существующий защищённый процесс CRM.';
 if(!answer)answer='Подтверждённые данные по вопросу пока недоступны. Не буду придумывать показатели.';
 return reply(req,{answer,answer_verified:failed.length===0,intent:'unified_dialog',
  sources:reports.map(x=>({domain:x.domain,source:x.source,as_of:x.as_of})),
  failed_domains:failed,month,manager,mode:'director_readonly',planning_fallback:!!plan.planning_fallback,
  memory:{manager:manager||'',month,domain:domains[0]||''}});
});
