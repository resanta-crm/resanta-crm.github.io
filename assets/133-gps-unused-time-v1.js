/* RESANTA CRM v23.7.7 — GPS time review.
 * Director only; explicit request; reads only saved GPS aggregates.
 * Not a disciplinary score: unrecognized stop != lost time.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_UNUSED_TIME_V1)return;
const VERSION='23.7.7',ID='gps-unused-time-v1';
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
let busy=false,data=null,pageSize=12,view='day',status='pending',onlyRepeats=false;
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
  const more=e.target.closest('[data-time-more]');if(more){pageSize+=12;render();return}
  const toggle=e.target.closest('[data-time-repeat]');if(toggle){onlyRepeats=!onlyRepeats;pageSize=12;render();return}
  const map=e.target.closest('[data-time-map]');if(map){
   const id=map.dataset.timeMap;
   if(/^[a-f0-9-]{36}$/i.test(id)&&typeof window.crmOpenGpsViewerV2360==='function')window.crmOpenGpsViewerV2360(id);
   return;
  }
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
  data=result;status='pending';onlyRepeats=false;pageSize=12;render();
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
  const k=groupKey(d);
  if(!m.has(k))m.set(k,{key:k,total:0,good:0,poor:0,checkMin:0,checkStops:0,knownTt:0,unknown:0});
  const g=m.get(k);g.total++;if(d.quality==='ready'){g.good++;g.checkMin+=Number(d.review_minutes||0);g.checkStops+=Number(d.review_stops||0);g.knownTt+=Number(d.planned_tt_minutes||0)+Number(d.offplan_tt_minutes||0);g.unknown+=Number(d.unrecognized_stop_minutes||0)}else g.poor++;
 }
 return [...m.values()].sort((a,b)=>b.key.localeCompare(a.key));
}
function render(){
 if(!data)return;
 const s=data.summary||{},list=data.stops||[],summary=groups();
 const visible=list.filter(x=>{
  const v=x.review_status||'pending';
  return (status==='all'||v===status)&&(!onlyRepeats||Number(x.repeat_days)>=2);
 });
 const metric=(name,value,sub)=>'<div style="border:1px solid #e2e8f0;border-radius:9px;padding:10px 12px;background:#f8fafc"><div style="color:#64748b;font-size:11px">'+esc(name)+'</div><strong style="display:block;font-size:22px;margin:3px 0">'+esc(String(value))+'</strong><span style="color:#64748b;font-size:11px">'+esc(sub)+'</span></div>';
 let html='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:12px 0">'
   +metric('GPS-дней',s.all_days||0,'Выбранный период')
   +metric('Дней с данными',s.quality_days||0,'Пригодны для анализа')
   +metric('Недостаточно данных',s.unreliable_days||0,'Не оцениваем время')
   +metric('Остановок к проверке',s.candidate_stops||0,'От '+data.min_minutes+' минут')
   +metric('Время к проверке',fmt(s.review_minutes)+' мин','Не доказанная потеря')
   +metric('Повторных мест',s.repeat_zones||0,'Разные GPS-дни')
   +'</div>'
   +'<div style="color:#475569;font-size:11px;margin:8px 0 12px">В оценку попадают только завершённые дни с готовыми агрегатами и достаточным качеством GPS. Учитываются лишь внутренние остановки вне распознанных ТТ, домашней/стартовой зоны, с точностью GPS до 100 м. Обед, заправка, ожидание клиента и проблемы связи не являются нарушением. GPS-разрывы и точная длительность езды не приравниваются к простою.</div>'
   +'<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:9px"><b>Сводка времени по менеджерам и датам</b>'
   +'<select id="gps-time-view-v1" class="form-input" style="width:auto"><option value="day"'+(view==='day'?' selected':'')+'>По дням</option><option value="week"'+(view==='week'?' selected':'')+'>По неделям</option><option value="month"'+(view==='month'?' selected':'')+'>По месяцам</option></select></div>'
   +'<div style="overflow-x:auto"><table style="width:100%;min-width:600px;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left;padding:7px">Период</th><th>GPS-дней</th><th>Надёжных</th><th>У ТТ, мин</th><th>Нераспознанные остановки, мин</th><th>К проверке, мин</th></tr></thead><tbody>'
   +summary.map(g=>'<tr style="border-top:1px solid #e2e8f0"><td style="padding:7px">'+esc(view==='month'?g.key:view==='week'?'Неделя с '+dayFmt(g.key):dayFmt(g.key))+'</td><td style="text-align:center">'+g.total+'</td><td style="text-align:center">'+g.good+'</td><td style="text-align:center">'+fmt(g.knownTt)+'</td><td style="text-align:center">'+fmt(g.unknown)+'</td><td style="text-align:center"><b>'+fmt(g.checkMin)+'</b></td></tr>').join('')
   +'</tbody></table></div>';
 if(!summary.length)html+='<div style="padding:10px;color:var(--sub)">За выбранный период нет сохранённых GPS-агрегатов.</div>';
 html+='<div style="display:flex;gap:9px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:16px 0 8px"><b>Нераспознанные остановки, требующие проверки</b>'
   +'<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">'
   +'<button type="button" class="chip" data-time-repeat="1" style="'+(onlyRepeats?'background:#dbeafe;border-color:#60a5fa;':'')+'">↻ '+(onlyRepeats?'Все остановки':'Только повторные')+'</button>'
   +'<select id="gps-time-status-v1" class="form-input" style="width:auto">'
   +[['pending','Не рассмотрены'],['review','На проверке'],['explained','Объяснённые'],['technical','Проблемы GPS'],['all','Все']].map(([v,label])=>'<option value="'+v+'"'+(status===v?' selected':'')+'>'+label+'</option>').join('')
   +'</select></div></div>';
 html+='<div style="font-size:11px;color:#64748b">Найдено по фильтру: '+visible.length+'. Снимки точек на карте открываются отдельно, без показа координат в этом отчёте.</div>';
 const rows=visible.slice(0,pageSize);
 html+=rows.map(item=>{
  const i=list.indexOf(item),code=item.review_status||'pending';
  const repeat=Number(item.repeat_days||0);
  const label=code==='review'?'На проверке':code==='explained'?'Объяснено':code==='technical'?'Техническая причина':'Не рассмотрено';
  const controls=[['review','К проверке'],['explained','Объяснено'],['technical','Проблема GPS']].map(([value,title])=>
    '<button type="button" class="btn-secondary" data-time-index="'+i+'" data-time-decision="'+value+'" style="padding:6px 9px;font-size:11px;'+(code===value?'border-color:#2563eb;background:#eff6ff;':'')+'">'+title+'</button>').join('');
  return '<div style="border:1px solid #e2e8f0;border-radius:9px;padding:11px;margin-top:9px;background:#fff">'
   +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>'+esc(item.manager)+' · '+dayFmt(item.date)+'</b><span style="color:#64748b">'+esc(hm(item.start_at))+'–'+esc(hm(item.end_at).slice(-5))+'</span>'
   +'<span class="tag tag-gray">'+fmt(item.minutes)+' мин</span>'
   +(repeat>=2?'<span style="color:#92400e">↻ Похоже на повторное место · '+repeat+' дн.</span>':'')+'</div>'
   +'<div style="margin-top:5px;color:#64748b">Остановка №'+esc(item.seq)+' · GPS-точность ~'+fmt(item.accuracy_m)+' м · замеров '+fmt(item.samples)+' · статус: '+esc(label)+'</div>'
   +(item.review_note?'<div style="margin-top:5px"><b>Комментарий ДФ:</b> '+esc(item.review_note)+'</div>':'')
   +'<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px">'
   +'<button type="button" class="btn-secondary" data-time-map="'+esc(item.workday_id)+'" style="padding:6px 9px;font-size:11px">🗺 GPS-карта дня</button>'+controls+'</div></div>';
 }).join('');
 if(!rows.length)html+='<div style="padding:12px;background:#f8fafc;border-radius:9px;margin-top:9px">Под выбранными условиями остановок нет. Это не подтверждение, что времени не терялось: проверьте качество GPS-дней выше.</div>';
 if(visible.length>pageSize)html+='<button type="button" class="chip" data-time-more="1" style="margin-top:10px">Показать ещё 12 · осталось '+(visible.length-pageSize)+'</button>';
 output(html);
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