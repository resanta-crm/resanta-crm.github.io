import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
// Only the approved manual-editor IIFE may change in this mixed legacy bundle.
const source=fs.readFileSync('assets/03-triovist-routes.js','utf8');const start=source.indexOf('// RESANTA CRM v23.6.76 · ЕДИНЫЙ РУЧНОЙ'),end=source.indexOf('/* ===== ORIGINAL INLINE SCRIPT 19',start);assert.ok(start>0&&end>start);
const rest=source.slice(0,start)+source.slice(end);assert.equal(createHash('sha256').update(rest).digest('hex'),'95c51280663a0ddb316079ded96c196932c8bb4f9983e0e9a202de19178ca56e');
console.log('Legacy bundle scope verified: only manual route editor changed.');
