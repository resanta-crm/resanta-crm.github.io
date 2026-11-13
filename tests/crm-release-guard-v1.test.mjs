import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync('index.html','utf8');
const script=readFileSync('assets/186-crm-release-guard-v1.js','utf8');
const matchVersion=/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/;

test('CRM release guard script is wired to the active index',()=>{
  assert.match(index,/assets\/186-crm-release-guard-v1\.js\?v=20261106-1/);
  assert.ok(matchVersion.test(index));
  assert.match(index,/2026-11-13-lera-professional-names-v1/);
  assert.doesNotThrow(()=>new Function(script));
});

test('new build detection is bound to the real APP_VERSION marker',()=>{
  const version=index.match(matchVersion)?.[1];
  assert.equal(version,'2026-11-13-lera-professional-names-v1');
  assert.match(script,/source\.match\(\/const\\s\+APP_VERSION/);
  assert.match(script,/cache:'no-store'/);
  assert.match(script,/crm_release_probe/);
});

test('no destructive automatic refresh or auth/storage mutation',()=>{
  assert.doesNotMatch(script,/(?:localStorage|sessionStorage)\.(?:clear|removeItem|setItem)/);
  assert.doesNotMatch(script,/\bcaches\.(?:delete|keys)/);
  assert.doesNotMatch(script,/\bdb\.(?:from|rpc)/);
  const clickLine=script.indexOf("update.addEventListener('click'");
  const redirectLine=script.indexOf('w.location.assign(');
  assert.ok(clickLine>=0&&redirectLine>clickLine);
  assert.match(script,/autoReload:false/);
});
