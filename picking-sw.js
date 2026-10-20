// Compatibility worker: old TSD pages may still register /picking-sw.js.
// Delegate to the unified v23.6.440 offline shell instead of unregistering itself.
importScripts('/tsd-sw.js?v=379');
