import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/38-payment-registry-v23623.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261111094500_payment_registry_history_readonly_v1.sql',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('registry new UI is syntactically valid, keeps existing operations and correct numbers',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/function overview\(d\)/);
 assert.match(source,/function historyView\(result\)/);
 assert.match(source,/function openHistory\(id\)/);
 assert.match(source,/payment_registry_history_v1/);
 assert.match(source,/function createPayment\(submit\)/);
 assert.match(source,/payment_registry_create_v2/);
 assert.match(source,/payment_registry_decide_v1/);
 assert.match(source,/payment_registry_mark_paid_v1/);
 assert.match(source,/payment_registry_list_v2/);
 assert.match(source,/payment_registry_dashboard_v2/);
 assert.match(source,/pr-360-bar/);
 assert.match(source,/pr-rows-toggle/);
 assert.match(source,/data-history/);
 assert.match(source,/role="dialog" aria-modal="true"/);
 assert.match(source,/Отметка «Оплачено» отражает действие ответственного/);
 assert.match(index,/38-payment-registry-v23623\.js\?v=20261111-history360-1/);
});

test('history is fetched on user click only, with server-side authorization',()=>{
 const a=source.indexOf("async function openHistory(id)");
 const b=source.indexOf("function renderShell()",a);
 const fn=source.slice(a,b);
 assert.match(fn,/if\(!ctx\?\.can_view\|\|!id\)return/);
 assert.match(fn,/rpc\('payment_registry_history_v1',\{p_id:id\}\)/);
 assert.match(source,/querySelectorAll\('\[data-history\]'\)/);
 assert.match(source,/const esc=v=>/);
 assert.match(sql,/if auth\.uid\(\) is null or not public\.payment_registry_can_view\(\)/);
 assert.match(sql,/where p\.id=p_id/);
 assert.match(sql,/where a\.payment_id=p_id/);
 assert.match(sql,/where f\.payment_id=p_id/);
 assert.match(sql,/revoke all on function public\.payment_registry_history_v1\(uuid\) from public, anon/);
 assert.match(sql,/grant execute on function public\.payment_registry_history_v1\(uuid\) to authenticated, service_role/);
 assert.doesNotMatch(sql,/\b(?:update|delete|insert|truncate)\s+public\./i);
});

test('current approval, payment and document rights stay in original server RPCs',()=>{
 assert.match(source,/function localMaybeAllowed\(\)/);
 assert.match(source,/ctx\?\.can_create/);
 assert.match(source,/ctx\?\.can_approve/);
 assert.match(source,/ctx\?\.can_pay/);
 assert.match(source,/function openFile\(path\)/);
 assert.match(source,/createSignedUrl\(path,300\)/);
 assert.doesNotMatch(sql,/create\s+policy|grant\s+select\s+on/i);
});
