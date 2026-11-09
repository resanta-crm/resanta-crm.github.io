/* Unified director GPS-map launcher. Never silently swallows a click. */
(function(){
'use strict';
if(window.crmGpsOpenFocusV20261109)return;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function open(workday,opts={}){
 const id=String(workday||'');
 if(!uuid.test(id)){window.alert?.('Карта не открыта: отсутствует корректный GPS-день для выбранной записи.');return false}
 const url=new URL('./assets/gps-viewer-v2360.html',window.location.href);
 url.searchParams.set('workday',id);
 url.searchParams.set('v','20261109-gps360-focus');
 const stop=Number(opts.stop_seq);
 if(Number.isInteger(stop)&&stop>0&&stop<10000){
   url.searchParams.set('focus','stop');url.searchParams.set('stop_seq',String(stop));
 }
 const plan=String(opts.route_plan_id||'');
 if(uuid.test(plan)){url.searchParams.set('focus','case');url.searchParams.set('route_plan_id',plan)}
 const href=url.toString();
 try{
   const popup=window.open(href,'_blank');
   if(!popup){
     if(window.confirm?.('Браузер заблокировал новую вкладку GPS. Открыть карту в текущей вкладке?')){
       window.location.assign(href);return true;
     }
     window.alert?.('Разрешите всплывающие вкладки для resanta-crm.by и повторите открытие карты.');
     return false;
   }
   try{popup.opener=null}catch(_){}
   try{popup.focus()}catch(_){}
   return true;
 }catch(err){
   window.alert?.('Не удалось открыть GPS-карту: '+String(err?.message||err));
   return false;
 }
}
window.crmGpsOpenFocusV20261109=open;
window.RESANTA_GPS_MAP_OPEN_V20261109=Object.freeze({version:'2026-11-09-v1',readOnly:true});
})();