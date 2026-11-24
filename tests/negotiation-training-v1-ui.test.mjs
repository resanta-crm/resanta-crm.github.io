import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

test('New client sends audio with consent and can link to an existing card without a visit',async () => {
  const html = readFileSync('index.html','utf8');
  const source = readFileSync('assets/298-crm-negotiations-v1.js','utf8');
  const {document,window} = parseHTML(html);
  const root = document.getElementById('page-negotiations');
  const dialog = document.getElementById('neg-training-dialog');
  dialog.showModal = () => {dialog.open = true;};
  dialog.close = () => {dialog.open = false; dialog.dispatchEvent(new window.Event('close'));};
  const actor = {id:'owner',role:'manager',access_scope:'standard',region:'Витебск'};
  const requests = [];
  let row;
  const calls = async (url, options) => {
    const urlObject = new URL(url);
    const action = urlObject.searchParams.has('part') ? 'part' : JSON.parse(options.body).action;
    const payload = action === 'part' ? Object.fromEntries(urlObject.searchParams) : JSON.parse(options.body);
    requests.push({action,payload});
    if (action === 'create') row = {...payload,owner_id:actor.id,audio_state:'draft',created_at:'2026-11-24T13:10:00Z'};
    if (action === 'list') return Response.json({rows:row ? [row] : [],more:false});
    if (action === 'start') return Response.json({partSize:4});
    if (action === 'complete') row.audio_state = 'queued';
    if (action === 'clients') return Response.json({clients:[{id:'real-client',name:'Точка Тест',city:'Минск',address:'ул. Тестовая'}]});
    if (action === 'link_client') row.client_id = payload.client_id;
    return Response.json({row});
  };
  runInNewContext(source, {
    window,document,currentUser:actor,currentProfile:actor,allVisits:[],navigator:{},crypto,
    fetch:calls,AbortSignal,URLSearchParams,Intl,MutationObserver:window.MutationObserver,
    setTimeout:() => 1,clearTimeout:() => {},confirm:() => true,
    db:{auth:{getSession:async () => ({data:{session:{user:actor,access_token:'fixture'}}})}},
    SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',
    goPage:() => root.classList.add('active'),
  });
  const click = (at,text) => {
    const target = [...at.querySelectorAll('button')].find(el => el.textContent === text);
    assert(target, text);
    target.click();
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  window.crmNegotiations.open('new');
  const name = root.querySelector('input[type="text"]');
  name.value = 'Точка Тест';
  click(root,'Перейти к записи');
  assert.equal(dialog.open,true);
  assert.equal(requests.length,0);
  const file = dialog.querySelector('input[type="file"]');
  Object.defineProperty(file,'files',{value:[new File(['synthetic audio'],'test.wav',{type:'audio/wav'})]});
  file.dispatchEvent(new window.Event('change'));
  click(dialog,'Отправить на расшифровку');
  await settle();
  assert.equal(requests.length,0);
  dialog.querySelector('input[type="checkbox"]').checked = true;
  click(dialog,'Отправить на расшифровку');
  await settle();
  await settle();
  assert.equal(dialog.open,false);
  assert.deepEqual(requests.map(r => r.action), ['create','start','part','part','part','part','complete','get']);
  assert.equal(requests[0].payload.prospect_name,'Точка Тест');
  assert.equal(requests[0].payload.client_id,undefined);
  assert.equal(requests[0].payload.visit_id,undefined);
  click(root,'Найти в CRM');
  await settle();
  click(root,'Привязать');
  await settle();
  assert.equal(row.client_id,'real-client');
  assert.equal(row.visit_id,undefined);

  row.audio_state = 'ready';
  row.transcript = [
    {time:4,speaker:'SPEAKER_03',text:'Какие товары чаще спрашивают ваши покупатели?'},
    {time:12,speaker:'SPEAKER_02',text:'Нам нужно получить пробную партию до пятницы.'},
  ];
  window.crmNegotiations.open();
  await settle();
  click(root,'Открыть');
  await settle();
  assert.match(root.textContent,/Какие реплики ваши/);
  assert.match(root.textContent,/Голос 1.*0:04.*Какие товары/);
  assert.match(root.textContent,/Голос 2.*0:12.*пробную партию/);
  assert.doesNotMatch(root.textContent,/SPEAKER_03/);
  const analyse = [...root.querySelectorAll('button')].find(el => el.textContent === 'Запустить разбор');
  assert.equal(analyse.disabled,true);
  const selected = root.querySelector('input[value="SPEAKER_03"]');
  selected.setAttribute('checked','');
  selected.dispatchEvent(new window.Event('change'));
  assert.equal(analyse.disabled,false);
  analyse.click();
  await settle();
  assert.equal(requests.find(r => r.action === 'analyse').payload.speaker, 'SPEAKER_03');
});
