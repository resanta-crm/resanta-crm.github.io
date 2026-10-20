/* RESANTA CRM v23.6.419 · GPS start/home zones control
 * Director-only one-click confirmation of repeated GPS start zones.
 * Coordinates are intentionally not exposed in the UI.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_HOME_ZONES_V236419)return;

const VERSION='v23.6.419';
const ALLOWED=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let busy=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const user=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const email=()=>String(profile()?.email||user()?.email||'').trim().toLowerCase();
const allowed=()=>profile()?.role==='boss'&&ALLOWED.has(email());
const n=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:1});

function root(){
  const page=document.getElementById('page-gps-control');
  if(!page)return null;
  let box=document.getElementById('gps-home-zones-v236419');
  if(box)return box;
  box=document.createElement('div');
  box.id='gps-home-zones-v236419';
  box.className='card';
  box.style.marginBottom='12px';
  box.innerHTML=
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">'+
      '<div><b>🏠 Стартовые зоны GPS</b>'+
      '<div style="font-size:11px;color:var(--sub);margin-top:4px;line-height:1.45">CRM ищет повторяющуюся точку включения GPS. Пока директор не подтвердил её, маршрут пишет «Стартовая стоянка», а не «Дом». Координаты здесь намеренно не показываются.</div></div>'+
      '<button class="btn-secondary" id="gps-home-refresh-v236419">Перепроверить</button>'+
    '</div>'+
    '<div id="gps-home-list-v236419" style="margin-top:10px"><div style="color:var(--sub);font-size:12px">Загружаю…</div></div>';
  const kpi=document.getElementById('gps-control-kpi');
  if(kpi)page.insertBefore(box,kpi);else page.appendChild(box);
  box.querySelector('#gps-home-refresh-v236419')?.addEventListener('click',async()=>{
    const b=box.querySelector('#gps-home-refresh-v236419');
    if(b)b.disabled=true;
    try{
      const {error}=await db.rpc('gps_refresh_home_zone_suggestions_v236417',{});
      if(error)throw error;
      await load(true);
    }catch(e){alert('Не удалось перепроверить стартовые зоны: '+(e?.message||e));}
    finally{if(b)b.disabled=false;}
  });
  return box;
}

function statusText(z){
  if(z.status==='confirmed')return '<span class="tag tag-m">🏠 Дом подтверждён</span>';
  if(z.status==='rejected')return '<span class="tag tag-gray">Отклонено</span>';
  return '<span class="tag tag-g">📍 Требует подтверждения</span>';
}

function actions(z){
  const name=encodeURIComponent(String(z.manager_name||''));
  if(z.status==='confirmed'){
    return '<button class="btn-secondary" style="padding:7px 10px;font-size:11px" onclick="crmGpsHomeZoneDecisionV236419(decodeURIComponent(\''+name+'\'),\'reset\')">Сбросить подтверждение</button>';
  }
  if(z.status==='rejected'){
    return '<button class="btn-secondary" style="padding:7px 10px;font-size:11px" onclick="crmGpsHomeZoneDecisionV236419(decodeURIComponent(\''+name+'\'),\'reset\')">Вернуть на проверку</button>';
  }
  return '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
    '<button class="btn-primary" style="padding:7px 10px;font-size:11px" onclick="crmGpsHomeZoneDecisionV236419(decodeURIComponent(\''+name+'\'),\'confirm\')">Подтвердить как 🏠 Дом</button>'+
    '<button class="btn-secondary" style="padding:7px 10px;font-size:11px" onclick="crmGpsHomeZoneDecisionV236419(decodeURIComponent(\''+name+'\'),\'reject\')">Не дом</button>'+
  '</div>';
}

function render(rows){
  const box=root();if(!box)return;
  const out=box.querySelector('#gps-home-list-v236419');if(!out)return;
  if(!rows.length){out.innerHTML='<div style="color:var(--sub);font-size:12px">Стартовые зоны пока не рассчитаны.</div>';return;}
  out.innerHTML=rows.map(z=>{
    const ev=Number(z.evidence_workdays||0),near=Number(z.starts_within_150m||0),home=Number(z.home_like_stops_10m||0);
    const avg=z.avg_home_like_minutes!=null?' · средняя стоянка '+n(z.avg_home_like_minutes)+' мин':'';
    return '<div style="display:grid;grid-template-columns:minmax(130px,.7fr) minmax(260px,1.5fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--border)">'+
      '<div><b>'+esc(z.manager_name||'—')+'</b><div style="margin-top:5px">'+statusText(z)+'</div></div>'+
      '<div style="font-size:12px;line-height:1.5;color:var(--text)">'+
        '<b>'+near+' из '+ev+'</b> запусков GPS — в одной зоне радиусом 150 м.<br>'+
        'Стоянка ≥10 мин после включения: <b>'+home+'</b> раз'+avg+'.'+
      '</div>'+
      '<div>'+actions(z)+'</div>'+
    '</div>';
  }).join('');
}

async function load(force=false){
  if(!allowed())return;
  if(busy&&!force)return;
  const box=root();if(!box)return;
  busy=true;
  try{
    const {data,error}=await db.rpc('gps_home_zone_list_v236417',{});
    if(error)throw error;
    render(Array.isArray(data)?data:[]);
  }catch(e){
    const out=box.querySelector('#gps-home-list-v236419');
    if(out)out.innerHTML='<div style="padding:10px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;border-radius:8px;font-size:12px">Не удалось загрузить стартовые зоны: '+esc(e?.message||e)+'</div>';
  }finally{busy=false;}
}

window.crmGpsHomeZoneDecisionV236419=async function(manager,action){
  if(!allowed())return;
  const label=action==='confirm'
    ?'Подтвердить повторяющуюся стартовую зону '+manager+' как «Дом»? После этого стоянка ≥10 минут при включении GPS будет подписываться «🏠 Дом».'
    :action==='reject'
      ?'Отклонить эту стартовую зону для '+manager+'?'
      :'Снять текущее решение по стартовой зоне '+manager+'?';
  if(!confirm(label))return;
  try{
    const {error}=await db.rpc('gps_home_zone_decide_v236417',{p_manager_name:manager,p_action:action});
    if(error)throw error;
    await load(true);
  }catch(e){alert('Не удалось сохранить решение: '+(e?.message||e));}
};

function maybeLoad(){
  if(!allowed())return;
  if(document.getElementById('page-gps-control')?.classList.contains('active'))load(false);
}

document.addEventListener('click',e=>{
  if(e.target.closest?.('#nav-gps-control,#bn-gps-control,[onclick*="gps-control"]'))setTimeout(()=>load(true),180);
},true);
window.addEventListener('hashchange',()=>setTimeout(maybeLoad,120));
window.addEventListener('load',()=>setTimeout(maybeLoad,350),{once:true});
setTimeout(maybeLoad,900);

window.RESANTA_GPS_HOME_ZONES_V236419=Object.freeze({version:VERSION,directorOnly:true,noCoordinatesInUi:true});
})();