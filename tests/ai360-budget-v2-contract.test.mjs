import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=x=>fs.readFileSync(x,'utf8');
const budget=read('supabase/migrations/20261028170000_ai360_unified_budget_v2.sql');
const tts=read('supabase/migrations/20261028171000_ai360_tts_shared_budget_v2.sql');
const stt=read('supabase/migrations/20261028173000_ai360_stt_shared_budget_v2.sql');
const check=read('supabase/migrations/20261028171500_ai360_daily_limit_check_300.sql');
const v4=read('supabase/functions/crm-ai360-dialog-v4/index.ts');
const voice=read('supabase/functions/crm-voice-transcribe-v1/index.ts');
const browser=read('assets/143-resanta-ai360-unified-dialog-v1.js');
const capture=read('assets/135-resanta-voice-capture-fix-v2.js');
test('independent DB check no longer blocks calls after 20',()=>{
 assert.match(check,/calls<=300/);
 assert.match(budget,/q.calls<300/);
 assert.match(budget,/daily_dialog_limit/);
});
test('protected atomic shared RUB budget for text TTS STT',()=>{
 assert.match(budget,/pg_advisory_xact_lock/);
 assert.match(tts,/pg_advisory_xact_lock/);
 assert.match(stt,/pg_advisory_xact_lock/);
 assert.match(budget,/v_spent\+v_reserved\+v_tts\+p_reserve_rub>5000/);
 assert.match(tts,/core_rub\+current_tts\+cost>5000/);
 assert.match(stt,/v_spent\+v_reserved\+v_tts\+cost>5000/);
 for(const sql of [budget,stt]) assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(budget,/ENABLE ROW LEVEL SECURITY/);
});
test('legacy v3 and new v4 share calls, new v4 settles actual tokens',()=>{
 assert.match(budget,/CREATE OR REPLACE FUNCTION public\.crm_ai360_llm_claim_v1/);
 assert.match(budget,/public\.crm_ai360_core_claim_v2\(p_user_id,5\)/);
 assert.match(v4,/crm_ai360_core_claim_v2/);
 assert.match(v4,/crm_ai360_core_finish_v2/);
 assert.match(v4,/usage\?\.input_tokens/);
 assert.match(v4,/usage\?\.output_tokens/);
 assert.doesNotMatch(v4,/rpc\('crm_ai360_llm_claim_v1'/);
});
test('voice transcription duration billed and separate per-day cap remains',()=>{
 assert.match(voice,/crm_voice_claim_v1/);
 assert.match(voice,/crm_ai360_stt_claim_v2/);
 assert.match(voice,/speech_monthly_budget_exhausted/);
 assert.match(capture,/speech_monthly_budget_exhausted/);
});
test('clients show precise budget errors without changing rights',()=>{
 assert.match(browser,/monthly_budget_exhausted:/);
 assert.match(browser,/daily_dialog_limit:/);
 assert.match(browser,/openai_provider_rate_limit:/);
 assert.match(browser,/window\.crmAI360UnifiedDialogHandleV1/);
 assert.match(browser,/const ENDPOINT='crm-ai360-dialog-v4'/);
});
