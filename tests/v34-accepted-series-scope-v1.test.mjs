// Policy controls. Local fixture is only a test input; CLI helper never reads this environment variable.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {POLICY,verifySnapshot,collectGitSnapshot,treeId} from './v34-accepted-series-scope-v1.mjs';
const reference=process.env.CRM_V34_SCOPE_FIXTURE?JSON.parse(fs.readFileSync(process.env.CRM_V34_SCOPE_FIXTURE,'utf8')):collectGitSnapshot();
const fresh=()=>structuredClone(reference);
const mutate=(s,p)=>{s.head.entries[p]={mode:'100644',oid:'f'.repeat(40)};s.head.tree=treeId(s.head.entries);return s;};
test('exact accepted product tree plus reviewed CI overlay is eligible',()=>assert.equal(verifySnapshot(fresh()).status,'EXACT_V34_SCOPE_VERIFIED'));
test('unreviewed base is rejected',()=>{const s=fresh();s.base.id='f'.repeat(40);assert.throws(()=>verifySnapshot(s));});
test('base tree cannot be substituted',()=>{const s=fresh();s.base.tree='f'.repeat(40);assert.throws(()=>verifySnapshot(s));});
test('dirty tracked worktree is rejected',()=>{const s=fresh();s.trackedDirty=true;assert.throws(()=>verifySnapshot(s));});
test('entry list cannot misrepresent head tree',()=>{const s=fresh();s.head.tree='f'.repeat(40);assert.throws(()=>verifySnapshot(s));});
for(const [label,p]of [
 ['receipt or calculation changed','assets/03-triovist-routes.js'],
 ['index/cache/loader changed','index.html'],
 ['auth/business core changed','assets/01-crm-core.js'],
 ['mobile GPS changed','assets/02-mobile-gps-base.js'],
 ['parser changed','assets/106-triovist-competitors-v236218.js'],
 ['SQL introduced','supabase/migrations/20990101_unreviewed.sql'],
 ['read-only preview guard substituted','preview-tools/guard.js'],
 ['extra public script','assets/unreviewed-v34.js'],
 ['accepted test assertion changed','tests/v34-01-falling-receipt.test.mjs'],
 ['workflow deny guard/runtime suite changed','.github/workflows/triovist-brainstorm-subgroups-v2.yml']
])test(label+' is rejected',()=>assert.throws(()=>verifySnapshot(mutate(fresh(),p))));
test('missing reviewed product file is rejected',()=>{const s=fresh();delete s.head.entries['tests/v34-01-receipt-lifecycle.test.mjs'];s.head.tree=treeId(s.head.entries);assert.throws(()=>verifySnapshot(s));});
test('product mode cannot be changed to symlink',()=>{const s=fresh();s.head.entries['assets/03-triovist-routes.js'].mode='120000';s.head.tree=treeId(s.head.entries);assert.throws(()=>verifySnapshot(s));});
test('legacy branch-name escape does not influence eligibility',()=>{const previous=process.env.GITHUB_HEAD_REF;try{process.env.GITHUB_HEAD_REF='fix/manager-feedback-20261106';assert.throws(()=>verifySnapshot(mutate(fresh(),'assets/01-crm-core.js')));}finally{if(previous===undefined)delete process.env.GITHUB_HEAD_REF;else process.env.GITHUB_HEAD_REF=previous;}});
