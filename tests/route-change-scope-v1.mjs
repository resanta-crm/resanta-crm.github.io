import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
// Only the approved manual-editor IIFE may change in this mixed legacy bundle.
const source=fs.readFileSync('assets/03-triovist-routes.js','utf8');const start=source.indexOf('// RESANTA CRM v23.6.76 · ЕДИНЫЙ РУЧНОЙ'),end=source.indexOf('/* ===== ORIGINAL INLINE SCRIPT 19',start);assert.ok(start>0&&end>start);
let rest=source.slice(0,start)+source.slice(end);
// Ticket 9 allows only the LPR navigation, title, and menu exception.
const lprChanges=[
 [
  "if(['nav-connect','nav-meeting-planner','nav-lpr-birthdays'].includes(x.id))return;",
  "if(['nav-connect','nav-meeting-planner'].includes(x.id))return;"
 ],
 [
  "if(tt){const active=document.querySelector('.page.active')?.id;tt.textContent=({'page-meeting-planner':'Календарь и совещания','page-lpr-birthdays':'ЛПР и дни рождения'})[active]||'Триовист / 21vek.by';}",
  "if(tt)tt.textContent=document.getElementById('page-meeting-planner')?.classList.contains('active')?'Календарь и совещания':'Триовист / 21vek.by';"
 ],
 [
  "const openLpr=p==='lpr-birthdays'&&window.crmLprV2?.role()==='triovist';if(triIsManager()&&!openLpr&&!['triovist','connect','meeting-planner'].includes(p))",
  "if(triIsManager()&&p!=='triovist'&&p!=='connect'&&p!=='meeting-planner')"
 ]
];
for(const [reviewed,original] of lprChanges)rest=rest.replace(reviewed,original);
assert.equal(createHash('sha256').update(rest).digest('hex'),'95c51280663a0ddb316079ded96c196932c8bb4f9983e0e9a202de19178ca56e');
console.log('Legacy bundle scope verified: only manual route editor changed.');
