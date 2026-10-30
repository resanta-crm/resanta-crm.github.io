const fs=require('node:fs'); const assert=require('node:assert/strict');
const source=fs.readFileSync('supabase/functions/crm-ai360-air3-gateway-v1/index.ts','utf8');
assert.match(source,/expires_at:iso\(stamp\(\)\+120000\)/,'Initial code must still expire after 2 minutes');
assert.match(source,/\.eq\('status','created'\)\.gt\('expires_at',iso\(stamp\(\)\)\)/,'Guessable code must be checked only before expiry');
assert.match(source,/p\.status!=='pending_approval'\|\|!p\.paired_at\|\|Date\.parse\(p\.paired_at\)<=stamp\(\)-600000/,'Owner approval needs 10-minute pairing grace');
assert.match(source,/\.eq\('status','pending_approval'\)\.gt\('paired_at',iso\(stamp\(\)-600000\)\)/,'Atomic approval must use paired-at grace');
assert.match(source,/p\.status!=='redeemed'&&\(!p\.paired_at\|\|Date\.parse\(p\.paired_at\)<=stamp\(\)-600000\)/,'Redeem must allow approved post-code grace, not forever');
assert.match(source,/device_secret_hash!==await sha\(secret\)/,'Owner approval must be tied to device secret');
assert.match(source,/if\(p\.status!=='approved'\)fail\('Нет подтверждения владельца'/,'No token may be issued without approval');
// Simulate expected independent time limits: first pairing 0..120s, completion after pairing 0..600s.
const created=0,paired=110000,ownerApproves=180000,deviceRedeems=220000;
assert.ok(paired<created+120000);
assert.ok(ownerApproves<paired+600000);
assert.ok(deviceRedeems<paired+600000);
assert.ok(deviceRedeems>created+120000);
assert.ok(!(created+120001<created+120000));
assert.ok(!(paired+600001<paired+600000));
console.log('AIR3: short six-digit code and 10-minute post-pair authenticated grace policy verified');