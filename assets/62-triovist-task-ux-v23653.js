/* RESANTA CRM v23.6.100 · TRIOVIST TASK UX
 * Task-only UX. The old commercial recommendations preview is permanently disabled.
 * No DATA_HUB wrapping. No polling. No MutationObserver. No business-data writes.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_TASK_UX_V23653)return;
const V='v23.6.100';
const ALEKS='aleksandrenko_av@resanta.ru',KRIS='krishtal_na@resanta.ru';
const MANAGERS=[ALEKS,KRIS],LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
const profile=()=>{try{return window.currentProfile||currentProfile}catch(_){return window.currentProfile}};
const email=()=>String(profile()?.email||'').trim().toLowerCase();
const isLeader=()=>String(profile()?.role||'').toLowerCase()==='boss'&&LEADERS.includes(email());
const isManager=()=>String(profile()?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
const canUse=()=>isLeader()||isManager();
const page=()=>document.getElementById('page-triovist');
const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
function css(){if(document.getElementById('tri-task-ux53-css'))return;const s=document.createElement('style');s.id='tri-task-ux53-css';s.textContent=`
.tm51-task[data-status="accepted"]{border-color:#93c5fd!important;background:#eff6ff!important}.tm51-task[data-status="in_progress"]{border-color:#86efac!important;background:#f0fdf4!important}.tm51-task[data-status="awaiting_check"]{border-color:#fcd34d!important;background:#fffbeb!important}.tm51-task{scroll-margin-top:180px}
`;document.head.appendChild(s)}
function taskTabActive(){const p=page();if(!p?.classList.contains('active'))return false;const b=document.querySelector('#tr14-shell [data-tr14="tasks"]');if(b)return b.classList.contains('on');return !!document.getElementById('tri-task-card')?.offsetParent}
function findRecommendationCards(){const p=page();if(!p)return[];const out=new Set();for(const n of p.querySelectorAll('.card-title,h1,h2,h3,h4,strong,b,div')){const t=text(n);if(t.length>10&&t.length<180&&/КОММЕРЧЕСКИЕ\s+РЕКОМЕНДАЦИИ\s+ПО\s+ПОДГРУППАМ/i.test(t)){const c=n.closest('.card');if(c&&c.id!=='tri-task-card')out.add(c)}}return[...out]}
function removeRecommendations(){document.getElementById('tri-rec-control-v23653')?.remove();for(const c of findRecommendationCards())c.remove()}
function tuneGuide(){const root=document.getElementById('tri-month-safe-v23651');if(!root)return;const guide=root.querySelector('.tm51-guide');if(guide&&!guide.dataset.v23653){guide.dataset.v23653='1';guide.insertAdjacentHTML('beforeend',' <b>После «Принять» задача поднимается вверх списка и появляется кнопка «Начать».</b> После «Начать» доступны комментарий и «Отправить на проверку».')}}
function apply(){if(!canUse()||!taskTabActive())return;css();removeRecommendations();tuneGuide()}
function bind(){if(window.__TRIOVIST_TASK_UX53_BOUND)return;window.__TRIOVIST_TASK_UX53_BOUND=true;document.addEventListener('click',e=>{if(e.target.closest('#tr14-shell [data-tr14="tasks"],#tri-task-generate-btn')){setTimeout(apply,0);setTimeout(apply,250)}},true);const oldRender=window.triovistTasksRender;if(typeof oldRender==='function'&&!oldRender.__ux53){const wrapped=function(){const out=oldRender.apply(this,arguments);setTimeout(apply,0);return out};wrapped.__ux53=true;window.triovistTasksRender=wrapped;try{triovistTasksRender=wrapped}catch(_){}}const oldReload=window.triovistTasksReload;if(typeof oldReload==='function'&&!oldReload.__ux53){const wrapped=async function(){const out=await oldReload.apply(this,arguments);setTimeout(apply,0);setTimeout(apply,200);return out};wrapped.__ux53=true;window.triovistTasksReload=wrapped;try{triovistTasksReload=wrapped}catch(_){}}}
bind();setTimeout(apply,0);setTimeout(apply,350);
window.RESANTA_TRIOVIST_TASK_UX_V23653=Object.freeze({version:V,apply,removeRecommendations,noPolling:true,noObserver:true,taskOnly:true,recommendationsPreview:false});
})();
