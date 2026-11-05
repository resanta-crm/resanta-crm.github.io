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
   guide=make('div','tm51-info'),payroll=make('div','tm51-info'),scores=make('div','tm51-grid'),
   filter=make('div','tm51-filters'),generate=make('button','','tri-task-generate-btn');
 note.textContent='Одна задача — одна подгруппа, не повторять выполненное';
 const close=make('button');scores.appendChild(close);
 const statuses=['new','accepted','in_progress','waiting_21vek','pending_approval','awaiting_check','overdue','verified','partial','cancelled','not_relevant'];
 const taskNodes=statuses.map((status,i)=>{
   const n=make('article','tm51-task');n.dataset={
     status,excluded:['cancelled','not_relevant'].includes(status)?'1':'0',
     manager:i%2?'krishtal_na@resanta.ru':'aleksandrenko_av@resanta.ru'};
   const action=make('button');n.appendChild(action);return n;
 });
 card.appendChild(r);card.appendChild(head);head.appendChild(generate);card.appendChild(note);
 for(const n of [top,guide,payroll,scores,filter,...taskNodes])r.appendChild(n);
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
 return {api:w.RESANTA_TRIOVIST_TASKS360_V1,r,card,top,score:scores,filter,guide,payroll,note,head,taskNodes,close,all};
}
test('native director screen renders correct disjoint task status counts and no invented commercial KPI',()=>{
 const x=fixture();
 assert.equal(x.api.enhance(),true);
 const html=x.r.querySelector('.tm360-view').innerHTML;
 assert.match(html,/Всего задач/);
 assert.match(html,/На согласовании/);
 assert.match(html,/На проверке/);
 assert.match(html,/Просрочено/);
 assert.match(html,/9<\/strong>/);
 assert.match(html,/Александренко/);
 assert.match(html,/Кришталь/);
 assert.match(html,/Частично/);
 assert.doesNotMatch(html,/10 задач подтверждены|100% премии/);
 assert.equal(x.api.noDuplicateOverlay,true);
});
test('existing task approval, actions, payroll and close-month controls retain their element identities',()=>{
 const x=fixture(),actions=x.taskNodes.map(t=>t.children[0]);
 x.api.enhance();x.api.enhance();
 const policy=x.r.querySelector('.tm360-policy');
 assert.ok(policy);
 assert.ok(policy.querySelector('div').children.includes(x.score));
 assert.ok(policy.querySelector('div').children.includes(x.guide));
 assert.ok(policy.querySelector('div').children.includes(x.payroll));
 assert.ok(x.score.children.includes(x.close));
 const details=x.r.querySelector('.tm360-detail');assert.ok(details);
 const contained=details.querySelectorAll('.tm51-task');
 assert.equal(contained.length,x.taskNodes.length);
 for(let i=0;i<contained.length;i++)assert.equal(contained[i].children[0],actions[i]);
 assert.equal(x.card.querySelectorAll('.tm360-generator-rules').length,0);
 assert.equal(x.card.querySelectorAll('.tm360-generator-pause').length,1);
});
test('manager UI and detail contain only manager tasks, even if DOM contains other manager rows',()=>{
 const x=fixture('manager');
 x.api.enhance();
 const html=x.r.querySelector('.tm360-view').innerHTML;
 assert.match(html,/Ваших задач/);
 assert.match(html,/Александренко/);
 assert.doesNotMatch(html,/Кришталь|data-tm360-jump/);
 const rows=x.r.querySelectorAll('.tm51-task');
 assert.equal(rows.length,6);
 assert.ok(rows.every(t=>t.dataset.manager==='aleksandrenko_av@resanta.ru'));
});
test('the five statuses are mutually exclusive; partial and finalized statuses are not reported in work',()=>{
 assert.match(ui,/const WORK=new Set\(\['new','accepted','in_progress','waiting_21vek'\]\)/);
 assert.match(ui,/const APPROVAL=new Set\(\['pending_approval'\]\)/);
 assert.match(ui,/const CHECK=new Set\(\['awaiting_check','submitted'\]\)/);
 assert.match(ui,/const LATE=new Set\(\['overdue'\]\)/);
 assert.match(ui,/const CONFIRMED=new Set\(\['verified'\]\)/);
 assert.match(ui,/const EXCLUDED=new Set\(\['cancelled','not_relevant'\]\)/);
 assert.doesNotMatch(ui,/const WORK=new Set\([^\n]*partial/);
});
test('old monthly AI generator is paused, while refresh and existing task buttons are retained',()=>{
 const x=fixture();x.api.enhance();
 const html=x.r.querySelector('.tm360-view').innerHTML;
 assert.doesNotMatch(html,/Сформировать план ИИ|8 \/ 10 \/ 12 \/ 15/);
 assert.match(html,/Мозговой штурм ИИ — ручной запуск руководителем/);
 const btn=x.head.children.find(c=>c.id==='tri-task-generate-btn');
 assert.ok(btn);
 assert.equal(btn.disabled,true);
 assert.match(ui,/#tri-task-generate-btn/);
 assert.match(x.card.querySelector('.tm360-generator-pause').textContent,/Прежний генератор отключён/);
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
 for(const term of ["'anp','🧾 АНП'","'si','🛠 Компенсация СИ'","'budget','💼 Бюджет'","'price','🧮 Расчёт цены'","'parser','🌐 Парсер 21vek'","'competitors','⚔️ Конкуренты 21vek'"])assert.ok(router.includes(term),term);
 assert.match(router,/RESANTA_TRIOVIST_21VEK_CONTROL_V236107/);
 assert.match(router,/RESANTA_TRIOVIST_COMPETITORS_V236218/);
 assert.match(native,/if\(k==='groups'\|\|k==='stock'\|\|k==='tasks'\|\|k==='motivation'\)return false/);
 assert.match(index,/169-triovist-tasks360-ux-v1\.js\?v=20261105-subgroup-brainstorm-v2/);
 assert.match(index,/173-triovist-native-sections-v1\.js\?v=20261105-motivation-director-1/);
 assert.ok(parser.length>3000);assert.ok(competitors.length>3000);
});
test('all affected source JS is syntax-valid',()=>{
 for(const code of [ui,tasks,router,native])assert.doesNotThrow(()=>new vm.Script(code));
});
