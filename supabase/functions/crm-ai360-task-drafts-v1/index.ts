// RESANTA AI360 / task proposals v1. STAGED: read-only, director/Vitebsk only.
// Not deployed. No insert/update/delete, no task creation, no LLM generation.
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const ORIGINS = new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const OWNER_ID = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const VITEBSK_REGIONS = new Set(['витебская область','витебск']);
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
function titleOf(row:any){return 'Восстановить контакт и уточнить потребность';}
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
    const users=await svc.from('users').select('name,role').eq('role','manager').eq('region','Витебск').limit(20);
    if(users.error)return reply(req,{error:'directory_unavailable'},503);
    return reply(req,{staff:users.data||[],mode:'readonly'});
  }
  if(payload?.kind!=='preview'||typeof payload?.manager!=='string'||payload.manager.length>80)
    return reply(req,{error:'invalid_request'},400);
  const stamp=Date.now(),last=lastRequest.get(user.id)||0;
  if(stamp-last<20000)return reply(req,{error:'try_again_later'},429);
  lastRequest.set(user.id,stamp);
  if(lastRequest.size>50)lastRequest.clear();
  const requested=payload.manager.trim();
  const managers=await svc.from('users').select('id,name,role,region')
    .eq('role','manager').eq('region','Витебск').ilike('name',requested).limit(2);
  if(managers.error||managers.data?.length!==1||norm(managers.data[0].name)!==norm(requested))
    return reply(req,{error:'manager_not_found'},400);
  const manager=managers.data[0];
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
  const accepted=(clients.data||[]).filter((c:any)=>!c.is_archived&&!c.to_delete
    && VITEBSK_REGIONS.has(norm(c.region))
    && (!c.manager_id||c.manager_id===manager.id));
  const byName=new Map<string,any[]>();
  for(const c of accepted)byName.set(c.name,[...(byName.get(c.name)||[]),c]);
  const unique=rows.map((r:any)=>({r,c:(byName.get(r.client_name)||[]).length===1?byName.get(r.client_name)![0]:null}))
    .filter((x:any)=>x.c).slice(0,8);
  if(!unique.length)return reply(req,{items:[],as_of:today,manager:manager.name,mode:'readonly'});
  const ids=unique.map((x:any)=>x.c.id);
  const tasks=await svc.from('tasks').select('client_id,done,review_status')
    .in('client_id',ids).or('done.eq.false,done.is.null').limit(150);
  if(tasks.error)return reply(req,{error:'task_verification_unavailable'},503);
  const routes=await svc.from('route_plans').select('client_id,visit_date,removed')
    .in('client_id',ids).gte('visit_date',today).lte('visit_date',deadline(today))
    .or('removed.eq.false,removed.is.null').limit(150);
  if(routes.error)return reply(req,{error:'route_verification_unavailable'},503);
  // Fail closed on truncated checks: never claim no duplicates when results are incomplete.
  if((tasks.data||[]).length>=150||(routes.data||[]).length>=150)
    return reply(req,{error:'verification_incomplete'},503);
  const busy=new Set((tasks.data||[]).map((x:any)=>x.client_id));
  const scheduled=new Set((routes.data||[]).map((x:any)=>x.client_id));
  const items=unique.filter((x:any)=>!busy.has(x.c.id)&&!scheduled.has(x.c.id))
    .slice(0,3).map((x:any,i:number)=>({
      draft_id:'preview-'+(i+1),client_id:x.c.id,client_name:x.c.name,
      manager_name:manager.name,title:titleOf(x.r),
      text:'Связаться с клиентом, уточнить причину изменения закупок и следующий заказ.',
      due_date:deadline(today),priority:'средний',
      basis:'По связанным продажам CRM: '+period.last_closed_month+' — '+Number(x.r.closed_month).toFixed(2)
        +' BYN; '+period.last_closed_year_ago+' — '+Number(x.r.closed_year_ago).toFixed(2)+' BYN.',
      expected_result:'Зафиксирован результат переговоров и конкретный следующий шаг по заказу.',
      criteria:'Итог разговора и следующий шаг записаны в CRM.',
      source:'purchase_history + clients + tasks + route_plans',
      as_of:today
    }));
  return reply(req,{items,as_of:today,manager:manager.name,mode:'readonly',
    warning:'Сравниваются только связанные с клиентом продажи завершённого месяца. Черновики не являются задачами и не сохраняются.'});
});
