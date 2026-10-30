const assert = require('node:assert/strict');
const fs = require('node:fs');
const gateway = fs.readFileSync('supabase/functions/crm-ai360-air3-gateway-v1/index.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261030123300_air3_temporary_pairing_v1.sql','utf8');
const dbMaximum = Number(migration.match(/p_limit\s*>\s*(\d+)/)?.[1]);
assert.ok(dbMaximum > 0, 'Cannot determine DB rate limiter maximum');
const calls=[...gateway.matchAll(/\bawait\s+limit\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)];
assert.ok(calls.length >= 3, 'Expected rate limiting on AIR3 routes');
for (const [,bucket,requested,windowSeconds] of calls) {
 assert.ok(Number(requested) <= dbMaximum, 'AIR3 '+bucket+' requests '+requested+' but SQL accepts at most '+dbMaximum);
 assert.ok(Number(requested) >= 1);
 assert.ok(Number(windowSeconds) >= 1 && Number(windowSeconds) <= 3600);
}
assert.ok(/if\(a==='status'\|\|a==='redeem'\)/.test(gateway), 'Pairing status and redeem must remain guarded');
assert.ok(calls.some(([,bucket])=>bucket==='poll-global'), 'Polling throttling absent');
console.log('AIR3 SQL/gateway rate limit compatibility passed ('+calls.length+' buckets, SQL max '+dbMaximum+')');
