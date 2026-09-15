/* RESANTA CRM v23.6.121 · TRIOVIST · ГРУППЫ И ДИНАМИКА FIXES
 * Preserves filters across Triovist refresh and adds access-safe Excel export.
 * No business-data writes. No polling after startup.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_GROUP_DYNAMICS_FIXES_V236121)return;
const VERSION='v23.6.121', BASE_KEY='resanta_triovist_groups_filters_v236121';
let xlsxFlight=null, exportFlight=null, installed=false;
const q=(h,s)=>h?.querySelector(s)||null;
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const monthDate=v=>String(v||'').slice(0,7)+'-01';
const num=v=>Number(v)||0;
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=v=>v==null?'':Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
function key(ctx){return BASE_KEY+'|'+String(ctx?.email||'unknown').toLowerCase()}
function read(h){
  return {
    manager:q(h,'[data-trgd-manager]')?.value||'',
    quick:q(h,'[data-trgd-quick]')?.value||'month',
    from:q(h,'[data-trgd-from]')?.value||'', to:q(h,'[data-trgd-to]')?.value||'',
    compareMode:q(h,'[data-trgd-compare-mode]')?.value||'year',
    cfrom:q(h,'[data-trgd-cfrom]')?.value||'', cto:q(h,'[data-trgd-cto]')?.value||'',
    sort:q(h,'[data-trgd-sort]')?.value||'revenue',
    view:q(h,'[data-trgd-view].on')?.dataset?.trgdView||'all'
  };
}
function valid(s){return !!(s&&/^\d{4}-\d{2}$/.test(s.from||'')&&/^\d{4}-\d{2}$/.test(s.to||'')&&/^\d{4}-\d{2}$/.test(s.cfrom||'')&&/^\d{4}-\d{2}$/.test(s.cto||''))}
function save(h,ctx){try{const s=read(h);if(valid(s))localStorage.setItem(key(ctx),JSON.stringify(s))}catch(_){}}
function load(ctx){try{const s=JSON.parse(localStorage.getItem(key(ctx))||'null');return valid(s)?s:null}catch(_){return null}}
function setv(h,sel,val){const e=q(h,sel);if(!e)return;if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(val??'')))return;e.value=val??''}
function restore(h,ctx,s){
  if(!valid(s))return false;
  setv(h,'[data-trgd-manager]',s.manager);setv(h,'[data-trgd-quick]',s.quick);
  setv(h,'[data-trgd-from]',s.from);setv(h,'[data-trgd-to]',s.to);
  setv(h,'[data-trgd-compare-mode]',s.compareMode);setv(h,'[data-trgd-cfrom]',s.cfrom);setv(h,'[data-trgd-cto]',s.cto);
  setv(h,'[data-trgd-sort]',s.sort);
  h.querySelectorAll('[data-trgd-view]').forEach(b=>b.classList.toggle('on',b.dataset.trgdView===(s.view||'all')));
  return true;
}
function bindPersistence(h,ctx){
  h.__trgd121ctx=ctx;
  if(h.dataset.trgd121Bound==='1')return;
  h.dataset.trgd121Bound='1';
  h.addEventListener('change',e=>{if(e.target.closest('[data-trgd-manager],[data-trgd-quick],[data-trgd-from],[data-trgd-to],[data-trgd-compare-mode],[data-trgd-cfrom],[data-trgd-cto],[data-trgd-sort]'))setTimeout(()=>save(h,h.__trgd121ctx),0)});
  h.addEventListener('click',e=>{if(e.target.closest('[data-trgd-apply],[data-trgd-view]'))setTimeout(()=>save(h,h.__trgd121ctx),0)});
}
function loadXlsx(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(xlsxFlight)return xlsxFlight;
  xlsxFlight=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.async=true;s.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('Библиотека Excel не загрузилась'));s.onerror=()=>reject(Error('Не удалось загрузить модуль Excel'));document.head.appendChild(s)}).finally(()=>xlsxFlight=null);
  return xlsxFlight;
}
function agg(rows,fields){
  const m=new Map();
  for(const r of rows){const k=fields.map(f=>String(r[f]||'')).join('\u241f');let a=m.get(k);if(!a){a={};fields.forEach(f=>a[f]=r[f]||'');Object.assign(a,{current_revenue:0,basis_revenue:0,compare_revenue:0,current_qty:0,basis_qty:0,compare_qty:0});m.set(k,a)};for(const f of ['current_revenue','basis_revenue','compare_revenue','current_qty','basis_qty','compare_qty'])a[f]+=num(r[f])}
  return [...m.values()].map(a=>({...a,delta_revenue:a.basis_revenue-a.compare_revenue,growth_pct:a.compare_revenue?((a.basis_revenue/a.compare_revenue)-1)*100:null,delta_qty:a.basis_qty-a.compare_qty,qty_growth_pct:a.compare_qty?((a.basis_qty/a.compare_qty)-1)*100:null}));
}
function excelRows(rows,level){return rows.map(r=>({
  'Менеджер':r.manager_name||'',
  ...(level!=='manager'?{'Группа':r.group||''}:{}),
  ...(level==='subgroup'||level==='sku'?{'Подгруппа':r.subgroup||''}:{}),
  ...(level==='sku'?{'SKU':r.sku||'','Наименование':r.product||'','В прайс-листе':r.catalog_match===false?'Нет':'Да'}:{}),
  'Продажи факт, BYN':num(r.current_revenue),
  'Темп периода, BYN':num(r.basis_revenue),
  'Сравнение, BYN':num(r.compare_revenue),
  'Разница, BYN':num(r.delta_revenue),
  'Динамика, %':r.growth_pct==null?'':Number(r.growth_pct),
  'Штук факт':num(r.current_qty),
  'Штук темп':num(r.basis_qty),
  'Штук сравнение':num(r.compare_qty),
  'Разница штук':num(r.delta_qty),
  'Динамика штук, %':r.qty_growth_pct==null?'':Number(r.qty_growth_pct)
}))}
function fmt(ws,cols,rows){ws['!cols']=cols.map(w=>({wch:w}));if(rows.length)ws['!autofilter']={ref:`A1:${String.fromCharCode(64+Math.min(cols.length,26))}${rows.length+1}`};ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'}}
async function exportExcel(h,ctx){
  if(exportFlight)return exportFlight;
  exportFlight=(async()=>{
    const btn=q(h,'[data-trgd-export]'),old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='⏳ Готовлю Excel…'}
    try{
      const s=read(h);if(!valid(s))throw Error('Сначала выберите корректные периоды');save(h,ctx);
      const [XLSX,d]=await Promise.all([loadXlsx(),(async()=>{const dbase=dbx();if(!dbase)throw Error('Нет соединения с базой');const r=await dbase.rpc('triovist_group_dynamics_export_v1',{p_from_month:monthDate(s.from),p_to_month:monthDate(s.to),p_compare_from_month:monthDate(s.cfrom),p_compare_to_month:monthDate(s.cto),p_manager_email:s.manager||null});if(r.error)throw r.error;return r.data||{}})()]);
      const rows=Array.isArray(d.items)?d.items:[];if(!rows.length)throw Error('Нет данных для выбранного периода');
      const wb=XLSX.utils.book_new();
      const managers=agg(rows,['manager_name']);const groups=agg(rows,['manager_name','group']);const subgroups=agg(rows,['manager_name','group','subgroup']);
      const total=agg(rows,[])[0]||{};
      const summary=[{'Показатель':'Период','Значение':`${s.from} — ${s.to}`},{'Показатель':'Сравнение','Значение':`${s.cfrom} — ${s.cto}`},{'Показатель':'Менеджер','Значение':q(h,'[data-trgd-manager]')?.selectedOptions?.[0]?.textContent||'Все менеджеры'},{'Показатель':'Продажи факт, BYN','Значение':num(total.current_revenue)},{'Показатель':'Темп периода, BYN','Значение':num(total.basis_revenue)},{'Показатель':'Сравнение, BYN','Значение':num(total.compare_revenue)},{'Показатель':'Разница, BYN','Значение':num(total.delta_revenue)},{'Показатель':'Динамика, %','Значение':total.growth_pct==null?'':Number(total.growth_pct)},{'Показатель':'SKU','Значение':rows.length}];
      let ws=XLSX.utils.json_to_sheet(summary);ws['!cols']=[{wch:24},{wch:28}];XLSX.utils.book_append_sheet(wb,ws,'Сводка');
      let er=excelRows(managers,'manager');ws=XLSX.utils.json_to_sheet(er);fmt(ws,[22,18,18,18,18,14,14,14,14,14],er);XLSX.utils.book_append_sheet(wb,ws,'Менеджеры');
      er=excelRows(groups,'group');ws=XLSX.utils.json_to_sheet(er);fmt(ws,[22,28,18,18,18,18,14,14,14,14,14],er);XLSX.utils.book_append_sheet(wb,ws,'Группы');
      er=excelRows(subgroups,'subgroup');ws=XLSX.utils.json_to_sheet(er);fmt(ws,[22,28,34,18,18,18,18,14,14,14,14,14],er);XLSX.utils.book_append_sheet(wb,ws,'Подгруппы');
      er=excelRows(rows,'sku');ws=XLSX.utils.json_to_sheet(er);fmt(ws,[22,28,34,16,48,14,18,18,18,18,14,14,14,14,14],er);XLSX.utils.book_append_sheet(wb,ws,'SKU');
      const who=(q(h,'[data-trgd-manager]')?.selectedOptions?.[0]?.textContent||'Все').replace(/[^0-9A-Za-zА-Яа-я_-]+/g,'_');
      XLSX.writeFile(wb,`Triovist_Группы_и_динамика_${s.from}_${s.to}_${who}.xlsx`,{compression:true});
      if(typeof showToast==='function')showToast('✅ Excel выгружен: '+rows.length.toLocaleString('ru-RU')+' SKU');
    }catch(e){console.error('Group dynamics Excel',e);alert('Не удалось выгрузить Excel: '+(e?.message||e))}
    finally{const b=q(h,'[data-trgd-export]');if(b){b.disabled=false;b.textContent=old||'📥 Excel'}}
  })().finally(()=>exportFlight=null);return exportFlight;
}
function ensureExport(h,ctx){
  const tools=q(h,'.trgd-tools');if(!tools||q(h,'[data-trgd-export]'))return;
  const b=document.createElement('button');b.type='button';b.dataset.trgdExport='1';b.textContent='📥 Excel';b.title='Выгрузить выбранный период с группами, подгруппами и SKU';b.onclick=e=>{e.preventDefault();exportExcel(h,ctx)};tools.appendChild(b);
}
function install(){
  if(installed)return true;
  const base=window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120;if(!base?.open)return false;
  const wrapped={...base,
    version:VERSION,
    open:async function(h,ctx){
      const live=read(h);if(valid(live))try{localStorage.setItem(key(ctx),JSON.stringify(live))}catch(_){}
      const saved=load(ctx);
      const out=await base.open(h,ctx);
      bindPersistence(h,ctx);ensureExport(h,ctx);
      if(saved&&restore(h,ctx,saved)){
        const apply=q(h,'[data-trgd-apply]');if(apply){apply.click();await new Promise(r=>setTimeout(r,0))}
      }
      ensureExport(h,ctx);return out;
    },
    refresh:async function(){const out=await base.refresh();const h=document.getElementById('tr14-panel');if(h){bindPersistence(h,h.__trgd121ctx);ensureExport(h,h.__trgd121ctx)}return out},
    exportExcel:()=>{const h=document.getElementById('tr14-panel');return exportExcel(h,h?.__trgd121ctx)}
  };
  window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120=Object.freeze(wrapped);
  window.RESANTA_TRIOVIST_GROUP_DYNAMICS_FIXES_V236121=Object.freeze({version:VERSION,installed:true});
  installed=true;return true;
}
let tries=0;(function wait(){if(install())return;if(++tries<80)setTimeout(wait,100);else console.error('TRIOVIST GROUP DYNAMICS '+VERSION+': base module not found')})();
})();
