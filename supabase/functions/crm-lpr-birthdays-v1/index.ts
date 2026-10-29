// Isolated LPR & birthday service. Role is rechecked against CRM users for every request.
// All writes are server-side, scoped by client's current manager. No birth year stored.
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
const PROJECT='https://baqchjtvtmcfzwjjluhs.supabase.co';
const SIDS=new Set(['ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','544fb1e2-ef70-44de-bc62-e0e1596a4bfc']);
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const SVC=createClient(Deno.env.get('SUPABASE_URL')||PROJECT,
 Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const h=r=>({'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'Access-Control-Allow-Origin':ORIGINS.has(r.headers.get('origin'))?r.headers.get('origin'):'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-crm-dispatch-secret',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'});
const respond=(r,o,status=200)=>new Response(JSON.stringify(o),{status,headers:h(r)});
const normalize=s=>String(s||'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
const fmt=d=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Minsk'}).format(d);
const asDate=(s)=>{const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12));};
const yearless=(d)=>({month:Number(fmt(d).slice(5,7)),day:Number(fmt(d).slice(8,10))});
const validMonthDay=(month,day)=>Number.isInteger(month)&&Number.isInteger(day)&&
 month>=1&&month<=12&&day>=1&&day<=31&&new Date(Date.UTC(2000,month-1,day)).getUTCMonth()===month-1;
const clamp=(x,n)=>typeof x==='string'&&x.trim().length<=n?x.trim():'';
const esc=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function identity(req){
 const token=String(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
 if(!token||token.length>6000)throw Error('login_required');
 const a=await SVC.auth.getUser(token);
 if(a.error||!a.data.user?.id)throw Error('login_required');
 const {data:user,error}=await SVC.from('users').select('id,name,role,region,email').eq('id',a.data.user.id).maybeSingle();
 if(error||!user||user.id!==a.data.user.id)throw Error('account_unavailable');
 const boss=SIDS.has(user.id)&&user.role==='boss'&&user.region==='Витебск'&&
   (user.id.startsWith('ba55')?normalize(user.name)==='сидарович к.н.':normalize(user.name)==='александр паюшин');
 const allowedManagerIds={
  'Руднев':'19dd9943-99ae-47c4-a39c-4f82a11059a6',
  'Ачинович':'3d935a76-c6fe-44b6-b248-fcbe58c6bf1c',
  'Шкуран':'4fd79fa0-232d-4768-8099-25f47923cc4f'};
 const manager=user.role==='manager'&&user.region==='Витебск'&&
   allowedManagerIds[user.name]===user.id;
 if(!boss&&!manager)throw Error('not_authorized');
 return {...user,tier:boss?'director':'manager'};
}
async function allowedClients(u){
 let q=SVC.from('clients').select('id,name,manager_name,is_vip').or('is_archived.eq.false,is_archived.is.null').or('to_delete.eq.false,to_delete.is.null');
 if(u.tier==='manager')q=q.eq('manager_name',u.name);
 else if(u.id==='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a')q=q.in('manager_name',['Руднев','Ачинович','Шкуран']);
 // Owner boss can see VIP from whole client base, but not ordinary LPR contacts.
 const {data,error}=await q.order('name').limit(1500);
 if(error)throw Error('client_directory_unavailable');
 const clients=data||[];
 // VIP is true if either CRM flag OR the active master VIP membership.
 const ids=clients.map(x=>x.id);
 let vipIds=new Set();
 if(ids.length){
   const {data:membership,error:e}=await SVC.from('vip_membership_v236429')
    .select('client_id').eq('active',true).in('client_id',ids);
   if(e)throw Error('vip_membership_unavailable');
   vipIds=new Set((membership||[]).map(x=>x.client_id));
 }
 return clients.filter(c=>u.tier==='manager'||c.is_vip===true||vipIds.has(c.id))
  .map(c=>({...c,is_vip:c.is_vip===true||vipIds.has(c.id)}));
}
async function list(u,req){
 const clients=await allowedClients(u),ids=clients.map(c=>c.id);
 let contacts=[];
 if(ids.length){
  const {data,error}=await SVC.from('crm_lpr_contacts_v1')
    .select('id,client_id,full_name,position_title,birth_day,birth_month,note,updated_at,created_by')
    .in('client_id',ids).eq('active',true).order('full_name').limit(2500);
  if(error)throw Error('lpr_read_unavailable');
  contacts=data||[];
 }
 const map=new Map(clients.map(c=>[c.id,c]));
 const today=fmt(new Date()),mid=asDate(today);
 const upcoming=contacts.map(x=>{
  const c=map.get(x.client_id);if(!c)return null;
  let days=null;
  for(let i=0;i<=14;i++){
   const next=new Date(mid.getTime()+i*86400000),parts=yearless(next);
   if(parts.month===x.birth_month&&parts.day===x.birth_day){days=i;break;}
  }
  return days===null?null:{id:x.id,full_name:x.full_name,position_title:x.position_title,
    client_name:c.name,client_id:c.id,manager_name:c.manager_name,is_vip:c.is_vip,
    days_until:days,birth_day:x.birth_day,birth_month:x.birth_month};
 }).filter(Boolean).sort((a,b)=>a.days_until-b.days_until||Number(b.is_vip)-Number(a.is_vip)).slice(0,120);
 const covered=new Set(contacts.map(c=>c.client_id));
 return respond(req,{mode:'lpr_v1',scope:u.tier,read_only:u.tier==='director',as_of:today,
  clients:clients.map(c=>({id:c.id,name:c.name,manager_name:c.manager_name,is_vip:c.is_vip,
   has_lpr:covered.has(c.id)})),
  contacts:contacts.map(({created_by,...item})=>item),
  upcoming,missing_clients:clients.filter(c=>!covered.has(c.id)).length});
}
async function save(u,b,req){
 if(u.tier!=='manager')return respond(req,{error:'director_read_only'},403);
 const id=typeof b.id==='string'&&/^[0-9a-f-]{36}$/i.test(b.id)?b.id:null;
 const client_id=typeof b.client_id==='string'&&/^[0-9a-f-]{36}$/i.test(b.client_id)?b.client_id:'';
 const full_name=clamp(b.full_name,120),position_title=clamp(b.position_title??'',120),note=clamp(b.note??'',200);
 const birth_month=Number(b.birth_month),birth_day=Number(b.birth_day);
 if(!client_id||full_name.length<2||!validMonthDay(birth_month,birth_day))
  return respond(req,{error:'invalid_person_or_birthday'},400);
 const clients=await allowedClients(u);
 if(!clients.some(c=>c.id===client_id))return respond(req,{error:'client_not_owned'},403);
 if(id){
  const {data:original,error:oe}=await SVC.from('crm_lpr_contacts_v1').select('id,client_id')
   .eq('id',id).eq('active',true).maybeSingle();
  if(oe||!original||original.client_id!==client_id)return respond(req,{error:'contact_not_owned'},403);
 }
 const update={client_id,full_name,position_title,note,birth_month,birth_day,
  updated_by:u.id,updated_at:new Date().toISOString()};
 let query;
 if(id)query=SVC.from('crm_lpr_contacts_v1').update(update).eq('id',id).eq('client_id',client_id);
 else query=SVC.from('crm_lpr_contacts_v1').insert({...update,created_by:u.id});
 const {data,error}=await query.select('id,client_id,full_name,birth_month,birth_day').single();
 if(error)return respond(req,{error:error.code==='23505'?'duplicate_person':'save_failed'},409);
 return respond(req,{ok:true,contact:data});
}
async function remove(u,b,req){
 if(u.tier!=='manager')return respond(req,{error:'director_read_only'},403);
 const id=String(b.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return respond(req,{error:'invalid_id'},400);
 const {data:existing,error:e}=await SVC.from('crm_lpr_contacts_v1')
  .select('client_id').eq('id',id).eq('active',true).maybeSingle();
 if(e||!existing)return respond(req,{error:'not_found'},404);
 const clients=await allowedClients(u);
 if(!clients.some(c=>c.id===existing.client_id))return respond(req,{error:'client_not_owned'},403);
 const {error}=await SVC.from('crm_lpr_contacts_v1').update({active:false,updated_by:u.id,
  updated_at:new Date().toISOString()}).eq('id',id).eq('client_id',existing.client_id);
 if(error)return respond(req,{error:'save_failed'},503);
 return respond(req,{ok:true});
}
async function telegram(chat_id,text){
 const secret=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
 if(!secret)throw Error('telegram_token_missing');
 const r=await fetch('https://api.telegram.org/bot'+secret+'/sendMessage',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({chat_id,text,
    parse_mode:'HTML',disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)});
 if(!r.ok||(await r.json().catch(()=>null))?.ok!==true)throw Error('telegram_send_failed');
}
async function dispatch(req){
 const {data:runtime,error:re}=await SVC.from('crm_telegram_runtime').select('value')
  .eq('key','dispatch_secret').maybeSingle();
 const expected=String(runtime?.value?.secret||''),provided=req.headers.get('x-crm-dispatch-secret')||'';
 if(re||!expected||provided!==expected)return respond(req,{error:'forbidden'},403);
 const date=fmt(new Date()),base=asDate(date),events=[
  {event_kind:'birthday',date,parts:yearless(base)},
  {event_kind:'3_days',date:fmt(new Date(base.getTime()+3*86400000)),
   parts:yearless(new Date(base.getTime()+3*86400000))}
 ];
 // No birthdays / personal data in log messages; no owner info in web response.
 const {data:contacts,error:ce}=await SVC.from('crm_lpr_contacts_v1')
  .select('id,client_id,full_name,position_title,birth_month,birth_day').eq('active',true).limit(5000);
 if(ce)throw Error('birthday_contacts_unavailable');
 const candidates=(contacts||[]).filter(c=>events.some(e=>e.parts.month===c.birth_month&&e.parts.day===c.birth_day));
 if(!candidates.length)return respond(req,{ok:true,candidates:0,sent:0});
 const ids=[...new Set(candidates.map(c=>c.client_id))];
 const [cr,vr,ur,br]=await Promise.all([
  SVC.from('clients').select('id,name,manager_name,is_vip').in('id',ids).or('is_archived.eq.false,is_archived.is.null').or('to_delete.eq.false,to_delete.is.null'),
  SVC.from('vip_membership_v236429').select('client_id').in('client_id',ids).eq('active',true),
  SVC.from('users').select('id,name,role,region').in('name',['Руднев','Ачинович','Шкуран','Сидарович К.Н.','Александр Паюшин']),
  SVC.from('crm_telegram_bindings').select('user_id,chat_id').eq('active',true)
 ]);
 if([cr,vr,ur,br].some(x=>x.error))throw Error('dispatch_directory_unavailable');
 const vipIds=new Set((vr.data||[]).map(x=>x.client_id)),map=new Map((cr.data||[]).map(c=>[c.id,c]));
 const users=(ur.data||[]),bind=new Map((br.data||[]).map(b=>[b.user_id,b.chat_id]));
 let sent=0,skipped=0,failed=0;
 for(const person of candidates){
  const client=map.get(person.client_id);
  if(!client||(!client.is_vip&&!vipIds.has(client.id)))continue; // Only VIP gets Telegram.
  const recipients=users.filter(u=>u.role==='manager'&&u.region==='Витебск'&&u.name===client.manager_name||
    u.role==='boss'&&u.region==='Витебск'&&
    (u.name==='Александр Паюшин'||u.name==='Сидарович К.Н.'&&
     ['Руднев','Ачинович','Шкуран'].includes(client.manager_name)));
  for(const event of events){
   if(person.birth_month!==event.parts.month||person.birth_day!==event.parts.day)continue;
   for(const u of recipients){
    const chat=bind.get(u.id);
    if(!chat){skipped++;continue;}
    const row={lpr_id:person.id,recipient_user_id:u.id,event_date:event.date,
     event_kind:event.event_kind,status:'pending',attempts:1};
    // Insert before send: unique constraint prevents two cron invocations from
    // producing duplicate birthday messages on the same day.
    const {error:ie}=await SVC.from('crm_lpr_birthday_delivery_v1').insert(row);
    if(ie){if(ie.code==='23505'){skipped++;continue;}throw Error('delivery_log_unavailable');}
    const label=event.event_kind==='birthday'?'🎂 Сегодня день рождения':'🎉 Через три дня день рождения';
    const msg=label+'\n<b>'+esc(person.full_name)+'</b>'+
      (person.position_title?' · '+esc(person.position_title):'')+
      '\nКлиент ВИП: <b>'+esc(client.name)+'</b>'+
      '\nОтветственный: '+esc(client.manager_name)+'\nОткройте CRM → ЛПР и дни рождения.';
    try{
     await telegram(chat,msg);
     await SVC.from('crm_lpr_birthday_delivery_v1').update({status:'sent',
       delivered_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq('lpr_id',person.id).eq('recipient_user_id',u.id)
      .eq('event_date',event.date).eq('event_kind',event.event_kind);
     sent++;
    }catch{
     await SVC.from('crm_lpr_birthday_delivery_v1').update({status:'failed',
       last_error:'telegram_unavailable',updated_at:new Date().toISOString()})
      .eq('lpr_id',person.id).eq('recipient_user_id',u.id)
      .eq('event_date',event.date).eq('event_kind',event.event_kind);
     failed++;
    }
   }
  }
 }
 return respond(req,{ok:true,sent,skipped,failed});
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h(req)});
 if(req.method!=='POST')return respond(req,{error:'method_not_allowed'},405);
 const origin=req.headers.get('origin');
 if(origin&&!ORIGINS.has(origin))return respond(req,{error:'origin_forbidden'},403);
 try{
  const body=await req.json().catch(()=>({})),action=String(body.action||'');
  if(action==='dispatch')return await dispatch(req);
  const u=await identity(req);
  if(action==='list'||action==='brief')return await list(u,req);
  if(action==='save')return await save(u,body,req);
  if(action==='delete')return await remove(u,body,req);
  return respond(req,{error:'unknown_action'},400);
 }catch(e){const code=String(e?.message||'internal_error');
  return respond(req,{error:code==='login_required'?'login_required':
   code==='not_authorized'?'not_authorized':'server_unavailable'},
   ['login_required','not_authorized'].includes(code)?403:503);}
});
