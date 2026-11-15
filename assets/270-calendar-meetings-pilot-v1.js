/* Calendar and meetings v2. Personal owner-RLS records, scoped read-only preparation.
 * Only explicit save/confirm gestures write meeting records. No background invitations. */
(function(window,document){
'use strict';
if(window.crmMeetingPlannerPilotV1)return;
const EXCLUDED='bcc330b8-9100-4c60-b87f-22a36988fc97',ENDPOINT='crm-meeting-prepare-v2';
const state={actor:'',focus:'',mode:'week',meetings:[],loaded:false,loading:false,loadError:'',meetingSeq:0,
 briefing:null,coverage:null,briefLoading:false,briefError:'',briefSeq:0,selected:new Set(),meetingId:'',editor:null,notice:'',saving:false,preparationId:''};
const $=id=>document.getElementById(id),safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const one=()=>typeof db!=='undefined'?db:window.db;
const userId=()=>{try{return String(currentUser?.id||'');}catch{return '';}};
const authorized=()=>{try{return !!userId()&&userId()!==EXCLUDED&&currentProfile?.id===userId()&&currentProfile?.role!=='auditor_pending'&&$('app')?.style.display!=='none';}catch{return false;}};
const dateMinsk=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const utc=d=>new Date(d+'T12:00:00Z'),iso=d=>d.toISOString().slice(0,10),move=(d,n)=>iso(new Date(utc(d).getTime()+n*86400000));
const monthMove=(d,n)=>{const x=utc(d),last=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+n+1,0)).getUTCDate();return iso(new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+n,Math.min(x.getUTCDate(),last),12)));};
const monthTitle=d=>utc(d).toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
const shortDate=d=>utc(d).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
const dayOf=x=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
const time=x=>new Date(x).toLocaleTimeString('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'});
const button=(attrs,text,strong=false)=>'<button type="button" class="cmp-btn'+(strong?' strong':'')+'" '+attrs+'>'+text+'</button>';
const selectedMeeting=()=>state.meetings.find(x=>x.id===state.meetingId)||null;
const context=()=>({focus:state.focus,month:state.focus.slice(0,7),meeting_id:state.meetingId||null,preparation_id:state.preparationId||null,topic_ids:[...state.selected]});
function clear(){state.meetingSeq++;state.briefSeq++;Object.assign(state,{meetings:[],loaded:false,loading:false,loadError:'',briefing:null,coverage:null,briefLoading:false,briefError:'',selected:new Set(),meetingId:'',editor:null,notice:'',saving:false,preparationId:''});}
function invalidate(){state.preparationId='';state.briefSeq++;state.briefing=null;state.coverage=null;state.briefLoading=false;state.briefError='';state.selected.clear();}
function days(){const dow=(utc(state.focus).getUTCDay()+6)%7;if(state.mode==='day')return [state.focus];if(state.mode==='week')return Array.from({length:7},(_,i)=>move(state.focus,i-dow));const first=state.focus.slice(0,7)+'-01',start=move(first,-((utc(first).getUTCDay()+6)%7));return Array.from({length:42},(_,i)=>move(start,i));}
function meetingList(day){const from=Date.parse(day+'T00:00:00+03:00'),to=from+86400000;return state.meetings.filter(x=>x.status!=='cancelled'&&Date.parse(x.starts_at)<to&&Date.parse(x.starts_at)+x.duration_minutes*60000>from);}
function calendar(){return '<div class="cmp-calendar"><div class="cmp-weekdays">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="cmp-daygrid '+(state.mode==='month'?'is-month':state.mode==='day'?'is-day':'')+'">'+days().map(d=>'<button type="button" aria-label="'+d+', встреч: '+meetingList(d).length+'" data-cmp-date="'+d+'" class="cmp-day'+(d===state.focus?' selected':'')+(d===dateMinsk()?' today':'')+'" aria-pressed="'+(d===state.focus)+'"><strong>'+Number(d.slice(8))+'</strong><small>'+safe(shortDate(d))+'</small><b>'+(meetingList(d).length||'')+'</b></button>').join('')+'</div></div>';}
function meetingCards(){
 if(state.loadError)return '<p class="cmp-error">Не удалось прочитать календарь: '+safe(state.loadError)+'. Это не означает, что встреч нет.</p>';
 if(!state.loaded)return '<p class="cmp-muted">'+(state.loading?'Загружаю встречи…':'Обновите календарь.')+'</p>';
 const rows=meetingList(state.focus);if(!rows.length)return '<p class="cmp-muted">Встреч на выбранный день нет.</p>';
 return rows.map(x=>'<article class="cmp-meeting'+(x.id===state.meetingId?' selected':'')+'"><div class="cmp-meeting-time">'+safe(time(x.starts_at))+'</div><div><b>'+safe(x.title)+'</b><p class="cmp-muted">'+safe(x.purpose)+'</p><small>'+x.duration_minutes+' мин · '+safe(x.format==='remote'?'Онлайн':x.format==='in_person'?'Очно':'Внутренняя встреча')+'</small>'+(x.participants?.length?'<small>Участники: '+safe(x.participants.join(', '))+' · приглашения не подтверждены</small>':'')+button('data-cmp-meeting="'+x.id+'"',x.id===state.meetingId?'✓ Выбрано':'Открыть повестку')+button('data-cmp-edit="'+x.id+'"','Изменить / перенести')+button('data-cmp-cancel="'+x.id+'"','Отменить встречу')+'</div></article>').join('');
}
function combinedCards(){const primary=state.briefing?.cards||[],known=new Set(primary.map(x=>x.id));const more=(state.coverage?.signals||[]).filter(x=>!known.has(x.domain)).map(x=>({...x,level:x.priority}));return [...primary,...more].sort((a,b)=>({high:0,medium:1,unknown:2,info:3}[a.level]-{high:0,medium:1,unknown:2,info:3}[b.level]));}
function briefCards(){
 const errors=state.briefError?'<p class="cmp-error">Обновление не выполнено: '+safe(state.briefError)+'. Ранее полученные данные нельзя считать обновлёнными.</p>':'';
 if(!state.briefing)return errors+'<p class="cmp-muted">'+(state.briefLoading?'Лера проверяет разрешённые источники…':'Подготовьте совещание для выбранного месяца.')+'</p>';
 const labels={high:'Высокий приоритет',medium:'Требует внимания',info:'Информация',unknown:'Нет подтверждённых данных'};
 return errors+'<p class="cmp-source-note">Период продаж: '+safe(monthTitle(state.focus))+' · '+safe(state.briefing.scope)+' · Обновлено '+safe(new Date(state.briefing.generated_at).toLocaleString('ru-RU',{timeZone:'Europe/Minsk'}))+'</p>'+combinedCards().map(c=>'<article class="cmp-topic"><span class="cmp-tag '+safe(c.level)+'">'+safe(labels[c.level]||labels.medium)+'</span><h4>'+safe(c.title)+'</h4><p><b>Факт:</b> '+safe(c.fact)+'</p><p><b>Почему:</b> '+safe(c.reason||'Контрольный признак требует проверки в разделе.')+'</p><p><b>Предлагаю:</b> '+safe(c.action)+'</p><p class="cmp-muted">Источник: '+safe(c.source)+' · дата отчёта: '+safe(c.as_of||'не подтверждена')+'</p>'+button('data-cmp-topic="'+safe(c.id)+'"',(state.selected.has(c.id)?'✓ В повестке':'+ В повестку'),state.selected.has(c.id))+'</article>').join('')+'<details><summary>Ограничения и свежесть данных</summary>'+(state.briefing.warnings||[]).map(x=>'<p class="cmp-muted">'+safe(x)+'</p>').join('')+'</details>';
}
function audit(){const c=state.coverage;if(!c)return '<p class="cmp-muted">Охват появится после подготовки совещания.</p>';
 const names={aggregated:'Агрегаты всего набора',profiled:'Профильный расчёт',partial:'Частичный охват',unavailable:'Ошибка источника',restricted:'Ограничено правами'};
 return '<p class="cmp-source-note">'+c.aggregate_sources+' источников с агрегатами всего набора · '+c.unavailable+' ошибок · '+c.restricted+' ограничено правами. Это не полная проверка всех правил CRM.</p><details class="cmp-coverage-details"><summary>Источники, показатели и ограничения · '+c.registered+'</summary><div class="cmp-audit-grid">'+c.entries.map(x=>'<div class="cmp-audit-item"><span class="cmp-audit-dot '+(x.status==='unavailable'?'unavailable':'partial')+'"></span><span>'+safe(x.label||x.id)+'</span><small>'+safe(names[x.status]||x.status)+' · '+safe(x.reason)+(x.metrics?'<br>Записей: '+safe(x.metrics.rows)+' · '+safe(x.period_mode==='selected_month'?'выбранный месяц':x.period_mode==='latest_report_in_or_before_month'?'последний отчёт не позже выбранного месяца':'текущее состояние')+' · дата отчёта: '+safe(x.as_of||'не подтверждена'):'')+'</small></div>').join('')+'</div></details>';
}
function agendaText(){const m=selectedMeeting(),topics=combinedCards().filter(x=>state.selected.has(x.id));const saved=m?.agenda?.topics||[];const use=topics.length?topics:saved;if(!use.length)return '';return 'Повестка · '+(m?m.title:shortDate(state.focus))+'\nАналитический месяц: '+state.focus.slice(0,7)+'\n'+use.map((x,i)=>(i+1)+'. '+x.title+'\n'+x.fact+'\nПредлагаю: '+x.action+'\nИсточник: '+x.source).join('\n\n')+'\nРешения и поручения создаются только после подтверждения.';}
function editor(){if(!state.editor)return '';const m=state.editor.id?state.meetings.find(x=>x.id===state.editor.id):null;return '<section class="cmp-panel cmp-editor"><h3>'+(m?'Изменить встречу':'Новая встреча')+'</h3><div class="cmp-form"><label>Название<input id="cmp-title" minlength="8" maxlength="160" value="'+safe(m?.title||'')+'"></label><label>Цель<textarea id="cmp-purpose" minlength="8" maxlength="800">'+safe(m?.purpose||'')+'</textarea></label><label>Дата<input id="cmp-date-input" type="date" value="'+safe(m?dayOf(m.starts_at):state.focus)+'"></label><label>Время · Минск<input id="cmp-time-input" type="time" value="'+safe(m?time(m.starts_at):'10:00')+'"></label><label>Продолжительность, мин<input id="cmp-duration" type="number" min="15" max="240" value="'+(m?.duration_minutes||60)+'"></label></div>'+button('data-cmp-save-meeting '+(state.saving?'disabled':''),'Подтвердить и сохранить',true)+button('data-cmp-editor-close','Закрыть')+'<p class="cmp-muted">Сохраняется личная встреча. Участникам ничего автоматически не отправляется.</p></section>';}
function draw(){const root=$('cmp-root');if(!root)return;const m=selectedMeeting();root.innerHTML='<header class="cmp-head"><div><h2>Календарь и совещания</h2><p>Личный календарь · '+safe(typeof currentProfile!=='undefined'?currentProfile.name:'')+' · время Минска</p></div><div class="cmp-row">'+button('data-cmp-refresh','↻ Обновить встречи')+button('data-cmp-voice','Лера · Обсудить совещание',true)+'</div></header>'+(state.notice?'<p class="cmp-notice" role="status">'+safe(state.notice)+'</p>':'')+
 '<div class="cmp-row cmp-scope"><label>Дата совещания <input type="date" id="cmp-focus" value="'+state.focus+'"></label>'+button('data-cmp-apply-date','Выбрать дату')+'<span>Аналитика продаж: '+safe(monthTitle(state.focus))+'</span></div>'+editor()+
 '<div class="cmp-columns"><section class="cmp-panel"><div class="cmp-panel-title"><h3>Мой календарь</h3><div class="cmp-modes">'+Object.entries({day:'День',week:'Неделя',month:'Месяц'}).map(([k,v])=>button('data-cmp-mode="'+k+'" aria-pressed="'+(state.mode===k)+'"',v,state.mode===k)).join('')+'</div></div><div class="cmp-row cmp-date-nav">'+button('data-cmp-shift="-1"','‹')+'<b>'+safe(monthTitle(state.focus))+'</b>'+button('data-cmp-shift="1"','›')+button('data-cmp-today','Сегодня')+'</div>'+calendar()+'<h4>Встречи · '+safe(shortDate(state.focus))+'</h4>'+meetingCards()+'<div class="cmp-row cmp-actions">'+button('data-cmp-new','+ Новая встреча',true)+button('data-cmp-voice','Назначить через Леру')+button('data-cmp-connect','Открыть CONNECT')+(userId()==='544fb1e2-ef70-44de-bc62-e0e1596a4bfc'?button('data-cmp-gps','GPS · Первая ТТ'):'')+'</div><p class="cmp-muted">Видеозвонок начинается из выбранного чата. Приглашения и напоминания по встречам автоматически не отправляются.</p></section>'+
 '<section class="cmp-panel"><div class="cmp-panel-title"><h3>'+(m?'Повестка · '+safe(m.title):'Подготовка совещания')+'</h3>'+button('data-cmp-brief '+(state.briefLoading?'disabled':''),state.briefLoading?'Подготавливаю…':'Лера · Подготовить совещание',true)+'</div>'+briefCards()+
 (m?.agenda?.topics?.length?'<details><summary>Сохранённая повестка · '+m.agenda.topics.length+' тем</summary>'+m.agenda.topics.map(x=>'<p>'+safe(x.title)+'</p>').join('')+'</details>':'')+
 '<div class="cmp-row cmp-actions">'+button('data-cmp-save-agenda '+(!m||!state.selected.size||state.saving?'disabled':''),'Сохранить повестку',true)+button('data-cmp-copy','Скопировать повестку')+'</div>'+(!m?'<p class="cmp-muted">Для сохранения повестки выберите или создайте встречу.</p>':'<label class="cmp-minutes">Решения и итоги<textarea id="cmp-minutes" maxlength="12000">'+safe(m.minutes||'')+'</textarea></label>'+button('data-cmp-save-minutes '+(state.saving?'disabled':''),'Подтвердить и сохранить итоги'))+'</section></div><section class="cmp-panel cmp-audit"><h3>Охват CRM и качество данных</h3>'+audit()+'</section>';}
async function session(){const c=one(),r=await c.auth.getUser();if(r.error||r.data?.user?.id!==userId()||!authorized())throw Error('Сессия изменилась');return c;}
async function meetingsRefresh(){if(!authorized()||state.loading)return;const actor=userId(),seq=++state.meetingSeq;state.loading=true;state.loadError='';draw();try{
 const c=await session(),visible=days(),from=move(visible[0],-1)+'T00:00:00+03:00',to=move(visible.at(-1),1)+'T00:00:00+03:00';let rows=[];
 // Keyset pages: no 200-row truncation, stable ordering for equal start times.
 let cursor=null;for(let page=0;page<100;page++){
  let q=c.from('crm_ai360_meetings_v1').select('id,title,kind,format,purpose,starts_at,duration_minutes,location,participants,client_name,status,agenda,minutes,updated_at').eq('owner_id',actor).eq('status','scheduled').gte('starts_at',from).lt('starts_at',to).order('starts_at',{ascending:true}).order('id',{ascending:true}).limit(200);
  if(cursor)q=q.or('starts_at.gt.'+cursor.starts_at+',and(starts_at.eq.'+cursor.starts_at+',id.gt.'+cursor.id+')');
  const r=await q;if(r.error)throw r.error;const data=r.data||[];rows.push(...data);if(data.length<200)break;cursor=data.at(-1);if(page===99)throw Error('Слишком много встреч: выберите более короткий период');
 }
 if(seq!==state.meetingSeq||actor!==userId()||!authorized())return;state.meetings=rows;state.loaded=true;
 if(state.meetingId&&!selectedMeeting())state.meetingId='';
 }catch(e){if(seq===state.meetingSeq&&actor===userId()){state.loaded=false;state.loadError=String(e.message||e).slice(0,180);}}
 finally{if(seq===state.meetingSeq){state.loading=false;if(authorized())draw();}}}
async function briefRefresh(){if(!authorized()||state.briefLoading)return;const actor=userId(),seq=++state.briefSeq;state.briefLoading=true;state.briefError='';const ctx=context();draw();try{
 const c=await session(),r=await c.functions.invoke(ENDPOINT,{body:{kind:'meeting_prepare',context:ctx},signal:AbortSignal.timeout(45000)});
 if(r.error||r.data?.error)throw Error(r.data?.error||r.error.message);const d=r.data;
 if(d?.briefing?.mode!=='readonly'||!Array.isArray(d.briefing.cards)||!Array.isArray(d.coverage?.entries)||d.briefing.month!==ctx.month)throw Error('Некорректный ответ подготовки');
 if(seq!==state.briefSeq||actor!==userId()||!authorized())return;state.preparationId=d.preparation_id;state.briefing=d.briefing;state.coverage=d.coverage;state.selected=new Set(d.briefing.cards.filter(x=>x.attention).map(x=>x.id));state.notice='Подготовка готова. Причины приоритетов и ограничения показаны у источников.';
 }catch(e){if(seq===state.briefSeq&&actor===userId())state.briefError=String(e.message||e).slice(0,180);}
 finally{if(seq===state.briefSeq){state.briefLoading=false;if(authorized())draw();}}}
async function writeMeeting(m,patch){const c=await session(),r=await c.rpc('crm_calendar_update_v2',{p_id:m.id,p_expected:m.updated_at,p_patch:patch});if(r.error)throw r.error;return r.data;}
async function save(kind){if(state.saving||!authorized())return;const actor=userId(),m=selectedMeeting();let patch,row;
 try{
 if(kind==='meeting'){
  const title=$('cmp-title').value.trim(),purpose=$('cmp-purpose').value.trim(),date=$('cmp-date-input').value,t=$('cmp-time-input').value,duration=Number($('cmp-duration').value);
  if(title.length<8||purpose.length<8||!/^\d{4}-\d\d-\d\d$/.test(date)||!/^\d\d:\d\d$/.test(t)||duration<15||duration>240||!Number.isInteger(duration))throw Error('Проверьте название и цель (от 8 символов), дату, время и продолжительность 15–240 минут.');
  patch={title,purpose,starts_at:new Date(date+'T'+t+':00+03:00').toISOString(),duration_minutes:duration};
 }else if(!m)throw Error('Сначала выберите встречу');
 else if(kind==='agenda')patch={agenda:{version:2,context:context(),prepared_at:state.briefing?.generated_at||null,topics:combinedCards().filter(x=>state.selected.has(x.id)),coverage:state.coverage?.entries.map(({id,status,as_of})=>({id,status,as_of}))||[]}};
 else if(kind==='minutes')patch={minutes:$('cmp-minutes').value};
 else if(kind==='cancel'){if(!window.confirm('Отменить встречу «'+m.title+'»?'))return;patch={status:'cancelled'};}
 state.saving=true;
 const edit=kind==='meeting'&&state.editor?.id?state.meetings.find(x=>x.id===state.editor.id):m;
 if(kind==='meeting'&&!state.editor?.id){const c=await session(),r=await c.from('crm_ai360_meetings_v1').insert({...patch,owner_id:actor,kind:'meeting',format:'internal',source:'calendar_confirmed_v2'}).select('id').single();if(r.error)throw r.error;row=r.data;}
 else row=await writeMeeting(edit,patch);
 if(actor!==userId()||!authorized())return;
 if(kind==='meeting'){state.focus=dayOf(patch.starts_at);state.editor=null;invalidate();}
 state.meetingId=kind==='cancel'?'':row.id;state.notice=kind==='cancel'?'Встреча отменена.':'Сохранено в личном календаре CRM.';
 await meetingsRefresh();
 }catch(e){if(actor===userId()&&authorized())state.notice='Сохранение не подтверждено: '+String(e.message||e).replace('calendar_conflict','время пересекается с другой встречей').replace('meeting_changed_refresh','встреча уже изменена; обновите календарь').slice(0,240);}
 finally{if(actor===userId()){state.saving=false;if(authorized())draw();}}}
function render(){const root=$('cmp-root');if(!root)return;if(state.actor!==userId()){clear();state.actor=userId();state.focus=dateMinsk();}if(!authorized()){root.textContent='Нет доступа к календарю.';return;}draw();if(!state.loaded&&!state.loading)void meetingsRefresh();}
async function onClick(e){const target=e.target.closest?.('#page-meeting-planner button[data-cmp-date], #page-meeting-planner button');if(!target||!authorized())return;
 let reload=false;
 if(target.hasAttribute('data-cmp-date')){state.focus=target.dataset.cmpDate;reload=true;}
 else if(target.hasAttribute('data-cmp-apply-date')){const date=$('cmp-focus').value;if(!date)return;state.focus=date;reload=true;}
 else if(target.hasAttribute('data-cmp-today')){state.focus=dateMinsk();reload=true;}
 else if(target.hasAttribute('data-cmp-mode')){state.mode=target.dataset.cmpMode;reload=true;}
 else if(target.hasAttribute('data-cmp-shift')){const d=Number(target.dataset.cmpShift);state.focus=state.mode==='month'?monthMove(state.focus,d):move(state.focus,d*(state.mode==='week'?7:1));reload=true;}
 else if(target.hasAttribute('data-cmp-refresh')){void meetingsRefresh();return;}
 else if(target.hasAttribute('data-cmp-brief')){void briefRefresh();return;}
 else if(target.hasAttribute('data-cmp-topic')){const id=target.dataset.cmpTopic;state.selected.has(id)?state.selected.delete(id):state.selected.add(id);}
 else if(target.hasAttribute('data-cmp-meeting')){state.meetingId=target.dataset.cmpMeeting;invalidate();state.notice='Выбрана встреча. Сохранённая повестка доступна ниже; новую аналитику подготовьте кнопкой Леры.';}
 else if(target.hasAttribute('data-cmp-new'))state.editor={};
 else if(target.hasAttribute('data-cmp-edit'))state.editor={id:target.dataset.cmpEdit};
 else if(target.hasAttribute('data-cmp-editor-close'))state.editor=null;
 else if(target.hasAttribute('data-cmp-save-meeting')){void save('meeting');return;}
 else if(target.hasAttribute('data-cmp-save-agenda')){void save('agenda');return;}
 else if(target.hasAttribute('data-cmp-save-minutes')){void save('minutes');return;}
 else if(target.hasAttribute('data-cmp-cancel')){state.meetingId=target.dataset.cmpCancel;void save('cancel');return;}
 else if(target.hasAttribute('data-cmp-copy')){const text=agendaText();if(!text){state.notice='Сначала выберите темы или сохранённую повестку.';}else{try{await navigator.clipboard.writeText(text);state.notice='Повестка скопирована.';}catch{window.prompt('Скопируйте повестку:',text);}}}
 else if(target.hasAttribute('data-cmp-gps')){if(typeof goPage==='function'){goPage('gps-control','GPS-контроль');setTimeout(()=>window.crmGPSFirstTTv1?.open(),350);}return;}
 else if(target.hasAttribute('data-cmp-connect')){if(typeof window.crmConnectOpen126==='function')void window.crmConnectOpen126();else state.notice='CONNECT пока недоступен.';return;}
 else if(target.hasAttribute('data-cmp-voice')){const opened=document.querySelector('.rva-window:not([hidden]):not(.rva-mini), .rsa-branch-panel:not([hidden])');if(opened){state.notice='Лера открыта: можно обсуждать выбранную встречу и повестку.';}else{const launch=document.querySelector('.rva-launch:not([hidden]), .rva-ai360-safe-launch:not([hidden]), .rsa-branch-launch:not([hidden]), .rsa-mobile-voice-launch:not([hidden])');if(launch){launch.click();return;}state.notice='Лера недоступна для этой учётной записи. Календарь работает независимо от доступа к агенту.';}}
 else return;
 if(reload){invalidate();state.meetingId='';state.loaded=false;state.meetingSeq++;state.loading=false;}
 draw();if(reload)void meetingsRefresh();}
document.addEventListener('click',onClick);
window.crmMeetingPlannerPilotV1=Object.freeze({render,refresh:meetingsRefresh,brief:briefRefresh,version:'meetings-v2',
 prepareAgentRequest(question,memory){if(!authorized()||$('app')?.dataset?.activePage!=='meeting-planner')return null;return {question,memory:{...memory,month:state.focus.slice(0,7)},meeting_context:context()};}});
})(window,document);
