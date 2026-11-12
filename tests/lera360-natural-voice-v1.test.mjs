import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const director=read('assets/135-resanta-voice-capture-fix-v2.js');
const staff=read('assets/146-resanta-ai360-branch-premium-voice-v1.js');
const panel=read('assets/144-resanta-ai360-branch-voice-v1.js');
const dialog=read('assets/147-resanta-ai360-staff-unified-dialog-v1.js');
const loader=read('assets/137-resanta-ai360-lazy-launch-v1.js');
const page=read('index.html');
const accents=read('assets/218-lera360-speech-accents-v1.js');
const directorTts=read('assets/136-resanta-voice-quality-v3.js');

function literal(source,name){
 const line=source.split('\n').find(x=>x.trim().startsWith('const '+name+'='));
 assert.ok(line,'Missing '+name);
 const start=line.indexOf('=')+1;
 return vm.runInNewContext('('+line.slice(start).trim().replace(/;$/,'')+')');
}
test('Mac director and employees recognise natural Lera wake phrases',()=>{
 const directorWait=literal(director,'WAIT_RE');
 const staffWake=literal(staff,'WAKE');
 for(const phrase of ['Привет, Лера','привет лера','Лера','Лера, проверь продажи','Привет, Ресанта','Привет, Резанта']){
  assert.ok(directorWait.test(phrase)||literal(director,'LERA_RE').test(phrase),'director '+phrase);
  assert.ok(staffWake.test(phrase),'staff '+phrase);
 }
 assert.equal(directorWait.test('Привет, Саша'),false);
 assert.equal(staffWake.test('Привет, Саша'),false);
 assert.match(director,/const separated=.*partialHelloAt/);
 assert.match(director,/рисанта\|лера\)/);
});
test('staff cannot record its own pending AI or Yandex audio response',()=>{
 assert.match(staff,/const activeAudio=speaking/);
 assert.match(staff,/try\{pending=isBusy\?\.\(\)===true;\}/);
 assert.match(staff,/await waitForReply\(run\)/);
 assert.match(staff,/speaking=true/);
 assert.match(staff,/speaking=false/);
 assert.match(panel,/onBusy:\(\)=>busy\|\|root\.crmAI360BranchUnifiedIsPendingV1/);
 assert.match(dialog,/crmAI360BranchUnifiedIsPendingV1=\(\)=>pending/);
});
test('only actual local speech enters the paid recognizer when audio meter exists',()=>{
 assert.match(staff,/loud:!analyser\|\|heard/);
 assert.match(staff,/clip\.loud===false\)continue/);
 assert.match(staff,/FOLLOWUP_WINDOW_MS=120000/);
 assert.match(staff,/conversationUntil>Date\.now\(\)/);
 assert.match(staff,/loops<50/);
 assert.match(staff,/document\.hidden/);
 assert.match(staff,/root\.localStorage\?\.getItem\(key\)==='yes'/);
 assert.match(staff,/function resumeWakeIfApproved\(\)/);
 assert.match(staff,/if\(!allowed\(\)\|\|!wakePref\(\)\|\|wakeOn\|\|oneShot\)return false/);
 assert.match(panel,/resumeWakeIfApproved\?\.\(\)/);
});
test('Yandex receives spoken corrections, never modified CRM data',()=>{
 const context={window:{}};
 vm.runInNewContext(accents,context);
 const speak=context.window.crmAI360ApplySpeechAccentsV1;
 assert.equal(speak('Менеджер звонит, проверяет каталог и договор.'),'Менеджер звон+ит, проверяет катал+ог и догов+ор.');
 assert.equal(speak('ИП Звонитков и Клиент Петровичев'), 'ИП Звонитков и Клиент Петровичев');
 assert.ok(directorTts.includes("window.crmAI360ApplySpeechAccentsV1(msg)"));
 assert.ok(staff.includes("root.crmAI360ApplySpeechAccentsV1?.(segment)||segment"));
 assert.ok(page.indexOf('218-lera360-speech-accents-v1.js')<page.indexOf('137-resanta-ai360-lazy-launch-v1.js'));
});
test('publishing safely refreshes cached voice modules without changing login gates',()=>{
 assert.match(loader,/135-resanta-voice-capture-fix-v2\.js\?v=20&lera=20261112-naturalvoice/);
 for(const id of ['144-resanta-ai360-branch-voice-v1','146-resanta-ai360-branch-premium-voice-v1','147-resanta-ai360-staff-unified-dialog-v1']){
  assert.ok(page.includes(id+'.js?v='));
  assert.ok(page.includes(id+'.js?v=') && page.includes('&lera=20261112-naturalvoice'));
 }
 assert.ok(page.includes('137-resanta-ai360-lazy-launch-v1.js?v=39&lera=20261112-naturalvoice'));
 assert.match(staff,/activePanel&&!activePanel\.hidden/);
 assert.match(staff,/root\.addEventListener\('pagehide',stop\)/);
 assert.match(director,/const MIC_CONSENT_KEY/);
});
