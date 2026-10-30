import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const hosts=new Set(['https://resanta-crm.by','https://resanta-crm.github.io']);
const rnd=(n=32)=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const sha=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=(m:string,status=400):never=>{throw Object.assign(new Error(m),{status})};
const str=(v:any,n=150)=>typeof v==='string'?v.trim().slice(0,n):'';
const iso=(n:number)=>new Date(n).toISOString();
const stamp=()=>Date.now();
const table='crm_air3_pairings_v1',sessions='crm_air3_sessions_v1';
async function limit(bucket:string,max:number,seconds:number){
 const {data,error}=await admin.rpc('crm_air3_rate_limit_v1',{p_bucket:bucket,p_limit:max,p_window_seconds:seconds});
 if(error||data!==true)fail('Слишком много запросов',429);
}
async function user(req:Request){
 const token=(req.headers.get('authorization')||'').match(/^Bearer ([\w.-]+)$/)?.[1];
 if(!token)fail('Войдите в CRM с телефона или MacBook',401);
 const {data,error}=await admin.auth.getUser(token);
 const verifiedUser=data?.user;
 if(error||!verifiedUser)throw Object.assign(new Error('Сессия истекла'),{status:401});
 const {data:profile}=await admin.from('users').select('role,name').eq('id',verifiedUser.id).maybeSingle();
 if(profile?.role!=='boss'||String(profile?.name||'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ')!=='александр паюшин')fail('Доступ запрещён',403);
 return verifiedUser.id;
}
async function pair(id:string){
 if(!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id))fail('Некорректная заявка');
 const {data,error}=await admin.from(table).select('*').eq('id',id).maybeSingle();
 if(error||!data)fail('Заявка не найдена',404);
 return data;
}
async function devicePair(id:string,secret:string){
 if(secret.length<40||secret.length>150)fail('Доступ запрещён',403);
 const p=await pair(id);
 if(!p.device_secret_hash||p.device_secret_hash!==await sha(secret))fail('Доступ запрещён',403);
 return p;
}
async function session(token:string){
 if(token.length<40||token.length>150)fail('Сеанс отсутствует',401);
 const {data:s}=await admin.from(sessions).select('*').eq('token_hash',await sha(token)).maybeSingle();
 if(!s||s.revoked_at)fail('Сеанс завершён',401);
 const {data:paired,error:pairedError}=await admin.from(table).select('status').eq('id',s.pairing_id).maybeSingle();
 if(pairedError||paired?.status!=='redeemed')fail('Подключение отключено',401);
 const n=stamp();
 if(Date.parse(s.expires_at)<=n||Date.parse(s.last_seen_at)<=n-600000){
  await admin.from(sessions).update({revoked_at:iso(n)}).eq('id',s.id).is('revoked_at',null);
  fail('Время доступа истекло',401);
 }
 const {data:p}=await admin.from('users').select('name,role').eq('id',s.owner_id).maybeSingle();
 if(p?.role!=='boss'||String(p?.name||'').trim().toLowerCase()!=='александр паюшин')fail('Доступ отозван',403);
 const {data:renew}=await admin.from(sessions).update({last_seen_at:iso(n)}).eq('id',s.id).is('revoked_at',null).gt('expires_at',iso(n)).gt('last_seen_at',iso(n-600000)).select('id').maybeSingle();
 if(!renew)fail('Сеанс закрыт',401);
 return s;
}
Deno.serve(async (req:Request):Promise<Response>=>{
 const origin=req.headers.get('origin')||'';
 const cors:Record<string,string>=hosts.has(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type, authorization, apikey','vary':'Origin'}:{};
 const respond=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 try{
  if(req.method!=='POST'||!hosts.has(origin))fail('Недопустимый источник',403);
  const b=await req.json().catch(()=>fail('Неверный JSON')), a=str(b?.action,20);
  if(['create','pending','approve','revoke'].includes(a)){
   const id=await user(req);
   if(a==='create'){
    await limit('create-'+id,5,60);
    const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0'), salt=rnd(20);
    const {data,error}=await admin.from(table).insert({owner_id:id,code_salt:salt,code_hash:await sha(salt+':'+code),expires_at:iso(stamp()+120000)}).select('id,expires_at').single();
    if(error||!data)fail('Не удалось создать код',500);
    return respond({ok:true,...data,code});
   }
   if(a==='pending'){
    const {data,error}=await admin.from(table).select('id,status,created_at,expires_at,paired_at').eq('owner_id',id).order('created_at',{ascending:false}).limit(8);
    if(error)fail('Не удалось загрузить заявки',500);
    return respond({ok:true,items:data||[]});
   }
   const p=await pair(str(b.id));
   if(p.owner_id!==id)fail('Доступ запрещён',403);
   if(a==='approve'){
    if(p.status!=='pending_approval'||Date.parse(p.expires_at)<=stamp())fail('Заявка неактивна',409);
    const {data}=await admin.from(table).update({status:'approved',approved_at:iso(stamp())}).eq('id',p.id).eq('status','pending_approval').gt('expires_at',iso(stamp())).select('id').maybeSingle();
    if(!data)fail('Заявка неактивна',409);
    return respond({ok:true,status:'approved'});
   }
   const {error:revokeError}=await admin.from(table).update({status:'revoked'}).eq('id',p.id);
   if(revokeError)fail('Не удалось отключить доступ',503);
   const {error:sessionRevokeError}=await admin.from(sessions).update({revoked_at:iso(stamp())}).eq('pairing_id',p.id).is('revoked_at',null);
   if(sessionRevokeError)fail('Доступ отозван, повторите проверку отключения',503);
   return respond({ok:true,status:'revoked'});
  }
  if(a==='pair'){
   await limit('pair-global',70,60);
   const code=str(b.code,6), secret=str(b.secret);
   if(!/^\d{6}$/.test(code)||secret.length<40)fail('Некорректный код',400);
   const {data:items,error}=await admin.from(table).select('id,code_salt,code_hash').eq('status','created').gt('expires_at',iso(stamp())).order('created_at',{ascending:false}).limit(100);
   if(error)fail('Не удалось проверить код',500);
   let match:any=null;
   for(const p of items||[])if(p.code_hash===await sha(p.code_salt+':'+code)){match=p;break;}
   if(!match)fail('Код не найден или истёк',403);
   const {data}=await admin.from(table).update({status:'pending_approval',device_secret_hash:await sha(secret),paired_at:iso(stamp())}).eq('id',match.id).eq('status','created').gt('expires_at',iso(stamp())).select('id').maybeSingle();
   if(!data)fail('Код уже использован',409);
   return respond({ok:true,id:(data as {id:string}).id,status:'pending_approval'});
  }
  if(a==='status'||a==='redeem'){
   await limit('poll-global',90,60);
   const p=await devicePair(str(b.id),str(b.secret));
   if(Date.parse(p.expires_at)<=stamp()&&p.status!=='redeemed')fail('Код истёк',410);
   if(a==='status')return respond({ok:true,status:p.status});
   if(p.status!=='approved')fail('Нет подтверждения владельца',403);
   const {data:lock}=await admin.from(table).update({status:'redeemed',redeemed_at:iso(stamp())}).eq('id',p.id).eq('status','approved').select('id').maybeSingle();
   if(!lock)fail('Код уже применён',409);
   const token=rnd(40);
   const {error}=await admin.from(sessions).insert({pairing_id:p.id,owner_id:p.owner_id,token_hash:await sha(token),expires_at:iso(stamp()+1800000)});
   if(error)fail('Не удалось открыть сеанс',500);
   const {data:check}=await admin.from(table).select('status').eq('id',p.id).single();
   if(check?.status!=='redeemed'){
    await admin.from(sessions).update({revoked_at:iso(stamp())}).eq('pairing_id',p.id).is('revoked_at',null);
    fail('Подключение отозвано',403);
   }
   return respond({ok:true,token,expires_in:1800,id:p.id});
  }
  if(a==='ping'||a==='ask'||a==='close'){
   const s=await session(str(b.token));
   if(a==='close'){
    const {error:closeError}=await admin.from(sessions).update({revoked_at:iso(stamp())}).eq('id',s.id).is('revoked_at',null);
    if(closeError)fail('Не удалось завершить сеанс',503);
    return respond({ok:true,status:'revoked'});
   }
   if(a==='ping')return respond({ok:true,id:s.pairing_id,expires_at:s.expires_at});
   await limit('ask-'+s.owner_id,20,60);
   const domain=str(b.domain,20),rpc=domain==='sales'?'crm_ai360_sales_kpi_snapshot_v1':domain==='debt'?'crm_ai360_debt_snapshot_v1':null;
   if(!rpc)fail('Доступны только проверенные отчёты о продажах и ПДЗ');
   const {data,error}=await admin.rpc(rpc as string,domain==='sales'?{p_month:null}:{p_manager:null});
   if(error)fail('Данные сейчас недоступны',503);
   const [{data:stillValid},{data:stillPaired}]=await Promise.all([admin.from(sessions).select('id').eq('id',s.id).is('revoked_at',null).gt('expires_at',iso(stamp())).maybeSingle(),admin.from(table).select('id').eq('id',s.pairing_id).eq('status','redeemed').maybeSingle()]);
   if(!stillValid||!stillPaired)fail('Сеанс уже отозван',401);
   return respond({ok:true,domain,data});
  }
  return respond({ok:false,error:'Неизвестная операция'},400);
 }catch(e){const x=e as {message?:string,status?:number};return respond({ok:false,error:x?.message||'Ошибка сервера'},x?.status||500);}
});