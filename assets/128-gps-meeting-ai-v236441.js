/* GPS-meeting AI UI v23.6.441. Explicit director request only; never runs on page load. */
(function(){
'use strict';
if(window.RESANTA_GPS_MEETING_AI_V236441)return;
const ALLOWED=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const user=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const allowed=()=>profile()?.role==='boss'&&ALLOWED.has(String(profile()?.email||user()?.email||'').trim().toLowerCase());
let busy=false,viewKey='';
const dateText=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return '—'}};
let snapshot=null,briefFilter='all';
function render(result,meta,root){
 snapshot={result,meta};
 const items=Array.isArray(result?.items)?result.items:[],warnings=Array.isArray(result?.data_warnings)?result.data_warnings:[];
 const categories={all:'Все вопросы',director_review:'Директору',manager:'Менеджерам',technical:'Проверить GPS'};
 const counts=Object.fromEntries(Object.keys(categories).map(c=>[c,c==='all'?items.length:items.filter(x=>x.audience===c).length]));
 const heading='<div style="padding:12px;background:#f4f8fc;border:1px solid #dbe5f2;border-radius:10px;line-height:1.5">'
  +'<b>Главное по GPS за период</b><div style="margin-top:5px;font-size:13px">'+esc(result?.summary||'Вопросов для совещания нет.')+'</div>'
  +(meta.model==='rules_only'?'<div style="margin-top:7px;color:#92400e;font-size:12px"><b>Резерв по правилам CRM.</b> Модель временно не ответила. Выводы по GPS предварительные.</div>':'')
  +'</div>';
 const tabs='<div style="display:flex;gap:7px;flex-wrap:wrap;margin:12px 0">'
  +Object.entries(categories).map(([k,title])=>'<button type="button" class="chip" data-gps-meeting-filter="'+k+'" style="padding:8px 11px;'+(briefFilter===k?'background:#dbeafe;border-color:#60a5fa;font-weight:700;':'')+'">'+esc(title)+' · '+counts[k]+'</button>').join('')+'</div>';
 const visible=items.filter(x=>briefFilter==='all'||x.audience===briefFilter);
 const titles={manager:'Вопрос менеджеру',director_review:'Проверить ДФ',technical:'Проблема GPS'};
 const cards=visible.map((x,i)=>{
  const audience=titles[x.audience]||'Проверка';
  const linked=/^[0-9a-f-]{36}$/i.test(x.evidence_route_plan_id||'');
  const action=linked?'<button type="button" class="btn-primary" data-gps-brief-case="'+esc(x.evidence_route_plan_id)+'" style="padding:8px 12px;font-size:12px">Открыть разбор ТТ ↗</button>':
   '<button type="button" class="btn-secondary" data-gps-director-jump="visits" style="padding:8px 12px;font-size:12px">К списку спорных ТТ ↗</button>';
  return '<details style="border:1px solid #dbe2ea;border-radius:10px;background:#fff;margin:7px 0;overflow:hidden">'
   +'<summary style="cursor:pointer;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 12px;list-style:revert">'
   +'<b style="flex:1;min-width:220px">'+esc(x.subject||'Вопрос №'+(i+1))+'</b><span style="color:#64748b;font-size:11px">'+esc(x.manager||'Общий вопрос')+'</span>'
   +'<span style="font-size:11px;color:'+(x.audience==='technical'?'#92400e':'#185fa5')+'">'+esc(audience)+'</span></summary>'
   +'<div style="border-top:1px solid #e2e8f0;padding:12px;font-size:12px;line-height:1.6">'
   +'<div><b>Почему:</b> '+esc(x.why)+'</div>'
   +'<div style="margin-top:6px"><b>Что проверить:</b> '+esc(x.ask)+'</div>'
   +'<div style="margin-top:6px"><b>Решение:</b> '+esc(x.recommendation)+'</div>'
   +'<div style="margin-top:6px;color:#475569"><b>Результат:</b> '+esc(x.expected_result)+'</div>'
   +'<div style="margin-top:9px;display:flex;gap:7px;flex-wrap:wrap">'+action
   +'<button type="button" class="btn-secondary" data-gps-director-jump="time" style="padding:8px 12px;font-size:12px">К GPS-остановкам ↗</button></div>'
   +'<div style="margin-top:6px;color:#64748b;font-size:11px">Приоритет: '+esc(x.priority)+' · Уверенность: '+esc(x.confidence)+'</div></div></details>';
 }).join('')||'<div style="padding:12px;color:#64748b">В выбранной категории открытых рекомендаций нет.</div>';
 const foot='<div style="color:#64748b;font-size:11px;margin-top:10px">Модель: '+esc(meta.model||'CRM')+' · '+(meta.cached?'сохранённый':'новый')+' результат · '+dateText(meta.generated_at)
   +' · стоимость API $'+Number(meta.estimated_cost_usd||0).toFixed(4)
   +'. Никакие посещения, маршруты и задачи автоматически не меняются.</div>';
 root.innerHTML=heading+tabs+'<div style="font-size:12px;color:#64748b;margin-bottom:6px">Нажми на вопрос, чтобы раскрыть подробности и перейти к конкретной ТТ.</div>'
   +cards+(warnings.length?'<details style="font-size:11px;color:#64748b;margin-top:10px"><summary>Ограничения данных ('+warnings.length+')</summary>'+esc(warnings.join(' · '))+'</details>':'')+foot;
}

async function run(btn){
 if(!allowed()||busy)return;
 const root=document.getElementById('gps-meeting-ai-result-v236441');if(!root)return;
 const period={
   from:document.getElementById('gps-dir-from-v236427')?.value||'',
   to:document.getElementById('gps-dir-to-v236427')?.value||'',
   manager:document.getElementById('gps-dir-manager-v236427')?.value||'all'
 };
 if(!period.from||!period.to)return;
 busy=true;btn.disabled=true;btn.textContent='ИИ анализирует…';
 root.textContent='Проверяю факты по маршрутам, составляю повестку. Это отдельный запрос к ИИ, остальные разделы CRM продолжают работать.';
 const thisKey=JSON.stringify(period);viewKey=thisKey;
 try{
  const {data:{session},error:authError}=await db.auth.getSession();
  if(authError||!session?.access_token)throw new Error('Сессия CRM закончилась. Войдите заново.');
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),44000);
  let response;
  try{response=await fetch('https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-gps-meeting-ai-v236441',{
    method:'POST',signal:ctl.signal,
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
    body:JSON.stringify(period)
  });}finally{clearTimeout(timer)}
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){
    const msg=result?.error==='GPS_AI_DAILY_LIMIT'?'Лимит генераций GPS-брифинга на сегодня исчерпан.':result?.error==='DIRECTOR_ONLY'?'Нет прав директора.':'ИИ временно недоступен: '+(result?.message||result?.error||response.status);
    throw new Error(msg);
  }
  if(viewKey===thisKey)render(result.result||{},result,root);
 }catch(e){if(viewKey===thisKey)root.innerHTML='<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:9px;padding:12px;font-size:12px">'+esc((e?.name==='AbortError'||/abort/i.test(String(e?.message||'')))?'ИИ-сервис не успел ответить. Повторите позже: результаты GPS и решения директора сохранены.':(e?.message||e))+
 '<div style="margin-top:4px">GPS-брифинг и сохранённые данные работают независимо от ИИ.</div></div>';}
 finally{busy=false;btn.disabled=false;btn.textContent='Подготовить совещание';}
}
document.addEventListener('click',e=>{
 const btn=e.target.closest?.('#gps-meeting-ai-run-v236441');if(btn&&allowed()){run(btn);return;}
 const f=e.target.closest?.('[data-gps-meeting-filter]');
 if(f&&allowed()&&snapshot){briefFilter=f.dataset.gpsMeetingFilter||'all';render(snapshot.result,snapshot.meta,document.getElementById('gps-meeting-ai-result-v236441'));}
},true);
window.RESANTA_GPS_MEETING_AI_V236441=Object.freeze({version:'v23.6.447',directorOnly:true,onDemand:true,model:'gpt-5.4-mini',doesNotWriteGps:true});
})();