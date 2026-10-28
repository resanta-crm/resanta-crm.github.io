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
