/* RESANTA CRM v23.6.47 compatibility bridge -> v23.6.48 root */
(function(){'use strict';
if(window.RESANTA_TRIOVIST_MONTH_CYCLE_V23648||document.querySelector('script[data-triovist-month-cycle-v23648]'))return;
const s=document.createElement('script');
s.src='./assets/58-triovist-month-cycle-v23648.js?_='+Date.now();
s.async=false;
s.dataset.triovistMonthCycleV23648='1';
s.onerror=()=>console.warn('Triovist month cycle root v23.6.48 failed to load; base tasks remain available.');
document.head.appendChild(s);
window.RESANTA_TRIOVIST_MONTH_CYCLE_V23647=Object.freeze({version:'v23.6.47-bridge',root:'v23.6.48'});
})();