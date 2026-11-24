import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('assets/169-triovist-tasks360-ux-v1.js');
const tasks=read('assets/61-triovist-task-month-safe-v23651.js');
const router=read('assets/34-triovist-root-v23614.js');
const routes=read('assets/03-triovist-routes.js');
const native=read('assets/173-triovist-native-sections-v1.js');
const index=read('index.html');
const parser=read('assets/80-triovist-21vek-control-v236107.js');
const competitors=read('assets/106-triovist-competitors-v236218.js');
const monthlyWindow={};
vm.runInNewContext(tasks.replace(/\}\)\(\);\s*$/, 'window.fixture={taskBucket,brainListingHtml,listingSnapshotLabel,readListingGroup};})();'),{
 window:monthlyWindow,
 document:{addEventListener(){},querySelector(){return null}}
});
const {taskBucket,brainListingHtml,listingSnapshotLabel,readListingGroup}=monthlyWindow.fixture;

function fixture(role='boss'){
 const all=[];
 function make(tag,cls='',id=''){
  const el={tag,className:cls,id,children:[],dataset:{},style:{},listeners:{},parentElement:null,
    innerHTML:'',textContent:'',open:false,
    classList:{contains(k){return el.className.split(/\s+/).includes(k)},add(k){el.className+=' '+k}},
    appendChild(c){c.remove?.();this.children.push(c);c.parentElement=this;return c},
    insertBefore(c,after){c.remove?.();const i=this.children.indexOf(after);this.children.splice(i>=0?i:this.children.length,0,c);c.parentElement=this;return c},
    insertAdjacentElement(place,c){if(place!=='afterend'||!this.parentElement)return;const par=this.parentElement;c.remove?.();const i=par.children.indexOf(this);par.children.splice(i+1,0,c);c.parentElement=par},
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null},
    addEventListener(type,callback){this.listeners[type]=callback},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null},
    querySelectorAll(selector){
      const matches=[];
      function rec(node){for(const child of node.children){
        const isClass=selector.startsWith('.')&&child.className.split(/\s+/).includes(selector.slice(1));
        const isId=selector.startsWith('#')&&child.id===selector.slice(1);
        const isTag=!selector.startsWith('.')&&!selector.startsWith('#')&&child.tag===selector;
        if(isClass||isId||isTag)matches.push(child);rec(child)
      }}
      rec(this);return matches;
    }
  };
  all.push(el);return el;
 }
 const card=make('section','', 'tri-task-card'),r=make('main','', 'tri-month-safe-v23651'),top=make('div','tm51-top'),
   note=make('div','tri-task-note'),head=make('div','tri-task-head'),
   monthActions=make('div','tm51-actions'),
   filter=make('div','tm51-filters'),generate=make('button','','tri-task-generate-btn');
 note.textContent='Одна задача — одна подгруппа, не повторять выполненное';
 const close=make('button');monthActions.appendChild(close);
 const statuses=['new','accepted','in_progress','waiting_21vek','pending_approval','awaiting_check','overdue','verified','partial','cancelled','not_relevant'];
 const taskNodes=statuses.map((status,i)=>{
   const n=make('article','tm51-task');n.dataset={
     status,bucket:taskBucket({status},'2026-11-23'),excluded:['cancelled','not_relevant'].includes(status)?'1':'0',
     manager:i%2?'krishtal_na@resanta.ru':'aleksandrenko_av@resanta.ru'};
   const action=make('button');n.appendChild(action);return n;
 });
 card.appendChild(r);card.appendChild(head);head.appendChild(generate);card.appendChild(note);
 for(const n of [top,monthActions,filter,...taskNodes])r.appendChild(n);
 const doc={
  head:{appendChild(x){all.push(x)}},
  getElementById(id){
   if(id==='page-triovist')return {classList:{contains:k=>k==='active'}};
   return all.find(n=>n.id===id)||null
  },
  querySelector(s){if(s.includes('[data-tr14="tasks"]'))return {classList:{contains:k=>k==='on'}};return null},
  createElement(tag){return make(tag)}
 };
 const profile=role==='manager'?
   {role:'manager',email:'aleksandrenko_av@resanta.ru',access_scope:'triovist'}:
   {role:'boss',email:'payushin_ar@resanta.ru',access_scope:'all'};
 const w={currentProfile:profile};
 vm.runInNewContext(ui,{window:w,document:doc,currentProfile:profile,Date,Intl,Number,Map,Set,console});
 return {api:w.RESANTA_TRIOVIST_TASKS360_V1,r,card,top,monthActions,filter,note,head,taskNodes,close,all};
}
test('native director screen renders correct disjoint task status counts and no invented commercial KPI',()=>{
 const x=fixture();
 assert.equal(x.api.enhance(),true);
 const html=x.r.querySelector('.tm360-view').innerHTML;
 assert.match(html,/Всего задач/);
 assert.match(html,/В работе/);
 assert.doesNotMatch(html,/На согласовании|На проверке|Просрочено/);
 assert.equal((html.match(/role="tooltip"/g)||[]).length,2);
 assert.match(html,/9<\/strong>/);
 assert.match(html,/data-tm360-filter="work" aria-label="В работе · 4 · открыть список"/);
 assert.match(html,/Александренко/);
 assert.match(html,/Кришталь/);
 assert.doesNotMatch(html,/Короткий директорский брифинг/);
 assert.doesNotMatch(html,/10 задач подтверждены|100% премии/);
 assert.equal(x.api.noDuplicateOverlay,true);
});
test('duplicate payroll display is removed and task and close-month controls retain their identities',()=>{
 const x=fixture(),actions=x.taskNodes.map(t=>t.children[0]);
 x.api.enhance();x.api.enhance();
 assert.equal(x.r.querySelector('.tm360-policy'),null);
 assert.doesNotMatch(ui+tasks,/Правила, зарплатный KPI и полные показатели|Мотивация по задачам:/);
 assert.ok(x.monthActions.children.includes(x.close));
 assert.match(tasks,/data-tm51-close/);
 const details=x.r.querySelector('.tm360-detail');assert.ok(details);
 assert.equal(details.querySelector('summary').textContent,'Задачи и результаты');
 assert.ok(details.querySelector('div').children.includes(x.filter));
 assert.doesNotMatch(tasks,/Рабочих задач месяца —|tm51-shown/);
 const contained=details.querySelectorAll('.tm51-task');
 assert.equal(contained.length,x.taskNodes.length);
 for(let i=0;i<contained.length;i++)assert.equal(contained[i].children[0],actions[i]);
 assert.equal(x.card.querySelectorAll('.tm360-generator-rules').length,0);
 assert.equal(x.card.querySelectorAll('.tm360-generator-pause').length,0);
});
test('manager UI and detail contain only manager tasks, even if DOM contains other manager rows',()=>{
 const x=fixture('manager');
 x.api.enhance();
 const html=x.r.querySelector('.tm360-view').innerHTML;
 assert.match(html,/data-tm360-filter="total" aria-label="Всего задач · 5 · открыть список"/);
 assert.match(html,/Александренко/);
 assert.doesNotMatch(html,/Кришталь|data-tm360-jump/);
 const rows=x.r.querySelectorAll('.tm51-task');
 assert.equal(rows.length,6);
 assert.ok(rows.every(t=>t.dataset.manager==='aleksandrenko_av@resanta.ru'));
});
test('working tasks enter the overdue queue after the due date, while approval and review retain their own queues',()=>{
 const today='2026-11-23',past='2026-11-22';
 const bucket=(status,due_date=past)=>taskBucket({status,due_date},today);
 assert.equal(bucket('new',today),'work');
 assert.equal(bucket('waiting_21vek','2026-11-30'),'work');
 assert.equal(bucket('in_progress'),'late');
 assert.equal(bucket('accepted',null),'work');
 assert.equal(bucket('pending_approval'),'approval');
 assert.equal(bucket('awaiting_check'),'checking');
 assert.equal(bucket('submitted'),'checking');
 assert.equal(bucket('overdue'),'late');
 for(const status of ['partial','verified','not_achieved','cancelled','not_relevant']){
  assert.equal(bucket(status),'',status);
 }
});
test('unknown rank keeps the SKU, search query and evidence accessible without inventing a rank',()=>{
 const html=brainListingHtml({id:'sample',commercial_context:{listing_samples:[
  {sku:'74/3/100',position:null,keyword:'пневмогайковерт',registered:true,card_in_stock:true},
  {sku:'72/24/1',position:18}
 ]}});
 assert.match(html,/74\/3\/100 · Проверить позицию/);
 assert.match(html,/role="tooltip"/);
 assert.match(html,/товар указан в наличии/);
 assert.match(html,/«пневмогайковерт».*Место в TOP-60 неизвестно/);
 assert.match(html,/72\/24\/1 · №18/);
 assert.match(html,/Позиции при постановке задачи/);
 assert.match(html,/Сверить со снимком парсера/);
});
test('saved parser check scopes lookup to manager, SKU and keyword and keeps unconfirmed responses distinct',async()=>{
 const manager='aleksandrenko_av@resanta.ru',keyword='дисковая пила',calls=[];
 monthlyWindow.db={rpc:async(name,args)=>{
  calls.push({name,args});
  const row={manager_email:manager,sku:'72/11/5',keyword,current_exact:true,current_position:15};
  return {data:{position_depth:60,rows:[
   {...row,manager_email:'krishtal_na@resanta.ru',current_position:1},
   {...row,keyword:'циркулярная пила',current_position:2},row,
   {...row,sku:'72/11/2',current_exact:false,current_position:null,current_top60:false,current_label:'>60'}
  ]}};
 }};
 const rows=await readListingGroup(manager,keyword,['72/11/5','72/11/2','72/11/18'].map(sku=>({sku,keyword})));
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'triovist_own_listing_positions_v236351');
 assert.equal(calls[0].args.p_manager_email,manager);
 assert.equal(listingSnapshotLabel(rows[0].row,rows[0].depth),'№15');
 assert.equal(listingSnapshotLabel(rows[1].row,rows[1].depth),'Не найден в TOP-60');
 assert.equal(listingSnapshotLabel(rows[2].row,rows[2].depth),'Нет данных в снимке парсера');
 assert.equal(listingSnapshotLabel({current_error:'503',current_top60:false,current_label:'>60'},60),'Парсер сообщил об ошибке');
});
test('old monthly AI generator is paused, while refresh and existing task buttons are retained',()=>{
 const x=fixture();x.api.enhance();
 const html=x.r.querySelector('.tm360-view').innerHTML;
 assert.doesNotMatch(html,/Сформировать план ИИ|8 \/ 10 \/ 12 \/ 15/);
 assert.doesNotMatch(html,/Мозговой штурм ИИ — ручной запуск руководителем/);
 const btn=x.head.children.find(c=>c.id==='tri-task-generate-btn');
 assert.ok(btn);
 assert.equal(btn.disabled,true);
 assert.match(ui,/#tri-task-generate-btn/);
 assert.match(tasks,/tri-month-safe51 > :is\(\.tri-task-head,\.tri-task-note,#tri-task-banner,div:has\(> #tri-task-manager-wrap\)\)\{display:none!important\}/);
 assert.match(tasks,/triovist_tasks_get_dashboard_month_v23648/);
 assert.match(routes,/triovistTasksGenerateFresh\(true\)/);
});
test('no new API calls, DB writes or parser reads are added to tasks presentation',()=>{
 assert.doesNotMatch(ui,/\.rpc\(|fetch\(|\.from\(|\.insert\(|\.delete\(|\.update\(|MutationObserver|setInterval/);
 assert.match(tasks,/triovist_month_close_v23647/);
 assert.match(tasks,/data-tm51-action/);
 assert.match(tasks,/applyFilters\(r\);window\.RESANTA_TRIOVIST_TASKS360_V1\?\.enhance\?\.\(\)/);
 assert.match(router,/await mod\.render\(false\);\s*window\.RESANTA_TRIOVIST_TASKS360_V1\?\.enhance\?\.\(\)/);
});
test('preserves work, commercial routes, original parser and competitor modules',()=>{
 for(const term of ["'anp','🧾 АНП'","'si','🛠 Компенсация СИ'","'budget','💼 Бюджет'","'parser','🌐 Парсер 21vek'","'competitors','⚔️ Конкуренты 21vek'"])assert.ok(router.includes(term),term);
 assert.match(router,/RESANTA_TRIOVIST_21VEK_CONTROL_V236107/);
 assert.match(router,/RESANTA_TRIOVIST_COMPETITORS_V236218/);
 assert.match(native,/if\(k==='groups'\|\|k==='stock'\|\|k==='tasks'\|\|k==='motivation'\)return false/);
 assert.match(index,/169-triovist-tasks360-ux-v1\.js\?v=(?:20261105-subgroup-brainstorm-v2|20261123-task-focus1)/);
 assert.match(index,/173-triovist-native-sections-v1\.js\?v=20261105-motivation-director-1/);
 assert.ok(parser.length>3000);assert.ok(competitors.length>3000);
});
test('all affected source JS is syntax-valid',()=>{
 for(const code of [ui,tasks,router,native])assert.doesNotThrow(()=>new vm.Script(code));
});
