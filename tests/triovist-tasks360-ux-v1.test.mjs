import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const f=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const ui=f('assets/169-triovist-tasks360-ux-v1.js');
const tasks=f('assets/61-triovist-task-month-safe-v23651.js');
const root=f('assets/34-triovist-root-v23614.js');
const index=f('index.html');
const parser=f('assets/80-triovist-21vek-control-v236107.js');
const competitors=f('assets/106-triovist-competitors-v236218.js');
function fixture(role='boss'){
 const nodes=[];
 function createNode(tag,className=''){
  const x={tag,className,children:[],dataset:{},textContent:'',innerHTML:'',parentElement:null,
   classList:{contains(k){return x.className.split(/\s+/).includes(k)},add(k){x.className+=' '+k}},
   appendChild(v){if(v.parentElement){v.parentElement.children=v.parentElement.children.filter(c=>c!==v)}this.children.push(v);v.parentElement=this},
   insertBefore(v,before){if(v.parentElement){v.parentElement.children=v.parentElement.children.filter(c=>c!==v)}const i=this.children.indexOf(before);this.children.splice(i>=0?i:this.children.length,0,v);v.parentElement=this},
   insertAdjacentElement(where,v){if(where==='afterend'&&this.parentElement){const p=this.parentElement,i=p.children.indexOf(this);p.children.splice(i+1,0,v);v.parentElement=p;}},
   querySelector(sel){
    if(sel==='.tm51-top')return this.children.find(c=>c.className==='tm51-top')||null;
    if(sel==='.tm360-view')return this.children.find(c=>c.className==='tm360-view')||null;
    if(sel==='.tm360-policy')return this.children.find(c=>c.className==='tm360-policy')||null;
    if(sel==='.tm51-filters')return this.children.find(c=>c.className==='tm51-filters')||null;
    if(sel==='button')return this.children.find(c=>c.tag==='button')||null;
    return null;
   },
   querySelectorAll(sel){if(sel==='.tm51-task')return this.children.filter(c=>c.className==='tm51-task');return []}
  };nodes.push(x);return x;
 }
 const r=createNode('div'),top=createNode('div','tm51-top'),guide=createNode('div','tm51-info'),
  payroll=createNode('div','tm51-info'),scores=createNode('div','tm51-grid'),filter=createNode('div','tm51-filters'),
  btn=createNode('button');
 guide.textContent='Инструкция менеджеру';payroll.textContent='Зарплатный KPI';scores.appendChild(btn);
 // Button within KPI needs to move WITH the score block. Task actions remain outside.
 for(const x of [top,guide,payroll,scores,filter])r.appendChild(x);
 for(const status of ['in_progress','overdue','verified','pending_approval','cancelled']){
  const t=createNode('article','tm51-task');t.dataset={status,excluded:status==='cancelled'?'1':'0'};t.appendChild(createNode('button'));r.appendChild(t);
 }
 const doc={head:{appendChild(x){nodes.push(x)}},getElementById(id){if(id==='tri-month-safe-v23651')return r;if(id==='page-triovist')return {classList:{contains:()=>true}};return nodes.find(x=>x.id===id)||null},querySelector(selector){if(selector.includes('data-tr14="tasks"'))return {classList:{contains:x=>x==='on'}};return null},
 createElement(tag){return createNode(tag)},readyState:'complete'};
 const w={currentProfile:{role,access_scope:role==='manager'?'triovist':'standard',email:role==='manager'?'krishtal_na@resanta.ru':'payushin_ar@resanta.ru'}};
 const ctx={window:w,document:doc,currentProfile:w.currentProfile,console,Date};
 vm.runInNewContext(ui,ctx);
 return {api:w.RESANTA_TRIOVIST_TASKS360_V1,root:r,score:scores,tasks:r.querySelectorAll('.tm51-task'),nodes,guide,payroll,filter};
}
test('Tasks 360 shows real DOM counts only and no fake milestones',()=>{
 const x=fixture();assert.equal(x.api.enhance(),true);
 const h=x.root.querySelector('.tm360-view').innerHTML;
 assert.match(h,/Рабочие задачи/);assert.match(h,/Просрочено/);
 assert.match(h,/>4<\/strong>/);
 assert.match(h,/На проверке/);
 assert.equal(x.root.querySelector('.tm360-policy').tag,'details');
});
test('Task actions and original policy data are retained, not deleted',()=>{
 const x=fixture('manager');const original=x.tasks.map(t=>t.children[0]);
 x.api.enhance();x.api.enhance();
 assert.equal(x.root.querySelector('.tm360-policy').children.length,2);
 assert.equal(x.root.querySelector('.tm360-view')!==null,true);
 for(let i=0;i<original.length;i++)assert.equal(x.tasks[i].children[0],original[i]);
 assert.ok(x.root.querySelector('.tm360-policy').children[1].children.includes(x.score));
 assert.ok(x.root.querySelector('.tm360-policy').children[1].children.includes(x.guide));
 assert.ok(x.root.querySelector('.tm360-policy').children[1].children.includes(x.payroll));
});
test('Role-specific briefs do not make their own server queries or widen access',()=>{
 const director=fixture(),mpp=fixture('manager');director.api.enhance();mpp.api.enhance();
 assert.match(director.root.querySelector('.tm360-view').innerHTML,/на контроле|Всего рабочих задач/);
 assert.match(mpp.root.querySelector('.tm360-view').innerHTML,/Ваших рабочих задач/);
 assert.doesNotMatch(ui,/\.rpc\(|fetch\(|\.from\(|\.insert\(|\.delete\(|\.update\(/);
 assert.match(tasks,/String\(t\.manager_email\|\|''\)\.toLowerCase\(\)===email\(\)/);
});
test('Only the task render is hooked and payroll and action handlers stay as before',()=>{
 assert.match(tasks,/applyFilters\(r\);window\.RESANTA_TRIOVIST_TASKS360_V1\?\.enhance\?\.\(\)/);
 assert.match(tasks,/data-tm51-action/);assert.match(tasks,/triovist_month_close_v23647/);
 assert.match(root,/await mod\.render\(false\);\s*window\.RESANTA_TRIOVIST_TASKS360_V1\?\.enhance\?\.\(\)/);
});
test('Work, Commerce, parser and competitor paths retained',()=>{
 for(const term of ["'anp','🧾 АНП'","'si','🛠 Компенсация СИ'","'budget','💼 Бюджет'","'price','🧮 Расчёт цены'","'parser','🌐 Парсер 21vek'","'competitors','⚔️ Конкуренты 21vek'"]){
 assert.ok(root.includes(term),term);
 }
 assert.match(root,/if\(k==='parser'\)/);
 assert.match(root,/if\(k==='competitors'\)/);
 assert.match(root,/RESANTA_TRIOVIST_21VEK_CONTROL_V236107/);
 assert.match(root,/RESANTA_TRIOVIST_COMPETITORS_V236218/);
 assert.match(index,/169-triovist-tasks360-ux-v1\.js\?v=20261104-2/);
 assert.ok(parser.length>3000);
 assert.ok(competitors.length>3000);
});
test('All files syntax valid',()=>{
 for(const s of [ui,tasks,root])assert.doesNotThrow(()=>new vm.Script(s));
});
