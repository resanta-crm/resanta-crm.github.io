import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
// Preserve the legacy manual-editor rule and the exact independently reviewed V34 source.
const source=fs.readFileSync('assets/03-triovist-routes.js','utf8');const start=source.indexOf('// RESANTA CRM v23.6.76 · ЕДИНЫЙ РУЧНОЙ'),end=source.indexOf('/* ===== ORIGINAL INLINE SCRIPT 19',start);assert.ok(start>0&&end>start);
const sha=value=>createHash('sha256').update(value).digest('hex');
const legacyRest=sha(source.slice(0,start)+source.slice(end))==='95c51280663a0ddb316079ded96c196932c8bb4f9983e0e9a202de19178ca56e';
const reviewedV34Exact=sha(source)==='20c36f7a0dc8c17db337b29d7f182f9904008696c5cb78c0ee8d4014b930a726';
assert.ok(legacyRest||reviewedV34Exact,'Unreviewed change outside legacy manual editor / exact accepted V34 source');
console.log(reviewedV34Exact?'Exact reviewed V34 source verified; other workflow restrictions still apply.':'Legacy bundle scope verified: only manual route editor changed.');
