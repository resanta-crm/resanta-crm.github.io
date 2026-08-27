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

/* v23.6.29 universal director GPS viewer: Yandex primary, clean OSM fallback. */
(function(){
'use strict';
if(window.RESANTA_GPS_VIEWER_UNIVERSAL_V23616)return;
function localYandexKey(){try{return String(localStorage.getItem('resanta_yandex_maps_api_key_v2358')||localStorage.getItem('resanta_yandex_maps_api_key_v2351')||'').trim()}catch(_){return''}}
function viewerUrl(id){const file=localYandexKey()?'gps-viewer-v2360.html':'gps-viewer-osm-clean-v23627.html';return './assets/'+file+'?v=23.6.29&workday='+encodeURIComponent(String(id||''))+'&_='+Date.now()}
function openUniversal(id){if(id)window.open(viewerUrl(id),'_blank','noopener')}
function install(){window.crmOpenGpsViewerV2360=openUniversal;window.v19OpenGpsWorkday=openUniversal;try{crmOpenGpsViewerV2360=openUniversal}catch(_){}try{v19OpenGpsWorkday=openUniversal}catch(_){}}
install();[250,700,1300,2200,4000].forEach(ms=>setTimeout(install,ms));
window.RESANTA_GPS_VIEWER_UNIVERSAL_V23616=Object.freeze({version:'v23.6.29',yandexPrimary:true,osmFallback:true,osmAttributionClean:true,noPerBrowserKeyRequired:true,gpsWritesUntouched:true,routesUntouched:true,visitsUntouched:true});
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

/* v23.6.24 office manager lightweight shell: payments only. */
(function loadOfficeManagerPaymentsOnlyV23624(){
'use strict';
if(window.RESANTA_OFFICE_MANAGER_PAYMENTS_ONLY_V23624||document.querySelector('script[data-office-manager-payments-v23624]'))return;
const s=document.createElement('script');s.src='./assets/39-office-manager-payments-only-v23624.js?v=23.6.24&_='+Date.now();s.async=false;s.dataset.officeManagerPaymentsV23624='1';s.onerror=()=>console.warn('Office manager payments-only shell v23.6.24 failed to load.');document.head.appendChild(s);
})();

/* v23.6.25 login isolation and autofill safety. */
(function loadLoginSafetyV23625(){
'use strict';
if(window.RESANTA_LOGIN_SAFETY_V23625||document.querySelector('script[data-login-safety-v23625]'))return;
const s=document.createElement('script');s.src='./assets/40-login-safety-v23625.js?v=23.6.25&_='+Date.now();s.async=false;s.dataset.loginSafetyV23625='1';s.onerror=()=>console.warn('Login safety v23.6.25 failed to load.');document.head.appendChild(s);
})();

/* v23.6.26 promotions director work-filter root fix. */
(function loadPromotionsWorkFilterV23626(){
'use strict';
if(window.RESANTA_PROMOTIONS_WORK_FILTER_V23626||document.querySelector('script[data-promotions-work-filter-v23626]'))return;
const s=document.createElement('script');s.src='./assets/41-promotions-work-filter-v23626.js?v=23.6.26&_='+Date.now();s.async=false;s.dataset.promotionsWorkFilterV23626='1';s.onerror=()=>console.warn('Promotions work filter v23.6.26 failed to load; existing promotions remain available.');document.head.appendChild(s);
})();

/* v23.6.27 payment registry nav root fix: wait for profile readiness. */
(function loadPaymentRegistryNavRootV23627(){
'use strict';
if(window.RESANTA_PAYMENT_REGISTRY_NAV_ROOT_V23627||document.querySelector('script[data-payment-registry-nav-root-v23627]'))return;
const s=document.createElement('script');s.src='./assets/42-payment-registry-nav-root-v23627.js?v=23.6.27&_='+Date.now();s.async=false;s.dataset.paymentRegistryNavRootV23627='1';s.onerror=()=>console.warn('Payment registry nav root fix v23.6.27 failed to load.');document.head.appendChild(s);
})();

/* v23.6.28 visit single-submit root fix: never start two save flows from double tap. */
(function loadVisitsSingleSubmitV23628(){
'use strict';
if(window.RESANTA_VISITS_SINGLE_SUBMIT_V23628||document.querySelector('script[data-visits-single-submit-v23628]'))return;
const s=document.createElement('script');s.src='./assets/43-visits-single-submit-v23628.js?v=23.6.28&_='+Date.now();s.async=false;s.dataset.visitsSingleSubmitV23628='1';s.onerror=()=>console.warn('Visits single-submit v23.6.28 failed to load; existing server duplicate protection remains active.');document.head.appendChild(s);
})();

/* v23.6.29 route visit evidence: check-in / sustained stop outranks late report GPS. */
(function loadRouteVisitEvidenceV23629(){
'use strict';
if(window.RESANTA_ROUTE_VISIT_EVIDENCE_V23629||document.querySelector('script[data-route-visit-evidence-v23629]'))return;
const s=document.createElement('script');s.src='./assets/44-route-visit-evidence-v23629.js?v=23.6.29&_='+Date.now();s.async=false;s.dataset.routeVisitEvidenceV23629='1';s.onerror=()=>console.warn('Route visit evidence v23.6.29 failed to load; existing GPS review remains available.');document.head.appendChild(s);
})();

/* v23.6.30 promotions budget single source of truth. */
(function loadPromotionsBudgetTruthV23630(){
'use strict';
if(window.RESANTA_PROMOTIONS_BUDGET_TRUTH_V23630||document.querySelector('script[data-promotions-budget-truth-v23630]'))return;
const s=document.createElement('script');s.src='./assets/45-promotions-budget-truth-v23630.js?v=23.6.30&_='+Date.now();s.async=false;s.dataset.promotionsBudgetTruthV23630='1';s.onerror=()=>console.warn('Promotions budget truth v23.6.30 failed to load; existing promotions remain available.');document.head.appendChild(s);
})();

/* v23.6.31 DFS may explicitly approve above free client budget. */
(function loadPromotionsBudgetDfsOverrideV23631(){
'use strict';
if(window.RESANTA_PROMOTIONS_BUDGET_DFS_OVERRIDE_V23631||document.querySelector('script[data-promotions-budget-dfs-override-v23631]'))return;
const s=document.createElement('script');s.src='./assets/46-promotions-budget-dfs-override-v23631.js?v=23.6.31&_='+Date.now();s.async=false;s.dataset.promotionsBudgetDfsOverrideV23631='1';s.onerror=()=>console.warn('Promotions DFS budget override v23.6.31 failed to load; budget remains protected.');document.head.appendChild(s);
})();
