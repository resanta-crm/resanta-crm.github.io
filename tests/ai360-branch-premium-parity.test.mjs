import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const get=p=>fs.readFileSync(p,'utf8');
const stt=get('supabase/functions/crm-voice-transcribe-v1/index.ts');
const tts=get('supabase/functions/crm-voice-yandex-tts-v1/index.ts');
const ownerCore=get('supabase/functions/crm-ai360-dialog-v4/core.mjs');
const staffCore=get('supabase/functions/crm-ai360-staff-dialog-v1/core.mjs');
const staffDialog=get('supabase/functions/crm-ai360-staff-dialog-v1/index.ts');
const staffRead=get('supabase/functions/crm-ai360-staff-read-v1/index.ts');
const voice=get('assets/144-resanta-ai360-branch-voice-v1.js');
const premium=get('assets/146-resanta-ai360-branch-premium-voice-v1.js');
const bridge=get('assets/147-resanta-ai360-staff-unified-dialog-v1.js');
const page=get('index.html');
test('Same OpenAI and Yandex provider code allows ONLY original director and exact Sidarovich UUID/profile',()=>{
 for(const s of [stt,tts]){
  assert.match(s,/user\.id==='544fb1e2-ef70-44de-bc62-e0e1596a4bfc'/);
  assert.match(s,/user\.id==='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'/);
  assert.match(s,/pname==='александр паюшин'|name==='александр паюшин'/);
  assert.match(s,/сидарович к\.н\./);
  assert.match(s,/region==='Витебск'/);
  assert.match(s,/!isOwner&&!isBranch/);
 }
 assert.match(stt,/crm_voice_claim_v1/);
 assert.match(stt,/crm_ai360_stt_claim_v2/);
 assert.match(tts,/crm_ai360_yandex_monthly_claim_v1/);
 assert.match(tts,/VOICES = new Set\(\['lera','dasha'\]\)/);
});
test('Exactly the owner tool-orchestration module is shared with the branch',()=>{
 assert.equal(staffCore,ownerCore);
 assert.match(staffDialog,/runToolCore,CORE_MODEL/);
 assert.match(staffDialog,/crm_ai360_core_claim_v2/);
 assert.match(staffDialog,/crm_ai360_core_finish_v2/);
 assert.match(staffDialog,/https:\/\/api\.openai\.com\/v1\/responses/);
 assert.match(staffDialog,/crm-ai360-staff-read-v1/);
});
test('Any OpenAI tool call is reauthorized with caller JWT by staff scope before model evidence',()=>{
 for(const literal of [
  "logged?.data?.user?.id!==SID",
  "prof.data?.role!=='boss'",
  "prof.data?.region!=='Витебск'",
  "if(!DOMAINS.includes(domain))",
  "if(selected&&!NAMES.some",
  "kind:'read',domain,manager:subject||selected||null",
  "headers:{'Authorization':'Bearer '+token,'apikey':anon",
  "evidence.answer_verified!==true",
  "evidence.read_only!==true",
  "evidence.scope?.role!=='branch_director'",
  "evidence.scope.managers.some(x=>!NAMES.includes(x))"
 ])assert.ok(staffDialog.includes(literal),literal);
 assert.doesNotMatch(staffDialog,/\.from\('tasks'\)\.insert|\.from\('clients'\)\.select/);
 assert.ok(!staffDialog.includes("tasks').insert"));
});
test('Today routes are truly SQL-filtered to Minsk current date, not tomorrow',()=>{
 assert.match(staffRead,/date&&table==='route_plans'/);
 assert.match(staffRead,/\.eq\('visit_date',date\)/);
 assert.match(staffRead,/body.when==='today'\?day:null/);
 assert.match(voice,/when:\/\\bсегодня\\b/);
 assert.match(voice,/\['шкур','Шкуран'\]/);
 assert.match(voice,/manager_brief/);
});
test('Branch premium speech cannot fall back to robotic browser voice',()=>{
 assert.match(voice,/crmAI360BranchPremiumVoiceV1\?\.speak/);
 assert.match(voice,/crmAI360BranchPremiumVoiceV1\.listen/);
 assert.doesNotMatch(voice,/new root\.SpeechSynthesisUtterance/);
 assert.match(premium,/crm-voice-transcribe-v1/);
 assert.match(premium,/crm-voice-yandex-tts-v1/);
 assert.match(premium,/getUserMedia/);
 assert.match(premium,/MediaRecorder/);
 assert.match(premium,/getByteTimeDomainData/);
 assert.match(premium,/duration:Math.min\(16.4/);
 assert.match(premium,/document.hidden\)stop\(\)/);
 assert.match(premium,/pagehide',stop/);
 assert.match(premium,/voice='lera'/);
 assert.match(premium,/next!=='lera'&&next!=='dasha'/);
});
test('No background requests on initialization; no user switch to owner data',()=>{
 let calls=0;
 const root={addEventListener(){},setInterval(){},speechSynthesis:null};
 const ctx={window:root,navigator:{userAgent:'Macintosh'},
   document:{addEventListener(){},hidden:false},db:{functions:{invoke(){calls++;}}},
   currentUser:{id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc'},
   currentProfile:{role:'boss',name:'Александр Паюшин',region:'Витебск'},
   console,Intl,Date,Promise};
 vm.runInNewContext(premium,ctx);
 vm.runInNewContext(bridge,ctx);
 assert.equal(calls,0);
 assert.equal(root.crmAI360BranchUnifiedHandleV1('Что обсудить с Рудневым?',{}),false);
 assert.equal(calls,0);
});
test('Deploy includes the right versioned modules and keeps owner launcher',()=>{
 assert.ok(page.includes('144-resanta-ai360-branch-voice-v1.js?v=6'));
 assert.ok(page.includes('145-resanta-ai360-branch-task-approval-v1.js?v=2'));
 assert.ok(page.includes('146-resanta-ai360-branch-premium-voice-v1.js?v=1'));
 assert.ok(page.includes('147-resanta-ai360-staff-unified-dialog-v1.js?v=1'));
 assert.ok(page.includes('137-resanta-ai360-lazy-launch-v1.js?v=35'));
 assert.match(voice,/crmAI360BranchUnifiedHandleV1\?\.\(q/);
 assert.match(voice,/crmAI360BranchTaskHandleV1\?\.\(question\)/);
 assert.match(bridge,/mode!=='staff_ai360_shared_core_v1'/);
});
