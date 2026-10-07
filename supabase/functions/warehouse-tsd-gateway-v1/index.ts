import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE=Deno.env.get('SUPABASE_URL')||'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ANON=Deno.env.get('SUPABASE_ANON_KEY')||'';
const ADMIN=createClient(BASE,SERVICE,{auth:{persistSession:false}});
const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store'
};
const out=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:cors});
const PICK_ALLOWED=new Set([
 'warehouse_pick_pair_redeem_v1',
 'warehouse_pick_device_dashboard_v236222',
 'warehouse_pick_device_detail_v1',
 'warehouse_pick_device_scan_v1',
 'warehouse_pick_device_shortage_v2',
 'warehouse_pick_device_confirm_return_v2',
 'warehouse_pick_device_undo_v1'
]);
const USER_PREFIXES=['warehouse_inventory_','warehouse_receiving_'];

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return out({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  try{
    if(!BASE||!SERVICE||!ANON)return out({ok:false,error:'SERVICE_NOT_READY'},503);
    const body=await req.json().catch(()=>null);
    if(!body||typeof body!=='object')return out({ok:false,error:'BAD_JSON'},400);
    const op=String(body.op||'rpc');

    if(op==='auth_password'||op==='auth_refresh'){
      const endpoint=op==='auth_password'
        ? BASE+'/auth/v1/token?grant_type=password'
        : BASE+'/auth/v1/token?grant_type=refresh_token';
      const payload=op==='auth_password'
        ? {email:String(body.email||''),password:String(body.password||'')}
        : {refresh_token:String(body.refresh_token||'')};
      const r=await fetch(endpoint,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify(payload)});
      const raw=await r.text();
      let j:any;try{j=raw?JSON.parse(raw):null}catch{j={message:raw}}
      return out(j,r.status);
    }

    const name=String(body.name||'');
    const args=(body.args&&typeof body.args==='object')?body.args:{};

    if(PICK_ALLOWED.has(name)){
      if(name==='warehouse_pick_pair_redeem_v1'){
        if(!args.p_code||!args.p_device_key)return out({ok:false,error:'PAIR_CREDENTIAL_REQUIRED'},401);
      }else if(!args.p_device_token){
        return out({ok:false,error:'DEVICE_TOKEN_REQUIRED'},401);
      }
      const {data,error}=await ADMIN.rpc(name,args);
      if(error)return out({ok:false,error:'RPC_ERROR',message:error.message,details:error.details,hint:error.hint},400);
      return out(data,200);
    }

    if(USER_PREFIXES.some(p=>name.startsWith(p))){
      const token=String(body.access_token||'');
      if(!token)return out({ok:false,error:'LOGIN_REQUIRED'},401);
      const api=createClient(BASE,ANON,{auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+token}}});
      const {data:userData,error:userErr}=await api.auth.getUser(token);
      if(userErr||!userData?.user?.id)return out({ok:false,error:'LOGIN_REQUIRED'},401);
      const {data,error}=await api.rpc(name,args);
      if(error)return out({ok:false,error:'RPC_ERROR',message:error.message,details:error.details,hint:error.hint},400);
      return out(data,200);
    }

    return out({ok:false,error:'RPC_NOT_ALLOWED'},403);
  }catch(e){
    return out({ok:false,error:'GATEWAY_ERROR',message:e instanceof Error?e.message:'unexpected'},500);
  }
});