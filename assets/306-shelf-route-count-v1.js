(function (w, document) {
 'use strict';
 const outcomes = {
  in_stock:'Есть в ТТ',
  not_in_stock:'Нет в ТТ',
  previous_special_order:'Была под заказ для клиента',
  ordered_for_delivery:'Заказали для отгрузки клиенту'
 };
 const emptyTranscript = 'Подтверждаю: наших товаров на полке нет';
 const sessions = new Map();
 const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
 const norm = value => String(value ?? '').toLowerCase().replaceAll('ё','е').trim();
 const labelDate = value => new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Minsk', dateStyle:'short'}).format(new Date(value));
 const labelMonth = value => new Intl.DateTimeFormat('ru-RU', {timeZone:'UTC',month:'short',year:'numeric'}).format(new Date(value));
 const hostElements = new WeakMap();
 let activeRecording;
 const getDb = () => typeof db !== 'undefined' ? db : w.db;
 const profile = () => typeof currentProfile !== 'undefined' ? currentProfile : null;
 function rpc(name, args) {
  return getDb().rpc(name, args).then(({data,error}) => { if (error) throw error; return data; });
 }
 function eligible(client, route) {
  if (!client?.id || !route?.id || route.is_network_point || route.network_point_id || route.removed || route.is_office_day) return false;
  return norm(client.role_type).replaceAll('а','a') !== 'aaa' && !/руд[\s-]*буд|бахус/u.test(norm(client.name));
 }
 function read(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
 }
 function persist(state) {
  try {
   sessionStorage.setItem(state.key, JSON.stringify({draft:state.draft,context:state.context}));
  } catch {}
 }
 function draftChanged(state) {
  state.draft.request = null;
  persist(state);
 }
 const statusOf = row => row.status || (row.shelf_qty > 0 ? 'in_stock' : 'not_in_stock');
 function reviewMessage(error) {
  return ({
   SHELF_SCOPE:'Откройте своего клиента из утверждённого маршрута.',
   SHELF_EXCLUDED:'Клиент исключён из пересчёта полки.',
   SHELF_INVALID:'Проверьте список артикулов, количества и длину заметки.',
   SHELF_UNKNOWN_SKU:'Один из артикулов отсутствует в прайсе и истории клиента.',
   SHELF_QUANTITY:'Проверьте фактическое количество по отмеченным товарам.',
   SHELF_PHOTO_SCOPE:'Не удалось подтвердить фотографии. Прикрепите их заново.',
   shelf_unknown_sku:'Артикул не найден однозначно. Выберите товар из истории или уточните диктовку.',
   shelf_items_missing:'Укажите артикул и количество либо найдите товар по названию.',
   shelf_quantity_unclear:'В диктовке неясно количество. Укажите его вручную.'
  })[error?.message] || (w.navigator.onLine===false
   ? 'Нет связи. Черновик остаётся на устройстве. Повторите после подключения.'
   : 'Не удалось выполнить действие. Повторите или внесите данные вручную.');
 }
 function namesInSpeech(transcript, candidates) {
  const phrases = norm(transcript).replace(/^(?:лера[,. ]+)+/u,'').split(/[,;\n]|\s+и\s+/u);
  const words = value => (value.match(/[а-яa-z][а-яa-z-]{3,}/gu) || [])
   .filter(word => !['штук','полке','запас','нашли','пересчёт','количество','артикул','лера','есть'].includes(word));
  return candidates.filter(item => phrases.some(phrase => {
   const terms = words(phrase);
   const title = norm(item.product);
   return terms.length>0 && terms.every(term => title.includes(term.slice(0,Math.min(term.length,6))));
  }));
 }
 function parseKnown(transcript, candidates) {
  const source = norm(transcript).replace(/\s*(?:\/|дробь)\s*/gu,'/');
  const matches = [...source.matchAll(/(?<![\d/])\d{1,6}(?:\/\d{1,6})+(?![\d/])/gu)];
  const found = new Set(), decoded = new Map();
  matches.forEach((match, i) => {
   const sku = match[0], item = candidates.find(row => row.sku === sku);
   if (!item) return;
   const suffix = source.slice(match.index+sku.length,matches[i+1]?.index ?? source.length);
   const count = suffix.match(/^\s*[,:–—-]?\s*(?:на полке\s+)?(\d{1,6})(?!\d|[.,]\d|\/)/u);
   const reserve = suffix.match(/(?:запас(?:е)?|резерв(?:е)?)\s*[:–—-]?\s*(\d{1,6})(?!\d|[.,]\d|\/)/u);
   if (found.has(sku)) throw Error('Повторяется артикул ' + sku + '. Уточните количество.');
   found.add(sku);
   if (count && Number(count[1])<=100000 && (!reserve || Number(reserve[1])<=100000)) {
    decoded.set(sku,{sku,product:item.product,shelf_qty:Number(count[1]),reserve_qty:reserve?Number(reserve[1]):null});
   }
  });
  for (const item of namesInSpeech(transcript,candidates)) found.add(item.sku);
  return {found,decoded,needsLookup:matches.some(match => !found.has(match[0]))};
 }
 async function invoke(name, options) {
  const r = await getDb().functions.invoke(name, options);
  if (r.error || r.data?.error) {
   let message = r.data?.error;
   try { message ||= (await r.error?.context?.json())?.error; } catch {}
   throw Error(message || r.error?.message || 'request_failed');
  }
  return r.data;
 }
 function stopRecording(host) {
  const current = activeRecording;
  if (!current || (host?.nodeType && !host.contains(current.panel))) return;
  if (current.recorder?.state==='recording') current.recorder.stop();
  else {
   activeRecording=null;
   current.stream?.getTracks().forEach(track=>track.stop());
  }
 }
 function mount(host, context) {
  const actor = profile();
  if (!actor?.id || !eligible(context.client, context.route)) {
   hostElements.delete(host);
   host.replaceChildren();
   host.hidden=true;
   return;
  }
  const {client,route,onSaved} = context;
  const key = ['crm-shelf-v6',actor.id,route.id,client.id].join(':');
  let state=sessions.get(key);
  if (!state) {
   const cached=read(key);
   state={key,revision:0,context:cached?.context,draft:cached?.draft || {items:{},note:'',transcript:'',photos:[]}};
   sessions.set(key,state);
  }
  const mounted=hostElements.get(host);
  if (mounted?.key===key && mounted.revision===state.revision) return;
  const args = {p_client:client.id,p_route:route.id};
  const panel = document.createElement('details');
  panel.className='visit-sku-panel crm-shelf-count';
  panel.open=!state.context?.saved?.at || Object.keys(state.draft.items).length>0;
  panel.innerHTML='<summary><strong>Сверка полки · SKU</strong><span data-shelf-badge></span></summary>'+
   '<div data-shelf-body><p>История отгрузок 1С по клиенту. Укажите фактический остаток для этой торговой точки.</p>'+
   '<p data-shelf-address></p><p data-shelf-load role="status"></p>'+
   '<label class="shelf-field">Найти артикул или товар<input type="search" data-shelf-search autocomplete="off"></label>'+
   '<details class="shelf-dictation"><summary>Диктовка артикулов</summary><div class="shelf-buttons">'+
   '<button type="button" class="btn-secondary" data-shelf-action="record">Продиктовать полку</button></div>'+
   '<label class="shelf-field">Распознанный текст<textarea data-shelf-text rows="3" maxlength="10000" placeholder="Например, 67/2/21 — 2 штуки, запас 1"></textarea></label>'+
   '<button type="button" class="btn-secondary" data-shelf-action="parse">Разобрать артикулы</button><p data-shelf-parse role="status"></p></details>'+
   '<div data-shelf-rows></div><button type="button" class="btn-secondary" data-shelf-action="more">Показать ещё</button>'+
   '<details><summary>Заметка и фото</summary><label class="shelf-field">Замечания по выкладке<textarea rows="2" maxlength="2000" data-shelf-note></textarea></label>'+
   '<button type="button" class="btn-secondary" data-shelf-action="record-note">Продиктовать замечания</button><p data-shelf-note-voice role="status"></p>'+
   '<label class="shelf-field">Фото по желанию<input type="file" accept="image/jpeg,image/png,image/webp" data-shelf-photos multiple></label><p data-shelf-photo-status></p></details>'+
   '<details data-shelf-previous hidden><summary>Предыдущая сверка этой точки</summary><div data-shelf-history></div></details>'+
   '<p data-shelf-save role="status"></p><div class="shelf-buttons"><button type="button" class="btn-primary" data-shelf-action="save">Подтвердить и сохранить сверку</button>'+
   '<button type="button" class="btn-secondary" data-shelf-action="empty">Наших товаров на полке нет</button></div></div>';
  host.replaceChildren(panel);
  host.hidden=false;
  hostElements.set(host,{key,revision:state.revision});
  const get = attr => panel.querySelector('[data-shelf-'+attr+']');
  const button = action => panel.querySelector('[data-shelf-action="'+action+'"]');
  const current = () => profile()?.id===actor.id && hostElements.get(host)?.key===key;
  const search = get('search'), rows = get('rows'), message = get('save'), parsed = get('parse'), text = get('text');
  const pageSize=context.inVisit?6:12;
  let limit=pageSize, matches=null, busy=false, parsing=false, segment=null;
  text.value=state.draft.transcript;
  get('note').value=state.draft.note;

  function candidates() {
   const bySku = new Map((state.context?.items||[]).map(item=>[item.sku,item]));
   for (const item of [...(state.context?.saved?.items||[]),...Object.values(state.draft.items)]) {
    if (!bySku.has(item.sku)) bySku.set(item.sku,item);
   }
   return [...bySku.values()];
  }
  function showRows() {
   const query=norm(search.value);
   let source=candidates().filter(item=>!query||norm(item.sku+' '+item.product).includes(query));
   if (matches) source=source.filter(item=>matches.has(item.sku));
   rows.innerHTML=source.slice(0,limit).map(item=>{
    const value=state.draft.items[item.sku];
    const previous=state.context?.previous?.items?.find(row=>row.sku===item.sku);
    const saved=state.context?.saved?.items?.find(row=>row.sku===item.sku);
    return '<div class="visit-sku-row" data-sku="'+esc(item.sku)+'" data-product="'+esc(item.product)+'"><strong>'+esc(item.sku)+' · '+esc(item.product||'')+'</strong>'+
     (item.last_month?'<p>Последняя отгрузка · '+esc(labelMonth(item.last_month))+'</p>':'')+
     (previous?.shelf_qty==null?'':'<p>На полке при прошлой сверке · '+esc(previous.shelf_qty)+' шт.</p>')+
     (saved?'<p>Сохранено · '+esc(outcomes[statusOf(saved)])+(saved.shelf_qty==null?'':' · '+esc(saved.shelf_qty)+' шт.')+'</p>':'')+
     '<label>Результат по артикулу<select data-shelf-line="status"><option value="">Выберите результат</option>'+
     Object.entries(outcomes).map(([code,label])=>'<option value="'+code+'"'+(value?.status===code?' selected':'')+'>'+label+'</option>').join('')+
     '</select></label><div class="shelf-counts"'+(value?.status?'':' hidden')+'><label>На полке<input type="number" inputmode="numeric" min="0" max="100000" step="1" data-shelf-line="shelf_qty" value="'+esc(value?.shelf_qty)+'" placeholder="шт."></label>'+
     '<label>В запасе<input type="number" inputmode="numeric" min="0" max="100000" step="1" data-shelf-line="reserve_qty" value="'+esc(value?.reserve_qty)+'" placeholder="шт."></label></div></div>';
   }).join('') || (state.context ? '<p>'+(query?'По запросу ничего не найдено.':'В истории отгрузок нет подходящих товаров.')+'</p>' : '');
   button('more').hidden=source.length<=limit;
  }
  function showContext() {
   if (!current()) return;
   if (state.context?.eligible===false) {host.hidden=true;return;}
   host.hidden=false;
   const data=state.context;
   get('address').textContent=data?.address||route.address||client.address||'';
   if (data?.saved?.at) get('badge').textContent=' · Сохранена ' + labelDate(data.saved.at);
   get('previous').hidden=!data?.previous?.items?.length;
   if (data?.previous?.items?.length) {
    get('history').innerHTML='<p>'+esc(labelDate(data.previous.at))+'</p>'+data.previous.items.map(item=>
     '<p>'+esc(item.sku)+' · '+esc(outcomes[statusOf(item)])+(item.shelf_qty==null?'':' · '+esc(item.shelf_qty)+' шт.')+'</p>').join('');
   }
   get('photo-status').textContent=state.draft.photos.length?'Фото прикреплено · '+state.draft.photos.length:'';
   showRows();
  }
  async function load() {
   get('load').textContent='Загружаю артикулы из истории 1С…';
   if (state.context) showContext();
   try {
    const data=await rpc('crm_shelf_visit_context_v6',args);
    if (!current()) return;
    const saved=state.context?.saved;
    state.context=saved?.at && data.eligible && (!data.saved?.at || data.saved.at<saved.at) ? {...data,saved}:data;
    get('load').textContent='';
    showContext();
    persist(state);
   } catch(error) {
    if (!current()) return;
    get('load').innerHTML=esc(state.context?'Показана сохранённая история.':reviewMessage(error))+
     ' <button type="button" class="btn-secondary" data-shelf-action="retry">Повторить загрузку</button>';
   }
  }
  function setRow(element) {
   const row=element.closest('[data-sku]');
   const {sku,product}=row.dataset;
   const item = {...state.draft.items[sku],sku,product};
   delete item.fromDictation;
   const field=element.dataset.shelfLine;
   item[field]=element.value;
   if (field==='status') row.querySelector('.shelf-counts').hidden=!item.status;
   if (field==='status' && !item.status) {
    delete state.draft.items[sku];
    row.querySelectorAll('input').forEach(input=>{input.value='';});
    draftChanged(state);
    return;
   }
   if (field==='status' && item.status==='not_in_stock') {
    item.shelf_qty='0';
    row.querySelector('[data-shelf-line="shelf_qty"]').value='0';
   }
   state.draft.items[sku]=item;
   draftChanged(state);
  }
  async function parse() {
   if (activeRecording || segment) { parsed.textContent='Дождитесь окончания записи и распознавания.'; return; }
   if (parsing || busy) return;
   const transcript=text.value.trim();
   if (!transcript) { parsed.textContent='Продиктуйте полку или введите текст для разбора.'; return; }
   parsing=true;
   button('parse').disabled=true;
   parsed.textContent='Разбираю артикулы…';
   try {
    const {found,decoded,needsLookup}=parseKnown(transcript,candidates());
    if (needsLookup || !found.size) {
     const data=await invoke('crm-tasks-assistant-v4',{body:{action:'parse_shelf',client_id:client.id,route_id:route.id,transcript}});
     for (const row of data.items || []) { found.add(row.sku); decoded.set(row.sku,row); }
    }
    if (!current() || text.value.trim()!==transcript) return;
    if (decoded.size) {
     for (const [sku,item] of Object.entries(state.draft.items)) {
      if (item.fromDictation) delete state.draft.items[sku];
     }
     state.draft.parsedTranscript=transcript;
    }
    for (const [sku,item] of decoded) {
     if (state.draft.items[sku]) continue;
     state.draft.items[sku]={...item,status:item.shelf_qty>0?'in_stock':'not_in_stock',fromDictation:true};
    }
    draftChanged(state);
    search.value='';
    matches=found.size?found:null;
    limit=Math.max(pageSize,found.size);
    showRows();
    parsed.textContent=decoded.size
     ? 'Остатки добавлены. Сверьте товары и количество.'
     : 'Найденные товары показаны ниже. Выберите точную модель и укажите фактический остаток.';
    if (found.size) rows.scrollIntoView?.({block:'nearest',behavior:'smooth'});
   } catch(error) {
    if (current()) parsed.textContent=error.message?.startsWith('Повторяется артикул')?error.message:reviewMessage(error);
   } finally {
    parsing=false;
    button('parse').disabled=false;
   }
  }
  async function record(isNote=false) {
   if (activeRecording?.panel===panel) {stopRecording(); return;}
   if (activeRecording || segment || busy || parsing) return;
   const output=isNote?get('note'):text;
   const voiceStatus=isNote?get('note-voice'):parsed;
   const trigger=button(isNote?'record-note':'record');
   const originalText=trigger.textContent;
   if (!w.navigator.mediaDevices?.getUserMedia || !w.MediaRecorder) {
    voiceStatus.textContent='Запись недоступна. Проверьте разрешение микрофона или введите текст.';
    return;
   }
   const session={panel};
   activeRecording=session;
   trigger.disabled=true;
   try {
    w.RESANTA_TASKS_ROUTE_V4?.stopRecording?.();
    w.crmResantaVoiceSuspendV2?.();
    session.stream=await w.navigator.mediaDevices.getUserMedia({audio:true});
    if (!current() || !panel.isConnected || activeRecording!==session) {
     session.stream.getTracks().forEach(track=>track.stop()); return;
    }
    const options=['audio/webm;codecs=opus','audio/mp4'].find(type=>w.MediaRecorder.isTypeSupported(type));
    const recorder=new w.MediaRecorder(session.stream,options?{mimeType:options}:undefined);
    session.recorder=recorder;
    const chunks=[];
    const started=performance.now();
    recorder.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
    recorder.onstop=async ()=>{
     clearTimeout(session.timer);
     session.stream.getTracks().forEach(track=>track.stop());
     if (activeRecording===session) activeRecording=null;
     trigger.textContent=originalText;
     if (!current()) {trigger.disabled=false;return;}
     segment=new Blob(chunks,{type:recorder.mimeType});
     const duration=Math.min(16.4,(performance.now()-started)/1000);
     voiceStatus.textContent='Распознаю запись…';
     try {
      if (!segment.size || duration<.5) { voiceStatus.textContent='Запись слишком короткая. Повторите диктовку.';return; }
      const form=new FormData();
      form.append('audio',segment,recorder.mimeType.includes('mp4')?'shelf.mp4':'shelf.webm');
      form.append('duration',String(duration));
      const data=await invoke('crm-voice-transcribe-v1',{body:form});
      if (!current()) return;
      const fragment=String(data?.text||'').trim();
      if (!fragment) {voiceStatus.textContent='Речь не распознана. Повторите запись или введите текст.';return;}
      output.value=(output.value.trim()+' '+fragment).trim().slice(0,isNote?2000:10000);
      state.draft[isNote?'note':'transcript']=output.value;
      draftChanged(state);
      voiceStatus.textContent=isNote?'Замечание добавлено.':'Текст добавлен. Нажмите «Разобрать артикулы».';
     } catch (error) { voiceStatus.textContent=reviewMessage(error); }
     finally { segment=null;trigger.disabled=false; }
    };
    recorder.start();
    session.timer=setTimeout(()=>{ if(activeRecording===session)stopRecording(); },14500);
    trigger.textContent='Остановить запись';
    trigger.disabled=false;
    voiceStatus.textContent='Идёт запись. Один фрагмент до 15 секунд.';
   } catch {
    session.stream?.getTracks().forEach(track=>track.stop());
    trigger.disabled=false;
    voiceStatus.textContent='Не удалось получить доступ к микрофону. Можно заполнить вручную.';
   } finally {
    if (!session.recorder) {
     if (activeRecording===session) activeRecording=null;
     trigger.disabled=false;
    }
   }
  }
  function saveItems() {
   const selected=[];
   for (const item of Object.values(state.draft.items)) {
    if (item.fromDictation && state.draft.parsedTranscript!==text.value.trim()) {
     throw Error('Диктовка изменена. Разберите её заново или уточните количество вручную по артикулу '+item.sku+'.');
    }
    const hasCount=value=>value!=null&&String(value).trim()!=='';
    if (!item.status) {
     if (hasCount(item.shelf_qty)||hasCount(item.reserve_qty)) throw Error('Выберите результат по артикулу '+item.sku+'.');
     continue;
    }
    const number=value=>{
     if (!hasCount(value)) return null;
     const count=Number(value);
     if (!Number.isInteger(count)||count<0||count>100000) throw Error('Проверьте количество по артикулу '+item.sku+'.');
     return count;
    };
    const qty=number(item.shelf_qty);
    if (item.status==='in_stock' && !(qty>0)) throw Error('Укажите количество на полке по артикулу '+item.sku+'.');
    if (item.status==='not_in_stock' && qty!==0) throw Error('Для «Нет в ТТ» укажите 0 по артикулу '+item.sku+'.');
    selected.push({sku:item.sku,status:item.status,shelf_qty:qty,reserve_qty:number(item.reserve_qty)});
   }
   if (!selected.length) throw Error('Отметьте хотя бы один артикул.');
   if (selected.length>100) throw Error('За одну сверку можно сохранить до 100 артикулов.');
   return selected;
  }
  async function save(empty) {
   if (busy || parsing || activeRecording || segment) { message.textContent='Дождитесь завершения записи или разбора.'; return; }
   let items;
   try {
    if (empty && Object.values(state.draft.items).some(row=>row.status)) {
     throw Error('Снимите отмеченные результаты, чтобы сохранить пустую полку.');
    }
    items=empty?[]:saveItems();
   } catch(error) { message.textContent=error.message; return; }
   busy=true;
   const controls=[...panel.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled);
   controls.forEach(el=>{el.disabled=true;});
   message.textContent='Сохраняю сверку…';
   try {
    state.draft.request ||= w.crypto.randomUUID();
    persist(state);
    const saved=await rpc('crm_shelf_visit_save_v6',{...args,p_request:state.draft.request,p_items:items,
     p_transcript:empty?emptyTranscript:text.value.trim(),p_note:state.draft.note,p_photos:state.draft.photos});
    if (!current()) return;
    state.context={...(state.context||{eligible:true,items:[]}),saved};
    hostElements.get(host).revision=++state.revision;
    state.draft={items:{},note:'',transcript:'',photos:[]};
    text.value=''; get('note').value=''; get('photos').value='';
    search.value=''; matches=null; parsed.textContent='';
    persist(state);
    showContext();
    message.textContent='Сверка сохранена.';
    panel.open=false;
    panel.querySelector('summary').focus?.();
    onSaved?.(saved);
   } catch(error) { message.textContent=reviewMessage(error); }
   finally {busy=false; controls.forEach(el=>{el.disabled=false;});}
  }

  panel.addEventListener('input',e=>{
   const el=e.target;
   if (el===search) {matches=null;limit=pageSize;showRows();}
   if (el===text) {state.draft.transcript=el.value;draftChanged(state);}
   if (el===get('note')) {state.draft.note=el.value;draftChanged(state);}
   if (el.matches('input[data-shelf-line]')) setRow(el);
  });
  panel.addEventListener('change',async e=>{
   const el=e.target;
   if (el.matches('select[data-shelf-line]')) setRow(el);
   if (el!==get('photos')) return;
   try {
    const files=[...(el.files||[])];
    if (files.length+state.draft.photos.length>6) throw Error('Допустимо до 6 фото.');
    if (files.some(file=>file.size>5242880||!['image/jpeg','image/png','image/webp'].includes(file.type))) throw Error('Подойдут JPEG, PNG или WebP до 5 МБ.');
    busy=true;get('photo-status').textContent='Загружаю фото…';
    for (const file of files) {
     const path=actor.id+'/'+client.id+'/'+w.crypto.randomUUID()+'.'+file.type.split('/')[1];
     const {error}=await getDb().storage.from('crm-shelf-v4').upload(path,file,{contentType:file.type,upsert:false});
     if (error) throw Error('Не удалось загрузить фото. Повторите при доступе к сети.');
     if (!current()) return;
     state.draft.photos.push(path);draftChanged(state);
    }
    get('photo-status').textContent='Фото прикреплено · '+state.draft.photos.length;
   } catch(error) { get('photo-status').textContent=error.message; }
   finally { busy=false;el.value=''; }
  });
  panel.addEventListener('click',e=>{
   const action=e.target.closest('[data-shelf-action]')?.dataset.shelfAction;
   if (action==='more') {limit+=24;showRows();}
   if (action==='retry') void load();
   if (action==='parse') void parse();
   if (action==='record') void record();
   if (action==='record-note') void record(true);
   if (action==='save') void save(false);
   if (action==='empty') void save(true);
  });
  panel.addEventListener('toggle',()=>{if (!panel.open && activeRecording?.panel===panel)stopRecording();});
  void load();
 }

 function openVisit(clientId, date, routeId) {
  const modal=document.getElementById('modal-quick-visit');
  const anchor=document.getElementById('qv-sku-block');
  if (!modal?.classList.contains('open') || !anchor || document.getElementById('qv-client-id')?.value!==clientId) return;
  const actor=profile();
  const enabled=actor?.role==='manager' && actor?.region==='Витебск';
  const route=enabled&&Array.isArray(allRoutePlans)?allRoutePlans.find(item=>item.id===routeId):null;
  const client=enabled&&((allClients||[]).find(item=>item.id===clientId)||(routeClients||[]).find(item=>item.id===clientId));
  let host=document.getElementById('qv-shelf-count');
  if (!host) {host=document.createElement('div');host.id='qv-shelf-count';anchor.before(host);}
  if (activeRecording?.panel?.parentElement===host) stopRecording();
  mount(host,{client,route,inVisit:true,onSaved:()=>w.dispatchEvent(new w.Event('crm-shelf-saved'))});
 }
 const original=w.openQuickVisit;
 if (typeof original==='function') w.openQuickVisit=function (clientId,date,routeId) {
  const result=original.apply(this,arguments);
  openVisit(clientId,date,routeId);
  return result;
 };
 const originalClose=w.closeModal;
 if (typeof originalClose==='function') w.closeModal=function (id) {
  if (id==='modal-quick-visit' && activeRecording?.panel?.closest('#qv-shelf-count')) stopRecording();
  return originalClose.apply(this,arguments);
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopRecording();});
 w.addEventListener('pagehide',stopRecording);
 w.crmShelfCount=Object.freeze({eligible,mount,stopRecording});
})(window, document);
