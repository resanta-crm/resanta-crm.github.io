/* RESANTA CRM v23.6.0 · deprecated GPS hard-stop shim.
 * Navigation rescue is no longer needed: GPS is isolated and aggregated.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_HARD_STOP_V2358)return;
window.RESANTA_GPS_HARD_STOP_V2358=Object.freeze({version:'v23.6.0',deprecated:true,noGlobalNavigationHooks:true});
})();

/* v23.6.15 no-cache bridge: visit-quality persistence + boss MPP filter.
 * This shim is already loaded with Date.now() by the GPS reliability bridge,
 * so the Visits fix reaches browsers without changing index.html or forcing a
 * full CRM cache reset.
 */
(function loadVisitsQualityMppV23615(){
'use strict';
if(window.RESANTA_VISITS_QUALITY_MPP_V23615||document.querySelector('script[data-visits-quality-mpp-v23615]'))return;
const s=document.createElement('script');
s.src='./assets/35-visits-quality-mpp-v23615.js?v=23.6.15&_='+Date.now();
s.async=false;
s.dataset.visitsQualityMppV23615='1';
s.onerror=()=>console.warn('Visits v23.6.15 failed to load; existing Visits page remains available.');
document.head.appendChild(s);
})();
