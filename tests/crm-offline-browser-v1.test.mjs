import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read = path => readFileSync(new URL('../assets/offline/'+path,import.meta.url),'utf8');
const owner = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const other = 'a26c0b33-dc15-4a2e-b2a0-59342b7a94a2';
const origin = 'https://resanta-crm.by';
const visit = {client_id:'fixture-client',route_plan_id:'fixture-route',date:'2026-11-24',text:'Заметка теста'};
const snapshot = {owner,savedAt:Date.now(),tasks:[],visits:[],routes:[],clients:[]};

function fakeIndexedDb() {
  const maps = new Map();
  const database = {
    createObjectStore(name) {
      maps.set(name,new Map());
      return {createIndex(){}};
    },
    transaction(name) {
      const map = maps.get(name);
      const tx = {
        objectStore() {
          function perform(run) {
            const request = {};
            queueMicrotask(() => {
              try {
                request.result = structuredClone(run());
                request.onsuccess?.();
                tx.oncomplete?.();
              } catch (error) {
                request.error = error;
                tx.onerror?.();
              }
            });
            return request;
          }
          function write(row,unique) {
            return perform(() => {
              const key = name === 'snapshots' ? row.owner : row.id;
              if (unique && map.has(key)) throw Error('Duplicate key');
              map.set(key,structuredClone(row));
              return key;
            });
          }
          return {
            put:row=>write(row,false),
            add:row=>write(row,true),
            get:key=>perform(()=>map.get(key)),
            delete:key=>perform(()=>map.delete(key)),
            index:()=>({getAll:id=>perform(()=>[...map.values()].filter(row=>row.owner===id))}),
          };
        },
      };
      return tx;
    },
    close(){},
  };
  return { open() {
    const request = {result:database};
    queueMicrotask(() => {
      if (!maps.size) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }};
}
function setup(handler) {
  const indexedDB = fakeIndexedDb();
  let actor = owner;
  const localStorage = {getItem:()=>actor?JSON.stringify({access_token:'fixture',user:{id:actor}}):null};
  const navigator = {onLine:false};
  const start = () => {
    const window = {};
    runInNewContext(read('crm-offline-store-v1.js'),{
      indexedDB,localStorage,navigator,window,Date,crypto,location:{origin},AbortSignal,fetch:handler,
    });
    return window.crmOfflineStore;
  };
  return {start,navigator,as:id=>{actor=id;}};
}

test('A visit survives restart and appears only to the signed-in owner',async () => {
  const env = setup();
  const first = env.start();
  await first.writeSnapshot(snapshot);
  const record = await first.enqueue(owner,visit,[]);
  assert.equal(record.state,'pending');
  const restarted = env.start();
  assert.deepEqual((await restarted.queue(owner)).map(row=>row.id),[record.id]);
  env.as(other);
  assert.equal(await restarted.readSnapshot(owner),null);
  assert.equal((await restarted.queue(owner)).length,0);
  env.as(owner);
  await restarted.removeSnapshot(owner);
  assert.equal(await restarted.readSnapshot(owner),null);
  assert.equal((await restarted.queue(owner)).length,1);
});

test('Saved report survives refreshing the route snapshot and stays within the same account',async () => {
  const env = setup();
  const store = env.start();
  const report = {key:'sales',title:'Продажи',savedAt:Date.now(),text:'Данные отчёта'};
  await store.writeSnapshot(snapshot);
  await store.saveReport(owner,report);
  await store.writeSnapshot({...snapshot,tasks:[{id:'task'}]});
  const result = await env.start().readSnapshot(owner);
  assert.deepEqual(result.reports.sales,report);
  assert.equal(result.tasks.length,1);
  env.as(other);
  assert.equal(await store.readSnapshot(owner),null);
  await assert.rejects(store.saveReport(owner,report),/Откройте CRM/);
});

test('A lost response preserves the same request; a successful retry confirms only once',async () => {
  const requestIds = [];
  const env = setup(async (url,options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({id:owner});
    requestIds.push(JSON.parse(options.body).p_request_id);
    if (requestIds.length===1) throw Error('Lost response');
    return Response.json({visit_id:'receipt'});
  });
  const store = env.start();
  await store.writeSnapshot(snapshot);
  const record = await store.enqueue(owner,visit,[]);
  assert.equal(store.synchronize(owner),undefined);
  env.navigator.onLine=true;
  await store.synchronize(owner);
  assert.equal((await store.queue(owner))[0].state,'pending');
  await Promise.all([store.synchronize(owner),store.synchronize(owner)]);
  await store.synchronize(owner);
  assert.deepEqual(requestIds,[record.id,record.id]);
  assert.equal((await store.queue(owner))[0].state,'sent');
});

test('A demo visit stays on the device and cannot enter server synchronization',async () => {
  const env = setup(() => {assert.fail('A demo must not reach the network');});
  const store = env.start();
  await store.writeSnapshot(snapshot);
  await store.enqueue(owner,visit,[],true);
  env.navigator.onLine = true;
  await store.synchronize(owner);
  assert.equal((await store.queue(owner))[0].state,'demo');
});

test('Changed route preserves text for review; expired snapshot does not erase queued visits',async () => {
  const env = setup(async url => url.endsWith('/auth/v1/user')?Response.json({id:owner}):
    Response.json({message:'OFFLINE_ROUTE_CLOSED'},{status:400}));
  const store = env.start();
  await store.writeSnapshot(snapshot);
  await store.enqueue(owner,visit,[]);
  await store.writeSnapshot({...snapshot,savedAt:0});
  assert.equal(await store.readSnapshot(owner),null);
  env.navigator.onLine=true;
  await store.synchronize(owner);
  const [record] = await store.queue(owner);
  assert.equal(record.state,'conflict');
  assert.equal(record.visit.text,visit.text);
});

test('The worker serves only the offline page and its local assets',()=>{
  const events = new Map(),scope=origin+'/assets/offline/';
  const expected = new Response('offline');
  runInNewContext(read('sw.js'),{
    self:{registration:{scope},addEventListener:(name,fn)=>events.set(name,fn)},
    URL,caches:{match:async()=>expected},
  });
  const request = (url, mode='navigate',method='GET') => {
    let response;
    events.get('fetch')({request:{method,url,mode},respondWith:r=>{response=r;}});
    return response;
  };
  assert.ok(request(scope));
  assert.ok(request(scope+'index.html'));
  assert.equal(request(origin+'/'),undefined);
  assert.equal(request('https://sample.supabase.co/auth/v1/user','cors'),undefined);
  assert.equal(request(scope, 'navigate','POST'),undefined);
});

test('Other signed-in roles can read their own prepared data with no permission to queue writes',async()=>{
  const env=setup();
  env.as(other);
  const store=env.start();
  const prepared={...snapshot,owner:other,profileKey:'manager',menu:{sales:'Продажи'}};
  await store.writeSnapshot(prepared);
  assert.equal((await store.readSnapshot(other)).owner,other);
  await store.saveReport(other,{key:'sales',title:'Продажи',text:'Отгрузки',savedAt:Date.now()});
  await store.writeSnapshot({...prepared,profileKey:'office_manager',menu:{tasks:'Задачи'}});
  assert.equal(Object.keys((await store.readSnapshot(other)).reports).length,0);
  await assert.rejects(store.enqueue(other,visit,[]),/Обновите офлайн-данные/);
  assert.equal(store.synchronize(other),undefined);
  env.as(owner);
  assert.equal(await store.readSnapshot(other),null);
});

test('Root navigation uses the offline renderer on a failed connection and keeps auth and other tools on the network',async()=>{
  const events=new Map(),offline=new Response('offline');
  let online=true;
  runInNewContext(readFileSync(new URL('../service-worker.js',import.meta.url),'utf8'),{
    self:{location:{origin},addEventListener:(name,fn)=>events.set(name,fn)},
    URL,fetch:async()=>{if(!online)throw Error('disconnected');return new Response('live');},
    caches:{open:async()=>({match:async()=>offline})}
  });
  const request=(path,mode='navigate',method='GET')=>{
    let response;
    events.get('fetch')({request:{url:new URL(path,origin).href,mode,method},respondWith:value=>{response=value;}});
    return response;
  };
  assert.equal(await (await request('/')).text(),'live');
  online=false;
  assert.equal(await request('/'),offline);
  assert.equal(await request('/assets/offline/?section=sales'),offline);
  assert.equal(request('/?code=one-use-auth'),undefined);
  assert.equal(request('https://sample.supabase.co/auth/v1/user','cors'),undefined);
  assert.equal(request('/tsd/'),undefined);
  assert.equal(request('/','navigate','POST'),undefined);
});
