import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';import {webcrypto} from 'node:crypto';
import {validSubscription,resultFor,messagePreview} from '../supabase/functions/connect-delivery-v2/rules.mjs';
function runtime({signed=false,tasks=[],messages=[],messageLookupFails=false}={}){
 const operations=[],sent=[],android=[];let handler;
 const db={
  auth:{getUser:async()=>({data:{user:signed?{id:'actor'}:null},error:signed?null:Error()})},
  rpc:async(name)=>{operations.push({rpc:name});return {data:name==='connect_active_staff_v1'?true:name==='connect_delivery_claim_v2'?tasks:1}},
  from(table){
   const filters={};let data;
   const q={
    select(){return q},eq(k,v){filters[k]=v;return q},gt(){return q},order(){return q},limit(){return q},
    upsert(v){data=v;return q},insert(v){data=v;return q},update(v){data=v;return q},delete(){return q},
    maybeSingle(){return q},single(){return q},
    then(resolve){
     operations.push({table,filters:{...filters},data});
     let result=null,error=null;
     if(table==='connect_runtime_v2')result={value:filters.key==='dispatch'?{secret:'dispatch-test'}:{publicKey:'public-only',privateKey:'private-only'}};
     if(table==='connect_web_devices_v2')result={id:'12345678-1234-4123-8123-123456789abc',subscription:{...filters}};
     if(table==='connect_push_devices_v1')result=filters.user_id==='recipient'?[{fcm_token:'fixture-token'}]:[];
     if(table==='connect_messages_v1'){
      result=messages.find(message=>message.id===filters.id&&message.room_id===filters.room_id)||null;
      if(messageLookupFails)error=Error('temporarily unavailable');
     }
     return Promise.resolve({data:result,count:0,error}).then(resolve);
    }
   };return q;
  }
 };
 class SignJWT {
  setProtectedHeader(){return this;} setIssuer(){return this;} setAudience(){return this;}
  setIssuedAt(){return this;} setExpirationTime(){return this;} async sign(){return 'fixture-jwt';}
 }
 const fetch=async(url,options)=>{
  if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({access_token:'fixture-access'}));
  if(url==='https://fcm.googleapis.com/v1/projects/fixture-project/messages:send'){
   android.push(JSON.parse(options.body).message);
   return new Response('{}');
  }
  throw Error('Unexpected outbound HTTP');
 };
 const env={SUPABASE_URL:'https://mock',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({private_key:'fixture-key',client_email:'fixture@example.test',project_id:'fixture-project'})};
 const code=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/connect-delivery-v2/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 vm.runInNewContext(code,{Deno:{env:{get:k=>env[k]||'mock'},serve:f=>handler=f},createClient:()=>db,webpush:{sendNotification:async(...args)=>{sent.push(args)},generateVAPIDKeys:()=>({publicKey:'public-only',privateKey:'private-only'})},validSubscription,resultFor,messagePreview,SignJWT,importPKCS8:async()=>null,crypto:webcrypto,TextEncoder,Response,URL,URLSearchParams,AbortSignal,fetch});
 const request=async(body,headers={})=>{const r=await handler(new Request('https://mock/functions/v1/connect-delivery-v2',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};return {request,operations,sent,android};
}
test('Anonymous browser and forged dispatcher cannot read subscriptions or trigger transport',async()=>{const t=runtime();assert.equal((await t.request({action:'status'})).status,401);assert.equal((await t.request({action:'dispatch'},{'x-connect-secret':'forged'})).status,403);assert.equal(t.sent.length,0);});
test('Authenticated config exposes public VAPID only and rejects foreign origin',async()=>{const t=runtime({signed:true});const r=await t.request({action:'config'});assert.equal(r.data.public_key,'public-only');assert.ok(!JSON.stringify(r).includes('private-only'));assert.equal((await t.request({action:'config'},{origin:'https://evil.test'})).status,403);});
test('Unregister and confirm are scoped to validated user, not a body-supplied user',async()=>{const t=runtime({signed:true});await t.request({action:'unregister',device_id:'12345678-1234-4123-8123-123456789abc',user_id:'other'});const op=t.operations.find(x=>x.table==='connect_web_devices_v2');assert.equal(op.filters.user_id,'actor');});
test('Dispatcher dry run never claims a task or transmits a push',async()=>{const t=runtime();const r=await t.request({action:'dispatch',dry_run:true},{'x-connect-secret':'dispatch-test'});assert.equal(r.status,200);assert.equal(r.data.web_configured,true);assert.ok(!t.operations.some(x=>x.rpc==='connect_delivery_claim_v2'));assert.equal(t.sent.length,0);});
test('Web transport resolves device under recipient ownership and records provider acceptance',async()=>{const t=runtime({tasks:[{id:'task',channel:'web',device_ref:'device',recipient_id:'recipient',kind:'message',message_id:'message',expires_at:new Date(Date.now()+60000).toISOString(),attempts:1}]});const r=await t.request({action:'dispatch'},{'x-connect-secret':'dispatch-test'});assert.equal(r.data.sent,1);assert.equal(t.sent.length,1);assert.equal(t.operations.find(x=>x.table==='connect_web_devices_v2').filters.user_id,'recipient');assert.equal(t.operations.find(x=>x.table==='connect_delivery_v2'&&x.data?.status).data.status,'sent');assert.ok(!t.sent[0][1].includes('private-only'));});

const deviceRef=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('fixture-token'))).toString('hex');
const androidTask={id:'task',channel:'fcm',device_ref:deviceRef,recipient_id:'recipient',kind:'message',message_id:'message',room_id:'room',attempts:1};
const dispatch=t=>t.request({action:'dispatch'},{'x-connect-secret':'dispatch-test'});

test('Android system notification receives the text of the exact queued message',async()=>{
 const body='Позвоните по поставке.\n  '+ '📦'.repeat(240);
 const t=runtime({tasks:[androidTask],messages:[{id:'message',room_id:'room',body}]});
 assert.equal((await dispatch(t)).data.sent,1);
 const notification=t.android[0].notification;
 assert.equal(notification.title,'Сообщение · ГК Ресанта');
 assert.match(notification.body,/^Позвоните по поставке\. 📦/u);
 assert.equal(Array.from(notification.body).length,240);
 assert.ok(notification.body.endsWith('…'));
 assert.equal(t.android[0].data.room_id,'room');
 assert.equal(t.android[0].data.message_id,'message');
 assert.ok(!t.android[0].data.body.includes('Позвоните'));
 assert.deepEqual(t.operations.find(op=>op.table==='connect_messages_v1').filters,{id:'message',room_id:'room'});
});

test('Android delivery never sends the text from a different chat',async()=>{
 const t=runtime({tasks:[androidTask],messages:[{id:'message',room_id:'another-room',body:'Другой разговор'}]});
 await dispatch(t);
 assert.equal(t.android.length,0);
 assert.equal(t.operations.find(op=>op.table==='connect_delivery_v2').data.error_code,'MESSAGE_UNAVAILABLE');
});

test('A temporary preview lookup failure keeps Android delivery retryable',async()=>{
 const t=runtime({tasks:[androidTask],messageLookupFails:true});
 await dispatch(t);
 assert.equal(t.android.length,0);
 assert.equal(t.operations.find(op=>op.table==='connect_delivery_v2').data.status,'failed');
 assert.equal(t.operations.find(op=>op.table==='connect_delivery_v2').data.error_code,'MESSAGE_LOOKUP_FAILED');
});
