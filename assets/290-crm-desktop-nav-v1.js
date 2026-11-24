(function(w,d){
 'use strict';
 const app=d.getElementById('app');
 const legacy=app?.querySelector('.layout > .sidebar');
 if(!legacy)return;
 const groups=new Map([
  ['Главная',['dashboard','alerts']],
  ['Продажи',['vip','sales','falling','abc','triovist','managers']],
  ['Клиенты',['clients','lpr-birthdays','lpr','networks','client360']],
  ['Рабочий день',['connect','meeting-planner','tasks','visits','my-routes','route','workday','control','gps-control','routes-boss','my-run']],
  ['Товары',['markdown','warehouse-control','receiving','orders','inventory','picking','warehouse-vitebsk360']],
  ['Продвижение',['promotions','stands','vip-actions']],
  ['Деньги',['budgets','debt','payments','payment-registry']],
 ]);
 const groupOf=new Map([...groups].flatMap(([group,ids])=>ids.map(id=>[id,group])));
 const direct='Прямые входы';
 const preference='resanta-crm-desktop-nav-classic';
 const desktop=w.matchMedia('(min-width:769px)');
 const side=d.createElement('aside');
 side.className='crm-desktop-nav';
 side.setAttribute('aria-label','Разделы CRM');
 const topbar=app.querySelector('.topbar');
 const toggle=d.createElement('button');
 toggle.type='button';
 toggle.className='logout-btn crm-desktop-nav-toggle';
 const title=d.createElement('h2');
 title.textContent='Разделы';
 const groupList=d.createElement('div');
 groupList.className='crm-desktop-nav-groups';
 const items=d.createElement('nav');
 items.className='crm-desktop-nav-links';
 const extra=d.createElement('details');
 const extraTitle=d.createElement('summary');
 extraTitle.textContent=direct;
 const extraItems=d.createElement('nav');
 extraItems.setAttribute('aria-label',direct);
 extra.append(extraTitle,extraItems);
 side.append(title,groupList,items,extra);
 legacy.before(side);
 topbar.append(toggle);

 let classic=false,group='Главная',lastPage='',signature='',queued=false;
 try{classic=w.localStorage.getItem(preference)==='1'}catch(_){}
 function eligible(){
  const html=d.documentElement;
  const body=d.body;
  const user=typeof currentUser==='undefined'?w.currentUser:currentUser;
  const profile=typeof currentProfile==='undefined'?w.currentProfile:currentProfile;
  return desktop.matches&&!html.classList.contains('native-app')&&
   !body.classList.contains('crm-executive-viewer')&&!body.classList.contains('crm-auditor-mode')&&
   !!user?.id&&!!profile&&w.getComputedStyle(app).display!=='none';
 }
 function visible(source){
  const css=w.getComputedStyle(source);
  return !source.hidden&&!source.disabled&&source.getAttribute('aria-hidden')!=='true'&&
   source.getAttribute('aria-disabled')!=='true'&&css.display!=='none'&&css.visibility==='visible';
 }
 function rows(){
  return [...legacy.querySelectorAll('.nav-item[id]')].filter(visible).map(source=>{
   const id=source.id.replace(/^(?:nav|bn)-/,'');
   const group=groupOf.get(id)||direct;
   const badge=source.querySelector('.alert-dot');
   const notification=!!badge&&w.getComputedStyle(badge).display!=='none';
   const count=notification?badge.textContent.trim():'';
   const label=[...source.childNodes].filter(node=>node!==badge).map(node=>node.textContent).join('').trim().replace(/\s+/g,' ');
   return {id,group,label,count,notification,source};
  });
 }
 function button(label,className,action,value){
  const node=d.createElement('button');
  node.type='button';
  node.className=className;
  node.dataset[action]=value;
  node.textContent=label;
  return node;
 }
 function draw(){
  queued=false;
  const available=eligible();
  toggle.hidden=!available;
  toggle.textContent=classic?'Новый вид':'Прежний вид';
  if(!available||classic){
   app.classList.remove('crm-desktop-nav-on');
   return;
  }
  const entries=rows();
  app.classList.toggle('crm-desktop-nav-on',entries.length>0);
  if(!entries.length)return;
  const page=app.dataset.activePage||'dashboard';
  const active=entries.find(row=>row.id===page)||entries.find(row=>row.source.classList.contains('active'));
  if(page!==lastPage){lastPage=page;if(active&&active.group!==direct)group=active.group}
  const availableGroups=[...groups.keys()].filter(value=>entries.some(row=>row.group===value));
  if(!availableGroups.includes(group))group=availableGroups[0]||'';
  const next=JSON.stringify([group,active?.id,entries.map(({id,group,label,count,notification})=>[id,group,label,count,notification])]);
  if(next===signature)return;
  signature=next;
  const selected=d.activeElement;
  const keyboardFocus=side.contains(selected)?{group:selected.dataset.group,source:selected.dataset.source}:null;
  groupList.replaceChildren(...availableGroups.map(value=>{
   const node=button(value,'crm-desktop-nav-group','group',value);
   node.setAttribute('aria-expanded',String(group===value));
   node.setAttribute('aria-controls','crm-desktop-nav-section');
   return node;
  }));
  const link=row=>{
   const node=button(row.label,'crm-desktop-nav-link','source',row.id);
   if(row===active)node.setAttribute('aria-current','page');
   if(row.notification){
    const badge=d.createElement('span');
    badge.textContent=row.count||'•';
    badge.className='crm-desktop-nav-badge';
    node.append(badge);
   }
   return node;
  };
  items.id='crm-desktop-nav-section';
  items.setAttribute('aria-label',group||'Разделы');
  items.replaceChildren(...(groups.get(group)||[]).flatMap(id=>entries.filter(row=>row.id===id).map(link)));
  const extraLinks=entries.filter(row=>row.group===direct);
  extra.hidden=!extraLinks.length;
  extraItems.replaceChildren(...extraLinks.map(link));
  if(keyboardFocus){
   [...side.querySelectorAll('button')].find(node=>
    keyboardFocus.group?node.dataset.group===keyboardFocus.group:
    keyboardFocus.source&&node.dataset.source===keyboardFocus.source)?.focus({preventScroll:true});
  }
 }
 function schedule(){
  if(!queued){queued=true;w.setTimeout(draw,0)}
 }
 toggle.addEventListener('click',()=>{
  classic=!classic;
  try{w.localStorage.setItem(preference,classic?'1':'0')}catch(_){}
  draw();
 });
 side.addEventListener('click',event=>{
  const node=event.target.closest('button');
  if(!node||!eligible())return;
  if(node.dataset.group){
   group=node.dataset.group;
   if(group==='Главная')rows().find(row=>row.id==='dashboard')?.source.click();
   draw();
   return;
  }
  const row=rows().find(entry=>entry.id===node.dataset.source);
  row?.source.click();
  if(row?.id==='sales')w.RESANTA_SALES360_V1?.show();
 });
 const observer=new MutationObserver(schedule);
 observer.observe(legacy,{subtree:true,childList:true,characterData:true,attributes:true,
  attributeFilter:['style','hidden','disabled','aria-disabled','aria-hidden','class']});
 observer.observe(app,{attributes:true,attributeFilter:['style','data-active-page']});
 observer.observe(d.body,{attributes:true,attributeFilter:['class']});
 observer.observe(d.documentElement,{attributes:true,attributeFilter:['class']});
 desktop.addEventListener('change',schedule);
 schedule();
})(window,document);
