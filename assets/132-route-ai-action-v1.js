/* RESANTA CRM · On-demand director action dialog for monthly route suggestions.
 * Uses the existing manual route editor; nothing is written on dialog open or cancel.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_AI_ACTION_V1)return;
const VERSION='route-ai-action-1.0.0',ID='route-ai-action-dialog-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v||'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
const boss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const plusDays=(date,count)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10)};
let busy=false,activeToken=0;
function remove(){document.getElementById(ID)?.remove()}
async function candidates(client){
 const start=plusDays(today(),1),until=plusDays(today(),92),arr=[];
 // Read-only: same manager and future, approved physical city stops only.
 for(let p=0;p<3;p++){
  const {data,error}=await db.from('route_plans')
   .select('id,visit_date,city,client_id,linked_client_ids,removed,approved,review_status,is_office_day,is_network_point,physical_point_id,physical_point_key')
   .eq('manager_name',client.manager_name).gte('visit_date',start).lte('visit_date',until)
   .order('visit_date',{ascending:true}).range(p*1000,p*1000+999);
  if(error)throw error;
  arr.push(...(data||[]));if((data||[]).length<1000)break;
 }
 const byDate=new Map();
 const allByDate=new Map();
 for(const r of arr){
  if(r.removed)continue;
  if(!allByDate.has(r.visit_date))allByDate.set(r.visit_date,[]);
  allByDate.get(r.visit_date).push(r);
  if(r.is_office_day||!(r.approved===true||r.review_status==='approved')||key(r.city)!==key(client.city))continue;
  if(!byDate.has(r.visit_date))byDate.set(r.visit_date,[]);
  byDate.get(r.visit_date).push(r);
 }
 const result=[];
 for(const [date,rows] of byDate){
  const day=allByDate.get(date)||[];
  if(day.some(r=>r.is_office_day))continue;
  const ids=new Set(day.map(r=>String(r.physical_point_id||r.physical_point_key||r.client_id||r.id)));
  if(ids.size>=15)continue;
  const already=day.some(r=>String(r.client_id||'')===String(client.id)||Array.isArray(r.linked_client_ids)&&r.linked_client_ids.map(String).includes(String(client.id)));
  result.push({date,stopCount:ids.size,already});
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,20);
}
function wrap(f,ym,client,dates){
 remove();
 const holder=document.createElement('div');holder.id=ID;
 holder.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
 const city=String(client.city||'');
 holder.innerHTML='<div role="dialog" aria-modal="true" aria-label="Решение директора по рекомендации ИИ" style="background:#fff;width:min(100%,650px);max-height:90vh;overflow:auto;border-radius:14px;padding:18px;box-shadow:0 14px 40px rgba(0,0,0,.22);font-size:13px;line-height:1.5">'
  +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:9px"><div style="font-size:16px;font-weight:750">🤖 Решение ДФ: '+esc(client.name)+'</div><button type="button" data-ai-close class="btn-secondary">✕</button></div>'
  +'<div style="color:#475569;margin:7px 0 12px"><b>'+esc(f.manager)+'</b> · город <b>'+esc(city||'не указан')+'</b> · анализ '+esc(ym)+'</div>'
  +'<div style="padding:9px 11px;border:1px solid #dbeafe;border-radius:8px;background:#eff6ff;margin-bottom:12px"><b>Причина:</b> '+esc(f.reason)+'<div style="margin-top:5px">'+esc(f.proof)+'</div></div>'
  +'<section style="border:1px solid #e2e8f0;border-radius:9px;padding:12px;margin-bottom:10px">'
  +'<b>1. Включить в будущую поездку по городу</b>'
  +(dates.length?'<div style="margin:7px 0;color:#475569">Дни, когда у этого менеджера уже утверждена поездка в '+esc(city)+'. Выбери дату и проверь состав дня.</div>'
   +'<div style="display:flex;flex-wrap:wrap;gap:8px"><select id="route-ai-pick-day-v1" class="form-input" style="flex:1;min-width:190px">'
   +dates.map(d=>'<option value="'+esc(d.date)+'">'+esc(d.date)+' · '+d.stopCount+' точек'+(d.already?' · клиент уже в маршруте':'')+'</option>').join('')
   +'</select><button type="button" data-ai-visit class="btn-primary">Открыть маршрут с клиентом</button></div>'
   :'<div style="color:#92400e;margin-top:6px">Пока нет утверждённых будущих выездов по этому городу со свободным местом. Создать поездку задним числом нельзя. Можно назначить прозвон или обсудить будущий маршрут на совещании.</div>')
  +'</section>'
  +'<section style="border:1px solid #e2e8f0;border-radius:9px;padding:12px">'
  +'<b>2. Поручить прозвон менеджеру</b><div style="color:#475569;margin:5px 0">Укажи срок и зафиксируй задачу. Повторная открытая задача из этого ИИ-аудита не создаётся.</div>'
  +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><label>Срок: <input id="route-ai-call-date-v1" class="form-input" type="date" min="'+today()+'" style="width:170px;display:inline-block"></label>'
  +'<button type="button" data-ai-call class="btn-secondary">Создать задачу на прозвон</button></div></section>'
  +'<div id="route-ai-action-message-v1" aria-live="polite" style="font-size:12px;color:#475569;margin-top:10px">Отмена ничего не меняет. Запись визита выполняется только в действующем ручном редакторе после подтверждения ДФ.</div></div>';
 holder.addEventListener('click',e=>{if(e.target===holder&&!busy)remove()});
 holder.querySelector('[data-ai-close]').addEventListener('click',()=>{if(!busy)remove()});
 function setMessage(t,bad){const root=holder.querySelector('#route-ai-action-message-v1');root.textContent=t;root.style.color=bad?'#991b1b':'#166534'}
 function setBusy(v){busy=v;holder.querySelectorAll('button').forEach(b=>b.disabled=v)}
 holder.querySelector('[data-ai-visit]')?.addEventListener('click',async()=>{
  const selected=holder.querySelector('#route-ai-pick-day-v1')?.value||'';
  if(!selected){setMessage('Выбери дату поездки.',true);return;}
  if(!confirm('Открыть ручной маршрут '+f.manager+' на '+selected+' и предварительно отметить '+client.name+'? Маршрут не изменится, пока ДФ не сохранит день.'))return;
  setBusy(true);
  try{
   if(typeof window.resantaRouteAiPrepareV1!=='function')throw new Error('Ручной редактор маршрута ещё загружается');
   await window.resantaRouteAiPrepareV1({manager:f.manager,date:selected,clientId:client.id,review:{...f,audit_month:ym}});
   remove();
  }catch(e){setMessage('Не удалось подготовить день: '+(e.message||e),true)}finally{setBusy(false)}
 });
 holder.querySelector('[data-ai-call]').addEventListener('click',async()=>{
  const due=holder.querySelector('#route-ai-call-date-v1')?.value||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||due<today()){setMessage('Выбери сегодняшнюю или будущую дату срока.',true);return}
  if(!confirm('Поставить '+f.manager+' задачу прозвонить '+client.name+' до '+due+'?'))return;
  setBusy(true);
  try{
   const {data:existing,error:findErr}=await db.from('tasks')
    .select('id,due_date,done').eq('client_id',client.id).eq('manager_name',f.manager)
    .eq('source','route_ai_call_v1').eq('done',false).limit(1);
   if(findErr)throw findErr;
   let task=existing?.[0]||null;
   if(!task){
    const {data,error}=await db.from('tasks').insert({
      client_id:client.id,manager_name:f.manager,source:'route_ai_call_v1',auto_generated:false,done:false,
      title:'Прозвон клиента по рекомендации ИИ-аудита маршрута',
      text:'Связаться с '+client.name+'. Причина: '+f.reason+' Уточнить потребность, причины отклонения и следующий шаг. Доложить ДФ.',
      basis:'ИИ-аудит маршрута '+ym+': '+f.proof,
      expected_result:'Контакт с клиентом, причина изменения закупок/непосещения, конкретная договорённость и следующий шаг',
      due_date:due,priority:'высокий',review_status:'approved'
    }).select('id,due_date,done').single();
    if(error)throw error;task=data;
   }
   const save=await window.resantaRouteAiStoreActionV1?.({...f,audit_month:ym},{kind:'call',audit_month:ym,due_date:task.due_date,task_id:task.id,created_or_reused:existing?.length?'reused':'created'});
   if(!save)throw new Error('Задача сохранена, но решение ДФ не удалось отметить. Повторно задачу не создавайте.');
   try{window.renderTasks?.()}catch(_){}
   remove();
   alert('Задача на прозвон зарегистрирована за '+f.manager+' до '+task.due_date+'. Решение ДФ сохранено в ИИ-аудите.');
  }catch(e){setMessage('Не удалось завершить действие: '+(e.message||e),true)}finally{setBusy(false)}
 });
 document.body.appendChild(holder);
}
window.resantaRouteAiActionV1=async function(f,ym){
 if(!boss()||busy||!f?.clientId)return;
 const c=(typeof allClients!=='undefined'?allClients:[]).find(x=>String(x.id)===String(f.clientId));
 if(!c){alert('Карточка клиента не найдена. Обнови данные CRM.');return}
 if(String(c.manager_name||'')!==String(f.manager||'')){alert('Клиент переназначен другому менеджеру. Запусти аудит заново.');return}
 const client={id:c.id,name:c.name,manager_name:c.manager_name,city:String(c.city||c.region||'').trim()};
 const token=++activeToken;
 try{
  const dates=client.city?await candidates(client):[];
  if(token!==activeToken)return;
  wrap(f,ym,client,dates);
 }catch(e){console.error(VERSION,e);alert('Не удалось проверить будущие маршруты: '+(e.message||e))}
};
window.addEventListener('resanta-route-ai-saved',async ev=>{
 if(!boss())return;
 const d=ev.detail||{},f=d.review;
 if(!f||!d.clientId||String(f.clientId)!==String(d.clientId)||f.manager!==d.manager)return;
 try{
  const action={kind:'visit',audit_month:f.audit_month,date:d.date,manager:d.manager,client_id:d.clientId};
  const saved=await window.resantaRouteAiStoreActionV1?.(f,action);
  if(!saved)alert('Визит сохранён в маршруте, но статус ИИ-рекомендации не удалось обновить. Перезапустите аудит.');
 }catch(e){console.warn(VERSION,'review status',e)}
});
window.RESANTA_ROUTE_AI_ACTION_V1=Object.freeze({version:VERSION,directorOnly:true,manualEditorOnly:true,callRequiresConfirm:true,show:window.resantaRouteAiActionV1});
})();