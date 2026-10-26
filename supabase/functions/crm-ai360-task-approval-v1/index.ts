// RESANTA AI360: director-only explicit final approval of existing read-only proposals.
// Never called automatically. No client-side DB write. Supabase JWT + owner + branch checks.
// PostgREST multi-row INSERT is atomic. A partial unique DB index enforces one open
// voice-approved task per client across Edge isolates and concurrent approvals.
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const OWNER_ID='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const SOURCE='ai360_voice_approved';
const norm=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
const cors=origin=>({
  'Access-Control-Allow-Origin':ORIGINS.has(origin||'')?origin:'https://resanta-crm.by',
  'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
  'Access-Control-Allow-Methods':'OPTIONS,POST','Vary':'Origin'
});
const respond=(req,body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors(req.headers.get('Origin')),
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
const validUuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const today=()=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p=key=>parts.find(x=>x.type===key)?.value||'';
  return p('year')+'-'+p('month')+'-'+p('day');
};
const deadline=ymd=>{
  const d=new Date(ymd+'T12:00:00Z');let n=0;
  while(n<5){d.setUTCDate(d.getUTCDate()+1);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)n++;}
  return d.toISOString().slice(0,10);
};
function validDate(str,now){
  if(typeof str!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(str))return false;
  const d=new Date(str+'T00:00:00Z');
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==str||str<=now)return false;
  return (d.getTime()-Date.parse(now+'T00:00:00Z'))/86400000<=90;
}
function validInput(body){
  if(!body||!['validate','commit'].includes(body.kind))return false;
  if(!validUuid(body.approval_id)||!Array.isArray(body.items)||body.items.length<1||body.items.length>3)return false;
  if(body.kind==='commit'&&body.confirmation!=='подтверждаю создание поручений')return false;
  const ids=new Set();
  return body.items.every(row=>{
    if(!row||!validUuid(row.client_id)||ids.has(row.client_id))return false;
    ids.add(row.client_id);
    return typeof row.manager_name==='string'&&row.manager_name.length<=80&&
      typeof row.due_date==='string'&&
      typeof row.text==='string'&&row.text.trim().length>=8&&row.text.trim().length<=500;
  });
}
async function stableTaskId(approval,client){
  const bytes=new TextEncoder().encode(approval+'|'+client+'|ai360-voice-v1');
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const b=hash.slice(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
const error=(req,code,status=409)=>respond(req,{error:code,created:0},status);

Deno.serve(async req=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=='POST')return error(req,'method_not_allowed',405);
  if(origin&&!ORIGINS.has(origin))return error(req,'origin_not_allowed',403);
  const auth=req.headers.get('Authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token||token.length>6000)return error(req,'not_authorized',401);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!secret)return error(req,'service_unavailable',503);
  const svc=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const identity=await svc.auth.getUser(token).catch(()=>null);
  const user=identity?.data?.user;
  if(!user?.id||user.id!==OWNER_ID)return error(req,'not_authorized',403);
  const profile=await svc.from('users').select('id,name,role').eq('id',user.id).maybeSingle();
  if(profile.error||profile.data?.role!=='boss'||norm(profile.data?.name)!=='александр паюшин')
    return error(req,'not_authorized',403);
  let body;
  try{body=await req.json();}catch{return error(req,'invalid_request',400);}
  if(!validInput(body))return error(req,'invalid_request',400);
  const day=today();
  if(!body.items.every(x=>validDate(x.due_date,day)))return error(req,'invalid_due_date',400);

  const assigned=[...new Set(body.items.map(x=>norm(x.manager_name)))];
  if(assigned.length!==1)return error(req,'mixed_managers',400);
  const managers=await svc.from('users').select('id,name,role,region')
    .eq('role','manager').eq('region','Витебск').limit(20);
  if(managers.error||(managers.data||[]).length>=20)return error(req,'directory_unavailable',503);
  const matches=(managers.data||[]).filter(x=>norm(x.name)===assigned[0]);
  if(matches.length!==1)return error(req,'manager_not_found',403);
  const manager=matches[0];

  const ids=body.items.map(x=>x.client_id);
  const keys=await Promise.all(ids.map(id=>stableTaskId(body.approval_id,id)));
  // An exact replay has stable primary keys and cannot create a second task,
  // even after the original is completed.
  const existing=await svc.from('tasks').select('id,client_id,source')
    .in('id',keys).limit(4);
  if(existing.error)return error(req,'task_verification_unavailable',503);
  if(existing.data?.length){
    const all=keys.length===existing.data.length&&
      keys.every((id,i)=>existing.data.some(t=>t.id===id&&t.client_id===ids[i]&&t.source===SOURCE));
    return all?respond(req,{mode:'already_created',created:0,task_ids:keys}):
      error(req,'approval_id_conflict',409);
  }

  // Re-check every proposed client against the current authenticated manager,
  // current decline snapshot, existing tasks and future routes.
  const snap=await svc.rpc('crm_ai360_operations_snapshot_v1',{
    p_manager:manager.name,p_month:day.slice(0,7)+'-01'
  });
  if(snap.error||snap.data?.period?.as_of!==day)return error(req,'snapshot_unavailable',503);
  const signals=(Array.isArray(snap.data.declining_clients)?snap.data.declining_clients:[])
    .slice(0,8).filter(x=>Number(x.closed_year_ago)>0&&
      Number(x.closed_month)<Number(x.closed_year_ago)&&Number(x.open_tasks)===0&&
      !x.next_route&&typeof x.client_name==='string');
  const byName=new Map(signals.map(x=>[x.client_name,x]));
  const wantedNames=body.items.map(x=>x.client_name);
  if(!wantedNames.every(n=>typeof n==='string'&&n.length<=200&&byName.has(n)))
    return error(req,'proposal_expired',409);
  const clients=await svc.from('clients')
    .select('id,name,manager_id,manager_name,is_archived,to_delete')
    .eq('manager_name',manager.name).in('name',wantedNames).limit(30);
  if(clients.error||(clients.data||[]).length>=30)return error(req,'client_verification_unavailable',503);
  const clientData=body.items.map(row=>{
    const matches=(clients.data||[]).filter(c=>c.name===row.client_name);
    return matches.length===1&&matches[0].id===row.client_id?
      matches[0]:null;
  });
  if(clientData.some(c=>!c||c.is_archived||c.to_delete||
    norm(c.manager_name)!==norm(manager.name)||(c.manager_id&&c.manager_id!==manager.id)))
    return error(req,'client_ownership_changed',409);
  const [tasks,routes]=await Promise.all([
    svc.from('tasks').select('client_id').in('client_id',ids)
      .or('done.eq.false,done.is.null').limit(150),
    svc.from('route_plans').select('client_id').in('client_id',ids)
      .gte('visit_date',day).lte('visit_date',deadline(day))
      .or('removed.eq.false,removed.is.null').limit(150)
  ]);
  if(tasks.error||routes.error||(tasks.data||[]).length>=150||(routes.data||[]).length>=150)
    return error(req,'verification_incomplete',503);
  if((tasks.data||[]).length||(routes.data||[]).length)return error(req,'conflicting_task_or_route',409);
  const rows=body.items.map((r,i)=>{
    const signal=byName.get(r.client_name);
    const old=Number(signal.closed_year_ago),current=Number(signal.closed_month);
    return {
      id:keys[i],client_id:r.client_id,manager_id:manager.id,manager_name:manager.name,
      title:(String(r.title||'').trim().slice(0,110)||'Согласовать следующий заказ с клиентом'),
      text:r.text.trim(),due_date:r.due_date,done:false,auto_generated:false,
      review_status:'approved',reviewed_by:profile.data.name,reviewed_at:new Date().toISOString(),
      source:SOURCE,priority:old>0&&(old-current)/old>=0.5?'высокий':'средний',
      basis:'Связанные закупки CRM: '+String(snap.data.period.last_closed_month)+
        ' — '+current.toFixed(2)+' BYN; '+String(snap.data.period.last_closed_year_ago)+
        ' — '+old.toFixed(2)+' BYN.',
      expected_result:String(r.expected_result||'').slice(0,300)||
        'Зафиксирован следующий шаг и ответ клиента.',
      criteria:String(r.criteria||'').slice(0,300)||
        'Итог контакта и следующий шаг отражены в CRM.',
      ai_reason:'Голосовое поручение, отдельно подтверждено директором.',
      ai_selection_context:{ai360_approval_id:body.approval_id,proposal_date:day}
    };
  });

  if(body.kind==='validate')return respond(req,{mode:'ready',items:rows.map(r=>({
    client_id:r.client_id,client_name:body.items.find(x=>x.client_id===r.client_id)?.client_name,
    manager_name:r.manager_name,title:r.title,text:r.text,due_date:r.due_date
  })),created:0});

  // Creation requires an exact, explicit spoken confirmation, never "да" or
  // automatic intent inference. One PostgREST INSERT is a single DB transaction.
  const inserted=await svc.from('tasks').insert(rows).select('id,client_id');
  if(inserted.error){
    if(inserted.error.code==='23505')return error(req,'duplicate_blocked',409);
    return error(req,'insert_failed',503);
  }
  if(inserted.data?.length!==rows.length)return error(req,'unverified_insert',503);
  return respond(req,{mode:'created',created:rows.length,task_ids:keys});
});
