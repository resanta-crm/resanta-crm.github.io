import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, initialReview, report } from '../supabase/functions/crm-negotiation-training-v1/coach.mjs';
import { createScribe, normalizeTranscript } from '../supabase/functions/crm-negotiation-training-v1/scribe.mjs';

const line = {time:2, speaker:'SPEAKER_00', text:'Рассмотрим пробную партию, если поставите до пятницы.'};
const makeCase = () => initialReview({summary:'Условие поставки', criteria:[
  {score:0,line:0,reason:'Не согласован срок'},
  {score:2,line:0}, {score:2,line:500},
],cases:[
  {line:0,issue:'Срок поставки',question:'Как проверите возможность доставки?'},
  {line:10,issue:'Несуществующая реплика',question:'Вопрос'},
]}, [line], ['SPEAKER_00']).cases[0];
const plan = {action:'Сверить срок и выслать предложение',result:'Ответ клиента на пробную партию',check:'Зафиксированный ответ клиента'};

test('Quality only uses applicable criteria with a real source line', () => {
  const review = initialReview({summary:'Вопрос о заказе',criteria:[{score:2,line:0},{score:0,line:0},{score:2,line:5}]},[line],['SPEAKER_00']);
  assert.equal(review.quality, 50);
  assert.equal(review.criteria.length,10);
  assert.equal(review.criteria[2].score,null);
  assert.deepEqual(review.criteria[0].evidence,line);
  assert.equal(makeCase().evidence.text,line.text);
});

test('Customer turns are only allowed as context for a manager action', () => {
  const buyer = {time:0,speaker:'SPEAKER_01',text:'Интересует генератор.'};
  const manager = {time:5,speaker:'SPEAKER_00',text:'Да, хорошо. Обсудим.'};
  const review = initialReview({summary:'Следующий шаг оставлен открытым',criteria:[
    {score:2,line:0,reason:'Клиент назвал интерес'}, {score:0,line:1,reason:'Менеджер не подтвердил время'},
  ],cases:[
    {line:0,context_line:1,issue:'Оценка клиента',question:'Какой генератор нужен?'},
    {line:1,context_line:0,issue:'Срок визита не согласован',question:'Как договоритесь о точном времени визита?'},
  ]},[buyer,manager],['SPEAKER_00']);
  assert.equal(review.criteria[0].score,null);
  assert.equal(review.criteria[0].reason,'');
  assert.equal(review.criteria[1].score,0);
  assert.equal(review.cases.length,1);
  assert.deepEqual(review.cases[0].evidence,manager);
  assert.deepEqual(review.cases[0].client_context,buyer);
});

test('A manager reporting a gap receives a follow-up and the reply is visibly saved', () => {
  const result = applyAnswer(makeCase(), 'Не выявил.', {
    verdict:'clarification', feedback:'Неясно, для чего клиенту нужен генератор.',
    followup:'Как вы выясните, какие приборы клиент хочет подключать?',
  });
  assert.deepEqual(result.attempts,['Не выявил.']);
  assert.deepEqual(result.last_reply,{text:'Не выявил.',status:'improve'});
  assert.match(result.followup,/какие приборы/);
  assert.equal(result.score,null);
});

test('Clarifications remain free and only three proposed decisions affect training scores', () => {
  const start = makeCase();
  const clarified = applyAnswer(start,'Какая доставка считается своевременной?',{verdict:'clarification',feedback:'До пятницы.'});
  assert.deepEqual(clarified.attempts,[]);
  const improve = (item) => applyAnswer(item,'Уточнить',{verdict:'improve',feedback:'Назовите итог проверки и следующий контакт.',...plan});
  const first = improve(clarified);
  const second = improve(first);
  assert.equal(first.plan,null);
  assert.equal(second.score,null);
  const done = improve(second);
  assert.equal(done.score,0);
  assert.equal(done.plan.source,'ai');
  assert.equal(done.attempts.length,3);
  assert.throws(() => improve(done),/case_completed/);
  for (const [item, expected] of [[start,2],[first,1],[second,0.5]]) {
    const result = applyAnswer(item,'Уточню сроки до полудня и согласую объём с клиентом',{verdict:'accept',feedback:'Следующий шаг согласован.',...plan});
    assert.equal(result.score,expected);
    assert.equal(result.plan.source,'manager');
  }
});

test('Pending answers do not lower the rating and documented CRM tasks govern completion', () => {
  const done = {...makeCase(),score:2,task_id:'task-1'};
  const row = {owner_id:'manager',manager_name:'Менеджер',review:{quality:75,cases:[
    {...makeCase(),score:null},done,...Array.from({length:8},() => ({score:2})),
  ]}};
  const task = new Map([['task-1',{done:true}]]);
  const [before] = report([row],task);
  assert.equal(before.waiting,1);
  assert.equal(before.completed,9);
  assert.equal(before.independence,100);
  assert.equal(before.category,'Недостаточно данных');
  row.review.cases.push({score:0});
  const [after] = report([row],task);
  assert.equal(after.category,'Лидер');
  assert.equal(after.independence,90);
  assert.equal(after.done,1);
});

test('Transcriber protocol sends only authorized multipart requests and preserves unknown speakers',async () => {
  const calls = [];
  const scribe = createScribe('fixture-key',async (url,options) => {
    calls.push([new URL(url).pathname,options]);
    return Response.json({ok:true});
  });
  await scribe.start('crm-test.wav',19,'audio/wav');
  await scribe.part('upload',0,new Blob(['test']));
  await scribe.complete('upload');
  await scribe.result('job');
  await scribe.remove('job');
  assert.deepEqual(calls.map(([path,options]) => [options.method,path]), [
    ['POST','/api/v1/uploads'], ['POST','/api/v1/uploads/upload/parts/0'],
    ['POST','/api/v1/uploads/upload/complete'], ['GET','/api/v1/jobs/job/result'],['DELETE','/api/v1/jobs/job'],
  ]);
  assert.equal(calls[1][1].body.get('chunk').size,4);
  assert.equal(calls[2][1].body.get('done'),'1');
  assert(calls.every(([,options]) => options.headers.Authorization === 'Bearer fixture-key' && options.redirect === 'error'));
  assert.deepEqual(normalizeTranscript({segments:[{start:1,text:' Реплика ',speaker:null}]}),[{time:1,text:'Реплика',speaker:null}]);
  await assert.rejects(createScribe('').jobs(),/scribe_not_configured/);
});
