import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const inventory=fs.readFileSync(new URL('../inventory.html',import.meta.url),'utf8');
const hub=fs.readFileSync(new URL('../tsd.html',import.meta.url),'utf8');
const scripts=[...inventory.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
function authModule(fetchMock,saveSession=()=>{}){
 const start=inventory.indexOf('function readableError(');
 const end=inventory.indexOf('async function rpc(',start);
 assert.ok(start>0&&end>start,'auth recovery functions exist');
 const auth=inventory.slice(start,end);
 return new Function('fetch','session','saveSession','SUPABASE_URL','APIKEY','TSD_GATEWAYS',auth+'; return {refresh,readableError,sessionExpiredError,showFreshLogin};')(
  fetchMock,{refresh_token:'old-expired',access_token:'old'},saveSession,'https://test.invalid','public-test',[]
 );
}
test('HTML embedded scripts are syntactically valid',()=>{
 for(const body of scripts)if(body.trim())assert.doesNotThrow(()=>new vm.Script(body));
});
test('an invalid refresh token is immediately recognized as an expired login',async()=>{
 let attempts=0,saves=0;
 const mod=authModule(async()=>{attempts++;return {status:400,ok:false,json:async()=>({error:'invalid_grant',message:'Invalid Refresh Token'})}},()=>saves++);
 await assert.rejects(mod.refresh(),e=>e.authExpired===true&&/Войдите заново/.test(e.message));
 assert.equal(attempts,1,'do not hammer the backup endpoint with a rejected token');
 assert.equal(saves,0,'do not overwrite the old session with a server error');
});
test('successful token refresh still updates session normally',async()=>{
 let saved=null;
 const mod=authModule(async()=>({status:200,ok:true,json:async()=>({access_token:'new-access',refresh_token:'new-refresh'})}),v=>saved=v);
 const data=await mod.refresh();
 assert.equal(data.access_token,'new-access');assert.equal(saved.refresh_token,'new-refresh');
});
test('nested response errors are shown as useful text, never [object Object]',()=>{
 const mod=authModule(async()=>{});
 assert.equal(mod.readableError({message:{message:'The token is expired'}}),'The token is expired');
 assert.equal(mod.readableError({error_description:'Invalid login credentials'}),'Invalid login credentials');
 assert.equal(mod.readableError({value:true},'Не удалось проверить доступ'),'Не удалось проверить доступ');
});
test('session recovery does not delete offline inventory scans',()=>{
 const auth=inventory.slice(inventory.indexOf('function showFreshLogin('),inventory.indexOf('async function gatewayCall('));
 assert.doesNotMatch(auth,/QUEUE_KEY|removeItem\(\s*['"]resanta_inventory_queue/);
 assert.match(auth,/saveSession\(null\)/);
 assert.match(auth,/show\('login-view',true\)/);
 assert.match(inventory,/showFreshLogin\('Сессия истекла/);
});
test('TSД hub loads fixed inventory module instead of cached v379',()=>{
 assert.match(hub,/\/inventory\.html\?legacy-module=1&v=380/);
 assert.match(inventory,/2026-11-03-v23\.6\.380-auth-recovery/);
 assert.match(inventory,/\/inventory\.html\?legacy-module=1&v=380&ts=/);
});
