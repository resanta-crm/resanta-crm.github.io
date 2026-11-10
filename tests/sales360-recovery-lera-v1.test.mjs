import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('assets/191-sales360-recovery-lera-v1.js');
const director=read('assets/134-resanta-voice-ai360-pilot-v1.js');
const staff=read('assets/144-resanta-ai360-branch-voice-v1.js');
const loader=read('assets/137-resanta-ai360-lazy-launch-v1.js');
const index=read('index.html');
const sql=read('docs/sales360_recovery_rpc_v4.sql');
const radar={
 version:'sales360.recovery.4',year:2026,previous_year:2025,period:'last3',from_month:8,to_month:10,
 manager:null,client_drop_30_count:14,client_drop_30_gap:91900.39,
 subgroups:[{category:'САДОВАЯ ТЕХНИКА',subgroup:'Бензопилы',loss_byn:21419.41,delta_pct:-30.4}],
 clients:[{client_name:'Бензоленд ЧТУП',manager_name:'Ачинович',loss_byn:7000}],
 skus:[{sku:'70/6/4',product:'Бензопила BS-45М Huter',loss_byn:25133.38}],
 growing_subgroups:[{subgroup:'Мойки',delta_byn:11500}]
};
function fixture(role='boss',name='Директор'){
 const calls=[],answers=[],status=[];
 const window={};
 const db={auth:{getSession:async()=>({data:{session:{access_token:'verified-uuid-jwt'}}})},
  rpc:async(fn,args)=>{calls.push({fn,args});
   return {data:{...radar,year:args.p_year||2026,previous_year:(args.p_year||2026)-1,period:args.p_period,
    manager:role==='manager'?name:args.p_manager},error:null};
  }};
 const context={window,db,currentUser:{id:'user-1'},currentProfile:{role,name},
  Intl,Math,Number,Array,String,Boolean,Promise,Error,JSON,console};
 vm.createContext(context);vm.runInContext(src,context,{filename:'191-sales360-recovery-lera-v1.js'});
 const ui={
  answer:(text,options)=>answers.push({text,options}),textStatus:v=>status.push(v),
  show:(text)=>answers.push({text}),setStatus:v=>status.push(v),authorized:()=>true
 };
 return {window,calls,answers,status,ui};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
test('voice bridge loads without any request or task write',()=>{
 const x=fixture();
 assert.equal(x.calls.length,0);
 assert.match(src,/crm_sales360_recovery_v4/);
 assert.doesNotMatch(src,/\.(insert|upsert|update|delete)\(/);
});
test('director recovery question asks the exact same read-only RPC as Sales360',async()=>{
 const x=fixture();
 assert.equal(x.window.crmAI360SalesRecoveryHandleV1('Лера, где мы теряем продажи?',x.ui),true);
 await settle();
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].fn,'crm_sales360_recovery_v4');
 assert.equal(x.calls[0].args.p_period,'last3');
 assert.equal(x.calls[0].args.p_manager,null);
 assert.match(x.answers[0].text,/Бензопилы/);
 assert.match(x.answers[0].text,/Бензоленд ЧТУП/);
 assert.match(x.answers[0].text,/70\/6\/4/);
 assert.match(x.answers[0].text,/Текущий неполный месяц исключён/);
 assert.ok(x.answers[0].options.speechSummary.length<=230);
});
test('staff field manager receives only authenticated own manager scope',async()=>{
 const x=fixture('manager','Ачинович');
 assert.equal(x.window.crmAI360BranchRecoveryHandleV1('Какие подгруппы просели по продажам?',x.ui),true);
 await settle();
 assert.equal(x.calls[0].args.p_manager,null);
 assert.match(x.answers[0].text,/по менеджеру Ачинович/);
 assert.equal(x.window.crmAI360BranchRecoveryHandleV1('Какие падения продаж у Руднева?',x.ui),true);
 await settle();
 assert.equal(x.calls.length,1,'foreign-manager question is refused before DB call');
 assert.match(x.answers.at(-1).text,/недоступны по вашим правам/);
});
test('owner can compare exact named manager, but never arbitrary table names',async()=>{
 const x=fixture();
 assert.equal(x.window.crmAI360SalesRecoveryHandleV1('Какое падение продаж у Шкурана за квартал?',x.ui),true);
 await settle();
 assert.equal(x.calls[0].args.p_manager,'Шкуран');
 assert.equal(x.calls[0].args.p_period,'quarter');
 assert.equal(x.window.crmAI360SalesRecoveryHandleV1('Падение конкурентов Триовист 21vek',x.ui),false);
 assert.equal(x.calls.length,1);
});
test('other modules and ordinary questions still follow existing Lera',()=>{
 const x=fixture();
 assert.equal(x.window.crmAI360SalesRecoveryHandleV1('Сколько задач у меня сегодня?',x.ui),false);
 assert.equal(x.window.crmAI360SalesRecoveryHandleV1('Покажи GPS и маршруты',x.ui),false);
 assert.equal(x.window.crmAI360SalesRecoveryHandleV1('Открой продажи',x.ui),false);
 assert.equal(x.calls.length,0);
});
test('loaded on director opt-in and staff panel, before old analytic routers',()=>{
 assert.match(loader,/191-sales360-recovery-lera-v1\.js/);
 assert.match(index,/assets\/191-sales360-recovery-lera-v1\.js\?v=20261110-1/);
 assert.ok(director.indexOf('crmAI360SalesRecoveryHandleV1')<director.indexOf('crmAI360DirectorBriefHandleV1'));
 assert.ok(staff.indexOf('crmAI360BranchRecoveryHandleV1')<staff.indexOf('crmAI360BranchUnifiedHandleV1'));
 assert.match(sql,/auth\.uid\(\) is null/);
 assert.match(sql,/v_role='manager'/);
 assert.match(sql,/last3/);
 assert.match(sql,/grant execute on function public\.crm_sales360_recovery_v4/);
});
