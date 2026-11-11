import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const src=read('assets/193-pdz-director360-v1.js');
const sql=read('docs/pdz360_daily_rpc_v1.sql');
const index=read('index.html');
const sample={
 version:'pdz360.daily.1',report_date:'2026-11-10',previous_report_date:'2026-11-09',
 imported_at:'2026-11-10T12:14:52+00',manager:null,
 metrics:{amount:52462.66,debtors:27,high_risk:0,high_amount:0,over_30:3622.80,over_60:0,
 promised_clients:0,promised_amount:0,band_0_7:20000,band_8_30:28839.86,band_31_60:3622.80,band_61_plus:0},
 previous_amount:61396.33,day_change:-8933.67,
 series:Array.from({length:14},(_,i)=>({report_date:'2026-11-'+String(i+1).padStart(2,'0'),
 total:i===8?61396.33:i===9?52462.66:60000-i*90,debtors:i===9?27:30})),
 managers:[{manager_name:'Руднев',amount:38231.07,debtors:12},{manager_name:'Ачинович',amount:14231.59,debtors:15}],
 rows:[{client_name:'Клиент А',manager_name:'Руднев',overdue:24500.55,days_overdue:15,risk:'control',
 previous_amount:28500.55,day_change:-4000,client_id:'11111111-1111-1111-1111-111111111111',
 last_comment:'Обещал позвонить',last_contact_at:'2026-11-09T12:00:00Z',
 promised_date:null,promise_amount:null,legal_action:null},
 {client_name:'Клиент Б',manager_name:'Руднев',overdue:13730.52,days_overdue:31,risk:'warning',
 previous_amount:8000.52,day_change:5730,client_id:null,last_comment:null,promised_date:null}]
};
function fake(id){
 const node={id,events:{},style:{},dataset:{},classList:{contains:()=>true,toggle(){}},_innerHTML:'',
  addEventListener(t,fn){this.events[t]=fn},insertAdjacentElement(){},
  setAttribute(){},getAttribute(){return null},
  querySelector(){return null},scrollIntoView(){},appendChild(){},prepend(){},
  set innerHTML(v){this._innerHTML=String(v)},get innerHTML(){return this._innerHTML}};
 return node;
}
function fixture(role='boss'){
 const calls=[],nodes={};
 const get=id=>nodes[id]||null;
 nodes['page-debt']=fake('page-debt');nodes['page-debt'].querySelector=()=>({insertAdjacentElement(_dir,el){nodes[el.id]=el}});
 nodes.app=fake('app');nodes.app.dataset.activePage='debt';
 const doc={
  readyState:'complete',head:{appendChild(x){nodes[x.id]=x}},getElementById:get,
  createElement:()=>fake(''),querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener(){}
 };
 const window={document:doc,innerWidth:1200,setTimeout:(fn)=>fn(),renderDebt:()=>{}};
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{...sample,
 manager:role==='boss'?args.p_manager:null,
 rows:role==='boss'?sample.rows:sample.rows.filter(x=>x.manager_name==='Руднев')},error:null}}};
 const context={window,db,document:doc,currentUser:{id:'user1'},currentProfile:{role,name:role==='boss'?'Директор':'Руднев'},renderDebt:()=>{},Intl,Array,Number,Math,JSON,String,Set,Date,console};
 vm.createContext(context);vm.runInContext(src,context,{filename:'193-pdz-director360-v1.js'});
 return {window,nodes,calls};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
test('PDZ 360 mounts independently and calls only authenticated daily debt RPC',async()=>{
 const x=fixture();await settle();
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].name,'crm_pdz360_daily_v1');
 assert.equal(x.calls[0].args.p_manager,null);
 assert.equal(x.calls[0].args.p_days,30);
 const html=x.nodes['pdz360-root'].innerHTML;
 assert.match(html,/Задолженность 360°/);
 assert.match(html,/Динамика ПДЗ · день к дню/);
 assert.match(html,/52\s*462,66 BYN/);
 assert.match(html,/61\s*396,33 BYN/);
 assert.match(html,/[-−]8[\s\u00a0]*933,67 BYN/);
 assert.doesNotMatch(html,/к октябрю|к 10 окт|к прошлому месяцу/i);
 assert.match(html,/В комментариях пока не зафиксировано/);
 assert.match(html,/Без контакта в CRM/);
 assert.doesNotMatch(html,/Структура ПДЗ по срокам/);
 assert.doesNotMatch(html,/data-pdz-legacy>Исходный отчёт/);
 assert.match(html,/Показаны 2 приоритетных клиентов из 2/);
 assert.match(html,/font-weight="700" text-anchor="middle"/);
});
test('day selector changes visual history without changing report-date truth or requery',async()=>{
 const x=fixture();await settle();
 const root=x.nodes['pdz360-root'],click=dataset=>root.events.click({target:{closest(sel){return sel==='button'?{dataset}:null}}});
 click({pdzDays:'7'});assert.equal(x.calls.length,1);
 assert.match(root.innerHTML,/7 дн./);
 click({pdzView:'debtors'});assert.equal(x.calls.length,1);
 assert.match(root.innerHTML,/Ежедневная динамика задолженности/);
});
test('manager is server-scoped and never sees director selector',async()=>{
 const x=fixture('manager');await settle();
 assert.equal(x.calls[0].args.p_manager,null);
 const html=x.nodes['pdz360-root'].innerHTML;
 assert.match(html,/только закреплённые клиенты/);
 assert.doesNotMatch(html,/data-pdz-manager/);
});
test('client focus and comments use only confirmed exact CRM client ID',async()=>{
 const x=fixture();await settle();
 const right=fake('pdz360-detail');x.nodes['pdz360-detail']=right;
 const root=x.nodes['pdz360-root'];
 root.events.click({target:{closest(sel){return sel==='button'?{dataset:{pdzFocus:'Клиент А'}}:null}}});
 assert.match(right.innerHTML,/Клиент А/);
 assert.match(right.innerHTML,/Добавить комментарий/);
 root.events.click({target:{closest(sel){return sel==='button'?{dataset:{pdzFocus:'Клиент Б'}}:null}}});
 assert.match(right.innerHTML,/Клиент Б/);
 assert.doesNotMatch(right.innerHTML,/data-pdz-comment=/);
 assert.match(right.innerHTML,/Точная карточка клиента/);
});
test('isolated implementation preserves importer, originals, task writes and legal approvals',()=>{
 assert.match(index,/193-pdz-director360-v1\.js/);
 assert.match(sql,/from public\.client_debt_history_v1/);
 assert.match(sql,/auth\.uid\(\) is null/);
 assert.match(sql,/Недоступна ПДЗ чужих клиентов/);
 assert.match(sql,/revoke all on function public\.crm_pdz360_daily_v1\(text,integer\) from public,anon/);
 assert.match(sql,/grant execute on function public\.crm_pdz360_daily_v1\(text,integer\) to authenticated,service_role/);
 assert.match(sql,/day_change_is_not_confirmed_payment/);
 assert.doesNotMatch(sql,/\b(?:update|delete|insert|truncate)\s+public\./i);
 assert.doesNotMatch(src,/\.from\(\s*['"]client_debt['"]\s*\)\.insert\(/);
 assert.doesNotMatch(src,/data-pdz-legacy>Исходный отчёт/);
});
