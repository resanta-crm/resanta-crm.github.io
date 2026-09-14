from pathlib import Path
import json

ROOT = Path('.')

def replace_once(path, old, new):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    if old not in s:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')

# Triovist root: make the own 21vek parser an explicit manager workspace tab.
replace_once('assets/34-triovist-root-v23614.js',
             '/* RESANTA CRM v23.6.97 · TRIOVIST ROOT · manager tabs visibility recovery */',
             '/* RESANTA CRM v23.6.116 · TRIOVIST ROOT · explicit 21vek parser tab for managers */')
replace_once('assets/34-triovist-root-v23614.js',
             "const V='v23.6.97',STORE='resanta_triovist_root_v23614_tab',LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);\nconst WORK=['home','sales','stock','tasks','motivation','cards'],COMM=['anp','si','budget','price'];",
             "const V='v23.6.116',STORE='resanta_triovist_root_v23614_tab',LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);\nconst WORK=['home','sales','stock','tasks','motivation','cards','parser'],COMM=['anp','si','budget','price'];")
replace_once('assets/34-triovist-root-v23614.js',
             "const w=[['home','📊 Сводка'],['sales','💰 Продажи'],['stock','📦 Остатки и заказ'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['cards','🧩 Карточки 21vek']],c=",
             "const w=[['home','📊 Сводка'],['sales','💰 Продажи'],['stock','📦 Остатки и заказ'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['cards','🧩 Карточки 21vek'],['parser','🌐 Парсер 21vek']],c=")
old_work = "async function work(k){choose(k);panel.style.setProperty('display','none','important');page().style.setProperty('display','block','important');const b=legacy(k);if(b)b.click();[0,80,250].forEach(ms=>setTimeout(()=>{if(page()?.classList.contains('active')){page().style.setProperty('display','block','important');shell.style.setProperty('display','block','important');hideOld()}},ms))}"
new_work = "async function work(k){choose(k);panel.style.setProperty('display','none','important');page().style.setProperty('display','block','important');if(k==='parser'){const h=legacy('home');if(h)h.click();try{await window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107?.refresh?.()}catch(_){}setTimeout(()=>{const r=document.getElementById('tri21-control-v236107');if(r){r.style.removeProperty('display');r.scrollIntoView({block:'start',behavior:'smooth'})}},120)}else{const b=legacy(k);if(b)b.click()}[0,80,250].forEach(ms=>setTimeout(()=>{if(page()?.classList.contains('active')){page().style.setProperty('display','block','important');shell.style.setProperty('display','block','important');if(k==='parser')document.getElementById('tri21-control-v236107')?.style.removeProperty('display');hideOld()}},ms))}"
replace_once('assets/34-triovist-root-v23614.js', old_work, new_work)
replace_once('assets/34-triovist-root-v23614.js',
             'managerTabRecovery:true,managerTabVisibilityRecovery:true',
             'managerTabRecovery:true,managerTabVisibilityRecovery:true,parserTab:true')

# Compatibility loader must fetch the new root instead of a permanently cached v23.6.97 URL.
replace_once('assets/32-triovist-v23611.js',
             '/* RESANTA CRM v23.6.14 compatibility loader.',
             '/* RESANTA CRM v23.6.116 compatibility loader.')
replace_once('assets/32-triovist-v23611.js',
             "s.src='./assets/34-triovist-root-v23614.js?v=23.6.97';",
             "s.src='./assets/34-triovist-root-v23614.js?v=23.6.116';")

# Root loader/cache version.
replace_once('assets/66-performance-root-v23657.js', "const V='23.6.115'", "const V='23.6.116'")

# App version and loader query.
replace_once('index.html', "const APP_VERSION = '2026-09-14-resanta-crm-v23.6.115';", "const APP_VERSION = '2026-09-14-resanta-crm-v23.6.116';")
replace_once('index.html', './assets/66-performance-root-v23657.js?v=23.6.115', './assets/66-performance-root-v23657.js?v=23.6.116')

appv = ROOT / 'data/app-version.json'
d = json.loads(appv.read_text(encoding='utf-8'))
d.update({
    'version': '23.6.116',
    'released_at': '2026-09-14',
    'purpose': 'Triovist: отдельная видимая вкладка «Парсер 21vek» для Александренко и Кришталь',
    'deploy_trigger': '2026-09-14T10:14:30Z'
})
appv.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('patched v23.6.116')
