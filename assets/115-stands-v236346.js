/* RESANTA CRM v23.6.346 · STANDS / OS / TRADE EQUIPMENT
 * Isolated lazy module. No polling. No client-side purchase_history scans.
 */
(function(){
'use strict';
if(window.RESANTA_STANDS_V236346)return;
const V='v23.6.346';
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
const state={boot:null,loading:false,tab:'placements',sales:null,salesLevel:'category',salesCategory:null,salesSubgroup:null,requestId:null,reqCats:new Set(),dfs:null};
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
const statusMap={
 draft_manager:['Черновик','gray'],pending_df:['На согласовании ДФ','warn'],returned:['Вернули на доработку','warn'],
 approved:['Согласована · ждёт установки','good'],rejected:['Отклонена','bad'],installed:['Установлена','good'],cancelled:['Отменена','gray'],
 active:['У клиента','good'],legacy_unreconciled:['Не сверено с ОС','bad'],return_requested:['На возврат','warn'],returned_p:['Возвращена','gray']
};
function badge(label,tone='gray'){return '<span class="st346-badge '+tone+'">'+esc(label)+'</span>'}
function requestStatus(s){const m=statusMap[s]||[s,'gray'];return badge(m[0],m[1])}
function placementStatus(p){if(p.status==='returned')return badge('Возвращён','gray');const m=statusMap[p.status]||[p.status,'gray'];return badge(m[0],m[1])}
function aiTone(s){return s==='keep'||s==='green'?'good':s==='optimize'||s==='yellow'?'warn':s==='control'?'info':s==='return'||s==='red'?'bad':'gray'}
function aiLabel(s){return({keep:'Оставить',optimize:'Оптимизировать',control:'Под контроль',return:'Рассмотреть возврат',move:'Переместить'}[s]||s||'Нет оценки')}
function css(){
 if(document.getElementById('st346-css'))return;
 const s=document.createElement('style');s.id='st346-css';s.textContent=
 '.st346-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}'+
 '.st346-head h2{margin:0;font-size:20px}.st346-head p{margin:4px 0 0;color:var(--sub);font-size:11px;line-height:1.45}'+
 '.st346-actions{display:flex;gap:7px;flex-wrap:wrap}.st346-actions button{min-height:38px}'+
 '.st346-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin-bottom:12px}.st346-kpi{background:#fff;border:1px solid var(--border);border-radius:11px;padding:11px}.st346-kpi small{display:block;color:var(--sub);font-size:9px}.st346-kpi b{display:block;font-size:21px;margin-top:3px}.st346-kpi em{font-size:9px;color:var(--sub);font-style:normal}'+
 '.st346-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;margin-bottom:12px;padding-bottom:2px}.st346-tab{border:1px solid var(--border);background:#fff;border-radius:9px;padding:8px 10px;white-space:nowrap;font-size:11px;cursor:pointer}.st346-tab.active{background:var(--ab);border-color:#bfdbfe;color:var(--at);font-weight:800}'+
 '.st346-list{display:flex;flex-direction:column;gap:8px}.st346-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px}.st346-card.badline{border-left:4px solid var(--r)}.st346-card.warnline{border-left:4px solid var(--am)}'+
 '.st346-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.st346-title{font-size:13px;font-weight:800;line-height:1.35}.st346-meta{font-size:10px;color:var(--sub);line-height:1.55;margin-top:4px}.st346-note{font-size:10px;line-height:1.5;margin-top:7px}.st346-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.st346-buttons button{min-height:38px;padding:7px 10px;font-size:10px}'+
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
 '@media(max-width:900px){.st346-formgrid{grid-template-columns:1fr}.st346-modal-card{width:96vw}.st346-field input,.st346-field select,.st346-field textarea{font-size:16px;min-height:44px}.st346-buttons button,.st346-actions button{min-height:44px}}'+
 '@media(max-width:640px){.st346-modal{padding:0}.st346-modal-card{width:100vw;height:100dvh;max-height:100dvh;border-radius:0;padding:12px}.st346-foot{bottom:-12px;margin:12px -12px -12px;padding:10px 12px}.st346-foot button{flex:1 1 100%}.st346-kpis{grid-template-columns:1fr 1fr}.st346-row{flex-direction:column}.st346-buttons button{flex:1 1 calc(50% - 4px)}}';
 document.head.appendChild(s);
}
async function rpc(name,args={}){
 const {data,error}=await dbc().rpc(name,args);if(error)throw error;return data;
}
async function reload(){
 if(state.loading)return;
 state.loading=true;
 try{state.boot=await rpc('crm_stands_bootstrap_v236346',{p_limit:150});render();}
 catch(e){console.error(V,e);if(root())root().innerHTML='<div class="st346-alert bad">Не удалось открыть раздел «Стенды»: '+esc(e?.message||e)+'</div>'}
 finally{state.loading=false}
}
function kpi(label,value,sub=''){return '<div class="st346-kpi"><small>'+esc(label)+'</small><b>'+esc(value)+'</b>'+(sub?'<em>'+esc(sub)+'</em>':'')+'</div>'}
function header(){
 const s=state.boot?.summary||{};
 return '<div class="st346-head"><div><h2>🧱 Стенды / ОС</h2><p>Имущество → заявка → ДФ → договор и установка → продажи → рекомендации ИИ. Данные загружаются только внутри этого раздела.</p></div><div class="st346-actions">'+
 (isManager()?'<button class="btn-primary" data-st346-new-request>+ Заявка на стенд</button>':'')+
 '<button class="btn-secondary" data-st346-refresh>↻ Обновить</button></div></div>'+
 '<div class="st346-kpis">'+
 kpi('ОС по реестру',s.os_units||0,'единиц')+
 kpi('Физически заведено',s.physical_assets||0,'единиц')+
 kpi('У клиентов',s.installed||0,'сверено с ОС')+
 kpi('Свободно',s.free||0,'можно резервировать')+
 kpi('Не сверено',s.legacy_unreconciled||0,'факт из Excel')+
 kpi('На согласовании',s.pending_df||0,'заявок')+
 kpi('Без акта передачи',s.no_transfer_act||0,'требует контроля')+
 kpi('Фото старше 31 дня',s.stale_photo||0,'требует обновления')+
 '</div>';
}
function tabs(){
 const a=[['placements','У клиентов'],['requests','Заявки'],['os','ОС / реестр']];
 if(isDF()||isDFS())a.push(['recommendations','ИИ · кандидаты']);
 if(isDFS())a.push(['internal','Логика ИИ · ДФС']);
 return '<div class="st346-tabs">'+a.map(x=>'<button class="st346-tab '+(state.tab===x[0]?'active':'')+'" data-st346-tab="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
}
function render(){
 if(!active()||!root()||!state.boot)return;
 root().innerHTML=header()+tabs()+'<div id="st346-body">'+body()+'</div>';
}
function body(){
 if(state.tab==='requests')return requestsHtml();
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
   const c=contractFor(p.contract_id),its=itemsForPlacement(p.id),legacy=p.status==='legacy_unreconciled';
   let actions='';
   if((isManager()||isDF())&&p.status==='active'){
     actions+='<button class="btn-secondary" data-st346-control="'+p.id+'">Контроль / фото / SKU</button><button class="btn-secondary" data-st346-assess-placement="'+p.id+'">ИИ-анализ</button><button class="btn-secondary" data-st346-return="'+p.id+'">Возврат</button>';
   }
   if(c?.contract_path)actions+='<button class="btn-secondary" data-st346-file="'+esc(c.contract_path)+'">Договор</button>';
   if(c?.act_transfer_path)actions+='<button class="btn-secondary" data-st346-file="'+esc(c.act_transfer_path)+'">Акт передачи</button>';
   return '<div class="st346-card '+(legacy?'badline':p.ai_status==='return'?'badline':'')+'"><div class="st346-row"><div><div class="st346-title">'+esc(p.client_name)+' · '+esc(typeName(p.asset_type_id))+'</div><div class="st346-meta">'+placementStatus(p)+' '+(p.asset_id?'ОС: '+esc(assetCode(p.asset_id)):'ОС: не сопоставлено')+' · '+esc(p.manager_name)+' · с '+esc(p.installed_at)+'<br>'+esc(p.address)+'</div></div><div>'+(p.ai_score!=null?badge('ИИ '+p.ai_score+'/100',aiTone(p.ai_status)):'')+(p.ai_status?badge(aiLabel(p.ai_status),aiTone(p.ai_status)):'')+'</div></div>'+
   (legacy?'<div class="st346-alert bad"><b>Расхождение ОС:</b> размещение есть в Excel ДФ, но соответствующая физическая единица Resanta отсутствует в предоставленном реестре ОС. Автоматически к стенду Вихрь не привязываю.</div>':'')+
   (p.ai_public_summary?'<div class="st346-ai"><strong>'+esc(aiLabel(p.ai_status))+'</strong><p>'+esc(p.ai_public_summary)+'</p></div>':'')+
   '<div class="st346-note"><b>Договор:</b> '+(c?esc(c.contract_no||'без номера')+' · '+esc(c.status):'не привязан')+(its.length?' · <b>SKU:</b> '+its.map(x=>esc(x.sku)).join(', '):' · SKU пока не зафиксированы')+'</div>'+
   '<div class="st346-buttons"><button class="btn-secondary" data-st346-sales-client="'+p.client_id+'">Продажи клиента</button>'+actions+'</div></div>';
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
function closeModal(){document.getElementById('st346-modal')?.classList.remove('open');state.sales=null;state.salesLevel='category';state.salesCategory=null;state.salesSubgroup=null;state.reqCats=new Set()}
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
   if(!document.getElementById('st346-address')?.value&&data?.client?.address)document.getElementById('st346-address').value=data.client.address;
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
 '<div class="st346-field"><label>Фото установленного и заполненного стенда</label><input id="st346-install-photo" type="file" accept="image/*"></div>'+
 '<div class="st346-field"><label>Фактические SKU на стенде</label><textarea id="st346-install-skus" rows="4" placeholder="Один SKU с новой строки или через запятую"></textarea><div class="st346-help">По этим артикулам ИИ потом предложит, что добавить и что заменить.</div></div>';
 openModal('Подтверждение установки',r.client_name+' · '+typeName(r.asset_type_id),html,'<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary" data-st346-save-install="'+r.id+'">Установлено · сохранить</button>');
}
function splitSkus(v){return [...new Set(safe(v).split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))]}
async function saveInstall(id){
 const f1=document.getElementById('st346-contract-file')?.files?.[0],f2=document.getElementById('st346-act-file')?.files?.[0],f3=document.getElementById('st346-install-photo')?.files?.[0];
 if(!f1||!f2||!f3)return alert('Нужны PDF договора, акт передачи и фото установленного стенда');
 const btn=document.querySelector('[data-st346-save-install]');if(btn){btn.disabled=true;btn.textContent='Загружаю документы…'}
 try{
   const [contract,act,photo]=await Promise.all([upload(f1,'contracts/'+id),upload(f2,'acts/'+id),upload(f3,'placements/'+id)]);
   await rpc('crm_stands_finalize_install_v236346',{
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
   await reload();closeModal();state.tab='placements';render();alert('Установка подтверждена. Стенд привязан к ОС, договору и клиенту.');
 }catch(e){alert('Не удалось подтвердить установку: '+safe(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='Установлено · сохранить'}}
}
function controlForm(p){
 const skus=itemsForPlacement(p.id).map(x=>x.sku).join('\n');
 const html='<div class="st346-field"><label>Новое контрольное фото</label><input id="st346-control-photo" type="file" accept="image/*"></div><div class="st346-field"><label>SKU, которые сейчас стоят на стенде</label><textarea id="st346-control-skus" rows="7">'+esc(skus)+'</textarea></div><div class="st346-field"><label>Комментарий</label><textarea id="st346-control-comment" rows="3" placeholder="Что изменено / что требует внимания"></textarea></div>';
 openModal('Контроль стенда',p.client_name+' · '+typeName(p.asset_type_id),html,'<button class="btn-secondary" data-st346-close>Отмена</button><button class="btn-primary" data-st346-save-control="'+p.id+'">Сохранить и проверить ИИ</button>');
}
async function saveControl(id){
 const file=document.getElementById('st346-control-photo')?.files?.[0];if(!file)return alert('Добавьте контрольное фото');
 const btn=document.querySelector('[data-st346-save-control]');if(btn){btn.disabled=true;btn.textContent='Анализирую…'}
 try{
   const photo=await upload(file,'control/'+id);
   const a=await rpc('crm_stands_control_placement_v236346',{p_placement_id:id,p_photo_path:photo,p_skus:splitSkus(document.getElementById('st346-control-skus')?.value),p_comment:safe(document.getElementById('st346-control-comment')?.value).trim()});
   await reload();closeModal();state.tab='placements';render();
   let msg=safe(a?.summary||'ИИ-анализ выполнен');
   if(arr(a?.add_skus).length)msg+='\n\nДобавить: '+arr(a.add_skus).map(x=>x.sku).join(', ');
   if(arr(a?.remove_skus).length)msg+='\nСлабые SKU: '+arr(a.remove_skus).map(x=>x.sku).join(', ');
   alert(msg);
 }catch(e){alert('Не удалось выполнить контроль: '+safe(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='Сохранить и проверить ИИ'}}
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
   if(e.target.closest?.('[data-st346-new-request]'))return requestForm();
   const er=e.target.closest?.('[data-st346-edit-request]');if(er)return requestForm(byId(state.boot?.requests,er.dataset.st346EditRequest));
   if(e.target.closest?.('[data-st346-save-request]'))return saveRequest();
   const sr=e.target.closest?.('[data-st346-submit-request]');if(sr)return submitRequest(sr.dataset.st346SubmitRequest);
   const ra=e.target.closest?.('[data-st346-request-action]');if(ra)return decideRequest(ra.dataset.id,ra.dataset.st346RequestAction);
   const ins=e.target.closest?.('[data-st346-install]');if(ins)return installForm(byId(state.boot?.requests,ins.dataset.st346Install));
   const si=e.target.closest?.('[data-st346-save-install]');if(si)return saveInstall(si.dataset.st346SaveInstall);
   const ctl=e.target.closest?.('[data-st346-control]');if(ctl)return controlForm(byId(state.boot?.placements,ctl.dataset.st346Control));
   const sctl=e.target.closest?.('[data-st346-save-control]');if(sctl)return saveControl(sctl.dataset.st346SaveControl);
   const ap=e.target.closest?.('[data-st346-assess-placement]');if(ap)return assessPlacement(ap.dataset.st346AssessPlacement);
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
   if(e.target?.id==='st346-client')loadSales(e.target.value);
   if(e.target?.matches?.('[data-st346-cat-check]')){const n=e.target.dataset.st346CatCheck;e.target.checked?state.reqCats.add(n):state.reqCats.delete(n);renderSalesBox()}
 },true);
 document.addEventListener('input',e=>{
   if(e.target?.id==='st346-client-search'){
     const sel=document.getElementById('st346-client'),old=sel?.value||'';if(sel)sel.innerHTML='<option value="">Выберите клиента</option>'+clientOptions(old);
   }
 },true);
}
function install(){
 css();bind();
 if(active())reload();
}
install();
window.RESANTA_STANDS_V236346=Object.freeze({version:V,reload,render,noPolling:true,lazy:true,serverSalesOnly:true,tabletReady:true});
})();