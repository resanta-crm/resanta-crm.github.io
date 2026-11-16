import test from 'node:test';import assert from 'node:assert/strict';
import {cachedModel,legacyPreparationUserIds,canonicalModelInput} from '../supabase/functions/crm-tasks-assistant-v4/model-cache.mjs';
function db(){const rows=new Map();return {rows,from(){return {async insert(row){if(rows.has(row.key))return {error:{code:'23505'}};rows.set(row.key,row);return {};},select(){return {eq(_,key){return {async single(){return {data:rows.get(key)}},async maybeSingle(){return {data:rows.get(key)||null}}}}}},update(patch){return {async eq(_,key){Object.assign(rows.get(key),patch);return {}}}}}}};}
test('repeat and concurrent request cannot trigger a second paid call',async()=>{
 const svc=db();let calls=0,release;const wait=new Promise(r=>release=r);
 const run=async()=>{calls++;await wait;return {title:'result'}};
 const first=cachedModel(svc,'user','instruction','facts',run);
 await new Promise(r=>setTimeout(r,10));
 await assert.rejects(cachedModel(svc,'user','instruction','facts',run),/RUNNING/);
 release();await first;
 assert.deepEqual(await cachedModel(svc,'user','instruction','facts',run),{title:'result'});assert.equal(calls,1);
 await cachedModel(svc,'user','instruction','changed facts',async()=>{calls++;return {}});assert.equal(calls,2);
 await cachedModel(svc,'other user','instruction','facts',async()=>{calls++;return {}});assert.equal(calls,3);
});
test('failed paid attempt is not automatically replayed',async()=>{const svc=db();let calls=0;const run=async()=>{calls++;throw Error('timeout')};await assert.rejects(cachedModel(svc,'u','i','f',run),/timeout/);await assert.rejects(cachedModel(svc,'u','i','f',run),/PREPARATION_FAILED/);assert.equal(calls,1);});

test('JSONB field order and tied fact rows reuse the same paid response',async()=>{const svc=db();let n=0;const run=async()=>{n++;return {title:'same'}};await cachedModel(svc,'u','i','data:\n'+JSON.stringify({previous:{title:'T',items:[{sku:'x',qty:1}]},visits:[{date:'d',text:'B'},{date:'d',text:'A'}]}),run);await cachedModel(svc,'u','i','data:\n'+JSON.stringify({visits:[{text:'A',date:'d'},{text:'B',date:'d'}],previous:{items:[{qty:1,sku:'x'}],title:'T'}}),run);assert.equal(n,1);});

test('migration reuses a previously paid legacy key without calling the model',async()=>{const svc=db(),input='data:\n'+JSON.stringify({z:1,a:2});const source=JSON.stringify(['tasks-v2','gpt-5.4-mini','u','i',input]);const legacy=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');svc.rows.set(legacy,{status:'ready',result:{title:'paid already'}});let n=0;const result=await cachedModel(svc,'u','i',input,async()=>{n++;return {}});assert.equal(n,0);assert.equal(result.title,'paid already');assert.equal(svc.rows.size,2);});

test('authorized route preparation reuses same facts across actors but private records do not',async()=>{const svc=db();let n=0;const run=async()=>{n++;return {title:'shared'}};await cachedModel(svc,'owner','i','same facts',run,{shared:true});await cachedModel(svc,'director','i','same facts',run,{shared:true});assert.equal(n,1);await cachedModel(svc,'owner','i','same facts',run);await cachedModel(svc,'director','i','same facts',run);assert.equal(n,3);await cachedModel(svc,'director','i','changed facts',run,{shared:true});assert.equal(n,4);});

test('new dense serializer and smaller direction facts never recharge old paid input',async()=>{const svc=db(),legacyInput='data:\n'+JSON.stringify({history:'all monthly facts',candidates:[{sku:'a'}]});const source=JSON.stringify(['tasks-v2','gpt-5.4-mini','director','unchanged instruction',legacyInput]);const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');svc.rows.set(key,{status:'ready',result:{title:'old paid plan'}});let n=0;const run=async()=>{n++;return {}};const r=await cachedModel(svc,'director','unchanged instruction','dense:\n'+JSON.stringify({compact:'new encoding'}),run,{shared:true,legacyInputs:[legacyInput]});assert.equal(n,0);assert.equal(r.title,'old paid plan');await cachedModel(svc,'owner','unchanged instruction','dense:\n'+JSON.stringify({compact:'new encoding'}),run,{shared:true});assert.equal(n,0);});

async function oldKey(user,instructions,input){const source=JSON.stringify(['tasks-v2','gpt-5.4-mini',user,instructions,input]);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');}

test('owner reuses an authorized director\'s exact paid v19 preparation before any new call',async()=>{
 const svc=db(),old='data:\n'+JSON.stringify({z:'all historical evidence',a:[{sku:'a',qty:1}]}),instructions='unchanged task instruction';
 svc.rows.set(await oldKey('director',instructions,canonicalModelInput(old)),{status:'ready',result:{title:'director paid this plan'}});
 let n=0;const run=async()=>{n++;return {title:'new paid result'}};
 const result=await cachedModel(svc,'owner',instructions,'dense:\n'+JSON.stringify({newEncoding:true}),run,{shared:true,legacyInputs:[old],legacyUserIds:['owner','director']});
 assert.equal(result.title,'director paid this plan');assert.equal(n,0);
 await cachedModel(svc,'another authorized boss',instructions,'dense:\n'+JSON.stringify({newEncoding:true}),run,{shared:true});assert.equal(n,0);
});

test('personal record action never uses another actor\'s old result even if actor IDs are supplied',async()=>{
 const svc=db(),old='data:\n'+JSON.stringify({request:'Private dictated result'}),instructions='record result';
 svc.rows.set(await oldKey('director',instructions,old),{status:'ready',result:{fact:'private director record'}});
 let n=0;const result=await cachedModel(svc,'owner',instructions,'dense private input',async()=>{n++;return {fact:'owner record'}},{legacyInputs:[old],legacyUserIds:['director']});
 assert.equal(result.fact,'owner record');assert.equal(n,1);
});

test('branch-boss lookup uses current caller RLS, deduplicates with owner first and fails before payment',async()=>{
 const filters=[];let tableName,columns;
 const caller={from(table){tableName=table;return {select(value){columns=value;return this},eq(column,value){filters.push([column,value]);return this},in(column,value){filters.push([column,value]);return Promise.resolve({data:[{id:'director'},{id:'owner'},{id:'director'}],error:null})}}}};
 assert.deepEqual(await legacyPreparationUserIds(caller,'owner'),['owner','director']);assert.equal(tableName,'users');assert.equal(columns,'id');assert.deepEqual(filters,[['role','boss'],['region',['Витебск','Все филиалы']]]);
 let paid=0;const failing={from(){return {select(){return this},eq(){return this},in(){return Promise.resolve({error:{code:'42501'},data:null})}}}};
 await assert.rejects((async()=>{const ids=await legacyPreparationUserIds(failing,'owner');await cachedModel(db(),'owner','i','f',async()=>{paid++;return {}},{shared:true,legacyUserIds:ids})})(),/CACHE_ACTORS_UNAVAILABLE/);assert.equal(paid,0);
});

test('old actor aliases still require the exact facts and instructions',async()=>{
 const svc=db(),old='data:\n'+JSON.stringify({client:'c',stock:5}),instructions='original instruction';svc.rows.set(await oldKey('director',instructions,old),{status:'ready',result:{title:'paid old'}});
 let n=0;await cachedModel(svc,'owner','changed instruction','dense changed',async()=>{n++;return {}},{shared:true,legacyInputs:[old],legacyUserIds:['director']});assert.equal(n,1);
});
