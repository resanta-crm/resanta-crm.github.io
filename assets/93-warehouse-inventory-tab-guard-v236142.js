/* RESANTA CRM v23.6.142 · INVENTORY TAB ROUTING GUARD
 * Permanent isolation: the Inventory tab is never handled by the compact SKU/order renderer.
 * Capture at document level runs before page-level legacy handlers.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_INVENTORY_TAB_GUARD_V236142)return;
const V='v23.6.142';
let opening=false;
function activate(tab){
  document.querySelectorAll('#wc-v23620 .wc-tab').forEach(b=>b.classList.toggle('active',b===tab));
}
async function openInventory(tab){
  if(opening)return;
  opening=true;
  try{
    activate(tab);
    const body=document.getElementById('wc-body');
    if(!body)return;
    body.innerHTML='<div class="card">Загружаю инвентаризацию…</div>';
    const mod=window.crmWarehouseInventoryV236139;
    if(!mod||typeof mod.open!=='function'){
      body.innerHTML='<div class="wc-alert red"><b>Модуль инвентаризации не загрузился.</b><br>Обновите CRM один раз. Остальные разделы склада не затронуты.</div>';
      return;
    }
    await mod.open(body);
  }catch(e){
    const body=document.getElementById('wc-body');
    if(body)body.innerHTML='<div class="wc-alert red"><b>Не удалось открыть инвентаризацию.</b><br>'+String(e?.message||e).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</div>';
  }finally{opening=false}
}
document.addEventListener('click',e=>{
  const tab=e.target?.closest?.('#wc-v23620 .wc-tab[data-mode="inventory"]');
  if(!tab)return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  openInventory(tab);
},true);
window.RESANTA_WAREHOUSE_INVENTORY_TAB_GUARD_V236142=Object.freeze({version:V,documentCapture:true,isolatesInventory:true});
})();