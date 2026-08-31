/* RESANTA CRM v23.6.14 compatibility no-op.
 * v23.6.13 shell guard is retired because v23.6.14 keeps its root shell
 * outside #page-triovist and no longer needs legacy display protection.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_SHELL_GUARD_V23613)return;
window.RESANTA_TRIOVIST_SHELL_GUARD_V23613=Object.freeze({version:'v23.6.14',retired:true,root:'v23.6.14'});
})();

/* v23.6.35 bridge: keep boss month tabs synchronized with lightweight manual routes. */
(function(){
'use strict';
if(window.RESANTA_ROUTE_MONTH_TABS_SYNC_V23635||document.querySelector('script[data-route-month-tabs-sync-v23635]'))return;
const s=document.createElement('script');
s.src='./assets/49-route-month-tabs-sync-v23635.js?v=23.6.35&_='+Date.now();
s.async=false;
s.dataset.routeMonthTabsSyncV23635='1';
s.onerror=()=>console.warn('Route month tab sync v23.6.35 failed to load; manual route data remains untouched.');
document.head.appendChild(s);
})();
