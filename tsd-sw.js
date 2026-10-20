const CACHE='resanta-tsd-offline-v236440';
const SHELL=[
 '/tsd.html',
 '/picking.html',
 '/tsd-manifest.webmanifest',
 '/inventory-icon.svg',
 '/picking-icon.svg'
];

async function warm(){
 const cache=await caches.open(CACHE);
 await Promise.all(SHELL.map(async path=>{
  try{
   const r=await fetch(path,{cache:'reload'});
   if(r&&r.ok)await cache.put(path,r.clone())
  }catch(_){}
 }))
}
self.addEventListener('install',e=>{e.waitUntil(warm().then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{
 e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>
    (k.startsWith('resanta-tsd-offline-')||k.startsWith('resanta-tsd-hub-root-'))&&k!==CACHE
  ).map(k=>caches.delete(k)));
  await self.clients.claim()
 })())
});

function timeout(ms){return new Promise(resolve=>setTimeout(()=>resolve(null),ms))}
async function shellNetworkFirst(request,canonical){
 const cache=await caches.open(CACHE);
 const network=fetch(request,{cache:'no-store'}).then(async r=>{
  if(r&&r.ok)await cache.put(canonical,r.clone());
  return r
 }).catch(()=>null);
 const first=await Promise.race([network,timeout(2500)]);
 if(first)return first;
 const cached=await cache.match(canonical);
 if(cached){network.catch(()=>{});return cached}
 const late=await network;
 if(late)return late;
 return new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;padding:18px"><h3>Resanta Склад</h3><p>Нет связи и локальная копия ещё не сохранена. Подключите интернет один раз и откройте модуль повторно.</p></body>',
  {status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}
 )
}

self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin)return;
 if(u.searchParams.has('__probe'))return;

 if(u.pathname==='/tsd.html'){
  e.respondWith(shellNetworkFirst(e.request,'/tsd.html'));return
 }
 if(u.pathname==='/picking.html'){
  e.respondWith(shellNetworkFirst(e.request,'/picking.html'));return
 }
 if(SHELL.includes(u.pathname)){
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(async r=>{
   if(r&&r.ok){const cache=await caches.open(CACHE);await cache.put(u.pathname,r.clone())}
   return r
  }).catch(()=>caches.match(u.pathname)));
 }
});

self.addEventListener('message',e=>{
 if(e.data?.type==='RESANTA_TSD_WARM')e.waitUntil(warm())
});
