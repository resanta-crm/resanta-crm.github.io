from pathlib import Path
import json

ROOT=Path('.')

def replace_one(path, old, new):
    p=ROOT/path
    s=p.read_text(encoding='utf-8')
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'{path}: expected 1 occurrence, found {n}: {old[:100]!r}')
    p.write_text(s.replace(old,new),encoding='utf-8')

# Triovist workspace: one new isolated panel-mode tab; existing work/commerce behavior stays unchanged.
p='assets/34-triovist-root-v23614.js'
replace_one(p,"/* RESANTA CRM v23.6.116 · TRIOVIST ROOT · explicit 21vek parser tab for managers */","/* RESANTA CRM v23.6.120 · TRIOVIST ROOT · groups dynamics isolated analytics tab */")
replace_one(p,"const V='v23.6.116',STORE='resanta_triovist_root_v23614_tab',LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);","const V='v23.6.120',STORE='resanta_triovist_root_v23614_tab',LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);")
replace_one(p,"const WORK=['home','sales','stock','tasks','motivation','cards','parser'],COMM=['anp','si','budget','price'];","const WORK=['home','sales','groups','stock','tasks','motivation','cards','parser'],COMM=['anp','si','budget','price'];")
replace_one(p,"const w=[['home','📊 Сводка'],['sales','💰 Продажи'],['stock','📦 Остатки и заказ'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['cards','🧩 Карточки 21vek'],['parser','🌐 Парсер 21vek']],c=", "const w=[['home','📊 Сводка'],['sales','💰 Продажи'],['groups','📈 Группы и динамика'],['stock','📦 Остатки и заказ'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['cards','🧩 Карточки 21vek'],['parser','🌐 Парсер 21vek']],c=")
replace_one(p,"if(COMM.includes(active))await activate(active,false);sync()", "if(COMM.includes(active)||active==='groups')await activate(active,false);sync()")
replace_one(p,"if(COMM.includes(active)){p.style.setProperty('display','none','important');panel.style.setProperty('display','block','important')}", "if(COMM.includes(active)||active==='groups'){p.style.setProperty('display','none','important');panel.style.setProperty('display','block','important')}")
old="async function activate(k,save=false){if(![...WORK,...COMM].includes(k))k='home';if(WORK.includes(k))await work(k);else{choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');if(k==='anp'||k==='si')await expense(k,month());else if(k==='budget')await budget(month());else{price={q:'',only:false,offset:0,limit:50,last:null};await prices()}}if(save)choose(k)}"
new="""async function activate(k,save=false){
  if(![...WORK,...COMM].includes(k))k='home';
  if(k==='groups'){
    choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');
    for(let i=0;i<20&&!window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120;i++)await new Promise(r=>setTimeout(r,50));
    const mod=window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120;
    if(!mod?.open)throw Error('Модуль «Группы и динамика» не загрузился. Остальные разделы Triovist доступны.');
    await mod.open(panel,ctx);
  }else if(WORK.includes(k))await work(k);
  else{choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');if(k==='anp'||k==='si')await expense(k,month());else if(k==='budget')await budget(month());else{price={q:'',only:false,offset:0,limit:50,last:null};await prices()}}
  if(save)choose(k)
}"""
replace_one(p,old,new)

# Compatibility loader: inherit cache-buster from its own URL so versions cannot diverge again.
p='assets/32-triovist-v23611.js'
replace_one(p,'/* RESANTA CRM v23.6.116 compatibility loader.','/* RESANTA CRM v23.6.120 compatibility loader.')
replace_one(p,"s.src='./assets/34-triovist-root-v23614.js?v=23.6.116';", "const cv=(()=>{try{return new URL(document.currentScript?.src||'',location.href).searchParams.get('v')||'23.6.120'}catch(_){return'23.6.120'}})().replace(/^v/,'');\ns.src='./assets/34-triovist-root-v23614.js?v='+encodeURIComponent(cv);")

# Page-scoped loader: module 82 loads only on Triovist, never globally.
p='assets/66-performance-root-v23657.js'
replace_one(p,"||'23.6.119'}catch(_){return'23.6.119'}})", "||'23.6.120'}catch(_){return'23.6.120'}})")
replace_one(p,"load('assets/81-triovist-21vek-export-v236109.js','perf-tri-21vek-export-v236109','RESANTA_TRIOVIST_21VEK_EXPORT_V236109')", "load('assets/81-triovist-21vek-export-v236109.js','perf-tri-21vek-export-v236109','RESANTA_TRIOVIST_21VEK_EXPORT_V236109'),\n    load('assets/82-triovist-group-dynamics-v236120.js','perf-tri-groups-v236120','RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120')")

# Atomic browser version bump.
p='index.html'
replace_one(p,"const APP_VERSION = '2026-09-14-resanta-crm-v23.6.119';", "const APP_VERSION = '2026-09-15-resanta-crm-v23.6.120';")
replace_one(p,'./assets/66-performance-root-v23657.js?v=23.6.119','./assets/66-performance-root-v23657.js?v=23.6.120')

app=ROOT/'data/app-version.json'
app.write_text(json.dumps({
    'version':'23.6.120',
    'released_at':'2026-09-15',
    'purpose':'Triovist: новый read-only раздел Группы и динамика',
    'deploy_trigger':'2026-09-15T08:25:00Z'
},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Remove one-shot publisher files from the final tree.
for name in ['patch_triovist_groups_v236120.py','.github/workflows/_tmp-triovist-groups-v236120.yml']:
    q=ROOT/name
    if q.exists(): q.unlink()
