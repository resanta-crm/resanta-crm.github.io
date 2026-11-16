import test from 'node:test';import assert from 'node:assert/strict';
import {cachedModel} from '../supabase/functions/crm-tasks-assistant-v4/model-cache.mjs';
function db(){const rows=new Map();return {rows,from(){return {async insert(row){if(rows.has(row.key))return {error:{code:'23505'}};rows.set(row.key,row);return {};},select(){return {eq(_,key){return {async single(){return {data:rows.get(key)}}}}}},update(patch){return {async eq(_,key){Object.assign(rows.get(key),patch);return {}}}}}}};}
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
