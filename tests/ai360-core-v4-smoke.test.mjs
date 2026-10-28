import test from 'node:test';
import assert from 'node:assert/strict';
import { runToolCore, parseModelPair, readToolDefinition, CORE_LIMITS } from '../supabase/functions/crm-ai360-dialog-v4/core.mjs';

const call = (id, domain, manager = null, month = null) => ({
  type: 'function_call', name: 'crm_read', call_id: id,
  arguments: JSON.stringify({ domain, manager, month })
});
const final = (brief = 'Подтверждено') => ({
  output: [{ type: 'message', content: [{ type: 'output_text',
    text: JSON.stringify({ brief, detail: 'Детали из CRM', offer: 'Показать ещё?' }) }] }]
});

test('strict tool only offers enumerated domains', () => {
  const tool = readToolDefinition(['tasks', 'sales']);
  assert.deepEqual(tool.parameters.properties.domain.enum, ['tasks', 'sales']);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.equal(tool.strict, true);
});

test('two sequential CRM reads feed the model before final answer', async () => {
  const reads = [], payloads = [];
  const outputs = [
    { output: [call('c1', 'tasks', 'Руднев')] },
    { output: [call('c2', 'sales', 'Руднев')] },
    final()
  ];
  const out = await runToolCore({
    question: 'Что у Руднева с задачами и продажами?', domains: ['tasks', 'sales'],
    history: [], memory: {},
    readTool: async args => { reads.push(args); return { domain: args.domain, source: 'CRM', rows: [1] }; },
    request: async payload => { payloads.push(structuredClone(payload)); return outputs.shift(); }
  });
  assert.equal(out.error, null);
  assert.deepEqual(out.used, ['tasks/Руднев/', 'sales/Руднев/']);
  assert.equal(reads.length, 2);
  assert.equal(payloads.length, 3);
  assert.equal(payloads[2].input.filter(x => x.type === 'function_call_output').length, 2);
  assert.equal(out.pair.brief, 'Подтверждено');
  assert.equal(payloads[0].store, false);
});

test('unlisted domain is never passed to CRM', async () => {
  let executions = 0;
  const outputs = [{ output: [call('c1', 'secret_table')] }, final('Недоступно')];
  const out = await runToolCore({
    question: 'Покажи скрытые данные', domains: ['tasks'],
    readTool: async () => { executions++; return { rows: [] }; },
    request: async () => outputs.shift()
  });
  assert.equal(executions, 0);
  assert.equal(out.error, 'model_missing_tools');
});

test('repeated domain read happens once', async () => {
  let executions = 0;
  const outputs = [{ output: [call('c1', 'tasks')] }, { output: [call('c2', 'tasks')] }, final()];
  const out = await runToolCore({
    question: 'Задачи', domains: ['tasks'],
    readTool: async () => { executions++; return { rows: [] }; },
    request: async () => outputs.shift()
  });
  assert.equal(executions, 1);
  assert.equal(out.used.length, 1);
});

test('model cannot give an unverified answer without any CRM read', async () => {
  const out = await runToolCore({
    question: 'Сколько задач?', domains: ['tasks'],
    readTool: async () => { throw new Error('unexpected'); },
    request: async () => final('Вымышленный ответ')
  });
  assert.equal(out.pair, null);
  assert.equal(out.error, 'model_missing_tools');
});

test('read failure is returned as evidence, not exposed as a secret', async () => {
  const outputs = [{ output: [call('c1', 'tasks')] }, final()];
  const out = await runToolCore({
    question: 'Задачи', domains: ['tasks'],
    readTool: async () => { throw new Error('PRIVATE DATABASE DETAIL'); },
    request: async payload => {
      if (outputs.length === 1) {
        assert.ok(JSON.stringify(payload.input).includes('source_unavailable'));
        assert.ok(!JSON.stringify(payload.input).includes('PRIVATE DATABASE DETAIL'));
      }
      return outputs.shift();
    }
  });
  assert.equal(out.error, null);
  assert.equal(CORE_LIMITS.maxTools, 4);
});

test('structured answer parser rejects malformed JSON', () => {
  assert.equal(parseModelPair({ output: [] }), null);
  assert.equal(parseModelPair({ output: [{ type: 'message', content: [
    { type: 'output_text', text: '{"brief":"x"}' }
  ] }] }), null);
});

import { taskScope, readTasks } from '../supabase/functions/crm-ai360-dialog-v4/task-read.mjs';

test('today follow-up retains the prior date scope', () => {
  assert.equal(taskScope('Какие сегодня задачи у Руднева?', []), 'today');
  assert.equal(taskScope('А у Шкурана?', [{ text: 'Какие сегодня задачи у Руднева?' }]), 'today');
  assert.equal(taskScope('Просроченные задачи', []), 'overdue');
  assert.equal(taskScope('Покажи открытые задачи', []), 'open');
});

test('today tasks use due_date, not created_at, and report complete count', async () => {
  const calls = [];
  const rows = Array.from({ length: 6 }, (_, i) => ({
    title: 'Тестовое поручение ' + (i + 1), manager_name: 'Руднев',
    due_date: '2026-10-28', priority: 'high', review_status: 'approved'
  }));
  const builder = {
    select(cols, opts) { calls.push(['select', cols, opts]); return this; },
    eq(k, v) { calls.push(['eq', k, v]); return this; },
    lt(k, v) { calls.push(['lt', k, v]); return this; },
    order(k, opts) { calls.push(['order', k, opts]); return this; },
    async limit(n) { calls.push(['limit', n]); return { data: rows, count: 6, error: null }; }
  };
  const out = await readTasks({ from: name => { calls.push(['from', name]); return builder; } },
    'Руднев', 'Какие задачи у Руднева сегодня?', [], '2026-10-28');
  assert.ok(calls.some(x => x[0] === 'eq' && x[1] === 'due_date' && x[2] === '2026-10-28'));
  assert.ok(calls.some(x => x[0] === 'eq' && x[1] === 'review_status' && x[2] === 'approved'));
  assert.ok(calls.some(x => x[0] === 'eq' && x[1] === 'done' && x[2] === false));
  assert.ok(calls.some(x => x[0] === 'eq' && x[1] === 'manager_name' && x[2] === 'Руднев'));
  assert.ok(calls.some(x => x[0] === 'order' && x[1] === 'due_date'));
  assert.ok(!calls.some(x => x[0] === 'order' && x[1] === 'created_at'));
  assert.equal(out.total_matching, 6);
  assert.equal(out.returned, 6);
  assert.equal(out.partial, false);
});

test('task reader does not claim that a capped sample is the whole result', async () => {
  const builder = {
    select() { return this; }, eq() { return this; }, lt() { return this; },
    order() { return this; },
    async limit() { return { data: [{ title: 'Тест' }], count: 27, error: null }; }
  };
  const out = await readTasks({ from: () => builder }, null, 'Покажи все', [], '2026-10-28');
  assert.equal(out.total_matching, 27);
  assert.equal(out.partial, true);
});
