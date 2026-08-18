/* RESANTA CRM v23.2.2 · MANAGER PLAN GAP SOURCES
 * Field managers only. Adds a truthful "Где взять недостающее" explanation
 * after the boss calculates an AI plan in v23.2.1.
 * No DB writes. Does not change plan, forecast, AKB or existing business logic.
 */
(function(){
'use strict';
if(window.RESANTA_MANAGER_GAP_SOURCES_V2322)return;

const VERSION='v23.2.2-manager-gap-sources';
const BLOCK_ID='manager-gap-sources-v2322';
const MONTHS_RU=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
let observer=null;
let timer=0;

const num=v=>Number(v)||0;
const money=v=>Math.round(num(v)).toLocaleString('ru-RU')+' BYN';
const norm=v=>String(v||'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();
const escLocal=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function ym(v){return String(v||'').slice(0,7);}
function shiftMonth(month,delta){
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return '';
  const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+delta,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function sameManager(a,b){
  const x=String(a||'').trim(),y=String(b||'').trim();
  if(!x||!y)return false;
  try{return typeof managerLooseMatch==='function'?managerLooseMatch(x,y):norm(x)===norm(y);}catch(_){return norm(x)===norm(y);}
}
function clientKey(v){
  try{if(typeof canonicalSalesClientName==='function')return canonicalSalesClientName(v)||norm(v);}catch(_){}
  try{if(typeof normalizeClientName==='function')return normalizeClientName(v)||norm(v);}catch(_){}
  return norm(v);
}
function monthText(m){const i=Number(String(m||'').slice(5,7))-1;return MONTHS_RU[i]||m;}
function parseMoneyText(v){
  const s=String(v||'').replace(/\u00a0/g,' ').replace(/[^0-9,.-]+/g,'').replace(',','.');
  return Number(s)||0;
}
function extractPlanForecast(root){
  const text=String(root?.innerText||'').replace(/\u00a0/g,' ');
  const planM=text.match(/Рекомендуемый план продаж\s*([\d\s]+)\s*BYN/i);
  let forecastM=text.match(/Прогноз:\s*([\d\s]+)\s*BYN/i);
  if(!forecastM)forecastM=text.match(/прогноз с резервом:\s*([\d\s]+)\s*BYN/i);
  if(!forecastM)forecastM=text.match(/Подтвержд[её]нный потенциал:\s*([\d\s]+)\s*BYN/i);
  const plan=planM?parseMoneyText(planM[1]):0;
  const forecast=forecastM?parseMoneyText(forecastM[1]):0;
  return {plan,forecast,gap:Math.max(0,plan-forecast)};
}
function clientVariants(c){
  const out=new Set();
  if(!c)return out;
  [c.name,c.code_1c,c.client_code].filter(Boolean).forEach(v=>{const k=clientKey(v);if(k)out.add(k);});
  try{(clientNameVariants(c)||[]).forEach(v=>{const k=clientKey(v);if(k)out.add(k);});}catch(_){}
  try{
    (allClientAliases||[]).filter(a=>String(a.client_id||'')===String(c.id||'')).forEach(a=>{
      [a.alias,a.alias_name,a.name].filter(Boolean).forEach(v=>{const k=clientKey(v);if(k)out.add(k);});
    });
  }catch(_){}
  return out;
}
function currentOwnership(manager){
  const clients=(allClients||[]).filter(c=>{
    if(c?.is_archived)return false;
    const mgr=String(c?.manager_name||'').trim();
    if(!mgr||!sameManager(mgr,manager))return false;
    const text=String(c?.name||'')+' '+String(c?.region||'');
    return !/(триовист|21vek)/i.test(text);
  });
  const idMap=new Map(),nameMap=new Map();
  clients.forEach(c=>{
    if(c.id)idMap.set(String(c.id),c);
    clientVariants(c).forEach(k=>{
      if(!nameMap.has(k))nameMap.set(k,c);
      else if(nameMap.get(k)!==c)nameMap.set(k,null);
    });
  });
  return {clients,idMap,nameMap};
}
function resolveClient(row,o){
  if(row?.client_id&&o.idMap.has(String(row.client_id)))return o.idMap.get(String(row.client_id));
  const k=clientKey(row?.client_name);
  const c=k?o.nameMap.get(k):null;
  return c||null;
}
function productKey(r){return String(r?.sku||r?.product||r?.subgroup||r?.category||'').trim();}
function productLabel(r){
  const sku=String(r?.sku||'').trim(),p=String(r?.product||'').trim();
  if(sku&&p)return sku+' · '+p;
  return sku||p||String(r?.subgroup||r?.category||'').trim()||'Товар';
}
function getAnalysisMonths(targetMonth){
  const currentMonth=String(typeof TODAY!=='undefined'?TODAY:new Date().toISOString()).slice(0,7);
  const lastClosed=shiftMonth(currentMonth,-1);
  const prevTarget=shiftMonth(targetMonth,-1);
  const end=prevTarget&&prevTarget<lastClosed?prevTarget:lastClosed;
  const recent=[end,shiftMonth(end,-1),shiftMonth(end,-2)].filter(Boolean).reverse();
  const older=[shiftMonth(end,-5),shiftMonth(end,-4),shiftMonth(end,-3)].filter(Boolean);
  return {end,recent,older,all:[...older,...recent]};
}
function stateFor(map,c){
  const id=String(c.id||clientKey(c.name));
  if(!map.has(id))map.set(id,{id,client:c,name:String(c.name||'Клиент'),months:new Map(),products:new Map()});
  return map.get(id);
}
function sumMonths(st,months){return months.reduce((s,m)=>s+num(st.months.get(m)),0);}
function avgMonths(st,months){return months.length?sumMonths(st,months)/months.length:0;}
function buildFacts(manager,targetMonth){
  const o=currentOwnership(manager);
  const periods=getAnalysisMonths(targetMonth);
  const wanted=new Set(periods.all);
  const map=new Map();
  (allPurchaseHistory||[]).forEach(r=>{
    const m=ym(r.month);if(!wanted.has(m))return;
    const c=resolveClient(r,o);if(!c)return;
    const st=stateFor(map,c),rev=num(r.revenue);
    st.months.set(m,num(st.months.get(m))+rev);
    const pk=productKey(r);
    if(pk){
      if(!st.products.has(pk))st.products.set(pk,{key:pk,label:productLabel(r),older:0,recent:0});
      const p=st.products.get(pk);
      if(periods.older.includes(m))p.older+=rev;
      if(periods.recent.includes(m))p.recent+=rev;
    }
  });
  o.clients.forEach(c=>stateFor(map,c));
  return {ownership:o,periods,states:[...map.values()]};
}
function analyseSources(manager,targetMonth,gap){
  const {ownership,periods,states}=buildFacts(manager,targetMonth);
  const noise=Math.max(100,Math.min(500,gap*0.003));
  const falling=[],lost=[],skuLost=[];
  const classified=new Set();

  states.forEach(st=>{
    const oldAvg=avgMonths(st,periods.older),recentAvg=avgMonths(st,periods.recent);
    if(oldAvg<noise)return;
    if(recentAvg<=1){
      lost.push({type:'lost',client:st.name,potential:oldAvg,oldAvg,recentAvg:0});
      classified.add(st.id);return;
    }
    if(recentAvg<oldAvg*0.80){
      falling.push({type:'falling',client:st.name,potential:Math.max(0,oldAvg-recentAvg),oldAvg,recentAvg});
      classified.add(st.id);
    }
  });

  states.forEach(st=>{
    if(classified.has(st.id))return;
    const positive=[...st.products.values()].filter(p=>p.older>0).sort((a,b)=>b.older-a.older);
    const total=positive.reduce((s,p)=>s+p.older,0);if(total<=0)return;
    let cum=0,clientRaw=0;const items=[];
    for(const p of positive){
      if(cum/total>=0.80)break;
      cum+=p.older;
      const monthly=p.older/Math.max(1,periods.older.length);
      if(p.recent<=1&&monthly>=noise*0.45){items.push({label:p.label,potential:monthly});clientRaw+=monthly;}
    }
    if(!items.length)return;
    const oldAvg=avgMonths(st,periods.older),recentAvg=avgMonths(st,periods.recent);
    const cap=Math.max(oldAvg,recentAvg,1)*0.20;
    let left=Math.min(clientRaw,cap);
    items.sort((a,b)=>b.potential-a.potential);
    for(const it of items){
      if(left<=0)break;
      const use=Math.min(it.potential,left);left-=use;
      skuLost.push({type:'sku',client:st.name,label:it.label,potential:use});
    }
  });

  falling.sort((a,b)=>b.potential-a.potential);
  lost.sort((a,b)=>b.potential-a.potential);
  skuLost.sort((a,b)=>b.potential-a.potential);
  const sum=a=>a.reduce((s,x)=>s+x.potential,0);
  const fallingTotal=sum(falling),lostTotal=sum(lost),skuTotal=sum(skuLost);
  const total=fallingTotal+lostTotal+skuTotal;
  const activeRecent=new Set();
  states.forEach(st=>{if(avgMonths(st,periods.recent)>1)activeRecent.add(st.id);});
  const potentialClients=ownership.clients.filter(c=>{
    const id=String(c.id||clientKey(c.name));
    const status=String(c.client_status||'').toLowerCase();
    return status==='потенциальный'&&!activeRecent.has(id);
  });
  return {periods,falling,lost,skuLost,fallingTotal,lostTotal,skuTotal,total,potentialClients,uncovered:Math.max(0,gap-total)};
}
function itemsHtml(items,type){
  if(!items.length)return '<div style="font-size:11px;color:var(--sub);margin-top:5px">Подтверждённых кандидатов не найдено.</div>';
  return '<div style="margin-top:6px;display:grid;gap:4px">'+items.slice(0,6).map(x=>{
    let why='';
    if(type==='falling')why='было '+money(x.oldAvg)+'/мес → сейчас '+money(x.recentAvg)+'/мес';
    else if(type==='lost')why='раньше '+money(x.oldAvg)+'/мес → последние 3 мес. 0';
    else why=x.label;
    return '<div style="display:flex;justify-content:space-between;gap:10px;border-top:1px dashed var(--border);padding-top:4px"><span><b>'+escLocal(x.client)+'</b><span style="display:block;color:var(--sub);font-size:10px">'+escLocal(why)+'</span></span><b style="white-space:nowrap">+'+money(x.potential)+'</b></div>';
  }).join('')+'</div>';
}
function category(title,total,count,items,type){
  return '<details style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:8px 10px" '+(total>0?'open':'')+'><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:8px"><span><b>'+escLocal(title)+'</b> <span style="color:var(--sub);font-size:10px">('+count+')</span></span><b>'+money(total)+'</b></summary>'+itemsHtml(items,type)+'</details>';
}
function renderGap(){
  const root=document.getElementById('manager-ai-plan-result-v2320');
  if(!root)return;
  const pf=extractPlanForecast(root);
  if(!pf.plan||!pf.forecast)return;
  const manager=document.getElementById('manager-plan-name')?.value||'';
  const targetMonth=ym(document.getElementById('manager-plan-month')?.value||'');
  if(!manager||!targetMonth)return;
  const sig=[manager,targetMonth,Math.round(pf.plan),Math.round(pf.forecast),(allPurchaseHistory||[]).length].join('|');
  const old=document.getElementById(BLOCK_ID);
  if(old?.dataset?.sig===sig)return;
  if(old)old.remove();

  const box=document.createElement('div');box.id=BLOCK_ID;box.dataset.sig=sig;
  box.style.cssText='margin-top:12px;border:1px solid #BFDBFE;background:#EFF6FF;border-radius:10px;padding:11px 12px;color:var(--text)';
  if(pf.gap<=0){
    box.innerHTML='<div style="font-weight:800;color:var(--g)">🎯 Где взять недостающее</div><div style="font-size:11px;margin-top:4px;color:var(--sub)">Текущий прогноз уже покрывает утверждаемую бизнес-цель. Денежного разрыва сейчас нет.</div>';
    root.appendChild(box);return;
  }
  try{
    const a=analyseSources(manager,targetMonth,pf.gap);
    const coverage=pf.gap>0?Math.min(999,Math.round(a.total/pf.gap*100)):100;
    const period=a.periods.older.length&&a.periods.recent.length
      ?monthText(a.periods.older[0])+'–'+monthText(a.periods.older[a.periods.older.length-1])+' против '+monthText(a.periods.recent[0])+'–'+monthText(a.periods.recent[a.periods.recent.length-1])
      :'';
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-weight:800;color:var(--at)">🎯 Где взять недостающее</div><div style="font-size:11px;color:var(--sub);margin-top:3px">Разрыв план–прогноз: <b>'+money(pf.gap)+'</b>. CRM ищет резерв только в текущей закреплённой базе, без Триовиста и без двойного счёта клиентов.</div></div><div style="text-align:right"><div style="font-size:10px;color:var(--sub);text-transform:uppercase">Найденный резерв</div><div style="font-size:18px;font-weight:800">'+money(a.total)+'</div><div style="font-size:10px;color:var(--sub)">покрытие разрыва '+coverage+'%</div></div></div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:7px">Сравнение: '+escLocal(period)+'. Суммы ниже — потенциал возврата к уже достигнутому факту, а не гарантия продажи.</div>'
      +'<div style="display:grid;gap:7px;margin-top:9px">'
        +category('Просевшие действующие клиенты',a.fallingTotal,a.falling.length,a.falling,'falling')
        +category('Выпавшие клиенты',a.lostTotal,a.lost.length,a.lost,'lost')
        +category('Потерянные A-SKU у активных клиентов',a.skuTotal,a.skuLost.length,a.skuLost,'sku')
      +'</div>'
      +(a.uncovered>0?'<div style="margin-top:8px;padding:8px 9px;border-radius:8px;background:#FFFBEB;border:1px solid #FDE68A;color:#92400E"><b>Ещё не обеспечено данными: '+money(a.uncovered)+'.</b> Этот остаток нельзя честно приписать существующим клиентам — его нужно закрывать новым оборотом/новыми клиентами.</div>':'<div style="margin-top:8px;padding:8px 9px;border-radius:8px;background:#F0FDF4;border:1px solid #BBF7D0;color:#166534"><b>✅ В текущей базе найден резерв, достаточный для покрытия разрыва.</b> Руководитель всё равно выбирает, какие возможности реально брать в работу.</div>')
      +'<div style="margin-top:8px;font-size:11px"><b>Новые/потенциальные без свежих продаж:</b> '+a.potentialClients.length+' клиентов. Денежную сумму по ним CRM намеренно не рисует без факта.'+(a.potentialClients.length?' <span style="color:var(--sub)">Первые: '+a.potentialClients.slice(0,5).map(c=>escLocal(c.name)).join(', ')+'</span>':'')+'</div>';
    root.appendChild(box);
  }catch(e){
    console.warn(VERSION,e);
    box.innerHTML='<div style="font-weight:800;color:var(--am)">🎯 Где взять недостающее</div><div style="font-size:11px;margin-top:4px">Не удалось безопасно разложить разрыв по клиентам: '+escLocal(e?.message||e)+'. Сам план и прогноз не изменены.</div>';
    root.appendChild(box);
  }
}
function schedule(){clearTimeout(timer);timer=setTimeout(renderGap,120);}
function hook(){
  const root=document.getElementById('manager-ai-plan-result-v2320');
  if(!root){setTimeout(hook,500);return;}
  if(observer)observer.disconnect();
  observer=new MutationObserver(schedule);
  observer.observe(root,{childList:true,subtree:true,characterData:true});
  schedule();
}
function boot(){
  const modal=document.getElementById('modal-manager-plan');
  if(!modal){setTimeout(boot,500);return;}
  new MutationObserver(()=>{if(modal.classList.contains('open'))setTimeout(hook,50);}).observe(modal,{attributes:true,attributeFilter:['class']});
  modal.addEventListener('change',e=>{if(e.target?.id==='manager-plan-name'||e.target?.id==='manager-plan-month')setTimeout(hook,80);});
  if(modal.classList.contains('open'))hook();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_MANAGER_GAP_SOURCES_V2322=Object.freeze({version:VERSION,noDbWrites:true,noPlanChanges:true,noForecastChanges:true,noDoubleCountByClient:true,triovistExcluded:true});
})();