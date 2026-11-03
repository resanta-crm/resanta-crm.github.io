import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// Companion-only delegated access. The owner signs in on a trusted computer.
// Shared AIR3 never receives a Supabase JWT, password, refresh token or service key.
export const ADMIN = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
 auth:{persistSession:false,autoRefreshToken:false}
});
export const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
export const PAIRS='crm_air3_pairings_v1',SESSIONS='crm_air3_sessions_v1';
const now=()=>Date.now();
const iso=n=>new Date(n).toISOString();
export const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
 new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const random=n=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n))))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
export class AccessError extends Error{
 constructor(code,status=403){super(code);this.status=status;}
}
export const deny=(code,status=403)=>{throw new AccessError(code,status);};
export async function quota(bucket,max=60,seconds=60){
 const r=await ADMIN.rpc('crm_air3_rate_limit_v1',{p_bucket:bucket,p_limit:max,p_window_seconds:seconds});
 if(r.error||r.data!==true)deny('rate_limited',429);
}
export async function ownerPresent(id){
 if(id!==OWNER)deny('not_authorized',403);
 const r=await ADMIN.from('users').select('role,name').eq('id',id).maybeSingle();
 if(r.error||r.data?.role!=='boss'||String(r.data?.name||'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ')!=='александр паюшин')
  deny('owner_scope_revoked',403);
}
async function findPair(id){
 if(!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id))deny('invalid_pairing',400);
 const r=await ADMIN.from(PAIRS).select('*').eq('id',id).maybeSingle();
 if(r.error||!r.data)deny('pair_not_found',404);
 return r.data;
}
async function devicePair(id,secret){
 if(typeof secret!=='string'||secret.length<40||secret.length>150)deny('not_authorized');
 const p=await findPair(id);
 if(!p.device_secret_hash||p.device_secret_hash!==await sha(secret))deny('not_authorized');
 return p;
}
// The existing air3-control.html creates/approves/revokes pairings.
// V2 only owns the device-side protocol. Code validity != session validity.
export async function pairCode(code,secret){
 await quota('air3-v2-pair-global',70,60);
 if(!/^\d{6}$/.test(code)||typeof secret!=='string'||secret.length<40||secret.length>150)
  deny('invalid_pairing_request',400);
 const r=await ADMIN.from(PAIRS).select('id,code_salt,code_hash')
  .eq('status','created').gt('expires_at',iso(now())).order('created_at',{ascending:false}).limit(100);
 if(r.error)deny('pair_lookup_unavailable',503);
 let match=null;
 for(const p of r.data||[])if(await sha(p.code_salt+':'+code)===p.code_hash){match=p;break;}
 if(!match)deny('pair_expired_or_invalid');
 const updated=await ADMIN.from(PAIRS).update({
  status:'pending_approval',device_secret_hash:await sha(secret),paired_at:iso(now())
 }).eq('id',match.id).eq('status','created').gt('expires_at',iso(now())).select('id').maybeSingle();
 if(!updated.data)deny('pair_consumed',409);
 return {id:updated.data.id,status:'pending_approval'};
}
export async function statusOrRedeem(action,id,secret){
 await quota('air3-v2-poll',90,60);
 const p=await devicePair(id,secret);
 if(p.status!=='redeemed'&&(!p.paired_at||Date.parse(p.paired_at)<=now()-600000))
  deny('approval_expired',410);
 if(action==='status')return {status:p.status};
 if(p.status!=='approved')deny('not_approved',403);
 await ownerPresent(p.owner_id);
 const lock=await ADMIN.from(PAIRS).update({status:'redeemed',redeemed_at:iso(now())})
  .eq('id',p.id).eq('status','approved').select('id').maybeSingle();
 if(!lock.data)deny('already_redeemed',409);
 const token=random(40);
 const s=await ADMIN.from(SESSIONS).insert({
  pairing_id:p.id,owner_id:p.owner_id,token_hash:await sha(token),
  expires_at:iso(now()+3600000)
 });
 if(s.error){await ADMIN.from(PAIRS).update({status:'revoked'}).eq('id',p.id);deny('session_unavailable',503);}
 const check=await ADMIN.from(PAIRS).select('status').eq('id',p.id).maybeSingle();
 if(check.data?.status!=='redeemed'){
  await ADMIN.from(SESSIONS).update({revoked_at:iso(now())}).eq('pairing_id',p.id).is('revoked_at',null);
  deny('pair_revoked');
 }
 return {token,expires_in:3600,id:p.id};
}
// Ping must NOT extend idle time; only user actions renew it.
// To avoid timing mistakes, all calls enforce both absolute expiry and 10-min idle.
export async function authorized(token,active=false){
 if(typeof token!=='string'||token.length<40||token.length>150)deny('session_required',401);
 const hash=await sha(token);
 const r=await ADMIN.from(SESSIONS).select('*').eq('token_hash',hash).maybeSingle();
 const s=r.data;
 if(r.error||!s||s.revoked_at)deny('session_revoked',401);
 const p=await ADMIN.from(PAIRS).select('status').eq('id',s.pairing_id).maybeSingle();
 if(p.error||p.data?.status!=='redeemed')deny('pair_revoked',401);
 if(Date.parse(s.expires_at)<=now()||Date.parse(s.last_seen_at)<=now()-600000){
  await ADMIN.from(SESSIONS).update({revoked_at:iso(now())}).eq('id',s.id).is('revoked_at',null);
  deny('session_expired',401);
 }
 await ownerPresent(s.owner_id);
 if(active){
  const touched=await ADMIN.from(SESSIONS).update({last_seen_at:iso(now())})
   .eq('id',s.id).is('revoked_at',null).gt('expires_at',iso(now()))
   .gt('last_seen_at',iso(now()-600000)).select('id').maybeSingle();
  if(!touched.data)deny('session_revoked',401);
 }
 return s;
}
export async function stillAllowed(s){
 const x=await ADMIN.from(SESSIONS).select('id').eq('id',s.id)
  .is('revoked_at',null).gt('expires_at',iso(now())).maybeSingle();
 const p=await ADMIN.from(PAIRS).select('id').eq('id',s.pairing_id).eq('status','redeemed').maybeSingle();
 if(!x.data||!p.data)deny('session_revoked',401);
}
export async function revoke(token){
 const s=await authorized(token,false);
 await ADMIN.from(SESSIONS).update({revoked_at:iso(now())}).eq('id',s.id).is('revoked_at',null);
 return {status:'revoked'};
}
