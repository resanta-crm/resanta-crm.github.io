// Service-only persistence. Callers must finish current auth, role, client and
// route checks before entering this module. A changed fact set is not consent
// to pay again; only an explicit, revisioned instruction change can regenerate.
const TABLE='crm_task_route_drafts_v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const take=(value,n)=>String(value||'').trim().slice(0,n);
const now=()=>new Date().toISOString();
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const normalized=value=>String(value).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
export function preparationRequest(input){return {transcript:take(input.transcript,3000),season_exception:take(input.season_exception!==undefined?input.season_exception:input.plan?.season_exception,500)};}
export async function requestFingerprint(request){return digest(JSON.stringify([normalized(request.transcript),normalized(request.season_exception)]));}
export function draftPersistence(row,reused=true){return {revision:Number(row.revision),state:row.state,reused,request_id:row.request_id,created_at:row.created_at,updated_at:row.updated_at};}
function query(svc,routeId,clientId){
 if(!svc?.from)throw Error('TASK_ROUTE_DRAFT_UNAVAILABLE');
 return svc.from(TABLE).select('*').eq('route_id',routeId).eq('client_id',clientId);
}
export async function readRouteDraft(svc,routeId,clientId){
 const result=await query(svc,routeId,clientId).maybeSingle();
 if(result.error)throw Error('TASK_ROUTE_DRAFT_UNAVAILABLE');return result.data||null;
}
export async function readScopeDraft(svc,scope){
 if(scope?.kind!=='work')return null;
 const result=await svc.from(TABLE).select('*').eq('kind','work').eq('legal_key',scope.legal_key).eq('week_start',scope.week_start).maybeSingle();
 if(result.error)throw Error('TASK_ROUTE_DRAFT_UNAVAILABLE');return result.data||null;
}
export function routeDraftReference(row){return {route_id:row.route_id,client_id:row.client_id,route_day:row.route_day,manager_name:row.manager_name,revision:Number(row.revision),state:row.state};}
function snapshot(row){return {revision:row.revision,state:row.state,proposal:row.proposal,request:row.request,request_fingerprint:row.request_fingerprint,request_id:row.request_id,last_error:row.last_error,updated_by:row.updated_by,updated_at:row.updated_at};}
async function compareAndSet(svc,row,patch){
 const result=await svc.from(TABLE).update(patch).eq('route_id',row.route_id).eq('client_id',row.client_id).eq('revision',row.revision).eq('request_id',row.request_id).select('*').maybeSingle();
 if(result.error)throw Error('TASK_ROUTE_DRAFT_SAVE_FAILED');
 if(!result.data)throw Error('TASK_ROUTE_DRAFT_CHANGED: проект уже изменён; откройте сохранённую версию');
 return result.data;
}
async function alignScope(svc,row,scope,userId){
 const patch=Object.fromEntries(['kind','legal_key','week_start','route_day','manager_name'].map(key=>[key,scope[key]]));
 if(Object.keys(patch).every(key=>row[key]===patch[key]))return {row,scopeChanged:false};
 try{
  const updated=await compareAndSet(svc,row,{...patch,revision:Number(row.revision)+1,request_id:crypto.randomUUID(),state:row.state==='preparing'?'failed':row.state,last_error:row.state==='preparing'?'TASK_ROUTE_MOVED_DURING_PREPARATION: визит изменился во время подготовки; проверьте сохранённый проект вручную':row.last_error,updated_by:userId,updated_at:now(),versions:[...(row.versions||[]),snapshot(row)]});
  return {row:updated,scopeChanged:true};
 }catch(error){
  // An independently prepared proposal can already occupy the destination
  // legal/week. Preserve both anchors and show the existing one; never pay.
  const destination=await readScopeDraft(svc,scope);
  if(destination&&(destination.route_id!==row.route_id||destination.client_id!==row.client_id))return {row:destination,reference:true};
  throw error;
 }
}
export async function acquireRouteDraft(svc,userId,routeId,clientId,input,scope){
 const request=preparationRequest(input),fingerprint=await requestFingerprint(request);
 let row=await readRouteDraft(svc,routeId,clientId);
 if(!row){const shared=await readScopeDraft(svc,scope);if(shared)return {owner:false,row:shared,reference:true};}
 let scopeChanged=false;
 if(row){const aligned=await alignScope(svc,row,scope,userId);if(aligned.reference)return {owner:false,...aligned};row=aligned.row;scopeChanged=aligned.scopeChanged;}
 if(row){
  if(input.regenerate!==true)return {owner:false,row,scopeChanged};
  // The same request ID is an idempotent retry, even after another actor has
  // subsequently edited/rebuilt the draft. Never execute an old payment again.
  const replay=[row,...(row.versions||[])].find(version=>version.request_id===input.request_id);
  if(replay){if(replay.request_fingerprint!==fingerprint)throw Error('TASK_ROUTE_REQUEST_CONFLICT');return {owner:false,row};}
  if(row.request_fingerprint===fingerprint)return {owner:false,row};
  if(!request.transcript&&!request.season_exception)throw Error('TASK_ROUTE_REPLAN_INSTRUCTION_REQUIRED: опишите, что изменить в задаче');
  if(!UUID.test(input.request_id||''))throw Error('TASK_ROUTE_REQUEST_ID_REQUIRED');
  if(Number(input.expected_draft_revision)!==Number(row.revision))throw Error('TASK_ROUTE_DRAFT_CHANGED: проект уже изменён; откройте сохранённую версию');
  if(row.state==='preparing')return {owner:false,row};
  try{
   row=await compareAndSet(svc,row,{state:'preparing',revision:Number(row.revision)+1,request_id:input.request_id,request,request_fingerprint:fingerprint,last_error:null,updated_by:userId,updated_at:now(),started_at:now(),finished_at:null,versions:[...(row.versions||[]),snapshot(row)]});
   return {owner:true,row};
  }catch(error){
   if(!String(error.message).startsWith('TASK_ROUTE_DRAFT_CHANGED'))throw error;
   const current=await readRouteDraft(svc,routeId,clientId);
   if(current?.request_id===input.request_id&&current.request_fingerprint===fingerprint)return {owner:false,row:current};
   throw error;
  }
 }
 const requestId=UUID.test(input.request_id||'')?input.request_id:crypto.randomUUID(),stamp=now();
 row={route_id:routeId,client_id:clientId,kind:scope.kind,legal_key:scope.legal_key,week_start:scope.week_start,route_day:scope.route_day,manager_name:scope.manager_name,state:'preparing',proposal:null,revision:1,request_id:requestId,request,request_fingerprint:fingerprint,last_error:null,created_by:userId,updated_by:userId,created_at:stamp,updated_at:stamp,started_at:stamp,finished_at:null,versions:[]};
 const inserted=await svc.from(TABLE).insert(row);
 if(inserted.error){
  if(inserted.error.code!=='23505')throw Error('TASK_ROUTE_DRAFT_UNAVAILABLE');
  const current=await readRouteDraft(svc,routeId,clientId)||await readScopeDraft(svc,scope);if(!current)throw Error('TASK_ROUTE_DRAFT_UNAVAILABLE');
  return {owner:false,row:current,reference:current.route_id!==routeId||current.client_id!==clientId};
 }
 return {owner:true,row};
}
export async function completeRouteDraft(svc,lease,proposal){
 if(!lease.owner||!proposal||typeof proposal!=='object'||Array.isArray(proposal))throw Error('TASK_ROUTE_DRAFT_SAVE_FAILED');
 lease.row=await compareAndSet(svc,lease.row,{state:'ready',proposal,last_error:null,updated_at:now(),finished_at:now()});
 return lease.row;
}
export async function failRouteDraft(svc,lease,error){
 if(!lease.owner)return lease.row;
 lease.row=await compareAndSet(svc,lease.row,{state:'failed',last_error:take(error?.message||error,1500),updated_at:now(),finished_at:now()});
 return lease.row;
}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
export async function saveManualRouteDraft(svc,userId,routeId,clientId,input,proposal,scope){
 let row=await readRouteDraft(svc,routeId,clientId);
 if(!row){
  const lease=await acquireRouteDraft(svc,userId,routeId,clientId,{...input,regenerate:false},scope);
  if(lease.reference)throw Error('TASK_ROUTE_DRAFT_OTHER_VISIT: откройте сохранённый проект этого юрлица');
  if(!lease.owner){row=lease.row;}else return completeRouteDraft(svc,lease,proposal);
 }
 const aligned=await alignScope(svc,row,scope,userId);
 if(aligned.reference)throw Error('TASK_ROUTE_DRAFT_OTHER_VISIT: откройте сохранённый проект этого юрлица');
 row=aligned.row;
 // Network retries of the same free edit return its saved revision.
 if(row.state==='ready'&&JSON.stringify(stable(row.proposal))===JSON.stringify(stable(proposal)))return row;
 if(Number(input.expected_draft_revision)!==Number(row.revision))throw Error('TASK_ROUTE_DRAFT_CHANGED: проект уже изменён; откройте сохранённую версию');
 if(row.state==='preparing'&&Date.now()-Date.parse(row.started_at)<120000)throw Error('TASK_ROUTE_PREPARATION_RUNNING: дождитесь завершения подготовки');
 return compareAndSet(svc,row,{state:'ready',proposal,revision:Number(row.revision)+1,request_id:crypto.randomUUID(),last_error:null,updated_by:userId,updated_at:now(),finished_at:now(),versions:[...(row.versions||[]),snapshot(row)]});
}
