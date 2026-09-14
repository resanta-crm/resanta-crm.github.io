from pathlib import Path
import json

p=Path('assets/74-markdown-v23687.js')
s=p.read_text(encoding='utf-8')
s=s.replace('/* RESANTA CRM v23.6.111 · УЦЕНКА','/* RESANTA CRM v23.6.114 · УЦЕНКА')
s=s.replace("const V='v23.6.111';","const V='v23.6.114';")
s=s.replace('Дилерская с НДС:', 'Мелкий опт 2 с НДС:')
s=s.replace("priceBasis:'Дилерская с НДС'", "priceBasis:'Мелкий опт 2 с НДС'")

old='id="md-discount-v23687" type="number" min="0" max="90" step="0.1" value='
new='id="md-discount-v23687" type="number" min="0" max="90" step="0.1" oninput="crmMarkdownPriceSyncV236114(\'discount\')" value='
if old not in s:
    raise SystemExit('discount input not found')
s=s.replace(old,new,1)

old='id="md-final-v23687" type="number" min="0" step="0.01" value='
new='id="md-final-v23687" type="number" min="0" step="0.01" oninput="crmMarkdownPriceSyncV236114(\'final\')" value='
if old not in s:
    raise SystemExit('final input not found')
s=s.replace(old,new,1)

marker='async function savePrice(){\n'
sync="""function priceSync(mode){
 const base=n(S.detail?.item?.base_price),d=$('md-discount-v23687'),f=$('md-final-v23687');
 if(!base||!d||!f)return;
 if(mode==='discount'){
  if(d.value===''){f.value='';return}
  const pct=Number(d.value);if(!Number.isFinite(pct))return;
  f.value=Math.max(0,base*(1-pct/100)).toFixed(2);
 }else{
  if(f.value===''){d.value='';return}
  const price=Number(f.value);if(!Number.isFinite(price)||price<0||price>base)return;
  const pct=(1-price/base)*100;
  d.value=Math.max(0,Math.min(90,pct)).toFixed(2).replace(/\\.?0+$/,'');
 }
}
"""
if marker not in s:
    raise SystemExit('savePrice marker not found')
s=s.replace(marker,sync+marker,1)

hook='window.crmMarkdownSavePriceV23687=savePrice;\n'
if hook not in s:
    raise SystemExit('savePrice export hook not found')
s=s.replace(hook,hook+'window.crmMarkdownPriceSyncV236114=priceSync;\n',1)
p.write_text(s,encoding='utf-8')

p=Path('assets/66-performance-root-v23657.js')
s=p.read_text(encoding='utf-8')
if "const V='23.6.112'" not in s:
    raise SystemExit('root version not found')
s=s.replace("const V='23.6.112'","const V='23.6.114'",1)
p.write_text(s,encoding='utf-8')

p=Path('index.html')
s=p.read_text(encoding='utf-8')
s=s.replace("const APP_VERSION = '2026-09-14-resanta-crm-v23.6.112';","const APP_VERSION = '2026-09-14-resanta-crm-v23.6.114';",1)
s=s.replace('./assets/66-performance-root-v23657.js?v=23.6.112','./assets/66-performance-root-v23657.js?v=23.6.114',1)
p.write_text(s,encoding='utf-8')

p=Path('data/app-version.json')
d=json.loads(p.read_text(encoding='utf-8'))
d['version']='23.6.114'
d['released_at']='2026-09-14'
d['purpose']='Уценка: цена «Мелкий опт 2 с НДС» и корректное повторное изменение скидки/финальной цены'
d['deploy_trigger']='2026-09-14T08:48:00Z'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
