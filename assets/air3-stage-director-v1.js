/* AIR3 director stage: the REAL, authenticated CRM runs in a same-origin iframe.
   AIR3 sends only a server-validated page ID. No custom data dashboard or JSON
   projection, no Supabase device token in the browser and no credentials on AIR3.
   Never mirror the entire operator desktop: use macOS extended display. */
(function(){
 'use strict';
 if(window.__air3DirectorStageV1)return;
 window.__air3DirectorStageV1=true;
 const $=id=>document.getElementById(id);
 const END='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-ai360-air3-v2';
 const APP_ORIGIN='https://resanta-crm.by';
 const PUBLISHABLE='sb_publishable_BzH2PH0XD4jXrWYcbcs5FA_28uIMFbd';
 const DELAY=1900;
 const MAP=Object.freeze({
  operations:['dashboard'],sales:['sales'],debt:['debt'],triovist:['triovist','triovist-main'],
  vip:['vip'],promotions:['promotions'],clients:['clients'],tasks:['tasks'],
  routes:['routes-boss','my-routes'],gps:['gps-control'],stock:['warehouse-control','stock'],
  payments:['payments','payment-registry'],competitors:['competitors','triovist-competitors'],
  cards_21vek:['cards-21vek','triovist-cards'],motivation:['managers','motivation'],
  markdown:['markdown'],stands:['stands'],cash:['cash','receipts'],
  infographics:['infographics'],parser:['parser','competitor-parser'],
  alerts:['alerts'],visits:['visits'],abc:['abc'],budgets:['budgets'],
  'my-routes':['my-routes'],route:['route'],workday:['workday'],control:['control']
 });
 const LABEL=Object.freeze({
  operations:'Дашборд',sales:'Продажи',debt:'Задолженность',
  triovist:'Триовист',vip:'ВИП',promotions:'Акции',clients:'Клиенты',tasks:'Задачи',
  routes:'Маршруты',gps:'GPS',stock:'Остатки',payments:'Оплаты',
  competitors:'Конкуренты',cards_21vek:'Карточки',motivation:'Менеджеры',
  markdown:'Уценка',stands:'Стенды',cash:'Поступления',infographics:'Инфографика',
  parser:'Парсер',alerts:'Сигналы',visits:'История визитов',abc:'ABC-анализ',
  budgets:'Бюджеты', 'my-routes':'Мой маршрут',route:'Маршрут дня',
  workday:'Рабочий день',control:'Контроль'
 });
 let sb=null,stageId='',lastCommand='',timer=null,ready=false,opening=false,autoShow=false,frameStartedAt=0;
 const showMessage=(message,error=false)=>{
  $('stage-info').textContent=message;
  if(error)$('stage-error').textContent=message;
 };
 function shutter(reason){
  document.body.classList.remove('running');
  $('start').disabled=false;
  $('hide').disabled=!stageId;
  $('stop').disabled=!stageId;
  if(reason)showMessage(reason,true);
 }
 function show(){
  if(!ready){showMessage('CRM ещё загружается. Проверьте авторизацию.',true);return;}
  $('stage-error').textContent='';
  document.body.classList.add('running');
  $('hide').disabled=false;
  autoShow=false;
 }
 function stopPoll(){if(timer){clearInterval(timer);timer=null;}}
 function startPoll(){stopPoll();timer=setInterval(poll,DELAY);}
 async function auth(){
  if(!sb){
   if(!window.supabase?.createClient)throw Error('Не загрузился модуль авторизации');
   sb=window.supabase.createClient(
    'https://baqchjtvtmcfzwjjluhs.supabase.co',PUBLISHABLE,
    {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  }
  const s=await sb.auth.getSession();
  const token=s?.data?.session?.access_token;
  if(!token)throw Error('Войдите в РЕСАНТА CRM на MacBook');
  const verified=await sb.auth.getUser();
  const uid=verified?.data?.user?.id;
  if(!uid)throw Error('Сессия CRM не подтверждена');
  const p=await sb.from('users').select('role,name').eq('id',uid).maybeSingle();
  const name=String(p?.data?.name||'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
  if(p.error||p.data?.role!=='boss'||name!=='александр паюшин')
   throw Error('Режим конференции доступен только владельцу');
  return token;
 }
 async function call(action,data={}){
  const jwt=await auth();
  const r=await fetch(END,{method:'POST',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{'content-type':'application/json',authorization:'Bearer '+jwt},
   body:JSON.stringify({action,...data})});
  let result={};try{result=await r.json();}catch(_){}
  if(!r.ok||result.error)throw Error(String(result.error||'Сервис временно недоступен'));
  return result;
 }
 const norm=s=>String(s||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е')
  .replace(/[^а-яa-z0-9]+/g,' ').trim();
 function frameReady(){
  const doc=$('crm').contentDocument;
  const app=doc?.getElementById('app');
  return Boolean(app&&doc.defaultView?.getComputedStyle(app).display!=='none'&&doc.getElementById('nav-dashboard'));
 }
 function visible(button,doc){
  if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return false;
  // Respect existing CRM menu rights, including parent visibility.
  const w=doc.defaultView;
  for(let el=button;el&&el.nodeType===1;el=el.parentElement){
   if(w.getComputedStyle(el).display==='none'||w.getComputedStyle(el).visibility==='hidden')
    return false;
  }
  return true;
 }
 function navigate(domain){
  if(!Object.prototype.hasOwnProperty.call(MAP,domain))return;
  if(!frameReady()){ready=false;autoShow=false;shutter('CRM больше не авторизована — показ скрыт');return;}
  const doc=$('crm').contentDocument;
  let target=null;
  for(const id of MAP[domain]){
   const candidate=doc.getElementById('nav-'+id);
   if(visible(candidate,doc)){target=candidate;break;}
  }
  if(!target){
   const label=norm(LABEL[domain]);
   target=[...doc.querySelectorAll('.sidebar .nav-item')].find(b=>
    visible(b,doc)&&(norm(b.textContent).includes(label)||label.includes(norm(b.textContent))));
  }
  if(!target){
   showMessage('Раздел «'+(LABEL[domain]||domain)+'» скрыт или не загружен в текущей CRM');
   return;
  }
  // Use the EXACT menu click handler of the original CRM, including
  // page guards, dynamic Uni I/Uni X renderers and data freshness.
  target.click();
  showMessage('Открыт реальный раздел: '+(LABEL[domain]||domain));
 }
 async function poll(){
  if(!stageId||opening||document.hidden)return;
  try{
   const r=await call('stage_poll',{stage_id:stageId});
   if(r.status!=='active')throw Error('Показ завершён');
   if(!frameReady()){
    const wasReady=ready;
    ready=false;
    if(wasReady || (frameStartedAt&&Date.now()-frameStartedAt>25000)){
      autoShow=false;shutter('Оригинальная CRM требует повторной авторизации. Показ скрыт.');
    }else showMessage('Загрузка оригинальной CRM…');
    return;
   }
   ready=true;
   if(autoShow)show();
   if(r.command_id&&r.command_id!==lastCommand){
    lastCommand=r.command_id;
    if(r.page_id)navigate(r.page_id);
   }
  }catch(e){
   stopPoll();stageId='';
   shutter('Показ остановлен: '+String(e.message||e));
  }
 }
 function loadFrame(){
  const iframe=$('crm');
  if(!iframe.getAttribute('src')){
   frameStartedAt=Date.now();
   iframe.setAttribute('src','./index.html');
   iframe.addEventListener('load',()=>{
    setTimeout(()=>{
     ready=frameReady();
     if(!ready)showMessage('В окне CRM требуется вход или загрузка',true);
     else{showMessage('Настоящая CRM готова для демонстрации');if(autoShow)show();}
    },1000);
   });
  }else{
   ready=frameReady();if(ready&&autoShow)show();
  }
 }
 async function open(){
  if(opening)return;
  opening=true;$('start').disabled=true;$('stage-error').textContent='';
  try{
   const r=await call('stage_open');
   if(!r.stage_id)throw Error('Канал конференции не создан');
   stageId=r.stage_id;
   lastCommand='';autoShow=true;
   showMessage('Очки подключены. Показываю оригинальную CRM…');
   $('stop').disabled=false;
   loadFrame();
   startPoll();
  }catch(e){shutter('Не удалось включить конференцию: '+String(e.message||e));}
  finally{opening=false;}
 }
 async function close(){
  const id=stageId;
  stopPoll();stageId='';lastCommand='';ready=false;
  $('crm').removeAttribute('src');shutter('Показ закрыт. Данные скрыты.');
  if(id)try{await call('stage_close',{stage_id:id});}catch(_){}
 }
 window.addEventListener('DOMContentLoaded',()=>{
  if(location.origin!==APP_ORIGIN&&location.hostname!=='localhost'){
   shutter('Откройте эту страницу на resanta-crm.by');
   $('start').disabled=true;return;
  }
  $('start').addEventListener('click',open);
  $('hide').addEventListener('click',()=>{autoShow=false;shutter('Показ временно скрыт')});
  $('stop').addEventListener('click',close);
  window.addEventListener('pagehide',stopPoll);
  showMessage('Выведите это окно на расширенный экран проектора, затем включите показ');
 });
})();
