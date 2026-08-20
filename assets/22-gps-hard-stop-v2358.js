/* RESANTA CRM v23.6.0 · deprecated GPS hard-stop shim.
 * Navigation rescue is no longer needed: GPS is isolated and aggregated.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_HARD_STOP_V2358)return;
window.RESANTA_GPS_HARD_STOP_V2358=Object.freeze({version:'v23.6.0',deprecated:true,noGlobalNavigationHooks:true});
})();
