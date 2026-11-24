/* Scoped ABC rendering and filters using the existing CRM entry points. */
let _abcExportFilter="";

function abcCatalogSubgroups(){
  const byGroup=new Map(),bySku=new Map(),skuGroups=new Map();
  for(const item of allPrice||[]){
    const group=abcCanonicalGroup(item.category),sku=_normSku(item.sku);
    if(!group||!sku)continue;
    if(!skuGroups.has(sku))skuGroups.set(sku,new Set());
    skuGroups.get(sku).add(group);
    const label=String(item.subgroup||'').trim(),key=abcNorm(label);
    if(!key||key==='прочее'||key==='без подгруппы')continue;
    if(!byGroup.has(group))byGroup.set(group,new Map());
    byGroup.get(group).set(key,label);
    const id=group+'|'+sku;
    if(!bySku.has(id))bySku.set(id,new Map());
    bySku.get(id).set(key,label);
  }
  return {byGroup,bySku,skuGroups};
}

function abcItemSubgroup(catalog,group,sku,salesLabel){
  const options=catalog?.bySku.get(group+'|'+_normSku(sku));
  return options?.size===1?options.values().next().value:(String(salesLabel||'').trim()||'Без подгруппы');
}

function abcSyncSubgroupFilter(group,catalog,rows){
  const select=document.getElementById('abc-subgroup');
  const wrapper=document.getElementById('abc-subgroup-wrap');
  if(!select||!wrapper)return '';
  wrapper.hidden=group==='all';
  const previous=select.dataset.group===group?select.value:'';
  select.dataset.group=group;
  const options=new Map(catalog.byGroup.get(group));
  if(group!=='all'){
    for(const row of rows){
      if(row._first_marker||abcCanonicalGroup(row.category)!==group)continue;
      const label=abcItemSubgroup(catalog,group,row.sku,row.subgroup);
      const key=abcNorm(label);
      if(!options.has(key))options.set(key,label);
    }
  }
  const labels=[...options].sort((a,b)=>a[1].localeCompare(b[1],'ru'));
  select.replaceChildren(new Option('Все подгруппы',''),...labels.map(([key,label])=>new Option(label,key)));
  select.value=options.has(previous)?previous:'';
  return select.value;
}

function abcPeriodMonths(mode,offset){
  if(String(mode)==='range'){
    const start=document.getElementById('abc-period-from')?.value||TODAY.slice(0,7);
    const finish=document.getElementById('abc-period-to')?.value||TODAY.slice(0,7);
    const month=/^\d{4}-(0[1-9]|1[0-2])$/;
    if(!month.test(start)||!month.test(finish)||start<'2023-01'||finish>TODAY.slice(0,7)||start>finish)return [];
    const out=[];for(let month=start;month<=finish;month=abcMonthShift(month,1))out.push(abcMonthShift(month,-12*(Number(offset)||0)));
    return out;
  }
  const calendar=String(mode).match(/^(year|quarter):(\d{4})(?::([1-4]))?$/);
  if(calendar){
    const year=Number(calendar[2])-(Number(offset)||0),quarter=Number(calendar[3]||0);
    const first=quarter?(quarter-1)*3+1:1;
    const currentYear=Number(TODAY.slice(0,4)),currentMonth=Number(TODAY.slice(5,7));
    const baseEnd=Math.min(quarter?quarter*3:12,Number(calendar[2])===currentYear?currentMonth:12);
    const end=Math.min(quarter?quarter*3:12,first+Math.max(0,baseEnd-first));
    const out=[];for(let month=first;month<=end;month++)out.push(year+'-'+String(month).padStart(2,'0'));
    return out;
  }
  const count=String(mode)==='12'?12:3, end=abcMonthShift(TODAY.slice(0,7),-(offset||0)*count), out=[];
  for(let i=count-1;i>=0;i--)out.push(abcMonthShift(end,-i));
  return out;
}

function abcPeriodText(mode,offset){const a=abcPeriodMonths(mode,offset);return a.length?monthLabel(a[0])+' — '+monthLabel(a[a.length-1]):'период не выбран';}

function abcRowsFor(scope,manager,clientId,months,group){
  const monthSet=new Set(months),unresolved={count:0};
  const snapshot=window.crmFastAbcSnapshot?.();
  const snapshotClient=snapshot?.scope==='client'&&String(snapshot.clientId)===String(clientId);
  const snapshotManager=snapshot?.scope==='manager';
  const managerAlreadyApplied=snapshotManager&&manager!=='all';
  let source=allPurchaseHistory;
  const client=scope==='client'?allClients.find(x=>String(x.id)===String(clientId)):null;
  if(scope==='client'&&!snapshotClient)source=client?(_clientHistCache[client.name]||getClientHistFast(client)):[];
  const clientNames=client&&!snapshotClient?clientNameVariants(client):[];
  const rows=[];
  source.forEach(r=>{
    if(r._first_marker)return;
    if(snapshot?.scope==='client'&&(scope==='branch')!==Boolean(r._abcBranchOnly))return;
    const m=String(r.month||'').slice(0,7),g=abcCanonicalGroup(r.category);
    if(!monthSet.has(m)||!g||(group&&group!=='all'&&g!==group))return;
    if(scope==='manager'){
      const c=snapshotManager?r.client_id:abcClientForRow(r);
      if(!c)unresolved.count++;
      // For a specific manager the RPC has already applied the assignment
      // from either the client card or the original 1C sales row.
      if(!managerAlreadyApplied&&(!c||(manager!=='all'&&c.manager_name!==manager)))return;
    }
    if(scope==='client'&&!snapshotClient){
      if(r.client_id&&String(r.client_id)!==String(clientId))return;
      if(!r.client_id&&!clientNames.some(n=>nameLooseMatch(r.client_name,n)))return;
    }
    rows.push({...r,_abcGroup:g});
  });
  rows._unresolved=unresolved.count;return rows;
}

function abcAggregate(rows,catalog){
  const groups=new Map(),first=abcGlobalFirstMonths();
  (rows||[]).forEach(r=>{
    const g=r._abcGroup||abcCanonicalGroup(r.category);if(!g)return;
    const k=abcSkuKey(r,g);if(!k||k==='p:')return;
    if(!groups.has(g))groups.set(g,new Map());const gm=groups.get(g);
    if(!gm.has(k)){
      const sku=abcDisplaySku(r,g);
      gm.set(k,{key:k,group:g,sku,product:String(r.product||'Без наименования').trim(),
        subgroup:abcItemSubgroup(catalog,g,sku,r.subgroup),revenue:0,qty:0,lastMonth:'',lastPurchaseMonth:'',
        receivedQty:0,returnedQty:0,firstMonth:first.get(g+'|'+k)||'',rows:0});
    }
    const x=gm.get(k),revenue=abcNumber(r.revenue),qty=abcNumber(r.qty),month=String(r.month||'').slice(0,7);
    x.revenue+=revenue;x.qty+=qty;x.rows++;
    if(month>x.lastMonth)x.lastMonth=month;
    if(revenue>0&&qty>0){
      x.receivedQty+=qty;
      if(month>x.lastPurchaseMonth)x.lastPurchaseMonth=month;
    }
    if(qty<0)x.returnedQty-=qty;
    if(!x.sku||x.sku==='—')x.sku=abcDisplaySku(r,g);if((r.product||'').length>x.product.length)x.product=String(r.product).trim();
  });
  const out=[];
  ABC_GROUPS.forEach(g=>{
    const items=[...(groups.get(g)?.values()||[])];if(!items.length)return;
    const positive=items.filter(x=>x.revenue>0).sort((a,b)=>b.revenue-a.revenue||b.qty-a.qty),positiveTotal=positive.reduce((s,x)=>s+x.revenue,0),netTotal=items.reduce((s,x)=>s+x.revenue,0);
    let cum=0;positive.forEach(x=>{const prev=positiveTotal?cum/positiveTotal:0;x.baseClass=prev<.80?'A':prev<.95?'B':'C';x.share=positiveTotal?x.revenue/positiveTotal:0;cum+=x.revenue;x.cumulative=positiveTotal?cum/positiveTotal:0;const recentNew=x.firstMonth&&x.firstMonth>=abcMonthShift(TODAY.slice(0,7),-1);x.class=(recentNew&&x.baseClass==='C')?'N':x.baseClass;});
    items.filter(x=>x.revenue<=0).forEach(x=>{x.baseClass='R';x.class='R';x.share=0;x.cumulative=0;});
    items.sort((a,b)=>{const rank={A:0,B:1,C:2,N:3,R:4};return (rank[a.class]??9)-(rank[b.class]??9)||b.revenue-a.revenue;});
    out.push({group:g,items,positiveTotal,netTotal,counts:{A:items.filter(x=>x.class==='A').length,B:items.filter(x=>x.class==='B').length,C:items.filter(x=>x.class==='C').length,N:items.filter(x=>x.class==='N').length,R:items.filter(x=>x.class==='R').length}});
  });
  return out;
}

function abcInitPeriodOptions(){
  const period=document.getElementById('abc-period');
  if(period&&!period.dataset.abcOptionsReady){
    period.dataset.abcOptionsReady='1';
    const selected=period.value,year=Number(TODAY.slice(0,4)),month=Number(TODAY.slice(5,7));
    period.innerHTML='<option value="90">Текущий и 2 предыдущих месяца</option><option value="range">Выбрать месяцы…</option>';
    for(let y=year;y>=year-2;y--){
      const quarters=Array.from({length:4},(_,i)=>i+1).filter(q=>y<year||(q-1)*3+1<=month);
      period.insertAdjacentHTML('beforeend','<optgroup label="'+y+' год"><option value="year:'+y+'">'+y+' год'+(y===year?' · январь–'+monthLabel(y+'-'+String(month).padStart(2,'0')):'')+'</option>'+quarters.map(q=>'<option value="quarter:'+y+':'+q+'">'+['I','II','III','IV'][q-1]+' квартал '+y+(y===year&&q*3>month?' · текущий':'')+'</option>').join('')+'</optgroup>');
    }
    period.value=selected==='12'?'year:'+year:selected;
    if(!period.value)period.value='90';
  }
  const from=document.getElementById('abc-period-from'),to=document.getElementById('abc-period-to');
  if(from&&!from.value)from.value=TODAY.slice(0,4)+'-01';
  if(to&&!to.value)to.value=TODAY.slice(0,7);
  if(to)to.max=TODAY.slice(0,7);
  const range=document.getElementById('abc-period-range');
  if(range)range.hidden=period?.value!=='range';
}

function abcInitUI(){
  if(_abcUiReady)return;_abcUiReady=true;
  abcInitPeriodOptions();
  const gs=document.getElementById('abc-group');ABC_GROUPS.forEach(g=>gs.insertAdjacentHTML('beforeend','<option value="'+escAttr(g)+'">'+esc(g)+'</option>'));
  const ms=document.getElementById('abc-manager');abcManagerNames().forEach(n=>ms.insertAdjacentHTML('beforeend','<option value="'+escAttr(n)+'">'+esc(n)+'</option>'));
  if(currentProfile?.role!=='boss'){
    document.getElementById('abc-scope').value='manager';document.querySelector('#abc-scope option[value="branch"]').disabled=true;ms.value=currentProfile?.name||'';ms.disabled=true;
  }
  abcRefreshClientDatalist();abcScopeChanged(false);
}

function abcResolveClient(rerender){
  const input=document.getElementById('abc-client-search'),hidden=document.getElementById('abc-client-id');if(!input||!hidden)return;
  const q=abcNorm(input.value),mgr=document.getElementById('abc-manager')?.value||'all';
  const eligible=allClients.filter(c=>(mgr==='all'||c.manager_name===mgr)&&(currentProfile?.role==='boss'||c.manager_name===currentProfile?.name));
  const exact=eligible.filter(c=>abcNorm(c.name)===q);
  const matches=exact.length||!q?exact:eligible.filter(c=>clientNameVariants(c).some(name=>abcNorm(name)===q));
  hidden.value=matches.length===1?matches[0].id:'';if(rerender!==false)renderABC();
}

function abcStockHtml(item,stock){
  const qty=stock.availability.get(_normSku(item.sku));
  if(qty===undefined)return '<span style="color:var(--sub)">нет данных об остатке</span>';
  return '<strong'+(qty>0?' style="color:var(--g)"':'')+'>'+esc(qty)+' шт</strong>'+
    '<div style="font-size:10px;color:var(--sub)">'+esc(stock.latest)+'</div>';
}

function abcItemRow(x,stock){return '<tr><td>'+abcClassBadge(x.class)+'</td><td style="white-space:nowrap">'+esc(x.sku)+'</td><td><b>'+esc(x.product)+'</b><div style="font-size:10px;color:var(--sub)">'+esc(x.subgroup)+'</div></td><td style="white-space:nowrap;text-align:right"><b>'+(x.share*100).toFixed(1)+'%</b></td><td style="white-space:nowrap;text-align:right">'+fmt(x.qty)+'</td><td style="white-space:nowrap">'+(x.lastMonth?monthLabel(x.lastMonth):'—')+'</td><td>'+abcStockHtml(x,stock)+'</td></tr>';}

function abcGroupHtml(g,stock){
  const items=g.items;
  const shown=items.slice(0,120),more=items.length-shown.length;
  return '<div class="card abc-group-card"><div class="abc-head"><div><div class="card-title" style="margin-bottom:4px">'+esc(g.group)+'</div><div style="font-size:11px;color:var(--sub)">SKU: '+g.items.length+'</div></div><div style="display:flex;gap:5px;flex-wrap:wrap">'+abcClassBadge('A')+'<span style="font-size:12px;padding-top:4px">'+g.counts.A+'</span>'+abcClassBadge('B')+'<span style="font-size:12px;padding-top:4px">'+g.counts.B+'</span>'+abcClassBadge('C')+'<span style="font-size:12px;padding-top:4px">'+g.counts.C+'</span>'+(g.counts.N?abcClassBadge('N')+'<span style="font-size:12px;padding-top:4px">'+g.counts.N+'</span>':'')+(g.counts.R?abcClassBadge('R')+'<span style="font-size:12px;padding-top:4px">'+g.counts.R+'</span>':'')+'</div></div>'+(shown.length?'<div class="abc-table-wrap"><table class="abc-table"><thead><tr><th>Класс</th><th>SKU</th><th>Товар</th><th style="text-align:right">Доля</th><th style="text-align:right">Кол-во</th><th>Последнее движение</th><th>Остаток Витебск</th></tr></thead><tbody>'+shown.map(item=>abcItemRow(item,stock)).join('')+'</tbody></table></div>':'<div style="font-size:12px;color:var(--sub)">По выбранному фильтру позиций нет.</div>')+(more>0?'<div style="font-size:11px;color:var(--sub);margin-top:7px">Показаны первые 120 из '+items.length+'. Используйте поиск или выгрузку CSV.</div>':'')+'</div>';
}

function abcLatestVitebskStock(rows){
  const availability=new Map();
  let latest='';
  for(const row of rows){
    if(!_isVitebskStockRow(row))continue;
    const date=_stockRowDate(row);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date> TODAY||date<latest)continue;
    if(date>latest){latest=date;availability.clear();}
    const sku=_normSku(row.sku),qty=Number(row.qty_avail);
    if(!sku)continue;
    const confirmed=Number.isFinite(qty)?Math.max(0,qty):0;
    availability.set(sku,Math.min(availability.get(sku)??confirmed,confirmed));
  }
  return {latest,availability};
}

function abcWithinSubgroup(items,subgroup){
  return subgroup?items.filter(item=>abcNorm(item.subgroup)===subgroup):items;
}

function abcRecommendations(client,mode,group,{subgroup='',catalog=abcCatalogSubgroups(),current,stock=abcLatestVitebskStock(allStock||[])}={}){
  if(!client)return {hold:[],develop:[],lost:[],potential:[],availableDevelop:[],shelf:[],returned:0};
  const curMonths=abcPeriodMonths(mode,0),prevMonths=abcPeriodMonths(mode,1);
  const cur=current??abcAggregate(abcRowsFor('client','all',client.id,curMonths,group),catalog);
  const prev=abcAggregate(abcRowsFor('client','all',client.id,prevMonths,group),catalog);
  const currentItems=abcWithinSubgroup(cur.flatMap(g=>g.items),subgroup);
  const historyItems=abcWithinSubgroup(prev.flatMap(g=>g.items),subgroup);
  const key=item=>item.group+'|'+item.key;
  const ranking=(a,b)=>b.revenue-a.revenue;
  const curMap=new Map(currentItems.map(item=>[key(item),item]));
  const hold=currentItems.filter(item=>item.class==='A').sort(ranking);
  const develop=currentItems.filter(item=>item.class==='B').sort(ranking);
  const lost=historyItems.filter(item=>item.class==='A'&&!(curMap.get(key(item))?.revenue>0)).sort(ranking);
  const historicalShelf=hold.length===0&&lost.length>0;
  const shelf=historicalShelf?lost:hold;
  const returned=currentItems.filter(item=>item.receivedQty>0&&item.returnedQty>=item.receivedQty&&item.qty<=0&&item.revenue<=0).length;
  const inStock=items=>items.flatMap(item=>{
    const sku=_normSku(item.sku),qty=stock.availability.get(sku);
    const catalogGroups=catalog.skuGroups.get(sku);
    return qty>0&&(!catalogGroups||catalogGroups.has(item.group))?[{...item,avail:qty}]:[];
  });
  const branch=abcAggregate(abcRowsFor('branch','all','',curMonths,group),catalog);
  const alreadyKnown=new Set([...currentItems,...historyItems.filter(item=>item.revenue>0)].map(key));
  const potential=inStock(abcWithinSubgroup(branch.flatMap(g=>g.items),subgroup)
    .filter(item=>item.class==='A'&&!alreadyKnown.has(key(item)))).sort(ranking);
  const availableDevelop=inStock(develop);
  return {hold,develop,lost,potential,availableDevelop,shelf,historicalShelf,returned};
}

function abcRecRows(arr,empty,limit,showPurchaseDate=false){
  const list=arr.slice(0,limit);
  if(!list.length)return '<div style="font-size:12px;color:var(--sub)">'+empty+'</div>';
  return list.map(item=>{
    const date=showPurchaseDate&&(item.lastPurchaseMonth||item.lastMonth);
    const meta=[item.group,item.subgroup,date?'Покупка: '+monthLabel(date):''].filter(Boolean).join(' · ');
    return '<div class="abc-rec-row"><div><b>'+esc(item.sku!=='—'?item.sku:'')+'</b> '+esc(item.product)+
      '<div style="font-size:10px;color:var(--sub)">'+esc(meta)+'</div></div>'+
      (item.avail>0?'<div style="white-space:nowrap;text-align:right"><b>'+esc(item.avail)+' шт</b></div>':'')+'</div>';
  }).join('');
}

function abcClientActionsHtml(advice,mode){
  const eligible=window.RESANTA_ABC360?.eligibleRecommendation||(()=>true);
  const expansion=[...advice.potential.filter(eligible).slice(0,10),...advice.availableDevelop.filter(eligible).slice(0,8)];
  const returnNote=advice.returned
    ? '<p class="abc-rec-note">SKU с покупками и полным возвратом в выбранном периоде: '+advice.returned+'.</p>'
    : '';
  const shelfNote=advice.historicalShelf
    ? 'В выбранном периоде нет товаров класса A. Проверьте полку по покупкам класса A за '+esc(abcPeriodText(mode,1))+'.'
    : advice.shelf.length?'Проверьте наличие и выкладку товаров A, которые клиент покупал в выбранном периоде.':'';
  return '<div class="abc-rec-grid">'+
    '<div class="abc-rec-card"><div class="abc-rec-title">Аудит полки</div>'+returnNote+
    (shelfNote?'<p class="abc-rec-note">'+shelfNote+'</p>':'')+
    abcRecRows(advice.shelf,'Нет покупок класса A в выбранном и сопоставимом периодах.',8,advice.historicalShelf)+'</div>'+
    '<div class="abc-rec-card"><div class="abc-rec-title">Покупал ранее</div>'+abcRecRows(advice.lost,'Ранее купленных товаров A без текущих продаж нет.',8,true)+'</div>'+
    '<div class="abc-rec-card"><div class="abc-rec-title">Предложить расширение</div>'+abcRecRows(expansion,'Нет подходящих товаров с подтверждённым остатком в Витебске.',18)+'</div></div>';
}

function abcFilterToken(){
  return ['abc-period','abc-period-from','abc-period-to','abc-group','abc-subgroup','abc-scope','abc-manager','abc-client-id','abc-class','abc-search']
    .map(id=>document.getElementById(id)?.value||'').join('\x1f');
}

function renderABC(){
  abcInitUI();const mode=document.getElementById('abc-period').value,group=document.getElementById('abc-group').value,scope=document.getElementById('abc-scope').value;
  if(window.crmFastAbcCurrentReady&&!window.crmFastAbcCurrentReady()){
    document.getElementById('abc-results').innerHTML='<div class="card">Загружаем ABC для выбранных фильтров…</div>';
    window.RESANTA_ABC360?.refresh(false);
    return;
  }
  let manager=document.getElementById('abc-manager').value;if(currentProfile?.role!=='boss')manager=currentProfile?.name||'';
  const clientId=document.getElementById('abc-client-id').value,cls=document.getElementById('abc-class').value,search=abcNorm(document.getElementById('abc-search').value),months=abcPeriodMonths(mode,0);
  const fresh=crmImportStatus('sales');document.getElementById('abc-freshness').innerHTML='<div style="padding:10px 12px;border-radius:9px;background:var(--bg);border:1px solid var(--border);font-size:12px;margin-bottom:12px">📥 Источник: продажи 1С с НДС. '+(fresh&&fresh.last_success_at?'Последнее успешное обновление: <b>'+crmDateTime(fresh.last_success_at)+'</b>.':'Дата обновления появится после успешного импорта продаж.')+'</div>';
  document.getElementById('abc-period-note').textContent='Расчёт: '+abcPeriodText(mode,0)+'. A — первые 80% оборота группы, B — следующие 15%, C — остаток. N — новая в истории позиция, R — нетто-возврат/оборот ≤ 0.';
  const result=document.getElementById('abc-results');
  const actions=document.getElementById('abc-client-actions');
  const quality=document.getElementById('abc-quality');
  const diagnostics=document.getElementById('abc-quality-details');
  quality.innerHTML='';
  if(diagnostics)diagnostics.textContent='';
  actions.style.display='none';
  actions.innerHTML='';
  _abcLastExport=[];
  const catalog=abcCatalogSubgroups();
  const subgroup=abcSyncSubgroupFilter(group,catalog,scope==='client'&&!clientId?[]:allPurchaseHistory);
  _abcExportFilter=abcFilterToken();
  if(scope==='client'&&!clientId){
    result.innerHTML='<div class="card">Выберите клиента из подсказки.</div>';
    window.RESANTA_ABC360?.render({scope,group,mode,groups:[]});
    return;
  }
  const usableMonths=new Set(months);
  const rows=abcRowsFor(scope,manager,clientId,months,group);
  const groups=abcAggregate(rows,catalog);
  const client=scope==='client'?allClients.find(c=>String(c.id)===String(clientId)):null;
  const identity=window.crmFastAbcSnapshot?.()?.identity;
  const stock=abcLatestVitebskStock(allStock||[]);
  const advice=client?abcRecommendations(client,mode,group,{subgroup,catalog,current:groups,stock}):null;
  if(advice){
    actions.style.display='block';
    actions.innerHTML='<div class="card"><div class="abc-head"><div class="card-title">Рекомендации для '+esc(identity?.name||client.name)+'</div><button class="btn-secondary" onclick="openClient(\''+escAttr(client.id)+'\')">Открыть карточку клиента</button></div>'+abcClientActionsHtml(advice,mode)+'</div>';
  }
  const diagnosticsText=[];
  if(rows._unresolved)diagnosticsText.push('Сгруппированных строк 1С без привязки к карточке: '+rows._unresolved+(manager==='all'?'. В разрез менеджеров они не включены.':'. Включены по менеджеру, указанному в 1С.'));
  const excluded=allPurchaseHistory.filter(r=>!r._first_marker&&!r._abcBranchOnly&&usableMonths.has(String(r.month||'').slice(0,7))&&!abcCanonicalGroup(r.category)).length;
  if(excluded)diagnosticsText.push('Сгруппированных строк 1С вне 14 товарных групп: '+excluded+'. Услуги и другие категории вне перечня не входят в ABC.');
  if(diagnostics)diagnostics.textContent=diagnosticsText.join(' ');
  const matching=groups.map(g=>{
    const items=abcWithinSubgroup(g.items,subgroup).filter(item=>(cls==='all'||item.class===cls)&&
      (!search||abcNorm(item.sku+' '+item.product+' '+item.subgroup).includes(search)));
    const counts={A:0,B:0,C:0,N:0,R:0};
    for(const item of items)counts[item.class]++;
    return {...g,items,counts};
  }).filter(g=>g.items.length);
  _abcLastExport=matching.flatMap(g=>g.items);
  result.innerHTML=matching.length?matching.map(g=>abcGroupHtml(g,stock)).join(''):
    '<div class="card">'+(groups.length?'По выбранной подгруппе, классу или поиску товаров нет.':'За выбранный период в этих товарных группах продаж нет.')+'</div>';
  window.RESANTA_ABC360?.render({scope,group,subgroup,mode,groups,client,identity,advice});
}

function exportABCToCsv(){
  if(_abcExportFilter!==abcFilterToken()||!_abcLastExport.length){alert('Сначала откройте ABC-анализ с нужными фильтрами.');return;}
  const rows=[['Группа','Класс','SKU','Товар','Подгруппа','Оборот с НДС BYN','Доля %','Количество','Последнее движение']];
  _abcLastExport.forEach(x=>rows.push([x.group,x.class,x.sku,x.product,x.subgroup,x.revenue,(x.share*100).toFixed(2),x.qty,x.lastMonth]));
  const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ABC_'+TODAY+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
