/* RESANTA CRM v23.6.429 · GPS integrity for directors
 * Silent manager-side operation. Scoring lives in the protected backend RPC.
 * UI is available only to approved GPS directors.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_INTEGRITY_V236429)return;
const VERSION='v23.6.429';
const ALLOWED=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let busy=false,lastRouteKey='',lastRouteData=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const user=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const email=()=>String(profile()?.email||user()?.email||'').trim().toLowerCase();
const allowed=()=>profile()?.role==='boss'&&ALLOWED.has(email());
const day=v=>{const s=String(v||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'.'+m[2]+'.'+m[1]:s||'—';};

function meta(level){
  if(level==='low')return{label:'Низкое',bg:'#FEF2F2',border:'#FCA5A5',color:'#B91C1C',icon:'⚠'};
  if(level==='medium')return{label:'Проверить',bg:'#FFF7ED',border:'#FDBA74',color:'#9A3412',icon:'●'};
  return{label:'Высокое',bg:'#ECFDF5',border:'#86EFAC',color:'#166534',icon:'●'};
}
function badge(level,small=false){
  const m=meta(level);
  return '<span style="display:inline-block;padding:'+(small?'3px 6px':'4px 8px')+';border-radius:8px;background:'+m.bg+';border:1px solid '+m.border+';color:'+m.color+';font-size:'+(small?'10px':'11px')+';font-weight:800">'+m.icon+' GPS доверие: '+m.label+'</span>';
}
async function fetchIntegrity(from,to,manager){
  const {data,error}=await db.rpc('gps_integrity_director_v236429',{
    p_from:from,p_to:to,p_manager:manager||'all'
  });
  if(error)throw error;
  return data||{summary:{},rows:[]};
}
function directorActive(){
  const page=document.getElementById('page-gps-control');
  const panel=document.getElementById('gps-director-view-v236427');
  return !!(page?.classList.contains('active')&&panel&&panel.style.display!=='none');
}
function ensureDirectorCard(){
  if(!allowed())return null;
  const panel=document.getElementById('gps-director-view-v236427');if(!panel)return null;
  let card=document.getElementById('gps-integrity-v236429');
  if(card)return card;
  card=document.createElement('div');
  card.id='gps-integrity-v236429';
  card.className='card';
  card.style.cssText='margin-bottom:12px;overflow:auto';
  card.innerHTML=
    '<div class="card-title">🛡 Достоверность GPS</div>'+
    '<div style="font-size:11px;color:var(--sub);line-height:1.45;margin-bottom:10px">'+
      'Красный уровень ставится только при прямом системном признаке Android mock-location. '+
      'Жёлтый означает технические аномалии и требует просмотра маршрута — это не доказательство подмены.'+
    '</div>'+
    '<div class="kpi-row" id="gps-integrity-kpi-v236429"></div>'+
    '<button id="gps-integrity-toggle-v236438" type="button" class="btn-secondary" style="margin:8px 0 10px;font-size:11px">Подробная диагностика GPS ▾</button>'+
    '<div id="gps-integrity-list-v236429"><div style="padding:14px;color:var(--sub)">Загрузка…</div></div>';
  const kpi=document.getElementById('gps-dir-kpi-v236427');
  if(kpi?.parentNode===panel)kpi.insertAdjacentElement('afterend',card);
  else panel.insertBefore(card,panel.children[1]||null);
  card.querySelector('#gps-integrity-toggle-v236438')?.addEventListener('click',()=>{
    const list=card.querySelector('#gps-integrity-list-v236429');
    if(!list)return;
    const visible=list.style.display==='block';
    list.style.display=visible?'none':'block';
    card.querySelector('#gps-integrity-toggle-v236438').textContent=visible?'Подробная диагностика GPS ▾':'Скрыть подробную диагностику ▴';
  });
  return card;
}
function reasons(r){
  const a=[];
  if(Number(r.mock_points)>0)a.push('Android mock: '+Number(r.mock_points));
  if(Number(r.gps_jump_points)>0)a.push('скачки: '+Number(r.gps_jump_points));
  if(Number(r.impossible_speed_points)>0)a.push('скорость: '+Number(r.impossible_speed_points));
  if(Number(r.non_monotonic_points)>0)a.push('время: '+Number(r.non_monotonic_points));
  if(Number(r.gap_over_10m)>0)a.push('разрывы >10 мин: '+Number(r.gap_over_10m));
  if(Number(r.poor_accuracy_points)>0)a.push('слабая точность: '+Number(r.poor_accuracy_points));
  return a.join(' · ')||'явных аномалий нет';
}
function renderDirector(data){
  ensureDirectorCard();
  const s=data?.summary||{},rows=Array.isArray(data?.rows)?data.rows:[];
  const k=document.getElementById('gps-integrity-kpi-v236429');
  if(k)k.innerHTML=
    '<div class="kpi"><div class="kpi-label">Высокое доверие</div><div class="kpi-value ok">'+Number(s.high||0)+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">Проверить</div><div class="kpi-value '+(Number(s.medium||0)?'warn':'')+'">'+Number(s.medium||0)+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">Системный mock</div><div class="kpi-value '+(Number(s.low||0)?'bad':'')+'">'+Number(s.low||0)+'</div><div class="kpi-sub">'+Number(s.mock_points||0)+' точек</div></div>';
  const root=document.getElementById('gps-integrity-list-v236429');if(!root)return;
  if(!rows.length){root.innerHTML='<div style="padding:14px;color:var(--sub)">За выбранный период GPS-рабочих дней нет.</div>';return;}
  root.innerHTML='<table class="gps-route-table"><thead><tr>'+
    '<th>Дата</th><th>Менеджер</th><th>Доверие</th><th>Системный mock</th><th>Точки</th><th>Что проверить</th>'+
    '</tr></thead><tbody>'+rows.map(r=>'<tr>'+
      '<td><b>'+esc(day(r.date))+'</b></td>'+
      '<td><b>'+esc(r.manager_name||'—')+'</b></td>'+
      '<td>'+badge(r.trust_level)+'</td>'+
      '<td>'+(Number(r.mock_points)>0?'<b class="bad">⚠ '+Number(r.mock_points)+' точек</b>':'—')+'</td>'+
      '<td>'+Number(r.valid_points||0)+' / '+Number(r.raw_points||0)+' доверенных</td>'+
      '<td style="font-size:11px">'+esc(reasons(r))+'</td>'+
    '</tr>').join('')+'</tbody></table>';
}
async function loadDirector(){
  if(!allowed()||!directorActive()||busy)return;
  const from=document.getElementById('gps-dir-from-v236427')?.value;
  const to=document.getElementById('gps-dir-to-v236427')?.value;
  const manager=document.getElementById('gps-dir-manager-v236427')?.value||'all';
  if(!from||!to)return;
  busy=true;ensureDirectorCard();
  try{renderDirector(await fetchIntegrity(from,to,manager));}
  catch(e){
    console.error('GPS integrity '+VERSION,e);
    const root=document.getElementById('gps-integrity-list-v236429');
    if(root)root.innerHTML='<div style="padding:12px;border-radius:9px;background:#FEF2F2;color:#991B1B">Не удалось загрузить контроль достоверности GPS.</div>';
  }finally{busy=false;}
}
async function decorateRouteList(){
  if(!allowed())return;
  const date=document.getElementById('gps-control-date')?.value;
  if(!date)return;
  try{
    const key=date;
    if(lastRouteKey!==key||!lastRouteData){
      lastRouteData=await fetchIntegrity(date,date,'all');lastRouteKey=key;
    }
    const rows=Array.isArray(lastRouteData?.rows)?lastRouteData.rows:[];
    const table=document.querySelector('#gps-control-list table');if(!table)return;
    table.querySelectorAll('tbody tr').forEach(tr=>{
      const cells=tr.querySelectorAll('td');if(cells.length<2)return;
      const name=String(cells[0].textContent||'').trim().toLowerCase();
      const r=rows.find(x=>String(x.manager_name||'').trim().toLowerCase()===name);
      tr.querySelector('.gps-integrity-badge-v236429')?.remove();
      if(!r)return;
      const box=document.createElement('div');box.className='gps-integrity-badge-v236429';box.style.marginTop='5px';
      box.innerHTML=badge(r.trust_level,true)+(Number(r.mock_points)>0?'<div class="bad" style="font-size:10px;margin-top:3px">Android mock: '+Number(r.mock_points)+'</div>':'');
      cells[1].appendChild(box);
    });
  }catch(e){console.warn('GPS integrity route decoration',e);}
}

function install(){
  if(!allowed())return;
  ensureDirectorCard();
  const base=window.v19RenderGpsControl;
  if(typeof base==='function'&&!base.__gpsIntegrityV236429){
    const wrapped=async function(){
      const out=await base.apply(this,arguments);
      lastRouteKey='';lastRouteData=null;
      setTimeout(decorateRouteList,0);
      return out;
    };
    wrapped.__gpsIntegrityV236429=true;wrapped.__base=base;
    window.v19RenderGpsControl=wrapped;
    try{v19RenderGpsControl=wrapped;}catch(_){}
  }
}
document.addEventListener('click',e=>{
  if(!allowed())return;
  if(e.target.closest?.('#gps-tab-director-v236427,#gps-dir-load-v236427')){
    setTimeout(()=>{ensureDirectorCard();loadDirector();},120);
  }
  if(e.target.closest?.('#nav-gps-control,#bn-gps-control')){
    setTimeout(()=>{install();decorateRouteList();},250);
  }
},true);
document.addEventListener('change',e=>{
  if(!allowed())return;
  if(e.target.matches?.('#gps-dir-from-v236427,#gps-dir-to-v236427,#gps-dir-manager-v236427'))setTimeout(loadDirector,80);
  if(e.target.matches?.('#gps-control-date,#gps-control-manager,#gps-control-status')){
    lastRouteKey='';lastRouteData=null;setTimeout(decorateRouteList,180);
  }
},true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,700);setTimeout(()=>{install();decorateRouteList();},1600);

window.RESANTA_GPS_INTEGRITY_V236429=Object.freeze({
  version:VERSION,
  directorOnly:true,
  managerUi:false,
  scoringServerSide:true,
  directMockSignal:true
});
})();