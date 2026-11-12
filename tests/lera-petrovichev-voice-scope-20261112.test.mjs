import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const paths=['supabase/functions/crm-voice-yandex-tts-v1/index.ts',
 'supabase/functions/crm-voice-transcribe-v1/index.ts'];
for(const path of paths){
 test(path+' enables only the verified Petrovichev user in addition to existing voice users',()=>{
  const s=readFileSync(path,'utf8');
  assert.match(s,/const isPeer=user\.id==='a24954b8-2fe1-4852-b629-d8f351e1bd36'/);
  assert.match(s,/user\.email_confirmed_at/);
  assert.match(s,/petrovichev@resanta\.ru/);
  assert.match(s,/profile\?\.access_scope==='standard'|prof\.data\?\.access_scope==='standard'/);
  assert.match(s,/region==='Все филиалы'/);
  assert.match(s,/role==='boss'/);
  assert.match(s,/name==='руководство компании'|pname==='руководство компании'/);
  assert.match(s,/\(!isOwner&&!isPeer&&!isBranch&&!isField&&!isTriovist\)/);
  assert.match(s,/auth\.getUser\(token\)/);
  assert.match(s,/select\('id,name,role,region,access_scope,email'\)/);
 });
}
test('Paid STT and TTS still claim per-user limits before upstream calls',()=>{
 const tts=readFileSync(paths[0],'utf8');
 const stt=readFileSync(paths[1],'utf8');
 assert.match(tts,/crm_ai360_yandex_monthly_claim_v1/);
 assert.match(stt,/crm_voice_claim_v1/);
 assert.match(stt,/crm_ai360_stt_claim_v2/);
 assert.ok(tts.indexOf('isPeer')<tts.indexOf("const claim="));
 assert.ok(stt.indexOf('isPeer')<stt.indexOf("const quota="));
});
