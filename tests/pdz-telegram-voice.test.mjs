import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pdzVoiceText,yandexAudioBytes,MAX_VOICE_CHARS} from '../supabase/functions/crm-pdz-telegram/voice-brief.mjs';
import {shouldSendPdzSnapshot} from '../supabase/functions/crm-pdz-telegram/snapshot-revision.mjs';
const source=readFileSync(new URL('../supabase/functions/crm-pdz-telegram/index.ts',import.meta.url),'utf8');
const reportDate='2026-11-11',today='2026-11-11';
const rows=[
 {client_name:'Бобруйскстрой',manager_name:'Ачинович Екатерина',debt_overdue:9500.55,debt_overdue_days:12},
 {client_name:'Клиент Б',manager_name:'Ачинович Екатерина',debt_overdue:7200,debt_overdue_days:62}
];
const user={id:'ach',name:'Ачинович',role:'manager',access_scope:'standard'};
test('audio is a compact, personal, data-backed brief with no false cash receipt claims',()=>{
 const text=pdzVoiceText({user,binding:{},rows,previousRows:rows.map(r=>({...r,debt_overdue:r.debt_overdue+100})),reportDate,today,evidence:new Map()});
 assert.match(text,/Катюшка/);
 assert.match(text,/16\s?701/);
 assert.match(text,/снизился/);
 assert.doesNotMatch(text,/получили оплату|деньги поступили/);
 assert.ok(text.length<=MAX_VOICE_CHARS,text.length.toString());
});
test('no previous report does not fabricate a debt change',()=>{
 const text=pdzVoiceText({user,binding:{},rows:[],previousRows:null,reportDate,today,evidence:new Map()});
 assert.match(text,/Просрочка 0/);
 assert.doesNotMatch(text,/долг снизился|долг вырос/);
 assert.match(text,/Просроченных долгов/);
});
test('recognizes Telegram-compatible Ogg Opus output and rejects wav or invalid base64',()=>{
 const raw=Buffer.alloc(140);raw.write('OggS',0);raw.write('OpusHead',30);
 const encoded=raw.toString('base64');
 assert.equal(yandexAudioBytes(JSON.stringify({audioChunk:{data:encoded}})).length,140);
 assert.equal(yandexAudioBytes(JSON.stringify({result:{audioChunk:{data:encoded}}})).length,140);
 assert.throws(()=>yandexAudioBytes(JSON.stringify({audioChunk:{data:Buffer.from('RIFF'+ 'x'.repeat(130)).toString('base64')}})),/TTS_NOT_OGG_OPUS/);
 assert.throws(()=>yandexAudioBytes(JSON.stringify({audioChunk:{data:'+'}})),/TTS_BAD_BASE64/);
});
test('audio is separately deduplicated and never requires duplicate text',()=>{
 const sent={report_date:'2026-11-11',source_imported_at:'2026-11-11T08:57:43Z'};
 assert.equal(shouldSendPdzSnapshot(sent,'2026-11-11','2026-11-11T08:57:43Z'),false);
 assert.equal(shouldSendPdzSnapshot(sent,'2026-11-11','2026-11-11T11:57:43Z'),true);
 for(const part of ['pdz_daily_voice_sent:','pdz_voice_config','voicePilot','sendVoice','OGG_OPUS',
  'voiceErrors','crm_ai360_yandex_monthly_claim_v1','chooseRecipientRows','x-crm-dispatch-secret']){
  assert.ok(source.includes(part),part);
 }
 assert.match(source,/const needsText=!voicePilot&&shouldSendPdzSnapshot/);
 assert.match(source,/const needsVoice=voiceAllowed&&shouldSendPdzSnapshot/);
 assert.doesNotMatch(source,/\.from\('client_debt'\)\.(insert|upsert|update|delete)/);
 assert.doesNotMatch(source,/setWebhook\(|getUpdates\(/);
});
