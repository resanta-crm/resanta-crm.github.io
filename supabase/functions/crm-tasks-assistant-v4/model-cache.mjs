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
export async function cachedModel(svc,userId,instructions,input,run){
 const source=raw=>JSON.stringify(['tasks-v2','gpt-5.4-mini',userId,instructions,raw]);
 const key=await digest(source(canonicalModelInput(input))),legacyKey=await digest(source(input));
 const table='crm_task_model_cache_v1';
 const canonical=await svc.from(table).select('status,result').eq('key',key).maybeSingle();
 if(canonical.error)throw Error('TASK_CACHE_UNAVAILABLE');
 if(canonical.data?.status==='ready')return canonical.data.result;
 if(canonical.data?.status==='failed')throw Error('TASK_PREPARATION_FAILED: предыдущая попытка не завершилась; повторная оплата заблокирована, обратитесь в техподдержку');
 if(canonical.data?.status==='running')throw Error('TASK_PREPARATION_RUNNING: подготовка уже запущена; дождитесь результата и откройте маршрут снова');
 // Reuse responses paid for before canonicalisation; never charge for migration.
 if(key!==legacyKey){
  const old=await svc.from(table).select('status,result').eq('key',legacyKey).maybeSingle();
  if(old.error)throw Error('TASK_CACHE_UNAVAILABLE');
  if(old.data?.status==='ready'){
   const saved=await svc.from(table).insert({key,user_id:userId,status:'ready',result:old.data.result});
   if(saved.error&&saved.error.code!=='23505')throw Error('TASK_CACHE_UNAVAILABLE');
   return old.data.result;
  }
 }
 const inserted=await svc.from(table).insert({key,user_id:userId,status:'running'});
 if(inserted.error){
  if(inserted.error.code!=='23505')throw Error('TASK_CACHE_UNAVAILABLE: подготовка временно недоступна');
  const found=await svc.from(table).select('status,result').eq('key',key).single();
  if(found.error)throw Error('TASK_CACHE_UNAVAILABLE: не удалось прочитать сохранённую подготовку');
  if(found.data.status==='ready')return found.data.result;
  if(found.data.status==='failed')throw Error('TASK_PREPARATION_FAILED: предыдущая попытка не завершилась; повторная оплата заблокирована, обратитесь в техподдержку');
  throw Error('TASK_PREPARATION_RUNNING: подготовка уже запущена; дождитесь результата и откройте маршрут снова');
 }
 try{
  const result=await run();
  const saved=await svc.from(table).update({status:'ready',result}).eq('key',key);
  if(saved.error)throw Error('TASK_CACHE_SAVE_FAILED');
  return result;
 }catch(error){
  // A rejected reservation made no external request and may be retried after top-up.
  if(error.message==='budget_unavailable')await svc.from(table).delete().eq('key',key);
  else await svc.from(table).update({status:'failed'}).eq('key',key);
  throw error;
 }
}
