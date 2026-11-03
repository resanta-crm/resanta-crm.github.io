import { pairCode,statusOrRedeem,authorized,stillAllowed,revoke,deny,AccessError } from './auth.ts';
import { ask,section,sections } from './dialog.ts';
import { transcribe,speak } from './voice.ts';

// Separate v2 endpoint. Does not alter the production CRM or field APK.
// Must be deployed with verify_jwt=false; every protected action requires
// a high-entropy, owner-approved, revocable device token checked in Postgres.
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  ...(ORIGINS.has(origin)?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}
});
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
  ...(ORIGINS.has(origin)?{'access-control-allow-origin':origin}:{}),
  'access-control-allow-methods':'POST,OPTIONS',
  'access-control-allow-headers':'content-type,apikey'
 }});
 if(req.method!=='POST'||(origin&&!ORIGINS.has(origin)))return json({error:'origin_denied'},403,origin);
 if(Number(req.headers.get('content-length')||0)>750000)return json({error:'body_too_large'},413,origin);
 try{
  let body;
  try{body=await req.json();}catch{deny('invalid_json',400);}
  const action=typeof body?.action==='string'?body.action:'';
  // The same existing MacBook controller is used: create/approve/revoke
  // belong to the original owner-authenticated endpoint, never to the glasses.
  if(action==='pair')return json(await pairCode(String(body?.code||''),String(body?.secret||'')),200,origin);
  if(action==='status'||action==='redeem')
   return json(await statusOrRedeem(action,String(body?.id||''),String(body?.secret||'')),200,origin);
  const token=typeof body?.token==='string'?body.token:'';
  const session=await authorized(token,!['ping','close'].includes(action));
  if(action==='ping')return json({ok:true,expires_at:session.expires_at,expires_in:Math.max(0,Math.floor((Date.parse(session.expires_at)-Date.now())/1000))},200,origin);
  if(action==='close')return json(await revoke(token),200,origin);
  if(action==='capabilities')return json({ok:true,voice:'lera',stt:'gpt-transcribe',
   mode:'owner_readonly_air3_v2',sections,expires_at:session.expires_at},200,origin);
  let response;
  switch(action){
   case 'read':response=await section(session,String(body?.domain||''));break;
   case 'ask':response=await ask(session,body?.message,body?.history,body?.memory);break;
   case 'stt':response=await transcribe(session,body);break;
   case 'tts':response=await speak(session,body);break;
   default:deny('unsupported_action',400);
  }
  await stillAllowed(session);
  return json({ok:true,...response},200,origin);
 }catch(err){
  const e=err instanceof AccessError?err:new AccessError('service_unavailable',503);
  return json({error:e.message},e.status,origin);
 }
});
