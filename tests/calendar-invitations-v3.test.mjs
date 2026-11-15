import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {calendarMessage,summarizeDelivery} from '../supabase/functions/crm-calendar-delivery-v3/delivery.mjs';
test('calendar notification includes time and owner-scoped link without private agenda or minutes',()=>{
 const e={kind:'invitation',meeting_id:'id',recipient_id:'recipient'},m={title:'План',purpose:'',starts_at:'2026-11-16T07:00:00Z',duration_minutes:30,agenda:{secret:true},minutes:'PRIVATE'};
 const msg=calendarMessage(e,m,'Александр');assert.match(msg.text,/10:00/);assert.match(msg.text,/calendar_meeting=id/);assert.match(msg.text,/calendar_account=recipient/);assert.doesNotMatch(msg.text,/PRIVATE|secret/);
 assert.match(calendarMessage({...e,kind:'cancelled'},m,'Александр').title,/отменена/);
});
test('delivery distinguishes provider acceptance, failure, uncertainty and absent channels',()=>{
 assert.equal(summarizeDelivery([]),'no_channel');assert.equal(summarizeDelivery([{status:'sent'}]),'sent');assert.equal(summarizeDelivery([{status:'failed'}]),'failed');assert.equal(summarizeDelivery([{status:'unknown'}]),'unknown');assert.equal(summarizeDelivery([{status:'sent'},{status:'failed'}]),'partial');
});
test('calendar worker refuses unauthenticated HTTP before claiming events',async()=>{
 let handler,touched=0,claims=0;const src=stripTypeScriptTypes(fs.readFileSync('supabase/functions/crm-calendar-delivery-v3/index.ts','utf8').replace(/^import .*\n/gm,''));
 const db={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{value:{secret:'correct-secret-value-for-calendar'}}})}},rpc(){claims++;throw Error('must_not_claim')}};
 vm.runInNewContext(src,{Deno:{serve:fn=>handler=fn,env:{get:()=>''}},createClient:()=>{touched++;return db},Response,Request});
 assert.equal((await handler(new Request('https://example.test',{method:'POST'}))).status,403);assert.equal(touched,0);
 assert.equal((await handler(new Request('https://example.test',{method:'POST',headers:{'x-crm-dispatch-secret':'incorrect-secret-for-calendar-worker'}}))).status,403);assert.equal(claims,0);
});
test('calendar push uses a separate page event and account-bound meeting deep link',async()=>{
 const handlers={},messages=[],opened=[],notifications=[];
 const self={location:{origin:'https://resanta-crm.by'},addEventListener:(k,fn)=>handlers[k]=fn,clients:{matchAll:async()=>[{url:'https://resanta-crm.by/',focused:true,visibilityState:'visible',postMessage:x=>messages.push(x),focus:async()=>{}}],openWindow:async x=>opened.push(x)},registration:{showNotification:async(...x)=>notifications.push(x)}};
 let code=fs.readFileSync('connect-push-sw.js','utf8');const start=code.indexOf('function state('),end=code.indexOf("self.addEventListener('install'",start);code=code.slice(0,start)+"async function state(){return {account_id:'owner'}}\n"+code.slice(end);
 vm.runInNewContext(code,{self,URL,URLSearchParams,Date});let done;const payload={kind:'calendar',account_id:'owner',meeting_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',calendar_day:'2026-11-16',expires_at:new Date(Date.now()+60000).toISOString()};handlers.push({data:{json:()=>payload},waitUntil:p=>done=p});await done;assert.equal(messages[0].type,'CALENDAR_PUSH');assert.equal(notifications.length,0);
 handlers.notificationclick({notification:{data:payload,close(){}},waitUntil:p=>done=p});await done;assert.equal(messages.at(-1).type,'CALENDAR_OPEN');
 handlers.push({data:{json:()=>({...payload,kind:'message'})},waitUntil:p=>done=p});await done;assert.equal(messages.at(-1).type,'CONNECT_PUSH');
});
test('actual action handler reads both legacy personal agenda and the new invitation projection',async()=>{
 const owner='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';let handler,clients=0;
 const svc={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:owner,name:'Александр Паюшин',role:'boss'}})}}};
 const item=title=>({id:'meeting',title,starts_at:'2026-11-16T10:10Z',duration_minutes:60});
 const caller={from(){const q={select(){return q},eq(){return q},gte(){return q},lt(){return q},order(){return q},range:async()=>({data:[item('Личная встреча')]})};return q},rpc:async()=>({data:[item('Приглашение')]})};
 const src=fs.readFileSync('supabase/functions/crm-ai360-actions-v1/index.ts','utf8').replace(/^import .*\n/gm,'');
 vm.runInNewContext(src,{Deno:{serve:fn=>handler=fn,env:{get:()=> 'configured'}},createClient:()=>clients++%2===0?svc:caller,TextEncoder,Response,Request,Intl,Date,Set});
 for(const [modern,title] of [[false,'Личная встреча'],[true,'Приглашение']]){
  const r=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer abcdefghijklmnopqrstuvwxyz','Content-Type':'application/json'},body:JSON.stringify({kind:'agenda',period:'range',from:'2026-11-16',to:'2026-11-17',calendar_capabilities_v3:modern})}));
  assert.equal(r.status,200);const body=await r.json();assert.equal(body.mode,'agenda');assert.equal(body.items[0].title,title);
 }
});
