/* Tasks 360 · regression tests: actual rendered HTML and safe legacy integration. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../assets/167-tasks-360-v1.js'),'utf8');
function harness(user='boss',tasks=[],clients=[],withCanonical=false){
 const elements={},classes=new Set(['active']),calls=[];
 const baseNode=()=>({
  dataset:{},style:{},innerHTML:'',children:[],
  addEventListener(type,fn){this[type]=fn;},
  contains(){return true;},
  querySelector(){return null;},
  appendChild(child){this.children.push(child);return child},
 });
 const header={textContent:'Задачи'};
 const chips={insertAdjacentElement(where,x){elements[x.id]=x}};
 const page={classList:{add:x=>classes.add(x),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle:(x,v)=>v?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},querySelector:k=>k==='.page-title'?header:k==='.chips'?chips:null,appendChild(x){elements[x.id]=x}};
 const doc={readyState:'loading',getElementById:id=>id==='page-tasks'?page:elements[id]||null,head:{appendChild(x){elements[x.id]=x}},createElement:()=>baseNode(),addEventListener(){}};
 const w={addEventListener(){},goPage(){calls.push('goPage')},renderTasks(){calls.push('legacy-render')},async loadData(){calls.push('loadData')}};
 const context={window:w,document:doc,currentProfile:{role:user,name:'Руднев'},allTasks:tasks,allClients:clients,TODAY:'2026-11-02',
  setTimeout:()=>{},console:{warn(){},error(){},log(){}},confirm:()=>true,alert:msg=>calls.push(msg),
  doneTask:id=>calls.push('report:'+id),approveAutoTask:id=>calls.push('approve:'+id),
  openEditTask:id=>calls.push('edit:'+id),restoreBacklogTask:id=>calls.push('restore:'+id),
  openClient:id=>calls.push('client:'+id)};
 if(withCanonical)context.canonicalActiveTasks=items=>items.filter(x=>!x.done&&x.review_status!=='pending'&&x.review_status!=='stale_review');
 vm.runInNewContext(js,context,{filename:'167-tasks-360-v1.js'});
 w.RESANTA_TASKS_360_V1.install();
 return {w,api:w.RESANTA_TASKS_360_V1,root:elements['tasks360-view'],page,classes,calls,context};
}
const task=(id,extra={})=>({id,client_id:'a',manager_name:'Руднев',text:'Согласовать первую отгрузку. 1. Получить решение клиента. 2. Назначить дату поставки.',due_date:'2026-11-02',review_status:'approved',priority:'высокий',...extra});
const client=(id,name='К-5 Групп ООО',manager_name='Руднев')=>({id,name,manager_name});
test('director sees whole UI incl. KPIs, list, detail, voice and original commands',()=>{
 const x=harness('boss',[task('a1')],[client('a')]);
 assert.ok(x.root);
 for(const token of ['Задачи менеджеров','Критичные','Просрочено','Что сделать','Что подтвердить','Почему ИИ рекомендует','Кратко озвучить','t360-metrics','t360-grid','data-action="done"','Показать полную аналитику']){
  assert.ok(x.root.innerHTML.includes(token),'missing '+token);
 }
 assert.ok(x.root.innerHTML.length>3000,'only header rendered');
 assert.equal(x.page.classList.contains('t360-active'),true);
 assert.equal(x.page.querySelector('.page-title').textContent,'Задачи · 360°');
});
test('manager sees ONLY assigned tasks, no other manager task cards',()=>{
 const x=harness('manager',[task('a1'),task('b1',{manager_name:'Шкуран',client_id:'b'})],[client('a'),client('b','Чужой клиент','Шкуран')]);
 assert.equal(x.api.snapshot().visible.length,1);
 assert.ok(!x.root.innerHTML.includes('Чужой клиент'));
 assert.ok(x.root.innerHTML.includes('К-5 Групп ООО'));
});
test('manager cannot see director-only approval or edit buttons',()=>{
 const x=harness('manager',[task('pending',{review_status:'pending'})],[client('a')]);
 x.api.handle('tab',{tab:'pending'});
 assert.ok(!x.root.innerHTML.includes('data-action="approve"'));
 assert.ok(!x.root.innerHTML.includes('data-action="edit"'));
 assert.ok(x.api.snapshot().counts.pending===1);
});
test('director list groups tasks by manager and allows collapsing without mutating them',()=>{
 const x=harness('boss',[task('a1'),task('b1',{manager_name:'Шкуран',client_id:'b'})],[client('a'),client('b','Точка Б','Шкуран')]);
 assert.ok(x.root.innerHTML.includes('data-action="group"'));
 assert.ok(x.root.innerHTML.includes('Шкуран'));
 assert.ok(x.root.innerHTML.includes('Руднев'));
 const before=x.api.snapshot().visible.length;
 x.api.handle('group',{group:'Шкуран'});
 assert.ok(x.root.innerHTML.includes('Шкуран'));
 assert.ok(!x.root.innerHTML.includes('Точка Б'));
 assert.equal(x.api.snapshot().visible.length,before);
});
test('unprivileged roles see neither Tasks 360 dashboard nor snapshot data',()=>{
 const x=harness('service',[task('one')],[client('a')]);
 assert.equal(x.api.snapshot().visible.length,0);
 assert.equal(x.root,undefined);
});
test('pending and stale archives are separate from active workload',()=>{
 const x=harness('boss',[task('one'),task('two',{review_status:'pending'}),task('three',{review_status:'stale_review'}),task('four',{done:true})],[client('a')]);
 const c=x.api.snapshot().counts;
 assert.equal(c.all,1);assert.equal(c.pending,1);assert.equal(c.archive,1);assert.equal(c.done,1);
});
test('existing report and director approval actions are reused, not new writes',()=>{
 const x=harness('boss',[task('one'),task('two',{review_status:'pending'})],[client('a')]);
 x.api.handle('done');assert.ok(x.calls.includes('report:one'));
 x.api.handle('tab',{tab:'pending'});x.api.handle('approve');
 assert.ok(x.calls.includes('approve:two'));
 assert.doesNotMatch(js,/\bdb\s*\.\s*(?:from|rpc|storage)\s*\(|\bfetch\s*\(/);
});
test('long task text is collapsed by default but full evidence is retained',()=>{
 const long='Действия: 1. Проверить остатки. 2. Согласовать отгрузку.\n'+'SKU/21/75 1000\\n'.repeat(80);
 const x=harness('manager',[task('one',{text:long})],[client('a')]);
 assert.ok(x.root.innerHTML.includes('Показать полную аналитику'));
 assert.ok(x.root.innerHTML.includes('SKU/21/75'));
 assert.ok(x.root.innerHTML.includes('Что сделать'));
});
test('no XSS via task/customer inputs',()=>{
 const x=harness('boss',[task('one',{title:'<script>alert(1)</script>',text:'<img src=x onerror=alert(1)>'})],[client('a','<img src=x onerror=alert(2)>')]);
 assert.ok(!x.root.innerHTML.includes('<script>'));
 assert.ok(!x.root.innerHTML.includes('<img src=x'));
 assert.ok(x.root.innerHTML.includes('&lt;img'));
});
test('legacy mode retains original controls for operational fallback',()=>{
 const x=harness('boss',[task('one')],[client('a')]);
 x.api.handle('legacy');
 assert.ok(x.page.classList.contains('t360-legacy'));
 x.api.handle('legacy');
 assert.ok(!x.page.classList.contains('t360-legacy'));
});
test('module remains opt-in to eligible manager/director; no task UI for other roles',()=>{
 const x=harness('service',[task('one')],[client('a')]);
 assert.equal(x.root,undefined);
});
