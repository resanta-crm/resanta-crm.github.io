/* RESANTA CRM v23.6.233 · Уценка: пояснения МСЦ и журнал продаж
 * Дополняет существующий модуль Уценки, не меняя его основной bootstrap.
 */
(function(){
'use strict';
if(window.RESANTA_MARKDOWN_SERVICE_SALES_V236233)return;
const V='v23.6.233';
const S={filter:'alerts',rows:[],stats:{},role:null,busy:false};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=v=>esc(v).replace(/"/g,'&quot;');
const n=v=>Number(v)||0;
const money=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const date=v=>{if(!v)return'—';const s=String(v).slice(0,10).split('-');return s.length===3?s.reverse().join('.'):String(v)};
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||null)}catch(_){return window.currentProfile||null}};
const email=()=>String(profile()?.email||'').trim().toLowerCase();
const isService=()=>email()==='service_vitebsk@resanta.ru'||String(profile()?.role||'').toLowerCase()==='service_manager';
const isPayushin=()=>email()==='payushin_ar@resanta.ru';
const canUse=()=>isService()||isPayushin();
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
async function rpc(name,args={}){const d=dbx();if(!d?.rpc)throw new Error('База CRM ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function reasonLabel(v){return({
 sold_local:'Продано',issued_client:'Выдано клиенту',transfer:'Перемещение',
 return_writeoff:'Возврат / списание',accounting_error:'Ошибка учёта',other:'Другое'
})[v]||v||'—'}
function inject(){
 if($('md233-style'))return;
 const st=document.createElement('style');st.id='md233-style';st.textContent=`
 #md233-control,#md233-explain{display:none;position:fixed;inset:0;z-index:12650;background:rgba(15,23,42,.58);padding:14px;overflow:auto}
 #md233-control.open,#md233-explain.open{display:flex;align-items:flex-start;justify-content:center}
 .md233-dialog{width:min(1120px,100%);background:#fff;border-radius:14px;padding:16px;margin:auto;box-shadow:0 20px 60px rgba(0,0,0,.28)}
 #md233-explain .md233-dialog{width:min(720px,100%)}
 .md233-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px}
 .md233-x{border:0;background:#f3f4f6;border-radius:8px;width:34px;height:34px;font-size:20px;cursor:pointer}
 .md233-tabs,.md233-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px}
 .md233-tab,.md233-btn{border:1px solid #dbe3ed;background:#fff;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:12px}
 .md233-tab.active{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8;font-weight:800}
 .md233-btn.good{background:#166534;border-color:#166534;color:#fff}.md233-btn.bad{background:#991b1b;border-color:#991b1b;color:#fff}.md233-btn.primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
 .md233-card{border:1px solid #dbe3ed;border-radius:10px;padding:11px;margin-bottom:8px;font-size:11px;line-height:1.55;background:#fff}
 .md233-card.alert{border-color:#fca5a5;background:#fff7f7}.md233-card.wait{border-color:#fde68a;background:#fffcf2}.md233-card.done{border-color:#bbf7d0;background:#f7fff9}
 .md233-status{font-size:10px;font-weight:800;padding:3px 7px;border-radius:999px;display:inline-block;background:#f3f4f6}
 .md233-status.red{background:#fee2e2;color:#991b1b}.md233-status.amber{background:#fef3c7;color:#92400e}.md233-status.green{background:#dcfce7;color:#166534}
 .md233-note{margin-top:7px;padding:8px 9px;border-radius:8px;background:#eff6ff;font-size:11px;line-height:1.55}
 .md233-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.md233-field{font-size:11px;color:#475569}
 .md233-field input,.md233-field select,.md233-field textarea{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px 10px;border:1px solid #dbe3ed;border-radius:8px;background:#fff;font-size:13px}
 .md233-field textarea{min-height:92px;resize:vertical}.md233-span2{grid-column:1/-1}
 @media(max-width:720px){.md233-grid{grid-template-columns:1fr}.md233-span2{grid-column:auto}.md233-btn,.md233-tab{min-height:42px}}
 `;document.head.appendChild(st);
}
function ensure(){
 inject();
 if(!$('md233-control')){const m=document.createElement('div');m.id='md233-control';m.innerHTML='<div class="md233-dialog"><div id="md233-body"></div></div>';m.onclick=e=>{if(e.target===m)m.classList.remove('open')};document.body.appendChild(m)}
 if(!$('md233-explain')){const m=document.createElement('div');m.id='md233-explain';m.innerHTML='<div class="md233-dialog"><div id="md233-explain-body"></div></div>';m.onclick=e=>{if(e.target===m)m.classList.remove('open')};document.body.appendChild(m)}
}
function tabs(){
 if(isService())return[
  ['service_needed','Требуют пояснения',n(S.stats.service_needed)],
  ['service_waiting','Ждут 1С',n(S.stats.service_waiting)],
  ['service_closed','Продано / закрыто',n(S.stats.service_closed)],
  ['all','Все',0]
 ];
 return[
  ['alerts','Требуют внимания',n(S.stats.alerts)],
  ['service_waiting','Пояснения МСЦ · ждут 1С',n(S.stats.service_waiting)],
  ['pending','Продажи · ждут 1С',n(S.stats.pending)],
  ['discrepancy','Расхождения',n(S.stats.discrepancy)],
  ['confirmed','Подтверждено',n(S.stats.confirmed)],
  ['resolved','Закрытые',0],['all','Все',0]
 ];
}
function status(r){
 if(r.status==='resolved')return'<span class="md233-status green">✅ Проверено / закрыто</span>';
 if(r.event_type==='sale_claim'&&r.status==='pending')return'<span class="md233-status amber">⏳ Продажа ждёт 1С</span>';
 if(r.event_type==='sale_claim'&&r.status==='discrepancy')return'<span class="md233-status red">🔴 Расхождение</span>';
 if(r.event_type==='sale_claim'&&r.status==='confirmed')return'<span class="md233-status green">✅ Подтверждено</span>';
 if(r.service_review_status==='submitted')return'<span class="md233-status amber">🟠 Пояснение МСЦ · ждёт 1С</span>';
 if(r.service_review_status==='returned')return'<span class="md233-status red">↩ Вернуто МСЦ</span>';
 if(['unreported_reduction','unreported_exit'].includes(r.event_type)&&r.status==='open')return'<span class="md233-status red">🔴 Требуется пояснение МСЦ</span>';
 return'<span class="md233-status">'+esc(r.status||'')+'</span>';
}
function explanation(r){
 if(!r.service_explained_at)return'';
 return '<div class="md233-note"><b>📝 Пояснение МСЦ:</b> '+esc(reasonLabel(r.service_reason))+
   (r.service_counterparty?' · <b>Кому / где:</b> '+esc(r.service_counterparty):'')+
   (r.service_sale_qty!=null?' · <b>Кол-во:</b> '+qty(r.service_sale_qty):'')+
   (r.service_sale_price!=null?' · <b>Цена:</b> '+money(r.service_sale_price):'')+
   (r.service_sale_date?' · <b>Дата:</b> '+date(r.service_sale_date):'')+
   (r.service_document_no?' · <b>Документ:</b> '+esc(r.service_document_no):'')+
   '<br><b>Комментарий:</b> '+esc(r.service_comment||'—')+
   '<br><span style="color:#64748b">'+esc(r.service_explained_by||'')+' · '+date(r.service_explained_at)+'</span>'+
   (r.service_review_status==='returned'?'<br><b style="color:#991b1b">Возвращено на уточнение:</b> '+esc(r.service_review_comment||''):'')+
   (r.service_review_status==='verified'?'<br><b style="color:#166534">✅ Подтверждено:</b> '+esc(r.service_review_comment||''):'')+
   '</div>';
}
function actions(r){
 let h='';
 if(isService()&&r.event_type!=='sale_claim'&&r.status==='open'&&r.service_review_status!=='submitted'){
   h+='<button class="md233-btn primary" data-md233-explain="'+attr(r.id)+'">✍ Объяснить / оформить</button>';
 }
 if(isPayushin()&&r.event_type!=='sale_claim'&&r.status==='open'){
   if(r.service_review_status==='submitted'){
     h+='<button class="md233-btn good" data-md233-review="close" data-id="'+attr(r.id)+'">✅ Подтвердить и закрыть</button>';
     h+='<button class="md233-btn bad" data-md233-review="return" data-id="'+attr(r.id)+'">↩ Вернуть МСЦ</button>';
   }else{
     h+='<button class="md233-btn" data-md233-oldresolve="'+attr(r.id)+'">Закрыть после проверки</button>';
   }
 }
 if(isPayushin()&&r.event_type==='sale_claim'&&r.status==='discrepancy'){
   h+='<button class="md233-btn good" data-md233-oldaction="confirm_manual" data-id="'+attr(r.id)+'">Подтвердить вручную</button>';
   h+='<button class="md233-btn bad" data-md233-oldaction="cancel_claim" data-id="'+attr(r.id)+'">Отменить заявку</button>';
 }
 return h?'<div class="md233-actions">'+h+'</div>':'';
}
function render(data){
 const body=$('md233-body');if(!body)return;
 const rows=Array.isArray(data?.rows)?data.rows:[];S.rows=rows;S.stats=data?.stats||{};S.role=data?.is_service_manager?'service':'payushin';
 body.innerHTML='<div class="md233-head"><div><div style="font-size:19px;font-weight:900">🛡 Контроль продаж уценки</div><div style="font-size:11px;color:#64748b">Письма больше не нужны: МСЦ оформляет выбытие здесь, следующий полный отчёт 1С подтверждает факт.</div></div><button class="md233-x" data-md233-close>×</button></div>'+
 '<div class="md233-tabs">'+tabs().map(x=>'<button class="md233-tab '+(S.filter===x[0]?'active':'')+'" data-md233-filter="'+x[0]+'">'+x[1]+(x[2]?' <b>'+x[2]+'</b>':'')+'</button>').join('')+'</div>'+
 (rows.length?rows.map(r=>{
   const cls=r.status==='resolved'?'done':r.service_review_status==='submitted'?'wait':['discrepancy','open'].includes(r.status)?'alert':'';
   const stock=r.observed_qty_before!=null?'<b>Проверка 1С:</b> '+qty(r.observed_qty_before)+' → '+qty(r.observed_qty_after)+' шт.':'';
   return '<div class="md233-card '+cls+'"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b style="font-size:13px">'+esc(r.nomenclature)+'</b><br>Артикул: <b>'+esc(r.article)+'</b>'+(r.instance_code?' · '+esc(r.instance_code):'')+'</div>'+status(r)+'</div>'+
    '<div style="margin-top:7px">'+stock+' · <b>Текущий остаток 1С:</b> '+qty(r.current_1c_qty)+' шт.</div>'+
    (r.approved_unit_price!=null?'<div><b>Утверждённая цена:</b> '+money(r.approved_unit_price)+(r.reported_revenue!=null?' · <b>Сумма:</b> '+money(r.reported_revenue):'')+'</div>':'')+
    '<div><b>Сигнал:</b> '+date(r.reported_at)+'</div>'+
    (r.discrepancy_reason?'<div style="color:#991b1b;margin-top:4px"><b>'+esc(r.discrepancy_reason)+'</b></div>':'')+
    explanation(r)+
    (r.resolution_comment?'<div style="margin-top:5px"><b>Решение:</b> '+esc(r.resolution_comment)+'</div>':'')+
    actions(r)+'</div>';
 }).join(''):'<div style="padding:25px;text-align:center;color:#64748b">По этому фильтру событий нет.</div>');
}
async function load(){
 ensure();const body=$('md233-body');body.innerHTML='<div style="padding:30px;text-align:center">Загружаю контроль…</div>';
 try{const data=await rpc('markdown_sales_control_v1',{p_filter:S.filter,p_limit:150,p_offset:0});render(data);updateButton(data?.stats||{})}
 catch(e){body.innerHTML='<div style="color:#991b1b;padding:20px">Не удалось загрузить контроль: '+esc(e?.message||e)+'</div>'}
}
async function open(filter){
 if(!canUse())return;S.filter=filter||(isService()?'service_needed':'alerts');ensure();$('md233-control').classList.add('open');await load();
}
function explainForm(id){
 const r=S.rows.find(x=>String(x.id)===String(id));if(!r)return;
 ensure();const body=$('md233-explain-body');const today=new Date().toISOString().slice(0,10);
 body.innerHTML='<div class="md233-head"><div><div style="font-size:18px;font-weight:900">✍ Пояснение МСЦ</div><div style="font-size:11px;color:#64748b">'+esc(r.nomenclature)+' · '+esc(r.article)+'</div></div><button class="md233-x" data-md233-explain-close>×</button></div>'+
 '<div class="md233-grid"><label class="md233-field">Причина<select id="md233-reason"><option value="sold_local">Продано</option><option value="issued_client">Выдано клиенту</option><option value="transfer">Перемещение</option><option value="return_writeoff">Возврат / списание</option><option value="accounting_error">Ошибка учёта</option><option value="other">Другое</option></select></label>'+
 '<label class="md233-field">Кому / где<input id="md233-counterparty" placeholder="Например: местный гараж"></label>'+
 '<label class="md233-field">Количество<input id="md233-qty" type="number" min="0.01" step="1" value="'+attr(r.reported_qty||1)+'"></label>'+
 '<label class="md233-field">Фактическая цена, BYN<input id="md233-price" type="number" min="0.01" step="0.01" value="'+attr(r.approved_unit_price||r.current_price||'')+'"></label>'+
 '<label class="md233-field">Дата<input id="md233-date" type="date" value="'+today+'"></label>'+
 '<label class="md233-field">Документ / чек, если есть<input id="md233-doc" placeholder="необязательно"></label>'+
 '<label class="md233-field md233-span2">Комментарий<textarea id="md233-comment" placeholder="Что произошло с конкретным экземпляром. Комментарий обязателен."></textarea></label></div>'+
 '<div style="font-size:10px;color:#64748b;margin-top:8px">После отправки запись нельзя тихо изменить. Если руководитель вернёт её на уточнение, новое пояснение сохранится отдельным действием в аудите.</div>'+
 '<div class="md233-actions"><button class="md233-btn primary" data-md233-submit="'+attr(id)+'">Отправить пояснение</button></div>';
 $('md233-explain').classList.add('open');
}
async function submitExplain(id){
 const reason=$('md233-reason')?.value||'',counterparty=$('md233-counterparty')?.value?.trim()||'',comment=$('md233-comment')?.value?.trim()||'';
 const q=Number($('md233-qty')?.value||0),price=Number($('md233-price')?.value||0),saleDate=$('md233-date')?.value||null,doc=$('md233-doc')?.value?.trim()||null;
 if(!comment){alert('Комментарий обязателен');return}
 if(reason==='sold_local'&&(!counterparty||!q||!price||!saleDate)){alert('Для продажи укажите кому/где, количество, цену и дату');return}
 try{
  await rpc('markdown_service_explain_sale_v236233',{p_event_id:id,p_reason:reason,p_counterparty:counterparty||null,p_qty:q||null,p_unit_price:price||null,p_sale_date:saleDate,p_document_no:doc,p_comment:comment});
  $('md233-explain').classList.remove('open');await load();
  alert('✅ Пояснение сохранено. Теперь ждём следующий полный отчёт 1С.');
 }catch(e){alert('Не удалось сохранить пояснение: '+(e?.message||e))}
}
async function review(id,action){
 const promptText=action==='return'?'Почему возвращаем МСЦ на уточнение?':'Комментарий закрытия:';
 const c=prompt(promptText,'');if(c===null||!c.trim())return;
 try{await rpc('markdown_service_review_v236233',{p_event_id:id,p_action:action,p_comment:c.trim()});await load()}
 catch(e){alert('Не удалось сохранить решение: '+(e?.message||e))}
}
async function oldResolve(id,action='resolve_anomaly'){
 const c=prompt('Обязательный комментарий решения:','');if(c===null||!c.trim())return;
 try{await rpc('markdown_resolve_sale_event_v1',{p_event_id:id,p_action:action,p_comment:c.trim()});await load()}
 catch(e){alert('Не удалось сохранить решение: '+(e?.message||e))}
}
async function summary(){
 if(!canUse())return;
 try{const d=await rpc('markdown_sales_summary_v1',{});if(d?.allowed)updateButton(d)}catch(_){}
}
function updateButton(st){
 const b=$('md-control-v23691');if(!b)return;
 const alert=isService()?n(st.service_needed):n(st.alerts);
 b.innerHTML=(isService()?'🧾 Продажи / пояснения':'🛡 Контроль продаж')+(alert?' <b>🔴 '+alert+'</b>':'')+(n(st.service_waiting)?' <span style="font-size:10px">🟠 '+n(st.service_waiting)+'</span>':'');
}
function enhance(){
 if(!canUse())return;
 const root=$('markdown-root');if(!root)return;
 let b=$('md-control-v23691');
 if(!b){
  const top=root.querySelector('.md-top > div:last-child');if(!top)return;
  b=document.createElement('button');b.className='btn-secondary';b.id='md-control-v23691';top.prepend(b);
 }
 updateButton(S.stats||{});summary();
}
document.addEventListener('click',e=>{
 const ctrl=e.target.closest?.('#md-control-v23691');
 if(ctrl&&canUse()){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();open(isService()?'service_needed':'alerts');return}
 const close=e.target.closest?.('[data-md233-close]');if(close){$('md233-control')?.classList.remove('open');return}
 const exclose=e.target.closest?.('[data-md233-explain-close]');if(exclose){$('md233-explain')?.classList.remove('open');return}
 const f=e.target.closest?.('[data-md233-filter]');if(f){S.filter=f.dataset.md233Filter;load();return}
 const ex=e.target.closest?.('[data-md233-explain]');if(ex){explainForm(ex.dataset.md233Explain);return}
 const sub=e.target.closest?.('[data-md233-submit]');if(sub){submitExplain(sub.dataset.md233Submit);return}
 const rv=e.target.closest?.('[data-md233-review]');if(rv){review(rv.dataset.id,rv.dataset.md233Review);return}
 const old=e.target.closest?.('[data-md233-oldresolve]');if(old){oldResolve(old.dataset.md233Oldresolve);return}
 const oa=e.target.closest?.('[data-md233-oldaction]');if(oa){oldResolve(oa.dataset.id,oa.dataset.md233Oldaction);return}
},true);
function hook(){
 const base=window.crmMarkdownOpenV23687;
 if(typeof base==='function'&&!base.__md233){
  const w=async function(){const out=await base.apply(this,arguments);setTimeout(enhance,0);return out};w.__md233=true;window.crmMarkdownOpenV23687=w;
 }
 enhance();
}
let tries=0;(function settle(){hook();if((!$('markdown-root')||!$ ('md-control-v23691'))&&++tries<24)setTimeout(settle,250)})();
window.addEventListener('pageshow',()=>setTimeout(hook,120));
window.RESANTA_MARKDOWN_SERVICE_SALES_V236233=Object.freeze({version:V,open,enhance,immutableServiceAudit:true,next1CConfirmation:true});
})();