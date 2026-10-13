/* RESANTA CRM v23.6.338 · FAST SALES ANALYTICS
 * Sales page uses one server aggregate instead of downloading full purchase_history.
 * Business figures and filters are preserved; full history remains available to ABC/VIP/Falling/AI.
 */
(function(){
'use strict';
if(window.RESANTA_SALES_FAST_V236338)return;
const V='v23.6.338',TTL=60000;
const cache=new Map();
let flight=null,lastKey='';

function active(){try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'')}catch(_){return''}}
function escFast(v){return String(v==null?'':v).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
function num(v){return Number(v)||0}
function money(v){try{return num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}catch(_){return String(num(v))}}
function selectedManager(){
  const boss=currentProfile?.role==='boss';
  if(!boss)return String(currentProfile?.name||'').trim()||'all';
  return String(window.salesMgrFilter||globalThis.salesMgrFilter||'all');
}
function selectedYear(){return String(window.salesYear||globalThis.salesYear||'2026')}
function key(){return selectedYear()+'|'+selectedManager()+'|'+String(currentProfile?.id||currentProfile?.name||'')}

function staticShell(){
  const isBoss=currentProfile?.role==='boss',myName=currentProfile?.name;
  try{
    const freshness=document.getElementById('sales-freshness');
    if(freshness&&typeof salesFreshnessBanner==='function')freshness.innerHTML=salesFreshnessBanner();
  }catch(_){}
  const chips=document.getElementById('sh-mgr-chips');
  if(chips)chips.style.display=isBoss?'flex':'none';

  const myClients=isBoss?(allClients||[]):(allClients||[]).filter(c=>c.manager_name===myName);
  const total=myClients.length,rev=myClients.reduce((s,c)=>s+num(c.revenue_total),0),activeClients=myClients.filter(c=>num(c.revenue_total)>0).length;
  const a=document.getElementById('s-total'),b=document.getElementById('s-rev'),d=document.getElementById('s-active');
  if(a)a.textContent=total;if(b)b.textContent=money(rev);if(d)d.textContent=activeClients;

  const top=document.getElementById('sales-top');
  if(top)top.innerHTML=myClients.slice().sort((x,y)=>num(y.revenue_total)-num(x.revenue_total)).slice(0,15).map((c,i)=>
    '<tr class="tbl-tap" onclick="openClient(\''+String(c.id).replace(/'/g,"\\'")+'\')"><td>'+(i+1)+'</td><td>'+escFast(c.name)+'</td><td>'+(typeof regionTag==='function'?regionTag(c.region):escFast(c.region||'—'))+'</td><td style="font-weight:600">'+money(c.revenue_total)+'</td></tr>'
  ).join('');
}

function setLoading(text){
  const e=document.getElementById('sh-empty'),body=document.getElementById('sh-body');
  if(e){e.style.display='block';e.textContent=text||'Загружаю продажи 1С…';}
  if(body)body.style.display='none';
}
function renderData(data){
  if(active()!=='sales'||!data)return;
  const empty=document.getElementById('sh-empty'),body=document.getElementById('sh-body');
  const months=Array.isArray(data.months)?data.months:[],cats=Array.isArray(data.categories)?data.categories:[],regs=Array.isArray(data.regions)?data.regions:[];
  if(!months.length&&!cats.length){
    if(empty){empty.style.display='block';empty.textContent='Нет данных за '+selectedYear()+' год'+(selectedManager()!=='all'?' по менеджеру '+selectedManager():'')+'.';}
    if(body)body.style.display='none';
    return;
  }
  if(empty)empty.style.display='none';if(body)body.style.display='block';

  const byMonth=new Map(months.map(x=>[String(x.month),x]));
  const names=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const year=selectedYear(),keys=Array.from({length:12},(_,i)=>year+'-'+String(i+1).padStart(2,'0'));
  const maxM=Math.max(1,...keys.map(k=>num(byMonth.get(k)?.revenue)));
  const mr=document.getElementById('sh-months');
  if(mr)mr.innerHTML=keys.map((m,i)=>{
    const x=byMonth.get(m)||{},v=num(x.revenue),akb=num(x.akb);
    return '<div class="bar-row"><div class="bar-head"><span>'+names[i]+' '+year+(akb?' <span class="tag tag-gray" style="font-size:10px">АКБ '+akb+'</span>':'')+'</span><span style="font-weight:600">'+money(v)+' BYN</span></div><div class="bar-bg"><div class="bar-fill" style="width:'+Math.round(v/maxM*100)+'%"></div></div></div>';
  }).join('');

  const maxC=Math.max(1,...cats.map(x=>num(x.revenue)));
  const cr=document.getElementById('sh-categories');
  if(cr)cr.innerHTML=cats.map(x=>'<div class="bar-row"><div class="bar-head"><span>'+escFast(x.category||'Без категории')+'</span><span style="font-weight:600">'+money(x.revenue)+' BYN</span></div><div class="bar-bg"><div class="bar-fill" style="width:'+Math.round(num(x.revenue)/maxC*100)+'%"></div></div></div>').join('');

  const rr=document.getElementById('sales-regions'),title=document.getElementById('sales-regions-title');
  if(title)title.textContent='По регионам · '+year+' · '+(selectedManager()==='all'?'все менеджеры':selectedManager());
  if(rr){
    const map=new Map(regs.map(x=>[String(x.region||'Не определён'),x]));
    const pref=['Витебск','Могилёв','Гомель'];
    const order=[...new Set([...pref,...regs.map(x=>String(x.region||'Не определён'))])];
    const maxR=Math.max(1,...order.map(k=>num(map.get(k)?.revenue)));
    rr.innerHTML=order.map(region=>{
      const x=map.get(region)||{revenue:0,clients:0};
      return '<div class="bar-row"><div class="bar-head"><span>'+(typeof regionTag==='function'?regionTag(region):'')+' '+escFast(region)+' · '+num(x.clients)+' клиентов</span><span style="font-weight:600">'+money(x.revenue)+' BYN</span></div><div class="bar-bg"><div class="bar-fill" style="width:'+Math.round(num(x.revenue)/maxR*100)+'%"></div></div></div>';
    }).join('');
  }
}

async function load(force=false){
  const k=key(),hit=cache.get(k);
  if(!force&&hit&&Date.now()-hit.at<TTL){renderData(hit.data);return hit.data}
  if(flight&&lastKey===k)return flight;
  lastKey=k;
  setLoading('Загружаю аналитику продаж…');
  flight=(async()=>{
    const year=Number(selectedYear())||new Date().getFullYear(),mgr=selectedManager();
    const {data,error}=await db.rpc('crm_sales_dashboard_v236336',{p_year:year,p_manager:mgr==='all'?null:mgr});
    if(error)throw error;
    const out=data||{};
    cache.set(k,{data:out,at:Date.now()});
    renderData(out);
    return out;
  })().catch(e=>{
    console.warn(V,e);
    if(active()==='sales')setLoading('Не удалось загрузить продажи: '+String(e?.message||e));
    return null;
  }).finally(()=>{flight=null});
  return flight;
}

function render(){
  staticShell();
  const hit=cache.get(key());
  if(hit)renderData(hit.data); else setLoading('Загружаю аналитику продаж…');
  setTimeout(()=>load(false),0);
}
function setYear(y,btn){
  try{window.salesYear=globalThis.salesYear=String(y)}catch(_){}
  document.querySelectorAll('#sh-year-chips .chip').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');
  render();load(true);
}
function setManager(m,btn){
  try{window.salesMgrFilter=globalThis.salesMgrFilter=String(m)}catch(_){}
  document.querySelectorAll('#sh-mgr-chips .chip').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');
  render();load(true);
}
function invalidate(){cache.clear();return load(true)}

window.renderSales=render;try{renderSales=render}catch(_){}
window.setSalesYear=setYear;try{setSalesYear=setYear}catch(_){}
window.setSalesMgr=setManager;try{setSalesMgr=setManager}catch(_){}
window.crmFastSalesReloadV236338=invalidate;
window.RESANTA_SALES_FAST_V236338=Object.freeze({version:V,serverAggregate:true,noFullHistory:true,cacheTtlMs:TTL});
})();
