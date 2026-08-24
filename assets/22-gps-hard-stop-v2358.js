/* RESANTA CRM v23.6.0 · deprecated GPS hard-stop shim.
 * Navigation rescue is no longer needed: GPS is isolated and aggregated.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_HARD_STOP_V2358)return;
window.RESANTA_GPS_HARD_STOP_V2358=Object.freeze({version:'v23.6.0',deprecated:true,noGlobalNavigationHooks:true});
})();

/* v23.6.15 no-cache bridge: visit-quality persistence + boss MPP filter. */
(function loadVisitsQualityMppV23615(){
'use strict';
if(window.RESANTA_VISITS_QUALITY_MPP_V23615||document.querySelector('script[data-visits-quality-mpp-v23615]'))return;
const s=document.createElement('script');s.src='./assets/35-visits-quality-mpp-v23615.js?v=23.6.15&_='+Date.now();s.async=false;s.dataset.visitsQualityMppV23615='1';s.onerror=()=>console.warn('Visits v23.6.15 failed to load; existing Visits page remains available.');document.head.appendChild(s);
})();

/* v23.6.16 universal director GPS viewer. */
(function(){
'use strict';
if(window.RESANTA_GPS_VIEWER_UNIVERSAL_V23616)return;
function localYandexKey(){try{return String(localStorage.getItem('resanta_yandex_maps_api_key_v2358')||localStorage.getItem('resanta_yandex_maps_api_key_v2351')||'').trim()}catch(_){return''}}
function viewerUrl(id){const file=localYandexKey()?'gps-viewer-v2360.html':'gps-viewer-osm-v23616.html';return './assets/'+file+'?v=23.6.16&workday='+encodeURIComponent(String(id||''))+'&_='+Date.now()}
function openUniversal(id){if(id)window.open(viewerUrl(id),'_blank','noopener')}
function install(){window.crmOpenGpsViewerV2360=openUniversal;window.v19OpenGpsWorkday=openUniversal;try{crmOpenGpsViewerV2360=openUniversal}catch(_){}try{v19OpenGpsWorkday=openUniversal}catch(_){}}
install();[250,700,1300,2200,4000].forEach(ms=>setTimeout(install,ms));
window.RESANTA_GPS_VIEWER_UNIVERSAL_V23616=Object.freeze({version:'v23.6.16',yandexPrimary:true,osmFallback:true,noPerBrowserKeyRequired:true,gpsWritesUntouched:true,routesUntouched:true,visitsUntouched:true});
})();

/* v23.6.20 warehouse control. */
(function loadWarehouseControlV23620(){
'use strict';
if(window.RESANTA_WAREHOUSE_CONTROL_V23620||document.querySelector('script[data-warehouse-control-v23620]'))return;
const s=document.createElement('script');s.src='./assets/36-warehouse-control-v23620.js?v=23.6.20&_='+Date.now();s.async=false;s.dataset.warehouseControlV23620='1';s.onerror=()=>console.warn('Warehouse control v23.6.20 failed to load; existing CRM remains available.');document.head.appendChild(s);
})();

/* v23.6.22 warehouse weekly layer, event-driven (no polling/observer). */
(function loadWarehouseWeeklyV23622(){
'use strict';
if(window.RESANTA_WAREHOUSE_WEEKLY_V23622||document.querySelector('script[data-warehouse-weekly-v23622]'))return;
const s=document.createElement('script');s.src='./assets/37-warehouse-weekly-v23621.js?v=23.6.22&_='+Date.now();s.async=false;s.dataset.warehouseWeeklyV23622='1';s.onerror=()=>console.warn('Warehouse weekly v23.6.22 failed to load; base warehouse screen remains available.');document.head.appendChild(s);
})();

/* v23.6.23 cashless payment registry. Lazy business module: no polling. */
(function loadPaymentRegistryV23623(){
'use strict';
if(window.RESANTA_PAYMENT_REGISTRY_V23623||document.querySelector('script[data-payment-registry-v23623]'))return;
const s=document.createElement('script');s.src='./assets/38-payment-registry-v23623.js?v=23.6.23&_='+Date.now();s.async=false;s.dataset.paymentRegistryV23623='1';s.onerror=()=>console.warn('Payment registry v23.6.23 failed to load; existing CRM remains available.');document.head.appendChild(s);
})();
