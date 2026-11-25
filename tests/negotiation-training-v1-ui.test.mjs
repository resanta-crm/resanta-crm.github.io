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
    if (action === 'list') return Response.json({rows:row ? [row] : [],more:false,
      managers:[{id:'owner',name:'Первый менеджер'},{id:'second',name:'Второй менеджер'}]});
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
    {time:16,speaker:'SPEAKER_01',text:'Уточню срок доставки и вернусь с предложением.'},
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
  const another = root.querySelector('input[value="SPEAKER_01"]');
  another.setAttribute('checked','');
  another.dispatchEvent(new window.Event('change'));
  analyse.click();
  await settle();
  assert.deepEqual(requests.find(r => r.action === 'analyse').payload.speakers, ['SPEAKER_03','SPEAKER_01']);

  row.review = {coach_version:2,quality:44,summary:'Разбор действий менеджера',criteria:[],cases:[
    {id:'complete',score:0,issue:'Следующий контакт',attempts:['а','б','в'],
      plan:{source:'ai',action:'Назначить следующее время визита.',result:'Согласована дата',check:'Подтверждение в CRM'}},
    {id:'pending',score:null,issue:'Другой вопрос',attempts:[],question:'Что уточнить?',
      evidence:row.transcript[0]},
  ]};
  window.crmNegotiations.open();
  await settle();
  const list = root.querySelector('form');
  list.querySelector('input[type="search"]').value = 'Точка';
  list.querySelector('input[type="date"]').value = '2026-11-01';
  list.querySelector('select').querySelector('option[value="second"]').selected = true;
  list.dispatchEvent(new window.Event('submit'));
  await settle();
  const applied = requests.filter(r => r.action === 'list').at(-1).payload;
  assert.equal(applied.search,'Точка');
  assert.equal(applied.from,'2026-11-01');
  assert.equal(applied.manager_id,'second');
  click(root,'Открыть');
  await settle();
  const reviewText = root.textContent;
  assert(reviewText.indexOf('Что сделать дальше') < reviewText.indexOf('Ситуация 2 из 2'));
  assert.match(reviewText, /Подсказка ИИ.*Назначить следующее время визита/);
});

test('Visit recorder can recover from Android microphone denial and an encoder failure',async () => {
  const {document,window} = parseHTML(readFileSync('index.html','utf8'));
  const source = readFileSync('assets/298-crm-negotiations-v1.js','utf8');
  const dialog = document.getElementById('neg-training-dialog');
  dialog.showModal = () => {dialog.open = true;};
  dialog.close = () => {dialog.open = false; dialog.dispatchEvent(new window.Event('close'));};
  const actor = {id:'owner',role:'manager',access_scope:'standard',region:'Витебск'};
  const clientId = '11111111-1111-4111-a111-111111111111';
  document.getElementById('qv-client-id').value = clientId;
  const requests = [];
  const formats = [];
  let microphoneRequests = 0;
  let trackStops = 0;
  const navigator = {mediaDevices:{getUserMedia: async () => {
    if (++microphoneRequests === 1) throw new DOMException('Blocked','NotAllowedError');
    return {getTracks: () => [{stop: () => trackStops++}]};
  }}};
  window.Capacitor = {getPlatform: () => 'android'};
  window.MediaRecorder = class {
    static isTypeSupported(type) {return ['audio/webm;codecs=opus','audio/mp4'].includes(type);}
    constructor(stream,{mimeType}) {this.mimeType = mimeType;}
    start() {
      formats.push(this.mimeType);
      if (this.mimeType.includes('webm')) throw new DOMException('Encoder unavailable','NotSupportedError');
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({data:new Blob(['audio'],{type:this.mimeType})});
      this.onstop();
    }
  };
  runInNewContext(source,{
    window,document,navigator,currentUser:actor,currentProfile:actor,qvRoutePlanId:null,
    crypto,Blob,AbortSignal,URLSearchParams,Intl,MutationObserver:window.MutationObserver,
    setTimeout,clearTimeout,db:{auth:{getSession:async () => ({data:{session:{user:actor,access_token:'fixture'}}})}},
    SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',
    fetch:async (url,options) => {
      const isPart = new URL(url).searchParams.has('part');
      requests.push(isPart ? {action:'part',size:options.body.size} : JSON.parse(options.body));
      return Response.json({partSize:16});
    },
  });
  const click = text => {
    const target = [...dialog.querySelectorAll('button')].find(el => el.textContent === text);
    assert(target, text);
    target.click();
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  window.crmNegotiations.recordVisit('quick');
  click('Начать запись');
  assert.equal(microphoneRequests,0);
  dialog.querySelector('input[type="checkbox"]').checked = true;
  click('Начать запись');
  await settle();
  assert.match(dialog.textContent,/Разрешите микрофон в настройках Android/);
  assert.equal(requests.length,0);
  click('Начать запись');
  await settle();
  assert.match(dialog.textContent,/Идёт запись/);
  assert.deepEqual(formats,['audio/webm;codecs=opus','audio/mp4']);
  click('Остановить и отправить');
  await settle();
  await settle();
  assert.equal(dialog.open,false);
  assert.equal(trackStops,1);
  assert.deepEqual(requests.map(request => request.action),['create','start','part','complete']);
  assert.equal(requests[0].client_id,clientId);
  assert.equal(requests[1].type,'audio/mp4');
  assert.equal(requests[2].size,5);
});

test('Android recording requests consent, offers settings on denial, then sends M4A',async () => {
  const {document,window} = parseHTML(readFileSync('index.html','utf8'));
  const source = readFileSync('assets/298-crm-negotiations-v1.js','utf8');
  const dialog = document.getElementById('neg-training-dialog');
  dialog.showModal = () => {dialog.open = true;};
  dialog.close = () => {dialog.open = false;dialog.dispatchEvent(new window.Event('close'));};
  const actor = {id:'owner',role:'manager',access_scope:'standard',region:'Витебск'};
  document.getElementById('qv-client-id').value = '11111111-1111-4111-a111-111111111111';
  const events = [];
  let session;
  const native = {
    async start(payload) {
      events.push('native-start');
      if (events.length === 1) throw {code:'microphone_denied'};
      session = payload.session;
    },
    async stop(payload) {assert.equal(payload.session,session);return {path:'file:///app/audio.m4a'};},
    async discardRecording() {events.push('discard');},
    async openSettings() {events.push('settings');},
  };
  window.Capacitor = {
    getPlatform:() => 'android',isPluginAvailable:name => name === 'NegotiationAudio',
    Plugins:{NegotiationAudio:native},convertFileSrc:path => path.replace('file://','https://resanta-crm.by/_capacitor_file_'),
  };
  runInNewContext(source,{
    window,document,navigator:{},currentUser:actor,currentProfile:actor,qvRoutePlanId:null,
    crypto,Blob,AbortSignal,URLSearchParams,Intl,MutationObserver:window.MutationObserver,setTimeout,clearTimeout,
    db:{auth:{getSession:async () => ({data:{session:{user:actor,access_token:'fixture'}}})}},
    SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',
    fetch:async (url,options) => {
      if (url === 'https://resanta-crm.by/_capacitor_file_/app/audio.m4a') {
        events.push('read-local-file');
        return new Response('audio');
      }
      const isPart = new URL(url).searchParams.has('part');
      const body = isPart ? {action:'part'} : JSON.parse(options.body);
      events.push(body.action);
      if (body.action === 'start') assert.equal(body.type,'audio/mp4');
      return Response.json({partSize:16});
    },
  });
  const press = label => {
    const button = [...dialog.querySelectorAll('button')].find(el => el.textContent === label);
    assert(button,label);
    button.click();
    return button;
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  window.crmNegotiations.recordVisit('quick');
  press('Начать запись');
  assert.equal(events.length,0);
  dialog.querySelector('input[type="checkbox"]').checked = true;
  press('Начать запись');
  await settle();
  assert.match(dialog.textContent,/Android не разрешил запись/);
  assert.equal(press('Открыть разрешения Android').hidden,false);
  press('Начать запись');
  await settle();
  press('Остановить и отправить');
  await settle();
  await settle();
  assert.equal(dialog.open,false);
  assert(events.indexOf('read-local-file') < events.indexOf('create'));
  assert.deepEqual(events.slice(-5),['discard','create','start','part','complete']);
});

test('Production navigation and point reminder are scoped to field staff',async () => {
  const html = readFileSync('index.html','utf8');
  const source = readFileSync('assets/298-crm-negotiations-v1.js','utf8');
  const {document,window} = parseHTML(html);
  const actor = {id:'staff',name:'Руднев',role:'manager',access_scope:'standard',region:'Витебск'};
  const profile = {...actor};
  const host = document.createElement('section');
  host.id = 'nt-client-point';
  host.hidden = true;
  document.getElementById('modal-client').append(host);
  const requests = [];
  runInNewContext(source, {
    window,document,currentUser:actor,currentProfile:profile,location:{origin:'https://resanta-crm.by'},
    navigator:{onLine:true}, allClients:[{id:'own',manager_name:actor.name},{id:'other',manager_name:'Другой'}],
    allVisits:[],allRoutePlans:[],MutationObserver:window.MutationObserver,
    SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',AbortSignal,Intl,clearTimeout,
    db:{auth:{getSession:async () => ({data:{session:{user:actor,access_token:'fixture'}}})}},
    fetch:async (url,options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({previous:{date:'2026-11-20',recap:'Обсудили ассортимент.'},
        last_review:{id:'review',created_at:'2026-11-20T12:00:00Z',action:'Уточнить остаток.'}});
    },
  });
  assert.equal(document.getElementById('nav-negotiations').hidden,false);
  assert.equal(document.getElementById('bn-negotiations').hidden,false);
  assert.equal(window.crmNegotiations.beginCheckin('other',null,'client'),null);
  assert.equal(requests.length,0);
  window.crmNegotiations.mountPoint('own');
  assert.match(host.textContent,/Записать разговор/);
  const returnToCard = window.crmNegotiations.beginCheckin('own',null,'client');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returnToCard(),false);
  assert.deepEqual(requests,[{action:'visit_context',client_id:'own',route_plan_id:null}]);
  assert.match(host.textContent,/Обсудили ассортимент/);
  assert.match(host.textContent,/Уточнить остаток/);
  profile.access_scope = 'triovist';
  document.getElementById('app').dataset.activePage = 'dashboard';
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.getElementById('nav-negotiations').hidden,true);
  assert.equal(document.getElementById('bn-negotiations').hidden,true);
  assert.equal(host.hidden,true);
});
