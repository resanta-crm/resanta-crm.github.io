// RESANTA AI360 / task proposals v1. STAGED: read-only, director/Vitebsk only.
// Deployed endpoint: strictly read-only. No insert/update/delete, no task creation, no LLM generation.
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const ORIGINS = new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const OWNER_ID = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const PILOT_BRANCH = 'Витебск'; // branch affiliation, NOT client geographic region
const lastRequest = new Map<string,number>(); // best-effort, worker-local throttle; not a durable quota
const norm = (x:unknown) => String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
const cors = (origin:string|null) => ({
  'Access-Control-Allow-Origin':ORIGINS.has(origin||'')?origin!:'https://resanta-crm.by',
  'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods':'OPTIONS, POST',
  'Vary':'Origin'
});
const reply=(request:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...cors(request.headers.get('Origin')),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
function todayInMinsk(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p=(type:string)=>parts.find(x=>x.type===type)?.value||'';
  return p('year')+'-'+p('month')+'-'+p('day');
}
function deadline(today:string){
  const d=new Date(today+'T12:00:00Z');
  let days=0;
  while(days<5){d.setUTCDate(d.getUTCDate()+1);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)days++;}
  return d.toISOString().slice(0,10);
}
// Evidence-only rule engine: no invented SKUs, budgets, reasons or promises.
function draftFor(row:any, today:string){
  const oldSales=Number(row.closed_year_ago)||0;
  const newSales=Number(row.closed_month)||0;
  const delta=Math.max(0,oldSales-newSales);
  const drop=oldSales>0?delta/oldSales:0;
  const last=typeof row.last_visit==='string'?row.last_visit.slice(0,10):'';
  const lastValid=/^\d{4}-\d\d-\d\d$/.test(last)&&last<=today;
  const daysFromVisit=lastValid?Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/86400000):null;
  const stale=daysFromVisit===null||daysFromVisit>45;
  const bigDrop=drop>=0.5;
  const kind=stale?'visit':bigDrop?'recovery':'order';
  const title=kind==='visit'?'Назначить визит и восстановить контакт':
    kind==='recovery'?'Разобраться с резким падением закупок':'Уточнить потребность и подготовить повторный заказ';
  const action=kind==='visit'?
    'Связаться с клиентом и согласовать дату визита. На встрече уточнить потребность и причины снижения связанных закупок.':
    kind==='recovery'?
    'Выяснить, почему связанные закупки снизились более чем наполовину, и согласовать следующий конкретный шаг по заказу.':
    'Проверить актуальную потребность клиента, уточнить сроки и ориентировочную сумму следующего заказа.';
  const outcome=kind==='visit'?
    'Дата и цель визита либо записанная причина отказа; следующий шаг по закупкам.':
    kind==='recovery'?
    'Подтверждённая клиентом причина изменения закупок и согласованный следующий шаг со сроком.':
    'Согласованная дата и сумма возможного следующего заказа либо подтверждённая причина отказа.';
  const criteria=kind==='visit'?'Дата визита или причина отказа и следующий шаг записаны в CRM.':
    kind==='recovery'?'Причина и план восстановления закупок со сроком зафиксированы в CRM.':
    'Зафиксированы сумма/дата следующего заказа или причина отказа.';
  const visitBasis=lastValid?' Последний сохранённый визит: '+last+'.':' Сохранённых визитов в CRM не найдено.';
  return {title,text:action,expected_result:outcome,criteria,priority:(bigDrop||stale)?'высокий':'средний',
    basis_detail:' Разница: '+delta.toFixed(2)+' BYN (снижение '+(drop*100).toFixed(1)+'%).'+visitBasis};
}
function words(value:string){
  return norm(value).replace(/ё/g,'е').split(/[^а-яa-z0-9-]+/).filter(Boolean);
}
function mentionedManager(question:string,roster:any[]){
  const queryWords=words(question);
  const matched=roster.filter(m=>{
    const surname=words(m.name).at(-1)||'';
    return surname.length>=4&&queryWords.some(w=>w===surname||(w.startsWith(surname)&&w.length<=surname.length+3));
  });
  return matched.length===1?matched[0]:null;
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=='POST')return reply(req,{error:'method_not_allowed'},405);
  if(origin&&!ORIGINS.has(origin))return reply(req,{error:'origin_not_allowed'},403);
  const auth=req.headers.get('Authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token||token.length>6000)return reply(req,{error:'not_authorized'},401);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!secret)return reply(req,{error:'service_unavailable'},503);
  const svc=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const identity=await svc.auth.getUser(token).catch(()=>null);
  const user=identity?.data?.user;
  if(!user?.id||user.id!==OWNER_ID)return reply(req,{error:'not_authorized'},403);
  const profile=await svc.from('users').select('id,name,role').eq('id',user.id).maybeSingle();
  if(profile.error||profile.data?.role!=='boss'||norm(profile.data?.name)!=='александр паюшин')
    return reply(req,{error:'not_authorized'},403);
  let payload:any;
  try{payload=await req.json();}catch{return reply(req,{error:'bad_json'},400);}
  if(payload?.kind==='directory'){
    const users=await svc.from('users').select('name,role').eq('role','manager').eq('region',PILOT_BRANCH).limit(20);
    if(users.error)return reply(req,{error:'directory_unavailable'},503);
    return reply(req,{staff:users.data||[],mode:'readonly'});
  }
  const isQuery=payload?.kind==='preview_query';
  if((!isQuery&&payload?.kind!=='preview')||
    (isQuery?(typeof payload?.message!=='string'||payload.message.trim().length<10||payload.message.length>300):
      (typeof payload?.manager!=='string'||payload.manager.length>80)))
    return reply(req,{error:'invalid_request'},400);
  const stamp=Date.now(),last=lastRequest.get(user.id)||0;
  if(stamp-last<4000)return reply(req,{error:'try_again_later'},429);
  lastRequest.set(user.id,stamp);
  if(lastRequest.size>50)lastRequest.clear();
  let manager:any=null;
  if(isQuery){
    // One verified server request instead of directory + preview roundtrips.
    const roster=await svc.from('users').select('id,name,role,region')
      .eq('role','manager').eq('region',PILOT_BRANCH).limit(20);
    if(roster.error||(roster.data||[]).length>=20)
      return reply(req,{error:'directory_unavailable'},503);
    manager=mentionedManager(payload.message,roster.data||[]);
  }else{
    const requested=payload.manager.trim();
    const managers=await svc.from('users').select('id,name,role,region')
      .eq('role','manager').eq('region',PILOT_BRANCH).ilike('name',requested).limit(2);
    if(managers.error||managers.data?.length!==1||norm(managers.data[0].name)!==norm(requested))
      return reply(req,{error:'manager_not_found'},400);
    manager=managers.data[0];
  }
  if(!manager)return reply(req,{error:'manager_not_found_or_ambiguous'},400);
  const today=todayInMinsk();
  const result=await svc.rpc('crm_ai360_operations_snapshot_v1',{
    p_manager:manager.name,p_month:today.slice(0,7)+'-01'
  });
  if(result.error||!result.data?.period||result.data.period.as_of!==today)
    return reply(req,{error:'snapshot_unavailable'},503);
  const period=result.data.period;
  const rows=(Array.isArray(result.data.declining_clients)?result.data.declining_clients:[]).slice(0,8)
    .filter((x:any)=>Number(x.closed_year_ago)>0 && Number(x.closed_month)<Number(x.closed_year_ago)
      && Number(x.open_tasks)===0 && !x.next_route && typeof x.client_name==='string');
  if(!rows.length)return reply(req,{items:[],as_of:today,manager:manager.name,mode:'readonly'});
  const names=[...new Set(rows.map((x:any)=>x.client_name))] as string[];
  const clients=await svc.from('clients').select('id,name,manager_id,manager_name,region,is_archived,to_delete')
    .eq('manager_name',manager.name).in('name',names).limit(30);
  if(clients.error)return reply(req,{error:'client_verification_unavailable'},503);
  // Name lookup is capped; never assume uniqueness if the capped result may be incomplete.
  if((clients.data||[]).length>=30)return reply(req,{error:'client_verification_incomplete'},503);
  // A branch's manager may serve Mozyr/Bobruisk etc. Geographic 'clients.region' is NOT
  // a branch access key. Enforce Vitebsk pilot through the manager's users.region
  // and verify the client's current named/ID assignment instead.
  // Count ALL matching names (including archived rows) before accepting uniqueness.
  const byName=new Map<string,any[]>();
  for(const c of clients.data||[])byName.set(c.name,[...(byName.get(c.name)||[]),c]);
  const unique=rows.map((r:any)=>{
    const matched=byName.get(r.client_name)||[];
    const c=matched.length===1?matched[0]:null;
    return {r,c:c&&!c.is_archived&&!c.to_delete
      && norm(c.manager_name)===norm(manager.name)
      && (!c.manager_id||c.manager_id===manager.id)?c:null};
  }).filter((x:any)=>x.c).slice(0,8);
  if(!unique.length)return reply(req,{items:[],as_of:today,manager:manager.name,mode:'readonly'});
  const ids=unique.map((x:any)=>x.c.id);
  // Independent read-only checks can run in parallel; fail closed on either error.
  const [tasks,routes]=await Promise.all([
    svc.from('tasks').select('client_id,done,review_status')
      .in('client_id',ids).or('done.eq.false,done.is.null').limit(150),
    svc.from('route_plans').select('client_id,visit_date,removed')
      .in('client_id',ids).gte('visit_date',today).lte('visit_date',deadline(today))
      .or('removed.eq.false,removed.is.null').limit(150)
  ]);
  if(tasks.error)return reply(req,{error:'task_verification_unavailable'},503);
  if(routes.error)return reply(req,{error:'route_verification_unavailable'},503);
  // Fail closed on truncated checks: never claim no duplicates when results are incomplete.
  if((tasks.data||[]).length>=150||(routes.data||[]).length>=150)
    return reply(req,{error:'verification_incomplete'},503);
  const busy=new Set((tasks.data||[]).map((x:any)=>x.client_id));
  const scheduled=new Set((routes.data||[]).map((x:any)=>x.client_id));
  const items=unique.filter((x:any)=>!busy.has(x.c.id)&&!scheduled.has(x.c.id))
    .slice(0,3).map((x:any,i:number)=>{
      const plan=draftFor(x.r,today);
      return {
        draft_id:'preview-'+(i+1),client_id:x.c.id,client_name:x.c.name,
        manager_name:manager.name,title:plan.title,text:plan.text,
        due_date:deadline(today),priority:plan.priority,
        basis:'Связанные продажи CRM: '+period.last_closed_month+' — '+Number(x.r.closed_month).toFixed(2)
          +' BYN; '+period.last_closed_year_ago+' — '+Number(x.r.closed_year_ago).toFixed(2)+' BYN.'+plan.basis_detail,
        expected_result:plan.expected_result,criteria:plan.criteria,
        source:'purchase_history + visits + clients + tasks + route_plans',
        as_of:today
      };
    });
  return reply(req,{items,as_of:today,manager:manager.name,mode:'readonly',
    warning:'Сравниваются только связанные с клиентом продажи завершённого месяца. Черновики не являются задачами и не сохраняются.'});
});
