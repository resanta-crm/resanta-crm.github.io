/* RESANTA CRM v23.6.118 · SALES SOURCE FRESHNESS ALERT
 * Compact, source-specific 1C freshness status.
 * Triovist freshness is shown inside the work-menu header so sticky navigation
 * cannot cover it. No business-data writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_SALES_FRESHNESS_ALERT_V23698)return;
const VERSION='v23.6.118',TZ='Europe/Minsk',SOURCES=['sales','triovist_sales'];
let channel=null,rows=new Map(),flight=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function parts(d=new Date()){
  try{
    const a=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d),o={};
    a.forEach(x=>o[x.type]=x.value);
    return{date:`${o.year}-${o.month}-${o.day}`,day:`${o.day}.${o.month}`,hour:Number(o.hour||0),time:`${o.hour}:${o.minute}`,full:`${o.day}.${o.month}.${o.year}, ${o.hour}:${o.minute}`};
  }catch(_){return{date:d.toISOString().slice(0,10),day:d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}),hour:d.getHours(),time:d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),full:d.toLocaleString('ru-RU')}}
}
function getGlobal(){try{for(const r of(allImportStatus||[])){const s=String(r?.source||'').toLowerCase();if(SOURCES.includes(s))rows.set(s,r)}}catch(_){}}
function put(r){const s=String(r?.source||'').toLowerCase();if(SOURCES.includes(s))rows.set(s,r)}
function state(source){
  const r=rows.get(source);if(!r)return{level:'bad',today:false,last:'—',day:'—',time:'—'};
  const raw=r.source_message_at||r.updated_at||'',d=raw?new Date(raw):null;if(!d||Number.isNaN(d.getTime()))return{level:'bad',today:false,last:'—',day:'—',time:'—'};
  const now=new Date(),np=parts(now),lp=parts(d),age=(now-d)/3600000,today=lp.date===np.date;
  if(!today)return{level:'bad',today,last:lp.full,day:lp.day,time:lp.time};
  if(age>3&&np.hour>=9&&np.hour<21)return{level:'warn',today,last:lp.full,day:lp.day,time:lp.time};
  return{level:'ok',today,last:lp.full,day:lp.day,time:lp.time};
}
function ensureSales(){
  const p=document.getElementById('page-sales');if(!p)return null;
  let el=document.getElementById('sales-fresh-sales-v23698');
  if(!el){el=document.createElement('div');el.id='sales-fresh-sales-v23698';el.dataset.crmFreshness='1';const title=p.querySelector('.page-title');if(title?.nextSibling)title.parentNode.insertBefore(el,title.nextSibling);else p.insertBefore(el,p.firstChild)}
  return el;
}
function findTriovistRefresh(){
  const p=document.getElementById('page-triovist');if(!p)return null;
  for(const b of p.querySelectorAll('button')){
    const t=String(b.textContent||'').replace(/[↻⟳]/g,'').trim().toLowerCase();
    if(t==='обновить')return b;
  }
  return null;
}
function ensureTriovistBadge(){
  const refresh=findTriovistRefresh();if(!refresh||!refresh.parentElement)return null;
  let el=document.getElementById('sales-fresh-triovist_sales-v23698');
  if(!el){el=document.createElement('span');el.id='sales-fresh-triovist_sales-v23698';el.dataset.crmFreshness='1'}
  if(el.parentElement!==refresh.parentElement||el.nextSibling!==refresh)refresh.parentElement.insertBefore(el,refresh);
  return el;
}
function paintBanner(el,level,html){
  const cfg=level==='warn'?['#FDE68A','#FFFBEB','#92400E']:['#FCA5A5','#FEF2F2','#991B1B'];
  el.style.cssText=`display:inline-flex;max-width:100%;align-items:center;gap:6px;margin:0 0 10px;padding:6px 9px;border-radius:8px;border:1px solid ${cfg[0]};background:${cfg[1]};color:${cfg[2]};font-size:11px;line-height:1.35;flex-wrap:wrap`;
  el.innerHTML=html;
}
function paintBadge(el,level,text,title){
  const cfg=level==='ok'?['#86EFAC','#F0FDF4','#166534']:level==='warn'?['#FCD34D','#FFFBEB','#92400E']:['#FCA5A5','#FEF2F2','#991B1B'];
  el.style.cssText=`display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;margin:0 8px 0 10px;padding:6px 10px;border-radius:999px;border:1px solid ${cfg[0]};background:${cfg[1]};color:${cfg[2]};font-size:12px;font-weight:700;line-height:1.2;box-sizing:border-box`;
  el.textContent=text;el.title=title;el.setAttribute('aria-label',title);
}
function renderSales(){
  const s=state('sales'),old=document.getElementById('sales-fresh-sales-v23698');
  if(s.level==='ok'){old?.remove();return}
  const el=ensureSales();if(!el)return;
  paintBanner(el,s.level,`${s.level==='bad'?'🔴':'⚠️'} <b>Продажи 1С:</b> последний срез ${esc(s.last)}. Показаны последние подтверждённые данные.`);
}
function renderTriovist(){
  const legacy=document.getElementById('sales-fresh-triovist_sales-v23698');
  const el=ensureTriovistBadge();if(!el){legacy?.remove();return}
  const tri=state('triovist_sales'),all=state('sales');
  if(tri.level==='ok'){
    paintBadge(el,'ok',`🟢 1С ${tri.time}`,`Triovist: свежий срез 1С — ${tri.last}`);return;
  }
  if(all.today){
    paintBadge(el,'warn',`🟡 1С задержка ${tri.time}`,`Общий обмен 1С работает. Triovist задержан: последний срез ${tri.last}. CRM показывает последний проверенный факт.`);return;
  }
  paintBadge(el,'bad','🔴 1С нет сегодня',`Продажи Triovist сегодня не обновлялись. Последний срез: ${tri.last}. Последние подтверждённые данные сохранены.`);
}
function render(){getGlobal();renderSales();renderTriovist()}
async function load(){if(flight)return flight;flight=(async()=>{getGlobal();const d=dbx();if(d){try{const q=await d.from('crm_import_status').select('source,status,source_message_at,updated_at,row_count,details,error_text').in('source',SOURCES);if(!q.error)(q.data||[]).forEach(put)}catch(_){}}render()})().finally(()=>flight=null);return flight}
function realtime(){const d=dbx();if(channel||!d||typeof d.channel!=='function')return;try{channel=d.channel('crm-sales-freshness-v23698').on('postgres_changes',{event:'*',schema:'public',table:'crm_import_status'},payload=>{const r=payload?.new||null;if(r&&SOURCES.includes(String(r.source||'').toLowerCase())){put(r);render()}}).subscribe()}catch(_){channel=null}}
function boot(){load().finally(realtime);['nav-sales','bn-sales','nav-triovist','bn-triovist'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>setTimeout(load,0)));document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_SALES_FRESHNESS_ALERT_V23698=Object.freeze({version:VERSION,noPolling:true,noWrites:true,render,load});
})();
