#!/usr/bin/env python3
from __future__ import annotations
import json, os, tempfile
from pathlib import Path
import openpyxl

os.environ.setdefault('SUPABASE_URL','http://127.0.0.1')
os.environ.setdefault('SUPABASE_KEY','validation-only')
from import_triovist_stocks_truth_v2355 import parse_partner_truth, VERSION


def synthetic_check():
    wb=openpyxl.Workbook(); ws=wb.active
    ws.append(['Артикул','Вид','Производитель','Номенклатура','Статистика продаж2','Статистика продаж1','Продажи за 3 мес.','Всего','Свободно','Резерв','В пути','Свободно','Заказ','Прогноз'])
    ws.append(['9044527','','Huter','Триммер Huter GET-12M-2Li (70/1/65)',126,42,14,193,191,0,0,0,2,23])
    ws.append(['5803705','','Ресанта','Маска Ресанта МС-6 (65/60)',64,55,28,1,0,0,60,51,10,45])
    for i in range(110):
        ws.append([100000+i,'','','Товар тест (71/2/%d)'%(1000+i),1,1,3,5,4,0,2,1,0,2])
    with tempfile.NamedTemporaryFile(suffix='.xlsx',delete=False) as f: path=f.name
    wb.save(path)
    rows,diag=parse_partner_truth(path)
    Path(path).unlink(missing_ok=True)
    by={r['sku']:r for r in rows}
    a=by['70/1/65']; b=by['65/60']
    assert float(a['sales_m3'])==14 and float(a['sales_m1'])==0 and float(a['sales_m2'])==0
    assert float(a['qty_total'])==191, a
    assert float(b['qty_total'])==51, b
    note=json.loads(a['match_note'])
    assert note['stat_sales_2']==126 and note['stat_sales_1']==42 and note['partner_forecast']==23
    return {'sales_3m_not_summed_with_statistics':True,'free_in_transit_only':True,'partner_forecast_preserved':True,'sample':{'70/1/65':note,'65/60_available':float(b['qty_total'])}}


def actual_check(path: Path):
    if not path.exists(): return {'present':False}
    rows,diag=parse_partner_truth(path)
    wanted={'70/1/65','72/17/1','72/11/6','65/60'}
    samples=[]
    for r in rows:
        if r['sku'] in wanted:
            n=json.loads(r['match_note']); samples.append({'sku':r['sku'],'sales_3m':float(r['sales_m3']),'available_21vek':float(r['qty_total']),'orders':float(r['qty_orders']),'partner_forecast':n.get('partner_forecast'),'stat_sales_2':n.get('stat_sales_2'),'stat_sales_1':n.get('stat_sales_1'),'free_now':n.get('free_now'),'in_transit':n.get('in_transit'),'free_in_transit':n.get('free_in_transit')})
    return {'present':True,'rows':len(rows),'diagnostics':diag,'control_samples':samples}

out={'version':VERSION,'status':'ok','synthetic':synthetic_check(),'actual_repo_file':actual_check(Path('data/stock_21vek.xlsx'))}
Path('data/triovist-stock-truth-validation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
