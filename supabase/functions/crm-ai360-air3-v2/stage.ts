// @ts-nocheck
// Stage adapter: navigation intent only. Real data and all visual sections are
// rendered by the owner's existing authenticated CRM in a dedicated browser window.
import { ADMIN, OWNER, SESSIONS, PAIRS, ownerPresent, deny } from './auth.ts';
const TABLE='crm_air3_stage_v1';
const now=()=>Date.now();
const iso=n=>new Date(n).toISOString();
async function browserOwner(req){
  const token=(req.headers.get('authorization')||'').match(/^Bearer ([\w.-]+)$/)?.[1]||'';
  if(!token||token.length>6000)deny('browser_login_required',401);
  const u=await ADMIN.auth.getUser(token).catch(()=>null);
  const id=u?.data?.user?.id||'';
  await ownerPresent(id);
  return id;
}
async function checkStage(stage){
  if(!stage||stage.status!=='active'||Date.parse(stage.expires_at)<=now())
    deny('stage_closed',403);
  const r=await ADMIN.from(SESSIONS).select('id,expires_at,last_seen_at,revoked_at,pairing_id')
    .eq('id',stage.session_id).eq('owner_id',stage.owner_id).maybeSingle();
  const s=r.data;
  if(!s||s.revoked_at||Date.parse(s.expires_at)<=now()||Date.parse(s.last_seen_at)<=now()-600000)
    deny('device_session_expired',403);
  const pair=await ADMIN.from(PAIRS).select('status').eq('id',s.pairing_id).maybeSingle();
  if(pair.data?.status!=='redeemed')deny('device_session_revoked',403);
  return s;
}
export async function stageOwnerRequest(req,action,body){
 const owner=await browserOwner(req);
 if(action==='stage_open'){
  const r=await ADMIN.from(SESSIONS).select('id,expires_at,last_seen_at,pairing_id')
   .eq('owner_id',owner).is('revoked_at',null).gt('expires_at',iso(now()))
   .gt('last_seen_at',iso(now()-600000)).order('issued_at',{ascending:false}).limit(6);
  if(r.error)deny('device_session_lookup_failed',503);
  let s=null;
  for(const candidate of r.data||[]){
   const pair=await ADMIN.from(PAIRS).select('status').eq('id',candidate.pairing_id).maybeSingle();
   if(pair.data?.status==='redeemed'){s=candidate;break;}
  }
  if(!s)deny('glasses_not_connected',409);
  const up=await ADMIN.from(TABLE).upsert({
   owner_id:owner,session_id:s.id,status:'active',page_id:null,
   command_id:crypto.randomUUID(),updated_at:iso(now()),
   expires_at:s.expires_at
  },{onConflict:'session_id'}).select('id,expires_at').single();
  if(up.error||!up.data)deny('stage_open_failed',503);
  return {stage_id:up.data.id,expires_at:up.data.expires_at};
 }
 const id=typeof body?.stage_id==='string'?body.stage_id:'';
 if(!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id))
  deny('invalid_stage',400);
 const response=await ADMIN.from(TABLE).select('*').eq('id',id).eq('owner_id',owner).maybeSingle();
 if(response.error||!response.data)deny('stage_not_found',404);
 const stage=response.data;
 if(action==='stage_close'){
  await ADMIN.from(TABLE).update({status:'closed',updated_at:iso(now())}).eq('id',id).eq('owner_id',owner);
  return {status:'closed'};
 }
 if(action==='stage_poll'){
  await checkStage(stage);
  return {status:'active',page_id:stage.page_id,command_id:stage.command_id,
    expires_at:stage.expires_at};
 }
 deny('unsupported_stage_action',400);
}
export async function publishNavigation(s,domain){
 // Called only after the device session has been fully authorized; never public.
 const r=await ADMIN.from(TABLE).update({
  page_id:domain,command_id:crypto.randomUUID(),updated_at:iso(now())
 }).eq('session_id',s.id).eq('owner_id',s.owner_id)
  .eq('status','active').gt('expires_at',iso(now())).select('id');
 if(r.error)throw Error('stage_unavailable');
 return Boolean(r.data?.length);
}
