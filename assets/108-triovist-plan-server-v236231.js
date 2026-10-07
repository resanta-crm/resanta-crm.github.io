/* RESANTA CRM v23.6.252 · TRIOVIST MONTH PLAN — SUBGROUP SERVER LOGIC
 * Intercepts the monthly plan action and builds one task per product subgroup.
 * The browser no longer builds/ranks business candidates locally.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_PLAN_SERVER_V236231)return;
const V='v23.6.252';
const MANAGER_MAP={
 'александренко':'aleksandrenko_av@resanta.ru',
 'кришталь':'krishtal_na@resanta.ru'
};
let busy=false;
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const txt=v=>String(v||'').trim();
const norm=v=>txt(v).toLowerCase();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
async function rpc(name,args){const d=dbx();if(!d?.rpc)throw new Error('Соединение с базой ещё не готово');const r=await d.rpc(name,args);if(r.error)throw r.error;return r.data}
function isButton(b){return !!b&&/сформировать\\s+план\\s+по\\s+(?:подгруппам|группам)/i.test(txt(b.textContent))}
function panelOf(b){
 let p=b.closest('.card,section,article,[class*="card"],[class*="panel"]');
 if(!p)p=b.parentElement?.parentElement||b.parentElement;
 return p||document.getElementById('page-triovist');
}
function managerFrom(panel){
 const selects=[...(panel?.querySelectorAll('select')||[])];
 for(const s of selects){
  const raw=norm(s.value),label=norm(s.options?.[s.selectedIndex]?.textContent);
  if(raw.includes('@resanta.ru'))return raw;
  for(const [name,email] of Object.entries(MANAGER_MAP))if(label.includes(name)||raw.includes(name))return email;
 }
 throw new Error('Не удалось определить менеджера плана');
}
function countFrom(panel){
 const selects=[...(panel?.querySelectorAll('select')||[])];
 for(const s of selects){
  const raw=txt(s.value),label=txt(s.options?.[s.selectedIndex]?.textContent);
  const m=(raw+' '+label).match(/\b(8|10|12|15)\b/);
  if(m)return Number(m[1]);
 }
 return 10;
}
function lastDay(){
 const d=new Date(),y=d.getFullYear(),m=d.getMonth();
 const z=new Date(y,m+1,0);
 return z.getFullYear()+'-'+String(z.getMonth()+1).padStart(2,'0')+'-'+String(z.getDate()).padStart(2,'0');
}
function banner(panel){
 let x=panel?.querySelector('[data-tr-plan231-status]');
 if(!x){
  x=document.createElement('div');x.dataset.trPlan231Status='1';
  x.style.cssText='margin:10px 0;padding:10px 14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;font-size:12px;line-height:1.45';
  const btn=[...(panel?.querySelectorAll('button')||[])].find(isButton);
  (btn?.parentElement||panel)?.insertAdjacentElement('afterend',x);
 }
 return x;
}
function paint(panel,html,kind='info'){
 const x=banner(panel);if(!x)return;
 const c=kind==='ok'?['#bbf7d0','#f0fdf4','#166534']:kind==='err'?['#fecaca','#fef2f2','#b91c1c']:['#bfdbfe','#eff6ff','#1e3a8a'];
 x.style.borderColor=c[0];x.style.background=c[1];x.style.color=c[2];x.innerHTML=html;
}
async function refreshTasks(){
 try{if(typeof window.triovistTasksReload==='function')await window.triovistTasksReload()}catch(_){}
 try{if(typeof window.renderTriovist==='function')window.renderTriovist()}catch(_){}
}
async function generate(btn){
 if(busy)return;
 const panel=panelOf(btn),manager=managerFrom(panel),target=countFrom(panel);
 busy=true;btn.disabled=true;
 paint(panel,'⏳ Сервер пересчитывает подгруппы: октябрь 2025 + сентябрь 2026 + текущий факт + 21vek (колонка 10 «Свободно») + Витебск + листинг…');
 try{
  const pack=await rpc('triovist_tasks_month_candidates_v236210',{p_manager_email:manager,p_target_count:target});
  const rows=Array.isArray(pack?.candidates)?pack.candidates:[];
  if(!rows.length)throw new Error('Сервер не вернул подходящих групп по новой логике');
  const meta={...pack};delete meta.candidates;
  const res=await rpc('triovist_tasks_generate_subgroup_v227319',{
    p_manager_email:manager,p_target_count:target,p_month_end:lastDay(),p_rows:rows,p_meta:meta
  });
  paint(panel,
   '<b>✅ План подгрупп пересобран сервером '+V+'.</b> '+
   'Кандидатов: <b>'+Number(pack?.candidate_count||rows.length)+'</b> · создано: <b>'+Number(res?.created||0)+'</b> · '+
   'сохранено ранее взятых в работу подгрупп: <b>'+Number(res?.locked_subgroup_tasks||0)+'</b>.'+
   '<br>Цель подгруппы = максимум продаж аналогичного месяца прошлого года и предыдущего месяца. 21vek берётся только из колонки 10 «Свободно»; «В пути» показывается отдельно и не увеличивает доступный остаток. Витебск и листинг участвуют в приоритете. Закрытие — по общей сумме продаж подгруппы.',
   'ok'
  );
  await refreshTasks();
 }catch(e){
  paint(panel,'<b>Не удалось сформировать новый план.</b><br>'+esc(e?.message||e),'err');
 }finally{busy=false;btn.disabled=false}
}
function renamePlanButtons(){
 document.querySelectorAll('#page-triovist button').forEach(b=>{
  if(isButton(b)&&txt(b.textContent)!=='Сформировать план по подгруппам')b.textContent='Сформировать план по подгруппам';
 });
}
[0,250,1000].forEach(ms=>setTimeout(renamePlanButtons,ms));
document.addEventListener('click',e=>{
 const b=e.target.closest?.('button');if(!isButton(b))return;
 if(!document.getElementById('page-triovist')?.contains(b))return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 generate(b);
},true);
window.RESANTA_TRIOVIST_PLAN_SERVER_V236231=Object.freeze({version:V,serverOnly:true,groupScope:true,generate});
})();