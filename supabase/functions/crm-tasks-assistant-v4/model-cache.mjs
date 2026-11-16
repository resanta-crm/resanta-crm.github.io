// Only the authenticated server may access this table. Permissions and current
// client/route facts are checked by workspaceAction before this function runs.
function stable(value){
 if(Array.isArray(value)){
  const rows=value.map(stable);
  return rows.every(x=>x&&typeof x==='object')?rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):rows;
 }
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
}
export function canonicalModelInput(input){
 const at=input.indexOf('\n');
 try{return input.slice(0,at+1)+JSON.stringify(stable(JSON.parse(input.slice(at+1))));}catch{return input;}
}
const digest=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');
// Called only after workspaceAction's current boss/route/client checks, using
// the caller's RLS session. Never enumerate cache rows or cross-branch actors.
export async function legacyPreparationUserIds(caller,userId){
 const result=await caller.from('users').select('id').eq('role','boss').in('region',['Витебск','Все филиалы']);
 if(result.error||!Array.isArray(result.data))throw Error('TASK_CACHE_ACTORS_UNAVAILABLE: не удалось проверить ранее оплаченные проекты; новый платный запрос не запускался');
 return [...new Set([userId,...result.data.map(row=>row.id).filter(id=>typeof id==='string'&&id)])];
}
export async function cachedModel(svc,userId,instructions,input,run,options={}){
 // Shared preparation contains only facts already read through this caller's
 // RLS/access checks. Record/transcript actions remain private to the user.
 const source=(raw,id=userId,version='tasks-v2')=>JSON.stringify([version,'gpt-5.4-mini',id,instructions,raw]);
 const key=await digest(source(canonicalModelInput(input),options.shared?'authorized-route-plan':userId,'tasks-v3'));
 const table='crm_task_model_cache_v1';
 const read=async k=>{const r=await svc.from(table).select('status,result').eq('key',k).maybeSingle();if(r.error)throw Error('TASK_CACHE_UNAVAILABLE');return r.data;};
 const value=row=>{if(row?.status==='ready')return row.result;
  if(row?.status==='failed')throw Error('TASK_PREPARATION_FAILED: предыдущая попытка не завершилась; повторная оплата заблокирована. Составьте задачу вручную или обратитесь в техподдержку');
  if(row?.status==='running')throw Error('TASK_PREPARATION_RUNNING: подготовка уже запущена; дождитесь результата и откройте маршрут снова');
 };
 const canonical=await read(key);if(canonical)return value(canonical);
 // Reuse responses paid for under the old serializer before making any call.
 // Both raw and canonical old keys are checked. Shared preparation may reuse
 // an authorized branch boss's exact old input; personal records stay private.
 // The IDs came from caller-RLS role/region checks, never from request JSON.
 const aliases=new Set();
 const actors=options.shared?[...new Set([userId,...(options.legacyUserIds||[])])]:[userId];
 for(const actor of actors)for(const raw of [input,...(options.legacyInputs||[])])for(const variant of [canonicalModelInput(raw),raw])aliases.add(await digest(source(variant,actor)));
 for(const alias of aliases){
  const old=await read(alias);if(!old)continue;
  const result=value(old);
  const saved=await svc.from(table).insert({key,user_id:userId,status:'ready',result});
  if(saved.error&&saved.error.code!=='23505')throw Error('TASK_CACHE_UNAVAILABLE');
  return result;
 }
 const inserted=await svc.from(table).insert({key,user_id:userId,status:'running'});
 if(inserted.error){
  if(inserted.error.code!=='23505')throw Error('TASK_CACHE_UNAVAILABLE: подготовка временно недоступна');
  const found=await read(key);if(!found)throw Error('TASK_CACHE_UNAVAILABLE');return value(found);
 }
 try{
  const result=await run();
  const saved=await svc.from(table).update({status:'ready',result}).eq('key',key);
  if(saved.error)throw Error('TASK_CACHE_SAVE_FAILED');
  return result;
 }catch(error){
  // No external call occurred on a rejected reservation.
  if(error.message==='budget_unavailable')await svc.from(table).delete().eq('key',key);
  else await svc.from(table).update({status:'failed'}).eq('key',key);
  throw error;
 }
}
