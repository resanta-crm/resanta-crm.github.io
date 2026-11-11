import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../assets/'+x,import.meta.url),'utf8');
const d=read('143-resanta-ai360-unified-dialog-v1.js'),s=read('147-resanta-ai360-staff-unified-dialog-v1.js');

test('director uses existing Lera voice and budget gateway with server evidence',()=>{
 assert.match(d,/FINANCE_ENDPOINT='crm-ai360-budget-voice-v1'/);
 assert.match(d,/finance\?FINANCE_ENDPOINT:ENDPOINT/);
 assert.match(d,/data\.source!=='promotion_budget_truth_v1'/);
 assert.match(d,/data\.answer_verified!==true/);
 assert.match(d,/data\.read_only!==true/);
 assert.match(d,/crmAI360UnifiedDialogHandleV1/);
 assert.match(d,/crmEnsureFreshSessionV236166/);
 assert.match(d,/pagehide/);
 assert.doesNotMatch(d,/setInterval\(|MutationObserver/);
});
test('staff branch and MPP keep protected personal check, no foreign manager response',()=>{
 assert.match(s,/crmAI360BranchUnifiedHandleV1/);
 assert.match(s,/FINANCE_ENDPOINT='crm-ai360-budget-voice-v1'/);
 assert.match(s,/ui\.authorized/);
 assert.match(s,/unverified_budget_source/);
 assert.match(s,/foreign_manager_reply/);
 assert.match(s,/data\?\.subject_manager!==root\.crmAI360StaffIdentityV1/);
 assert.doesNotMatch(s,/setInterval\(|MutationObserver/);
});
