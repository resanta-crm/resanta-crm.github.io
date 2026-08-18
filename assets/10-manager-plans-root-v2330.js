/* RESANTA CRM v23.3.0 · MANAGER PLANS ROOT CONTROLLER
 * One stable controller for field-manager plans:
 * - robust DB save without duplicate-key failures
 * - direct post-calculation "Где взять недостающее"
 * - one visible release version
 * - no changes to GPS, routes, Triovist, payments or other CRM logic
 */
(function(){
'use strict';
if(window.RESANTA_MANAGER_PLANS_ROOT_V2330)return;

const RELEASE='v23.3.0';
const GAP_ID='manager-gap-sources-v2330';
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
function clientVariants(c){
  const out=new Set(); if(!c)return out;
  [c.name,c.code_1c,c.client_code].filter(Boolean).forEach(v=>{const k=clientKey(v);if(k)out.add(k);});
  try{(clientNameVariants(c)||[]).forEach(v=>{const k=clientKey(v);if(k)out.add(k);});}catch(_){}
  try{(allClientAliases||[]).filter(a=>String(a.client_id||'')===String(c.id||'')).forEach(a=>[a.alias,a.alias_name,a.name].filter(Boolean).forEach(v=>{const k=clientKey(v);if(k)out.add(k);}));}catch(_){}
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
  const k=clientKey(row?.client_name); return k?(o.nameMap.get(k)||null):null;
}
function getPeriods(targetMonth){
  const current=String(typeof TODAY!=='undefined'?TODAY:new Date().toISOString()).slice(0,7);
  const lastClosed=shiftMonth(current,-1);
  const beforeTarget=shiftMonth(targetMonth,-1);
  const end=beforeTarget&&beforeTarget<lastClosed?beforeTarget:lastClosed;
  const recent=[shiftMonth(end,-2),shiftMonth(end,-1),end].filter(Boolean);
  const older=[shiftMonth(end,-5),shiftMonth(end,-4),shiftMonth(end,-3)].filter(Boolean);
  return {recent,older,all:[...older,...recent]};
}
function stateFor(map,c){
  const id=String(c.id||clientKey(c.name));
  if(!map.has(id))map.set(id,{id,client:c,name:String(c.name||'Клиент'),months:new Map(),products:new Map()});
  return map.get(id);
}
function avgMonths(st,months){return months.length?months.reduce((s,m)=>s+num(st.months.get(m)),0)/months.length:0;}
function productKey(r){return String(r?.sku||r?.product||r?.subgroup||r?.category||'').trim();}
function productLabel(r){
  const sku=String(r?.sku||'').trim(),p=String(r?.product||'').trim();
  return sku&&p?sku+' · '+p:(sku||p||String(r?.subgroup||r?.category||'').trim()||'Товар');
}
function buildFacts(manager,targetMonth){
  const ownership=currentOwnership(manager),periods=getPeriods(targetMonth),wanted=new Set(periods.all),map=new Map();
  (allPurchaseHistory||[]).forEach(r=>{
    const m=ym(r.month); if(!wanted.has(m))return;
    const c=resolveClient(r,ownership); if(!c)return;
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
  ownership.clients.forEach(c=>stateFor(map,c));
  return {ownership,periods,states:[...map.values()]};
}
function analyseGap(manager,targetMonth,gap){
  const {ownership,periods,states}=buildFacts(manager,targetMonth);
  const noise=Math.max(100,Math.min(500,gap*0.003));
  const falling=[],lost=[],skuLost=[],classified=new Set();
  states.forEach(st=>{
    const oldAvg=avgMonths(st,periods.older),recentAvg=avgMonths(st,periods.recent);
    if(oldAvg<noise)return;
    if(recentAvg<=1){lost.push({client:st.name,potential:oldAvg,oldAvg,recentAvg:0});classified.add(st.id);return;}
    if(recentAvg<oldAvg*0.80){falling.push({client:st.name,potential:Math.max(0,oldAvg-recentAvg),oldAvg,recentAvg});classified.add(st.id);}
  });
  states.forEach(st=>{
    if(classified.has(st.id))return;
    const positive=[...st.products.values()].filter(p=>p.older>0).sort((a,b)=>b.older-a.older);
    const total=positive.reduce((s,p)=>s+p.older,0); if(total<=0)return;
    let cum=0,raw=0; const items=[];
    for(const p of positive){
      if(cum/total>=0.80)break;
      cum+=p.older;
      const monthly=p.older/Math.max(1,periods.older.length);
      if(p.recent<=1&&monthly>=noise*0.45){items.push({label:p.label,potential:monthly});raw+=monthly;}
    }
    if(!items.length)return;
    const cap=Math.max(avgMonths(st,periods.older),avgMonths(st,periods.recent),1)*0.20;
    let left=Math.min(raw,cap);
    for(const it of items.sort((a,b)=>b.potential-a.potential)){
      if(left<=0)break;
      const use=Math.min(it.potential,left);left-=use;
      skuLost.push({client:st.name,label:it.label,potential:use});
    }
  });
  falling.sort((a,b)=>b.potential-a.potential);lost.sort((a,b)=>b.potential-a.potential);skuLost.sort((a,b)=>b.potential-a.potential);
  const sum=a=>a.reduce((s,x)=>s+x.potential,0),fallingTotal=sum(falling),lostTotal=sum(lost),skuTotal=sum(skuLost),total=fallingTotal+lostTotal+skuTotal;
  const activeRecent=new Set();states.forEach(st=>{if(avgMonths(st,periods.recent)>1)activeRecent.add(st.id);});
  const potentialClients=ownership.clients.filter(c=>String(c.client_status||'').toLowerCase()==='потенциальный'&&!activeRecent.has(String(c.id||clientKey(c.name))));
  return {falling,lost,skuLost,fallingTotal,lostTotal,skuTotal,total,potentialClients,uncovered:Math.max(0,gap-total)};
}
function parseMoneyChunk(s){return Number(String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,'').replace(',','.'))||0;}
function extractPlanForecast(){
  const root=document.getElementById('manager-ai-plan-result-v2320');if(!root)return null;
  const text=String(root.innerText||'').replace(/\u00a0/g,' ');
  const p=text.match(/Рекомендуемый план продаж[\s\S]{0,120}?([\d\s]+)\s*BYN/i);
  const f=text.match(/Прогноз:\s*([\d\s]+)\s*BYN/i)||text.match(/прогноз с резервом:\s*([\d\s]+)\s*BYN/i)||text.match(/Подтвержд[её]нный потенциал:\s*([\d\s]+)\s*BYN/i);
  const plan=p?parseMoneyChunk(p[1]):0,forecast=f?parseMoneyChunk(f[1]):0;
  return {root,plan,forecast,gap:Math.max(0,plan-forecast)};
}
function itemRows(items,type){
  if(!items.length)return '<div style="font-size:11px;color:var(--sub);margin-top:5px">Подтверждённых кандидатов не найдено.</div>';
  return '<div style="display:grid;gap:4px;margin-top:6px">'+items.slice(0,8).map(x=>{
    const why=type==='falling'?'было '+money(x.oldAvg)+'/мес → сейчас '+money(x.recentAvg)+'/мес':type==='lost'?'раньше '+money(x.oldAvg)+'/мес → последние 3 мес. 0':x.label;
    return '<div style="display:flex;justify-content:space-between;gap:10px;border-top:1px dashed var(--border);padding-top:4px"><span><b>'+escLocal(x.client)+'</b><span style="display:block;color:var(--sub);font-size:10px">'+escLocal(why)+'</span></span><b style="white-space:nowrap">+'+money(x.potential)+'</b></div>';
  }).join('')+'</div>';
}
function cat(title,total,items,type){return '<details open style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:8px 10px"><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:8px"><span><b>'+escLocal(title)+'</b> <span style="font-size:10px;color:var(--sub)">('+items.length+')</span></span><b>'+money(total)+'</b></summary>'+itemRows(items,type)+'</details>';}
function renderGap(){
  const pf=extractPlanForecast(); if(!pf||!pf.plan)return;
  const manager=document.getElementById('manager-plan-name')?.value||'',targetMonth=ym(document.getElementById('manager-plan-month')?.value||'');
  if(!manager||!targetMonth)return;
  document.getElementById(GAP_ID)?.remove();
  const box=document.createElement('div');box.id=GAP_ID;box.style.cssText='margin-top:12px;border:1px solid #BFDBFE;background:#EFF6FF;border-radius:10px;padding:11px 12px;color:var(--text)';
  if(pf.gap<=0){box.innerHTML='<div style="font-weight:800;color:var(--g)">🎯 Где взять недостающее</div><div style="font-size:11px;margin-top:4px">Текущий прогноз уже покрывает план. Денежного разрыва нет.</div>';pf.root.appendChild(box);return;}
  try{
    const a=analyseGap(manager,targetMonth,pf.gap),coverage=Math.min(999,Math.round(a.total/pf.gap*100));
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div style="font-weight:800;color:var(--at)">🎯 Где взять недостающее</div><div style="font-size:11px;color:var(--sub);margin-top:3px">Разрыв план–прогноз: <b>'+money(pf.gap)+'</b>. Только текущая закреплённая база полевого менеджера; Триовист исключён.</div></div><div style="text-align:right"><div style="font-size:10px;color:var(--sub)">НАЙДЕННЫЙ РЕЗЕРВ</div><div style="font-size:18px;font-weight:800">'+money(a.total)+'</div><div style="font-size:10px;color:var(--sub)">покрытие '+coverage+'%</div></div></div>'
      +'<div style="display:grid;gap:7px;margin-top:9px">'+cat('Просевшие действующие клиенты',a.fallingTotal,a.falling,'falling')+cat('Выпавшие клиенты',a.lostTotal,a.lost,'lost')+cat('Потерянные A-SKU у активных клиентов',a.skuTotal,a.skuLost,'sku')+'</div>'
      +(a.uncovered>0?'<div style="margin-top:8px;padding:8px 9px;border-radius:8px;background:#FFFBEB;border:1px solid #FDE68A;color:#92400E"><b>Ещё не обеспечено данными: '+money(a.uncovered)+'.</b> Остаток нужно закрывать новым оборотом/новыми клиентами.</div>':'<div style="margin-top:8px;padding:8px 9px;border-radius:8px;background:#F0FDF4;border:1px solid #BBF7D0;color:#166534"><b>✅ В текущей базе найден резерв для покрытия разрыва.</b></div>')
      +'<div style="font-size:11px;margin-top:8px"><b>Потенциальные без свежих продаж:</b> '+a.potentialClients.length+' клиентов. BYN по ним не выдумывается без факта.</div>';
  }catch(e){box.innerHTML='<b>🎯 Где взять недостающее</b><div style="font-size:11px;margin-top:4px;color:var(--am)">Не удалось безопасно разложить разрыв: '+escLocal(e?.message||e)+'</div>';}
  pf.root.appendChild(box);
}
function canonicalPeriod(raw){const m=ym(raw);return /^\d{4}-(0[1-9]|1[0-2])$/.test(m)?m+'-01':'';}
async function savePlanRoot(){
  if(currentProfile?.role!=='boss')return;
  const manager_name=String(document.getElementById('manager-plan-name')?.value||'').trim(),month_key=ym(document.getElementById('manager-plan-month')?.value||''),period_month=canonicalPeriod(month_key);
  const shipment_plan=promoNum(document.getElementById('manager-plan-shipment')?.value),akb_plan=Math.round(promoNum(document.getElementById('manager-plan-akb')?.value)),new_clients_plan=Math.round(promoNum(document.getElementById('manager-plan-new-clients')?.value)),note=String(document.getElementById('manager-plan-note')?.value||'').trim()||null;
  if(!manager_name||!period_month){alert('Выберите корректного менеджера и месяц');return;}
  const row={manager_name,period_month,shipment_plan,akb_plan,new_clients_plan,note,updated_by:currentProfile?.name||null,updated_at:new Date().toISOString()};
  let data=null,error=null;
  const q=await db.from('manager_kpi_plans').select('*').eq('period_month',period_month);
  if(q.error){alert('Не удалось проверить существующий план: '+q.error.message);return;}
  let found=(q.data||[]).find(x=>sameManager(x.manager_name,manager_name));
  if(found?.id){({data,error}=await db.from('manager_kpi_plans').update(row).eq('id',found.id).select().single());}
  else{
    ({data,error}=await db.from('manager_kpi_plans').insert({...row,created_by:currentProfile?.name||null}).select().single());
    if(error&&String(error.code||'')==='23505'){
      const retry=await db.from('manager_kpi_plans').select('*').eq('period_month',period_month);
      found=(retry.data||[]).find(x=>sameManager(x.manager_name,manager_name));
      if(found?.id)({data,error}=await db.from('manager_kpi_plans').update(row).eq('id',found.id).select().single());
    }
  }
  if(error||!data){alert('Не удалось сохранить план: '+(error?.message||'не получена сохранённая запись'));return;}
  const list=Array.isArray(allManagerKpiPlans)?allManagerKpiPlans:[];let replaced=false;
  allManagerKpiPlans=list.map(x=>{const ok=sameManager(x.manager_name,manager_name)&&ym(x.period_month)===month_key;if(ok){replaced=true;return data;}return x;});
  if(!replaced)allManagerKpiPlans=[data,...allManagerKpiPlans];
  closeModal('modal-manager-plan');if(typeof renderManagers==='function')renderManagers();
}
function markRelease(){
  const root=document.getElementById('manager-ai-plan-v2320');if(!root)return;
  const span=[...root.querySelectorAll('span')].find(x=>/^v23\./.test(String(x.textContent||'').trim()));if(span)span.textContent=RELEASE;
}
function install(){
  try{window.saveManagerKpiPlan=savePlanRoot;saveManagerKpiPlan=savePlanRoot;}catch(_){window.saveManagerKpiPlan=savePlanRoot;}
  const base=window.crmCalculateManagerAiPlanV2320;
  if(typeof base==='function'&&!base.__v2330){
    const wrapped=async function(){const out=await base.apply(this,arguments);markRelease();setTimeout(renderGap,0);return out;};wrapped.__v2330=true;window.crmCalculateManagerAiPlanV2320=wrapped;try{crmCalculateManagerAiPlanV2320=wrapped;}catch(_){}
  }
  markRelease();
}
function boot(){
  const style=document.createElement('style');style.textContent='#manager-gap-sources-v2322{display:none!important}';document.head.appendChild(style);
  install();
  const modal=document.getElementById('modal-manager-plan');
  if(modal)new MutationObserver(()=>{if(modal.classList.contains('open'))setTimeout(()=>{install();markRelease();},30);}).observe(modal,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{const b=e.target?.closest?.('button');if(b&&String(b.getAttribute('onclick')||'').includes('crmCalculateManagerAiPlanV2320')){setTimeout(()=>{markRelease();renderGap();},700);}});
  setTimeout(install,500);setTimeout(install,1800);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_MANAGER_PLANS_ROOT_V2330=Object.freeze({release:RELEASE,robustSave:true,gapAfterCalculation:true,triovistExcluded:true,noDbSchemaChanges:true});
})();

/* v23.4.8 · permanent cache-safe Triovist AI bootstrap.
 * 09-manager-kpi-save-fix loads this file with Date.now(), so this bootstrap
 * works even when a browser still has an older index.html cached.
 */
(function loadTriovistAiCacheSafeV2348(){
  if(window.RESANTA_TRIOVIST_AI_PLANS_V2348||document.querySelector('script[data-triovist-ai-cache-safe-v2348]'))return;
  const x=document.createElement('script');
  x.src='./assets/11-triovist-ai-plans-v2348.js?_='+Date.now();
  x.async=false;
  x.dataset.triovistAiCacheSafeV2348='1';
  x.onerror=()=>console.warn('Triovist AI v23.4.8 failed to load; base CRM remains available.');
  document.head.appendChild(x);
  window.RESANTA_TRIOVIST_AI_CACHE_SAFE_LOADER_V2348=Object.freeze({version:'v23.4.8',noCache:true});
})();
