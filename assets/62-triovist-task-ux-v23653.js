/* RESANTA CRM v23.6.53 · TRIOVIST TASK UX
 * Local UI-only fix for #tri-task-card and its recommendation preview.
 * No DATA_HUB wrapping. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_TASK_UX_V23653)return;
const V='v23.6.53';
const ALEKS='aleksandrenko_av@resanta.ru',KRIS='krishtal_na@resanta.ru';
const MANAGERS=[ALEKS,KRIS],LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
let recOpen=null,refreshing=false;
const profile=()=>{try{return window.currentProfile||currentProfile}catch(_){return window.currentProfile}};
const email=()=>String(profile()?.email||'').trim().toLowerCase();
const isLeader=()=>String(profile()?.role||'').toLowerCase()==='boss'&&LEADERS.includes(email());
const isManager=()=>String(profile()?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
const canUse=()=>isLeader()||isManager();
const page=()=>document.getElementById('page-triovist');
const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
function css(){if(document.getElementById('tri-task-ux53-css'))return;const s=document.createElement('style');s.id='tri-task-ux53-css';s.textContent=`
#tri-rec-control-v23653{margin:0 0 10px;padding:10px 12px;border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.tr53-rec-note{font-size:11px;color:#64748b;line-height:1.45}.tr53-actions{display:flex;gap:7px;flex-wrap:wrap}.tr53-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 10px;font-weight:700;cursor:pointer}.tr53-actions button.primary{background:#2563eb;border-color:#2563eb;color:#fff}.tm51-task[data-status="accepted"]{border-color:#93c5fd!important;background:#eff6ff!important}.tm51-task[data-status="in_progress"]{border-color:#86efac!important;background:#f0fdf4!important}.tm51-task[data-status="awaiting_check"]{border-color:#fcd34d!important;background:#fffbeb!important}.tm51-task{scroll-margin-top:180px}
`;document.head.appendChild(s)}
function taskTabActive(){const p=page();if(!p?.classList.contains('active'))return false;const b=document.querySelector('#tr14-shell [data-tr14="tasks"]');if(b)return b.classList.contains('on');return !!document.getElementById('tri-task-card')?.offsetParent}
function findRecommendationCard(){const p=page();if(!p)return null;const nodes=[...p.querySelectorAll('.card-title,h1,h2,h3,h4,strong,b,div')].filter(el=>{const t=text(el);return t.length>10&&t.length<120&&/КОММЕРЧЕСКИЕ РЕКОМЕНДАЦИИ ПО ПОДГРУППАМ/i.test(t)});for(const n of nodes){const c=n.closest('.card');if(c&&c.id!=='tri-task-card')return c}return null}
function findStaleRefreshBanner(){const p=page();if(!p)return null;return [...p.querySelectorAll('.tri-warning,.tri-task-banner,.card,div')].find(el=>{const t=text(el);return t.length>0&&t.length<90&&/^Нажмите\s*[«"]?Обновить/i.test(t)})||null}
function workCount(){const root=document.getElementById('tri-month-safe-v23651');if(!root)return null;const m=text(root).match(/Рабочих задач месяца\s*[—-]\s*(\d+)/i);return m?Number(m[1]):root.querySelectorAll('.tm51-task[data-excluded="0"]').length}
function ensureControl(rec){let c=document.getElementById('tri-rec-control-v23653');if(!c){c=document.createElement('div');c.id='tri-rec-control-v23653';rec.insertAdjacentElement('beforebegin',c)}return c}
function paintRecommendations(){if(!canUse()||!taskTabActive())return;css();const rec=findRecommendationCard(),stale=findStaleRefreshBanner();if(!rec)return;
 if(isManager()){
   rec.style.setProperty('display','none','important');
   document.getElementById('tri-rec-control-v23653')?.remove();
   if(stale)stale.style.setProperty('display','none','important');
   return;
 }
 const control=ensureControl(rec),cnt=workCount();
 if(recOpen===null)recOpen=cnt===0;
 rec.style.setProperty('display',recOpen?'block':'none','important');
 if(stale)stale.style.setProperty('display','none','important');
 control.innerHTML=`<div><b>💡 Рекомендации для формирования нового плана</b><div class="tr53-rec-note">Это черновик для руководителя: CRM ранжирует подгруппы и SKU перед созданием месячных задач. После формирования плана блок можно не открывать.${cnt!=null?` Рабочих задач текущего месяца: <b>${cnt}</b>.`:''}</div></div><div class="tr53-actions"><button data-tr53-toggle>${recOpen?'Скрыть рекомендации':'Показать рекомендации'}</button><button class="primary" data-tr53-refresh ${refreshing?'disabled':''}>↻ Обновить рекомендации</button></div>`;
}
async function refreshRecommendations(){if(refreshing)return;refreshing=true;paintRecommendations();try{
  if(typeof window.triovistReload==='function')await window.triovistReload();
  else if(typeof window.triovistTasksReload==='function')await window.triovistTasksReload(true);
  else throw new Error('Функция обновления Triovist пока не готова');
 }catch(e){alert('Не удалось обновить рекомендации: '+(e?.message||e))}finally{refreshing=false;setTimeout(paintRecommendations,0);setTimeout(paintRecommendations,250)}}
function tuneGuide(){const root=document.getElementById('tri-month-safe-v23651');if(!root)return;const guide=root.querySelector('.tm51-guide');if(guide&&!guide.dataset.v23653){guide.dataset.v23653='1';guide.insertAdjacentHTML('beforeend',' <b>После «Принять» задача поднимается вверх списка и появляется кнопка «Начать».</b> После «Начать» доступны комментарий и «Отправить на проверку».') }}
function apply(){if(!canUse()||!taskTabActive())return;css();paintRecommendations();tuneGuide()}
function bind(){if(window.__TRIOVIST_TASK_UX53_BOUND)return;window.__TRIOVIST_TASK_UX53_BOUND=true;
 document.addEventListener('click',e=>{
   const toggle=e.target.closest('#tri-rec-control-v23653 [data-tr53-toggle]');if(toggle){e.preventDefault();recOpen=!recOpen;paintRecommendations();return}
   const refresh=e.target.closest('#tri-rec-control-v23653 [data-tr53-refresh]');if(refresh){e.preventDefault();refreshRecommendations();return}
   const taskTab=e.target.closest('#tr14-shell [data-tr14="tasks"]');if(taskTab){setTimeout(apply,0);setTimeout(apply,250)}
 },true);
 const oldRender=window.triovistTasksRender;if(typeof oldRender==='function'&&!oldRender.__ux53){const wrapped=function(){const out=oldRender.apply(this,arguments);setTimeout(apply,0);return out};wrapped.__ux53=true;window.triovistTasksRender=wrapped;try{triovistTasksRender=wrapped}catch(_){}}
 const oldReload=window.triovistTasksReload;if(typeof oldReload==='function'&&!oldReload.__ux53){const wrapped=async function(){const out=await oldReload.apply(this,arguments);setTimeout(apply,0);setTimeout(apply,200);return out};wrapped.__ux53=true;window.triovistTasksReload=wrapped;try{triovistTasksReload=wrapped}catch(_){}}
}
bind();setTimeout(apply,0);setTimeout(apply,350);
window.RESANTA_TRIOVIST_TASK_UX_V23653=Object.freeze({version:V,apply,refreshRecommendations,noPolling:true,noObserver:true,taskOnly:true});
})();
(function(){'use strict';if(window.RESANTA_PROMOTIONS_MANAGEMENT_V23654||document.querySelector('script[data-promotions-management-v23654]'))return;const s=document.createElement('script');s.src='./assets/63-promotions-management-v23654.js?_='+Date.now();s.async=true;s.dataset.promotionsManagementV23654='1';s.onerror=()=>console.warn('Promotions management v23.6.54 failed to load; base promotions remain available.');document.head.appendChild(s)})();
(function(){'use strict';function load55(){if(window.RESANTA_PROMOTIONS_CLOSE_V23655||document.querySelector('script[data-promotions-close-v23655]'))return;const x=document.createElement('script');x.src='./assets/64-promotions-close-v23655.js?_='+Date.now();x.async=true;x.dataset.promotionsCloseV23655='1';x.onerror=()=>console.warn('Promotions close v23.6.55 failed to load; v23.6.54 remains available.');document.head.appendChild(x)}if(window.RESANTA_PROMOTIONS_MANAGEMENT_V23654){load55();return}const s=document.querySelector('script[data-promotions-management-v23654]');if(s){s.addEventListener('load',load55,{once:true})}})();