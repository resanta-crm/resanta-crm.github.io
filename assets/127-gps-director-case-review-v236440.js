/* Director-only GPS case review v23.6.440. On-demand evidence read; source GPS never overwritten. */
(function(){
'use strict';
if(window.RESANTA_GPS_CASE_REVIEW_V236440)return;
const ALLOWED=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const user=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const allowed=()=>profile()?.role==='boss'&&ALLOWED.has(String(profile()?.email||user()?.email||'').toLowerCase());
const meters=v=>v==null?'—':Math.round(Number(v)).toLocaleString('ru-RU')+' м';
const minutes=v=>v==null?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+' мин';
const time=v=>{if(!v)return '—';try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return '—'}};
const hhmm=v=>String(v||'').slice(0,5)||'—';
const cell=(label,val)=>'<div class="gp-cell"><small>'+esc(label)+'</small><strong>'+esc(val??'—')+'</strong></div>';
let selected=null,busy=false;
function root(){
 let el=document.getElementById('gp-director-case');if(el)return el;
 el=document.createElement('div');el.id='gp-director-case';el.innerHTML="<style>\n#gp-director-case{position:fixed;z-index:200003;inset:0;background:rgba(15,23,42,.58);display:none;align-items:center;justify-content:center;padding:14px}\n#gp-director-case .gp-modal{width:min(850px,100%);max-height:92vh;background:white;border-radius:14px;overflow:auto;color:#111827}\n#gp-director-case .gp-head{padding:16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:10px;position:sticky;top:0;background:white}\n#gp-director-case .gp-body{padding:16px}\n#gp-director-case .gp-title{font-size:17px;font-weight:750}\n#gp-director-case .gp-sub,#gp-director-case .gp-note{font-size:12px;color:#64748b;line-height:1.5}\n#gp-director-case .gp-box{border:1px solid #e5e7eb;padding:14px;border-radius:10px;margin-bottom:12px}\n#gp-director-case .gp-box b{display:block;margin-bottom:9px}\n#gp-director-case .gp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}\n#gp-director-case .gp-cell{background:#f8fafc;border-radius:8px;padding:8px}\n#gp-director-case .gp-cell small{display:block;color:#64748b}\n#gp-director-case .gp-cell strong{display:block;font-size:13px;margin-top:4px;overflow-wrap:anywhere}\n#gp-director-case .gp-notice{background:#fffbeb;border:1px solid #fbbf24;border-radius:9px;padding:10px;font-size:12px;margin-bottom:9px;line-height:1.5}\n#gp-director-case .gp-form{display:grid;grid-template-columns:1fr 1fr;gap:9px}\n#gp-director-case .gp-form label{font-size:12px;color:#64748b}\n#gp-director-case input,#gp-director-case select,#gp-director-case textarea{display:block;width:100%;padding:9px;margin-top:4px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;font-size:13px}\n#gp-director-case textarea{min-height:65px}\n#gp-director-case button{padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:white;font-size:12px;cursor:pointer}\n#gp-director-case button.gp-primary{background:#185fa5;color:#fff;border-color:#185fa5}\n#gp-director-case .gp-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:10px}\n@media(max-width:600px){#gp-director-case .gp-form{grid-template-columns:1fr}}\n</style><div class=\"gp-modal\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Доказательства посещения\"><div class=\"gp-head\"><div><div id=\"gp-case-title\" class=\"gp-title\">Разбор торговой точки</div><div id=\"gp-case-sub\" class=\"gp-sub\"></div></div><button type=\"button\" id=\"gp-case-close\">Закрыть ✕</button></div><div id=\"gp-case-body\" class=\"gp-body\">Загрузка…</div></div>";
 document.body.appendChild(el);
 el.querySelector('#gp-case-close').addEventListener('click',close);
 el.addEventListener('click',e=>{if(e.target===el)close();});
 el.addEventListener('click',e=>{if(e.target.closest('#gp-case-map')){if(typeof window.crmOpenGpsViewerV2360==='function')window.crmOpenGpsViewerV2360(e.target.closest('#gp-case-map').dataset.workday);else alert('Откройте маршрут на вкладке «Маршруты».');}});
 el.addEventListener('click',e=>{if(e.target.closest('#gp-case-save'))save();});
 return el;
}
function close(){const el=document.getElementById('gp-director-case');if(el)el.style.display='none';selected=null;}
function render(d){
 const el=root(),b=el.querySelector('#gp-case-body'),f=d.fresh_gps||{},r=d.report||{};
 const fact=!!(f.actual_arrival_at&&f.actual_departure_at);
 const conflicts=(d.address_conflicts||[]).filter(x=>Number(x.distance_m)>=75);
 const diff=r.gps_distance_m!=null&&d.report_to_anchor_m!=null&&Math.abs(Number(r.gps_distance_m)-Number(d.report_to_anchor_m))>100;
 el.querySelector('#gp-case-title').textContent=d.client||'Разбор ТТ';
 el.querySelector('#gp-case-sub').textContent=[d.manager,d.date,[d.city,d.address].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
 let notices=[];
 if(d.evidence_stale)notices.push('Снимок GPS устарел. Для этой карточки получен новый расчёт одного рабочего дня без изменения исходных данных.');
 if(fact)notices.push('Найдено фактическое GPS-пребывание '+minutes(f.actual_minutes)+'. Это подтверждает нахождение в геозоне, но не содержание встречи.');
 else notices.push('Достаточное GPS-пребывание не установлено. Это не доказательство отсутствия менеджера.');
 if(diff)notices.push('Дистанция старого отчёта расходится с расстоянием до текущего эталона. Возможна смена геозоны или правил.');
 if(conflicts.length)notices.push('Есть несколько записей с одинаковым адресом, но разными координатами. Автоматически объединять их нельзя.');
 const prev=d.last_director_decision;
 b.innerHTML=notices.map(n=>'<div class="gp-notice">'+esc(n)+'</div>').join('')+
 '<div class="gp-box"><b>Проверенные факты</b><div class="gp-grid">'+
 cell('Отчёт менеджера',r.id?'Оформлен · '+time(r.created_at):'Не найден')+
 cell('Сохранённый GPS-статус',r.gps_status||'—')+
 cell('Дистанция в старом отчёте',meters(r.gps_distance_m))+
 cell('До текущего эталона',meters(d.report_to_anchor_m))+
 cell('Фактический приезд',time(f.actual_arrival_at))+
 cell('Фактический отъезд',time(f.actual_departure_at))+
 cell('Нахождение по GPS',minutes(f.actual_minutes))+
 cell('Плановое время',hhmm(d.planned_start)+'–'+hhmm(d.planned_end))+
 cell('Эталон ТТ',d.trusted_anchor?.verified_at?'Выверен · '+time(d.trusted_anchor.verified_at):'Предварительный')+
 cell('Дата GPS-снимка',time(d.snapshot_at))+
 '</div><div class="gp-note" style="margin-top:9px">Время Минска. Выверение адреса не означает подтверждение конкретного визита.</div></div>'+
 (conflicts.length?'<div class="gp-box"><b>Конфликты геозон одного адреса</b>'+conflicts.map(x=>'<div class="gp-note">'+esc(x.client)+' — расстояние '+meters(x.distance_m)+'</div>').join('')+
 '<div class="gp-note">Не менять эталон автоматически. Требуется подтверждение физической ТТ директором.</div></div>':'')+
 '<div class="gp-box"><b>Действие руководителя</b><div class="gp-note">Здесь решение только фиксируется. Не изменяются GPS, визиты, координаты или существующие задачи.</div>'+
 (prev?'<div class="gp-notice" style="margin-top:9px">Последнее решение: '+esc(prev.action)+' · '+time(prev.created_at)+' · '+esc(prev.comment||'')+'</div>':'')+
 '<div class="gp-form" style="margin-top:10px">'+
 '<label>Тип решения<select id="gp-case-action"><option value="to_meeting">В повестку совещания</option><option value="review_coordinates">На проверку координат</option><option value="review_visit">На разбор визита</option><option value="defer">Отложить</option><option value="resolved_technical">Закрыть технический вопрос</option><option value="resolved_verified">Проверено, завершить</option></select></label>'+
 '<label>Срок<input type="date" id="gp-case-due"></label>'+
 '<label style="grid-column:1/-1">Комментарий<textarea id="gp-case-comment" placeholder="Что именно выяснили"></textarea></label>'+
 '<label style="grid-column:1/-1">Следующий шаг<textarea id="gp-case-next" placeholder="Ответственный и действие"></textarea></label>'+
 '</div><div class="gp-actions"><button type="button" class="gp-primary" id="gp-case-save">Сохранить решение</button>'+
 '<button type="button" id="gp-case-map" data-workday="'+esc(d.workday_id)+'">Открыть карту</button></div>'+
 '<div id="gp-case-state" class="gp-note" style="margin-top:8px"></div></div>';
}
async function openCase(id){
 if(!allowed()||!/^[-a-f0-9]{36}$/i.test(id))return;
 selected=id;const el=root();el.style.display='flex';
 el.querySelector('#gp-case-body').textContent='Загрузка доказательств по выбранной ТТ…';
 try{const {data,error}=await db.rpc('gps_director_case_detail_v236440',{p_route_plan_id:id});
 if(error)throw error;if(selected===id)render(data);}
 catch(e){if(selected===id)el.querySelector('#gp-case-body').innerHTML='<div class="gp-notice">Ошибка: '+esc(e?.message||e)+'</div>';}
}
async function save(){
 if(!allowed()||!selected||busy)return;busy=true;
 const el=root(),b=el.querySelector('#gp-case-save'),s=el.querySelector('#gp-case-state');b.disabled=true;
 const action=el.querySelector('#gp-case-action').value,comment=el.querySelector('#gp-case-comment').value||'';
 if(['defer','resolved_technical','resolved_verified'].includes(action)&&comment.trim().length<5){
   s.textContent='Для переноса или закрытия напиши причину минимум из 5 символов.';b.disabled=false;busy=false;return;
 }
 try{const {error}=await db.rpc('gps_director_case_decide_v236440',{
  p_route_plan_id:selected,p_action:action,p_comment:comment,
  p_next_step:el.querySelector('#gp-case-next').value||'',p_due_date:el.querySelector('#gp-case-due').value||null
 });if(error)throw error;s.textContent='Решение сохранено в журнале. Данные GPS не изменены.';b.textContent='Сохранено ✓';document.dispatchEvent(new CustomEvent('resanta-gps-decision-updated'));}
 catch(e){s.textContent='Ошибка сохранения: '+(e?.message||e);}
 finally{busy=false;b.disabled=false;}
}
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-gps-brief-case]');
 if(button&&allowed())openCase(button.getAttribute('data-gps-brief-case'));
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
window.RESANTA_GPS_CASE_REVIEW_V236440=Object.freeze({version:'v23.6.440',directorOnly:true,readOnlyGps:true});
})();