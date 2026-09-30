/* RESANTA CRM v23.6.177 · Orders tab guard, isolated from existing warehouse routing. */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_ORDERS_TAB_V1)return;
let opening=false,observer=null;
function actorEmail(){
 try{
  const p=typeof currentProfile!=='undefined'&&currentProfile?currentProfile:window.currentProfile;
  return String(p?.email||'').trim().toLowerCase();
 }catch(_){return''}
}
function allowed(){return ['vitebsk@resanta.ru','payushin_ar@resanta.ru'].includes(actorEmail())}
function install(){
 if(!allowed())return;
 const tabs=document.querySelector('#wc-v23620 .wc-tabs');
 if(!tabs||tabs.querySelector('[data-mode="orders"]'))return;
 const btn=document.createElement('button');
 btn.type='button';btn.className='wc-tab';btn.dataset.mode='orders';btn.textContent='📦 Заказы';
 const receiving=tabs.querySelector('[data-mode="receiving"]');
 if(receiving)receiving.insertAdjacentElement('afterend',btn);else tabs.appendChild(btn);
}
document.addEventListener('click',async e=>{
 const btn=e.target?.closest?.('#wc-v23620 .wc-tab[data-mode="orders"]');
 if(!btn)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 if(!allowed()||opening)return;
 const body=document.getElementById('wc-body');if(!body)return;
 opening=true;
 document.querySelectorAll('#wc-v23620 .wc-tab').forEach(x=>x.classList.toggle('active',x===btn));
 try{
  if(typeof window.crmWarehouseOrdersV1?.open!=='function')throw Error('Модуль заказов ещё не загрузился. Обновите CRM.');
  await window.crmWarehouseOrdersV1.open(body);
 }catch(err){
  body.textContent='Не удалось открыть защищённый раздел «Заказы»: '+String(err?.message||err);
 }finally{opening=false}
},true);
function watch(){
 if(observer)return;
 const host=document.getElementById('page-warehouse-control')||document.body;
 observer=new MutationObserver(install);
 observer.observe(host,{childList:true,subtree:true});
 install();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});
else watch();
window.addEventListener('pageshow',install);
window.RESANTA_WAREHOUSE_ORDERS_TAB_V1=Object.freeze({version:'v23.6.177',isolated:true});
})();