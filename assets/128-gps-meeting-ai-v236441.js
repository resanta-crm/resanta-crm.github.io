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
function render(result,meta,root){
 const items=Array.isArray(result?.items)?result.items:[],warnings=Array.isArray(result?.data_warnings)?result.data_warnings:[];
 const head='<div style="background:#f5faff;border:1px solid #d4e5fa;border-radius:9px;padding:12px;font-size:13px;line-height:1.5"><b>Главное для совещания</b><div style="margin-top:5px">'+esc(result?.summary||'Нет рекомендаций')+'</div></div>';
 const audienceTitles={
  manager:{title:'Вопросы для совещания с менеджерами',explain:'Только после подтверждения достоверности GPS и отчёта.',tone:'#166534'},
  technical:{title:'Техническая проверка CRM',explain:'Эти вопросы нельзя считать нарушениями менеджера. Сначала проверить систему.',tone:'#9a3412'},
  director_review:{title:'Проверить директору до обсуждения',explain:'Недостаточно надёжных доказательств для вопроса менеджеру.',tone:'#185fa5'}
 };
 const groups={manager:[],technical:[],director_review:[]};
 for(const x of items){const group=audienceTitles[x.audience]?x.audience:'technical';groups[group].push(x);}
 const counter='<div style="display:flex;gap:7px;flex-wrap:wrap;margin:9px 0 10px">'+
   '<span style="padding:7px 9px;background:#f0fdf4;border-radius:8px;font-size:12px">Менеджерам: <b>'+groups.manager.length+'</b></span>'+
   '<span style="padding:7px 9px;background:#fff7ed;border-radius:8px;font-size:12px">Техническая проверка: <b>'+groups.technical.length+'</b></span>'+
   '<span style="padding:7px 9px;background:#eff6ff;border-radius:8px;font-size:12px">Проверить директору: <b>'+groups.director_review.length+'</b></span></div>';
 const renderItem=(x,i,audience)=>{
  const color=x.priority==='высокий'?'#9a3412':x.priority==='средний'?'#185fa5':'#475569';
  const link=x.evidence_route_plan_id&&/^[0-9a-f-]{36}$/i.test(x.evidence_route_plan_id)?
    '<button type="button" class="btn-secondary" data-gps-brief-case="'+esc(x.evidence_route_plan_id)+'" style="margin-top:8px">Открыть доказательства</button>':'';
  const askTitle=audience==='manager'?'Спросить менеджера':audience==='technical'?'Что проверить технически':'Что установить директору';
  return '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:13px;margin-top:9px;background:#fff">'+
   '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>'+(i+1)+'. '+esc(x.subject)+'</b>'+
   '<span style="font-size:11px;color:'+color+'">Приоритет: '+esc(x.priority)+'</span></div>'+
   '<div style="font-size:11px;color:#64748b;margin:5px 0">Связан с: '+esc(x.manager||'Общий вопрос')+' · Уверенность: '+esc(x.confidence)+'</div>'+
   '<div style="font-size:12px;margin-top:6px"><b>Основание:</b> '+esc(x.why)+'</div>'+
   '<div style="font-size:12px;margin-top:6px"><b>'+esc(askTitle)+':</b> '+esc(x.ask)+'</div>'+
   '<div style="font-size:12px;margin-top:6px"><b>Предложить:</b> '+esc(x.recommendation)+'</div>'+
   '<div style="font-size:12px;margin-top:6px"><b>Ожидаемый результат:</b> '+esc(x.expected_result)+'</div>'+link+'</div>';
 };
 const agenda=['manager','technical','director_review'].map(category=>{
   const cfg=audienceTitles[category],rows=groups[category];
   return '<div style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:10px"><b style="font-size:14px;color:'+cfg.tone+'">'+
     esc(cfg.title)+' · '+rows.length+'</b><div style="font-size:11px;color:#64748b;margin-top:3px">'+esc(cfg.explain)+'</div>'+
     (rows.length?rows.map((x,i)=>renderItem(x,i,category)).join(''):
       '<div style="font-size:11px;color:#64748b;padding:8px 0">Пока нет подтверждённых вопросов.</div>')+'</div>';
 }).join('');
 const disclaimer=warnings.length?'<div style="margin-top:10px;font-size:11px;color:#64748b">Ограничения данных: '+esc(warnings.join('; '))+'</div>':'';
 const usd=Number(meta.estimated_cost_usd||0);
 const model=meta.model==='gpt-5.4-mini'?'GPT-5.4 mini':meta.model==='gpt-5-mini'?'GPT-5 mini (резерв)':'CRM';
 const footer='<div style="margin-top:10px;color:#64748b;font-size:11px">'+
 'Модель: '+esc(model)+' · '+(meta.cached?'Сохранённый результат':'Новая генерация')+
 ' · '+dateText(meta.generated_at)+' · оценка затрат API $'+usd.toFixed(4)+
 ' · '+esc(String(meta.input_tokens||0))+' входных / '+esc(String(meta.output_tokens||0))+' выходных токенов.'+
 '<div>ИИ не создаёт задачи и не делает выводов о нарушении автоматически. Решение принимает руководитель.</div></div>';
 root.innerHTML=head+counter+agenda+disclaimer+footer;
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
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),47000);
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
 }catch(e){if(viewKey===thisKey)root.innerHTML='<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:9px;padding:12px;font-size:12px">'+esc(e?.message||e)+
 '<div style="margin-top:4px">GPS-брифинг и сохранённые данные работают независимо от ИИ.</div></div>';}
 finally{busy=false;btn.disabled=false;btn.textContent='Подготовить совещание';}
}
document.addEventListener('click',e=>{
 const btn=e.target.closest?.('#gps-meeting-ai-run-v236441');if(btn&&allowed())run(btn);
},true);
window.RESANTA_GPS_MEETING_AI_V236441=Object.freeze({version:'v23.6.441',directorOnly:true,onDemand:true,model:'gpt-5.4-mini',doesNotWriteGps:true});
})();