/* Product names in route cards; approved data and the core renderer stay intact. */
(function(w){
'use strict';
if(w.RESANTA_ROUTE_TASK_PRODUCTS_V1||typeof routeTaskHtml!=='function')return;
const original=routeTaskHtml;
function displayTask(t){
 if(!t||typeof t!=='object')return t;
 const source=String(t.text||'');let text=source;
 for(const item of Array.isArray(t.ai_stock_items)?t.ai_stock_items:[]){
  if(!item||typeof item!=='object')continue;
  const sku=String(item.sku||'').trim();let product=String(item.product||'').trim();
  if(!product&&sku&&typeof allPrice!=='undefined'){
   const names=[...new Set((allPrice||[]).filter(x=>String(x.sku||'').trim()===sku).map(x=>String(x.product||'').trim()).filter(Boolean))];
   if(names.length===1)product=names[0];
  }
  if(!sku&&!product)continue;
  if(product&&source.includes(product)&&(!sku||source.includes(sku)))continue;
  if(sku&&product){
   const escaped=sku.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');let found=false;
   text=text.replace(new RegExp('(^|[^A-Za-z0-9/])'+escaped+'(?=$|[^A-Za-z0-9/])','g'),(_,prefix)=>{found=true;return prefix+sku+' · '+product});
   if(found)continue;
  }
  const qty=Number(item.qty);
  text+='\n'+[sku,product||'Название товара не указано'].filter(Boolean).join(' · ')+(Number.isFinite(qty)&&qty>0?' — '+qty+' шт.':'');
 }
 return {...t,text};
}
routeTaskHtml=function(tasks,id){return original.call(this,Array.isArray(tasks)?tasks.map(displayTask):tasks,id)};
w.RESANTA_ROUTE_TASK_PRODUCTS_V1={version:'1.0.0'};
})(window);
