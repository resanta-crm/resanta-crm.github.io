'use strict';

(() => {
  const store = window.crmOfflineStore;
  const app = document.getElementById('app');
  const main = document.getElementById('main-content');
  if (!store || !app || !main || !navigator.serviceWorker) return;

  // Settings, access administration and communications are deliberately kept online.
  const excluded = new Set(['users','connect','support-v1','company-viewer','negotiations']);
  const routeSections = new Set(['routes-boss','my-routes','route']);
  const readable = new Set(['boss','manager','office_manager','service_manager','payment_executor']);
  let authorized;
  let timer;
  let worker;
  let savedAt=0;
  let menuKey='';
  let cachedSources=[];

  function profile() {
    const id = currentUser?.id;
    const p = currentProfile;
    if (!id || id !== store.identity() || id !== p?.id || !readable.has(p.role) || getComputedStyle(app).display === 'none') return null;
    return {id, role:p.role, scope:p.access_scope, key:[p.role,p.region,p.access_scope].join('|')};
  }
  function pages() {
    const result = new Map();
    for (const element of app.querySelectorAll('.sidebar .nav-item[id],.bottom-nav .bn-item[id]')) {
      const key = element.id.replace(/^(nav|bn)-/,'');
      if (excluded.has(key) || element.hidden || element.disabled || element.getAttribute('aria-hidden') === 'true' ||
          getComputedStyle(element).display === 'none' || !document.getElementById('page-'+key)) continue;
      const title = element.textContent.trim().replace(/\s+/g,' ').slice(0,100);
      if (title && !result.has(key)) result.set(key,title);
    }
    return Object.fromEntries(result);
  }
  const clean = (text,max) => String(text ?? '').trim().slice(0,max);
  function snapshot(account,menu) {
    const ownRows = rows => currentProfile.role==='manager' ? rows.filter(row=>row.manager_name===currentProfile.name) : rows;
    const clients = menu.clients ? ownRows(allClients) : [];
    const tasks = menu.tasks ? ownRows(allTasks) : [];
    const routes = [...routeSections].some(key => menu[key]) ? ownRows(allRoutePlans) : [];
    const visits = menu.visits ? ownRows(allVisits) : [];
    const active = new Set(typeof canonicalActiveTasks === 'function' ? canonicalActiveTasks(tasks).map(row => row.id) : []);
    const data = {owner:account.id, role:account.role, accessScope:account.scope};
    return {
      ...data, profileKey:account.key, menu, savedAt:Date.now(),
      routes:routes.filter(row => !row.removed && !['pending','rejected'].includes(row.review_status)).slice(-800).map(row => ({
        id:String(row.id),clientId:String(row.client_id??''),name:clean(row.client_name,240),date:row.visit_date,
        address:clean(row.address,220),visited:!!(row.visited||row.linked_visit_id),
        own:store.canRecord(account.id,data) && clean(row.manager_name,240) === clean(currentProfile?.name,240)
      })).sort((a,b) => String(b.date).localeCompare(String(a.date))),
      tasks:tasks.slice(-1200).map(row => ({id:String(row.id),clientId:String(row.client_id??''),dueDate:row.due_date,
        done:row.done===true,reviewStatus:row.review_status,active:active.has(row.id),title:clean(row.title||row.text||'Задача',420)})),
      visits:visits.filter(row=>!row.is_duplicate).slice(-700).map(row=>({date:row.date,clientId:String(row.client_id??''),result:clean(row.result,150)})),
      clients:clients.slice(0,3500).map(row=>({id:String(row.id),name:clean(row.name,240),address:clean([row.city,row.address].filter(Boolean).join(', '),280)}))
    };
  }
  function activePage() {
    return app.dataset.activePage || main.querySelector(':scope > .page.active')?.id.slice(5) || 'dashboard';
  }
  async function registerWorker() {
    await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});
    const previous = await navigator.serviceWorker.getRegistration('/assets/offline/');
    if (previous && new URL(previous.scope).pathname === '/assets/offline/') {
      // The former opt-in worker remains a safe fallback until the root worker activates.
      const current = await navigator.serviceWorker.getRegistration('/');
      if (current?.active) await previous.unregister();
    }
  }
  async function save() {
    const account=profile();
    if (!account || !navigator.onLine || document.getElementById('loading-overlay')?.style.display === 'flex') return;
    if (!worker) worker=registerWorker().catch(() => {worker=null;});
    if (authorized?.id!==account.id || authorized?.key!==account.key) {
      const {data,error}=await db.auth.getUser();
      if(error||data.user?.id!==account.id||profile()?.key!==account.key||profile()?.id!==account.id)return;
      if(authorized?.id&&authorized.id!==account.id)await store.removeSnapshot(authorized.id);
      authorized=account;
      savedAt=0;
    }
    const menu=pages();
    if(!Object.keys(menu).length)return;
    const scope=JSON.stringify(menu);
    const sources=[allClients,allTasks,allRoutePlans,allVisits].flatMap(rows=>[rows,rows.length]);
    if(scope!==menuKey||Date.now()-savedAt>60000||sources.some((value,index)=>cachedSources[index]!==value)){
      await store.writeSnapshot(snapshot(account,menu));
      menuKey=scope;
      cachedSources=sources;
      savedAt=Date.now();
    }
    void store.synchronize(account.id);
    const key=activePage();
    const page=document.getElementById('page-'+key);
    const title=menu[key];
    if(!title||!page?.classList.contains('active')||key==='tasks'||key==='clients'||key==='visits'||routeSections.has(key))return;
    if(page.querySelector('[aria-busy=true],.s360-loading,.v22722-page-loading'))return;
    const content=clean(page.innerText,60000);
    if(content.length>title.length+15&&!/^(.*\n)?(?:Загружа|Не удалось загрузить)/u.test(content))
      await store.saveReport(account.id,{key,title,text:content,savedAt:Date.now()});
  }
  let writing=false,pending=false;
  function schedule(){
    if(!navigator.onLine)return;
    clearTimeout(timer);
    timer=setTimeout(async()=>{
      if(writing){pending=true;return;}
      writing=true;
      try{await save();}catch(error){console.debug('CRM offline cache:',error?.message);}
      finally{writing=false;if(pending){pending=false;schedule();}}
    },900);
  }
  function openOffline(){
    const account=profile();
    if(!account)return;
    location.replace('/assets/offline/?section='+encodeURIComponent(activePage()));
  }
  const pageObserver=new MutationObserver(schedule);
  function update(){
    pageObserver.disconnect();
    const page=document.getElementById('page-'+activePage());
    if(page)pageObserver.observe(page,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-busy']});
    schedule();
  }
  new MutationObserver(update).observe(app,{attributes:true,attributeFilter:['style','data-active-page']});
  const loader=document.getElementById('loading-overlay');
  if(loader)new MutationObserver(schedule).observe(loader,{attributes:true,attributeFilter:['style']});
  db.auth.onAuthStateChange(event=>setTimeout(()=>{
    if(event==='SIGNED_OUT'){
      if(authorized)void store.removeSnapshot(authorized.id).catch(()=>{});
      authorized=null;
      savedAt=0;
    }else if (event==='SIGNED_IN') schedule();
  },0));
  window.addEventListener('offline',openOffline);
  window.addEventListener('online',schedule);
  window.addEventListener('focus',schedule);
  update();
})();
