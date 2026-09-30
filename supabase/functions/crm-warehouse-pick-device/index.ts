import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE=Deno.env.get('SUPABASE_URL')||'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ANON=Deno.env.get('SUPABASE_ANON_KEY')||'';
const ADMIN=createClient(BASE,SERVICE,{auth:{persistSession:false}});
const headers={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store'
};
const result=(obj:Record<string,unknown>,code=200)=>new Response(JSON.stringify(obj),{status:code,headers});
const EMAILS:Record<string,string>={
 tsd1:'tsd1.pick@resanta-crm.by',
 tsd2:'tsd2.pick@resanta-crm.by'
};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return result({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 try{
  if(!BASE||!SERVICE||!ANON)return result({ok:false,error:'SERVICE_NOT_READY'},503);
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!jwt)return result({ok:false,error:'LOGIN_REQUIRED'},401);
  const api=createClient(BASE,ANON,{auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+jwt}}});
  const {data:a,error:ae}=await api.auth.getUser(jwt);
  if(ae||!a?.user?.id)return result({ok:false,error:'LOGIN_REQUIRED'},403);
  const user=a.user;
  const email=String(user.email||'').trim().toLowerCase();
  const {data:p,error:pe}=await ADMIN.from('users').select('id,role,email').eq('id',user.id).maybeSingle();
  const {data:access,error:accError}=await ADMIN.from('warehouse_pick_access_v1').select('role,active').eq('email',email).maybeSingle();
  if(pe||accError||!p||!access?.active||String(p.email||'').trim().toLowerCase()!==email||
      !(email==='vitebsk@resanta.ru'&&p.role==='office_manager'&&access.role==='office')&&
      !(email==='payushin_ar@resanta.ru'&&p.role==='boss'&&access.role==='supervisor'))
   return result({ok:false,error:'OFFICE_ACCESS_REQUIRED'},403);
  const body=await req.json().catch(()=>({}));
  const key=String(body.device_key||'');
  if(!(key in EMAILS))return result({ok:false,error:'UNKNOWN_TSD'},400);
  const {data:device,error:de}=await ADMIN.from('warehouse_pick_devices_v1')
   .select('device_key,label,auth_user_id,is_active').eq('device_key',key).maybeSingle();
  if(de||!device||!device.is_active)return result({ok:false,error:'TSD_INACTIVE'},409);
  if(device.auth_user_id)return result({ok:true,already_active:true,device_key:key,
     message:'The device already has its own technical login. No password can be displayed again.'});
  // Strong one-time technical credential; NEVER store its plaintext in database or logs.
  const password=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const login=EMAILS[key];
  const {data:created,error:ce}=await ADMIN.auth.admin.createUser({
   email:login,password,email_confirm:true,
   app_metadata:{warehouse_pick_device:key,technical_account:true}
  });
  if(ce||!created?.user?.id)return result({ok:false,error:'DEVICE_LOGIN_CREATE_FAILED'},409);
  const uid=created.user.id;
  const {data:updated,error:ue}=await ADMIN.from('warehouse_pick_devices_v1')
    .update({auth_user_id:uid,technical_login:login,provisioned_at:new Date().toISOString(),provisioned_by:email})
    .eq('device_key',key).is('auth_user_id',null).select('device_key').maybeSingle();
  if(ue||!updated){
    // Don't leave an untracked technical login behind if binding fails.
    await ADMIN.auth.admin.deleteUser(uid).catch(()=>{});
    return result({ok:false,error:'TSD_BINDING_FAILED'},409);
  }
  return result({ok:true,device_key:key,label:device.label,login,password,
    picking_url:'/picking.html',credentials_display_once:true,
    telegram_connected:false});
 }catch(e){
  console.error('TSD_PROVISION_FAILED',e instanceof Error?e.message:'unexpected');
  return result({ok:false,error:'TSD_PROVISION_UNAVAILABLE'},500);
 }
});