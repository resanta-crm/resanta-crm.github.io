/* RESANTA CRM · Payments 360 director UX · 2026-11-09
 * Read-only presentation for the existing 1C cash receipts screen.
 * Never mutates receipts, clients, permissions, finance loaders or payment registry.
 * Original renderPayments is preserved (including its 1C-period and stale-data guards).
 */
(function(w,d){
'use strict';
if(w.RESANTA_PAYMENTS360_V1)return;
const ID='payments360-director-v1', STYLE='payments360-director-style-v1';
const $=id=>d.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v)||0;
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const count=v=>Number(v||0).toLocaleString('ru-RU');
const norm=v=>String(v||'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' ');
function dateOnly(v){return String(v||'').slice(0,10)}
function monthKey(v){
 const str=String(v||'');
 const iso=str.match(/^(\d{4})-(\d{2})/);if(iso)return iso[1]+'-'+iso[2];
 const ru=str.match(/^(\d{2})[.\/]?(\d{2})[.\/]?(\d{4})/);return ru?ru[3]+'-'+ru[2]:'';
}
function dateRu(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:'—'}
function priorMonth(v){if(!/^\d{4}-\d{2}$/.test(v))return '';const [y,m]=v.split('-').map(Number);return (m===1?y-1:y)+'-'+String(m===1?12:m-1).padStart(2,'0')}
function receipts(){try{return Array.isArray(allCashReceipts)?allCashReceipts:[]}catch(_){return Array.isArray(w.allCashReceipts)?w.allCashReceipts:[]}}
function filters(){
 return{month:$('payments-month')?.value||'all',report:$('payments-period')?.value||'all',manager:$('payments-manager')?.value||'all',search:$('payments-search')?.value||''};
}
function selected(rows,f,ignoreManager=false){
 const q=norm(f.search);
 return (rows||[]).filter(r=>(f.month==='all'||monthKey(r.document_at)===f.month)
   &&(f.report==='all'||(dateOnly(r.period_start)+'|'+dateOnly(r.period_end))===f.report)
   &&(ignoreManager||f.manager==='all'||r.manager_name===f.manager)
   &&(!q||norm((r.client_name||'')+' '+(r.document_number||'')+' '+(r.manager_name||'')).includes(q)));
}
function docKey(r){return (r.manager_name||'')+'|'+(r.client_name||'')+'|'+(r.document_number||'')+'|'+(r.document_at||'')}
function summary(rows){
 const a=[...rows].sort((x,y)=>String(y.document_at||'').localeCompare(String(x.document_at||'')));
 return{amount:rows.reduce((s,r)=>s+num(r.amount),0),
  clients:new Set(rows.map(r=>String(r.client_id||norm(r.client_name)))).size,
  docs:new Set(rows.map(docKey)).size,
  latest:a[0]?.document_at||''};
}
function byManager(rows){
 const group=new Map();
 rows.forEach(r=>{const m=r.manager_name||'Без менеджера';let x=group.get(m);if(!x){x={name:m,rows:[],amount:0};group.set(m,x)}x.rows.push(r);x.amount+=num(r.amount)});
 return [...group.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'ru'));
}
const style=[
'#'+ID+'{font-family:inherit;color:var(--text);display:grid;gap:12px;margin:0 0 16px}',
'#'+ID+' *,#'+ID+' *:before,#'+ID+' *:after{box-sizing:border-box}',
'#'+ID+' .p360-top,#'+ID+' .p360-splithead{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}',
'#'+ID+' .p360-h1{font-size:21px;font-weight:850;letter-spacing:-.5px}',
'#'+ID+' .p360-muted{color:var(--sub);font-size:11px;line-height:1.55}',
'#'+ID+' .p360-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
'#'+ID+' .p360-kpi,#'+ID+' .p360-panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;min-width:0}',
'#'+ID+' .p360-kpi small{display:block;color:var(--sub);font-size:11px}',
'#'+ID+' .p360-kpi strong{display:block;font-size:24px;font-weight:820;letter-spacing:-.6px;margin:6px 0 3px;overflow-wrap:anywhere}',
'#'+ID+' .p360-kpi em{display:block;font-size:10px;color:var(--sub);font-style:normal}',
'#'+ID+' .p360-cols{display:grid;grid-template-columns:1.05fr 1fr;gap:12px}',
'#'+ID+' .p360-panel h3{font-size:14px;font-weight:780;margin:0 0 12px}',
'#'+ID+' .p360-note{padding:9px 0;border-bottom:1px solid var(--border)}',
'#'+ID+' .p360-note:last-child{border-bottom:0}',
'#'+ID+' .p360-note b{display:block;font-size:12px;margin:3px 0}',
'#'+ID+' .p360-caps{font-size:10px;font-weight:800;color:var(--a);letter-spacing:.04em;text-transform:uppercase}',
'#'+ID+' .p360-bars{display:grid;gap:10px}',
'#'+ID+' .p360-bar{display:grid;grid-template-columns:minmax(70px,1fr) minmax(80px,2fr) minmax(110px,1fr);align-items:center;gap:10px}',
'#'+ID+' .p360-bar button{background:none;border:0;text-align:left;color:var(--text);font-weight:650;font-size:12px;cursor:pointer;padding:2px;overflow-wrap:anywhere}',
'#'+ID+' .p360-bar button:hover{text-decoration:underline}',
'#'+ID+' .p360-track{height:12px;border-radius:5px;background:var(--bg);overflow:hidden}',
'#'+ID+' .p360-track i{display:block;height:100%;background:var(--a);border-radius:5px}',
'#'+ID+' .p360-bar b{text-align:right;font-size:12px}',
'#'+ID+' .p360-chips{display:flex;gap:7px;flex-wrap:wrap;margin:11px 0}',
'#'+ID+' .p360-chip,#'+ID+' .p360-btn{border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);padding:9px 11px;cursor:pointer;font-size:12px;font-weight:650}',
'#'+ID+' .p360-chip[aria-pressed="true"]{background:var(--ab);border-color:var(--a);color:var(--at)}',
'#'+ID+' .p360-btn.primary{background:var(--a);color:#fff;border-color:var(--a)}',
'#'+ID+' button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
'#'+ID+' .p360-manager{border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:10px}',
'#'+ID+' .p360-managerhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;background:var(--bg);font-weight:750}',
'#'+ID+' .p360-client{border-top:1px solid var(--border)}',
'#'+ID+' .p360-clientbutton{width:100%;padding:12px;border:0;background:var(--card);color:var(--text);display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;text-align:left;font:inherit}',
'#'+ID+' .p360-clientbutton strong{display:block;font-size:12px}',
'#'+ID+' .p360-clientbutton b{font-size:12px;white-space:nowrap}',
'#'+ID+' .p360-clientbutton:hover{background:var(--bg)}',
'#'+ID+' .p360-docs{padding:5px 12px 12px;background:var(--card)}',
'#'+ID+' .p360-docline{display:grid;grid-template-columns:95px minmax(95px,1fr) 120px;gap:9px;align-items:center;border-top:1px solid var(--border);padding:9px 0;font-size:11px}',
'#'+ID+' .p360-docline b{text-align:right}',
'#'+ID+' .p360-legacy-note{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}',
'#payments-list.p360-hide-legacy,#payments-kpi.p360-hide-legacy{display:none}',
'@media(max-width:900px){#'+ID+' .p360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ID+' .p360-cols{grid-template-columns:1fr}}',
'@media(max-width:560px){#'+ID+' .p360-h1{font-size:18px}#'+ID+' .p360-kpi strong{font-size:20px}#'+ID+' .p360-bar{grid-template-columns:85px 1fr;gap:5px}#'+ID+' .p360-bar b{grid-column:2;text-align:left}#'+ID+' .p360-docline{grid-template-columns:1fr auto}#'+ID+' .p360-docline span:nth-child(2){grid-column:1}#'+ID+' .p360-docline b{grid-column:2;grid-row:1 / span 2}}'
].join('');
let legacyOpen=false, expandedGroups=new Set(), dataClients=new Map(), wrapped=false, baseRender=null, installing=false;
function mount(){
 const anchor=$('payments-kpi'),old=$('payments-list');
 if(!anchor||!old)return null;
 let root=$(ID);
 if(!root){
  if(!$(STYLE)){const s=d.createElement('style');s.id=STYLE;s.textContent=style;d.head.appendChild(s)}
  root=d.createElement('section');root.id=ID;root.setAttribute('aria-label','Поступления 360° — обзор платежей');
  anchor.parentNode.insertBefore(root,anchor);
  root.addEventListener('click',onClick);
 }
 anchor.classList.add('p360-hide-legacy');
 old.classList.toggle('p360-hide-legacy',!legacyOpen);
 return root;
}
function availableManagers(){
 const el=$('payments-manager');if(!el)return[];
 return [...el.options].filter(o=>o.value&&!o.disabled).map(o=>({value:o.value,label:o.textContent||o.value}));
}
function managerChosen(name){
 const el=$('payments-manager');
 if(!el||el.disabled||![...el.options].some(x=>x.value===name&&!x.disabled))return;
 el.value=name;
 expandedGroups.clear();
 if(typeof w.renderPayments==='function')w.renderPayments();
}
function detailDocs(group){
 let s='<div role="region" aria-label="Документы клиента">';
 group.rows.slice().sort((a,b)=>String(b.document_at||'').localeCompare(String(a.document_at||''))).forEach(r=>{
  s+='<div class="p360-docline"><span>'+esc(dateRu(r.document_at))+'</span>'+
    '<span>'+esc(r.document_number||'Без номера')+'<div class="p360-muted">'+esc(r.document_type||'Поступление')+'</div></span>'+
    '<b>'+esc(money(r.amount))+'</b></div>';
 });
 if(group.clientId)s+='<button class="p360-btn" type="button" data-p360-client="'+esc(group.clientId)+'" style="margin-top:9px">Открыть клиента</button>';
 return s+'</div>';
}
function onClick(e){
 const t=e.target,chip=t.closest?.('[data-p360-manager]');
 if(chip){managerChosen(chip.dataset.p360Manager);return}
 const client=t.closest?.('[data-p360-open]');
 if(client){
  const id=client.dataset.p360Open,item=dataClients.get(id),area=client.closest('.p360-client')?.querySelector('.p360-docs');
  if(!item||!area)return;
  const expand=client.getAttribute('aria-expanded')!=='true';
  client.setAttribute('aria-expanded',String(expand));
  if(expand&&!area.dataset.loaded){area.innerHTML=detailDocs(item);area.dataset.loaded='1'}
  area.hidden=!expand;return;
 }
 const view=t.closest?.('[data-p360-client]');
 if(view){
  const id=view.dataset.p360Client;
  if(id&&typeof w.openClient==='function')w.openClient(id);
  return;
 }
 const more=t.closest?.('[data-p360-more]');
 if(more){expandedGroups.add(more.dataset.p360More);render();return}
 if(t.closest?.('[data-p360-legacy]')){
  legacyOpen=!legacyOpen;
  const old=$('payments-list');if(old)old.classList.toggle('p360-hide-legacy',!legacyOpen);
  const b=$(ID)?.querySelector('[data-p360-legacy]');
  if(b){b.setAttribute('aria-expanded',String(legacyOpen));b.textContent=legacyOpen?'Скрыть исходный список':'Открыть исходный список'}
 }
}
function render(){
 const root=mount();if(!root)return false;
 const f=filters(),source=receipts(),rows=selected(source,f),s=summary(rows);
 const rawManagers=selected(source,f,true);
 const opts=availableManagers(),canAll=opts.some(x=>x.value==='all');
 const allowedNames=new Set(opts.filter(x=>x.value!=='all').map(x=>x.value));
 const groups=byManager(rawManagers).filter(m=>canAll||allowedNames.has(m.name)||m.name===f.manager);
 const max=Math.max(1,...groups.map(x=>Math.max(0,x.amount)));
 const bar=groups.map(m=>'<div class="p360-bar"><button type="button" data-p360-manager="'+esc(m.name)+'">'+esc(m.name)+'</button><span class="p360-track"><i style="width:'+Math.max(0,m.amount)/max*100+'%"></i></span><b>'+esc(money(m.amount))+'</b></div>').join('')||'<p class="p360-muted">Нет поступлений за выбранный период.</p>';
 const top=byManager(rows)[0],topClient=rows.slice().sort((a,b)=>num(b.amount)-num(a.amount))[0];
 let comparison='Сравнение не показывается: нет подтверждённого сопоставимого периода.';
 if(f.month!=='all'&&f.report==='all'){
  const prev=priorMonth(f.month),previous=selected(source,{...f,month:prev});
  if(previous.length){
   const v=summary(previous).amount,delta=s.amount-v;
   comparison='К предыдущему месяцу в имеющихся данных 1С: '+(delta>=0?'+':'')+money(delta)+
     (v>0?' ('+(delta/v*100).toFixed(1).replace('.',',')+'%)':'')+'.';
  }
 }
 const tile=(label,value,desc)=>'<div class="p360-kpi"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><em>'+esc(desc)+'</em></div>';
 const allManagers=(opts.length?opts:[{value:'all',label:'Все менеджеры'}]);
 const chips=allManagers.map(o=>'<button type="button" class="p360-chip" data-p360-manager="'+esc(o.value)+'" aria-pressed="'+String(f.manager===o.value)+'">'+esc(o.label)+'</button>').join('');
 dataClients.clear();let nextId=0;
 let rowsHtml='';
 const chosenGroups=byManager(rows);
 chosenGroups.forEach(m=>{
  const map=new Map();
  m.rows.forEach(r=>{
   const k=String(r.client_id||norm(r.client_name));
   if(!map.has(k))map.set(k,{clientId:r.client_id||'',name:r.client_name||'Без названия',rows:[],amount:0});
   const x=map.get(k);x.rows.push(r);x.amount+=num(r.amount);
  });
  const clients=[...map.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'ru'));
  const shown=expandedGroups.has(m.name)?clients:clients.slice(0,7);
  const html=shown.map(c=>{
   const id=String(++nextId);dataClients.set(id,c);
   const docs=new Set(c.rows.map(docKey)).size;
   return '<div class="p360-client"><button type="button" class="p360-clientbutton" aria-expanded="false" data-p360-open="'+id+'">'+
     '<span><strong>'+esc(c.name)+'</strong><span class="p360-muted">'+count(docs)+' докум. · '+count(c.rows.length)+' записей 1С</span></span>'+
     '<b>'+esc(money(c.amount))+' <span aria-hidden="true">⌄</span></b></button>'+
     '<div class="p360-docs" hidden></div></div>';
  }).join('');
  rowsHtml+='<div class="p360-manager"><div class="p360-managerhead"><span>'+esc(m.name)+' · '+count(clients.length)+' клиентов</span><span>'+esc(money(m.amount))+'</span></div>'+
    html+(clients.length>shown.length?'<div style="padding:10px 12px"><button class="p360-btn" data-p360-more="'+esc(m.name)+'" type="button">Показать ещё '+count(clients.length-shown.length)+' клиентов</button></div>':'')+'</div>';
 });
 if(!rowsHtml)rowsHtml='<div class="p360-panel p360-muted">Поступлений по выбранным фильтрам нет. Исходные фильтры и документы 1С сохранены.</div>';
 const topLabel=top?top.name+' — '+money(top.amount):'Нет поступлений по менеджерам';
 const topClientLabel=topClient?(topClient.client_name||'Клиент без названия')+' · '+money(topClient.amount):'Нет подтверждённых документов';
 root.innerHTML=
  '<div class="p360-top"><div><div class="p360-h1">Поступления 360°</div><div class="p360-muted">Клиенты · менеджеры · документы 1С · суммы BYN</div></div>'+
  '<div class="p360-muted">Фактические документы · '+(f.month==='all'?'все месяцы':esc(f.month))+'</div></div>'+
  '<div class="p360-kpis">'+tile('Поступило',money(s.amount),'По выбранным фильтрам')+
   tile('Клиентов оплатили',count(s.clients),'Уникальных плательщиков')+
   tile('Документов',count(s.docs),'По номерам и датам 1С')+
   tile('Последний платёж',dateRu(s.latest),'Дата документа, не дата импорта')+'</div>'+
  '<div class="p360-cols"><div class="p360-panel"><h3>✦ ИИ · Директорский брифинг</h3>'+
   '<div class="p360-note"><span class="p360-caps">Общая картина</span><b>'+esc(money(s.amount))+' · '+count(s.docs)+' документов · '+count(s.clients)+' клиентов</b><div class="p360-muted">Факт поступлений из 1С, без прогнозов или обещаний оплат</div></div>'+
   '<div class="p360-note"><span class="p360-caps">Приоритет контроля</span><b>'+esc(topLabel)+'</b><div class="p360-muted">Менеджер с наибольшим поступлением в выбранной выборке</div></div>'+
   '<div class="p360-note"><span class="p360-caps">Крупнейший документ</span><b>'+esc(topClientLabel)+'</b><div class="p360-muted">'+esc(comparison)+' Долги и просрочки проверяются отдельно в ПДЗ.</div></div></div>'+
   '<div class="p360-panel"><h3>Поступления по менеджерам</h3><div class="p360-muted" style="margin-bottom:12px">BYN · те же месяц и отчёт 1С, сравнение менеджеров</div><div class="p360-bars">'+bar+'</div></div></div>'+
  '<div class="p360-panel"><div class="p360-splithead"><div><h3 style="margin:0">Клиенты и документы</h3><div class="p360-muted">Нажмите на клиента, чтобы открыть фактические платежи и карточку CRM</div></div><div class="p360-muted">Детали по раскрытию</div></div>'+
   '<div class="p360-chips">'+chips+'</div>'+rowsHtml+'</div>'+
  '<div class="p360-legacy-note"><span class="p360-muted">Источник: существующий реестр 1С. Фильтры и дата импорта выше сохранены.</span>'+
   '<button type="button" class="p360-btn" data-p360-legacy aria-expanded="'+String(legacyOpen)+'">'+(legacyOpen?'Скрыть исходный список':'Открыть исходный список')+'</button></div>';
 return true;
}
function install(){
 if(wrapped||installing)return;
 installing=true;
 try{
  if(typeof w.renderPayments!=='function')return;
  baseRender=w.renderPayments;
  w.renderPayments=function(){
   const result=baseRender.apply(this,arguments);
   try{render()}catch(e){console.warn('Payments360 optional view failed; legacy payments remain',e)}
   return result;
  };
  wrapped=true;
  if($('payments-kpi')&&$('payments-list'))render();
 }finally{installing=false}
}
w.RESANTA_PAYMENTS360_V1=Object.freeze({version:'20261109.1',readOnly:true,usesExistingFinanceData:true,filterRows:selected,summary});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window,document);
