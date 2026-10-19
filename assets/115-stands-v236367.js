/* RESANTA CRM v23.6.394 · STANDS / OS / TRADE EQUIPMENT + ROUTE-BOUND VISION TASKS
 * Isolated lazy module. No polling. No client-side purchase_history scans.
 */
(function(){
'use strict';
if(window.RESANTA_STANDS_V236367)return;
const V='v23.6.394';
const safe=v=>String(v??'');
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' BYN';
const pct=v=>v===null||v===undefined||v===''?'—':num(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
const arr=v=>Array.isArray(v)?v:[];
function dbc(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function clients(){try{return typeof allClients!=='undefined'?(allClients||[]):(window.allClients||[])}catch(_){return window.allClients||[]}}
function profile(){try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||{})}catch(_){return window.currentProfile||{}}}
function active(){return document.getElementById('page-stands')?.classList.contains('active')||safe(document.getElementById('app')?.dataset?.activePage)==='stands'}
function root(){return document.getElementById('stands-v236346-root')}
const state={boot:null,loading:false,tab:'placements',sales:null,salesLevel:'category',salesCategory:null,salesSubgroup:null,requestId:null,reqCats:new Set(),dfs:null,catalog:null,catalogSelected:new Map(),catalogLegacy:[],catalogTimer:null};
const role=()=>safe(state.boot?.actor?.stand_role);
const isManager=()=>role()==='manager';
const isDF=()=>role()==='df';
const isDFS=()=>role()==='dfs';
const byId=(a,id)=>arr(a).find(x=>safe(x.id)===safe(id));
const typeName=id=>byId(state.boot?.asset_types,id)?.name||'Стенд';
const assetCode=id=>byId(state.boot?.assets,id)?.asset_code||'—';
const requestAssets=id=>arr(state.boot?.request_assets).filter(x=>safe(x.request_id)===safe(id)).map(x=>assetCode(x.asset_id));
const itemsForPlacement=id=>arr(state.boot?.placement_items).filter(x=>safe(x.placement_id)===safe(id));
const contractFor=id=>byId(state.boot?.contracts,id);
const placementById=id=>byId([...arr(state.boot?.placements),...arr(state.boot?.history)],id);
const dateRu=v=>{const s=safe(v);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):s||'—'};
function visionTaskForPlacement(id){
 const rows=arr(state.boot?.vision_tasks).filter(x=>safe(x?.ai_selection_context?.placement_id)===safe(id));
 return rows.sort((a,b)=>(Number(!!a.done)-Number(!!b.done))||safe(b.created_at).localeCompare(safe(a.created_at)))[0]||null;
}
function visionTaskBlock(p){
 const t=visionTaskForPlacement(p?.id);if(!t)return'';
 const ctx=t.ai_selection_context||{},before=ctx.before||{},after=ctx.after||{};
 if(!t.done){
   const due=t.due_date?'<b>Срок: следующий маршрут '+esc(dateRu(t.due_date))+'.</b>':'<b>Маршрут пока не назначен — срок установится автоматически.</b>';
   return '<div class="st346-alert warn"><b>🎯 Задача менеджеру: '+esc(t.title||'исправить стенд')+'</b><br>'+due+
     '<div style="margin-top:4px">'+esc(t.next_step||'Исправить замечания Vision и выполнить повторный контроль.')+'</div>'+
     '<div class="st346-meta" style="margin-top:4px">Vision отвечает за качество выкладки. Решение о возврате стенда принимается отдельно по фото + продажам + динамике.</div></div>';
 }
 const diffs=[];
 if(before.fill_pct!=null||after.fill_pct!=null)diffs.push('заполнение '+esc(before.fill_pct??'—')+'% → '+esc(after.fill_pct??'—')+'%');
 if(before.own_brand_pct!=null||after.own_brand_pct!=null)diffs.push('наш бренд '+esc(before.own_brand_pct??'—')+'% → '+esc(after.own_brand_pct??'—')+'%');
 if(before.match_pct!=null||after.match_pct!=null)diffs.push('сверка SKU '+esc(before.match_pct??'—')+'% → '+esc(after.match_pct??'—')+'%');
 return '<div class="st346-alert good"><b>✅ Задача по стенду закрыта повторным Vision</b>'+(diffs.length?'<div class="st346-meta" style="margin-top:4px">'+diffs.join(' · ')+'</div>':'')+'</div>';
}
const statusMap={
 draft_manager:['Черновик','gray'],pending_df:['На согласовании ДФ','warn'],returned:['Вернули на доработку','warn'],
 approved:['Согласована · ждёт установки','good'],rejected:['Отклонена','bad'],installed:['Установлена','good'],cancelled:['Отменена','gray'],
 active:['У клиента','good'],legacy_unreconciled:['Не сверено с ОС','bad'],return_requested:['На возврат','warn'],returned:['Возвращён','gray'],archived_manual:['Архив','gray'],returned_p:['Возвращена','gray']
};
function badge(label,tone='gray'){return '<span class="st346-badge '+tone+'">'+esc(label)+'</span>'}
function requestStatus(s){const m=statusMap[s]||[s,'gray'];return badge(m[0],m[1])}
function placementStatus(p){if(p.status==='returned')return badge('Возвращён','gray');const m=statusMap[p.status]||[p.status,'gray'];return badge(m[0],m[1])}
function aiTone(s){return s==='keep'||s==='green'?'good':s==='optimize'||s==='yellow'?'warn':s==='control'?'info':s==='return'||s==='red'?'bad':'gray'}
function aiLabel(s){return({keep:'Оставить',optimize:'Оптимизировать',control:'Под контроль',return:'Рассмотреть возврат',move:'Переместить'}[s]||s||'Нет оценки')}
function visionTone(s){return s==='ok'?'good':s==='bad_photo'?'bad':s==='review'?'warn':'gray'}
function visionLabel(s){return({ok:'Vision · всё нормально',review:'Vision · проверить',bad_photo:'Vision · плохое фото',failed:'Vision · ошибка'}[s]||'Vision · не проверено')}
function visionBlock(p){
 if(!p?.vision_checked_at&&!p?.vision_summary)return '';
 const bits=[];
 if(p.vision_fill_pct!=null)bits.push('заполнение '+esc(p.vision_fill_pct)+'%');
 if(p.vision_own_brand_pct!=null)bits.push('наш бренд '+esc(p.vision_own_brand_pct)+'%');
 if(p.vision_match_pct!=null)bits.push('сверка SKU '+esc(p.vision_match_pct)+'%');
 if(p.vision_quality_score!=null)bits.push('качество фото '+esc(p.vision_quality_score)+'/100');
 return '<div class="st346-ai"><strong>📷 '+esc(visionLabel(p.vision_status))+'</strong>'+(bits.length?'<div class="st346-meta">'+bits.join(' · ')+'</div>':'')+(p.vision_summary?'<p>'+esc(p.vision_summary)+'</p>':'')+'</div>';
}
function latestStandPhoto(p){return safe(p?.last_control_photo_path||p?.vision_photo_path||p?.installation_photo_path||'')}
function openCrmClient(id){
 try{
   if(typeof window.openClient==='function')return window.openClient(id);
   if(typeof openClient==='function')return openClient(id);
 }catch(e){console.warn(V,'openClient failed',e)}
 alert('Карточка клиента сейчас недоступна. Обновите CRM и попробуйте ещё раз.');
}
async function viewStandPhoto(p){
 const path=latestStandPhoto(p);
 if(!path)return alert('Фото стенда ещё не загружено. Менеджеру нужно открыть «Контроль / фото / SKU» и добавить актуальный снимок.');
 const m=openModal('Фото стенда',safe(p.client_name)+' · '+typeName(p.asset_type_id),'<div class="st346-alert info">Загружаю фотографию…</div>','<button class="btn-secondary" data-st346-close>Закрыть</button><button class="btn-secondary" data-st348-open-original="'+esc(path)+'">Открыть оригинал</button>');
 const body=m.querySelector('[data-st346-modal-body]');
 try{
   let signed=await dbc().storage.from('stand-files').createSignedUrl(path,1800,{transform:{width:1400,height:1050,resize:'contain',quality:82}});
   if(signed.error||!signed.data?.signedUrl)signed=await dbc().storage.from('stand-files').createSignedUrl(path,1800);
   if(signed.error)throw signed.error;
   const url=signed.data?.signedUrl;
   if(!url)throw new Error('Не удалось получить ссылку на фото');
   body.innerHTML='<div style="display:flex;justify-content:center;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:8px"><img src="'+esc(url)+'" alt="Фото стенда" style="display:block;max-width:100%;max-height:72vh;object-fit:contain;border-radius:9px"></div>'+
     '<div class="st346-meta" style="margin-top:8px">Последнее актуальное фото. '+(p.vision_checked_at?'Vision проверен: '+esc(new Date(p.vision_checked_at).toLocaleString('ru-RU')):'Vision ещё не запускался по этому фото.')+'</div>';
 }catch(e){
   body.innerHTML='<div class="st346-alert bad">Не удалось открыть фото: '+esc(e?.message||e)+'</div>';
 }
}
function css(){
 if(document.getElementById('st346-css'))return;
 const s=document.createElement('style');s.id='st346-css';s.textContent=
 '.st346-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}'+
 '.st346-head h2{margin:0;font-size:20px}.st346-head p{margin:4px 0 0;color:var(--sub);font-size:11px;line-height:1.45}'+
 '.st346-actions{display:flex;gap:7px;flex-wrap:wrap}.st346-actions button{min-height:38px}'+
 '.st346-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin-bottom:12px}.st346-kpi{background:#fff;border:1px solid var(--border);border-radius:11px;padding:11px}.st346-kpi small{display:block;color:var(--sub);font-size:9px}.st346-kpi b{display:block;font-size:21px;margin-top:3px}.st346-kpi em{font-size:9px;color:var(--sub);font-style:normal}'+
 '.st346-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;margin-bottom:12px;padding-bottom:2px}.st346-tab{border:1px solid var(--border);background:#fff;border-radius:9px;padding:8px 10px;white-space:nowrap;font-size:11px;cursor:pointer}.st346-tab.active{background:var(--ab);border-color:#bfdbfe;color:var(--at);font-weight:800}'+
 '.st346-list{display:flex;flex-direction:column;gap:8px}.st346-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px}.st346-card.badline{border-left:4px solid var(--r)}.st346-card.warnline{border-left:4px solid var(--am)}'+
 '.st346-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.st346-title{font-size:13px;font-weight:800;line-height:1.35}.st346-meta{font-size:10px;color:var(--sub);line-height:1.55;margin-top:4px}.st346-note{font-size:10px;line-height:1.5;margin-top:7px}.st346-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.st346-buttons button{min-height:38px;padding:7px 10px;font-size:10px}.st365-danger{border-color:#fecaca!important;color:#b91c1c!important;background:#fff7f7!important}'+
 '.st346-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 7px;font-size:9px;font-weight:800;margin:0 4px 4px 0;background:#f3f4f6;color:var(--sub)}.st346-badge.good{background:var(--gb);color:var(--g)}.st346-badge.warn{background:var(--amb);color:var(--am)}.st346-badge.bad{background:var(--rb);color:var(--r)}.st346-badge.info{background:var(--ab);color:var(--at)}'+
 '.st346-tablewrap{overflow:auto;border:1px solid var(--border);border-radius:10px}.st346-table{width:100%;border-collapse:collapse;min-width:650px}.st346-table th,.st346-table td{padding:8px 9px;border-bottom:1px solid var(--border);text-align:left;font-size:10px}.st346-table th{background:var(--bg);color:var(--sub);position:sticky;top:0}.st346-table tr:last-child td{border-bottom:0}.st346-link{color:var(--a);font-weight:700;cursor:pointer;text-decoration:underline}'+
 '.st346-alert{border-radius:10px;padding:9px 10px;font-size:10px;line-height:1.5;margin-bottom:9px}.st346-alert.bad{background:var(--rb);color:var(--r);border:1px solid #fecaca}.st346-alert.warn{background:var(--amb);color:var(--am);border:1px solid #fde68a}.st346-alert.info{background:var(--ab);color:var(--at);border:1px solid #bfdbfe}'+
 '.st346-modal{position:fixed;inset:0;background:rgba(15,23,42,.46);z-index:10200;display:none;align-items:center;justify-content:center;padding:14px}.st346-modal.open{display:flex}.st346-modal-card{width:min(920px,96vw);max-height:94dvh;overflow:auto;background:#fff;border-radius:15px;padding:15px;box-shadow:0 24px 80px rgba(0,0,0,.28)}'+
 '.st346-modal-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:11px}.st346-modal-head h3{margin:0;font-size:17px}.st346-modal-head p{margin:3px 0 0;font-size:10px;color:var(--sub)}.st346-x{border:0;background:none;font-size:24px;min-width:44px;min-height:44px;cursor:pointer}'+
 '.st346-formgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.st346-field{margin-bottom:9px}.st346-field label{display:block;font-size:10px;color:var(--sub);font-weight:700;margin-bottom:4px}.st346-field input,.st346-field select,.st346-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;padding:9px;background:#fff;color:var(--text);font:inherit}.st346-help{font-size:9px;color:var(--sub);line-height:1.4;margin-top:3px}'+
 '.st346-sales{margin-top:10px}.st346-sales-head{display:flex;justify-content:space-between;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:7px}.st346-sales-head b{font-size:11px}.st346-sales-back{border:0;background:none;color:var(--a);font-size:10px;font-weight:700;cursor:pointer}'+
 '.st346-ai{border:1px solid #bfdbfe;background:#f8fbff;border-radius:10px;padding:10px;margin-top:9px}.st346-ai strong{font-size:12px}.st346-ai p{font-size:10px;margin:5px 0 0;line-height:1.5}.st346-score{font-size:20px;font-weight:900;float:right}'+
 '.st346-foot{position:sticky;bottom:-15px;background:#fff;border-top:1px solid var(--border);margin:13px -15px -15px;padding:10px 15px;display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}.st346-foot button{min-height:44px}'+
 '.st346-json{white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e2e8f0;padding:9px;border-radius:8px;font-size:9px;max-height:260px;overflow:auto}'+
 '.st350-catalog{border:1px solid #bfdbfe;background:#f8fbff;border-radius:12px;padding:10px;margin:10px 0}.st350-cat-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.st350-cat-head b{font-size:12px}.st350-cat-count{background:var(--ab);color:var(--at);font-size:10px;font-weight:800;border-radius:99px;padding:4px 8px}.st350-toggles{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}.st350-toggles label{display:flex;gap:6px;align-items:center;font-size:10px;color:var(--sub);font-weight:700}.st350-filters{display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:7px}.st350-filters select,.st350-filters input{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;padding:8px;background:#fff;color:var(--text)}.st350-selected{background:#fff;border:1px solid var(--border);border-radius:9px;padding:8px;margin-top:8px}.st350-selected-list{display:flex;gap:5px;flex-wrap:wrap;max-height:110px;overflow:auto;margin-top:6px}.st350-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border);border-radius:8px;padding:5px 7px;background:#fff;font-size:9px}.st350-chip button{border:0;background:none;color:var(--r);font-size:14px;cursor:pointer;padding:0;min-width:20px}.st350-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}.st350-toolbar button{min-height:36px;font-size:10px}.st350-price-no{color:var(--am);font-weight:700}.st350-rec{font-weight:800}.st350-rec.keep{color:var(--g)}.st350-rec.add{color:var(--a)}.st350-rec.weak{color:var(--r)}.st350-rec.ctrl{color:var(--am)}.st350-check{width:20px;height:20px}.st350-table td:first-child,.st350-table th:first-child{text-align:center;width:38px}'+
 '@media(max-width:900px){.st346-formgrid{grid-template-columns:1fr}.st346-modal-card{width:96vw}.st346-field input,.st346-field select,.st346-field textarea{font-size:16px;min-height:44px}.st346-buttons button,.st346-actions button{min-height:44px}.st350-filters{grid-template-columns:1fr}.st350-filters select,.st350-filters input{font-size:16px;min-height:44px}.st350-toolbar button{min-height:44px}}'+
 '@media(max-width:640px){.st346-modal{padding:0}.st346-modal-card{width:100vw;height:100dvh;max-height:100dvh;border-radius:0;padding:12px}.st346-foot{bottom:-12px;margin:12px -12px -12px;padding:10px 12px}.st346-foot button{flex:1 1 100%}.st346-kpis{grid-template-columns:1fr 1fr}.st346-row{flex-direction:column}.st346-buttons button{flex:1 1 calc(50% - 4px)}}';
 document.head.appendChild(s);
}
async function rpc(name,args={}){
 const {data,error}=await dbc().rpc(name,args);if(error)throw error;return data;
}
async function reload(){
 if(state.loading)return;
 state.loading=true;
 try{
  let lastError=null;
  for(let attempt=0;attempt<2;attempt++){
   try{state.boot=await rpc('crm_stands_bootstrap_v236346',{p_limit:150});render();return}
   catch(e){
    lastError=e;
    const timeout=/57014|statement timeout|canceling statement/i.test(safe(e?.message||e));
    if(!timeout||attempt>0)throw e;
    await new Promise(r=>setTimeout(r,140));
   }
  }
  if(lastError)throw lastError;
 }catch(e){console.error(V,e);if(root())root().innerHTML='<div class="st346-alert bad">Не удалось открыть раздел «Стенды»: '+esc(e?.message||e)+'</div>'}
 finally{state.loading=false}
}
function kpi(label,value,sub=''){return '<div class="st346-kpi"><small>'+esc(label)+'</small><b>'+esc(value)+'</b>'+(sub?'<em>'+esc(sub)+'</em>':'')+'</div>'}
function header(){
 const s=state.boot?.summary||{};
 return '<div class="st346-head"><div><h2>🧱 Стенды / ОС</h2><p>Имущество → заявка → ДФ → договор и установка → продажи → рекомендации ИИ. Данные загружаются только внутри этого раздела.</p></div><div class="st346-actions">'+
 (isManager()?'<button class="btn-primary" data-st346-new-request>+ Заявка на стенд</button>':'')+
 ((isDF()||isDFS())?'<button class="btn-primary" data-st365-manual-add>+ Добавить установленный стенд</button>':'')+
 '<button class="btn-secondary" data-st346-refresh>↻ Обновить</button></div></div>'+
 '<div class="st346-kpis">'+
 kpi('ОС по реестру',s.os_units||0,'единиц')+
 kpi(isManager()?'Доступно / мои ОС':'Физически заведено',s.physical_assets||0,isManager()?'видимые единицы':'единиц')+
 kpi('У клиентов',s.installed||0,'сверено с ОС')+
 kpi('Свободно',s.free||0,'можно резервировать')+
 kpi('Не сверено',s.legacy_unreconciled||0,'факт из Excel')+
 kpi('На согласовании',s.pending_df||0,'заявок')+
 kpi('Без акта передачи',s.no_transfer_act||0,'требует контроля')+
 kpi('Фото старше 31 дня',s.stale_photo||0,'требует обновления')+
 kpi('Нужен первичный контроль',s.needs_primary_control||0,'нет фото или SKU')+
 kpi('История / архив',s.history||0,'возвраты и ручной архив')+
 '</div>';
}
function tabs(){
 const a=[['placements','У клиентов'],['requests','Заявки'],['history','История / архив']];
 if(isDF()||isDFS())a.push(['os','ОС / реестр'],['recommendations','ИИ · кандидаты']);
 if(isDFS())a.push(['internal','Логика ИИ · ДФС']);
 return '<div class="st346-tabs">'+a.map(x=>'<button class="st346-tab '+(state.tab===x[0]?'active':'')+'" data-st346-tab="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
}
function render(){
 if(!active()||!root()||!state.boot)return;
 root().innerHTML=header()+tabs()+'<div id="st346-body">'+body()+'</div>';
}
function body(){
 if(state.tab==='requests')return requestsHtml();
 if(state.tab==='history')return historyHtml();
 if(state.tab==='os')return osHtml();
 if(state.tab==='recommendations')return recommendationsHtml();
 if(state.tab==='internal')return internalHtml();
 return placementsHtml();
}
function requestsHtml(){
 const rows=arr(state.boot?.requests);
 if(!rows.length)return '<div class="st346-card">Заявок пока нет.</div>';
 return '<div class="st346-list">'+rows.map(r=>{
   const t=typeName(r.asset_type_id),assigned=requestAssets(r.id),canEdit=isManager()&&['draft_manager','returned'].includes(r.status);
   let buttons='';
   if(canEdit)buttons+='<button class="btn-secondary" data-st346-edit-request="'+r.id+'">Изменить</button><button class="btn-primary" data-st346-submit-request="'+r.id+'">Отправить ДФ</button>';
   if(isDF()&&r.status==='pending_df')buttons+='<button class="btn-primary" data-st346-request-action="approve" data-id="'+r.id+'">Согласовать</button><button class="btn-secondary" data-st346-request-action="return" data-id="'+r.id+'">На доработку</button><button class="btn-secondary" data-st346-request-action="reject" data-id="'+r.id+'">Отклонить</button>';
   if((isDF()||isManager())&&r.status==='approved')buttons+='<button class="btn-primary" data-st346-install="'+r.id+'">Подтвердить установку</button>';
   return '<div class="st346-card '+(r.status==='pending_df'?'warnline':'')+'"><div class="st346-row"><div><div class="st346-title">'+esc(r.client_name)+' · '+esc(t)+'</div><div class="st346-meta">'+requestStatus(r.status)+' Менеджер: '+esc(r.manager_name)+' · '+esc(r.requested_qty)+' шт.'+(r.target_address?' · '+esc(r.target_address):'')+'</div></div>'+(r.ai_score!=null?'<div>'+badge('ИИ '+r.ai_score+'/100',r.ai_score>=75?'good':r.ai_score>=55?'warn':'bad')+'</div>':'')+'</div>'+
   (r.ai_public_summary?'<div class="st346-ai"><strong>'+esc(r.ai_recommendation||'ИИ-анализ')+'</strong><p>'+esc(r.ai_public_summary)+'</p></div>':'')+
   (r.df_comment?'<div class="st346-alert '+(r.status==='rejected'?'bad':'warn')+'"><b>Комментарий ДФ:</b> '+esc(r.df_comment)+'</div>':'')+
   (assigned.length?'<div class="st346-note"><b>Зарезервировано:</b> '+assigned.map(esc).join(', ')+'</div>':'')+
   '<div class="st346-buttons"><button class="btn-secondary" data-st346-sales-client="'+r.client_id+'">Продажи клиента</button>'+buttons+'</div></div>';
 }).join('')+'</div>';
}
function placementsHtml(){
 const rows=arr(state.boot?.placements);
 if(!rows.length)return '<div class="st346-card">Установленных стендов пока нет.</div>';
 return '<div class="st346-list">'+rows.map(p=>{
   const c=contractFor(p.contract_id),its=itemsForPlacement(p.id),legacy=p.status==='legacy_unreconciled',photoPath=latestStandPhoto(p),visionTask=visionTaskForPlacement(p.id),visionTaskOpen=visionTask&&!visionTask.done;
   let actions='';
   if((isManager()||isDF())&&['active','legacy_unreconciled'].includes(p.status)){
     actions+=(visionTaskOpen
       ?'<button class="btn-primary" data-st367-recontrol="'+p.id+'">🔁 Повторный контроль'+(visionTask.due_date?' · до '+esc(dateRu(visionTask.due_date)):'')+'</button>'
       :'<button class="btn-secondary" data-st346-control="'+p.id+'">Контроль / фото / SKU</button>');
     actions+='<button class="btn-secondary" data-st346-assess-placement="'+p.id+'">ИИ-анализ продаж</button>';
     if(photoPath)actions+='<button class="btn-secondary" data-st348-photo="'+p.id+'">📷 Фото стенда</button><button class="btn-secondary" data-st347-vision="'+p.id+'">🤖 Vision по фото</button>';
     else actions+='<button class="btn-secondary" disabled title="Менеджер ещё не загрузил реальное фото">📷 Фото не загружено</button>';
     if(isDF())actions+='<button class="btn-secondary" data-st346-return-decision="'+p.id+'">Решение ДФ: забрать</button>';
   }
   if(isDFS()&&['active','legacy_unreconciled','return_requested'].includes(p.status)){
     actions+='<button class="btn-secondary" data-st348-client="'+p.client_id+'">👤 Карточка клиента</button>';
     if(photoPath)actions+='<button class="btn-primary" data-st348-photo="'+p.id+'">📷 Фото стенда</button><button class="btn-secondary" data-st347-vision="'+p.id+'">🤖 Vision по фото</button>';
     else actions+='<button class="btn-secondary" disabled title="Файл фотографии ещё не загружен в CRM">📷 Фото не загружено</button>';
   }
   if((isManager()||isDF())&&p.status==='return_requested'){
     actions+='<button class="btn-primary" data-st346-return="'+p.id+'">Оформить возврат</button>';
   }
   if((isDF()||isDFS())&&['active','legacy_unreconciled','return_requested'].includes(p.status))actions+='<button class="btn-secondary st365-danger" data-st365-archive="'+p.id+'">Убрать из рабочего списка</button>';
   if(c?.contract_path)actions+='<button class="btn-secondary" data-st346-file="'+esc(c.contract_path)+'">Договор</button>';
   if(c?.act_transfer_path)actions+='<button class="btn-secondary" data-st346-file="'+esc(c.act_transfer_path)+'">Акт передачи</button>';
   const incomplete=!photoPath||!its.length;
   const aiBadges=incomplete?badge('Нужен первичный контроль','warn'):((p.ai_score!=null?badge('ИИ '+p.ai_score+'/100',aiTone(p.ai_status)):'')+(p.ai_status?badge(aiLabel(p.ai_status),aiTone(p.ai_status)):''));
   return '<div class="st346-card '+(legacy?'badline':p.ai_status==='return'?'badline':'')+'"><div class="st346-row"><div><div class="st346-title"><span class="st346-link" data-st348-client="'+p.client_id+'" title="Открыть карточку клиента">'+esc(p.client_name)+'</span> · '+esc(typeName(p.asset_type_id))+'</div><div class="st346-meta">'+placementStatus(p)+' '+(p.asset_id?'ОС: '+esc(assetCode(p.asset_id)):'ОС: не сопоставлено')+' · '+esc(p.manager_name)+' · с '+esc(p.installed_at)+'<br>'+esc(p.address)+'</div></div><div>'+aiBadges+'</div></div>'+
   (legacy?'<div class="st346-alert bad"><b>Расхождение ОС:</b> размещение есть в Excel ДФ, но соответствующая физическая единица Resanta отсутствует в предоставленном реестре ОС. Автоматически к стенду Вихрь не привязываю.</div>':'')+
   (p.ai_public_summary?'<div class="st346-ai"><strong>'+esc(aiLabel(p.ai_status))+'</strong><p>'+esc(p.ai_public_summary)+'</p></div>':'')+
   visionBlock(p)+
   visionTaskBlock(p)+
   (p.return_comment?'<div class="st346-alert warn"><b>Решение ДФ о возврате:</b> '+esc(p.return_comment)+(p.return_requested_by?' · '+esc(p.return_requested_by):'')+'</div>':'')+
   '<div class="st346-note"><b>Договор:</b> '+(c?esc(c.contract_no||'без номера')+' · '+esc(c.status):'не привязан')+(its.length?' · <b>SKU:</b> '+its.map(x=>esc(x.sku)).join(', '):' · SKU пока не зафиксированы')+'</div>'+
   '<div class="st346-buttons"><button class="btn-secondary" data-st346-sales-client="'+p.client_id+'">Продажи клиента</button>'+actions+'</div></div>';
 }).join('')+'</div>';
}
function historyHtml(){
 const rows=arr(state.boot?.history);
 if(!rows.length)return '<div class="st346-card">История пока пустая. Возвращённые и вручную архивированные стенды будут храниться здесь.</div>';
 return '<div class="st346-alert info"><b>История не удаляется.</b> Здесь сохраняются договоры, фото, SKU, причина архива/возврата и связь с клиентом.</div><div class="st346-list">'+rows.map(p=>{
   const c=contractFor(p.contract_id),its=itemsForPlacement(p.id),photoPath=latestStandPhoto(p);
   let actions='<button class="btn-secondary" data-st348-client="'+p.client_id+'">👤 Карточка клиента</button>';
   if(photoPath)actions+='<button class="btn-secondary" data-st365-history-photo="'+p.id+'">📷 Последнее фото</button>';
   if(c?.contract_path)actions+='<button class="btn-secondary" data-st346-file="'+esc(c.contract_path)+'">Договор</button>';
   if(c?.act_return_path)actions+='<button class="btn-secondary" data-st346-file="'+esc(c.act_return_path)+'">Акт возврата</button>';
   const why=safe(p.note||p.return_comment||'');
   return '<div class="st346-card"><div class="st346-row"><div><div class="st346-title">'+esc(p.client_name)+' · '+esc(typeName(p.asset_type_id))+'</div><div class="st346-meta">'+placementStatus(p)+' · '+esc(p.manager_name)+' · установлен '+esc(p.installed_at||'—')+' · убран '+esc(p.removed_at||'—')+'<br>'+esc(p.address||'')+'</div></div><div>'+badge(p.status==='archived_manual'?'Ручной архив':'Фактический возврат',p.status==='archived_manual'?'gray':'info')+'</div></div>'+
     (why?'<div class="st346-note"><b>Причина / комментарий:</b> '+esc(why)+'</div>':'')+
     '<div class="st346-note"><b>ОС:</b> '+esc(p.asset_id?assetCode(p.asset_id):'не привязан')+(its.length?' · <b>SKU:</b> '+its.map(x=>esc(x.sku)).join(', '):'')+'</div>'+
     '<div class="st346-buttons">'+actions+'</div></div>';
 }).join('')+'</div>';
}
function osHtml(){
 const lots=arr(state.boot?.os_lots),assets=arr(state.boot?.assets),types=arr(state.boot?.asset_types),unrec=arr(state.boot?.placements).filter(x=>!x.asset_id&&['active','legacy_unreconciled'].includes(x.status));
 return (unrec.length?'<div class="st346-alert bad"><b>Сверка не сходится:</b> по предоставленному ОС заведено 10 настенных стендов Вихрь и 2 стойки Huter, а в Excel ДФ есть '+unrec.length+' размещения стендов Resanta, которых отдельной строкой в этом ОС нет. Они оставлены «не сверено», без подмены ОС.</div>':'')+
 '<div class="st346-card"><div class="card-title">ОС / закупки</div><div class="st346-tablewrap"><table class="st346-table"><thead><tr><th>ОС</th><th>Кол-во</th><th>Дата</th><th>Стоимость/шт</th><th>Источник</th></tr></thead><tbody>'+lots.map(l=>'<tr><td>'+esc(l.os_name)+'</td><td><b>'+esc(l.quantity)+'</b></td><td>'+esc(l.acquired_on||'—')+'</td><td>'+esc(l.unit_cost_byn==null?'не внесена':money(l.unit_cost_byn))+'</td><td>'+esc(l.source_note||'—')+'</td></tr>').join('')+'</tbody></table></div></div>'+
 '<div class="st346-card"><div class="card-title">Типы стендов и товарный охват ИИ</div>'+types.map(t=>'<div class="st346-row" style="padding:7px 0;border-top:1px solid var(--border)"><div><div class="st346-title">'+esc(t.name)+'</div><div class="st346-meta">Группы для поиска кандидатов: '+(arr(t.target_categories).length?arr(t.target_categories).map(esc).join(', '):'все группы клиента')+'</div></div>'+(isDF()?'<button class="btn-secondary" data-st346-type-cats="'+t.id+'">Настроить группы</button>':'')+'</div>').join('')+'</div>'+
 '<div class="st346-card"><div class="card-title">Физические единицы ОС</div><div class="st346-tablewrap"><table class="st346-table"><thead><tr><th>ID</th><th>Тип</th><th>Статус</th><th>Клиент</th><th>Состояние</th></tr></thead><tbody>'+assets.map(a=>'<tr><td><b>'+esc(a.asset_code)+'</b></td><td>'+esc(typeName(a.asset_type_id))+'</td><td>'+esc(a.status)+'</td><td>'+esc(a.current_client_id?byId(clients(),a.current_client_id)?.name||a.current_client_id:'—')+'</td><td>'+esc(a.condition_status)+'</td></tr>').join('')+'</tbody></table></div></div>';
}
function recommendationsHtml(){
 if(!(isDF()||isDFS()))return '<div class="st346-card">Доступно ДФ и ДФС.</div>';
 const types=arr(state.boot?.asset_types),rows=arr(state.boot?.recommendations);
 return '<div class="st346-card"><div class="st346-row"><div><div class="st346-title">ИИ ищет клиентов, которым стоит предложить стенд</div><div class="st346-meta">Поиск запускается только ДФ вручную и не влияет на скорость обычной CRM. Перед установкой ДФ обсуждает с менеджером реальное полочное пространство.</div></div>'+(isDF()?'<div class="st346-actions"><select id="st346-candidate-type" class="form-input">'+types.map(t=>'<option value="'+t.id+'">'+esc(t.name)+'</option>').join('')+'</select><button class="btn-primary" data-st346-generate>Найти кандидатов</button></div>':'')+'</div></div>'+
 (rows.length?'<div class="st346-list">'+rows.map(x=>{
   let buttons='';
   if(isDF()&&x.status==='open')buttons='<button class="btn-primary" data-st346-rec="initiative" data-id="'+x.id+'">Обсудить / создать инициативу</button><button class="btn-secondary" data-st346-rec="defer" data-id="'+x.id+'">Отложить</button><button class="btn-secondary" data-st346-rec="reject" data-id="'+x.id+'">Отклонить</button>';
   return '<div class="st346-card"><div class="st346-row"><div><div class="st346-title">'+esc(x.client_name||'Клиент')+' · '+esc(typeName(x.asset_type_id))+'</div><div class="st346-meta">Менеджер: '+esc(x.manager_name||'—')+' · статус: '+esc(x.status)+'</div></div>'+badge('Потенциал '+esc(x.score)+'/100',x.score>=75?'good':x.score>=55?'warn':'info')+'</div><div class="st346-note">'+esc(x.public_summary||'')+'</div>'+(x.df_comment?'<div class="st346-alert info"><b>Комментарий ДФ:</b> '+esc(x.df_comment)+'</div>':'')+'<div class="st346-buttons"><button class="btn-secondary" data-st346-sales-client="'+x.client_id+'">Продажи клиента</button>'+buttons+'</div></div>';
 }).join('')+'</div>':'<div class="st346-card">Кандидаты ещё не сформированы. ДФ выбирает тип стенда и запускает поиск.</div>');
}
function internalHtml(){
 if(!isDFS())return '<div class="st346-card">Внутренняя логика доступна только ДФС.</div>';
 if(state.dfs===null)return '<div class="st346-card"><button class="btn-primary" data-st346-load-internal>Загрузить внутреннюю логику ИИ</button><div class="st346-meta">Загружается только по запросу ДФС.</div></div>';
 if(!state.dfs.length)return '<div class="st346-card">Записей ИИ пока нет.</div>';
 return '<div class="st346-alert info"><b>Только ДФС:</b> здесь видны формулы, исходные метрики и компоненты оценки. Менеджерам этот блок не доступен.</div><div class="st346-list">'+state.dfs.map(x=>'<details class="st346-card"><summary><b>'+esc(x.entity_type)+' · '+esc(x.entity_id)+'</b> · '+esc(x.created_at)+'</summary><pre class="st346-json">'+esc(JSON.stringify(x.internal_logic,null,2))+'</pre></details>').join('')+'</div>';
}
function ensureModal(){
 let m=document.getElementById('st346-modal');if(m)return m;
 m=document.createElement('div');m.id='st346-modal';m.className='st346-modal';m.innerHTML='<div class="st346-modal-card"><div class="st346-modal-head"><div><h3 data-st346-modal-title></h3><p data-st346-modal-sub></p></div><button class="st346-x" data-st346-close>×</button></div><div data-st346-modal-body></div><div class="st346-foot" data-st346-modal-foot></div></div>';
 document.body.appendChild(m);return m;
}
function openModal(title,sub,html,foot){
 const m=ensureModal();m.querySelector('[data-st346-modal-title]').textContent=title;m.querySelector('[data-st346-modal-sub]').textContent=sub||'';m.querySelector('[data-st346-modal-body]').innerHTML=html;m.querySelector('[data-st346-modal-foot]').innerHTML=foot||'<button class="btn-secondary" data-st346-close>Закрыть</button>';m.classList.add('open');return m;
}
function closeModal(){document.getElementById('st346-modal')?.classList.remove('open');state.sales=null;state.salesLevel='category';state.salesCategory=null;state.salesSubgroup=null;state.reqCats=new Set();state.catalog=null;state.catalogSelected=new Map();state.catalogLegacy=[];if(state.catalogTimer){clearTimeout(state.catalogTimer);state.catalogTimer=null}}
async function upload(file,prefix){
 if(!file)return null;
 const ext=(safe(file.name).split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
 const path=prefix+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
 const {error}=await dbc().storage.from('stand-files').upload(path,file,{upsert:false,contentType:file.type||undefined});if(error)throw error;return path;
}
async function openFile(path){
 try{const {data,error}=await dbc().storage.from('stand-files').createSignedUrl(path,300);if(error)throw error;if(data?.signedUrl)window.open(data.signedUrl,'_blank','noopener')}
 catch(e){alert('Не удалось открыть файл: '+safe(e?.message||e))}
}
function currentRequest(){return state.requestId?byId(state.boot?.requests,state.requestId):null}
function clientOptions(selected=''){
 const q=safe(document.getElementById('st346-client-search')?.value).trim().toLowerCase();
 return clients().filter(c=>!q||safe(c.name+' '+(c.city||'')+' '+(c.address||'')).toLowerCase().includes(q)).slice(0,400).map(c=>'<option value="'+c.id+'" '+(safe(c.id)===safe(selected)?'selected':'')+'>'+esc(c.name)+(c.city?' · '+esc(c.city):'')+'</option>').join('');
}
function manualClientOptions(selected=''){
 const q=safe(document.getElementById('st365-client-search')?.value).trim().toLowerCase();
 return clients().filter(x=>!q||safe(x.name+' '+(x.city||'')+' '+(x.address||'')).toLowerCase().includes(q)).slice(0,500).map(x=>'<option value="'+x.id+'" '+(safe(x.id)===safe(selected)?'selected':'')+'>'+esc(x.name)+(x.city?' · '+esc(x.city):'')+(x.manager_name?' · '+esc(x.manager_name):'')+'</option>').join('');
}
function manualAssetOptions(typeId=''){
 const rows=arr(state.boot?.assets).filter(a=>a.status==='free'&&(!typeId||safe(a.asset_type_id)===safe(typeId)));
 return '<option value="">Не привязывать ОС сейчас · будет «Не сверено»</option>'+rows.map(a=>'<option value="'+a.id+'">'+esc(a.asset_code)+' · '+esc(typeName(a.asset_type_id))+'</option>').join('');
}
function manualAddForm(){
 const types=arr(state.boot?.asset_types).filter(x=>x.active!==false),typeId=safe(types[0]?.id);
 const html='<div class="st346-alert info"><b>Ручное добавление — только для уже установленного стенда.</b> Если ОС неизвестен, не подменяем его: запись будет «Не сверено с ОС».</div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>Клиент</label><input id="st365-client-search" placeholder="Поиск клиента"><select id="st365-client"><option value="">Выберите клиента</option>'+manualClientOptions('')+'</select></div>'+
 '<div class="st346-field"><label>Тип стенда</label><select id="st365-type">'+types.map(t=>'<option value="'+t.id+'">'+esc(t.name)+'</option>').join('')+'</select></div></div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>Физический ОС</label><select id="st365-asset">'+manualAssetOptions(typeId)+'</select><div class="st346-help">Показываются только свободные ОС выбранного типа.</div></div>'+
 '<div class="st346-field"><label>Дата установки</label><input id="st365-date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div></div>'+
 '<div class="st346-field"><label>Адрес установки</label><input id="st365-address" placeholder="Фактический адрес"></div>'+
 '<details class="st346-card" style="margin-top:8px"><summary><b>Договор и документы · необязательно</b></summary><div class="st346-formgrid" style="margin-top:8px"><div class="st346-field"><label>Номер договора</label><input id="st365-contract-no"></div><div class="st346-field"><label>Дата договора</label><input id="st365-contract-date" type="date"></div></div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>Действует до</label><input id="st365-valid-to" type="date"></div><div class="st346-field"><label>PDF договора</label><input id="st365-contract-file" type="file" accept="application/pdf"></div></div>'+
 '<div class="st346-field"><label>Акт передачи</label><input id="st365-act-file" type="file" accept="application/pdf,image/*"></div></details>'+
 '<div class="st346-field"><label>Фото стенда · желательно сразу</label><input id="st365-photo" type="file" accept="image/*"><div class="st346-help">Без фото ИИ покажет «Нужен первичный контроль» и не выставит балл.</div></div>'+
 '<div class="st346-field"><label>SKU на стенде · необязательно</label><textarea id="st365-skus" rows="4" placeholder="Один SKU с новой строки или через запятую"></textarea><div class="st346-help">Без SKU ИИ также не выставляет итоговую оценку.</div></div>'+
 '<div class="st346-field"><label>Комментарий</label><textarea id="st365-note" rows="3" placeholder="Откуда данные / почему добавляем вручную"></textarea></div>';
 openModal('Добавить установленный стенд вручную','ДФ/ДФС · история и ОС сохраняются',html,'<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary" data-st365-save-manual>Добавить</button>');
}
async function saveManualAdd(allowDuplicate=false){
 const clientId=document.getElementById('st365-client')?.value,typeId=document.getElementById('st365-type')?.value;
 const addr=safe(document.getElementById('st365-address')?.value).trim();
 if(!clientId)return alert('Выберите клиента'); if(!typeId)return alert('Выберите тип стенда'); if(!addr)return alert('Укажите адрес установки');
 const btn=document.querySelector('[data-st365-save-manual]');if(btn){btn.disabled=true;btn.textContent='Сохраняю…'}
 try{
   const cf=document.getElementById('st365-contract-file')?.files?.[0],af=document.getElementById('st365-act-file')?.files?.[0],pf=document.getElementById('st365-photo')?.files?.[0];
   const stamp='manual/'+Date.now();
   const [contract,act,photo]=await Promise.all([
     cf?upload(cf,stamp+'/contract'):Promise.resolve(null),
     af?upload(af,stamp+'/act'):Promise.resolve(null),
     pf?upload(pf,stamp+'/photo'):Promise.resolve(null)
   ]);
   await rpc('crm_stands_manual_add_v236365',{
     p_client_id:clientId,p_asset_type_id:typeId,p_address:addr,
     p_installed_at:document.getElementById('st365-date')?.value||null,
     p_asset_id:document.getElementById('st365-asset')?.value||null,
     p_contract_no:safe(document.getElementById('st365-contract-no')?.value).trim()||null,
     p_contract_date:document.getElementById('st365-contract-date')?.value||null,
     p_valid_to:document.getElementById('st365-valid-to')?.value||null,
     p_contract_path:contract,p_act_transfer_path:act,p_install_photo_path:photo,
     p_skus:splitSkus(document.getElementById('st365-skus')?.value),
     p_note:safe(document.getElementById('st365-note')?.value).trim()||null,
     p_allow_duplicate:!!allowDuplicate
   });
   await reload();closeModal();state.tab='placements';render();alert('Стенд добавлен. Если не хватает фото или SKU, карточка помечена «Нужен первичный контроль».');
 }catch(e){
   const msg=safe(e?.message||e);
   if(!allowDuplicate&&msg.includes('Похожий действующий стенд')){
     if(confirm(msg+'\n\nЕсли это действительно второй отдельный стенд, нажмите OK.'))return saveManualAdd(true);
   }
   alert('Не удалось добавить стенд: '+msg);
 }finally{if(btn){btn.disabled=false;btn.textContent='Добавить'}}
}
function archiveForm(p){
 const hasAsset=!!p?.asset_id;
 const html='<div class="st346-alert warn"><b>Запись не удаляется из базы.</b> Она уйдёт из «У клиентов» в «История / архив». Договоры, фото, SKU и ИИ-история сохранятся.</div>'+
 '<div class="st346-field"><label>Причина</label><textarea id="st365-archive-reason" rows="4" placeholder="Почему запись нужно убрать из рабочего списка"></textarea></div>'+
 (hasAsset?'<label class="st346-note" style="display:flex;gap:8px;align-items:flex-start"><input id="st365-release-asset" type="checkbox" style="margin-top:2px"><span><b>Освободить физический ОС '+esc(assetCode(p.asset_id))+'</b><br>Отметьте только если стенд фактически больше не находится у этого клиента. Тогда ОС станет свободным.</span></label>':'<div class="st346-alert info">У записи нет привязанного ОС — архив изменит только рабочий список.</div>');
 openModal('Убрать стенд из рабочего списка',safe(p.client_name)+' · '+typeName(p.asset_type_id),html,'<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary st365-danger" data-st365-save-archive="'+p.id+'">В архив</button>');
}
async function saveArchive(id){
 const reason=safe(document.getElementById('st365-archive-reason')?.value).trim();if(!reason)return alert('Укажите причину');
 const release=!!document.getElementById('st365-release-asset')?.checked;
 if(release&&!confirm('Подтвердить: физический ОС будет помечен свободным и станет доступен для другой установки?'))return;
 const btn=document.querySelector('[data-st365-save-archive]');if(btn){btn.disabled=true;btn.textContent='Переношу в архив…'}
 try{
   await rpc('crm_stands_archive_placement_v236365',{p_placement_id:id,p_reason:reason,p_release_asset:release});
   await reload();closeModal();state.tab='placements';render();alert(release?'Запись перенесена в архив, ОС освобождён.':'Запись перенесена в архив. ОС не освобождался.');
 }catch(e){alert('Не удалось перенести в архив: '+safe(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='В архив'}}
}
function requestForm(r=null){
 state.requestId=r?.id||null;state.reqCats=new Set(arr(r?.selected_categories));
 const selected=r?.client_id||'',types=arr(state.boot?.asset_types).filter(x=>x.active!==false);
 const html='<div class="st346-formgrid"><div class="st346-field"><label>Клиент</label><input id="st346-client-search" placeholder="Поиск клиента"><select id="st346-client"><option value="">Выберите клиента</option>'+clientOptions(selected)+'</select><div class="st346-help">После выбора CRM сама подтянет продажи по группам.</div></div>'+
 '<div class="st346-field"><label>Тип стенда</label><select id="st346-type">'+types.map(t=>'<option value="'+t.id+'" '+(safe(t.id)===safe(r?.asset_type_id)?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select><div class="st346-help">ДФ затем резервирует конкретную физическую единицу ОС.</div></div></div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>Количество</label><input id="st346-qty" type="number" min="1" max="20" value="'+esc(r?.requested_qty||1)+'"></div><div class="st346-field"><label>Предполагаемый адрес установки</label><input id="st346-address" value="'+esc(r?.target_address||'')+'"></div></div>'+
 '<div class="st346-field"><label>Фото полочного пространства</label><input id="st346-shelf-photo" type="file" accept="image/*"><div class="st346-help">'+(r?.shelf_photo_path?'Фото уже загружено. Новое заменит ссылку в заявке.':'Обязательно перед отправкой ДФ.')+'</div></div>'+
 '<div class="st346-field"><label>Комментарий менеджера</label><textarea id="st346-comment" rows="3" placeholder="Цель, что хотим развивать, договорённости по месту">'+esc(r?.manager_comment||'')+'</textarea></div>'+
 '<div id="st346-sales-box" class="st346-sales">'+(selected?'<div class="st346-alert info">Загружаю продажи клиента…</div>':'<div class="st346-alert info">Выберите клиента — продажи по группам подтянутся автоматически.</div>')+'</div>';
 const foot='<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary" data-st346-save-request>'+(r?'Сохранить и пересчитать ИИ':'Создать и проверить ИИ')+'</button>';
 openModal(r?'Изменить заявку':'Новая заявка на стенд','Продажи менеджер не вводит вручную — CRM берёт их из 1С.',html,foot);
 const sel=document.getElementById('st346-client');if(selected){sel.value=selected;loadSales(selected)}
}
async function loadSales(clientId,category=null,subgroup=null){
 const box=document.getElementById('st346-sales-box');if(box)box.innerHTML='<div class="st346-alert info">Загружаю продажи…</div>';
 try{
   const data=await rpc('crm_stands_client_sales_v236346',{p_client_id:clientId,p_category:category,p_subgroup:subgroup});
   state.sales=data;state.salesLevel=category?(subgroup?'sku':'subgroup'):'category';state.salesCategory=category;state.salesSubgroup=subgroup;renderSalesBox();
   const addr=document.getElementById('st346-address');
   if(addr&&!addr.value&&data?.client?.address)addr.value=data.client.address;
 }catch(e){if(box)box.innerHTML='<div class="st346-alert bad">Продажи не загрузились: '+esc(e?.message||e)+'</div>'}
}
function renderSalesBox(){
 const box=document.getElementById('st346-sales-box');if(!box||!state.sales)return;
 const rows=arr(state.sales.rows),lvl=state.salesLevel;
 const title=lvl==='category'?'Продажи по группам':lvl==='subgroup'?'Подгруппы · '+state.salesCategory:'SKU · '+state.salesCategory+' / '+state.salesSubgroup;
 box.innerHTML='<div class="st346-sales-head"><b>'+esc(title)+'</b>'+(lvl!=='category'?'<button class="st346-sales-back" data-st346-sales-back>← Назад</button>':'')+'</div>'+
 '<div class="st346-tablewrap"><table class="st346-table"><thead><tr><th>'+ (lvl==='category'?'Выбрать':'') +'</th><th>'+(lvl==='sku'?'SKU / товар':'Группа')+'</th><th>3 мес.</th><th>6 мес.</th><th>12 мес.</th><th>Прошлые 12</th><th>Динамика</th></tr></thead><tbody>'+
 (rows.length?rows.map(x=>{
   const n=lvl==='sku'?(esc(x.sku)+' · '+esc(x.name||'')):esc(x.name);
   const choose=lvl==='category'?'<input type="checkbox" data-st346-cat-check="'+esc(x.name)+'" '+(state.reqCats.has(x.name)?'checked':'')+'>':'';
   const open=lvl==='category'?'<span class="st346-link" data-st346-sales-cat="'+esc(x.name)+'">'+n+'</span>':lvl==='subgroup'?'<span class="st346-link" data-st346-sales-sub="'+esc(x.name)+'">'+n+'</span>':n;
   return '<tr><td>'+choose+'</td><td>'+open+'</td><td>'+money(x.sales_3m)+'</td><td><b>'+money(x.sales_6m)+'</b></td><td>'+money(x.sales_12m)+'</td><td>'+money(x.prev_12m)+'</td><td>'+pct(x.growth_pct)+'</td></tr>';
 }).join(''):'<tr><td colspan="7">Продаж в этом охвате нет.</td></tr>')+'</tbody></table></div><div class="st346-help">Отмеченные группы будут использоваться ИИ для оценки заявки: '+(state.reqCats.size?[...state.reqCats].map(esc).join(', '):'пока не выбраны — будет использован товарный охват типа стенда')+'</div>';
}
async function saveRequest(){
 const clientId=document.getElementById('st346-client')?.value,c=byId(clients(),clientId);if(!c)return alert('Выберите клиента');
 const typeId=document.getElementById('st346-type')?.value;if(!typeId)return alert('Выберите тип стенда');
 const qty=Math.max(1,Math.min(20,Number(document.getElementById('st346-qty')?.value||1)));
 const addr=safe(document.getElementById('st346-address')?.value).trim();if(!addr)return alert('Укажите предполагаемый адрес установки');
 const photo=document.getElementById('st346-shelf-photo')?.files?.[0];
 const old=currentRequest();let photoPath=old?.shelf_photo_path||null;
 if(!photoPath&&!photo)return alert('Добавьте фото полочного пространства');
 const btn=document.querySelector('[data-st346-save-request]');if(btn){btn.disabled=true;btn.textContent='Сохраняю…'}
 try{
   if(photo)photoPath=await upload(photo,'requests/'+(old?.id||'new'));
   const row={client_id:c.id,client_name:c.name,manager_name:c.manager_name||profile()?.name||'',asset_type_id:typeId,requested_qty:qty,target_address:addr,selected_categories:[...state.reqCats],shelf_photo_path:photoPath,manager_comment:safe(document.getElementById('st346-comment')?.value).trim()||null,status:old?.status||'draft_manager',source:old?.source||'manager'};
   let id=old?.id;
   if(id){const {error}=await dbc().from('stand_requests_v236346').update(row).eq('id',id);if(error)throw error}
   else{const {data,error}=await dbc().from('stand_requests_v236346').insert(row).select('id').single();if(error)throw error;id=data.id}
   const a=await rpc('crm_stands_assess_request_v236346',{p_request_id:id});
   await reload();closeModal();state.tab='requests';render();
   alert('Заявка сохранена. '+safe(a?.summary||'ИИ-анализ выполнен.'));
 }catch(e){alert('Не удалось сохранить заявку: '+safe(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='Сохранить и пересчитать ИИ'}}
}
async function submitRequest(id){
 try{const x=await rpc('crm_stands_submit_request_v236346',{p_request_id:id});await reload();state.tab='requests';render();alert('Заявка отправлена ДФ на согласование.')}
 catch(e){alert('Не удалось отправить: '+safe(e?.message||e))}
}
async function decideRequest(id,action){
 let comment='';if(action!=='approve'){comment=prompt(action==='return'?'Что менеджеру нужно доработать?':'Причина отклонения:')||'';if(!comment.trim())return alert('Комментарий ДФ обязателен');}
 else comment=prompt('Комментарий ДФ к согласованию (необязательно):')||'';
 try{await rpc('crm_stands_decide_request_v236346',{p_request_id:id,p_action:action,p_comment:comment});await reload();state.tab='requests';render();alert(action==='approve'?'Согласовано. Конкретный стенд зарезервирован.':'Решение сохранено.')}
 catch(e){alert('Не удалось сохранить решение: '+safe(e?.message||e))}
}
function installForm(r){
 const assigned=requestAssets(r.id);
 const html='<div class="st346-alert info">Зарезервировано: <b>'+assigned.map(esc).join(', ')+'</b></div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>Фактический адрес установки</label><input id="st346-inst-address" value="'+esc(r.target_address||'')+'"></div><div class="st346-field"><label>Дата установки</label><input id="st346-inst-date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div></div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>Номер договора</label><input id="st346-contract-no"></div><div class="st346-field"><label>Дата договора</label><input id="st346-contract-date" type="date"></div></div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>Договор действует до</label><input id="st346-valid-to" type="date"></div><div class="st346-field"><label>Стоимость имущества по договору, BYN</label><input id="st346-contract-value" type="number" min="0" step="0.01"></div></div>'+
 '<div class="st346-field"><label>Имущество по договору</label><input id="st346-asset-desc" value="'+esc(typeName(r.asset_type_id))+' · '+esc(r.requested_qty)+' шт."></div>'+
 '<div class="st346-formgrid"><div class="st346-field"><label>PDF договора</label><input id="st346-contract-file" type="file" accept="application/pdf"></div><div class="st346-field"><label>Акт приёма-передачи</label><input id="st346-act-file" type="file" accept="application/pdf,image/*"></div></div>'+
 '<div class="st346-field"><label>Фото установленного и заполненного стенда</label><input id="st346-install-photo" type="file" accept="image/*"><div class="st346-help">После сохранения серверный Vision сам проверит заполненность, бренд и сверит фото со списком SKU.</div></div>'+
 '<div class="st346-field"><label>Фактические SKU на стенде</label><textarea id="st346-install-skus" rows="4" placeholder="Один SKU с новой строки или через запятую"></textarea><div class="st346-help">По этим артикулам ИИ потом предложит, что добавить и что заменить.</div></div>';
 openModal('Подтверждение установки',r.client_name+' · '+typeName(r.asset_type_id),html,'<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary" data-st346-save-install="'+r.id+'">Установлено · сохранить</button>');
}
function splitSkus(v){return [...new Set(safe(v).split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))]}
async function runVision(id,force=true,announce=true){
 let timer=null;
 try{
   const timeout=new Promise((_,reject)=>{
     timer=setTimeout(()=>{
       const err=new Error('Vision не успел завершить анализ за 65 секунд. Фото уже сохранено — можно повторить анализ.');
       err.code='VISION_TIMEOUT';reject(err);
     },65000);
   });
   const call=dbc().functions.invoke('crm-stands-vision-v236347',{body:{placement_id:id,force:!!force}});
   const {data,error}=await Promise.race([call,timeout]);
   if(error)throw error;
   if(!data?.ok){
     const er=new Error(data?.message||data?.error||'Vision не выполнился');
     er.code=data?.error||'';throw er;
   }
   const r=data.result||{};
   if(announce){
     let msg='📷 Vision: '+safe(r.summary||'анализ выполнен');
     if(r.fill_pct!=null)msg+='\nЗаполнение: '+r.fill_pct+'%';
     if(r.own_brand_share_pct!=null)msg+=' · наш бренд: '+r.own_brand_share_pct+'%';
     if(r.match_pct!=null)msg+=' · сверка SKU: '+r.match_pct+'%';
     if(data.task?.status==='closed')msg+='\n✅ Повторный Vision закрыл задачу по стенду.';
     else if(['created','updated'].includes(data.task?.status))msg+='\n🎯 Задача менеджеру '+(data.task?.due_date?'до '+dateRu(data.task.due_date):'создана без срока — маршрут пока не назначен')+'.';
     alert(msg);
   }
   return data;
 }catch(e){
   let msg=safe(e?.message||e),code=safe(e?.code);
   try{
     const ctx=e?.context;
     if(ctx&&typeof ctx.clone==='function'){
       const j=await ctx.clone().json();
       code=safe(j?.error||j?.code||code);msg=safe(j?.message||j?.error||msg);
     }
   }catch(_){}
   if(code==='VISION_NOT_CONFIGURED'||msg.includes('ANTHROPIC_API_KEY'))msg='Vision временно не настроен на сервере: отсутствует AI-ключ. Фото и контроль сохранены, повторно загружать их не нужно.';
   else if(code==='VISION_JSON_INVALID')msg='Vision получил некорректный ответ модели. Фото уже сохранено — нажмите «Повторить Vision».';
   else if(code==='VISION_TIMEOUT')msg='Vision не успел завершить анализ за 65 секунд. Фото уже сохранено — нажмите «Повторить Vision».';
   if(announce)alert('Vision не выполнился: '+msg+'\nФото и контроль при этом сохранены.');
   return {ok:false,error:msg,code};
 }finally{
   if(timer)clearTimeout(timer);
 }
}
async function saveInstall(id){
 const f1=document.getElementById('st346-contract-file')?.files?.[0],f2=document.getElementById('st346-act-file')?.files?.[0],f3=document.getElementById('st346-install-photo')?.files?.[0];
 if(!f1||!f2||!f3)return alert('Нужны PDF договора, акт передачи и фото установленного стенда');
 const btn=document.querySelector('[data-st346-save-install]');if(btn){btn.disabled=true;btn.textContent='Загружаю документы…'}
 try{
   const [contract,act,photo]=await Promise.all([upload(f1,'contracts/'+id),upload(f2,'acts/'+id),upload(f3,'placements/'+id)]);
   const fin=await rpc('crm_stands_finalize_install_v236346',{
     p_request_id:id,p_address:safe(document.getElementById('st346-inst-address')?.value).trim(),
     p_installed_at:document.getElementById('st346-inst-date')?.value||null,
     p_contract_no:safe(document.getElementById('st346-contract-no')?.value).trim(),
     p_contract_date:document.getElementById('st346-contract-date')?.value||null,
     p_valid_to:document.getElementById('st346-valid-to')?.value||null,
     p_asset_description:safe(document.getElementById('st346-asset-desc')?.value).trim(),
     p_contract_value_byn:num(document.getElementById('st346-contract-value')?.value),
     p_contract_path:contract,p_act_transfer_path:act,p_install_photo_path:photo,
     p_skus:splitSkus(document.getElementById('st346-install-skus')?.value)
   });
   const visionNotes=[];
   for(const pid of arr(fin?.placement_ids)){
     if(btn)btn.textContent='Vision анализирует фото…';
     const vr=await runVision(pid,true,false);
     if(vr?.ok)visionNotes.push(safe(vr.result?.summary||'Vision выполнен'));
     else visionNotes.push('Vision: '+safe(vr?.error||'не выполнен'));
   }
   await reload();closeModal();state.tab='placements';render();
   alert('Установка подтверждена. Стенд привязан к ОС, договору и клиенту.'+(visionNotes.length?'\n\n📷 '+visionNotes.join('\n📷 '):''));
 }catch(e){alert('Не удалось подтвердить установку: '+safe(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='Установлено · сохранить'}}
}
function recClass(x){
 const r=safe(x).toLowerCase();
 return r==='оставить'?'keep':r==='добавить'?'add':r==='слабый'?'weak':r==='контроль'||r==='рассмотреть'?'ctrl':'';
}
function catalogGroupOptions(){
 const f=state.catalog?.filters||{},g=safe(state.catalog?.group);
 return arr(f.groups).map(x=>'<option value="'+esc(x.group_name)+'" '+(safe(x.group_name)===g?'selected':'')+'>'+esc(x.group_name)+' · '+esc(x.with_mo2)+' МО2 / '+esc(x.sku_count)+'</option>').join('');
}
function catalogSubgroupOptions(){
 const f=state.catalog?.filters||{},g=safe(state.catalog?.group),s=safe(state.catalog?.subgroup);
 const rows=arr(f.subgroups).filter(x=>safe(x.group_name)===g);
 return '<option value="">Все подгруппы</option>'+rows.map(x=>'<option value="'+esc(x.subgroup_name)+'" '+(safe(x.subgroup_name)===s?'selected':'')+'>'+esc(x.subgroup_name)+' · '+esc(x.with_mo2)+' МО2 / '+esc(x.sku_count)+'</option>').join('');
}
function renderCatalogSelected(){
 const box=document.getElementById('st350-selected');if(!box)return;
 const rows=[...state.catalogSelected.values()];
 const sum=rows.reduce((a,x)=>a+(x.price_vat==null?0:num(x.price_vat)),0);
 box.innerHTML='<div class="st346-row"><div><b>На стенде сейчас: '+rows.length+' SKU</b><div class="st346-meta">Сумма по текущим ценам МО2: '+money(sum)+'</div></div>'+(rows.length?'<button type="button" class="btn-secondary" data-st350-clear>Снять всё</button>':'')+'</div>'+
   (rows.length?'<div class="st350-selected-list">'+rows.map(x=>'<span class="st350-chip"><b>'+esc(x.sku)+'</b> '+esc(x.product_name||'')+(x.price_vat!=null?' · '+money(x.price_vat):'')+'<button type="button" data-st350-remove="'+esc(x.sku)+'" title="Убрать">×</button></span>').join('')+'</div>':'<div class="st346-meta">Пока ничего не выбрано.</div>');
 const cnt=document.getElementById('st350-count');if(cnt)cnt.textContent='Выбрано '+rows.length+' SKU';
}
function renderCatalogRows(){
 const box=document.getElementById('st350-rows');if(!box)return;
 const rows=arr(state.catalog?.rows);
 if(state.catalog?.loading){box.innerHTML='<div class="st346-alert info">Загружаю номенклатуру и продажи клиента…</div>';return}
 if(!rows.length){box.innerHTML='<div class="st346-alert warn">По этим фильтрам номенклатура не найдена. Попробуйте другую группу, поиск или отключите фильтр МО2/бренда.</div>';return}
 box.innerHTML='<div class="st346-tablewrap"><table class="st346-table st350-table"><thead><tr><th>✓</th><th>SKU</th><th>Наименование</th><th>МО2</th><th>3 мес.</th><th>6 мес.</th><th>ИИ</th></tr></thead><tbody>'+
 rows.map(x=>{
   const checked=state.catalogSelected.has(safe(x.sku));
   const price=x.price_vat==null?'<span class="st350-price-no">нет МО2</span>':money(x.price_vat);
   const rec=safe(x.recommendation);
   return '<tr><td><input class="st350-check" type="checkbox" data-st350-sku="'+esc(x.sku)+'" '+(checked?'checked':'')+'></td><td><b>'+esc(x.sku)+'</b></td><td>'+esc(x.product_name||'')+'<div class="st346-meta">'+esc(x.category||'')+' · '+esc(x.subgroup||'')+'</div></td><td>'+price+(x.price_valid_from?'<div class="st346-meta">от '+esc(x.price_valid_from)+'</div>':'')+'</td><td>'+money(x.sales_3m)+'</td><td><b>'+money(x.sales_6m)+'</b></td><td><span class="st350-rec '+recClass(rec)+'">'+esc(rec||'—')+'</span></td></tr>';
 }).join('')+'</tbody></table></div>';
}
function renderCatalogBox(){
 const host=document.getElementById('st350-catalog-host');if(!host||!state.catalog)return;
 const f=state.catalog.filters||{},brand=safe(f.brand||state.catalog.brand||'');
 const legacy=arr(state.catalogLegacy);
 host.innerHTML='<div class="st350-catalog">'+
  '<div class="st350-cat-head"><div><b>Номенклатура на стенде · наш прайс</b><div class="st346-meta">Группа → подгруппа → конкретный SKU. Продажи менеджер не вводит.</div></div><span class="st350-cat-count" id="st350-count">Выбрано '+state.catalogSelected.size+' SKU</span></div>'+
  (legacy.length?'<div class="st346-alert warn" style="margin-top:8px"><b>Старый ручной список:</b> '+legacy.length+' записей не являются SKU нашего прайса и автоматически не переносятся. Выберите реальные товары ниже.<br><span class="st346-meta">'+legacy.slice(0,8).map(x=>esc(x.sku)).join(' · ')+(legacy.length>8?' …':'')+'</span></div>':'')+
  '<div class="st350-toggles"><label><input type="checkbox" id="st350-brand-only" '+(state.catalog.brandOnly?'checked':'')+'> Только бренд стенда'+(brand?' · '+esc(brand):'')+'</label><label><input type="checkbox" id="st350-mo2-only" '+(state.catalog.mo2Only?'checked':'')+'> Только актуальный МО2</label></div>'+
  '<div class="st350-filters"><select id="st350-group">'+catalogGroupOptions()+'</select><select id="st350-subgroup">'+catalogSubgroupOptions()+'</select><input id="st350-search" value="'+esc(state.catalog.query||'')+'" placeholder="Поиск по всему прайсу: SKU или название"></div>'+
  '<div class="st350-toolbar"><button type="button" class="btn-secondary" data-st350-select-visible>Выбрать показанные</button><span class="st346-meta">Чтобы увидеть товары другого бренда или позиции без текущей цены МО2 — снимите соответствующий фильтр.</span></div>'+
  '<div id="st350-selected" class="st350-selected"></div><div id="st350-rows" style="margin-top:8px"></div>'+
 '</div>';
 renderCatalogSelected();renderCatalogRows();
}
async function loadCatalogFilters(id,preserve=true){
 const cat=state.catalog;if(!cat||safe(cat.placementId)!==safe(id))return;
 cat.loading=true;
 try{
   const f=await rpc('crm_stands_catalog_filters_v236350',{p_placement_id:id,p_brand_only:cat.brandOnly,p_mo2_only:cat.mo2Only});
   cat.filters=f;cat.brand=f?.brand||cat.brand;
   if(!preserve){
     state.catalogSelected=new Map();
     state.catalogLegacy=[];
     arr(f?.selected).forEach(x=>{
       if(x.catalog_match)state.catalogSelected.set(safe(x.sku),x);
       else state.catalogLegacy.push(x);
     });
   }
   const groups=arr(f?.groups);
   if(!groups.some(x=>safe(x.group_name)===safe(cat.group)))cat.group=safe(groups[0]?.group_name);
   const subs=arr(f?.subgroups).filter(x=>safe(x.group_name)===safe(cat.group));
   if(cat.subgroup&&!subs.some(x=>safe(x.subgroup_name)===safe(cat.subgroup)))cat.subgroup='';
   renderCatalogBox();
   await loadCatalogRows();
 }catch(e){
   const host=document.getElementById('st350-catalog-host');
   if(host)host.innerHTML='<div class="st346-alert bad">Не удалось загрузить наш прайс: '+esc(e?.message||e)+'</div>';
 }finally{if(state.catalog)state.catalog.loading=false}
}
async function loadCatalogRows(){
 const cat=state.catalog;if(!cat)return;
 cat.loading=true;renderCatalogRows();
 try{
   const q=safe(cat.query||'').trim();
   const globalSearch=q!=='';
   const d=await rpc('crm_stands_catalog_v236350',{
     p_placement_id:cat.placementId,
     p_category:globalSearch?null:(cat.group||null),
     p_subgroup:globalSearch?null:(cat.subgroup||null),
     p_search:q||null,
     p_brand_only:cat.brandOnly,p_mo2_only:cat.mo2Only,p_limit:300
   });
   cat.rows=arr(d?.rows);
   cat.rows.forEach(x=>{const k=safe(x.sku);if(state.catalogSelected.has(k))state.catalogSelected.set(k,{...state.catalogSelected.get(k),...x})});
 }catch(e){cat.rows=[];cat.error=safe(e?.message||e)}
 finally{cat.loading=false;renderCatalogSelected();renderCatalogRows()}
}
function scheduleCatalogRows(){
 if(state.catalogTimer)clearTimeout(state.catalogTimer);
 state.catalogTimer=setTimeout(()=>{state.catalogTimer=null;loadCatalogRows()},350);
}
function controlForm(p,repeat=false){
 state.catalog={placementId:p.id,brandOnly:true,mo2Only:true,brand:'',filters:null,group:'',subgroup:'',query:'',rows:[],loading:true};
 state.catalogSelected=new Map();state.catalogLegacy=[];
 const html='<div class="st346-field"><label>Новое контрольное фото</label><input id="st346-control-photo" type="file" accept="image/*"><div class="st346-help">После сохранения фото автоматически анализируется защищённым серверным Vision. AI-ключ в браузер не передаётся.</div></div>'+
 '<div id="st350-catalog-host"><div class="st346-alert info">Загружаю наш прайс…</div></div>'+
 '<div class="st346-field"><label>Комментарий</label><textarea id="st346-control-comment" rows="3" placeholder="Что изменено / что требует внимания"></textarea></div>';
 openModal(repeat?'Повторный контроль стенда':'Контроль стенда',p.client_name+' · '+typeName(p.asset_type_id),html,'<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary" data-st346-save-control="'+p.id+'">'+(repeat?'Сохранить и сравнить Vision':'Сохранить и проверить ИИ')+'</button>');
 loadCatalogFilters(p.id,false);
}
async function saveControl(id){
 const file=document.getElementById('st346-control-photo')?.files?.[0];if(!file)return alert('Добавьте контрольное фото');
 const items=[...state.catalogSelected.values()].map(x=>({sku:safe(x.sku)}));
 const btn=document.querySelector('[data-st346-save-control]');if(btn){btn.disabled=true;btn.textContent='Сохраняю фото и '+items.length+' SKU…'}
 try{
   const photo=await upload(file,'control/'+id);
   const a=await rpc('crm_stands_control_placement_v236350',{
     p_placement_id:id,p_photo_path:photo,p_items:items,p_comment:safe(document.getElementById('st346-control-comment')?.value).trim()
   });
   if(btn)btn.textContent='Vision анализирует фото…';
   const vr=await runVision(id,true,false);
   await reload();closeModal();state.tab='placements';render();
   let msg='Сохранено '+num(a?.saved_items)+' SKU из нашего прайса. '+safe(a?.summary||'ИИ-анализ продаж выполнен');
   if(arr(a?.add_skus).length)msg+='\n\nДобавить: '+arr(a.add_skus).map(x=>x.sku).join(', ');
   if(arr(a?.remove_skus).length)msg+='\nСлабые SKU: '+arr(a.remove_skus).map(x=>x.sku).join(', ');
   if(vr?.ok){
     msg+='\n\n📷 Vision: '+safe(vr.result?.summary||'анализ фото выполнен');
     if(vr.task?.status==='closed')msg+='\n\n✅ Задача по стенду закрыта повторным Vision.';
     else if(['created','updated'].includes(vr.task?.status))msg+='\n\n🎯 Задача менеджеру '+(vr.task?.due_date?'до '+dateRu(vr.task.due_date):'без срока — маршрут пока не назначен')+'.';
   }else msg+='\n\n⚠️ Vision: '+safe(vr?.error||'не выполнен')+'. Фото и номенклатура сохранены.';
   alert(msg);
 }catch(e){alert('Не удалось выполнить контроль: '+safe(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='Сохранить и проверить ИИ'}}
}
async function requestReturnDecision(id){
 const comment=prompt('Почему стенд нужно забрать? Комментарий ДФ обязателен:')||'';
 if(!comment.trim())return alert('Комментарий ДФ обязателен');
 try{await rpc('crm_stands_request_return_v236346',{p_placement_id:id,p_comment:comment});await reload();state.tab='placements';render();alert('Решение ДФ сохранено. Менеджеру доступно оформление фактического возврата.')}
 catch(e){alert('Не удалось запустить возврат: '+safe(e?.message||e))}
}
function returnForm(p){
 const html='<div class="st346-field"><label>Фото при возврате</label><input id="st346-return-photo" type="file" accept="image/*"></div><div class="st346-formgrid"><div class="st346-field"><label>Состояние</label><select id="st346-return-condition"><option value="ok">Исправен</option><option value="repair">Требует ремонта</option><option value="damaged">Повреждён</option></select></div><div class="st346-field"><label>Акт возврата (если есть)</label><input id="st346-return-act" type="file" accept="application/pdf,image/*"></div></div><div class="st346-field"><label>Комментарий</label><textarea id="st346-return-comment" rows="3"></textarea></div>';
 openModal('Возврат стенда',p.client_name+' · '+assetCode(p.asset_id),html,'<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary" data-st346-save-return="'+p.id+'">Подтвердить возврат</button>');
}
async function saveReturn(id){
 const photoFile=document.getElementById('st346-return-photo')?.files?.[0];if(!photoFile)return alert('Добавьте фото возвращаемого стенда');
 const btn=document.querySelector('[data-st346-save-return]');if(btn){btn.disabled=true;btn.textContent='Сохраняю…'}
 try{
   const actFile=document.getElementById('st346-return-act')?.files?.[0];
   const [photo,act]=await Promise.all([upload(photoFile,'returns/'+id),actFile?upload(actFile,'return-acts/'+id):Promise.resolve(null)]);
   await rpc('crm_stands_return_placement_v236346',{p_placement_id:id,p_return_photo_path:photo,p_return_condition:document.getElementById('st346-return-condition')?.value,p_comment:safe(document.getElementById('st346-return-comment')?.value).trim(),p_act_return_path:act});
   await reload();closeModal();state.tab='placements';render();alert('Возврат зафиксирован. ОС освобождён или переведён в ремонт по состоянию.');
 }catch(e){alert('Не удалось вернуть стенд: '+safe(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='Подтвердить возврат'}}
}
async function showSales(clientId){
 openModal('Продажи клиента','Группы → подгруппы → SKU','<div id="st346-sales-box"><div class="st346-alert info">Загружаю продажи…</div></div>','<button class="btn-secondary" data-st346-close>Закрыть</button>');
 await loadSales(clientId);
}
async function assessPlacement(id){
 try{
  const a=await rpc('crm_stands_assess_placement_v236346',{p_placement_id:id});await reload();state.tab='placements';render();
  let msg=safe(a?.summary||'ИИ-анализ выполнен');
  if(arr(a?.add_skus).length)msg+='\n\nРекомендуется добавить: '+arr(a.add_skus).map(x=>x.sku+' ('+money(x.sales_3m)+')').join(', ');
  if(arr(a?.remove_skus).length)msg+='\nСлабые на стенде: '+arr(a.remove_skus).map(x=>x.sku+' ('+money(x.sales_3m)+')').join(', ');
  if(a?.grace_period)msg+='\n\nДействует 60-дневный адаптационный период: ИИ не рекомендует забирать новый стенд только из-за малого факта.';
  alert(msg);
 }catch(e){alert('ИИ-анализ не выполнен: '+safe(e?.message||e))}
}
async function generateCandidates(){
 const id=document.getElementById('st346-candidate-type')?.value;if(!id)return;
 const b=document.querySelector('[data-st346-generate]');if(b){b.disabled=true;b.textContent='Анализирую клиентов…'}
 try{const rows=await rpc('crm_stands_generate_candidates_v236346',{p_asset_type_id:id,p_limit:20});await reload();state.tab='recommendations';render();alert('ИИ сформировал '+arr(rows).length+' кандидатов. Это рекомендации — решение принимает ДФ после обсуждения полочного пространства.')}
 catch(e){alert('Не удалось сформировать кандидатов: '+safe(e?.message||e))}
 finally{if(b){b.disabled=false;b.textContent='Найти кандидатов'}}
}
async function decideRecommendation(id,action){
 let comment='';
 if(action==='initiative')comment=prompt('Комментарий менеджеру / что обсудить по полочному пространству:')||'';
 else{comment=prompt(action==='reject'?'Почему рекомендация не подходит?':'Почему откладываем?')||'';if(!comment.trim())return alert('Комментарий ДФ обязателен');}
 try{await rpc('crm_stands_decide_recommendation_v236346',{p_recommendation_id:id,p_action:action,p_comment:comment});await reload();state.tab='recommendations';render();alert(action==='initiative'?'Создана инициатива менеджеру.':'Решение ДФ сохранено и ИИ учтёт его при следующих предложениях.')}
 catch(e){alert('Не удалось сохранить решение: '+safe(e?.message||e))}
}
async function editTypeCategories(id){
 const t=byId(state.boot?.asset_types,id);if(!t)return;
 const v=prompt('Группы продаж для оценки этого типа стенда. Через запятую. Пусто = анализировать все группы клиента.',arr(t.target_categories).join(', '));if(v===null)return;
 const cats=[...new Set(v.split(',').map(x=>x.trim()).filter(Boolean))];
 try{const {error}=await dbc().from('stand_asset_types_v236346').update({target_categories:cats}).eq('id',id);if(error)throw error;await reload();state.tab='os';render();}
 catch(e){alert('Не удалось сохранить группы: '+safe(e?.message||e))}
}
async function loadInternal(){
 try{state.dfs=await rpc('crm_stands_dfs_ai_v236346',{p_limit:150});render();}
 catch(e){alert('Не удалось загрузить внутреннюю логику: '+safe(e?.message||e))}
}
function bind(){
 document.addEventListener('click',async e=>{
   if(e.target.closest?.('[data-st346-close]'))return closeModal();
   const tab=e.target.closest?.('[data-st346-tab]');if(tab){state.tab=tab.dataset.st346Tab;if(state.tab!=='internal')state.dfs=null;render();return}
   if(e.target.closest?.('[data-st346-refresh]'))return reload();
   if(e.target.closest?.('[data-st365-manual-add]'))return manualAddForm();
   if(e.target.closest?.('[data-st365-save-manual]'))return saveManualAdd(false);
   if(e.target.closest?.('[data-st346-new-request]'))return requestForm();
   const er=e.target.closest?.('[data-st346-edit-request]');if(er)return requestForm(byId(state.boot?.requests,er.dataset.st346EditRequest));
   if(e.target.closest?.('[data-st346-save-request]'))return saveRequest();
   const sr=e.target.closest?.('[data-st346-submit-request]');if(sr)return submitRequest(sr.dataset.st346SubmitRequest);
   const ra=e.target.closest?.('[data-st346-request-action]');if(ra)return decideRequest(ra.dataset.id,ra.dataset.st346RequestAction);
   const ins=e.target.closest?.('[data-st346-install]');if(ins)return installForm(byId(state.boot?.requests,ins.dataset.st346Install));
   const si=e.target.closest?.('[data-st346-save-install]');if(si)return saveInstall(si.dataset.st346SaveInstall);
   const ctl=e.target.closest?.('[data-st346-control]');if(ctl)return controlForm(byId(state.boot?.placements,ctl.dataset.st346Control),false);
   const rctl=e.target.closest?.('[data-st367-recontrol]');if(rctl)return controlForm(byId(state.boot?.placements,rctl.dataset.st367Recontrol),true);
   const all=e.target.closest?.('[data-st350-select-visible]');if(all&&state.catalog){arr(state.catalog.rows).forEach(x=>state.catalogSelected.set(safe(x.sku),x));renderCatalogSelected();renderCatalogRows();return}
   const rem=e.target.closest?.('[data-st350-remove]');if(rem){state.catalogSelected.delete(safe(rem.dataset.st350Remove));renderCatalogSelected();renderCatalogRows();return}
   if(e.target.closest?.('[data-st350-clear]')){if(confirm('Снять все выбранные SKU со стенда?')){state.catalogSelected.clear();renderCatalogSelected();renderCatalogRows()}return}
   const sctl=e.target.closest?.('[data-st346-save-control]');if(sctl)return saveControl(sctl.dataset.st346SaveControl);
   const ap=e.target.closest?.('[data-st346-assess-placement]');if(ap)return assessPlacement(ap.dataset.st346AssessPlacement);
   const ar=e.target.closest?.('[data-st365-archive]');if(ar)return archiveForm(placementById(ar.dataset.st365Archive));
   const sa=e.target.closest?.('[data-st365-save-archive]');if(sa)return saveArchive(sa.dataset.st365SaveArchive);
   const hp=e.target.closest?.('[data-st365-history-photo]');if(hp)return viewStandPhoto(placementById(hp.dataset.st365HistoryPhoto));
   const cp=e.target.closest?.('[data-st348-client]');if(cp)return openCrmClient(cp.dataset.st348Client);
   const ph=e.target.closest?.('[data-st348-photo]');if(ph)return viewStandPhoto(placementById(ph.dataset.st348Photo));
   const oo=e.target.closest?.('[data-st348-open-original]');if(oo)return openFile(oo.dataset.st348OpenOriginal);
   const vv=e.target.closest?.('[data-st347-vision]');if(vv){const id=vv.dataset.st347Vision;vv.disabled=true;const old=vv.textContent;vv.textContent='Vision анализирует…';try{const vr=await runVision(id,true,true);if(vr?.ok){await reload();state.tab='placements';render()}else{vv.textContent='↻ Повторить Vision'}}finally{vv.disabled=false;if(vv.textContent==='Vision анализирует…')vv.textContent=old}return}
   const rd=e.target.closest?.('[data-st346-return-decision]');if(rd)return requestReturnDecision(rd.dataset.st346ReturnDecision);
   const ret=e.target.closest?.('[data-st346-return]');if(ret)return returnForm(byId(state.boot?.placements,ret.dataset.st346Return));
   const sret=e.target.closest?.('[data-st346-save-return]');if(sret)return saveReturn(sret.dataset.st346SaveReturn);
   const sc=e.target.closest?.('[data-st346-sales-client]');if(sc)return showSales(sc.dataset.st346SalesClient);
   const f=e.target.closest?.('[data-st346-file]');if(f)return openFile(f.dataset.st346File);
   if(e.target.closest?.('[data-st346-generate]'))return generateCandidates();
   const rec=e.target.closest?.('[data-st346-rec]');if(rec)return decideRecommendation(rec.dataset.id,rec.dataset.st346Rec);
   const tc=e.target.closest?.('[data-st346-type-cats]');if(tc)return editTypeCategories(tc.dataset.st346TypeCats);
   if(e.target.closest?.('[data-st346-load-internal]'))return loadInternal();
   const cat=e.target.closest?.('[data-st346-sales-cat]');if(cat)return loadSales(document.getElementById('st346-client')?.value||state.sales?.client?.id,cat.dataset.st346SalesCat,null);
   const sub=e.target.closest?.('[data-st346-sales-sub]');if(sub)return loadSales(document.getElementById('st346-client')?.value||state.sales?.client?.id,state.salesCategory,sub.dataset.st346SalesSub);
   if(e.target.closest?.('[data-st346-sales-back]')){
     const cid=document.getElementById('st346-client')?.value||state.sales?.client?.id;
     return state.salesLevel==='sku'?loadSales(cid,state.salesCategory,null):loadSales(cid,null,null);
   }
 },true);
 document.addEventListener('change',e=>{
   if(e.target?.id==='st365-client'){
     const x=byId(clients(),e.target.value),addr=document.getElementById('st365-address');
     if(addr&&!addr.value&&x?.address)addr.value=x.address;
   }
   if(e.target?.id==='st365-type'){
     const sel=document.getElementById('st365-asset');if(sel)sel.innerHTML=manualAssetOptions(e.target.value);
   }
   if(e.target?.id==='st346-client')loadSales(e.target.value);
   if(e.target?.matches?.('[data-st346-cat-check]')){const n=e.target.dataset.st346CatCheck;e.target.checked?state.reqCats.add(n):state.reqCats.delete(n);renderSalesBox()}
   if(e.target?.id==='st350-brand-only'&&state.catalog){state.catalog.brandOnly=!!e.target.checked;state.catalog.group='';state.catalog.subgroup='';loadCatalogFilters(state.catalog.placementId,true);return}
   if(e.target?.id==='st350-mo2-only'&&state.catalog){state.catalog.mo2Only=!!e.target.checked;state.catalog.group='';state.catalog.subgroup='';loadCatalogFilters(state.catalog.placementId,true);return}
   if(e.target?.id==='st350-group'&&state.catalog){state.catalog.group=e.target.value;state.catalog.subgroup='';renderCatalogBox();loadCatalogRows();return}
   if(e.target?.id==='st350-subgroup'&&state.catalog){state.catalog.subgroup=e.target.value;loadCatalogRows();return}
   if(e.target?.matches?.('[data-st350-sku]')&&state.catalog){
     const k=safe(e.target.dataset.st350Sku),row=arr(state.catalog.rows).find(x=>safe(x.sku)===k);
     if(e.target.checked&&row)state.catalogSelected.set(k,row);else state.catalogSelected.delete(k);
     renderCatalogSelected();return
   }
 },true);
 document.addEventListener('input',e=>{
   if(e.target?.id==='st365-client-search'){
     const sel=document.getElementById('st365-client'),old=sel?.value||'';if(sel)sel.innerHTML='<option value="">Выберите клиента</option>'+manualClientOptions(old);
   }
   if(e.target?.id==='st346-client-search'){
     const sel=document.getElementById('st346-client'),old=sel?.value||'';if(sel)sel.innerHTML='<option value="">Выберите клиента</option>'+clientOptions(old);
   }
   if(e.target?.id==='st350-search'&&state.catalog){state.catalog.query=e.target.value||'';scheduleCatalogRows()}
 },true);
}
function install(){
 css();bind();
 if(active())reload();
}
install();
const STANDS_API=Object.freeze({version:V,reload,render,noPolling:true,lazy:true,fastBootstrap:true,timeoutRetryOnce:true,serverSalesOnly:true,tabletReady:true,manualAdmin:true,history:true,primaryControlGuard:true,serverVision:true,visionFunction:'crm-stands-vision-v236347'});
window.RESANTA_STANDS_V236367=STANDS_API;
window.RESANTA_STANDS_V236366=STANDS_API;
window.RESANTA_STANDS_V236365=STANDS_API;
window.RESANTA_STANDS_V236350=STANDS_API;
window.RESANTA_STANDS_V236348=STANDS_API;
window.RESANTA_STANDS_V236347=STANDS_API;
window.RESANTA_STANDS_V236346=STANDS_API;
})();