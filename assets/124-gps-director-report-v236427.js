/* RESANTA CRM v23.6.427 · GPS director report
 * Facts only: plan, actual arrival/departure, time in TT, arrival delta,
 * technical stops and XLSX export.
 * Access: Payushin + Sidarovich only (backend RPC also enforces it).
 */
(function(){
'use strict';
if(window.RESANTA_GPS_DIRECTOR_REPORT_V236427)return;

const VERSION='v23.6.427';
const ALLOWED=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let mode='route',busy=false,lastData={visits:[],technical_stops:[]};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const user=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const email=()=>String(profile()?.email||user()?.email||'').trim().toLowerCase();
const allowed=()=>profile()?.role==='boss'&&ALLOWED.has(email());
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const day=v=>{const s=String(v||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'.'+m[2]+'.'+m[1]:s||'—';};
const hhmm=v=>{const s=String(v||'');return /^\d{2}:\d{2}/.test(s)?s.slice(0,5):'—';};
const localTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleTimeString('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'});}catch(_){return'—';}};
const delta=v=>{
  const n=Number(v);if(!Number.isFinite(n))return'—';
  if(n===0)return'0:00';
  const a=Math.abs(Math.round(n));
  return(n<0?'−':'+')+Math.floor(a/60)+':'+String(a%60).padStart(2,'0');
};
const mins=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:1})+' мин':'—';};

function standardNodes(){
  const page=document.getElementById('page-gps-control');if(!page)return[];
  const nodes=[];
  const date=document.getElementById('gps-control-date');
  if(date?.closest('.card'))nodes.push(date.closest('.card'));
  const k=document.getElementById('gps-control-kpi');if(k)nodes.push(k);
  const list=document.getElementById('gps-control-list');if(list?.closest('.card'))nodes.push(list.closest('.card'));
  const grid=page.querySelector('.gps-control-grid');if(grid)nodes.push(grid);
  const home=document.getElementById('gps-home-zones-v236419');if(home)nodes.push(home);
  return [...new Set(nodes)];
}
function headerRefresh(){
  const page=document.getElementById('page-gps-control');if(!page)return null;
  return [...page.querySelectorAll(':scope > div:first-child button')].find(b=>/обновить/i.test(b.textContent||''))||null;
}
function setMode(next){
  mode=next==='director'?'director':'route';
  const director=document.getElementById('gps-director-view-v236427');
  for(const n of standardNodes())n.style.display=mode==='director'?'none':'';
  if(director)director.style.display=mode==='director'?'block':'none';
  const ref=headerRefresh();if(ref)ref.style.display=mode==='director'?'none':'';
  document.getElementById('gps-tab-route-v236427')?.classList.toggle('btn-primary',mode==='route');
  document.getElementById('gps-tab-route-v236427')?.classList.toggle('btn-secondary',mode!=='route');
  document.getElementById('gps-tab-director-v236427')?.classList.toggle('btn-primary',mode==='director');
  document.getElementById('gps-tab-director-v236427')?.classList.toggle('btn-secondary',mode!=='director');
  if(mode==='director')load(false);
}
function ensureUi(){
  if(!allowed())return null;
  const page=document.getElementById('page-gps-control');if(!page)return null;
  if(document.getElementById('gps-director-view-v236427'))return document.getElementById('gps-director-view-v236427');

  const head=page.firstElementChild;
  const tabs=document.createElement('div');
  tabs.id='gps-tabs-v236427';
  tabs.style.cssText='display:flex;gap:8px;align-items:center;margin:-4px 0 14px;flex-wrap:wrap';
  tabs.innerHTML='<button id="gps-tab-route-v236427" class="btn-primary">Маршруты</button>'+
                 '<button id="gps-tab-director-v236427" class="btn-secondary">Руководитель</button>';
  head?.insertAdjacentElement('afterend',tabs);

  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth()-1,1);
  const panel=document.createElement('div');
  panel.id='gps-director-view-v236427';
  panel.style.display='none';
  panel.innerHTML=
    '<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">'+
        '<div><label class="form-label">Период с</label><input type="date" id="gps-dir-from-v236427" class="form-input" style="width:auto" value="'+iso(start)+'"></div>'+
        '<div><label class="form-label">по</label><input type="date" id="gps-dir-to-v236427" class="form-input" style="width:auto" value="'+iso(now)+'"></div>'+
        '<div><label class="form-label">Менеджер</label><select id="gps-dir-manager-v236427" class="form-input" style="min-width:190px"><option value="all">Все менеджеры</option></select></div>'+
        '<button class="btn-primary" id="gps-dir-load-v236427">Показать</button>'+
        '<button class="btn-secondary" id="gps-dir-xlsx-v236427">⬇ Excel</button>'+
      '</div>'+
    '</div>'+
    '<div class="kpi-row" id="gps-dir-kpi-v236427"></div>'+
    '<div class="card" style="margin-bottom:12px;overflow:auto">'+
      '<div class="card-title">Посещения ТТ</div>'+
      '<div id="gps-dir-visits-v236427"><div style="padding:16px;color:var(--sub)">Выберите период и нажмите «Показать».</div></div>'+
    '</div>'+
    '<div class="card" style="margin-bottom:12px;overflow:auto">'+
      '<div class="card-title">Технические остановки</div>'+
      '<div id="gps-dir-tech-v236427"><div style="padding:16px;color:var(--sub)">Данные появятся после загрузки периода.</div></div>'+
    '</div>';
  page.appendChild(panel);

  tabs.querySelector('#gps-tab-route-v236427').addEventListener('click',()=>setMode('route'));
  tabs.querySelector('#gps-tab-director-v236427').addEventListener('click',()=>setMode('director'));
  panel.querySelector('#gps-dir-load-v236427').addEventListener('click',()=>load(true));
  panel.querySelector('#gps-dir-xlsx-v236427').addEventListener('click',exportExcel);
  for(const id of ['gps-dir-from-v236427','gps-dir-to-v236427','gps-dir-manager-v236427']){
    panel.querySelector('#'+id)?.addEventListener('change',()=>{if(mode==='director')load(true);});
  }

  const obs=new MutationObserver(()=>{
    if(mode==='director'){
      const home=document.getElementById('gps-home-zones-v236419');
      if(home)home.style.display='none';
    }
  });
  obs.observe(page,{childList:true,subtree:false});
  return panel;
}
function args(){
  return{
    p_from:document.getElementById('gps-dir-from-v236427')?.value||'',
    p_to:document.getElementById('gps-dir-to-v236427')?.value||'',
    p_manager:document.getElementById('gps-dir-manager-v236427')?.value||'all'
  };
}
function fillManagers(visits){
  const el=document.getElementById('gps-dir-manager-v236427');if(!el)return;
  const cur=el.value||'all';
  const names=[...new Set((visits||[]).map(x=>String(x.manager_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const existing=new Set([...el.options].map(o=>o.value));
  for(const n of names)if(!existing.has(n)){const o=document.createElement('option');o.value=n;o.textContent=n;el.appendChild(o);}
  if([...el.options].some(o=>o.value===cur))el.value=cur;
}
function renderKpi(data){
  const root=document.getElementById('gps-dir-kpi-v236427');if(!root)return;
  const v=Array.isArray(data?.visits)?data.visits:[],t=Array.isArray(data?.technical_stops)?data.technical_stops:[];
  const days=new Set(v.map(x=>(x.date||'')+'|'+(x.manager_name||'')));
  const actual=v.filter(x=>x.actual_arrival_at&&x.actual_departure_at).length;
  root.innerHTML=
    '<div class="kpi"><div class="kpi-label">Дней / менеджеров</div><div class="kpi-value">'+days.size+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">Плановых ТТ</div><div class="kpi-value">'+v.length+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">Есть факт GPS</div><div class="kpi-value">'+actual+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">Технических остановок</div><div class="kpi-value">'+t.length+'</div></div>';
}
function renderVisits(rows){
  const root=document.getElementById('gps-dir-visits-v236427');if(!root)return;
  if(!rows.length){root.innerHTML='<div style="padding:16px;color:var(--sub)">За выбранный период плановых ТТ нет.</div>';return;}
  root.innerHTML='<table class="gps-route-table"><thead><tr>'+
    '<th>Дата</th><th>Менеджер</th><th>№</th><th>ТТ</th><th>План с</th><th>План до</th><th>Приехал</th><th>Уехал</th><th>В ТТ</th><th>Откл. приезда</th>'+
    '</tr></thead><tbody>'+
    rows.map(r=>'<tr>'+
      '<td><b>'+esc(day(r.date))+'</b></td>'+
      '<td>'+esc(r.manager_name||'—')+'</td>'+
      '<td>'+esc(r.sort_order??'—')+'</td>'+
      '<td><b>'+esc(r.client_name||'—')+'</b><div style="font-size:10px;color:var(--sub);margin-top:3px">'+esc([r.city,r.address].filter(Boolean).join(', '))+'</div></td>'+
      '<td>'+esc(hhmm(r.planned_start))+'</td>'+
      '<td>'+esc(hhmm(r.planned_end))+'</td>'+
      '<td><b>'+esc(localTime(r.actual_arrival_at))+'</b></td>'+
      '<td><b>'+esc(localTime(r.actual_departure_at))+'</b></td>'+
      '<td>'+esc(mins(r.actual_minutes))+'</td>'+
      '<td>'+esc(delta(r.arrival_delta_minutes))+'</td>'+
    '</tr>').join('')+'</tbody></table>';
}
function renderTech(rows){
  const root=document.getElementById('gps-dir-tech-v236427');if(!root)return;
  if(!rows.length){root.innerHTML='<div style="padding:16px;color:var(--sub)">Технических остановок за выбранный период нет.</div>';return;}
  root.innerHTML='<table class="gps-route-table"><thead><tr>'+
    '<th>Дата</th><th>Менеджер</th><th>Остановка</th><th>Начало</th><th>Конец</th><th>Длительность</th><th>Точность GPS</th>'+
    '</tr></thead><tbody>'+
    rows.map(r=>'<tr>'+
      '<td><b>'+esc(day(r.date))+'</b></td>'+
      '<td>'+esc(r.manager_name||'—')+'</td>'+
      '<td><b>Тех. '+esc(r.stop_seq??'—')+'</b></td>'+
      '<td>'+esc(localTime(r.start_at))+'</td>'+
      '<td>'+esc(localTime(r.end_at))+'</td>'+
      '<td>'+esc(mins(r.minutes))+'</td>'+
      '<td>'+esc(r.avg_accuracy==null?'—':'±'+Math.round(Number(r.avg_accuracy))+' м')+'</td>'+
    '</tr>').join('')+'</tbody></table>';
}
async function load(force=false){
  if(!allowed()||mode!=='director'||busy)return;
  const panel=ensureUi();if(!panel)return;
  const a=args();
  if(!a.p_from||!a.p_to)return;
  busy=true;
  const btn=document.getElementById('gps-dir-load-v236427');if(btn)btn.disabled=true;
  try{
    const {data,error}=await db.rpc('gps_director_report_v236421',a);
    if(error)throw error;
    lastData=data||{visits:[],technical_stops:[]};
    fillManagers(lastData.visits||[]);
    renderKpi(lastData);renderVisits(lastData.visits||[]);renderTech(lastData.technical_stops||[]);
  }catch(e){
    console.error('GPS director '+VERSION,e);
    const root=document.getElementById('gps-dir-visits-v236427');
    if(root)root.innerHTML='<div style="padding:16px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;border-radius:10px"><b>Не удалось загрузить данные.</b><br>'+esc(e?.message||e)+'</div>';
  }finally{busy=false;if(btn)btn.disabled=false;}
}
async function exportExcel(){
  if(!allowed())return;
  const a=args();
  const btn=document.getElementById('gps-dir-xlsx-v236427');if(btn)btn.disabled=true;
  try{
    const {data:{session},error}=await db.auth.getSession();if(error)throw error;
    if(!session?.access_token)throw new Error('Нет активной сессии CRM');
    const r=await fetch('https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-gps-director-export-v236427',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+session.access_token},
      body:JSON.stringify({from:a.p_from,to:a.p_to,manager:a.p_manager})
    });
    if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j?.error||('HTTP '+r.status));}
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='GPS_Руководитель_'+a.p_from+'_'+a.p_to+'.xlsx';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){alert('Не удалось выгрузить Excel: '+(e?.message||e));}
  finally{if(btn)btn.disabled=false;}
}
function install(){
  if(!allowed())return;
  ensureUi();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,500);setTimeout(install,1200);

window.RESANTA_GPS_DIRECTOR_REPORT_V236427=Object.freeze({version:VERSION,access:['payushin','sidarovich'],factsOnly:true});
})();