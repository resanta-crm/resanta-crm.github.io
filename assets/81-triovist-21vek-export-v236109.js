/* RESANTA CRM v23.6.109 · TRIOVIST 21VEK EXCEL EXPORT
 * Exports only the current good production snapshot visible to the signed-in user.
 * SheetJS is loaded on demand only when the user clicks Export.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_21VEK_EXPORT_V236109)return;
const VERSION='v23.6.109';
let xlsxFlight=null,exportFlight=null;

function activeTriovist(){return document.getElementById('page-triovist')?.classList.contains('active');}
function safeSheetName(v){return String(v||'21vek').replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,31)||'21vek';}
function toBool(v){return v===true?'Да':v===false?'Нет':'—';}
function topLabel(pos){const n=Number(pos||0);if(n>0&&n<=30)return'TOP-30';if(n>30&&n<=60)return'TOP-60';if(n>60)return String(n);return'—';}
function width(n){return {wch:n};}

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

async function currentImports(){
  const r=await db.from('triovist_content_imports')
    .select('id,manager_email,manager_name,snapshot_date,source_file,loaded_cards')
    .eq('is_current',true)
    .eq('status','complete')
    .order('manager_name',{ascending:true});
  if(r?.error)throw r.error;
  return r?.data||[];
}

async function currentCards(importIds){
  const all=[];const page=1000;
  for(let from=0;;from+=page){
    const r=await db.from('triovist_content_cards')
      .select('import_id,manager_name,manager_email,sku,donor_article,product_name,category,subgroup,product_url,price,description_present,warranty_present,keyword,listing_position,product_rating,last_review_rating,review_count,photo_count,video_count,in_stock,negative_reviews,unanswered_negative_reviews,latest_review_date,latest_review_text,latest_review_answered')
      .in('import_id',importIds)
      .order('manager_name',{ascending:true})
      .order('category',{ascending:true})
      .order('subgroup',{ascending:true})
      .order('product_name',{ascending:true})
      .range(from,from+page-1);
    if(r?.error)throw r.error;
    const rows=r?.data||[];all.push(...rows);
    if(rows.length<page)break;
  }
  return all;
}

function rowForExcel(c){
  const pos=Number(c.listing_position||0)||null;
  return {
    'Менеджер':c.manager_name||'',
    'Артикул / SKU':c.sku||c.donor_article||'',
    'Наименование':c.product_name||'',
    'Группа':c.category||'',
    'Подгруппа':c.subgroup||'',
    'Цена, BYN':c.price==null?'':Number(c.price),
    'В наличии':toBool(c.in_stock),
    'Поисковая фраза':c.keyword||'',
    'Позиция':pos||'',
    'TOP':topLabel(pos),
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

function formatSheet(ws,rows){
  ws['!cols']=[width(18),width(17),width(45),width(24),width(24),width(12),width(12),width(30),width(10),width(10),width(10),width(10),width(15),width(16),width(14),width(20),width(9),width(9),width(12),width(12),width(55)];
  if(rows.length)ws['!autofilter']={ref:'A1:U'+(rows.length+1)};
  ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
}

async function exportExcel(){
  if(exportFlight)return exportFlight;
  exportFlight=(async()=>{
    const btn=document.getElementById('tri21-export-xlsx-v236109');
    const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='⏳ Готовлю Excel…';}
    try{
      const [XLSX,imports]=await Promise.all([loadXlsx(),currentImports()]);
      if(!imports.length)throw new Error('Нет доступного рабочего снимка 21vek');
      const ids=imports.map(x=>x.id);
      const cards=await currentCards(ids);
      if(!cards.length)throw new Error('В рабочем снимке нет доступных карточек');

      const wb=XLSX.utils.book_new();
      const snapshot=[...new Set(imports.map(x=>x.snapshot_date).filter(Boolean))].sort().pop()||new Date().toISOString().slice(0,10);
      const summary=imports.map(x=>({
        'Менеджер':x.manager_name||x.manager_email||'',
        'Дата рабочего снимка':x.snapshot_date||'',
        'Карточек':Number(x.loaded_cards||cards.filter(c=>c.import_id===x.id).length),
        'Источник':'Собственный парсер 21vek'
      }));
      const sws=XLSX.utils.json_to_sheet(summary);sws['!cols']=[width(22),width(22),width(12),width(28)];
      XLSX.utils.book_append_sheet(wb,sws,'Сводка');

      for(const imp of imports){
        const rows=cards.filter(c=>c.import_id===imp.id).map(rowForExcel);
        const ws=XLSX.utils.json_to_sheet(rows);formatSheet(ws,rows);
        XLSX.utils.book_append_sheet(wb,ws,safeSheetName(imp.manager_name||imp.manager_email));
      }
      if(imports.length>1){
        const rows=cards.map(rowForExcel);const ws=XLSX.utils.json_to_sheet(rows);formatSheet(ws,rows);
        XLSX.utils.book_append_sheet(wb,ws,'Все карточки');
      }

      const who=imports.length===1?'_'+String(imports[0].manager_name||'manager').replace(/[^0-9A-Za-zА-Яа-я_-]+/g,'_'):'';
      XLSX.writeFile(wb,'Triovist_21vek_'+snapshot+who+'.xlsx',{compression:true});
      if(typeof showToast==='function')showToast('✅ Excel выгружен: '+cards.length.toLocaleString('ru-RU')+' карточек');
    }catch(e){
      console.error('21vek export',e);alert('Не удалось выгрузить Excel: '+(e?.message||e));
    }finally{
      const b=document.getElementById('tri21-export-xlsx-v236109');if(b){b.disabled=false;b.textContent=old||'📥 Выгрузить Excel';}
    }
  })().finally(()=>exportFlight=null);
  return exportFlight;
}

function ensureButton(){
  if(!activeTriovist())return;
  const actions=document.querySelector('#tri21-control-v236107 .tri21ctl-actions');
  if(!actions||document.getElementById('tri21-export-xlsx-v236109'))return;
  const b=document.createElement('button');b.id='tri21-export-xlsx-v236109';b.type='button';b.className='btn-secondary';b.textContent='📥 Выгрузить Excel';b.onclick=exportExcel;
  actions.insertBefore(b,actions.firstChild||null);
}

window.triovist21vekExportExcelV236109=exportExcel;
const baseRender=window.renderTriovist;
if(typeof baseRender==='function')window.renderTriovist=function(){const out=baseRender.apply(this,arguments);setTimeout(ensureButton,0);return out;};
const baseStatus=window.triovist21vekRefreshStatusV236107;
if(typeof baseStatus==='function')window.triovist21vekRefreshStatusV236107=async function(){const out=await baseStatus.apply(this,arguments);ensureButton();return out;};
const baseRequest=window.triovist21vekRequestRefreshV236107;
if(typeof baseRequest==='function')window.triovist21vekRequestRefreshV236107=async function(){const out=await baseRequest.apply(this,arguments);ensureButton();return out;};

window.RESANTA_TRIOVIST_21VEK_EXPORT_V236109=Object.freeze({version:VERSION,exportExcel});
[0,250,800,1800].forEach(ms=>setTimeout(ensureButton,ms));
})();
