/* RESANTA CRM v23.6.200 · SAFE TRIOVIST CONTROLS */
(function(){
'use strict';
if(window.RESANTA_SAFE_TRIOVIST_V236200)return;
const V='v23.6.200',KEY='resanta_tri_mot_month_v236200';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>N(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const rate=v=>(N(v)*100).toFixed(2).replace('.',',')+'%';
const pct=v=>N(v).toFixed(1).replace('.',',')+'%';
const MN=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const ym=v=>String(v||'').slice(0,7),label=v=>{const s=ym(v),m=+s.slice(5,7);return(MN[m-1]||s)+' '+s.slice(0,4)};
const shift=(v,n)=>{const s=ym(v),d=new Date(+s.slice(0,4),+s.slice(5,7)-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const triActive=()=>!!document.getElementById('page-triovist')?.classList.contains('active');
function tab(){const b=document.querySelector('#tr14-shell [data-tr14].on');return String(b?.dataset?.tr14||'')}
function syncParser(){
 const p=document.getElementById('tri21-control-v236107');if(!p)return;
 p.style.setProperty('display',tab()==='parser'?'block':'none','important');
}
function currentMonth(){try{return ym(TODAY)||new Date().toISOString().slice(0,7)}catch(_){return new Date().toISOString().slice(0,7)}}
function selected(){let m='';try{m=localStorage.getItem(KEY)||''}catch(_){};if(!/^\d{4}-\d{2}$/.test(m))m=ym(document.getElementById('tri-period-month')?.value)||currentMonth();if(m<'2026-08')m='2026-08';if(m>currentMonth())m=currentMonth();return m}
function months(){const a=[];let m='2026-08',end=currentMonth();while(m<=end){a.push(m);m=shift(m,1)}return a.reverse()}
function host(){
 const shell=document.getElementById('tr14-shell');if(!shell)return null;
 let h=document.getElementById('tri-mot-compare-v236200');
 if(!h){h=document.createElement('div');h.id='tri-mot-compare-v236200';h.className='card';h.style.cssText='margin:12px 0;padding:14px;border:1px solid #bfdbfe;background:#f8fbff';shell.insertAdjacentElement('afterend',h)}
 h.style.setProperty('display',tab()==='motivation'?'block':'none','important');return h;
}
function managerCard(cur,prev){
 const d=N(cur.total_rate)-N(prev?.total_rate),delta=(d>0?'+':'')+(d*100).toFixed(2).replace('.',',')+'%';
 return '<div style="background:#fff;border:1px solid #dbeafe;border-radius:12px;padding:13px"><div style="display:flex;justify-content:space-between;gap:10px"><div><b style="font-size:17px">'+E(cur.manager_name)+'</b><div style="font-size:11px;color:#64748b">'+E(label(cur.month))+' ↔ '+E(label(prev?.month||shift(cur.month,-1)))+'</div></div><div style="text-align:right"><b style="font-size:27px;color:#0b63ad">'+rate(cur.total_rate)+'</b><div style="font-size:11px;color:'+(d>0?'#166534':d<0?'#b91c1c':'#64748b')+'">изменение '+delta+'</div></div></div><div style="display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:7px;margin-top:10px"><div style="padding:8px;background:#f8fafc;border-radius:8px"><small>ПЛАН</small><br><b>'+pct(cur.plan_pct)+'</b><br><span style="font-size:10px;color:#64748b">KPI +'+rate(cur.plan_rate)+'</span></div><div style="padding:8px;background:#f8fafc;border-radius:8px"><small>РОСТ Г/Г</small><br><b>'+(N(cur.growth_pct)>0?'+':'')+pct(cur.growth_pct)+'</b><br><span style="font-size:10px;color:#64748b">KPI +'+rate(cur.growth_rate)+'</span></div><div style="padding:8px;background:#f8fafc;border-radius:8px"><small>ЗАДАЧИ</small><br><b>'+pct(cur.task_score)+'</b><br><span style="font-size:10px;color:#64748b">KPI +'+rate(cur.task_rate)+'</span></div><div style="padding:8px;background:#f8fafc;border-radius:8px"><small>ОБЩИЙ TRIOVIST</small><br><b>'+pct(cur.team_pct)+'</b><br><span style="font-size:10px;color:#64748b">KPI +'+rate(cur.team_rate)+'</span></div></div><div style="font-size:11px;color:#64748b;margin-top:8px">Продажи: <b>'+money(cur.fact)+'</b> из '+money(cur.plan)+' · предыдущий месяц: <b>'+rate(prev?.total_rate||0)+'</b></div></div>';
}
let flight=null;
async function motivation(force=false){
 if(!triActive()||tab()!=='motivation')return;
 const h=host();if(!h)return;if(flight&&!force)return flight;
 const m=selected(),opts=months().map(x=>'<option value="'+x+'" '+(x===m?'selected':'')+'>'+E(label(x))+'</option>').join('');
 h.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:end;flex-wrap:wrap"><div><b style="font-size:16px">🏆 Контроль мотивации</b><div style="font-size:11px;color:#64748b">Месяц и сравнение с предыдущим месяцем. Расчёт 1,5% + KPI до 0,5%.</div></div><div style="display:flex;gap:6px;align-items:end"><button type="button" class="btn-secondary" data-mprev>←</button><div><label class="form-label">Месяц</label><select class="form-input" data-mmonth>'+opts+'</select></div><button type="button" class="btn-secondary" data-mnext '+(m>=currentMonth()?'disabled':'')+'>→</button><button type="button" class="btn-secondary" data-mrefresh>↻ Обновить</button></div></div><div data-mbody style="margin-top:10px;color:#64748b">Считаю…</div>';
 flight=(async()=>{
   const client=typeof db!=='undefined'?db:window.db;if(!client?.rpc)return;
   const {data,error}=await client.rpc('triovist_motivation_compare_v236199',{p_month:m+'-01'});if(error)throw error;
   const rows=Array.isArray(data?.rows)?data.rows:[],prevM=ym(data?.compare_month||shift(m,-1)),cur=rows.filter(x=>ym(x.month)===m),pr=rows.filter(x=>ym(x.month)===prevM);
   const body=h.querySelector('[data-mbody]');if(body)body.innerHTML='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">'+cur.map(x=>managerCard(x,pr.find(y=>y.manager_email===x.manager_email))).join('')+'</div><div style="font-size:10px;color:#64748b;margin-top:8px">База 1,50% не уменьшается. Финальная мотивация фиксируется после закрытия месяца.</div>';
   const base=document.getElementById('tri-period-month');if(base&&ym(base.value)!==m){base.value=m;base.dispatchEvent(new Event('change',{bubbles:true}))}
 })().catch(e=>{const body=h.querySelector('[data-mbody]');if(body)body.innerHTML='<div style="color:#b91c1c">Ошибка расчёта: '+E(e.message||e)+'</div>'}).finally(()=>flight=null);
 return flight;
}
function choose(m){if(!/^\d{4}-\d{2}$/.test(m))return;try{localStorage.setItem(KEY,m)}catch(_){};motivation(true)}
function sync(){
 if(!triActive())return;
 syncParser();host();
 if(tab()==='motivation')motivation();
}
document.addEventListener('click',e=>{
 const t=e.target.closest?.('#tr14-shell [data-tr14]');if(t){setTimeout(sync,80);setTimeout(syncParser,350);return}
 if(e.target.closest?.('[data-mprev]')){choose(shift(selected(),-1));return}
 if(e.target.closest?.('[data-mnext]')){choose(shift(selected(),1));return}
 if(e.target.closest?.('[data-mrefresh]')){motivation(true);return}
 if(e.target.closest?.('.nav-item,.bn-item,[data-page]'))setTimeout(sync,180);
},true);
document.addEventListener('change',e=>{const x=e.target.closest?.('[data-mmonth]');if(x)choose(x.value)},true);
setTimeout(sync,120);
window.RESANTA_SAFE_TRIOVIST_V236200=Object.freeze({version:V,parserOnlyInParserTab:true,motivationCompare:true,noPolling:true});
})();