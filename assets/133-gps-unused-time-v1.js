/* RESANTA CRM v23.7.7 — GPS time review.
 * Director only; explicit request; reads only saved GPS aggregates.
 * Not a disciplinary score: unrecognized stop != lost time.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_UNUSED_TIME_V1)return;
const VERSION='23.7.8',ID='gps-unused-time-v1';
const ALLOWED=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prof=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const me=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const allowed=()=>prof()?.role==='boss'&&ALLOWED.has(String(prof()?.email||me()?.email||'').trim().toLowerCase());
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const minus=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)};
const dayFmt=iso=>{const x=String(iso||'');return /^\d{4}-\d{2}-\d{2}$/.test(x)?x.slice(8,10)+'.'+x.slice(5,7)+'.'+x.slice(0,4):x};
const hm=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
const fmt=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:1});
let busy=false,data=null,pageSize=12,view='day',status='pending',onlyRepeats=false,focus='all',selectedPeriod='',selectedManager='',showClosed=false,aiBusy=false;
const aiByStop=new Map();
function panel(){return document.getElementById(ID)}
function managerOptions(){
  return ['all','Ачинович','Руднев','Шкуран']
   .map(v=>'<option value="'+esc(v)+'">'+esc(v==='all'?'Все менеджеры':v)+'</option>').join('');
}
function install(){
 if(!allowed())return false;
 const outer=document.getElementById('gps-director-view-v236427');
 if(!outer||!document.getElementById('gps-meeting-ai-v236441'))return false;
 if(panel())return true;
 const root=document.createElement('section');root.id=ID;root.className='gps-brief-card';
 root.style.cssText='border:1px solid #cbd5e1;margin-bottom:12px';
 const to=today(),from=minus(to,13);
 root.innerHTML='<div class="gps-brief-top"><div><div class="gps-brief-title" style="font-size:16px">⏱ Контроль времени · GPS-остановки</div>'
   +'<div class="gps-brief-muted">Длительные нераспознанные остановки и повторяющиеся места. Ни одна минута автоматически не считается нарушением.</div></div>'
   +'<span style="font-size:11px;color:var(--sub)">Только директор · по запросу</span></div>'
   +'<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:12px">'
   +'<label class="form-label">С <input type="date" id="gps-time-from-v1" class="form-input" value="'+from+'" style="margin-top:4px;width:150px"></label>'
   +'<label class="form-label">По <input type="date" id="gps-time-to-v1" class="form-input" value="'+to+'" style="margin-top:4px;width:150px"></label>'
   +'<label class="form-label">Менеджер <select id="gps-time-manager-v1" class="form-input" style="margin-top:4px;min-width:145px">'+managerOptions()+'</select></label>'
   +'<label class="form-label">Порог <select id="gps-time-min-v1" class="form-input" style="margin-top:4px;width:135px"><option value="30">30 минут</option><option value="20">20 минут</option><option value="45">45 минут</option><option value="60">60 минут</option></select></label>'
   +'<button type="button" class="btn-primary" id="gps-time-run-v1" style="min-height:40px">Проверить время</button></div>'
   +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">'
   +'<button type="button" class="chip" data-time-preset="day">За день</button>'
   +'<button type="button" class="chip" data-time-preset="week">За 7 дней</button>'
   +'<button type="button" class="chip" data-time-preset="month">За 30 дней</button>'
   +'</div>'
   +'<div id="gps-time-results-v1" style="font-size:12px;color:var(--sub);line-height:1.5">Выберите период до 31 дня и нажмите «Проверить время». Расчёт не запускается при открытии CRM.</div>';
 document.getElementById('gps-meeting-ai-v236441').insertAdjacentElement('afterend',root);
 root.addEventListener('click',async e=>{
  const run=e.target.closest('#gps-time-run-v1');if(run){await load();return}
  const preset=e.target.closest('[data-time-preset]');if(preset){
    const days=({day:0,week:6,month:29})[preset.dataset.timePreset];if(days===undefined)return;
    const to=today();root.querySelector('#gps-time-from-v1').value=minus(to,days);root.querySelector('#gps-time-to-v1').value=to;
    document.getElementById('gps-time-results-v1').textContent='Период выбран. Нажмите «Проверить время», чтобы обновить расчёт.';return;
  }
  const metric=e.target.closest('[data-time-metric]');if(metric){
    focus=metric.dataset.timeMetric||'all';selectedPeriod='';selectedManager='';onlyRepeats=focus==='repeat';pageSize=12;render();
    document.getElementById('gps-time-details-v2')?.scrollIntoView({behavior:'smooth',block:'start'});return;
  }
  const day=e.target.closest('[data-time-period]');if(day){
    const period=day.dataset.timePeriod,manager=day.dataset.timeManager||'';
    if(selectedPeriod===period&&selectedManager===manager){selectedPeriod='';selectedManager=''}else{selectedPeriod=period;selectedManager=manager}
    focus='stops';pageSize=12;render();
    document.getElementById('gps-time-details-v2')?.scrollIntoView({behavior:'smooth',block:'start'});return;
  }
  const show=e.target.closest('[data-time-show-closed]');if(show){showClosed=!showClosed;pageSize=12;render();return}
  const more=e.target.closest('[data-time-more]');if(more){pageSize+=12;render();return}
  const toggle=e.target.closest('[data-time-repeat]');if(toggle){onlyRepeats=!onlyRepeats;pageSize=12;render();return}
  const map=e.target.closest('[data-time-map]');if(map){
   const id=map.dataset.timeMap;
   if(/^[a-f0-9-]{36}$/i.test(id)&&typeof window.crmOpenGpsViewerV2360==='function')window.crmOpenGpsViewerV2360(id);
   return;
  }
  const ai=e.target.closest('[data-time-ai]');if(ai){await analyzeStop(Number(ai.dataset.timeAi));return}
  const route=e.target.closest('[data-time-route]');if(route){
    if(!window.confirm('Открыть планирование маршрутов? Директор сможет пересмотреть будущие выезды. Уже подтверждённые GPS-визиты автоматически не меняются.'))return;
    const link=document.getElementById('nav-routes-boss')||document.getElementById('bn-routes-boss');
    if(link)link.click();else if(typeof window.goPage==='function')window.goPage('routes-boss','Маршруты · Согласование');
    return;
  }
  const delegate=e.target.closest('[data-time-delegate]');if(delegate){await delegateStop(Number(delegate.dataset.timeDelegate));return}
  const decision=e.target.closest('[data-time-decision]');if(decision){await decide(Number(decision.dataset.timeIndex),decision.dataset.timeDecision)}
 });
 root.addEventListener('change',e=>{
   if(e.target.matches('#gps-time-view-v1')){view=e.target.value;render()}
   if(e.target.matches('#gps-time-status-v1')){status=e.target.value;pageSize=12;render()}
   if(e.target.matches('#gps-time-from-v1,#gps-time-to-v1,#gps-time-manager-v1,#gps-time-min-v1')){
     if(data)document.getElementById('gps-time-results-v1').insertAdjacentHTML('afterbegin','<div style="padding:6px;color:#92400e">Фильтр изменён. Нажмите «Проверить время», чтобы обновить данные.</div>');
     data=null;
   }
 });
 return true;
}
function output(html){const el=document.getElementById('gps-time-results-v1');if(el)el.innerHTML=html}
async function load(){
 if(!allowed()||busy||!panel())return;
 const from=panel().querySelector('#gps-time-from-v1').value,to=panel().querySelector('#gps-time-to-v1').value;
 const manager=panel().querySelector('#gps-time-manager-v1').value,minutes=Number(panel().querySelector('#gps-time-min-v1').value);
 const dayCount=Math.round((new Date(to+'T12:00:00Z')-new Date(from+'T12:00:00Z'))/86400000)+1;
 if(!from||!to||!(dayCount>=1&&dayCount<=31)||to>today()){
  output('<div style="color:#991b1b">Укажите корректный период: от 1 до 31 дня, не позже сегодняшнего дня.</div>');return;
 }
 busy=true;const btn=panel().querySelector('#gps-time-run-v1');btn.disabled=true;btn.textContent='Проверяю…';
 output('<div style="padding:12px;color:var(--sub)">Загружаю сохранённые агрегаты GPS и классификацию остановок…</div>');
 try{
  const {data:result,error}=await db.rpc('gps_director_time_review_v1',{
   p_from:from,p_to:to,p_manager:manager,p_min_minutes:minutes
  });
  if(error)throw error;
  if(!result||!Array.isArray(result.days)||!Array.isArray(result.stops))throw new Error('Некорректный ответ аналитики');
  data=result;status='pending';focus='all';selectedPeriod='';selectedManager='';showClosed=false;onlyRepeats=false;pageSize=12;render();
 }catch(e){console.error(VERSION,e);output('<div style="padding:11px;color:#991b1b">Не удалось выполнить анализ: '+esc(e.message||e)+'</div>')}
 finally{busy=false;btn.disabled=false;btn.textContent='Проверить время'}
}
function weekStart(iso){
 const d=new Date(iso+'T12:00:00Z'),dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);return d.toISOString().slice(0,10);
}
function groupKey(d){
 return view==='month'?d.date.slice(0,7):view==='week'?weekStart(d.date):d.date;
}
function groups(){
 const m=new Map();
 for(const d of (data?.days||[])){
  const period=groupKey(d),k=String(d.manager||'—')+'|'+period;
  if(!m.has(k))m.set(k,{key:period,manager:String(d.manager||'—'),total:0,good:0,poor:0,checkMin:0,checkStops:0,knownTt:0,unknown:0});
  const g=m.get(k);g.total++;if(d.quality==='ready'){g.good++;const unhandled=(data.stops||[]).filter(x=>x.workday_id===d.workday_id&&!['explained','technical'].includes(x.review_status||''));g.checkMin+=unhandled.reduce((n,x)=>n+Number(x.minutes||0),0);g.checkStops+=unhandled.length;g.knownTt+=Number(d.planned_tt_minutes||0)+Number(d.offplan_tt_minutes||0);g.unknown+=Number(d.unrecognized_stop_minutes||0)}else g.poor++;
 }
 return [...m.values()].sort((a,b)=>b.key.localeCompare(a.key)||a.manager.localeCompare(b.manager,'ru'));
}
function render(){
 if(!data)return;
 const s=data.summary||{},list=data.stops||[],summary=groups();
 const open=list.filter(x=>!['explained','technical'].includes(x.review_status||''));
 const openMinutes=open.reduce((n,x)=>n+Number(x.minutes||0),0);
 const visible=list.filter(x=>{
  const closed=['explained','technical'].includes(x.review_status||'');
  return (showClosed||!closed)&&(!onlyRepeats||Number(x.repeat_days)>=2)
    &&(!selectedPeriod|| ((view==='month'?x.date.slice(0,7):view==='week'?weekStart(x.date):x.date)===selectedPeriod && (!selectedManager||x.manager===selectedManager)));
 });
 const metric=(name,value,sub,code)=>'<button type="button" data-time-metric="'+code+'" style="border:1px solid '+(focus===code?'#2563eb':'#e2e8f0')+';border-radius:9px;padding:10px 12px;background:'+(focus===code?'#eff6ff':'#f8fafc')+';text-align:left;cursor:pointer;color:inherit"><span style="display:block;color:#64748b;font-size:11px">'+esc(name)+'</span><strong style="display:block;font-size:22px;margin:3px 0">'+esc(String(value))+'</strong><span style="color:#64748b;font-size:11px">'+esc(sub)+' · открыть ↗</span></button>';
 let html='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:12px 0">'
   +metric('GPS-дней',s.all_days||0,'Выбранный период','days')
   +metric('Дней с данными',s.quality_days||0,'Пригодны для анализа','ready')
   +metric('Недостаточно данных',s.unreliable_days||0,'Нужна проверка GPS','poor')
   +metric('Остановок к разбору',open.length,'Всего найдено '+(s.candidate_stops||0),'stops')
   +metric('Время к разбору',fmt(openMinutes)+' мин','Возможные остановки, не потеря','minutes')
   +metric('Повторных остановок',s.repeat_stops||0,'Сопоставлено в радиусе 200 м','repeat')
   +'</div>'
   +'<div style="color:#475569;font-size:11px;margin:8px 0 12px">В оценку попадают только завершённые дни с готовыми агрегатами и достаточным качеством GPS. Учитываются лишь внутренние остановки вне распознанных ТТ, домашней/стартовой зоны, с точностью GPS до 100 м. Обед, заправка, ожидание клиента и проблемы связи не являются нарушением. GPS-разрывы и точная длительность езды не приравниваются к простою.</div>'
   +'<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:9px"><b>Сводка времени по менеджерам и датам</b>'
   +'<select id="gps-time-view-v1" class="form-input" style="width:auto"><option value="day"'+(view==='day'?' selected':'')+'>По дням</option><option value="week"'+(view==='week'?' selected':'')+'>По неделям</option><option value="month"'+(view==='month'?' selected':'')+'>По месяцам</option></select></div>'
   +'<div style="overflow-x:auto"><table style="width:100%;min-width:600px;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left;padding:7px">Период</th><th>Менеджер</th><th>GPS-дней</th><th>Надёжных</th><th>У ТТ, мин</th><th>Нераспознанные остановки, мин</th><th>К проверке, мин</th></tr></thead><tbody>'
   +summary.map(g=>'<tr data-time-period="'+esc(g.key)+'" data-time-manager="'+esc(g.manager)+'" tabindex="0" title="Открыть дни и остановки за период" style="border-top:1px solid #e2e8f0;cursor:pointer;'+(selectedPeriod===g.key&&selectedManager===g.manager?'background:#eff6ff;':'')+'"><td style="padding:7px">'+esc(view==='month'?g.key:view==='week'?'Неделя с '+dayFmt(g.key):dayFmt(g.key))+'</td><td style="text-align:center">'+esc(g.manager)+'</td><td style="text-align:center">'+g.total+'</td><td style="text-align:center">'+g.good+'</td><td style="text-align:center">'+fmt(g.knownTt)+'</td><td style="text-align:center">'+fmt(g.unknown)+'</td><td style="text-align:center"><b>'+fmt(g.checkMin)+'</b></td></tr>').join('')
   +'</tbody></table></div>';
 if(!summary.length)html+='<div style="padding:10px;color:var(--sub)">За выбранный период нет сохранённых GPS-агрегатов.</div>';

 // One click KPI -> a concrete, short list of days with explicit GPS-quality causes.
 const reason={ongoing:'День не завершён',stale:'Агрегат GPS устарел или не пересчитан',
 mock_location_review:'Обнаружен признак подмены GPS: техническая проверка',
 insufficient_points:'Мало точек GPS',low_valid_share:'Низкая доля достоверных GPS-точек',
 no_stops:'Нет распознанных остановок',ready:'Данные пригодны для разбора'};
 const targeted=(data.days||[]).filter(d=>
  (focus==='poor'?d.quality!=='ready':focus==='ready'?d.quality==='ready':focus==='days'));
 html+='<div id="gps-time-details-v2" style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:11px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b>'+(focus==='poor'?'Почему не хватает GPS-данных':focus==='ready'?'Надёжные GPS-дни':focus==='days'?'Все дни по выбранному периоду':'Подробные остановки и решения ДФ')+'</b>'
    +'<button type="button" class="chip" data-time-metric="all">Сбросить выбор</button></div>';
 if(['poor','ready','days'].includes(focus)){
  html+='<div style="font-size:11px;color:#64748b;margin:6px 0">День с неполными данными не означает, что менеджер не был на ТТ. Карта доступна для проверки исходных GPS-событий.</div>'
   +targeted.slice(0,60).map(d=>'<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin:7px 0;display:flex;justify-content:space-between;gap:9px;align-items:center;flex-wrap:wrap">'
    +'<div><b>'+esc(d.manager)+' · '+dayFmt(d.date)+'</b><div style="font-size:11px;color:#64748b">'+esc(reason[d.quality]||'Нужна проверка качества GPS')+' · валидных точек '+fmt(d.valid_points)+' / '+fmt(d.raw_points)+'</div></div>'
    +'<div><button class="btn-secondary" data-time-map="'+esc(d.workday_id)+'" type="button">Открыть карту</button>'
    +'<button type="button" class="chip" data-time-period="'+esc(view==='month'?d.date.slice(0,7):view==='week'?weekStart(d.date):d.date)+'">К остановкам</button></div></div>').join('');
 }
 html+='</div>';

 html+='<div style="display:flex;gap:9px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:16px 0 8px"><b>Нераспознанные остановки, требующие проверки</b>'
   +'<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">'
   +'<button type="button" class="chip" data-time-repeat="1" style="'+(onlyRepeats?'background:#dbeafe;border-color:#60a5fa;':'')+'">↻ '+(onlyRepeats?'Все остановки':'Только повторные')+'</button>'
   +'<button type="button" class="chip" data-time-show-closed="1">'+(showClosed?'Скрыть разобранные':'Показать разобранные')+'</button></div></div>';
 html+='<div style="font-size:11px;color:#64748b">Найдено по фильтру: '+visible.length+'. Снимки точек на карте открываются отдельно, без показа координат в этом отчёте.</div>';
 const rows=visible.slice(0,pageSize);
 html+=rows.map(item=>{
  const i=list.indexOf(item),code=item.review_status||'pending';
  const repeat=Number(item.repeat_days||0);
  const label=code==='review'?'На проверке':code==='explained'?'Объяснено':code==='technical'?'Техническая причина':'Не рассмотрено';
  const controls='<button type="button" class="btn-secondary" data-time-ai="'+i+'" style="padding:7px 11px;font-size:12px">✦ ИИ-разбор</button>'
    +'<button type="button" class="btn-secondary" data-time-route="'+i+'" style="padding:7px 11px;font-size:12px">Изменить будущий маршрут</button>'
    +'<button type="button" class="btn-secondary" data-time-delegate="'+i+'" style="padding:7px 11px;font-size:12px">Поручить менеджеру</button>'
    +'<button type="button" class="chip" data-time-index="'+i+'" data-time-decision="explained" style="font-size:11px">Не требует действий</button>';
  return '<div style="border:1px solid #e2e8f0;border-radius:9px;padding:11px;margin-top:9px;background:#fff">'
   +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>'+esc(item.manager)+' · '+dayFmt(item.date)+'</b><span style="color:#64748b">'+esc(hm(item.start_at))+'–'+esc(hm(item.end_at).slice(-5))+'</span>'
   +'<span class="tag tag-gray">'+fmt(item.minutes)+' мин</span>'
   +(repeat>=2?'<span style="color:#92400e">↻ Похоже на повторное место · '+repeat+' дн.</span>':'')+'</div>'
   +'<div style="margin-top:5px;color:#64748b">Остановка №'+esc(item.seq)+' · GPS-точность ~'+fmt(item.accuracy_m)+' м · замеров '+fmt(item.samples)+' · статус: '+esc(label)+'</div>'
   +(item.review_note?'<div style="margin-top:5px"><b>Комментарий ДФ:</b> '+esc(item.review_note)+'</div>':'')
   +'<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px">'
   +'<button type="button" class="btn-secondary" data-time-map="'+esc(item.workday_id)+'" style="padding:6px 9px;font-size:11px">🗺 GPS-карта дня</button>'+controls+'</div>'
   +(aiByStop.has(item.workday_id+':'+item.seq)?formatAi(aiByStop.get(item.workday_id+':'+item.seq)):'')+'</div>';
 }).join('');
 if(!rows.length)html+='<div style="padding:12px;background:#f8fafc;border-radius:9px;margin-top:9px">Под выбранными условиями остановок нет. Это не подтверждение, что времени не терялось: проверьте качество GPS-дней выше.</div>';
 if(visible.length>pageSize)html+='<button type="button" class="chip" data-time-more="1" style="margin-top:10px">Показать ещё 12 · осталось '+(visible.length-pageSize)+'</button>';
 output(html);
}

function formatAi(a){
 if(a?.error)return '<div style="background:#fff7ed;border:1px solid #fed7aa;padding:11px;border-radius:9px;margin-top:9px">'+esc(a.error)+'</div>';
 if(!a)return'';
 const actions={check_gps:'Проверить GPS и координаты',review_route:'Пересмотреть будущий маршрут',ask_manager:'Поручить менеджеру уточнить обстоятельства',no_change:'Пока не менять маршрут'};
 return '<div style="padding:12px;border-radius:9px;background:#eff6ff;border:1px solid #bfdbfe;margin-top:9px;line-height:1.6">'
 +'<b>✦ ИИ-разбор конкретной остановки</b>'
 +'<div><b>Что известно:</b> '+esc(a.confirmed)+'</div>'
 +'<div><b>Что неизвестно:</b> '+esc(a.unknown)+'</div>'
 +'<div><b>Вывод:</b> '+esc(a.summary)+'</div>'
 +'<div><b>Предложение:</b> '+esc(actions[a.next_action]||'Проверить')+'. '+esc(a.recommendation)+'</div>'
 +'<div style="font-size:11px;color:#475569">Уверенность: '+esc(a.confidence)+'. Вывод предварительный, ИИ не меняет визиты и маршруты.</div></div>';
}
async function analyzeStop(i){
 const item=data?.stops?.[i];if(!item||!allowed()||aiBusy)return;
 const k=item.workday_id+':'+item.seq;
 if(aiByStop.has(k)&&!aiByStop.get(k).error){render();return}
 aiBusy=true;aiByStop.set(k,{error:'ИИ проверяет факты, обычно до 30 секунд…'});render();
 try{
  const {data:auth,error:authErr}=await db.auth.getSession();
  if(authErr||!auth?.session?.access_token)throw new Error('Сессия CRM завершилась. Войдите снова.');
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),46000);
  let res;try{
   res=await fetch('https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-gps-stop-ai-v1',{
    method:'POST',signal:abort.signal,
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth.session.access_token},
    body:JSON.stringify({workday_id:item.workday_id,seq:item.seq,date:item.date,manager:item.manager})
   });
  }finally{clearTimeout(timeout)}
  const json=await res.json().catch(()=>({}));
  if(!res.ok||!json.ok){
   if(json.error==='AI_DAILY_LIMIT')throw new Error('На сегодня лимит ИИ-разборов исчерпан, GPS-карты и данные доступны.');
   throw new Error('ИИ пока недоступен ('+(json.error||res.status)+'). Проверьте остановку на карте.');
  }
  aiByStop.set(k,json.analysis);
 }catch(e){aiByStop.set(k,{error:e.message||String(e)})}
 finally{aiBusy=false;render()}
}
async function delegateStop(i){
 const item=data?.stops?.[i];if(!item||!allowed()||busy)return;
 const deadline=window.prompt('До какой даты поручить менеджеру уточнить причину остановки? Формат ГГГГ-ММ-ДД',today());
 if(deadline===null)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||deadline<today()){alert('Укажите сегодняшнюю или будущую дату: ГГГГ-ММ-ДД.');return}
 const basis='GPS_TIME_V2:'+item.workday_id+':'+item.seq+':'+item.start_at;
 const ai=aiByStop.get(item.workday_id+':'+item.seq);
 // Internal GPS diagnostics and AI reasoning are deliberately not copied to a manager-facing task.
 const requested=window.prompt('Кому поручить? Выберите: Руднев, Ачинович или Шкуран.',item.manager);
 if(requested===null)return;
 const assignee=requested.trim();
 if(!['Руднев','Ачинович','Шкуран'].includes(assignee)){alert('Выберите одного из действующих менеджеров.');return}
 if(!window.confirm('Поручить '+assignee+' уточнить результаты поездки '+dayFmt(item.date)+' до '+deadline+'? Это обычная задача, не обвинение.'))return;
 busy=true;
 try{
  const {data:prev,error:readErr}=await db.from('tasks').select('id,due_date').eq('manager_name',assignee).eq('basis',basis).eq('done',false).limit(1);
  if(readErr)throw readErr;
  let saved=prev?.[0];
  if(!saved){
   const {data:newTask,error:writeErr}=await db.from('tasks').insert({
    manager_name:assignee,source:'gps_time_followup_v2',basis,done:false,
    auto_generated:false,review_status:'approved',priority:'средний',
    title:'Уточнить результаты поездки '+dayFmt(item.date),
    text:'Уточнить результаты работы во время поездки '+dayFmt(item.date)+'. Указать фактически проведённые встречи и при необходимости предложить корректировку будущего маршрута. Это обычный рабочий запрос, не дисциплинарное обвинение.',
    expected_result:'Проверяемое объяснение и при необходимости предложение по маршруту',
    due_date:deadline
   }).select('id,due_date').single();
   if(writeErr)throw writeErr;saved=newTask;
  }
  alert('Поручение '+assignee+' зарегистрировано до '+saved.due_date+'. Повторная открытая задача не создаётся.');
 }catch(e){console.error(VERSION,e);alert('Не удалось создать поручение: '+(e.message||e))}
 finally{busy=false}
}

async function decide(i,decision){
 if(!data||busy||!allowed()||!['review','explained','technical'].includes(decision))return;
 const item=data.stops[i];if(!item)return;
 let note='';
 if(decision==='explained'||decision==='technical'){
  const answer=window.prompt(decision==='explained'?'Причина остановки (обед, заправка, ожидание и т. д.):':'Что именно не так с GPS-данными?',item.review_note||'');
  if(answer===null)return;
  note=answer.trim();
  if(!note){alert('Для этого решения необходимо объяснение директора.');return}
 }else{
  const answer=window.prompt('Что необходимо проверить? (необязательно)',item.review_note||'');
  if(answer===null)return;
  note=answer.trim();
 }
 if(note.length>700){alert('Комментарий не должен превышать 700 символов.');return}
 busy=true;
 try{
  const {data:r,error}=await db.rpc('gps_director_time_review_decide_v1',{
   p_workday_id:item.workday_id,p_seq:item.seq,p_start_at:item.start_at,p_status:decision,p_note:note
  });
  if(error)throw error;
  if(!r?.saved)throw new Error('База не подтвердила сохранение');
  item.review_status=r.status;item.review_note=r.note;render();
 }catch(e){console.error(VERSION,'decision',e);alert('Не удалось сохранить решение: '+(e.message||e))}
 finally{busy=false}
}
function start(){if(allowed())install()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0),{once:true});else start();
document.addEventListener('click',e=>{
 if(e.target.closest?.('#gps-tab-director-v236427'))setTimeout(start,100);
 if(e.target.closest?.('#nav-gps-control,#bn-gps-control,[onclick*="gps-control"]'))setTimeout(start,180);
},true);
window.RESANTA_GPS_UNUSED_TIME_V1=Object.freeze({version:VERSION,directorOnly:true,manualOnly:true,gpsUnchanged:true,install});
})();