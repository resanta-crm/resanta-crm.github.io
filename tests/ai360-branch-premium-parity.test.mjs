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
test('The same OpenAI tool core is reauthorized by server role and personal JWT',()=>{
 for(const literal of [
  "const permission=staffPermission(userId,prof.data)",
  "['branch_director','field_manager'].includes(permission.tier)",
  "permission.tier==='field_manager'?[permission.name]:NAMES",
  "if(!domains.includes(domain))",
  "if(selected&&!permitted.some",
  "manager:permission.tier==='field_manager'?permission.name",
  "headers:{'Authorization':'Bearer '+token,'apikey':anon",
  "evidence.answer_verified!==true",
  "evidence.read_only!==true",
  "evidence.scope?.role!==permission.tier",
  "evidence.scope.managers.some(x=>!permitted.includes(x))",
  "error:'manager_outside_own_portfolio'"
 ])assert.ok(staffDialog.includes(literal),literal);
 assert.doesNotMatch(staffDialog,/\\.from\\('tasks'\\)\\.insert|\\.from\\('clients'\\)\\.select/);
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
test('Today route summary is computed from all scoped rows, not six preview rows',()=>{
 assert.match(staffRead,/head:true,count:'exact'/);
 assert.match(staffRead,/route_summary:\{date,total_routes:total,confirmed_routes:confirmed/);
 assert.match(staffRead,/visited_routes:visited/);
 assert.match(staffRead,/total-visited/);
 assert.match(voice,/if\(domain==='routes'&&data.route_summary\)/);
 assert.match(voice,/Всего точек/);
 assert.match(voice,/без отметки посещения/);
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
 assert.ok(page.includes('144-resanta-ai360-branch-voice-v1.js?v=8'));
 assert.ok(page.includes('145-resanta-ai360-branch-task-approval-v1.js?v=2'));
 assert.ok(page.includes('146-resanta-ai360-branch-premium-voice-v1.js?v=3'));
 assert.ok(page.includes('147-resanta-ai360-staff-unified-dialog-v1.js?v=3'));
 assert.ok(page.includes('137-resanta-ai360-lazy-launch-v1.js?v=35'));
 assert.match(voice,/crmAI360BranchUnifiedHandleV1\?\.\(q/);
 assert.match(voice,/crmAI360BranchTaskHandleV1\?\.\(question\)/);
 assert.match(bridge,/mode!=='staff_ai360_shared_core_v1'/);
});
