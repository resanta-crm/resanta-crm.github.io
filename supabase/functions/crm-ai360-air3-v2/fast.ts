// @ts-nocheck
// Fast sign-in uses an Android Keystore RSA-PSS private key and owner approval.
// No persistent CRM password, session token or secret is stored on glasses.
import { ADMIN, OWNER, PAIRS, sha, authorized, stillAllowed, ownerPresent, deny, quota } from './auth.ts';
const TRUST='crm_air3_trusted_devices_v1',CHALLENGE='crm_air3_fast_challenges_v1';
const uuid=s=>/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(s);
const iso=n=>new Date(n).toISOString();
const random=n=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n))))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const decode=s=>{
 if(typeof s!=='string'||s.length>2600||!/^[A-Za-z0-9+/=_-]+$/.test(s))deny('key_invalid',400);
 const binary=atob(s.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
};
async function keyFromString(spki){
 const raw=decode(spki);
 if(raw.length<260||raw.length>600)deny('key_length_invalid',400);
 let key;
 try{key=await crypto.subtle.importKey('spki',raw,{name:'RSA-PSS',hash:'SHA-256'},true,['verify']);}
 catch{deny('key_not_supported',400);}
 if(key.algorithm.modulusLength!==2048)deny('key_strength_invalid',400);
 return key;
}
async function browserOwner(req){
 const token=(req.headers.get('authorization')||'').match(/^Bearer ([\w.-]+)$/)?.[1]||'';
 if(!token)deny('browser_login_required',401);
 const auth=await ADMIN.auth.getUser(token).catch(()=>null);
 const id=auth?.data?.user?.id||'';
 await ownerPresent(id);return id;
}
export async function enroll(token,body){
 const s=await authorized(token,true);
 await quota('air3-v2-enroll-'+s.owner_id,3,3600);
 const key=String(body?.public_key_spki||'');
 await keyFromString(key);
 const existing=await ADMIN.from(TRUST).select('id,public_key_spki,revoked_at')
  .eq('first_pairing_id',s.pairing_id).maybeSingle();
 if(existing.data){
  if(existing.data.revoked_at||existing.data.public_key_spki!==key)deny('device_already_enrolled',409);
  return {device_id:existing.data.id,registered:true};
 }
 const inserted=await ADMIN.from(TRUST).insert({
  owner_id:s.owner_id,first_pairing_id:s.pairing_id,
  public_key_spki:key,label:'INMO AIR3'
 }).select('id').single();
 if(inserted.error||!inserted.data)deny('enrollment_failed',503);
 await stillAllowed(s);
 return {device_id:inserted.data.id,registered:true};
}
export async function beginFast(deviceId){
 if(!uuid(deviceId))deny('invalid_device_id',400);
 await quota('air3-v2-challenge-'+deviceId,10,60);
 const r=await ADMIN.from(TRUST).select('id,revoked_at').eq('id',deviceId).maybeSingle();
 if(r.error||!r.data||r.data.revoked_at)deny('device_not_trusted',403);
 const nonce=random(32),until=iso(Date.now()+60000);
 const c=await ADMIN.from(CHALLENGE).insert({device_id:deviceId,nonce,expires_at:until})
  .select('id').single();
 if(c.error||!c.data)deny('challenge_unavailable',503);
 return {challenge_id:c.data.id,nonce,expires_at:until};
}
export async function requestFast(body){
 const deviceId=String(body?.device_id||''),challengeId=String(body?.challenge_id||'');
 const secret=String(body?.secret||''),signature=String(body?.signature_base64||'');
 if(!uuid(deviceId)||!uuid(challengeId)||secret.length<40||secret.length>150||signature.length>900)
  deny('fast_request_invalid',400);
 await quota('air3-v2-fast-'+deviceId,4,60);
 const t=await ADMIN.from(TRUST).select('*').eq('id',deviceId).maybeSingle();
 if(t.error||!t.data||t.data.revoked_at)deny('device_not_trusted',403);
 await ownerPresent(t.data.owner_id);
 const c=await ADMIN.from(CHALLENGE).select('*').eq('id',challengeId)
  .eq('device_id',deviceId).is('consumed_at',null).gt('expires_at',iso(Date.now())).maybeSingle();
 if(c.error||!c.data)deny('challenge_expired',403);
 const key=await keyFromString(t.data.public_key_spki);
 const msg=new TextEncoder().encode(challengeId+':'+c.data.nonce);
 const passed=await crypto.subtle.verify({name:'RSA-PSS',saltLength:32},key,decode(signature),msg).catch(()=>false);
 if(!passed)deny('device_signature_invalid',403);
 const locked=await ADMIN.from(CHALLENGE).update({consumed_at:iso(Date.now())})
  .eq('id',challengeId).eq('device_id',deviceId)
  .is('consumed_at',null).gt('expires_at',iso(Date.now())).select('id').maybeSingle();
 if(!locked.data)deny('challenge_replayed',409);
 // Existing Mac controller already approves status=pending_approval.
 // No 6-digit code needed on a previously enrolled and signed device.
 const salt=random(20);
 const paired=await ADMIN.from(PAIRS).insert({
  owner_id:t.data.owner_id,code_salt:salt,code_hash:await sha(salt+':'+random(24)),
  status:'pending_approval',device_secret_hash:await sha(secret),
  expires_at:iso(Date.now()+600000),paired_at:iso(Date.now())
 }).select('id').single();
 if(paired.error||!paired.data)deny('fast_pair_failed',503);
 await ADMIN.from(TRUST).update({last_seen_at:iso(Date.now())}).eq('id',deviceId);
 return {id:paired.data.id,status:'pending_approval',fast:true};
}
export async function deviceOwnerAction(req,action,body){
 const owner=await browserOwner(req);
 if(action==='devices'){
  const r=await ADMIN.from(TRUST).select('id,label,created_at,last_seen_at,revoked_at')
   .eq('owner_id',owner).order('created_at',{ascending:false}).limit(12);
  if(r.error)deny('devices_unavailable',503);
  return {items:r.data||[]};
 }
 if(action==='device_revoke'){
  const id=String(body?.device_id||'');
  if(!uuid(id))deny('invalid_device_id',400);
  const r=await ADMIN.from(TRUST).update({revoked_at:iso(Date.now())})
   .eq('id',id).eq('owner_id',owner).is('revoked_at',null).select('id').maybeSingle();
  if(!r.data)deny('device_not_found',404);
  return {revoked:true};
 }
 deny('unsupported_device_action',400);
}
