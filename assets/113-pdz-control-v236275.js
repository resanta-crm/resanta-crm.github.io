/* RESANTA CRM v23.6.275 · PDZ CONTROL: FILTERS + 30/60 DAY LEGAL HIGHLIGHTS */
(function(){
'use strict';
if(window.RESANTA_PDZ_CONTROL_V236275)return;
const V='v23.6.275';
const state={manager:'all',age:'all',q:''};
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active=()=>!!document.getElementById('page-debt')?.classList.contains('active')||String(document.getElementById('app')?.dataset?.activePage||'')==='debt';
const getRows=()=>{try{return Array.isArray(allClientDebt)?allClientDebt:[]}catch(_){return[]}};
const isBoss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const ageOk=d=>{
 const days=Number(d?.debt_overdue_days||0);
 if(state.age==='lt30')return days<30;
 if(state.age==='claim')return days>=30&&days<60;
 if(state.age==='court')return days>=60;
 if(state.age==='critical')return days>=90;
 return true;
};
const filtered=rows=>rows.filter(d=>{
 if(state.manager!=='all'&&String(d.manager_name||'')!==state.manager)return false;
 if(!ageOk(d))return false;
 if(state.q){
   const q=state.q.toLowerCase();
   const hay=(String(d.client_name||'')+' '+String(d.manager_name||'')).toLowerCase();
   if(!hay.includes(q))return false;
 }
 return true;
});
function toolbar(){
 if(!active())return;
 const host=document.getElementById('debt-summary');if(!host)return;
 let box=document.getElementById('pdz-control-v236275');
 if(!box){
   box=document.createElement('div');box.id='pdz-control-v236275';box.className='card';
   box.style.cssText='margin-bottom:12px;padding:12px 14px';
   host.parentNode.insertBefore(box,host);
   box.addEventListener('change',onChange,true);
   box.addEventListener('input',onInput,true);
 }
 const rows=getRows(),mgrs=[...new Set(rows.map(x=>String(x.manager_name||'Не определён')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 box.innerHTML='<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">'
   +(isBoss()?'<div><label class="form-label">Менеджер</label><select class="form-input" data-pdz-manager><option value="all">Все менеджеры</option>'+mgrs.map(x=>'<option value="'+E(x)+'" '+(state.manager===x?'selected':'')+'>'+E(x)+'</option>').join('')+'</select></div>':'')
   +'<div><label class="form-label">Срок ПДЗ</label><select class="form-input" data-pdz-age>'
    +'<option value="all" '+(state.age==='all'?'selected':'')+'>Все сроки</option>'
    +'<option value="lt30" '+(state.age==='lt30'?'selected':'')+'>До 30 дней</option>'
    +'<option value="claim" '+(state.age==='claim'?'selected':'')+'>30–59 дней · претензия</option>'
    +'<option value="court" '+(state.age==='court'?'selected':'')+'>60+ дней · в суд</option>'
    +'<option value="critical" '+(state.age==='critical'?'selected':'')+'>90+ дней · критично</option>'
   +'</select></div>'
   +'<div style="min-width:240px;flex:1"><label class="form-label">Поиск клиента</label><input class="form-input" data-pdz-search placeholder="Название клиента" value="'+E(state.q)+'"></div>'
   +'<button type="button" class="btn-secondary" data-pdz-reset>Сбросить</button>'
   +'</div>'
   +'<div style="margin-top:8px;font-size:11px;color:var(--sub)">🟠 <b>30–59 дней</b> — ДФ Сидарович: претензия + отправить по почте. 🔴 <b>60+ дней</b> — передать материалы в суд.</div>';
 const reset=box.querySelector('[data-pdz-reset]');
 if(reset)reset.onclick=()=>{state.manager='all';state.age='all';state.q='';rerender()};
}
function legalBadge(d){
 const days=Number(d?.debt_overdue_days||0);
 if(days>=60)return '<span style="display:inline-flex;margin-top:6px;padding:4px 8px;border-radius:7px;background:#FCEBEB;color:#A32D2D;font-size:11px;font-weight:700">⚖ 60+ дней · передать в суд</span>';
 if(days>=30)return '<span style="display:inline-flex;margin-top:6px;padding:4px 8px;border-radius:7px;background:#FAEEDA;color:#854F0B;font-size:11px;font-weight:700">✉ 30+ дней · Сидарович: претензия + почта</span>';
 return '';
}
function decorate(){
 if(!active())return;
 const list=document.getElementById('debt-list');if(!list)return;
 const rows=filtered(getRows());
 const used=new Set();
 list.querySelectorAll('div[style*="padding:10px 0"][style*="border-top"]').forEach(el=>{
   if(el.querySelector('[data-pdz-legal]'))return;
   const text=(el.textContent||'').trim().toLowerCase();
   let idx=-1;
   for(let i=0;i<rows.length;i++){
     if(used.has(i))continue;
     const n=String(rows[i].client_name||'').trim().toLowerCase();
     if(n&&text.includes(n)){idx=i;break}
   }
   if(idx<0)return;used.add(idx);
   const badge=legalBadge(rows[idx]);if(!badge)return;
   const b=document.createElement('div');b.setAttribute('data-pdz-legal','1');b.innerHTML=badge;
   const first=el.firstElementChild;if(first)first.insertAdjacentElement('afterend',b);else el.appendChild(b);
 });
}
function apply(){
 toolbar();decorate();
}
function rerender(){
 try{window.renderDebt?.()}catch(e){console.warn(V,e)}
}
function onChange(e){
 const m=e.target.closest?.('[data-pdz-manager]');if(m){state.manager=m.value;rerender();return}
 const a=e.target.closest?.('[data-pdz-age]');if(a){state.age=a.value;rerender();return}
}
let inputTimer=0;
function onInput(e){
 const q=e.target.closest?.('[data-pdz-search]');if(!q)return;
 state.q=q.value||'';clearTimeout(inputTimer);inputTimer=setTimeout(rerender,180);
}
function patch(){
 const base=window.renderDebt||globalThis.renderDebt;
 if(typeof base!=='function'||base.__pdzControlV236275)return;
 const wrapped=function(){
   const original=getRows();
   const view=filtered(original);
   let out;
   try{
     try{allClientDebt=view}catch(_){window.allClientDebt=view}
     out=base.apply(this,arguments);
   }finally{
     try{allClientDebt=original}catch(_){window.allClientDebt=original}
   }
   setTimeout(apply,0);
   return out;
 };
 wrapped.__pdzControlV236275=true;wrapped.__base=base;
 window.renderDebt=wrapped;try{renderDebt=wrapped}catch(_){}
}
patch();if(active())setTimeout(()=>{rerender()},0);
document.addEventListener('click',e=>{if(e.target.closest?.('.nav-item,.bn-item,[data-page]'))setTimeout(()=>{if(active()){patch();rerender()}},180)},true);
window.RESANTA_PDZ_CONTROL_V236275=Object.freeze({version:V,filters:true,legal30:true,court60:true,noPolling:true});
})();