/* RESANTA CRM v23.6.171 · TRIOVIST BUDGET AUDIT STAMP
 * Shows the exact last budget save time/author without changing budget logic.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_BUDGET_AUDIT_V236171)return;
const VERSION='v23.6.171';
let flight=null,lastKey='';

function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmt(v){
  if(!v)return'';
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return String(v);
  return d.toLocaleString('ru-RU',{
    timeZone:'Europe/Minsk',
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  });
}
function panel(){
  const p=document.getElementById('tr14-panel');
  if(!p||getComputedStyle(p).display==='none')return null;
  if(!/Бюджет\s+Triovist/i.test(p.textContent||''))return null;
  return p;
}
function monthValue(p){
  const i=p?.querySelector('[data-tr14-month="budget"]');
  const m=String(i?.value||'').slice(0,7);
  return /^\d{4}-\d{2}$/.test(m)?m:null;
}
function place(p,html,kind){
  let el=document.getElementById('tri-budget-audit-v236171');
  if(!el){
    el=document.createElement('div');
    el.id='tri-budget-audit-v236171';
    const k=p.querySelector('.tr14-k');
    if(k?.parentNode)k.insertAdjacentElement('afterend',el);
    else p.prepend(el);
  }
  el.className=kind==='warn'?'tr14-warn':'tr14-info';
  el.innerHTML=html;
}
async function refresh(force=false){
  const p=panel();if(!p)return;
  const m=monthValue(p);if(!m)return;
  const key=m;
  if(!force&&key===lastKey&&document.getElementById('tri-budget-audit-v236171'))return;
  if(flight)return flight;
  const d=dbx();if(!d?.rpc)return;
  flight=(async()=>{
    const r=await d.rpc('triovist_commercial_get_month',{p_month:m+'-01'});
    if(r?.error)throw r.error;
    const x=r?.data||{};
    if(x.budget_exists&&x.budget_updated_at){
      const who=x.budget_updated_name||x.budget_updated_by||'—';
      place(p,'🕒 <b>Последнее изменение бюджета:</b> '+esc(fmt(x.budget_updated_at))+' · '+esc(who),'ok');
    }else{
      place(p,'⚠️ <b>За выбранный месяц бюджет ещё не вносился.</b> После сохранения здесь появятся точные дата, время и кто внёс.','warn');
    }
    lastKey=key;
  })().catch(e=>console.warn('Triovist budget audit',e)).finally(()=>flight=null);
  return flight;
}
function later(force=false){
  [30,180,550,1200].forEach(ms=>setTimeout(()=>refresh(force),ms));
}
document.addEventListener('click',e=>{
  const b=e.target?.closest?.('button');
  if(!b)return;
  const txt=String(b.textContent||'').replace(/\s+/g,' ').trim();
  if(/Бюджет/i.test(txt)){lastKey='';later(true);return;}
  if(b.hasAttribute('data-tr14-budget-save')){lastKey='';later(true);}
},true);
document.addEventListener('change',e=>{
  const i=e.target?.closest?.('[data-tr14-month="budget"]');
  if(i){lastKey='';later(true);}
},true);
window.addEventListener('pageshow',()=>later(true));
setTimeout(()=>later(true),500);

window.RESANTA_TRIOVIST_BUDGET_AUDIT_V236171=Object.freeze({version:VERSION,refresh:()=>refresh(true)});
})();