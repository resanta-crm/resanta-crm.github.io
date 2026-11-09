/* RESANTA CRM ABC 360 v1 · isolated read-only director dashboard */
(function(){
'use strict';
if(window.RESANTA_ABC360_V1)return;
const el=id=>document.getElementById(id), fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(n)||0);
const html=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const percent=n=>(Number(n)||0).toFixed(1).replace('.',',')+'%';
const colors={A:'#16a34a',B:'#eab308',C:'#94a3b8',N:'#3b82f6'};
let opened=false,seq=0,searchTimer=null,filterTimer=null;
const styles=[
'#page-abc.abc360-on #abc-kpi{display:none}',
'#page-abc.abc360-on:not(.abc360-open) #abc-results{display:none}',
'#page-abc .abc360{display:grid;gap:12px;margin-bottom:15px}',
'#page-abc .abc360-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}',
'#page-abc .abc360-title{font-size:21px;font-weight:800;letter-spacing:-.4px}',
'#page-abc .abc360-sub{font-size:11px;color:var(--sub);line-height:1.5}',
'#page-abc .abc360-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}',
'#page-abc .abc360-kpi,#page-abc .abc360-panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;min-width:0}',
'#page-abc .abc360-kpi small{font-size:11px;color:var(--sub)}',
'#page-abc .abc360-kpi strong{display:block;font-size:23px;letter-spacing:-.6px;margin:6px 0}',
'#page-abc .abc360-kpi em{display:block;color:var(--sub);font-size:10px;font-style:normal}',
'#page-abc .abc360-two{display:grid;grid-template-columns:1.05fr 1fr;gap:12px}',
'#page-abc .abc360-panel h3{font-size:14px;font-weight:800;margin:0 0 12px}',
'#page-abc .abc360-note{padding:9px 0;border-bottom:1px solid var(--border);font-size:12px}',
'#page-abc .abc360-note:last-child{border-bottom:0}',
'#page-abc .abc360-note b{display:block;margin-bottom:4px}',
'#page-abc .abc360-note label{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--a)}',
'#page-abc .abc360-stack{display:flex;height:17px;overflow:hidden;border-radius:5px;background:var(--bg);margin:13px 0}',
'#page-abc .abc360-stack div{height:100%}',
'#page-abc .abc360-legend{display:flex;flex-wrap:wrap;gap:11px}',
'#page-abc .abc360-legend span{font-size:11px}',
'#page-abc .abc360-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}',
'#page-abc .abc360-gr{display:grid;grid-template-columns:minmax(110px,1fr) 2fr 90px;gap:8px;align-items:center;margin:9px 0}',
'#page-abc .abc360-gr button{border:0;background:none;text-align:left;color:var(--text);font-size:11px;cursor:pointer}',
'#page-abc .abc360-gr .track{height:9px;background:var(--bg);border-radius:4px;overflow:hidden}',
'#page-abc .abc360-gr .track div{height:100%;background:var(--a)}',
'#page-abc .abc360-gr b{font-size:11px;text-align:right}',
'#page-abc .abc360-actions{display:flex;gap:8px;flex-wrap:wrap}',
'#page-abc .abc360-btn{padding:9px 12px;border-radius:8px;background:var(--card);border:1px solid var(--border);font-size:12px;font-weight:700;color:var(--text);cursor:pointer}',
'#page-abc .abc360-btn.primary{background:var(--a);color:white;border-color:var(--a)}',
'#page-abc .abc360-riskgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
'#page-abc .abc360-risk{background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px}',
'#page-abc .abc360-warn{background:#fffbeb;color:#854d0e;border:1px solid #fde68a;border-radius:8px;padding:10px;font-size:11px}',
'#page-abc .abc360-managerbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px;background:var(--card);border:1px solid var(--border);border-radius:12px}',
'#page-abc .abc360-managerlist{display:flex;gap:7px;flex-wrap:wrap}',
'#page-abc .abc360-managerlist button{border:1px solid var(--border);background:var(--card);padding:9px 12px;border-radius:9px;cursor:pointer;font-size:12px;font-weight:650;color:var(--text)}',
'#page-abc .abc360-managerlist button[aria-pressed="true"]{background:var(--ab);color:var(--at);border-color:var(--a)}',
'@media(max-width:990px){#page-abc .abc360-kpis{grid-template-columns:repeat(3,1fr)}}',
'@media(max-width:700px){#page-abc .abc360-kpis{grid-template-columns:repeat(2,1fr)}#page-abc .abc360-two{grid-template-columns:1fr}#page-abc .abc360-riskgrid{grid-template-columns:1fr}}'
].join('');
function openState(){const p=el('page-abc');if(p)p.classList.toggle('abc360-open',opened);}
function mount(){
 const page=el('page-abc'),kpi=el('abc-kpi');if(!page||!kpi)return null;
 let root=el('abc360-root');
 if(!root){
  root=document.createElement('div');root.id='abc360-root';root.className='abc360';
  root.setAttribute('aria-label','ABC 360 — директорский контроль');
  kpi.parentNode.insertBefore(root,kpi);
  const style=document.createElement('style');style.id='abc360-css';style.textContent=styles;document.head.appendChild(style);
  root.addEventListener('click',function(e){
   const b=e.target.closest('button[data-abc-action]');if(!b)return;
   const action=b.dataset.abcAction;
   if(action==='manager'){
    if(typeof currentProfile==='undefined'||currentProfile?.role!=='boss')return;
    const value=b.dataset.value||'all';
    const scope=el('abc-scope'),manager=el('abc-manager');
    if(!scope||!manager)return;
    scope.value=value==='all'?'branch':'manager';
    if(value!=='all')manager.value=value;
    if(typeof abcScopeChanged==='function')abcScopeChanged(false);
    opened=false;openState();refresh(false);return;
   }
   if(action==='details'){opened=!opened;openState();const t=el('abc360-expand');if(t){t.textContent=opened?'Скрыть детали':'Раскрыть группы и SKU';t.setAttribute('aria-expanded',String(opened));}}
   if(action==='class'){el('abc-class').value=b.dataset.value;opened=true;openState();renderABC();}
   if(action==='group'){el('abc-group').value=b.dataset.value;opened=true;openState();renderABC();}
   if(action==='refresh')refresh(true);
   if(action==='tasks'&&typeof goPage==='function')goPage('tasks','Задачи ИИ');
  });
 }
 page.classList.add('abc360-on');openState();return root;
}
function warehouse(x){
 try{
  const st=(x.sku&&x.sku!=='—'&&typeof _availBySku==='function'?_availBySku(x.sku):null)||
    (typeof _stockForProduct==='function'?_stockForProduct(x.product):null);
  if(!st||!Number.isFinite(Number(st.avail)))return null;
  return{qty:Number(st.avail),date:st.report_date||''};
 }catch(_){return null;}
}
function svgCurve(group){
 const sorted=(group?.items||[]).filter(x=>Number(x.revenue)>0).sort((a,b)=>b.revenue-a.revenue);
 if(!sorted.length)return '<p class="abc360-sub">Нет положительного оборота для графика.</p>';
 let sum=0;const total=sorted.reduce((s,x)=>s+Number(x.revenue),0),pts=['0,117'];
 sorted.forEach((x,i)=>{sum+=Number(x.revenue);pts.push(((i+1)*440/sorted.length).toFixed(1)+','+(117-107*sum/total).toFixed(1));});
 const na=sorted.filter(x=>x.baseClass==='A').length,nb=sorted.filter(x=>x.baseClass==='B').length;
 const xa=(na*440/sorted.length).toFixed(1),xb=((na+nb)*440/sorted.length).toFixed(1);
 return '<svg role="img" aria-label="Накопленная доля оборота по убыванию SKU" viewBox="0 0 460 143" style="display:block;width:100%;height:auto;max-height:180px"><rect width="'+xa+'" height="117" fill="#dcfce7" opacity=".6"/><rect x="'+xa+'" width="'+(xb-xa)+'" height="117" fill="#fef3c7" opacity=".6"/><line y1="117" y2="117" x1="0" x2="440" stroke="#999"/><polyline points="'+pts.join(' ')+'" stroke="#2563eb" stroke-width="2.6" fill="none"/><text x="3" y="136" fill="currentColor" font-size="11">SKU по убыванию оборота →</text></svg><div class="abc360-sub">Границы A/B/C определяются внутри выбранной товарной группы.</div>';
}
function render(info){
 const root=mount();if(!root)return;
 const groups=info.groups||[],items=info.items||[],cls={A:0,B:0,C:0,N:0,R:0},rev={A:0,B:0,C:0,N:0,R:0};
 items.forEach(x=>{if(Object.prototype.hasOwnProperty.call(cls,x.class)){cls[x.class]++;rev[x.class]+=Number(x.revenue)||0;}});
 const positive=rev.A+rev.B+rev.C+rev.N;
 const part=k=>positive>0?Math.max(0,100*rev[k]/positive):0;
 const risk=[],missing=[];items.filter(x=>x.class==='A').forEach(x=>{const st=warehouse(x);if(st&&st.qty<=1)risk.push({x,st});else if(!st)missing.push(x);});
 risk.sort((a,b)=>Number(b.x.revenue)-Number(a.x.revenue));
 const previous=new Map();
 try{
  const prev=abcAggregate(abcRowsFor(info.scope,info.manager,info.clientId,abcPeriodMonths(info.mode,1),info.group));
  prev.forEach(g=>g.items.forEach(x=>previous.set(g.group+'|'+x.key,x.class)));
 }catch(e){console.warn('ABC360 prior classes',e);}
 let falling=0,rising=0;
 items.forEach(x=>{const was=previous.get(x.group+'|'+x.key);if(was==='A'&&['B','C'].includes(x.class))falling++;if(['B','C'].includes(was)&&x.class==='A')rising++;});
 const top=groups.slice().sort((a,b)=>b.netTotal-a.netTotal).slice(0,5),max=Math.max(1,...top.map(g=>Math.max(0,g.netTotal)));
 const bars=['A','B','C','N'].map(k=>'<div style="width:'+part(k)+'%;background:'+colors[k]+'" title="'+k+': '+fmt(rev[k])+' BYN"></div>').join('');
 const legend=['A','B','C','N'].map(k=>'<span><i style="background:'+colors[k]+'"></i>'+k+' · '+percent(part(k))+' · '+fmt(cls[k])+' SKU</span>').join('');
 const tophtml=top.map(g=>'<div class="abc360-gr"><button data-abc-action="group" data-value="'+html(g.group)+'" title="Открыть группу">'+html(g.group)+'</button><div class="track"><div style="width:'+Math.max(0,100*g.netTotal/max)+'%"></div></div><b>'+fmt(g.netTotal)+'</b></div>').join('');
 const tile=(title,val,sub)=>'<div class="abc360-kpi"><small>'+html(title)+'</small><strong>'+html(val)+'</strong><em>'+html(sub)+'</em></div>';
 // Manager-specific ABC is loaded from the authoritative CRM RPC on selection;
 // never fabricate per-manager figures from a branch-wide aggregate.
 const isBoss=typeof currentProfile!=='undefined'&&currentProfile?.role==='boss';
 const managerOptions=[...(el('abc-manager')?.options||[])].filter(o=>o.value!=='all'&&!o.disabled).map(o=>({value:o.value,label:o.textContent||o.value}));
 const chosen=info.scope==='manager'?info.manager:'all';
 const quickManager=isBoss?'<div class="abc360-managerbar"><div><b>Управление ассортиментом менеджеров</b><div class="abc360-sub">Выберите менеджера — KPI, группы, ABC и остатки пересчитаются по его клиентам.</div></div><div class="abc360-managerlist" role="group" aria-label="Менеджеры ABC">'+
 [{value:'all',label:'Весь филиал'},...managerOptions].map(o=>'<button type="button" data-abc-action="manager" data-value="'+html(o.value)+'" aria-pressed="'+String(chosen===o.value)+'">'+html(o.label)+'</button>').join('')+'</div></div>':'';

 const risktext=risk.length?'У '+fmt(risk.length)+' SKU класса A остаток Витебска составляет 0–1 шт.':'Среди класса A с известными остатками нет позиций с уровнем 0–1 шт.';
 const brief='<div class="abc360-note"><label>Наличие · склад Витебск</label><b>'+risktext+'</b><div class="abc360-sub">Сигнал для проверки заказа, не автоматическое списание или заказ.</div></div>'+
 '<div class="abc360-note"><label>Изменения класса</label><b>'+fmt(falling)+' A→B/C · '+fmt(rising)+' B/C→A</b><div class="abc360-sub">Сравнение тех же SKU с предыдущим равным периодом.</div></div>'+
 '<div class="abc360-note"><label>Качество и возвраты</label><b>'+fmt(cls.R)+' R · '+fmt(missing.length)+' A без подтверждённого остатка</b><div class="abc360-sub">R означает нетто-оборот ≤ 0. Нет данных об остатке — не ноль.</div></div>';
 const right=info.group!=='all'?(svgCurve(groups[0])):'<div class="abc360-sub">Доли по положительному обороту SKU. Нетто-возвраты класса R показываются отдельно.</div><div class="abc360-stack">'+bars+'</div><div class="abc360-legend">'+legend+'</div><div class="abc360-sub" style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">ТОП-5 товарных групп по нетто-обороту, BYN</div>'+tophtml;
 const checks=groups.filter(g=>g.items.length!==Object.values(g.counts).reduce((s,n)=>s+Number(n||0),0));
 const warn=checks.length?'<div class="abc360-warn">В '+checks.length+' группах итог SKU не равен сумме A+B+C+N+R. Проверьте расчёт.</div>':'';
 const cards=risk.slice(0,3).map(z=>'<div class="abc360-risk"><b>'+html(z.x.product)+'</b><div class="abc360-sub">'+html(z.x.sku)+' · '+html(z.x.group)+'</div><div style="margin-top:7px"><b>Витебск: '+fmt(z.st.qty)+' шт.</b></div><div class="abc360-sub">Оборот: '+fmt(z.x.revenue)+' BYN'+(z.st.date?' · '+html(z.st.date):'')+'</div></div>').join('');
 root.innerHTML='<div class="abc360-head"><div><div class="abc360-title">ABC-анализ 360°</div><div class="abc360-sub">1С · с НДС · '+html(abcPeriodText(info.mode,0))+' · '+fmt(groups.length)+' групп</div></div><span class="abc360-sub">Данные CRM · без демонстрационных значений</span></div>'+
 quickManager+'<div class="abc360-kpis">'+tile('Нетто-оборот',fmt(info.net),'BYN · с НДС')+tile('Класс A',fmt(cls.A),'SKU · приоритет')+tile('Класс B',fmt(cls.B),'SKU · развитие')+tile('Класс C / N',fmt(cls.C)+' / '+fmt(cls.N),'SKU · в том числе новые')+tile('Класс R',fmt(cls.R),'SKU · возвраты и ≤ 0')+'</div>'+
 '<div class="abc360-two"><div class="abc360-panel"><h3>✦ ИИ · Директорский брифинг</h3>'+brief+'</div><div class="abc360-panel"><h3>'+(info.group==='all'?'Структура по классам':'Кривая ABC · '+html(info.group))+'</h3>'+right+'</div></div>'+
 (cards?'<div class="abc360-panel"><h3>Класс A · Проверить остатки Витебска</h3><div class="abc360-riskgrid">'+cards+'</div></div>':'')+warn+
 '<div class="abc360-actions"><button class="abc360-btn primary" id="abc360-expand" data-abc-action="details" aria-expanded="'+String(opened)+'">'+(opened?'Скрыть детали':'Раскрыть группы и SKU')+'</button><button class="abc360-btn" data-abc-action="class" data-value="A">Только A</button><button class="abc360-btn" data-abc-action="class" data-value="R">Проверить R</button><button class="abc360-btn" data-abc-action="tasks">Открыть задачи ИИ</button><button class="abc360-btn" data-abc-action="refresh">↻ Обновить</button></div>'+
 '<div class="abc360-sub">Итого '+fmt(items.length)+' SKU, включая '+fmt(cls.R)+' класса R. Раскрытие детальной таблицы и CSV-экспорт используют действующую логику CRM.</div>';
}
async function refresh(force){
 const page=el('page-abc'),n=++seq;
 if(!page?.classList.contains('active')||typeof window.crmFastAnalyticsEnsure!=='function')return;
 try{
  await window.crmFastAnalyticsEnsure('abc',!!force);
  if(n===seq&&page.classList.contains('active')&&typeof renderABC==='function')renderABC();
 }catch(e){
  if(n!==seq)return;
  const target=el('abc-quality');if(target)target.innerHTML='<div class="abc360-warn">Не удалось обновить ABC: '+html(e?.message||e)+'. Действующие данные не изменены.</div>';
 }
}
// Observe only the legacy ABC result container: the shared CRM engine stays unchanged.
function syncFromLegacy(){
 const page=el('page-abc');
 if(!page||!page.classList.contains('active'))return;
 try{
  const mode=el('abc-period')?.value||'90',group=el('abc-group')?.value||'all';
  const scope=el('abc-scope')?.value||'branch';
  let manager=el('abc-manager')?.value||'all';
  if(typeof currentProfile!=='undefined'&&currentProfile?.role!=='boss')manager=currentProfile?.name||'';
  const clientId=el('abc-client-id')?.value||'';
  if(scope==='client'&&!clientId){
   render({groups:[],items:[],net:0,mode,group,scope,manager,clientId});
   return;
  }
  const rows=abcRowsFor(scope,manager,clientId,abcPeriodMonths(mode,0),group);
  const groups=abcAggregate(rows),items=groups.flatMap(g=>g.items);
  const net=groups.reduce((total,g)=>total+Number(g.netTotal||0),0);
  render({groups,items,net,mode,group,scope,manager,clientId});
  // Explain R inside the original expandable groups without changing the CRM core.
  const cards=[...el('abc-results').querySelectorAll('.abc-group-card')];
  groups.forEach((g,i)=>{
   const node=cards[i]?.querySelector('.abc-head > div:last-child');
   if(node&&g.counts.R&&!node.querySelector('[data-abc360-r]')){
    node.insertAdjacentHTML('beforeend','<span class="abc-badge abc-R" data-abc360-r="1" title="Нетто-возвраты и оборот ≤ 0">R</span><span style="font-size:12px;padding-top:4px">'+fmt(g.counts.R)+'</span>');
   }
  });
  el('abc-results').querySelectorAll('span').forEach(node=>{
   if(node.textContent.trim()==='нет доступного')node.textContent='нет данных об остатке';
  });
 }catch(err){console.warn('ABC360: legacy section retained after visual error',err);}
}
function bind(){
 mount();
 const results=el('abc-results');
 if(results&&typeof MutationObserver!=='undefined'){
  const observer=new MutationObserver(()=>syncFromLegacy());
  observer.observe(results,{childList:true});
 }
 document.addEventListener('change',function(e){
  if(!el('page-abc')?.contains(e.target)||!['abc-period','abc-scope','abc-manager','abc-client-search'].includes(e.target.id))return;
  clearTimeout(filterTimer);filterTimer=setTimeout(()=>refresh(false),65);
 });
}
window.abc360DebouncedSearch=function(){clearTimeout(searchTimer);searchTimer=setTimeout(()=>{opened=true;openState();if(typeof renderABC==='function')renderABC();},150);};
window.RESANTA_ABC360={render,refresh};
window.RESANTA_ABC360_V1=Object.freeze({version:'20261109.2',readOnly:true,source:'existing ABC + 1C'});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();