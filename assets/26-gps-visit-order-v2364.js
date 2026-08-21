/* RESANTA CRM v23.6.5 · actual visit order + all off-plan GPS visits */
(function(){
'use strict';
const V='v23.6.5',src=document.currentScript?.src||'';
let child=false;try{child=new URL(src,location.href).searchParams.get('child')==='1'}catch(_){}

function patchRpc2365(){
  try{
    if(typeof db==='undefined'||!db?.rpc||db.__gpsV2365Patched)return false;
    const baseRpc=db.rpc.bind(db);
    db.rpc=function(fn,args,opts){
      let target=fn;
      if(fn==='gps_get_control_workdays_director_v2362')target='gps_get_control_workdays_director_v2365';
      if(fn==='gps_get_workday_aggregate_director_v2362')target='gps_get_workday_aggregate_director_v2365';
      if(fn==='gps_rebuild_workday_aggregate_v2362')target='gps_rebuild_workday_aggregate_v2365';
      if(target===fn)return baseRpc(fn,args,opts);
      return (async()=>{
        const res=await baseRpc(target,args,opts);
        if(!child&&fn==='gps_get_control_workdays_director_v2362'&&!res?.error){
          window.RESANTA_GPS_CONTROL_ROWS_V2365=Array.isArray(res?.data)?res.data:[];
          setTimeout(decorateDirectorTable,0);
          setTimeout(decorateDirectorTable,80);
        }
        return res;
      })();
    };
    db.__gpsV2365Patched=true;
    return true;
  }catch(e){console.warn('GPS '+V+' RPC patch',e);return false;}
}

function decorateDirectorTable(){
  if(child)return;
  try{
    const rows=window.RESANTA_GPS_CONTROL_ROWS_V2365||[];
    const trs=[...document.querySelectorAll('#gps-control-list tbody tr')];
    trs.forEach((tr,i)=>{
      const w=rows[i];if(!w)return;
      const gps=Number(w.offplan_gps_count)||0,amb=Number(w.offplan_gps_ambiguous_count)||0;
      const cells=tr.children;if(cells.length<8)return;
      const visitCell=cells[5],controlCell=cells[7];
      visitCell.querySelectorAll('[data-gps-v2365]').forEach(x=>x.remove());
      controlCell.querySelectorAll('[data-gps-v2365]').forEach(x=>x.remove());
      if(gps){
        const v=document.createElement('div');v.dataset.gpsV2365='1';v.style.cssText='font-size:10px;color:#0F766E;font-weight:700;margin-top:3px';
        v.textContent='+ '+gps+' GPS вне плана без отчёта';visitCell.appendChild(v);
        const plain=[...controlCell.querySelectorAll('span')].find(x=>/Без отклонений/i.test(x.textContent||''));if(plain)plain.remove();
        const c=document.createElement('div');c.dataset.gpsV2365='1';c.style.cssText='font-size:11px;color:#0F766E;font-weight:800;margin-top:3px';
        c.textContent='📍 GPS вне плана: '+gps+(amb?' · уточнить '+amb:'');controlCell.appendChild(c);
      }
    });
    const kpis=[...document.querySelectorAll('#gps-control-kpi .kpi')];
    if(kpis[1]){
      kpis[1].querySelectorAll('[data-gps-v2365]').forEach(x=>x.remove());
      const gpsTotal=rows.reduce((s,x)=>s+(Number(x.offplan_gps_count)||0),0);
      if(gpsTotal){
        const d=document.createElement('div');d.dataset.gpsV2365='1';d.style.cssText='font-size:10px;color:#0F766E;font-weight:700;margin-top:4px';
        d.textContent='ещё GPS вне плана: '+gpsTotal;kpis[1].appendChild(d);
      }
    }
  }catch(e){console.warn('GPS '+V+' director decorate',e);}
}

if(!child){
  if(window.RESANTA_GPS_VISIT_ORDER_V2364?.version===V)return;
  patchRpc2365();
  let tries=0;const rpcTimer=setInterval(()=>{tries++;if(patchRpc2365()||tries>=30)clearInterval(rpcTimer)},200);

  function open(id){
    if(!id)return;
    const w=window.open('./assets/gps-viewer-v2360.html?workday='+encodeURIComponent(id)+'&v=23.6.5&_='+Date.now(),'_blank');
    if(!w)return;
    const inject=()=>{try{
      if(w.closed||w.location.origin!==location.origin)return false;
      const d=w.document;if(d.querySelector('script[data-v2365]'))return true;
      const s=d.createElement('script');s.src='./26-gps-visit-order-v2364.js?child=1&v=23.6.5&_='+Date.now();s.dataset.v2365='1';d.head.appendChild(s);return true;
    }catch(_){return false}};
    try{w.addEventListener('load',inject,{once:true})}catch(_){}
    let n=0;const t=setInterval(()=>{n++;if(inject()||w.closed||n>40)clearInterval(t)},200);
  }
  function install(){
    patchRpc2365();
    window.crmOpenGpsViewerV2360=open;try{crmOpenGpsViewerV2360=open}catch(_){}
    window.v19OpenGpsWorkday=open;try{v19OpenGpsWorkday=open}catch(_){}
    setTimeout(decorateDirectorTable,100);
  }
  install();setTimeout(install,500);setTimeout(install,1500);
  window.RESANTA_GPS_VISIT_ORDER_V2364={version:V,offplanGps:true,rpc:'v2365'};
  return;
}

if(window.RESANTA_GPS_VISIT_ORDER_V2364_CHILD?.version===V)return;
if(typeof render!=='function'||typeof drawMap!=='function'||typeof coord!=='function')return;
patchRpc2365();

let ev=[],marks=new Map();
const key=(k,r)=>k==='p'?'p:'+(r.route_plan_id||r.client_id||r.client_name||''):k==='o'?'o:'+(r.visit_id||r.client_id||r.client_name||''):'g:'+(r.cluster_id||r.first_seq||r.start_at||'');
const visited=p=>['confirmed','gps_and_report','gps_only'].includes(String(p?.state||''));

function build(a){
  const x=[];
  for(const p of (a.planned_points||[])){
    if(!visited(p))continue;
    const t=p.visit_created_at||p.stop_start_at||p.stop_end_at||null;
    x.push({k:key('p',p),t,ms:t?new Date(t).getTime():Infinity,n:p.client_name||'Клиент',c:coord(p.lat,p.lng)||coord(p.report_gps_lat,p.report_gps_lng),p,kind:'p'});
  }
  for(const o of (a.offplan_visits||[])){
    const t=o.created_at||null;
    x.push({k:key('o',o),t,ms:t?new Date(t).getTime():Infinity,n:o.client_name||'Клиент',c:coord(o.lat,o.lng),o,kind:'o'});
  }
  for(const g of (a.offplan_gps_stops||[])){
    const t=g.start_at||null;
    const n=g.ambiguous?'Несколько клиентов рядом':(g.client_name||'GPS вне плана');
    x.push({k:key('g',g),t,ms:t?new Date(t).getTime():Infinity,n,c:coord(g.lat,g.lng),g,kind:'g'});
  }
  x.sort((a,b)=>a.ms-b.ms||a.n.localeCompare(b.n,'ru'));
  x.forEach((z,i)=>z.no=i+1);
  return x;
}
const pe=p=>ev.find(x=>x.k===key('p',p));
const ge=g=>ev.find(x=>x.k===key('g',g));

function ui(){
  if(!document.getElementById('v2365style')){
    const s=document.createElement('style');s.id='v2365style';
    s.textContent='.v2364bar{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 12px}.v2364chip{border:1px solid #BFDBFE;background:#F8FBFF;border-radius:9px;padding:7px 9px;cursor:pointer}.v2364chip b,.v2364actual{color:#1D4ED8;font-weight:800}.v2365gps{border:1px solid #99F6E4;background:#F0FDFA;border-radius:10px;padding:11px;margin-top:8px}.v2365amb{border-color:#FDE68A;background:#FFFBEB}.v2365cand{font-size:12px;margin-top:4px;color:#374151}@media(max-width:760px){.v2364chip{display:block;width:100%;margin-bottom:5px}}';
    document.head.appendChild(s);
  }
  if(!document.getElementById('v2364wrap')){
    const m=document.getElementById('map');if(m){
      const w=document.createElement('div');w.id='v2364wrap';
      w.innerHTML='<div style="font-size:12px;font-weight:800">Фактический порядок визитов</div><div id="v2364bar" class="v2364bar"></div>';
      m.parentNode.insertBefore(w,m);
    }
  }
  if(!document.getElementById('v2365gpscard')){
    const anchor=document.getElementById('offplanCard')||document.querySelector('details.diag');
    if(anchor){
      const card=document.createElement('div');card.id='v2365gpscard';card.className='card hide';
      card.innerHTML='<b>📍 Внеплановые GPS-визиты без отчёта</b><div class="muted" style="margin-top:5px">Физическая остановка у клиента ≥5 минут. Это контрольный GPS-факт и он не засчитывается в утверждённый план без отчёта менеджера.</div><div id="v2365gpslist" style="margin-top:8px"></div>';
      anchor.parentNode.insertBefore(card,anchor.nextSibling);
    }
  }
}

function renderGpsOnly(a){
  ui();
  const rows=Array.isArray(a.offplan_gps_stops)?a.offplan_gps_stops:[];
  const card=document.getElementById('v2365gpscard'),list=document.getElementById('v2365gpslist');
  if(!card||!list)return;
  if(!rows.length){card.classList.add('hide');list.innerHTML='';return;}
  card.classList.remove('hide');
  list.innerHTML=rows.map(g=>{
    const x=ge(g),no=x?.no||'?',time=(g.start_at?tm(g.start_at):'—')+(g.end_at?'—'+tm(g.end_at):''),mins=Number(g.minutes||0).toLocaleString('ru-RU',{maximumFractionDigits:1});
    if(g.ambiguous){
      const cand=(g.candidates||[]).map(c=>'<div class="v2365cand">• '+esc(c.client_name||'Клиент')+(c.address?' — '+esc(c.address):'')+(c.distance_m!=null?' · '+esc(dist(c.distance_m)):'')+'</div>').join('');
      return '<div class="v2365gps v2365amb"><div><b>№'+no+' · '+esc(time)+' · '+mins+' мин</b></div><div style="font-weight:800;color:#92400E;margin-top:4px">⚠ Несколько клиентов рядом — требуется уточнение</div>'+cand+'<button class="btn" style="margin-top:7px" onclick="focusVisitV2364('+no+')">Показать на карте</button></div>';
    }
    return '<div class="v2365gps"><div><b>№'+no+' · '+esc(time)+' · '+mins+' мин</b></div><div style="font-weight:800;margin-top:4px">📍 '+esc(g.client_name||'Клиент')+'</div><div class="muted">'+esc([g.city,g.address].filter(Boolean).join(', '))+(g.distance_m!=null?' · GPS '+esc(dist(g.distance_m)):'')+'</div><div style="font-size:12px;color:#0F766E;font-weight:800;margin-top:4px">Вне утверждённого плана'+(g.route_not_approved?' · маршрут не согласован':' · отчёт менеджера не заполнен')+'</div><button class="btn" style="margin-top:7px" onclick="focusVisitV2364('+no+')">Показать на карте</button></div>';
  }).join('');
}

function decorate(a){
  ui();
  const bar=document.getElementById('v2364bar'),wrap=document.getElementById('v2364wrap');
  if(bar&&wrap){
    wrap.style.display=ev.length?'block':'none';
    bar.innerHTML=ev.map(x=>{
      const extra=x.kind==='g'?' · GPS вне плана':'';
      return '<button class="v2364chip" onclick="focusVisitV2364('+x.no+')"><b>№'+x.no+'</b> '+(x.t?esc(tm(x.t)):'—')+' · '+esc(x.n)+extra+'</button>';
    }).join('');
  }
  const rows=[...document.querySelectorAll('#visits .visit')],plans=a.planned_points||[];
  rows.forEach((r,i)=>{
    const p=plans[i];if(!p)return;
    const num=r.querySelector('.num');if(num)num.textContent='П'+(p.sort_order||'?');
    const x=pe(p),last=r.children[2];
    if(last){
      last.querySelector('[data-v2364-order]')?.remove();
      if(x){const d=document.createElement('div');d.dataset.v2364Order='1';d.className='v2364actual';d.textContent='Визит №'+x.no+(x.t?' · '+tm(x.t):'');last.prepend(d);}
    }
  });
  const ms=document.getElementById('mapStatus');
  if(ms){
    const gps=Number(a.offplan_gps_count)||0;
    if(gps&&!String(ms.textContent||'').includes('GPS вне плана')){
      ms.textContent=(ms.textContent||'').replace(/\s*$/,'')+' · GPS вне плана без отчёта: '+gps+'.';
    }
  }
  renderGpsOnly(a);
}

const baseDraw=drawMap;
drawMap=async function(a){
  await baseDraw(a);marks=new Map();
  if(!map||!window.ymaps)return;
  for(const x of ev){
    if(!x.c)continue;
    let preset='islands#greenCircleIcon',warn=false,balloonExtra='';
    if(x.kind==='o'){
      preset='islands#blueCircleIcon';
      balloonExtra='<br>Внеплановый визит · отчёт записан';
    }else if(x.kind==='g'){
      const amb=!!x.g.ambiguous;
      preset=amb?'islands#yellowCircleIcon':'islands#blueCircleIcon';
      warn=amb;
      if(amb){
        const cand=(x.g.candidates||[]).slice(0,8).map(c=>'• '+esc(c.client_name||'Клиент')+(c.distance_m!=null?' · '+esc(dist(c.distance_m)):'')).join('<br>');
        balloonExtra='<br><b>⚠ Несколько клиентов рядом — требуется уточнение</b><br>'+cand;
      }else{
        balloonExtra='<br><b>📍 GPS вне плана</b><br>'+esc([x.g.city,x.g.address].filter(Boolean).join(', '))+(x.g.distance_m!=null?'<br>Расстояние до клиента: '+esc(dist(x.g.distance_m)):'')+'<br>Отчёт менеджера не заполнен';
      }
    }else{
      warn=!!x.p.gps_warning||String(x.p.state||'')==='report_no_gps';
      if(warn)preset='islands#yellowCircleIcon';
    }
    const m=new ymaps.Placemark(x.c,{
      iconContent:String(x.no),
      hintContent:'№'+x.no+' · '+x.n,
      balloonContent:'<b>Визит №'+x.no+(x.t?' · '+tm(x.t):'')+'</b><br>'+esc(x.n)+(warn&&x.kind!=='g'?'<br>⚠ GPS требует проверки':'')+balloonExtra
    },{preset});
    map.geoObjects.add(m);marks.set(x.no,m);
  }
};

window.focusVisitV2364=function(no){
  const x=ev.find(z=>z.no===Number(no));if(!x?.c||!map)return;
  map.setCenter(x.c,16);try{marks.get(x.no)?.balloon.open()}catch(_){}
};

const baseRender=render;
render=function(a){ev=build(a);const r=baseRender(a);decorate(a);return r;};

window.RESANTA_GPS_VISIT_ORDER_V2364_CHILD={version:V,offplanGps:true};
try{
  if(typeof aggregate!=='undefined'&&aggregate)render(aggregate);
  if(typeof boot==='function')setTimeout(()=>boot(true,true),50);
}catch(e){console.warn('GPS visit order '+V,e)}
})();