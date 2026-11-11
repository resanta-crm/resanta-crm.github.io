import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const code=read('assets/198-budgets-client360-v1.js');
const index=read('index.html');
function fixture(role='manager',initiallyActive=true){
 let active=initiallyActive;const nodes={},listeners={},cls=()=>({contains:()=>active,add(){},remove(){}});
 const fake=id=>({id,innerHTML:'',classList:cls(),events:{},
    addEventListener(k,fn){this.events[k]=fn},insertAdjacentElement(_pos,el){nodes[el.id]=el},appendChild(el){(this.children??=[]).push(el)},
    querySelector(){return null}});
 for(const id of ['page-budgets','budgets-kpi','budgets-list','budget-detail-body'])nodes[id]=fake(id);
 nodes['budgets-manager-filter']={value:'all'};
 nodes['budgets-search']={value:''};
 const document={readyState:'complete',getElementById:id=>nodes[id]||null,
   createElement:()=>fake(''),head:{appendChild(){}},addEventListener(k,fn){listeners[k]=fn}};
 const w={renderBudgetsPage(){},openBudgetDetail(){},document};
 const clients=[{id:'a',manager_name:'Руднев'},{id:'b',manager_name:'Ачинович'}];
 const budgets=[{id:'ba',client_id:'a',client_name:'Наш клиент',manager_name:'Руднев',opening_balance:1000},
                {id:'bb',client_id:'b',client_name:'Чужой клиент',manager_name:'Ачинович',opening_balance:2000}];
 const context={window:w,document,currentProfile:{role,name:role==='manager'?'Руднев':'Паюшин'},
  allClients:clients,allPromotionBudgets:budgets,
  allPromotionBudgetMovements:[{budget_id:'ba',movement_type:'expense',occurred_on:'2026-11-10',amount:1100}],
  allPromotionBudgetAudit:[{budget_id:'ba',action:'update',changed_at:'2026-11-10T10:00:00Z',changed_by:'Руднев',old_data:{opening_balance:900},new_data:{opening_balance:1000}}],
  allPromotions:[],promoBudgetSummary:b=>({total:b.opening_balance,spent:b.id==='ba'?1100:0,reserved:0,free:b.id==='ba'?-100:2000,opening:b.opening_balance,
   accrued:0,adjustments:0,movements:[]}),Date,Intl,Array,Number,String,JSON,Math,Map,Set,console};
 vm.runInNewContext(code,context);
 return{nodes,w,context,listeners,setActive(value){active=!!value}};
}
test('budget 360 passes JS parse and is wired after core, as an isolated view',()=>{
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(index,/assets\/198-budgets-client360-v1\.js\?v=20261111-budget360-1/);
 assert.ok(index.indexOf('assets/01-crm-core.js')<index.indexOf('assets/198-budgets-client360-v1.js'));
 assert.match(code,/promoBudgetSummary\(b\)/);
 assert.match(code,/baseRender\.apply\(this,arguments\)/);
 assert.match(code,/baseDetail\.apply\(this,arguments\)/);
 assert.doesNotMatch(code,/\.from\(['"]promotion_budget_(?:movements|audit)['"]\)\.(insert|upsert|update|delete)\(/);
});
test('manager sees own client and overspend, never another manager budget',()=>{
 const f=fixture('manager');
 const html=f.nodes['budgets360-top'].innerHTML+' '+f.nodes['budgets360-list'].innerHTML;
 assert.match(html,/Наш клиент/);
 assert.doesNotMatch(html,/Чужой клиент/);
 assert.match(html,/−?100,00 BYN|-100,00 BYN/);
 assert.match(html,/Перерасход/);
 assert.match(html,/Движения бюджета по месяцам/);
 assert.match(html,/Лера · Что требует внимания/);
});
test('boss gets all clients, but no automated edits or guessed historical reserves',()=>{
 const f=fixture('boss');
 const html=f.nodes['budgets360-list'].innerHTML;
 assert.match(html,/Наш клиент/);
 assert.match(html,/Чужой клиент/);
 assert.match(f.nodes['budgets360-top'].innerHTML,/Стартовые остатки и текущие резервы в помесячный график не включены/);
 assert.match(code,/Резерв — текущий расчёт, а не историческое движение/);
 assert.match(code,/created_by/);
 assert.match(code,/allPromotionBudgetAudit/);
});

test('lazy budget route updates the new dashboard even when initial page is inactive',()=>{
 const f=fixture('boss',false);
 assert.equal(f.nodes['budgets360-top'],undefined,'no misleading content before entering budgets');
 f.setActive(true);
 f.listeners.click({target:{closest:selector=>selector.includes('#nav-budgets')?{id:'nav-budgets'}:null}});
 assert.match(f.nodes['budgets360-top'].innerHTML,/Лера · Что требует внимания/);
 assert.match(f.nodes['budgets360-list'].innerHTML,/Бензоленд|Наш клиент/);
 const info=f.w.RESANTA_BUDGETS360_V1.diagnostics();
 assert.equal(info.wrapped,true);
 assert.ok(info.renders>=1);
 assert.equal(info.error,'');
});
