/* RESANTA CRM v23.6.99 · TRIOVIST TASKS — hide redundant commercial recommendations preview
 * UI-only. Keeps task generation, task data, sales reconciliation and parser untouched.
 * No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_RECOMMENDATIONS_HIDDEN_V23699)return;
const V='v23.6.99';
const TITLE=/КОММЕРЧЕСКИЕ\s+РЕКОМЕНДАЦИИ\s+ПО\s+ПОДГРУППАМ/i;
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();

function recommendationCards(){
  const page=document.getElementById('page-triovist');
  if(!page)return [];
  const found=new Set();
  const nodes=page.querySelectorAll('.card-title,h1,h2,h3,h4,strong,b,div');
  for(const node of nodes){
    const t=text(node);
    if(t.length<10||t.length>160||!TITLE.test(t))continue;
    const card=node.closest('.card');
    if(card&&card.id!=='tri-task-card')found.add(card);
  }
  return [...found];
}

function hide(){
  document.getElementById('tri-rec-control-v23653')?.remove();
  for(const card of recommendationCards()){
    card.dataset.triovistRecommendationsHidden='1';
    card.style.setProperty('display','none','important');
  }
}
function schedule(){
  hide();
  setTimeout(hide,0);
  setTimeout(hide,250);
}
function wrap(name){
  const old=window[name];
  if(typeof old!=='function'||old.__hideRecommendationsV23699)return;
  const wrapped=function(){
    let out;
    try{out=old.apply(this,arguments)}catch(e){schedule();throw e}
    schedule();
    if(out&&typeof out.then==='function')return out.finally(schedule);
    return out;
  };
  wrapped.__hideRecommendationsV23699=true;
  window[name]=wrapped;
}
['triovistTasksRender','triovistTasksReload','triovistReload'].forEach(wrap);

document.addEventListener('click',e=>{
  if(e.target.closest('#tr14-shell [data-tr14="tasks"],#tri-task-generate-btn,[data-tr53-refresh]'))schedule();
},true);

schedule();
window.RESANTA_TRIOVIST_RECOMMENDATIONS_HIDDEN_V23699=Object.freeze({version:V,apply:hide,uiOnly:true,noPolling:true,noObserver:true});
})();
