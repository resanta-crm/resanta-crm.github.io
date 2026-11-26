'use strict';

const cacheName = 'resanta-crm-scoped-offline-v3';
const scope = new URL(self.registration.scope);
const shell = [
  'index.html','crm-offline-store-v1.js','crm-offline-screen-v1.js','crm-offline-v1.css',
  'crm-visit-sku-fields-v1.js','crm-visit-sku-fields-v1.css','crm-offline-report-v1.js',
].map(path => new URL(path,scope).href);

self.addEventListener('install',event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  await cache.addAll(shell);
  await self.skipWaiting();
})()));

self.addEventListener('activate',event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (name.startsWith('resanta-crm-scoped-offline-') && name !== cacheName) await caches.delete(name);
  }
  await self.clients.claim();
})()));

self.addEventListener('fetch',event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL('index.html',scope).pathname)) {
    event.respondWith(caches.match(shell[0]).then(hit => hit || fetch(request)));
  } else if (shell.includes(url.href)) {
    event.respondWith(caches.match(url.href).then(hit => hit || fetch(request)));
  }
});
