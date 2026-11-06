/* GPS360 one-time check of the exact physical store, manager-only.
   Does not touch original visits, routes or native GPS; works inside Android WebView. */
(function(w,d){
'use strict';
if(w.RESANTA_GPS360_STORE_VERIFY_V1)return;
const VERSION='gps360-geo-once-20261106';
const KEY='resanta_gps360_geo_queue_v1',PROMPTED='resanta_gps360_geo_prompted_v1';
let active=null,sending=false,ready=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prof=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:w.currentProfile}catch(_){return w.currentProfile}};
const manager=()=>prof()?.role==='manager'&&['Руднев','Ачинович','Шкуран'].includes(prof()?.name);
const email=()=>String(prof()?.email||'').toLowerCase();
const client=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
const read=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(_){return []}};
const write=(key,rows)=>{try{localStorage.setItem(key,JSON.stringify(rows.slice(-70)))}catch(e){console.warn('GPS360 local queue error',e)}};
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function style(){
 if(d.getElementById('gps360-store-geo-style'))return;
 const s=d.createElement('style');s.id='gps360-store-geo-style';
 s.textContent='#gps360-store-geo-once{position:fixed;z-index:100500;bottom:16px;left:16px;right:16px;max-width:410px;margin:0 auto;background:white;border:2px solid #91b5ec;border-radius:15px;box-shadow:0 12px 32px #223a5d44;padding:15px;color:#142e4b;font-family:inherit;font-size:13px}#gps360-store-geo-once strong{font-size:15px}#gps360-store-geo-once .g-small{font-size:11px;color:#667b92;margin:7px 0}#gps360-store-geo-once button{padding:10px 12px;border:1px solid #ccdbed;border-radius:9px;background:#fff;color:#194f84;font-size:12px;font-weight:800;cursor:pointer}#gps360-store-geo-once button.main{background:#1a63bc;color:#fff;border-color:#1a63bc}#gps360-store-geo-once .g-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}#gps360-store-geo-once button:disabled{opacity:.6}';
 d.head.appendChild(s);
}
function close(){const el=d.getElementById('gps360-store-geo-once');if(el)el.remove();active=null}
function notice(msg){
 const el=d.getElementById('gps360-store-geo-once');if(el){
  const p=el.querySelector('[data-g-message]');if(p)p.textContent=msg;
 }
}
function show(evt,preview){
 if(!manager()||active)return;
 style();
 const info={...evt,client:preview.client,city:preview.city,address:preview.address};
 active=info;
 let el=d.getElementById('gps360-store-geo-once');
 if(!el){el=d.createElement('aside');el.id='gps360-store-geo-once';el.setAttribute('role','dialog');el.setAttribute('aria-label','Уточнить место магазина');d.body.appendChild(el)}
 el.innerHTML='<strong>📍 Уточнить торговую точку?</strong>'+
  '<div class="g-small">'+esc(info.client||'Торговая точка')+' · '+esc(info.city||'')+' · '+esc(info.address||'')+
  '</div><div class="g-small">Телефон определил местоположение с точностью ±'+Math.round(info.accuracy)+
  ' м. Привязать именно этот магазин? Подтверждение требуется только один раз.</div>'+
  '<div class="g-small" data-g-message>Исходные треки и визиты не изменяются.</div>'+
  '<div class="g-row"><button type="button" class="main" data-g-yes>Подтвердить</button>'+
  '<button type="button" data-g-no>Не здесь</button><button type="button" data-g-later>Позже</button></div>';
}
function marked(route){
 const list=read(PROMPTED),now=Date.now(),valid=list.filter(x=>x.actor===email()&&now-x.time<7*864e5);
 return valid.some(x=>x.route===route);
}
function mark(route){
 const rows=read(PROMPTED);rows.push({route,actor:email(),time:Date.now()});write(PROMPTED,rows);
}
async function preview(evt){
 if(!manager()||!evt?.route_plan_id||active||marked(evt.route_plan_id))return false;
 if(!Number.isFinite(Number(evt.lat))||!Number.isFinite(Number(evt.lng))||!(evt.accuracy>0&&evt.accuracy<=60))return false;
 if(!navigator.onLine)return false; // do not request store privacy data without server permission
 const api=client();if(!api?.rpc)return false;
 const r=await api.rpc('gps360_store_onsite_preview_v20261106',{
  p_route_plan_id:evt.route_plan_id,p_accuracy_m:evt.accuracy
 });
 if(r.error)throw r.error;
 if(r.data?.prompt){mark(evt.route_plan_id);show(evt,r.data);return true}
 return false;
}
async function send(item,choice){
 const api=client();if(!api?.rpc)throw Error('Связь с CRM отсутствует');
 const r=await api.rpc('gps360_store_onsite_decide_v20261106',{
  p_route_plan_id:item.route_plan_id,p_lat:item.lat,p_lng:item.lng,
  p_accuracy_m:item.accuracy,p_observed_at:item.taken_at,p_choice:choice
 });if(r.error)throw r.error;return r.data;
}
async function retry(route){
 const api=client();if(!api?.rpc)return;
 try{const r=await api.rpc('gps360_store_onsite_retry_v20261106',{p_route_plan_id:route});
  if(r.error)throw r.error;if(r.data?.status==='verified')console.info('GPS360 точка подтверждена исходным GPS-треком');
 }catch(e){console.warn('GPS360 проверка синхронизации отложена',e?.message||e)}
}
async function decide(choice){
 if(sending||!active)return;
 const item=active;sending=true;
 const el=d.getElementById('gps360-store-geo-once');
 el?.querySelectorAll('button').forEach(b=>b.disabled=true);
 notice('Сохраняю решение и сверяю GPS…');
 const queued={...item,choice,actor:email(),queuedAt:Date.now()};
 try{
  const result=await send(item,choice);
  if(!result?.ok)throw Error('Сервер не подтвердил сохранение');
  if(result.status==='pending_sync'){
   notice('Решение принято. Координаты будут проверены после синхронизации GPS. Повторно отвечать не нужно.');
   setTimeout(()=>retry(item.route_plan_id),12000);
   setTimeout(()=>retry(item.route_plan_id),45000);
  }else if(result.status==='verified'||result.status==='already_verified'){
   notice('✓ Координаты магазина подтверждены GPS и сохранены.');
  }else if(result.status==='conflict')notice('Точка рядом с другим магазином — отправлена на дополнительную проверку.');
  else notice('Решение сохранено.');
  setTimeout(close,4000);
 }catch(e){
  // Offline / network interruption: keep only a bounded, user-specific local queue.
  if(!navigator.onLine||/network|fetch|timeout|соединени|offline|load failed|failed to fetch/i.test(String(e?.message||e))){
   const rows=read(KEY).filter(x=>x.actor===email()&&Date.now()-x.queuedAt<7*864e5);
   if(!rows.some(x=>x.route_plan_id===queued.route_plan_id&&x.choice===choice))rows.push(queued);
   write(KEY,rows);notice('Нет сети. Подтверждение сохранено на устройстве и будет отправлено при соединении.');
   setTimeout(close,4500);
  }else{
   notice('Не удалось сохранить: '+String(e?.message||e).slice(0,130));
   el?.querySelectorAll('button').forEach(b=>b.disabled=false);
  }
 }finally{sending=false}
}
async function flush(){
 if(!manager()||!navigator.onLine||sending)return;
 const rows=read(KEY).filter(x=>x.actor===email()&&Date.now()-x.queuedAt<7*864e5);
 if(!rows.length)return;
 sending=true;
 const pending=[];
 for(const x of rows){
  try{
   const api=client();const p=await api.rpc('gps360_store_onsite_preview_v20261106',{p_route_plan_id:x.route_plan_id,p_accuracy_m:x.accuracy});
   if(p.error)throw p.error;
   if(p.data?.prompt){
    const result=await send(x,x.choice);if(!result?.ok)throw Error('Pending response');
   }
  }catch(e){pending.push(x);if(!navigator.onLine)break}
 }
 write(KEY,pending);sending=false;
}
d.addEventListener('click',e=>{
 const t=e.target;if(!t.closest?.('#gps360-store-geo-once'))return;
 if(t.closest('[data-g-yes]'))decide('confirm');
 if(t.closest('[data-g-no]'))decide('not_here');
 if(t.closest('[data-g-later]'))close();
},true);
w.addEventListener('resanta-gps360-store-check',e=>{
 if(!manager())return;
 Promise.resolve().then(()=>preview(e.detail)).catch(err=>console.warn('GPS360 store preview nonblocking:',err?.message||err));
});
w.addEventListener('online',()=>{flush().catch(()=>{})});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',()=>flush().catch(()=>{}),{once:true});
else Promise.resolve().then(()=>flush().catch(()=>{}));
w.RESANTA_GPS360_STORE_VERIFY_V1=Object.freeze({version:VERSION,preview,flush,managerOnly:true,exactPhysicalStore:true,neverChangesRawGps:true});
})(window,document);
