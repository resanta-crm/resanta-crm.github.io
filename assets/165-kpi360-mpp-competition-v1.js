/* RESANTA CRM · MPP team competition. Reads ONLY sanitized team scores + own KPI history. */
(function(w){
'use strict';
if(w.RESANTA_KPI360_LEAGUE_V1)return;
const norm=x=>String(x||'').toLowerCase().trim().replace(/ё/g,'е');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const format=x=>num(x).toLocaleString('ru-RU',{maximumFractionDigits:1});
const label=m=>['','Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][Number(String(m).slice(5,7))]+' '+String(m).slice(0,4);
function model(data,profile){
 if(profile?.role!=='manager')return null;
 const list=Array.isArray(data?.history?.team)?data.history.team:[];
 const eligible=list.filter(x=>x.month<=data.month&&x.rank_overall!==null&&x.rank_overall!==undefined&&Number.isFinite(Number(x.overall_score)));
 const months=[...new Set(eligible.map(x=>x.month))].sort();
 const last=months[months.length-1];if(!last)return null;
 const board=eligible.filter(x=>x.month===last).sort((a,b)=>num(a.rank_overall)-num(b.rank_overall));
 const self=board.find(x=>norm(x.manager_name)===norm(profile.name));
 if(!self)return null;
 const series=months.map(m=>eligible.find(x=>x.month===m&&norm(x.manager_name)===norm(profile.name))).filter(Boolean).slice(-6);
 const previous=series.length>1?series[series.length-2]:null;
 const movement=previous?num(previous.rank_overall)-num(self.rank_overall):null;
 const gap=Math.max(0,num(board[0]?.overall_score)-num(self.overall_score));
 const personal=(data.history?.rows||[]).find(x=>x.month===last&&norm(x.manager_name)===norm(profile.name));
 return {month:last,board,self,series,movement,gap,personal};
}
function markup(data,profile){
 if(profile?.role!=='manager')return '';
 const x=model(data,profile);
 if(!x)return '<section class="kv-card league-card"><h3>🏆 Моя динамика и соревнование</h3><div class="kv-note">Рейтинг появится после поступления результатов и утверждения планов.</div></section>';
 const best=Math.max(100,...x.board.map(r=>num(r.overall_score)));
 const movement=x.movement===null?'Нет прошлого рейтинга':x.movement>0?'↑ На '+x.movement+' место выше':x.movement<0?'↓ На '+Math.abs(x.movement)+' место ниже':'Место не изменилось';
 const stats=[['🏆 Моё место',num(x.self.rank_overall)+' из '+num(x.self.team_size),movement],
 ['🎯 Общий KPI',format(x.self.overall_score)+'%','Среднее выполнение трёх планов'],
 ['🥇 До лидера',format(x.gap)+' п.п.',x.gap===0?'Ты лидируешь':'Разница в общем KPI']]
 .map(a=>'<div class="league-stat"><div class="kv-note">'+esc(a[0])+'</div><b>'+esc(a[1])+'</b><div class="kv-note">'+esc(a[2])+'</div></div>').join('');
 const medals=['🥇','🥈','🥉'];
 const rows=x.board.map(r=>{
  const mine=norm(r.manager_name)===norm(profile.name),rank=num(r.rank_overall),score=num(r.overall_score);
  return '<div class="league-row'+(mine?' mine':'')+'"><span style="font-size:17px">'+(medals[rank-1]||'#'+rank)+'</span><b>'+esc(r.manager_name)+'</b>'+
  '<div class="league-bar"><i style="width:'+Math.min(100,100*score/best)+'%;background:'+(mine?'#276fd8':'#9cabc1')+'"></i></div>'+
  '<b style="text-align:right">'+format(score)+'%</b></div>';
 }).join('');
 const trend=x.series.map(r=>'<div class="league-month"><span>'+esc(label(r.month).split(' ')[0])+'</span><b>'+num(r.rank_overall)+'</b>'+
 '<span class="kv-note">'+format(r.overall_score)+'%</span></div>').join('');
 const weak=[['продажи','sales','sales_plan'],['АКБ','akb','akb_plan'],['клиенты для KPI','bonus','bonus_plan']]
  .filter(a=>num(x.personal?.[a[2]])>0)
  .map(a=>({title:a[0],pct:Math.round(100*num(x.personal[a[1]])/num(x.personal[a[2]]))}))
  .sort((a,b)=>a.pct-b.pct)[0];
 const brief=(x.movement===null?'История места теперь доступна.':movement+'.')+
 (x.gap===0?' Ты на первом месте.':' До лидера '+format(x.gap)+' п.п.')+
 (weak?' Основной резерв — '+weak.title+' ('+weak.pct+'% плана).':'');
 const preliminary=x.month===new Date().toISOString().slice(0,7);
 return '<section class="kv-card league-card" aria-label="Моя динамика и соревнование"><div class="kv-top"><div>'+
 '<h3 style="margin:0">🏆 Моя динамика и соревнование</h3><div class="kv-note">Рейтинг '+esc(label(x.month))+
 (preliminary?' · предварительный':'')+(x.month!==data.month?' · последний доступный':'')+'</div></div>'+
 '<button data-league-history="'+esc(x.month)+'" type="button">Моя история →</button></div>'+
 '<div class="league-stats">'+stats+'</div>'+
 '<div class="league-panes"><div><h3>Рейтинг команды</h3>'+rows+
 '<div class="kv-note">Коллеги видят только общие проценты и места — чужие клиенты и продажи закрыты.</div></div>'+
 '<div><h3>Мои места за 6 месяцев</h3><div class="league-months">'+trend+'</div>'+
 '<div class="kv-note" style="margin-top:9px">Первое место — лучший результат за месяц.</div></div></div>'+
 '<div class="league-brief">✦ <b>Мой брифинг.</b> '+esc(brief)+'</div></section>';
}
function style(){
 if(document.getElementById('kpi360-league-v1-css'))return;
 const el=document.createElement('style');el.id='kpi360-league-v1-css';
 el.textContent=[
 '#kpi360-visual-v2 .league-card{margin:12px 0;border-color:#c6dbf8;background:linear-gradient(135deg,#fff,#f6faff)}',
 '#kpi360-visual-v2 .league-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}',
 '#kpi360-visual-v2 .league-stat{background:#fff;border:1px solid #e2e9f4;padding:11px;border-radius:10px;min-width:0}',
 '#kpi360-visual-v2 .league-stat b{display:block;font-size:23px;margin:5px 0}',
 '#kpi360-visual-v2 .league-panes{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
 '#kpi360-visual-v2 .league-row{display:grid;grid-template-columns:26px 82px minmax(0,1fr) 56px;align-items:center;gap:6px;padding:10px 5px;border-radius:8px}',
 '#kpi360-visual-v2 .league-row.mine{background:#e6f1ff}',
 '#kpi360-visual-v2 .league-bar{height:11px;background:#ebeff6;border-radius:99px;overflow:hidden}',
 '#kpi360-visual-v2 .league-bar i{display:block;height:100%;border-radius:99px}',
 '#kpi360-visual-v2 .league-months{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}',
 '#kpi360-visual-v2 .league-month{border-radius:8px;padding:9px 3px;background:#f1f6fc;text-align:center;font-size:11px}',
 '#kpi360-visual-v2 .league-month b{display:block;font-size:19px;color:#1765c3;margin:5px 0}',
 '#kpi360-visual-v2 .league-month:last-child{background:#e2efff;outline:1px solid #90bbf1}',
 '#kpi360-visual-v2 .league-brief{background:#eaf4ff;padding:12px;border-radius:10px;margin-top:12px;line-height:1.6}',
 '@media(max-width:700px){#kpi360-visual-v2 .league-panes{grid-template-columns:1fr}#kpi360-visual-v2 .league-stat b{font-size:20px}}',
 '@media(max-width:460px){#kpi360-visual-v2 .league-months{grid-template-columns:repeat(3,minmax(0,1fr))}#kpi360-visual-v2 .league-row{grid-template-columns:23px 75px minmax(0,1fr) 51px}}'
 ].join('\n');document.head.appendChild(el);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',style,{once:true});else style();
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-league-history]');if(!button||!button.closest('#kpi360-visual-v2'))return;
 const picker=document.getElementById('manager-kpi-month'),period=button.dataset.leagueHistory;
 if(picker&&picker.value!==period){picker.value=period;picker.dispatchEvent(new Event('change',{bubbles:true}));return}
 const self=document.querySelector('#kpi360-visual-v2 .kv-bar[data-manager]');
 if(self)self.click();
});
w.RESANTA_KPI360_LEAGUE_V1={model,markup,version:'1.0'};
})(window);