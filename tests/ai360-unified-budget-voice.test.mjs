import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeForVoice,permittedBudgetClients,summarizeBudget,selectBudgetClient,answerBudgetVoice} from '../supabase/functions/crm-ai360-budget-voice-v1/finance.mjs';
const index=readFileSync(new URL('../supabase/functions/crm-ai360-budget-voice-v1/index.ts',import.meta.url),'utf8');
const users=[
 {id:'owner',name:'Александр Паюшин',email:'payushin_ar@resanta.ru',role:'boss',region:'Витебск'},
 {id:'v-chief',name:'Сидарович К.Н.',email:'sidarovich_kn@resanta.ru',role:'boss',region:'Витебск'},
 {id:'g-chief',name:'Самойлов Д. С.',email:'samoilov_ds@resanta.ru',role:'boss',region:'Гомель'},
 {id:'r',name:'Руднев',role:'manager',region:'Витебск'},
 {id:'a',name:'Ачинович',role:'manager',region:'Витебск'},
 {id:'g',name:'Гомельский МПП',role:'manager',region:'Гомель'},
 {id:'t',name:'Кришталь',role:'manager',region:'Триовист / 21vek.by'}
];
const clients=[
 {id:'c1',name:'Бензоленд ЧТУП',manager_name:'Ачинович'},
 {id:'c2',name:'СтройМастер ЧТУП',manager_name:'Руднев'},
 {id:'c3',name:'Новый клиент Гомель',manager_name:'Гомельский МПП'}
];
const budget=b=>({id:'b-'+b.id,client_id:b.id,client_name:b.name,opening_balance:1000,budget_total:1000});
const entries=clients.map((client,i)=>({client,budget:budget(client),metrics:{total:1000,spent:i?100:1132.89,reserved:0,accrued:0,adjustments:0,free:i?900:-132.89},promotions:[]}));

test('server-side network / branch / field / forbidden scope and future Gomel',()=>{
 const owner=scopeForVoice(users[0],users,'owner');
 assert.equal(owner.tier,'network_director');
 assert.equal(permittedBudgetClients(owner,clients,users).length,3);
 const vitebsk=scopeForVoice(users[1],users,'owner');
 assert.equal(vitebsk.tier,'branch_director');
 assert.deepEqual(permittedBudgetClients(vitebsk,clients,users).map(c=>c.id),['c1','c2']);
 const gomel=scopeForVoice(users[2],users,'owner');
 assert.deepEqual(permittedBudgetClients(gomel,clients,users).map(c=>c.id),['c3']);
 const manager=scopeForVoice(users[4],users,'owner');
 assert.deepEqual(permittedBudgetClients(manager,clients,users).map(c=>c.id),['c1']);
 assert.equal(scopeForVoice(users[6],users,'owner'),null);
 assert.equal(scopeForVoice({id:'x',role:'guest',name:'Гость'},users,'owner'),null);
});
test('same finance formula as CRM including linked legacy spending and reserves',()=>{
 const b={id:'b',opening_balance:1000,budget_total:2000};
 const moves=[{budget_id:'b',movement_type:'accrual',amount:300},
   {budget_id:'b',movement_type:'adjustment',amount:-100},
   {budget_id:'b',movement_type:'expense',promotion_id:'promo',amount:120}];
 const promos=[{id:'promo',budget_id:'b',actual_spend:150,budget_reserved:500,status:'in_work'}];
 const m=summarizeBudget(b,moves,promos);
 assert.deepEqual(m,{opening:1000,accrued:300,adjustments:-100,total:1200,spent:150,reserved:350,free:700});
 const minus=summarizeBudget({id:'b',opening_balance:1000},[{budget_id:'b',movement_type:'expense',amount:1132.89}],[]);
 assert.equal(Number(minus.free.toFixed(2)),-132.89);
});
test('natural voiced Russian budget question and contextual debt follow-up',()=>{
 const picked=selectBudgetClient('Привет Лера какой бюджет у Бензоленда?',entries);
 assert.equal(picked.entry?.client.id,'c1');
 const first=answerBudgetVoice('Сколько свободно у Бензоленда?',entries);
 assert.match(first.answer,/Бензоленд/);
 assert.match(first.answer,/-132,89\s*BYN/);
 assert.match(first.answer,/перерасход/);
 const follow=answerBudgetVoice('А сколько он нам должен?',entries,{client_id:'c1'},[
  {client_name:'Бензоленд ЧТУП',manager_name:'Ачинович',debt_overdue:1587.46,report_date:'2026-11-10'}]);
 assert.match(follow.answer,/1.587,46\s*BYN|1 587,46\s*BYN|1 587,46\s*BYN/);
 assert.match(follow.answer,/10-11|2026-11-10/);
 assert.equal(follow.client_id,'c1');
});
test('never return foreign manager client amounts from user question',()=>{
 const p=scopeForVoice(users[4],users,'owner');
 const allowedIds=new Set(permittedBudgetClients(p,clients,users).map(c=>c.id));
 const own=entries.filter(x=>allowedIds.has(x.client.id));
 const foreign=answerBudgetVoice('Какой бюджет у СтройМастер?',own);
 assert.doesNotMatch(foreign.answer,/1.000,00 BYN|1 000,00 BYN|1 000,00 BYN/);
 assert.match(foreign.answer,/Не нашла клиента/);
 assert.equal(foreign.client_id,null);
 const safe=answerBudgetVoice('Покажи бюджеты всех клиентов',own);
 assert.match(safe.answer,/Бензоленд/);
 assert.doesNotMatch(safe.answer,/СтройМастер|Новый клиент Гомель/);
});
test('JWT, server-verified identity, scoped finance data; no hidden client-triggered writes',()=>{
 assert.match(index,/auth\.getUser\(token\)/);
 assert.match(index,/scopeForVoice\(user\.data,staff\.data\|\|\[\],NETWORK_ID\)/);
 assert.match(index,/permittedBudgetClients\(scope,clientQuery\.data\|\|\[\],staff\)/);
 assert.match(index,/budget_source_unavailable/);
 assert.match(index,/budget_history_incomplete/);
 assert.match(index,/client_source_incomplete/);
 assert.match(index,/Cache-Control/);
 assert.doesNotMatch(index,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
 assert.doesNotMatch(index,/MutationObserver|setInterval|setTimeout/);
});

test('existing director and staff voice handlers route budget questions through ONE secure backend',()=>{
 const director=readFileSync(new URL('../assets/143-resanta-ai360-unified-dialog-v1.js',import.meta.url),'utf8');
 const staff=readFileSync(new URL('../assets/147-resanta-ai360-staff-unified-dialog-v1.js',import.meta.url),'utf8');
 for(const code of [director,staff]){
  assert.match(code,/FINANCE_ENDPOINT='crm-ai360-budget-voice-v1'/);
  assert.match(code,/budgetFollow=memory\?\.domain==='promotion_budgets'/);
  assert.match(code,/finance\?FINANCE_ENDPOINT:ENDPOINT/);
  assert.match(code,/source!=='promotion_budget_truth_v1'/);
  assert.doesNotMatch(code,/setInterval|new MutationObserver|requestAnimationFrame/);
 }
 assert.match(director,/data\.answer_verified!==true/);
 assert.match(staff,/unverified_budget_source/);
});
test('Hello Lera aliases are opt-in foreground only, prior Resanta wake remains',()=>{
 const pilot=readFileSync(new URL('../assets/134-resanta-voice-ai360-pilot-v1.js',import.meta.url),'utf8');
 const capture=readFileSync(new URL('../assets/135-resanta-voice-capture-fix-v2.js',import.meta.url),'utf8');
 assert.match(pilot,/\(\?:ресанта\|лера\)/);
 assert.match(capture,/\|лера\)\(\?=\$\|/);
 assert.match(capture,/document\.hidden/);
 assert.match(capture,/panel\.hidden/);
 assert.match(pilot,/setWake\(false\)/);
});
