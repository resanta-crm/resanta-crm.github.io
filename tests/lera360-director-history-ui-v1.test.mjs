import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
test('director history button is opt-in and new script runs before lazy voice',()=>{
 const page=read('index.html');
 const index=page.indexOf('217-lera360-history-v1.js?v=1');
 const lazy=page.indexOf('137-resanta-ai360-lazy-launch-v1.js?v=40');
 assert(index>0&&lazy>index);
 assert.match(page,/144-resanta-ai360-branch-voice-v1\.js\?v=10/);
 const load=read('assets/137-resanta-ai360-lazy-launch-v1.js');
 assert.match(load,/134-resanta-voice-ai360-pilot-v1.js\?v=21/);
 assert.match(load,/143-resanta-ai360-unified-dialog-v1.js\?v=11/);
});
test('existing mark-error form can save to user-owned turn without writing CRM',()=>{
 const panel=read('assets/134-resanta-voice-ai360-pilot-v1.js');
 assert.match(panel,/window\.crmAI360HistoryV1\?\.attachPanel\(root\)/);
 assert.match(panel,/rva-feedback-save/);
 assert.match(panel,/window\.crmAI360HistoryV1\?\.submitFeedback/);
 assert.match(panel,/turnId:feedbackTarget\.turnId/);
 assert.match(panel,/«Копировать» ничего не отправляет/);
 const client=read('assets/143-resanta-ai360-unified-dialog-v1.js');
 assert.match(client,/window\.crmAI360LastHistoryTurnId=data\.history_turn_id/);
 assert.match(client,/window\.crmAI360LastHistoryTurnId=null/);
 assert.match(client,/const ENDPOINT='crm-ai360-agent-v1'/);
});
test('no stored speech/audio and all private history controls are explicit clicks',()=>{
 const widget=read('assets/217-lera360-history-v1.js');
 assert.match(widget,/history:status|history:list/);
 assert.match(widget,/history:enable/);
 assert.match(widget,/history:clear/);
 assert.match(widget,/history:feedback/);
 assert.match(widget,/audio/);
 assert.match(widget,/textContent/);
 assert.doesNotMatch(widget,/\.from\(|MediaRecorder|speechSynthesis|innerHTML\s*=\s*[^'"]/);
 assert.match(widget,/root\.confirm/);
});
test('no changes to staff panels, manager scopes or CRM data access',()=>{
 const file=read('assets/144-resanta-ai360-branch-voice-v1.js');
 assert.doesNotMatch(file,/crmAI360HistoryV1\?\.attachPanel/);
 const voice=read('assets/134-resanta-voice-ai360-pilot-v1.js');
 assert.doesNotMatch(voice,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
