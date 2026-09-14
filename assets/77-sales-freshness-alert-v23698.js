/* RESANTA CRM v23.6.117 · SALES SOURCE FRESHNESS ALERT
 * Compact, source-specific 1C freshness status.
 * A stale Triovist slice is NOT a total 1C outage.
 * No business-data writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_SALES_FRESHNESS_ALERT_V23698)return;
const VERSION='v23.6.117',TZ='Europe/Minsk',SOURCES=['sales','triovist_sales'];
let channel=null,rows=new Map(),flight=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function parts(d=new Date()){try{const a=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d),o={};a.forEach(x=>o[x.type]=x.value);return{date:`${o.year}-${o.month}-${o.day}`,hour:Number(o.hour||0),time:`${o.day}.${o.month}.${o.year}, ${o.hour}:${o.minute}`}}catch(_){return{date:d.toISOString().slice(0,10),hour:d.getHours(),time:d.toLocaleString('ru-RU')}}}
function getGlobal(){try{for(const r of(allImportStatus||[])){const s=String(r?.source||'').toLowerCase();if(SOURCES.includes(s))rows.set(s,r)}}catch(_){}}
function put(r){const s=String(r?.source||'').toLowerCase();if(SOURCES.includes(s))rows.set(s,r)}
function state(source){const r=rows.get(source);if(!r)return{level:'bad',today:false,last:'—'};const raw=r.source_message_at||r.updated_at||'',d=raw?new Date(raw):null;if(!d||Number.isNaN(d.getTime()))return{level:'bad',today:false,last:'—'};const now=new Date(),np=parts(now),lp=parts(d),age=(now-d)/3600000,today=lp.date===np.date;if(!today)return{level:'bad',today,last:lp.time};if(age>3&&np.hour>=9&&np.hour<21)return{level:'warn',today,last:lp.time};return{level:'ok',today,last:lp.time}}
function ensure(pageId,key){const p=document.getElementById(pageId);if(!p)return null;let el=document.getElementById('sales-fresh-'+key+'-v23698');if(!el){el=document.createElement('div');el.id='sales-fresh-'+key+'-v23698';el.dataset.crmFreshness='1';const title=p.querySelector('.page-title');if(title?.nextSibling)title.parentNode.insertBefore(el,title.nextSibling);else p.insertBefore(el,p.firstChild)}return el}
function paint(el,level,html){const cfg=level==='ok'?['#BBF7D0','#F0FDF4','#166534']:level==='warn'?['#FDE68A','#FFFBEB','#92400E']:['#FCA5A5','#FEF2F2','#991B1B'];el.style.cssText=`display:inline-flex;max-width:100%;align-items:center;gap:6px;margin:0 0 10px;padding:6px 9px;border-radius:8px;border:1px solid ${cfg[0]};background:${cfg[1]};color:${cfg[2]};font-size:11px;line-height:1.35;flex-wrap:wrap`;el.innerHTML=html}
function renderSales(){const el=ensure('page-sales','sales');if(!el)return;const s=state('sales');if(s.level==='ok'){el.remove();return}paint(el,s.level,`${s.level==='bad'?'🔴':'⚠️'} <b>Продажи 1С:</b> последний срез ${esc(s.last)}. Показаны последние подтверждённые данные.`)}
function renderTriovist(){const el=ensure('page-triovist','triovist_sales');if(!el)return;const tri=state('triovist_sales'),all=state('sales');if(tri.level==='ok'){paint(el,'ok',`✅ <b>1С · Triovist актуально:</b> срез ${esc(tri.last)}.`);return}if(all.today){paint(el,'warn',`⚠️ <b>Общий обмен 1С работает.</b> Задержан только срез продаж Triovist: последний ${esc(tri.last)}. CRM пока показывает последний проверенный факт Triovist.`);return}paint(el,'bad',`🔴 <b>Продажи Triovist не обновлены:</b> последний срез ${esc(tri.last)}. Последние подтверждённые данные сохранены; нулями они не заменяются.`)}
function render(){getGlobal();renderSales();renderTriovist()}
async function load(){if(flight)return flight;flight=(async()=>{getGlobal();const d=dbx();if(d){try{const q=await d.from('crm_import_status').select('source,status,source_message_at,updated_at,row_count,details,error_text').in('source',SOURCES);if(!q.error)(q.data||[]).forEach(put)}catch(_){}}render()})().finally(()=>flight=null);return flight}
function realtime(){const d=dbx();if(channel||!d||typeof d.channel!=='function')return;try{channel=d.channel('crm-sales-freshness-v23698').on('postgres_changes',{event:'*',schema:'public',table:'crm_import_status'},payload=>{const r=payload?.new||null;if(r&&SOURCES.includes(String(r.source||'').toLowerCase())){put(r);render()}}).subscribe()}catch(_){channel=null}}
function boot(){load().finally(realtime);['nav-sales','bn-sales','nav-triovist','bn-triovist'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>setTimeout(load,0)));document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_SALES_FRESHNESS_ALERT_V23698=Object.freeze({version:VERSION,noPolling:true,noWrites:true,render,load});
})();
