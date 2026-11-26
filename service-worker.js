'use strict';

// Only the public offline renderer is cached. CRM login, API requests,
// authenticated pages and the other installed tools keep their network behavior.
const cacheName = 'resanta-crm-navigation-offline-v5';
const offlineUrl = '/assets/offline/index.html';
const shell = [offlineUrl, '/assets/offline/crm-offline-store-v1.js',
  '/assets/offline/crm-offline-screen-v1.js', '/assets/offline/crm-offline-v1.css',
  '/assets/offline/crm-visit-sku-fields-v1.js', '/assets/offline/crm-visit-sku-fields-v1.css',
  '/assets/offline/crm-offline-report-v1.js'];

self.addEventListener('install', event => event.waitUntil((async () => {
  await (await caches.open(cacheName)).addAll(shell);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith('resanta-crm-navigation-offline-') && key !== cacheName) await caches.delete(key);
  }
})()));
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const crmHome = (url.pathname === '/' || url.pathname === '/index.html') &&
    [...url.searchParams.keys()].every(key => key === 'crm-online' || key === 'section');
  const offlinePage = url.pathname === '/assets/offline/' || url.pathname === offlineUrl;
  if (request.mode === 'navigate' && crmHome) {
    event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match(offlineUrl)));
  } else if (offlinePage && request.mode === 'navigate') {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(offlineUrl)) || fetch(request))());
  } else if (shell.includes(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(url.pathname)) || fetch(request))());
  }
});
