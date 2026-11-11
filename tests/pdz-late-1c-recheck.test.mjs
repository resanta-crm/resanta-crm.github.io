import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldSendPdzSnapshot,correctionPrefix} from '../supabase/functions/crm-pdz-telegram/snapshot-revision.mjs';
const src=readFileSync(new URL('../supabase/functions/crm-pdz-telegram/index.ts',import.meta.url),'utf8');
test('late 1C import after 11:00 produces one correction, not every half-hour',()=>{
 const sent={report_date:'2026-11-10',sent_at:'2026-11-11T08:00:09Z'};
 assert.equal(shouldSendPdzSnapshot(sent,'2026-11-11','2026-11-11T08:57:43Z'),true);
 const updated={report_date:'2026-11-11',source_imported_at:'2026-11-11T08:57:43Z'};
 assert.equal(shouldSendPdzSnapshot(updated,'2026-11-11','2026-11-11T08:57:43Z'),false);
 assert.equal(shouldSendPdzSnapshot(updated,'2026-11-11','2026-11-11T09:15:00Z'),true);
 assert.equal(shouldSendPdzSnapshot(updated,'2026-11-10','2026-11-11T09:15:00Z'),false);
 assert.equal(shouldSendPdzSnapshot(null,'2026-11-11','2026-11-11T08:57:43Z'),true);
 assert.equal(shouldSendPdzSnapshot({},'2026-11-11','2026-11-11T08:57:43Z'),false);
 assert.equal(shouldSendPdzSnapshot({report_date:'2026-11-11'},'2026-11-11','2026-11-11T09:15:00Z'),false);
});
test('correction openly distinguishes change in debt from actual cash receipt',()=>{
 assert.match(correctionPrefix({report_date:'2026-11-10'}),/после нового отчёта 1С/);
 assert.match(correctionPrefix({report_date:'2026-11-10'}),/не подтверждает поступление оплаты/);
 assert.equal(correctionPrefix(null),'');
});
test('existing secret, dedup, roles, PDZ group, legal actions and callbacks survive',()=>{
 for(const needle of ['x-crm-dispatch-secret','pdz_daily_sent:','pdz_daily_group_sent:','chooseRecipientRows','verifiedComments','pdz_legal_actions','crm_telegram_bindings','shouldSendPdzSnapshot','source_imported_at'])assert.ok(src.includes(needle),needle);
 assert.match(src,/\.order\('imported_at',\{ascending:false\}\)/);
 assert.doesNotMatch(src,/\.from\('client_debt'\)\.(insert|upsert|update|delete)/);
 assert.doesNotMatch(src,/\.from\('cash_receipts_1c'\)\.(insert|upsert|update|delete)/);
});
