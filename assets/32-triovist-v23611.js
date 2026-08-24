/* RESANTA CRM v23.6.14 compatibility loader.
 * The former v23.6.12 workspace is intentionally retired: it fought with
 * legacy Triovist renders. This file remains only because the permanent
 * no-cache bootstrap already points here.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_ROOT_V23614||document.querySelector('script[data-triovist-root-v23614]')){
  window.RESANTA_TRIOVIST_SINGLE_V23612=window.RESANTA_TRIOVIST_SINGLE_V23612||Object.freeze({version:'v23.6.14',retired:true,delegatesTo:'v23.6.14'});
  return;
}
window.RESANTA_TRIOVIST_SINGLE_V23612=Object.freeze({version:'v23.6.14',retired:true,delegatesTo:'v23.6.14'});
const s=document.createElement('script');
s.src='./assets/34-triovist-root-v23614.js?v=23.6.14&_='+Date.now();
s.async=false;
s.dataset.triovistRootV23614='1';
s.onerror=()=>console.error('Triovist ROOT v23.6.14 failed to load; base Triovist remains available.');
document.head.appendChild(s);
})();
