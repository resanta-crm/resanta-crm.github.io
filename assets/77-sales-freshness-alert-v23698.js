/* RESANTA CRM v23.6.98 · SALES SOURCE FRESHNESS ALERT
 * UI-only warning when today's 1C sales snapshot is missing/stale.
 * No business-data writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_SALES_FRESHNESS_ALERT_V23698)return;
const VERSION='v23.6.98',TZ='Europe/Minsk',SOURCES=['sales','triovist_sales'];
let channel=null,rows=new Map(),flight=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function parts(d=new Date()){
  try{
    const a=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d),o={};
    a.forEach(x=>o[x.type]=x.value);return{date:`${o.year}-${o.month}-${o.day}`,hour:Number(o.hour||0),time:`${o.day}.${o.month}.${o.year}, ${o.hour}:${o.minute}`};
  }catch(_){return{date:d.toISOString().slice(0,10),hour:d.getHours(),time:d.toLocaleString('ru-RU')}}
}
function getGlobal(){
  try{for(const r of (allImportStatus||[])){const s=String(r?.source||'').toLowerCase();if(SOURCES.includes(s))rows.set(s,r)}}catch(_){}
}
function put(r){const s=String(r?.source||'').toLowerCase();if(SOURCES.includes(s))rows.set(s,r)}
function state(source){
  const r=rows.get(source);if(!r)return{level:'bad',text:'Нет сведений о последнем импорте 1С.',last:'—'};
  const raw=r.source_message_at||r.updated_at||'';const d=raw?new Date(raw):null;if(!d||Number.isNaN(d.getTime()))return{level:'bad',text:'Не удалось определить время последнего среза 1С.',last:'—'};
  const now=new Date(),np=parts(now),lp=parts(d),age=(now-d)/3600000;
  if(lp.date!==np.date)return{level:'bad',text:'Нет свежих данных 1С за сегодня.',last:lp.time};
  if(age>3&&np.hour>=9&&np.hour<21)return{level:'warn',text:`Последний срез 1С старше 3 часов (${Math.floor(age)} ч).`,last:lp.time};
  return{level:'ok',text:'',last:lp.time};
}
function banner(pageId,source,label){
  const p=document.getElementById(pageId);if(!p)return;let el=document.getElementById('sales-fresh-'+source+'-v23698');const st=state(source);
  if(st.level==='ok'){el?.remove();return}
  if(!el){el=document.createElement('div');el.id='sales-fresh-'+source+'-v23698';el.dataset.crmFreshness='1';const title=p.querySelector('.page-title');if(title?.nextSibling)title.parentNode.insertBefore(el,title.nextSibling);else p.insertBefore(el,p.firstChild)}
  const bad=st.level==='bad';el.style.cssText=`margin:0 0 14px;padding:11px 13px;border-radius:10px;border:1px solid ${bad?'#FCA5A5':'#F59E0B'};background:${bad?'#FEF2F2':'#FFF7ED'};color:${bad?'#991B1B':'#9A3412'};font-size:12px;line-height:1.45`;
  el.innerHTML=`<b>${bad?'🔴':'⚠️'} ${esc(st.text)}</b> Последний доступный срез «${esc(label)}»: <b>${esc(st.last)}</b>. CRM показывает последние достоверные данные и не подменяет их нулями.`;
}
function render(){getGlobal();banner('page-sales','sales','Продажи');banner('page-triovist','triovist_sales','Triovist')}
async function load(){
  if(flight)return flight;flight=(async()=>{getGlobal();const d=dbx();if(d){try{const q=await d.from('crm_import_status').select('source,status,source_message_at,updated_at,row_count').in('source',SOURCES);if(!q.error)(q.data||[]).forEach(put)}catch(_){}}render()})().finally(()=>flight=null);return flight;
}
function realtime(){const d=dbx();if(channel||!d||typeof d.channel!=='function')return;try{channel=d.channel('crm-sales-freshness-v23698').on('postgres_changes',{event:'*',schema:'public',table:'crm_import_status'},payload=>{const r=payload?.new||null;if(r&&SOURCES.includes(String(r.source||'').toLowerCase())){put(r);render()}}).subscribe()}catch(_){channel=null}}
function boot(){load().finally(realtime);['nav-sales','bn-sales','nav-triovist','bn-triovist'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>setTimeout(render,0)));document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_SALES_FRESHNESS_ALERT_V23698=Object.freeze({version:VERSION,noPolling:true,noWrites:true,render,load});
})();
