/* RESANTA CRM v23.6.221 · TRIOVIST 21VEK AUTH/EXCEL HOTFIX
 * Replaces only the user-facing Excel action. Uses the fast paged RPC with MRC.
 * Keeps the existing parser UI/data flow untouched.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_AUTH_EXPORT_V236221)return;
const V='v23.6.221';
let xlsxFlight=null,exportFlight=null;
const width=n=>({wch:n});
const toBool=v=>v===true?'Да':v===false?'Нет':'—';

function loadXlsx(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(xlsxFlight)return xlsxFlight;
  xlsxFlight=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.async=true;
    s.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Библиотека Excel не загрузилась'));
    s.onerror=()=>reject(new Error('Не удалось загрузить модуль Excel'));
    document.head.appendChild(s);
  }).finally(()=>xlsxFlight=null);
  return xlsxFlight;
}
async function rpc(name,args){
  const call=()=>db.rpc(name,args||{});
  const r=typeof window.crmAuthRetryV236166==='function'
    ? await window.crmAuthRetryV236166(call)
    : await call();
  if(r?.error)throw r.error;
  return r?.data||{};
}
async function currentCards(){
  const all=[];const page=500;let snapshot=null;
  for(let offset=0;;offset+=page){
    const d=await rpc('triovist_content_export_v236221',{
      p_manager_email:null,p_offset:offset,p_limit:page
    });
    const rows=Array.isArray(d.rows)?d.rows:[];
    if(d.snapshot_date)snapshot=d.snapshot_date;
    all.push(...rows);
    if(!d.has_more||!rows.length)break;
  }
  return {cards:all,snapshot};
}
function safeSheetName(v){return String(v||'21vek').replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,31)||'21vek';}
function topPosition(c){const n=Number(c?.listing_position||0);return n>0?n:'';}
function topLabel(c){
  const n=Number(c?.listing_position||0);
  if(n>0&&n<=30)return'TOP-30';
  if(n>30&&n<=60)return'TOP-60';
  if(n>60)return'Вне TOP-60';
  return'Не проверено';
}
function row(c){
  return {
    'Менеджер':c.manager_name||'',
    'Артикул / SKU':c.sku||c.donor_article||'',
    'Наименование':c.product_name||'',
    'Группа':c.category||'',
    'Подгруппа':c.subgroup||'',
    'Цена 21vek, BYN':c.price==null?'':Number(c.price),
    'МРЦ РБ, BYN':c.mrc_byn==null?'':Number(c.mrc_byn),
    'Отклонение от МРЦ, BYN':c.mrc_delta_byn==null?'':Number(c.mrc_delta_byn),
    'Отклонение от МРЦ, %':c.mrc_delta_pct==null?'':Number(c.mrc_delta_pct),
    'Статус МРЦ':c.mrc_status||'',
    'В наличии':toBool(c.in_stock),
    'Поисковая фраза':c.keyword||'',
    'Позиция':topPosition(c),
    'TOP':topLabel(c),
    'Рейтинг':c.product_rating==null?'':Number(c.product_rating),
    'Отзывы':Number(c.review_count||0),
    'Негативные отзывы':Number(c.negative_reviews||0),
    'Негатив без ответа':Number(c.unanswered_negative_reviews||0),
    'Последний отзыв':c.latest_review_date||'',
    'Ответ на последний отзыв':toBool(c.latest_review_answered),
    'Фото':Number(c.photo_count||0),
    'Видео':Number(c.video_count||0),
    'Описание':toBool(c.description_present),
    'Гарантия':toBool(c.warranty_present),
    'Ссылка 21vek':c.product_url||''
  };
}
function format(ws,rows){
  ws['!cols']=[
    width(18),width(17),width(45),width(24),width(24),
    width(14),width(14),width(18),width(18),width(24),
    width(12),width(30),width(10),width(12),width(10),
    width(10),width(15),width(16),width(14),width(20),
    width(9),width(9),width(12),width(12),width(55)
  ];
  if(rows.length)ws['!autofilter']={ref:'A1:Y'+(rows.length+1)};
  ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
}
async function exportExcel(){
  if(exportFlight)return exportFlight;
  exportFlight=(async()=>{
    const btn=document.getElementById('tri21-export-xlsx-v236109');
    const old=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='⏳ Готовлю Excel…';}
    try{
      if(typeof window.crmEnsureFreshSessionV236166==='function'){
        await window.crmEnsureFreshSessionV236166(false);
      }
      const [XLSX,data]=await Promise.all([loadXlsx(),currentCards()]);
      const cards=data.cards||[];
      if(!cards.length)throw new Error('Нет доступного рабочего снимка 21vek');
      const wb=XLSX.utils.book_new();
      const snapshot=data.snapshot||new Date().toISOString().slice(0,10);
      const managers=[...new Set(cards.map(c=>String(c.manager_name||c.manager_email||'Менеджер')))].sort((a,b)=>a.localeCompare(b,'ru'));
      const summary=managers.map(name=>{
        const x=cards.filter(c=>String(c.manager_name||c.manager_email||'Менеджер')===name);
        return {
          'Менеджер':name,
          'Дата рабочего снимка':snapshot,
          'Карточек':x.length,
          'В наличии':x.filter(c=>c.in_stock===true).length,
          'С МРЦ':x.filter(c=>c.mrc_byn!=null).length,
          'Ниже МРЦ (в наличии)':x.filter(c=>c.in_stock===true&&Number(c.mrc_delta_pct)<0).length,
          'Ниже МРЦ >5% (в наличии)':x.filter(c=>c.in_stock===true&&Number(c.mrc_delta_pct)<-5).length,
          'TOP-30':x.filter(c=>Number(c.listing_position||0)>0&&Number(c.listing_position)<=30).length,
          'TOP-60':x.filter(c=>Number(c.listing_position||0)>0&&Number(c.listing_position)<=60).length,
          'Источник':'Собственный парсер 21vek'
        };
      });
      const sws=XLSX.utils.json_to_sheet(summary);
      sws['!cols']=[width(22),width(22),width(12),width(12),width(12),width(22),width(26),width(12),width(12),width(28)];
      XLSX.utils.book_append_sheet(wb,sws,'Сводка');
      for(const name of managers){
        const rows=cards.filter(c=>String(c.manager_name||c.manager_email||'Менеджер')===name).map(row);
        const ws=XLSX.utils.json_to_sheet(rows);format(ws,rows);
        XLSX.utils.book_append_sheet(wb,ws,safeSheetName(name));
      }
      if(managers.length>1){
        const rows=cards.map(row),ws=XLSX.utils.json_to_sheet(rows);format(ws,rows);
        XLSX.utils.book_append_sheet(wb,ws,'Все карточки');
      }
      const who=managers.length===1?'_'+String(managers[0]).replace(/[^0-9A-Za-zА-Яа-я_-]+/g,'_'):'';
      XLSX.writeFile(wb,'Triovist_21vek_MRC_'+snapshot+who+'.xlsx',{compression:true});
      if(typeof showToast==='function')showToast('✅ Excel выгружен: '+cards.length.toLocaleString('ru-RU')+' карточек');
    }catch(e){
      console.error('21vek export v23.6.221',e);
      alert('Не удалось выгрузить Excel: '+(e?.message||e));
    }finally{
      const b=document.getElementById('tri21-export-xlsx-v236109');
      if(b){b.disabled=false;b.textContent=old||'📥 Выгрузить Excel';}
    }
  })().finally(()=>exportFlight=null);
  return exportFlight;
}
window.triovist21vekExportExcelV236109=exportExcel;
window.RESANTA_TRIOVIST_AUTH_EXPORT_V236221=Object.freeze({version:V,fastExport:true,mrc:true,authRetry:true});
})();