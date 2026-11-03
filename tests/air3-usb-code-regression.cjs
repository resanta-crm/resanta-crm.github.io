'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('air3-control.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,1,'single inline controller script');
const src=scripts[0];
new vm.Script(src);
// Parse the actual source literal as JavaScript: this failed when it
// was accidentally authored /^\\\\d{6}$/ instead of /^\\d{6}$/.
const literal=src.match(/if\(!([^\n]+?)\.test\(digits\)\)/)?.[1];
assert.ok(literal,'production USB verification regex missing');
const re=vm.runInNewContext(literal);
assert.equal(re.test('004251'),true,'valid code with leading zeros must pass');
assert.equal(re.test('999999'),true);
for(const invalid of ['','12345','1234567','AIR3USB:004251','123x56'])
  assert.equal(re.test(invalid),false,'invalid code accepted: '+invalid);
assert.ok(src.includes("navigator.clipboard.writeText('AIR3USB:'+usbCode)"));
assert.ok(src.includes("'air3-usb-retry-copy').onclick"),'retry must be an actual user click');
assert.ok(src.includes("usbCodeExpiresAt=Date.parse(result.expires_at)"),'expire local temporary code');
assert.ok(src.includes("usbCode='';usbCodeExpiresAt=0"),'clear ephemeral secret');
assert.ok(src.includes("api('create')"),'must use owner-verified server pairing');
assert.ok(src.includes("button('Разрешить вход','approve')"),'must keep manual owner approval');
console.log('AIR3 USB pairing regression PASS: real six digit response, browser clipboard fallback, expiry, owner approval');
