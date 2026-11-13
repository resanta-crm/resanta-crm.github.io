import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {classifyAgentQuestion} from '../supabase/functions/crm-ai360-agent-v1/conversation.mjs';
const read=p=>fs.readFileSync(p,'utf8');

test('wake word does not force a free question into CRM mode',()=>{
 for(const q of [
  'Привет, Ресанта, посоветуй интересный фильм',
  'Лера, расскажи, почему небо голубое',
  'Привет, Лера, как твое настроение'
 ])assert.equal(classifyAgentQuestion(q),'chat',q);
 for(const q of [
  'Привет, Ресанта, почему у нас упали продажи генераторов?',
  'Лера, проверь задолженность по менеджерам',
  'Сравни отгрузки Руднева за месяц'
 ])assert.equal(classifyAgentQuestion(q),'crm',q);
});

test('long utterance survives all known agent boundary caps',()=>{
 const targets=[
  ['assets/134-resanta-voice-ai360-pilot-v1.js',/trim\(\)\.slice\(0, 2400\)/],
  ['assets/144-resanta-ai360-branch-voice-v1.js',/field\.maxLength=2400/],
  ['assets/147-resanta-ai360-staff-unified-dialog-v1.js',/slice\(0,2400\)/],
  ['assets/143-resanta-ai360-unified-dialog-v1.js',/slice\(0,2400\)/],
  ['assets/210-resanta-agent360-single-entry-v1.js',/question\.length>2400/],
  ['supabase/functions/crm-ai360-agent-v1/contract.mjs',/input\.question\.length>2400/],
  ['supabase/functions/crm-ai360-agent-v1/conversation.mjs',/String\(question\)\.slice\(0,2400\)/],
  ['supabase/functions/crm-ai360-staff-dialog-v1/index.ts',/body\.question\.trim\(\)\.slice\(0,2400\)/],
  ['supabase/functions/crm-ai360-director-peer-v1/index.ts',/trim\(\)\.slice\(0, 2400\)/],
  ['supabase/functions/crm-ai360-dialog-v4/index.ts',/trim\(\)\.slice\(0, 2400\)/],
  ['supabase/functions/crm-voice-transcribe-v1/index.ts',/text\|\|''\)\.trim\(\)\.slice\(0,1200\)/],
  ['supabase/functions/crm-ai360-actions-v1/index.ts',/question\.length>2400/]
 ];
 for(const [path,pattern] of targets)assert.match(read(path),pattern,path);
 const c={window:{}};
 vm.runInNewContext(read('assets/220-lera360-turn-taking-v1.js'),c);
 const policy=c.window.crmAI360TurnTakingV1;
 assert.equal(policy.maxSegments,8);
 assert.equal(policy.merge('а'.repeat(1400),'б'.repeat(1400)).length,2400);
});

test('signed-in client and server have consistent personalized greetings',()=>{
 const agent=read('supabase/functions/crm-ai360-agent-v1/contract.mjs');
 const front=read('assets/215-lera360-personal-greeting-v1.js');
 const staff=read('assets/144-resanta-ai360-branch-voice-v1.js');
 for(const address of ['родной','Кирюшка','Санька','Катюшка','Танюшка','мой господин','моя госпожа','мой слуга']){
  assert.ok(agent.includes("'"+address+"'"),address);
  assert.ok(front.includes("address:'"+address+"'"),address);
 }
 for(const address of ['Кирюшка','Санька','Катюшка','Танюшка','мой господин','моя госпожа'])
  assert.ok(staff.includes(":'"+address+"'"),address);
 assert.match(front,/greeting:'Привет, '\+p\.address\+', чем помочь\?'/);
});

test('stale session retry cannot cross actors and happens only on 401',()=>{
 for(const path of ['assets/143-resanta-ai360-unified-dialog-v1.js',
  'assets/147-resanta-ai360-staff-unified-dialog-v1.js','assets/210-resanta-agent360-single-entry-v1.js']){
  const source=read(path);
  assert.match(source,/context\?\.status\)===401/);
  assert.match(source,/refreshSession/);
 }
});

test('release URLs are versioned consistently while data rights remain unchanged',()=>{
 const page=read('index.html'), launcher=read('assets/137-resanta-ai360-lazy-launch-v1.js');
 assert.match(page,/2026-11-13-lera-agent-stability-v2/);
 assert.equal((page.match(/leraRelease=20261113-stable-dialog2/g)||[]).length,7);
 assert.ok((launcher.match(/leraRelease=20261113-stable-dialog2/g)||[]).length>=3);
 const actions=read('assets/219-lera360-agent-actions-v1.js');
 const server=read('supabase/functions/crm-ai360-actions-v1/index.ts');
 assert.match(actions,/requires_confirmation/);
 assert.match(server,/verifyToken/);
 assert.match(server,/explicit_confirmation_required/);
});
