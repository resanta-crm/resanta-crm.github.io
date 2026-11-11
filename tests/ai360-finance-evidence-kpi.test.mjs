import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeForVoice,permittedBudgetClients,summarizeBudget,answerBudgetVoice}
 from '../supabase/functions/crm-ai360-budget-voice-v1/finance.mjs';
const edge=readFileSync(new URL('../supabase/functions/crm-ai360-budget-voice-v1/index.ts',import.meta.url),'utf8');
const entry={client:{id:'client1',name:'Бензоленд ЧТУП',manager_name:'Ачинович'},
 budget:{client_name:'Бензоленд ЧТУП'},metrics:{total:1400,free:-132.89,spent:1532.89,reserved:0,accrued:300},promotions:[]};
test('1C full FIO matches authorized manager surname, not unrelated person',()=>{
 const rows=[{client_name:'Бензоленд ЧТУП',manager_name:'Ачинович Екатерина Геннадьевна',
  debt_overdue:1587.46,report_date:'2026-11-11'},
  {client_name:'Бензоленд ЧТУП',manager_name:'Руднев Александр Александрович',
  debt_overdue:999999,report_date:'2026-11-11'}];
 const result=answerBudgetVoice('Сколько просроченной задолженности у Бензоленда?', [entry],{},rows);
 assert.match(result.answer,/1[\s\u00a0\u202f]?587,46 BYN/);
 assert.match(result.answer,/2026-11-11/);
 assert.doesNotMatch(result.answer,/999.?999/);
 assert.match(result.answer,/не подтверждает получение денег/);
});
test('latest-only client_debt read before authorization-limited surname match',()=>{
 assert.match(edge,/\.select\('report_date'\)\.order\('report_date',\{ascending:false\}\)/);
 assert.match(edge,/\.eq\('report_date',reportDate\)\.gt\('debt_overdue',0\)/);
 assert.match(edge,/debtRows=\(debts\.data\|\|\[\]\)\.filter\(d=>allowed\.has/);
 assert.doesNotMatch(edge,/\.in\('manager_name',allowedManagers\)/);
 assert.doesNotMatch(edge,/\.(insert|upsert|update|delete)\(/);
});
test('real-budget KPI: expense not counted twice, reserve stays separate',()=>{
 const b={id:'bud',opening_balance:1000},movements=[
  {budget_id:'bud',movement_type:'accrual',amount:500},
  {budget_id:'bud',movement_type:'expense',amount:700,promotion_id:'promo'},
  {budget_id:'bud',movement_type:'adjustment',amount:-100}
 ],promotions=[{id:'promo',budget_id:'bud',status:'in_work',actual_spend:700,budget_reserved:900}];
 const m=summarizeBudget(b,movements,promotions);
 assert.equal(m.total,1400);
 assert.equal(m.spent,700);
 assert.equal(m.reserved,200);
 assert.equal(m.free,500);
});
test('network, branch and MPP scope; Triovist financial client access refused',()=>{
 const net='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
 const staff=[
  {id:net,name:'Александр Паюшин',email:'payushin_ar@resanta.ru',role:'boss',region:'Витебск'},
  {id:'df',name:'Сидарович К.Н.',role:'boss',region:'Витебск'},
  {id:'gomel',name:'Самойлов Д. С.',role:'boss',region:'Гомель'},
  {id:'mgr',name:'Ачинович',role:'manager',region:'Витебск'},
  {id:'gmgr',name:'Менеджер Гомеля',role:'manager',region:'Гомель'},
  {id:'tr',name:'Александренко',role:'manager',region:'Триовист / 21vek.by'}
 ];
 const clients=[{id:'a',manager_name:'Ачинович'},{id:'b',manager_name:'Менеджер Гомеля'}];
 const n=scopeForVoice(staff[0],staff,net),df=scopeForVoice(staff[1],staff,net),
  gm=scopeForVoice(staff[2],staff,net),m=scopeForVoice(staff[3],staff,net);
 assert.equal(permittedBudgetClients(n,clients,staff).length,2);
 assert.deepEqual(permittedBudgetClients(df,clients,staff).map(x=>x.id),['a']);
 assert.deepEqual(permittedBudgetClients(gm,clients,staff).map(x=>x.id),['b']);
 assert.deepEqual(permittedBudgetClients(m,clients,staff).map(x=>x.id),['a']);
 assert.equal(scopeForVoice(staff[5],staff,net),null);
});
