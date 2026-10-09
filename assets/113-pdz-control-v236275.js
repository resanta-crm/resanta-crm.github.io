/* RESANTA CRM v23.6.276 · PDZ CONTROL: FILTERS + 30/60 LEGAL AUDIT */
(function(){
'use strict';
if(window.RESANTA_PDZ_CONTROL_V236276)return;
const V='v23.6.276';
const state={manager:'all',age:'all',q:''};
let sourceRows=[],legalRows=[],legalLoaded=false,legalFlight=null,inputTimer=0;
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active=()=>!!document.getElementById('page-debt')?.classList.contains('active')||String(document.getElementById('app')?.dataset?.activePage||'')==='debt';
const isBoss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const profileEmail=()=>{try{return String(currentProfile?.email||'').toLowerCase()}catch(_){return''}};
const canLegal=()=>isBoss()&&['sidarovich_kn@resanta.ru','payushin_ar@resanta.ru'].includes(profileEmail());
const dbc=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const debtKey=v=>String(v??'').toLowerCase().replace(/ё/g,'е').replace(/[^0-9a-zа-я]+/g,' ').trim();
const fmtDate=v=>{
 if(!v)return'—';
 try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
 catch(_){return String(v)}
};
const ageBucket=d=>{
 const days=Number(d?.debt_overdue_days||0);
 if(days>=90)return'critical';
 if(days>=60)return'court';
 if(days>=30)return'claim';
 return'lt30';
};
const ageOk=d=>{
 const days=Number(d?.debt_overdue_days||0);
 if(state.age==='lt30')return days<30;
 if(state.age==='claim')return days>=30&&days<60;
 if(state.age==='court')return days>=60;
 if(state.age==='critical')return days>=90;
 return true;
};
const managerSearchOk=d=>{
 if(state.manager!=='all'&&String(d.manager_name||'')!==state.manager)return false;
 if(state.q){
   const q=state.q.toLowerCase();
   const hay=(String(d.client_name||'')+' '+String(d.manager_name||'')).toLowerCase();
   if(!hay.includes(q))return false;
 }
 return true;
};
const filtered=rows=>rows.filter(d=>managerSearchOk(d)&&ageOk(d));
function counts(rows){
 const base=rows.filter(managerSearchOk);
 const out={all:base.length,lt30:0,claim:0,court:0,critical:0};
 base.forEach(d=>{
  const days=Number(d?.debt_overdue_days||0);
  if(days<30)out.lt30++;
  if(days>=30&&days<60)out.claim++;
  if(days>=60)out.court++;
  if(days>=90)out.critical++;
 });
 return out;
}
function latestAction(clientName,type){
 const k=debtKey(clientName);
 return legalRows.find(x=>x.client_key===k&&x.action_type===type)||null;
}
async function loadLegal(force=false){
 if(legalFlight)return legalFlight;
 if(legalLoaded&&!force)return legalRows;
 const d=dbc();if(!d?.from)return[];
 legalFlight=(async()=>{
  const {data,error}=await d.from('pdz_legal_actions')
   .select('id,client_key,client_name,action_type,action_at,comment,author_name,author_email,report_date,debt_days,debt_amount')
   .order('action_at',{ascending:false})
   .limit(2000);
  if(error)throw error;
  legalRows=Array.isArray(data)?data:[];legalLoaded=true;return legalRows;
 })().catch(e=>{console.warn(V,'legal load',e);return legalRows}).finally(()=>legalFlight=null);
 return legalFlight;
}
function ensureStyles(){
 if(document.getElementById('pdz276-style'))return;
 const s=document.createElement('style');s.id='pdz276-style';s.textContent=`
 #pdz-control-v236275 .pdz-kpi-mini{border:1px solid var(--border);border-radius:9px;padding:8px 10px;background:#fff;cursor:pointer;font-size:11px}
 #pdz-control-v236275 .pdz-kpi-mini b{font-size:14px;margin-left:4px}
 .pdz-row-claim{background:#FFF7ED!important;border-left:6px solid #F97316!important;border-radius:8px;padding-left:12px!important;padding-right:10px!important}
 .pdz-row-court{background:#FEF2F2!important;border-left:6px solid #DC2626!important;border-radius:8px;padding-left:12px!important;padding-right:10px!important}
 .pdz-legal-box{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:7px 0 2px}
 .pdz-legal-status{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:7px;font-size:11px;font-weight:700}
 .pdz-legal-status.claim{background:#FFEDD5;color:#9A3412}.pdz-legal-status.court{background:#FEE2E2;color:#991B1B}.pdz-legal-status.done{background:#DCFCE7;color:#166534}
 .pdz-legal-btn{border:0;border-radius:7px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer}
 .pdz-legal-btn.claim{background:#F97316;color:#fff}.pdz-legal-btn.court{background:#DC2626;color:#fff}
 #pdz276-modal{position:fixed;inset:0;background:rgba(0,0,0,.38);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px}
 #pdz276-modal.open{display:flex}#pdz276-modal .box{background:#fff;border-radius:14px;padding:18px;width:min(520px,100%);box-shadow:0 20px 50px rgba(0,0,0,.22)}
 #pdz276-modal textarea{width:100%;min-height:105px;resize:vertical;padding:10px;border:1px solid var(--border);border-radius:8px;font:inherit}
 `;document.head.appendChild(s);
}
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
   box.addEventListener('click',onToolbarClick,true);
 }
 const rows=sourceRows.length?sourceRows:(()=>{try{return Array.isArray(allClientDebt)?allClientDebt:[]}catch(_){return[]}})();
 const mgrs=[...new Set(rows.map(x=>String(x.manager_name||'Не определён')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 const c=counts(rows),view=filtered(rows);
 box.innerHTML='<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">'
   +(isBoss()?'<div><label class="form-label">Менеджер</label><select class="form-input" data-pdz-manager><option value="all">Все менеджеры</option>'+mgrs.map(x=>'<option value="'+E(x)+'" '+(state.manager===x?'selected':'')+'>'+E(x)+'</option>').join('')+'</select></div>':'')
   +'<div><label class="form-label">Срок ПДЗ</label><select class="form-input" data-pdz-age>'
    +'<option value="all" '+(state.age==='all'?'selected':'')+'>Все сроки ('+c.all+')</option>'
    +'<option value="lt30" '+(state.age==='lt30'?'selected':'')+'>До 30 дней ('+c.lt30+')</option>'
    +'<option value="claim" '+(state.age==='claim'?'selected':'')+'>30–59 · претензия ('+c.claim+')</option>'
    +'<option value="court" '+(state.age==='court'?'selected':'')+'>60+ · в суд ('+c.court+')</option>'
    +'<option value="critical" '+(state.age==='critical'?'selected':'')+'>90+ · критично ('+c.critical+')</option>'
   +'</select></div>'
   +'<div style="min-width:240px;flex:1"><label class="form-label">Поиск клиента</label><input class="form-input" data-pdz-search placeholder="Название клиента" value="'+E(state.q)+'"></div>'
   +'<button type="button" class="btn-secondary" data-pdz-reset>Сбросить</button>'
   +'</div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'
     +'<button class="pdz-kpi-mini" data-pdz-jump="claim">✉ Претензия 30–59 <b>'+c.claim+'</b></button>'
     +'<button class="pdz-kpi-mini" data-pdz-jump="court">⚖ В суд 60+ <b>'+c.court+'</b></button>'
     +'<span style="padding:8px 2px;font-size:11px;color:var(--sub)">Показано клиентов: <b>'+view.length+'</b></span>'
   +'</div>'
   +'<div style="margin-top:8px;font-size:11px;color:var(--sub)">🟠 <b>30–59 дней</b> — ДФ Сидарович: претензия + отправить по почте. 🔴 <b>60+ дней</b> — передать материалы в суд. Дата, время, автор и комментарий фиксируются в CRM.</div>';
}
function emptyState(){
 const rows=sourceRows;
 const view=filtered(rows);
 if(view.length||!rows.length)return;
 const list=document.getElementById('debt-list');if(!list)return;
 const labels={lt30:'до 30 дней',claim:'30–59 дней — претензия',court:'60+ дней — в суд',critical:'90+ дней — критично',all:'по выбранным условиям'};
 list.innerHTML='<div class="card" style="padding:22px;text-align:center"><div style="font-size:28px;margin-bottom:6px">✅</div><div style="font-size:15px;font-weight:700">Клиентов '+E(labels[state.age]||labels.all)+' сейчас нет</div><div style="font-size:12px;color:var(--sub);margin-top:5px">Фильтр работает: в текущем срезе ПДЗ нет клиентов, подходящих под выбранные условия.</div></div>';
}
function legalMarkup(d){
 const days=Number(d?.debt_overdue_days||0);
 if(days<30)return'';
 const claim=latestAction(d.client_name,'claim_sent');
 const court=latestAction(d.client_name,'court_submitted');
 let h='<div class="pdz-legal-box" data-pdz-legal>';
 if(days>=60){
   if(court){
    h+='<span class="pdz-legal-status done">✅ В суд передано · '+E(fmtDate(court.action_at))+' · '+E(court.author_name||'')+'</span>';
    if(court.comment)h+='<span style="font-size:11px;color:var(--sub)">💬 '+E(court.comment)+'</span>';
   }else{
    h+='<span class="pdz-legal-status court">⚖ 60+ ДНЕЙ · ПЕРЕДАТЬ В СУД</span>';
    if(canLegal())h+='<button class="pdz-legal-btn court" data-pdz-action="court_submitted">Отметить передачу в суд</button>';
   }
   if(claim){
    h+='<span class="pdz-legal-status done">✉ Претензия отправлена · '+E(fmtDate(claim.action_at))+' · '+E(claim.author_name||'')+'</span>';
   }else{
    h+='<span class="pdz-legal-status claim">⚠ Претензия не отмечена</span>';
    if(canLegal())h+='<button class="pdz-legal-btn claim" data-pdz-action="claim_sent">Отметить претензию</button>';
   }
 }else{
   if(claim){
    h+='<span class="pdz-legal-status done">✅ Претензия отправлена · '+E(fmtDate(claim.action_at))+' · '+E(claim.author_name||'')+'</span>';
    if(claim.comment)h+='<span style="font-size:11px;color:var(--sub)">💬 '+E(claim.comment)+'</span>';
   }else{
    h+='<span class="pdz-legal-status claim">✉ 30–59 ДНЕЙ · СИДАРОВИЧ: ПРЕТЕНЗИЯ + ПОЧТА</span>';
    if(canLegal())h+='<button class="pdz-legal-btn claim" data-pdz-action="claim_sent">Отметить претензию</button>';
   }
 }
 return h+'</div>';
}
function decorate(){
 if(!active())return;
 const list=document.getElementById('debt-list');if(!list)return;
 const rows=filtered(sourceRows);
 const used=new Set();
 list.querySelectorAll('div[style*="padding:10px 0"][style*="border-top"]').forEach(el=>{
   const text=(el.textContent||'').trim().toLowerCase();
   let idx=-1;
   for(let i=0;i<rows.length;i++){
     if(used.has(i))continue;
     const n=String(rows[i].client_name||'').trim().toLowerCase();
     if(n&&text.includes(n)){idx=i;break}
   }
   if(idx<0)return;used.add(idx);
   const d=rows[idx],days=Number(d.debt_overdue_days||0);
   if(days>=60)el.classList.add('pdz-row-court');
   else if(days>=30)el.classList.add('pdz-row-claim');
   if(days<30)return;
   el.dataset.pdzClient=encodeURIComponent(String(d.client_name||''));
   el.dataset.pdzDays=String(days);
   el.dataset.pdzAmount=String(d.debt_overdue||0);
   el.dataset.pdzReportDate=String(d.report_date||'');
   const old=el.querySelector('[data-pdz-legal]');if(old)old.remove();
   const wrap=document.createElement('div');wrap.innerHTML=legalMarkup(d);
   const node=wrap.firstElementChild;if(node){
     node.dataset.pdzClient=encodeURIComponent(String(d.client_name||''));
     node.dataset.pdzDays=String(days);
     node.dataset.pdzAmount=String(d.debt_overdue||0);
     node.dataset.pdzReportDate=String(d.report_date||'');
     const first=el.firstElementChild;if(first)first.insertAdjacentElement('afterend',node);else el.appendChild(node);
   }
 });
}
function ensureModal(){
 let m=document.getElementById('pdz276-modal');if(m)return m;
 m=document.createElement('div');m.id='pdz276-modal';
 m.innerHTML='<div class="box"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><div style="font-size:17px;font-weight:700" data-pdz-modal-title></div><div style="font-size:12px;color:var(--sub);margin-top:3px" data-pdz-modal-client></div></div><button class="btn-secondary" data-pdz-modal-close>✕</button></div><div style="margin-top:14px"><label class="form-label">Комментарий Сидаровича / руководителя</label><textarea data-pdz-modal-comment placeholder="Например: претензия №..., отправлена заказным письмом; либо документы переданы юристу/в суд..."></textarea></div><div style="font-size:11px;color:var(--sub);margin-top:7px">Дата, время и автор будут записаны автоматически в момент подтверждения.</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn-secondary" data-pdz-modal-close>Отмена</button><button class="btn-primary" data-pdz-modal-save>Сохранить</button></div></div>';
 document.body.appendChild(m);
 m.addEventListener('click',async e=>{
   if(e.target===m||e.target.closest?.('[data-pdz-modal-close]')){m.classList.remove('open');return}
   if(e.target.closest?.('[data-pdz-modal-save]'))await saveModal();
 });
 return m;
}
function openModal(action,box){
 const m=ensureModal();
 m.dataset.action=action;
 m.dataset.client=box.dataset.pdzClient||'';
 m.dataset.days=box.dataset.pdzDays||'0';
 m.dataset.amount=box.dataset.pdzAmount||'0';
 m.dataset.reportDate=box.dataset.pdzReportDate||'';
 const client=decodeURIComponent(m.dataset.client||'');
 m.querySelector('[data-pdz-modal-title]').textContent=action==='claim_sent'?'✉ Претензия отправлена':'⚖ Документы переданы в суд';
 m.querySelector('[data-pdz-modal-client]').textContent=client;
 m.querySelector('[data-pdz-modal-comment]').value='';
 m.classList.add('open');
 setTimeout(()=>m.querySelector('[data-pdz-modal-comment]')?.focus(),50);
}
async function saveModal(){
 const m=ensureModal(),btn=m.querySelector('[data-pdz-modal-save]');
 const comment=String(m.querySelector('[data-pdz-modal-comment]')?.value||'').trim();
 if(!comment){alert('Добавьте короткий комментарий: как отправили претензию или куда передали документы.');return}
 const d=dbc();if(!d?.rpc)return;
 btn.disabled=true;btn.textContent='Сохраняю…';
 try{
   const {data,error}=await d.rpc('crm_pdz_record_legal_action_v1',{
     p_client_name:decodeURIComponent(m.dataset.client||''),
     p_action_type:m.dataset.action,
     p_comment:comment,
     p_report_date:m.dataset.reportDate||null,
     p_debt_days:Number(m.dataset.days||0),
     p_debt_amount:Number(m.dataset.amount||0),
     p_client_id:null
   });
   if(error)throw error;
   m.classList.remove('open');
   legalLoaded=false;await loadLegal(true);rerender();
 }catch(e){alert('Не удалось сохранить отметку: '+(e?.message||e))}
 finally{btn.disabled=false;btn.textContent='Сохранить'}
}
function apply(){
 ensureStyles();toolbar();emptyState();decorate();
}
function rerender(){try{window.renderDebt?.()}catch(e){console.warn(V,e)}}
function onChange(e){
 const m=e.target.closest?.('[data-pdz-manager]');if(m){state.manager=m.value;rerender();return}
 const a=e.target.closest?.('[data-pdz-age]');if(a){state.age=a.value;rerender();return}
}
function onInput(e){
 const q=e.target.closest?.('[data-pdz-search]');if(!q)return;
 state.q=q.value||'';clearTimeout(inputTimer);inputTimer=setTimeout(rerender,180);
}
function onToolbarClick(e){
 const reset=e.target.closest?.('[data-pdz-reset]');if(reset){state.manager='all';state.age='all';state.q='';rerender();return}
 const jump=e.target.closest?.('[data-pdz-jump]');if(jump){state.age=jump.dataset.pdzJump||'all';rerender();return}
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-pdz-action]');
 if(b){
   e.preventDefault();e.stopPropagation();
   const box=b.closest('[data-pdz-legal]');if(box)openModal(b.dataset.pdzAction,box);
   return;
 }
 if(e.target.closest?.('.nav-item,.bn-item,[data-page]'))setTimeout(()=>{if(active()){patch();loadLegal(false).then(rerender)}},180);
},true);
function patch(){
 const base=window.renderDebt||globalThis.renderDebt;
 if(typeof base!=='function'||base.__pdzControlV236276)return;
 const wrapped=function(){
   const original=(()=>{try{return Array.isArray(allClientDebt)?allClientDebt:[]}catch(_){return[]}})();
   if(original.length)sourceRows=original.slice();
   const source=sourceRows.length?sourceRows:original;
   const view=filtered(source);
   let out;
   try{
     try{allClientDebt=view}catch(_){window.allClientDebt=view}
     out=base.apply(this,arguments);
   }finally{
     try{allClientDebt=source}catch(_){window.allClientDebt=source}
   }
   setTimeout(apply,0);
   return out;
 };
 wrapped.__pdzControlV236276=true;wrapped.__base=base;
 window.renderDebt=wrapped;try{renderDebt=wrapped}catch(_){}
}
ensureStyles();patch();
if(active()){
 const initial=(()=>{try{return Array.isArray(allClientDebt)?allClientDebt:[]}catch(_){return[]}})();
 if(initial.length)sourceRows=initial.slice();
 loadLegal(false).then(()=>setTimeout(rerender,0));
}
window.RESANTA_PDZ_CONTROL_V236276=Object.freeze({version:V,filters:true,hardHighlight30:true,hardHighlight60:true,legalAudit:true,noPolling:true});
})();