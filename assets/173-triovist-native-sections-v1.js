/* Triovist: seven native sections, read-only briefings and scoped disclosures.
 * Never appends a panel to main-content or to the nav shell.
 * Reuses only active native section DOM and the already-authorized group aggregate.
 * No polling, mutation observers, new RPC calls, parser starts or business writes.
 */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1)return;
const VERSION='2026.11.05.1',ID='tx7-style';
let lastContext=null;
const SECTIONS=Object.freeze({
 groups:{name:'Группы и категории',detail:'Группы, подгруппы и SKU',root:'#tr14-panel .trgd',hidden:'[data-trgd-list]'},
 stock:{name:'Остатки и заказ',detail:'Таблица SKU и расчёт заказа',root:'#tri-stock-card',hidden:'#tri-stock-table'},
 tasks:{name:'Задачи ИИ',detail:'Рабочие задачи и история исполнения',root:'#tri-task-card',hidden:'.tm51-task'},
 motivation:{name:'Бонусы и план',detail:'Расшифровка премий',root:'#tri-mot-compare-v236200',hidden:null},
 cards:{name:'Карточки 21vek',detail:'Подробности проблем карточек',root:'#tri21-card',hidden:'#tri21-list'},
 parser:{name:'Парсер 21vek',detail:'Техническое состояние и история сбора',root:'#tri21-control-v236107',hidden:null},
 competitors:{name:'Конкуренты 21vek',detail:'Сравнение по позициям и SKU',root:'#tr14-panel',hidden:'[data-tm224-rows]'}
});
const escapes={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>escapes[c]);
const num=x=>(x===null||x===undefined||x==='')?null:(Number.isFinite(Number(x))?Number(x):null);
const money=x=>num(x)===null?'—':Number(x).toLocaleString('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:2})+' BYN';
const percent=x=>num(x)===null?'—':(Number(x)>0?'+':'')+Number(x).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
const fmt=x=>num(x)===null?'—':Number(x).toLocaleString('ru-RU');
const norm=x=>String(x||'').trim().toLowerCase();
const stat=(label,value,description,tone='')=>({label,value,description,tone});
const note=(title,context,step,tone='')=>({title,context,step,tone});
function active(k){
 const page=document.getElementById('page-triovist'),btn=document.querySelector('#tr14-shell [data-tr14].on');
 return !!(page?.classList.contains('active')&&btn?.dataset?.tr14===k);
}
function allowed(ctx){
 return !!(ctx?.email&&(ctx?.is_leader===true||ctx?.is_manager===true));
}
function style(){
 if(document.getElementById(ID))return;
 const s=document.createElement('style');s.id=ID;s.textContent=
 '.tx7{background:linear-gradient(135deg,#f0f6ff,#fff);border:1px solid #cbdff7;border-radius:13px;padding:14px;margin:12px 0;color:#1e3350;min-width:0}'+
 '.tx7 *{box-sizing:border-box}.tx7-top{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}'+
 '.tx7 h3{margin:0;font-size:16px;color:#124778;font-weight:850}.tx7 .tx7-sub{font-size:11px;color:#637891;line-height:1.5;margin-top:4px}'+
 '.tx7-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0 10px}'+
 '.tx7-stat{border:1px solid #dfe8f3;background:#fff;border-radius:10px;padding:10px;min-width:0}'+
 '.tx7-stat label{display:block;font-size:10px;font-weight:750;color:#6c7e95;margin-bottom:5px}'+
 '.tx7-stat strong{display:block;font-size:17px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}'+
 '.tx7-stat small{display:block;font-size:10px;color:#74849a;margin-top:4px;line-height:1.35}'+
 '.tx7-danger{color:#b42333!important}.tx7-success{color:#138450!important}'+
 '.tx7-brief{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}'+
 '.tx7-item{background:#fff;border:1px solid #e0e8f1;border-radius:10px;padding:11px;min-width:0}'+
 '.tx7-item.danger{border-left:3px solid #d93c43}.tx7-item.success{border-left:3px solid #1b9d65}'+
 '.tx7-item b{display:block;font-size:12px;color:#203b56;margin-bottom:5px;overflow-wrap:anywhere}'+
 '.tx7-item p{font-size:11px;line-height:1.45;color:#63748b;margin:4px 0}'+
 '.tx7-item em{display:block;font-size:11px;font-style:normal;color:#205a91;margin-top:7px}'+
 '.tx7-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px;align-items:center}'+
 '.tx7 button{border:1px solid #9dc5f4;background:#fff;color:#14589b;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer}'+
 '.tx7 button:focus-visible{outline:2px solid #1e65aa;outline-offset:2px}'+
 '.tx7-foot{font-size:10px;color:#72819a;margin-top:9px;line-height:1.45}'+
 '.tx7-hide-groups [data-trgd-list],.tx7-hide-stock #tri-stock-table,.tx7-hide-tasks .tm51-task,.tx7-hide-cards #tri21-list,.tx7-hide-competitors [data-tm224-rows]{display:none!important}'+
 '@media(max-width:780px){.tx7-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tx7-brief{grid-template-columns:1fr}}';
 document.head.appendChild(s);
}
function groupBrief(ctx){
 const snap=w.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120?.readOnlySnapshot?.();
 if(!snap||!Array.isArray(snap.groups))return {stats:[stat('Факт','—','Ожидаем агрегаты 1С'),stat('Динамика','—','Выбранный период')],items:[note('Данные ещё загружаются','Показатели появятся после успешной загрузки групп.','Проверьте выбранный период и обновление продаж.')],foot:'Источник: действующий агрегат групп 1С.'};
 const rows=snap.groups.filter(r=>!ctx.is_manager||norm(r.manager_email)===norm(ctx.email));
 const sum=key=>rows.reduce((a,r)=>a+(num(r[key])||0),0);
 const fact=sum('current_revenue'),basis=sum('basis_revenue'),comp=sum('compare_revenue'),delta=basis-comp;
 const forecast=!!snap.projection?.active;
 const dropping=rows.filter(r=>num(r.delta_revenue)!==null&&r.delta_revenue<0).sort((a,b)=>a.delta_revenue-b.delta_revenue);
 const rising=rows.filter(r=>num(r.delta_revenue)!==null&&r.delta_revenue>0).sort((a,b)=>b.delta_revenue-a.delta_revenue);
 const top=[...dropping.slice(0,3).map(r=>note(
  (r.manager_name||'')+' · '+(r.group||'Без группы'),
  'Снижение '+money(Math.abs(r.delta_revenue))+' относительно выбранного периода'+(forecast?' по текущему прогнозному темпу':'' )+'.',
  'Раскрыть подгруппы и конкретные SKU. Проверить наличие, спрос и историю позиций; причина не доказана.','danger')),
  ...rising.slice(0,1).map(r=>note((r.manager_name||'')+' · '+(r.group||'Без группы'),
  'Рост '+money(r.delta_revenue)+' относительно выбранного периода.',
  'Проверить, какие SKU обеспечили рост, и можно ли закрепить результат.','success'))];
 if(!top.length)top.push(note('Нет подтверждённых изменений','По выбранной выборке нет групп с рассчитанной разницей.','Проверьте фильтры и свежесть источника.'));
 return {stats:[
  stat('Продажи, факт',money(fact),'Текущий выбранный период'),
  stat(forecast?'Темп периода':'База сравнения',money(basis),forecast?'Прогноз, не факт':'Подтверждённый период'),
  stat('Сравниваемый период',money(comp),'Данные 1С'),
  stat('Разница',money(delta),forecast?'По темпу, не фактическая':'Факт к сравнению',delta<0?'danger':delta>0?'success':''),
  stat('Групп с падением',fmt(dropping.length),'Приоритет проверки'),
  stat('Групп с ростом',fmt(rising.length),'Положительная динамика')
 ],items:top,foot:'Источник: штатная аналитика 1С. Причины падения не установлены автоматически; детализация по SKU раскрывается ниже.'};
}
function stockBrief(root){
 const raw=root.textContent||'',rows=root.querySelectorAll('#tri-stock-table tbody tr').length;
 const untrusted=/рекомендации временно не считать окончательными|старым парсером|truth-v23\.5\.5/i.test(raw);
 const selectedDays=root.querySelector('#tri-stock-days')?.value||'—';
 return {stats:[
  stat('Период запаса',selectedDays==='—'?'—':selectedDays+' дней','Как выбрано в расчёте заказа'),
  stat('Строк в таблице',rows?fmt(rows):'—','Только текущая отрисовка'),
  stat('Достоверность',untrusted?'Требует проверки':'По снимку',untrusted?'Старый формат файла':'Проверять дату загрузки',untrusted?'danger':''),
  stat('Источники','21vek / 1С / Чехов','Дата и статус каждого отдельно')
 ],items:[
  note('Сначала проверить доступный остаток',untrusted?'Обнаружено предупреждение о недостоверном формате файла.':'Рекомендация опирается на подтверждённый свободный остаток 21vek.','Не учитывать товар «в пути» как свободный запас.',untrusted?'danger':''),
  note('Согласование заказа','Прогноз продаж на горизонт запаса отличается от фактического заказа.','Проверить SKU, проданные единицы, дни запаса и уже размещённые заказы.')
 ],foot:'Никаких автоматических заказов: расчёт и выгрузка Excel остаются в действующем разделе.'};
}
function taskBrief(root){
 const cards=[...root.querySelectorAll('.tm51-task')],loaded=!!root.querySelector('#tri-month-safe-v23651');
 const overdue=cards.filter(x=>/Просрочен|overdue/i.test(x.textContent||'')).length;
 const checking=cards.filter(x=>/На проверке|Ожидает проверки|awaiting_check/i.test(x.textContent||'')).length;
 return {stats:[
  stat('Карточек задач',loaded?fmt(cards.length):'—','На текущем экране'),
  stat('Просрочено',loaded?fmt(overdue):'—','По видимым карточкам',overdue?'danger':''),
  stat('На проверке',loaded?fmt(checking):'—','Требуют подтверждения'),
  stat('Месяц',root.querySelector('.tm51-month')?.textContent?.trim()||'По фильтру','Без смешивания месяцев')
 ],items:[
  note('Проверка исполнения','Статус «Выполнено» сам по себе не подтверждает коммерческий результат.','Открыть задачи на проверке и сопоставить результат с данными 1С.'),
  note('Что сделать сегодня',overdue?'Есть просроченные задачи, показанные на экране.':'Начните с текущих рабочих задач и их сроков.','Проверить ответственных, ближайшие сроки и причины задержек.',overdue?'danger':'')
 ],foot:'Только задачи доступного пользователя. Создание и подтверждение новых поручений остаётся в существующем механизме.'};
}
function motivationBrief(root){
 const month=root.querySelector('[data-mmonth]')?.selectedOptions?.[0]?.textContent||'Выбранный месяц';
 return {stats:[
  stat('Базовая часть','1,50%','Не уменьшается'),
  stat('Дополнительный KPI','до 0,50%','По правилам мотивации'),
  stat('Период',month,'Отдельный от периода продаж'),
  stat('Закрытие','По статусу месяца','Финальный расчёт после закрытия')
 ],items:[
  note('Показать, откуда взялась премия','На каждого менеджера — план, рост год к году, задачи и общий результат.','Проверьте расшифровку по четырём показателям ниже.'),
  note('Сравнить с прошлым месяцем','Изменение итогового процента указывается в процентных пунктах.','Начать с критерия, который сильнее всего повлиял на изменение.')
 ],foot:'Правила премий, расчёт 1,5% + KPI до 0,5%, источники 1С и права сотрудников не меняются.'};
}
function cardBrief(root){
 const text=root.textContent||'';
 return {stats:[
  stat('Контроль','TOP-60','Приоритетные SKU'),
  stat('Критические','По реестру ниже','Без выдуманных чисел'),
  stat('Новые проблемы','По снимку Excel','Сравнение загрузок'),
  stat('Исправленные','После проверки','Не равны автоматически закрытым')
 ],items:[
  note('Критические карточки',/критическ/i.test(text)?'В разделе есть замечания с критическим уровнем.':'Проверьте последние доступные снимки карточек.','Сначала работать по критичным SKU и коммерческому эффекту.'),
  note('Подтверждение исправления','Изменение карточки ещё не означает устранение проблемы.','Сравнить два снимка, открыть карточку и зафиксировать результат.')
 ],foot:'Реестр и загрузка Excel остаются штатными; повторных загрузок из брифинга нет.'};
}
function parserBrief(root){
 const alert=root.querySelector('.tri21ctl-alert')?.textContent?.trim()||'';
 const issue=/ошибка|неполный|не удалось|требует|отложен|не заверш/i.test(alert);
 const st=root.querySelector('.tri21ctl-badge')?.textContent?.trim()||'—';
 return {stats:[
  stat('Статус парсера',st,'По последнему проверенному запуску',issue?'danger':''),
  stat('Поисковый TOP','По снимку','Не смешивать с карточками'),
  stat('Период анализа','До 30 дней','История изменения позиций'),
  stat('Надёжность',issue?'Проверьте':'По журналу',issue?'Есть предупреждение':'Контроль времени сбора',issue?'danger':'')
 ],items:[
  note(issue?'Ошибка или неполный сбор':'Сначала проверить свежесть',alert||'Рабочим остаётся последний проверенный снимок.',issue?'Открыть журнал, не использовать неполный снимок для решений.':'Проверить дату TOP и отчёта карточек.',issue?'danger':''),
  note('Почему позиция упала','Изменение места в выдаче само по себе не доказывает причину.','Сопоставить цену, наличие, контент и историю по тому же запросу.')
 ],foot:'Парсер, расписание сборов и таблицы 21vek не меняются; выводы основаны на уже показанном состоянии.'};
}
function competitorBrief(){
 return {stats:[
  stat('Сравнение','Наши SKU','По сопоставимым товарам'),
  stat('Мы сильнее','По действующему отчёту','Подтверждённые преимущества'),
  stat('Паритет','По действующему отчёту','Сопоставимые аналоги'),
  stat('Конкурент сильнее','По действующему отчёту','Приоритетные расхождения')
 ],items:[
  note('Конкурент вырос, а мы нет','Сначала нужны одинаковый поисковый запрос, сопоставимые товары и время снимка.','Проверить изменения позиции, цены, наличия и карточки у обеих сторон.'),
  note('Предложение категорийщику','Наличие пробела в ассортименте ещё не доказывает потерю продаж.','Подготовить проверяемое предложение: SKU, цена, матрица, прогноз эффекта, источник.')
 ],foot:'Текущий конкурентный парсер и его права не изменяются. Отдельная причинная аналитика требует подтверждённой истории сравнения.'};
}
const BUILD={groups:(_,ctx)=>groupBrief(ctx),stock:r=>stockBrief(r),tasks:r=>taskBrief(r),motivation:r=>motivationBrief(r),cards:r=>cardBrief(r),parser:r=>parserBrief(r),competitors:()=>competitorBrief()};
function format(model,section){
 const stats=model.stats.map(t=>'<div class="tx7-stat"><label>'+esc(t.label)+'</label><strong class="'+(t.tone==='danger'?'tx7-danger':t.tone==='success'?'tx7-success':'')+'">'+esc(t.value)+'</strong><small>'+esc(t.description)+'</small></div>').join('');
 const items=model.items.map(t=>'<div class="tx7-item '+(t.tone==='danger'?'danger':t.tone==='success'?'success':'')+'"><b>'+esc(t.title)+'</b><p>'+esc(t.context)+'</p><em>Что сделать: '+esc(t.step)+'</em></div>').join('');
 return '<div class="tx7-top"><div><h3>✨ Краткий брифинг</h3><p class="tx7-sub">'+esc(SECTIONS[section].name)+' · приоритеты на основе доступных данных</p></div></div>'+
 '<div class="tx7-grid">'+stats+'</div><div class="tx7-brief">'+items+'</div>'+
 (SECTIONS[section].hidden?'<div class="tx7-buttons"><button type="button" data-tx7-toggle aria-expanded="false">Показать подробности</button></div>':'')+
 '<div class="tx7-foot">'+esc(model.foot)+'</div>';
}
function nativeRoot(k){
 return document.querySelector(SECTIONS[k].root);
}
function mount(k,ctx){
 // Groups now own their native director screen; avoid duplicate KPI and hidden filters.
 if(k==='groups')return false;
 if(!SECTIONS[k]||!active(k)||!allowed(ctx))return false;
 const live=w.currentProfile||w.currentUser;
 if(live?.email&&norm(live.email)!==norm(ctx.email))return false;
 lastContext=ctx;
 const root=nativeRoot(k);
 if(!root||!root.isConnected)return false;
 // One native root only. No sibling of Triovist and no global app overlays.
 const page=document.getElementById('page-triovist');
 const pane=document.getElementById('tr14-panel');
 const isAllowedRoot=(k==='groups'||k==='competitors')?pane?.contains(root):(k==='motivation'?!!document.getElementById('tr14-shell')?.parentElement?.contains(root):page?.contains(root));
 if(!isAllowedRoot)return false;
 style();
 let box=root.querySelector(':scope > .tx7');
 if(!box){
  box=document.createElement('section');box.className='tx7';box.setAttribute('aria-label','Краткий брифинг '+SECTIONS[k].name);
  const target=k==='groups'?root.querySelector('[data-trgd-kpis]'):null;
  if(target)root.insertBefore(box,target);
  else root.insertBefore(box,root.firstChild);
  box.addEventListener('click',e=>{
   const btn=e.target.closest?.('[data-tx7-toggle]');if(!btn)return;
   const expanded=btn.getAttribute('aria-expanded')==='true';
   btn.setAttribute('aria-expanded',String(!expanded));
   btn.textContent=expanded?'Показать подробности':'Скрыть подробности';
   const cls='tx7-hide-'+k;
   root.classList.toggle(cls,expanded);
  });
 }
 const detail=SECTIONS[k].hidden;
 if(detail)root.classList.add('tx7-hide-'+k);
 const model=BUILD[k](root,ctx);
 // Preserve expanded state on data update, to avoid unexpectedly hiding the user's work.
 const wasExpanded=box.querySelector('[data-tx7-toggle]')?.getAttribute('aria-expanded')==='true';
 box.innerHTML=format(model,k);
 if(wasExpanded){
  box.querySelector('[data-tx7-toggle]').setAttribute('aria-expanded','true');
  box.querySelector('[data-tx7-toggle]').textContent='Скрыть подробности';
  root.classList.remove('tx7-hide-'+k);
 }
 return true;
}
function refresh(k){
 if(!lastContext||!allowed(lastContext)||!active(k))return false;
 const profile=w.currentProfile||w.currentUser;
 if(profile?.email&&norm(profile.email)!==norm(lastContext.email))return false;
 return mount(k,lastContext);
}
w.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1=Object.freeze({version:VERSION,mount,refresh,sections:Object.keys(SECTIONS),readOnly:true,noDatabaseWrites:true,noParserRuns:true,noPolling:true});
})(window);
