'use strict';

(() => {
  const authKey = 'sb-baqchjtvtmcfzwjjluhs-auth-token';
  const databaseName = 'resanta-crm-offline-v1';
  const stores = ['snapshots', 'visits'];
  const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const MAX_AGE = 12 * 60 * 60 * 1000;
  const production = 'https://resanta-crm.by';
  const enrolledOwner = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
  const api = 'https://baqchjtvtmcfzwjjluhs.supabase.co';
  const publishableKey = 'sb_publishable_BzH2PH0XD4jXrWYcbcs5FA_28uIMFbd';
  const conflicts = new Map([
    ['OFFLINE_ROUTE_CLOSED','Точка уже закрыта другим визитом.'],
    ['OFFLINE_ROUTE_CHANGED','Маршрут изменился после загрузки на телефон.'],
    ['OFFLINE_TASK_CHANGED','Задача изменилась после загрузки на телефон.'],
    ['OFFLINE_REQUEST_CHANGED','Данные этой записи изменились.'],
    ['OFFLINE_INVALID_INPUT','Проверьте данные визита.'],
  ]);
  let opening;
  let syncFlight;

  function connect() {
    if (!opening) {
      opening = new Promise((resolve,reject) => {
        const request = indexedDB.open(databaseName,1);
        request.onupgradeneeded = () => {
          const database = request.result;
          database.createObjectStore('snapshots',{keyPath:'owner'});
          database.createObjectStore('visits',{keyPath:'id'}).createIndex('owner','owner');
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {database.close(); opening = null;};
          resolve(database);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(Error('Хранилище открыто в другой вкладке.'));
      }).catch(error => {opening = null; throw error;});
    }
    return opening;
  }

  async function operation(name, mode, run) {
    if (!stores.includes(name)) throw Error('Unknown offline store');
    const database = await connect();
    return new Promise((resolve,reject) => {
      const tx = database.transaction(name,mode);
      const request = run(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || request.error || Error('Локальная запись прервана.'));
    });
  }

  function session() {
    try {
      const value = JSON.parse(localStorage.getItem(authKey) || 'null');
      return UUID.test(value?.user?.id ?? '') && typeof value?.access_token === 'string' ? value : null;
    } catch { return null; }
  }
  const identity = () => session()?.user.id === enrolledOwner ? enrolledOwner : null;
  async function readSnapshot(owner) {
    if (!owner || identity() !== owner) return null;
    const data = await operation('snapshots','readonly',store => store.get(owner));
    if (!data || identity() !== owner || Date.now() - data.savedAt > MAX_AGE || data.savedAt > Date.now()) return null;
    return data;
  }
  async function writeSnapshot(data) {
    if (!data?.owner || identity() !== data.owner) throw Error('Требуется вход в CRM.');
    return operation('snapshots','readwrite',store => {
      const request = store.get(data.owner);
      request.onsuccess = () => {
        if (identity() === data.owner) store.put({...data,reports:request.result?.reports ?? {}});
      };
      return request;
    });
  }
  async function saveReport(owner, report) {
    if (!await readSnapshot(owner)) throw Error('Сначала нажмите «Подготовить офлайн».');
    return operation('snapshots','readwrite',store => {
      const request = store.get(owner);
      request.onsuccess = () => {
        const data = request.result;
        if (data && identity() === owner) store.put({...data,reports:{...data.reports,[report.key]:report}});
      };
      return request;
    });
  }
  async function removeSnapshot(owner) {
    if (owner) await operation('snapshots','readwrite',store => store.delete(owner));
  }
  async function queue(owner) {
    if (!owner || owner !== identity()) return [];
    const rows = await operation('visits','readonly',store => store.index('owner').getAll(owner));
    return identity() === owner ? rows.sort((a,b) => a.queuedAt-b.queuedAt) : [];
  }
  async function enqueue(owner, visit, decisions, demo = false) {
    if (!await readSnapshot(owner) || identity() !== owner) throw Error('Обновите офлайн-данные после входа в CRM.');
    const record = {id:crypto.randomUUID(),owner,queuedAt:Date.now(),visit,decisions,state:demo?'demo':'pending'};
    await operation('visits','readwrite',store => store.add(record));
    return record;
  }
  async function settle(record, state, reason = '') {
    if (identity() !== record.owner) return;
    return operation('visits','readwrite',store => store.put({...record,state,reason}));
  }
  function synchronize(owner) {
    if (syncFlight || !owner || identity() !== owner || location.origin !== production || !navigator.onLine) return syncFlight;
    syncFlight = (async () => {
      const pending = (await queue(owner)).filter(record => record.state === 'pending');
      if (!pending.length) return;
      const auth = session();
      if (auth?.user.id !== owner) return;
      const headers = {apikey:publishableKey, authorization:'Bearer '+auth.access_token,'content-type':'application/json'};
      const result = await fetch(api+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});
      if (!result.ok || (await result.json()).id !== owner) return;
      for (const record of pending) {
        if (!navigator.onLine || identity() !== owner) break;
        const response = await fetch(api+'/rest/v1/rpc/crm_offline_save_visit_v1',{
          method:'POST',headers,signal:AbortSignal.timeout(25000),
          body:JSON.stringify({p_request_id:record.id,p_visit:record.visit,p_task_decisions:record.decisions}),
        });
        const value = await response.json();
        if (identity() !== owner) break;
        const reason = conflicts.get(value.message);
        if (response.ok && value.visit_id) await settle(record,'sent');
        else if (reason) await settle(record,'conflict',reason);
        else break;
      }
    })().catch(() => {}).finally(() => {syncFlight = null;});
    return syncFlight;
  }
  window.crmOfflineStore = Object.freeze({identity, readSnapshot, writeSnapshot, saveReport, removeSnapshot, queue, enqueue, synchronize});
})();
