/* RESANTA CRM v23.6.4 · actual GPS visit order */
(function(){
'use strict';
const V='v23.6.4',src=document.currentScript?.src||'';
let child=false;try{child=new URL(src,location.href).searchParams.get('child')==='1'}catch(_){}
if(!child){
  if(window.RESANTA_GPS_VISIT_ORDER_V2364)return;
  function open(id){
    if(!id)return;
    const w=window.open('./assets/gps-viewer-v2360.html?workday='+encodeURIComponent(id)+'&v=23.6.4&_='+Date.now(),'_blank');
    if(!w)return;
    const inject=()=>{try{if(w.closed||w.location.origin!==location.origin)return false;const d=w.document;if(d.querySelector('script[data-v2364]'))return true;const s=d.createElement('script');s.src='./26-gps-visit-order-v2364.js?child=1&_='+Date.now();s.dataset.v2364='1';d.head.appendChild(s);return true}catch(_){return false}};
    try{w.addEventListener('load',inject,{once:true})}catch(_){}
    let n=0;const t=setInterval(()=>{n++;if(inject()||w.closed||n>30)clearInterval(t)},200);
  }
  function install(){window.crmOpenGpsViewerV2360=open;try{crmOpenGpsViewerV2360=open}catch(_){}window.v19OpenGpsWorkday=open;try{v19OpenGpsWorkday=open}catch(_){}}
  install();setTimeout(install,500);setTimeout(install,1500);
  window.RESANTA_GPS_VISIT_ORDER_V2364={version:V};
  return;
}
if(window.RESANTA_GPS_VISIT_ORDER_V2364_CHILD)return;
if(typeof render!=='function'||typeof drawMap!=='function'||typeof coord!=='function')return;
let ev=[],marks=new Map();
const key=(k,r)=>k==='p'?'p:'+(r.route_plan_id||r.client_id||r.client_name||''):'o:'+(r.visit_id||r.client_id||r.client_name||'');
const visited=p=>['confirmed','gps_and_report','gps_only'].includes(String(p?.state||''));
function build(a){
  const x=[];
  for(const p of (a.planned_points||[])){if(!visited(p))continue;const t=p.visit_created_at||p.stop_start_at||p.stop_end_at||null;x.push({k:key('p',p),t,ms:t?new Date(t).getTime():Infinity,n:p.client_name||'Клиент',c:coord(p.lat,p.lng)||coord(p.report_gps_lat,p.report_gps_lng),p,kind:'p'})}
  for(const o of (a.offplan_visits||[])){const t=o.created_at||null;x.push({k:key('o',o),t,ms:t?new Date(t).getTime():Infinity,n:o.client_name||'Клиент',c:coord(o.lat,o.lng),o,kind:'o'})}
  x.sort((a,b)=>a.ms-b.ms||a.n.localeCompare(b.n,'ru'));x.forEach((z,i)=>z.no=i+1);return x;
}
const pe=p=>ev.find(x=>x.k===key('p',p));
function ui(){
  if(!document.getElementById('v2364style')){const s=document.createElement('style');s.id='v2364style';s.textContent='.v2364bar{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 12px}.v2364chip{border:1px solid #BFDBFE;background:#F8FBFF;border-radius:9px;padding:7px 9px;cursor:pointer}.v2364chip b,.v2364actual{color:#1D4ED8;font-weight:800}@media(max-width:760px){.v2364chip{display:block;width:100%;margin-bottom:5px}}';document.head.appendChild(s)}
  if(!document.getElementById('v2364wrap')){const m=document.getElementById('map');if(m){const w=document.createElement('div');w.id='v2364wrap';w.innerHTML='<div style="font-size:12px;font-weight:800">Фактический порядок визитов</div><div id="v2364bar" class="v2364bar"></div>';m.parentNode.insertBefore(w,m)}}
}
function decorate(a){
  ui();const bar=document.getElementById('v2364bar'),wrap=document.getElementById('v2364wrap');
  if(bar&&wrap){wrap.style.display=ev.length?'block':'none';bar.innerHTML=ev.map(x=>'<button class="v2364chip" onclick="focusVisitV2364('+x.no+')"><b>№'+x.no+'</b> '+(x.t?esc(tm(x.t)):'—')+' · '+esc(x.n)+'</button>').join('')}
  const rows=[...document.querySelectorAll('#visits .visit')],plans=a.planned_points||[];
  rows.forEach((r,i)=>{const p=plans[i];if(!p)return;const num=r.querySelector('.num');if(num)num.textContent='П'+(p.sort_order||'?');const x=pe(p),last=r.children[2];if(last){last.querySelector('[data-v2364-order]')?.remove();if(x){const d=document.createElement('div');d.dataset.v2364Order='1';d.className='v2364actual';d.textContent='Визит №'+x.no+(x.t?' · '+tm(x.t):'');last.prepend(d)}}});
}
const baseDraw=drawMap;
drawMap=async function(a){
  await baseDraw(a);marks=new Map();
  if(!map||!window.ymaps)return;
  for(const x of ev){if(!x.c)continue;let preset='islands#greenCircleIcon',warn=false;if(x.kind==='o')preset='islands#blueCircleIcon';else{warn=!!x.p.gps_warning||String(x.p.state||'')==='report_no_gps';if(warn)preset='islands#yellowCircleIcon'}const m=new ymaps.Placemark(x.c,{iconContent:String(x.no),hintContent:'№'+x.no+' · '+x.n,balloonContent:'<b>Визит №'+x.no+(x.t?' · '+tm(x.t):'')+'</b><br>'+esc(x.n)+(warn?'<br>⚠ GPS требует проверки':'')},{preset});map.geoObjects.add(m);marks.set(x.no,m)}
};
window.focusVisitV2364=function(no){const x=ev.find(z=>z.no===Number(no));if(!x?.c||!map)return;map.setCenter(x.c,16);try{marks.get(x.no)?.balloon.open()}catch(_){}};
const baseRender=render;
render=function(a){ev=build(a);const r=baseRender(a);decorate(a);return r};
window.RESANTA_GPS_VISIT_ORDER_V2364_CHILD={version:V};
try{if(typeof aggregate!=='undefined'&&aggregate)render(aggregate)}catch(e){console.warn('GPS visit order '+V,e)}
})();