'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function expression(file,name){
 const source=fs.readFileSync(file,'utf8');
 const line=source.split('\n').find(x=>x.trim().startsWith('const '+name+'=')||x.trim().startsWith('const '+name+' ='));
 assert.ok(line, name+' must exist in '+file);
 return vm.runInNewContext(line.trim().replace(/^const\s+\w+\s*=\s*/, '').replace(/;\s*$/, ''));
}
const desktop='assets/135-resanta-voice-capture-fix-v2.js';
const legacy='assets/134-resanta-voice-ai360-pilot-v1.js';
const staff='assets/146-resanta-ai360-branch-premium-voice-v1.js';
test('all existing voice handlers accept natural Russian Lera and Resanta wake words',()=>{
 const desktopWake=expression(desktop,'WAIT_RE');
 const staffWake=expression(staff,'WAKE');
 const legacyWake=expression(legacy,'WAKE');
 for(const spoken of ['Привет, Лера','Привет Лера','Привет, Ресанта','Привет Ресанта']){
   assert.ok(desktopWake.test(spoken),'director transcription: '+spoken);
   assert.ok(staffWake.test(spoken),'staff transcription: '+spoken);
   assert.ok(legacyWake.test(spoken),'fallback recognition: '+spoken);
 }
 for(const spoken of ['Привет, Лера, сколько продал клиент?','Привет, Ресанта, какие задачи?']){
   assert.ok(desktopWake.test(spoken));
   assert.ok(staffWake.test(spoken));
 }
 for(const spoken of ['Привет, коллеги','Сегодня говорим о Лере','Привет, Марина']){
   assert.equal(desktopWake.test(spoken),false);
   assert.equal(staffWake.test(spoken),false);
 }
 assert.ok(expression(desktop,'LERA_RE').test('Лера, какой маршрут?'));
 assert.ok(staffWake.test('Лера, какой маршрут?'));
});
test('staff speech pauses remain long enough for ordinary questions',()=>{
 const code=fs.readFileSync(staff,'utf8');
 assert.match(code,/Date\.now\(\)-lastLoud>1900/);
 assert.doesNotMatch(code,/Date\.now\(\)-lastLoud>1250/);
});
test('voice remains opt-in and foreground-only: no silent login microphone',()=>{
 const director=fs.readFileSync(desktop,'utf8');
 const employee=fs.readFileSync(staff,'utf8');
 assert.match(director,/MIC_CONSENT_KEY/);
 assert.match(director,/visiblePanel\(\)/);
 assert.match(employee,/!document\.hidden/);
 assert.match(employee,/function toggleWake\(\)/);
});
