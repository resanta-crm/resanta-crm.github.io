import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('assets/194-pdz360-lera-v1.js'),director=read('assets/134-resanta-voice-ai360-pilot-v1.js');
const loader=read('assets/137-resanta-ai360-lazy-launch-v1.js'),index=read('index.html');
const data={version:'pdz360.daily.1',report_date:'2026-11-10',previous_report_date:'2026-11-09',day_change:-8933.67,manager:null,
 metrics:{amount:52462.66,debtors:27,over_30:3622.8,promised_clients:0,promised_amount:0},
 rows:[{client_name:'Клиент А',overdue:24500.55,days_overdue:15}],series:[{report_date:'2026-11-09',total:61396.33},{report_date:'2026-11-10',total:52462.66}]};
function fixture(role='boss',name='Директор'){
 const calls=[],answers=[];
 const window={document:{addEventListener(){},removeEventListener(){}}};
 const db={auth:{getSession:async()=>({data:{session:{access_token:'session-jwt'}}})},
 rpc:async(fn,args)=>{calls.push({fn,args});return{data:{...data,manager:role==='manager'?name:args.p_manager},error:null}}};
 const ctx={window,db,currentUser:{id:'user1'},currentProfile:{role,name},Number,String,Math,Array,JSON,Intl,Promise,console,Date};
 vm.createContext(ctx);vm.runInContext(src,ctx);
 const ui={answer:(t,options)=>answers.push({text:t,options}),show:t=>answers.push({text:t}),authorized:()=>true};
 return{window,calls,answers,ui};
}
const settle=()=>new Promise(r=>setTimeout(r,15));
test('Lera never fetches debt or writes tasks on initial load',()=>{
 const f=fixture();
 assert.equal(f.calls.length,0);
 assert.doesNotMatch(src,/\.(insert|upsert|update|delete)\(/);
 assert.match(src,/crm_pdz360_daily_v1/);
});
test('director Lera reads same daily snapshot, explains diff and not confirmed payment',async()=>{
 const f=fixture();
 assert.equal(f.window.crmAI360PDZDailyHandleV1('Лера, как изменилась ПДЗ за день?',f.ui),true);
 await settle();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].fn,'crm_pdz360_daily_v1');
 assert.equal(f.calls[0].args.p_manager,null);
 assert.match(f.answers[0].text,/52\s*462,66 BYN/);
 assert.match(f.answers[0].text,/8\s*933,67 BYN/);
 assert.match(f.answers[0].text,/не обязательно подтверждённая оплата/);
 assert.match(f.answers[0].options.speechSummary,/за день|задолженность/);
});
test('staff Lera never queries another manager',async()=>{
 const f=fixture('manager','Руднев');
 assert.equal(f.window.crmAI360BranchPDZHandleV1('Какой долг у Ачиновича?',f.ui),true);
 await settle();
 assert.equal(f.calls.length,0);
 assert.match(f.answers[0].text,/недоступны/);
 assert.equal(f.window.crmAI360BranchPDZHandleV1('Какая у меня ПДЗ?',f.ui),true);
 await settle();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].args.p_manager,null);
});
test('debt intent does not shadow tasks, GPS, 21vek or sales recovery',()=>{
 const f=fixture();
 assert.equal(f.window.crmAI360PDZDailyHandleV1('Сколько просроченных задач?',f.ui),false);
 assert.equal(f.window.crmAI360PDZDailyHandleV1('Падение продаж бензопил?',f.ui),false);
 assert.equal(f.window.crmAI360PDZDailyHandleV1('GPS у Руднева?',f.ui),false);
 assert.equal(f.window.crmAI360PDZDailyHandleV1('Долг клиента Триовист 21vek?',f.ui),false);
 assert.equal(f.calls.length,0);
});
test('Lera opt-in directors and staff panel are connected without changing voice runtime',()=>{
 assert.match(index,/assets\/194-pdz360-lera-v1\.js/);
 assert.match(loader,/194-pdz360-lera-v1\.js/);
 assert.ok(director.indexOf('crmAI360PDZDailyHandleV1')<director.indexOf('crmAI360SalesRecoveryHandleV1'));
 assert.match(src,/hookStaff/);
});
