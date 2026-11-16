// Only the authenticated server may access this table. Permissions and current
// client/route facts are checked by workspaceAction before this function runs.
export async function cachedModel(svc,userId,instructions,input,run){
 const source=JSON.stringify(['tasks-v2','gpt-5.4-mini',userId,instructions,input]);
 const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');
 const table='crm_task_model_cache_v1';
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
