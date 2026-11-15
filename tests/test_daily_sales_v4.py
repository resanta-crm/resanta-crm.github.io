from datetime import date
import pytest
from daily_sales_report_v4 import Cell as C, parse_cells, parse_report


def grid():
    def r(name,q="",money="",indent=0):return [C(name,indent),C(q),C(money)]
    return [r("Валовая прибыль предприятия (BYN)"),r("Период: 16.11.2026 - 16.11.2026"),
            r('Подразделение В группе из списка "Витебск"'),r("Контрагент"),
            r("Номенклатура","Количество","Выручка"),r("Артикул"),
            r("Клиент ООО",3,100),r("Группа",3,100,2),
            r("Дрель",2,70,4),r("75/1/2",2,70,6),
            r("Лопата",1,30,4),r("73/7/1/6",1,30,6),r("Итого",3,100)]


def test_valid_detail_not_double_counted():
    report=parse_cells(grid());assert len(report['rows'])==2
    assert sum(x['qty']for x in report['rows'])==3
    assert report['report_day']=='2026-11-16'


def test_repeated_month_columns_not_summed():
    g=grid()
    for row in g:row.extend([C(row[1].value),C(row[2].value)])
    assert parse_cells(g)['total_qty']==3


def test_client_mismatch_rejected():
    g=grid();g[6][1]=C(4)
    with pytest.raises(ValueError,match='client totals'):parse_cells(g)


def test_truncated_sku_rejected():
    g=grid();del g[11]
    with pytest.raises(ValueError):parse_cells(g)


def test_monthly_report_rejected():
    g=grid();g[1][0]=C('Период: 01.11.2026 - 30.11.2026')
    with pytest.raises(ValueError,match='multi-day'):parse_cells(g)


def test_negative_returns_kept():
    g=grid()
    for i in [6,7,8,9,10,11,12]:
        g[i][1]=C(-abs(g[i][1].value));g[i][2]=C(-abs(g[i][2].value))
    r=parse_cells(g);assert r['total_qty']==-3 and r['rows'][0]['qty']==-2


def test_total_mismatch_rejected():
    g=grid();g[-1][2]=C(99)
    with pytest.raises(ValueError,match='report total'):parse_cells(g)


def test_missing_period_rejected():
    g=grid();g[1][0]=C('')
    with pytest.raises(ValueError,match='period'):parse_cells(g)


def test_unknown_report_rejected():
    g=grid();g[0][0]=C('Не тот отчёт')
    with pytest.raises(ValueError,match='Unknown'):parse_cells(g)


def test_explicit_empty_without_numeric_columns():
    g=grid()[:6]+[[C('Итого'),C(''),C('')]]
    g[4]=[C('Номенклатура'),C(''),C('')]
    r=parse_cells(g);assert r['explicit_empty'] and r['rows']==[]


def test_silent_empty_with_data_rejected():
    g=grid();g[4][1]=C('');g[4][2]=C('')
    with pytest.raises(ValueError,match='no quantity'):parse_cells(g)


def test_invalid_binary_rejected():
    with pytest.raises(ValueError,match='real XLS'):parse_report(b'<html>error</html>')


def test_imap_search_uses_ascii_and_downloads_only_dedicated_report(monkeypatch):
    import sync_daily_sales_v4 as sync
    from email.message import EmailMessage
    from datetime import datetime,timezone
    stamp=datetime.now(timezone.utc)
    day=stamp.astimezone(sync.ZoneInfo('Europe/Minsk')).date().isoformat()
    target=EmailMessage();target['Subject']=sync.SUBJECT+' от 15.11.2026';target['Date']=stamp;target['Message-ID']='<daily-test>'
    target.set_content('Report');target.add_attachment(b'daily-xls',maintype='application',subtype='vnd.ms-excel',filename='daily.xls')
    other=EmailMessage();other['Subject']='Unrelated monthly report';other['Date']=stamp
    calls=[]
    class Mail:
        def uid(self,command,*args):
            calls.append((command,args))
            if command=='search':
                assert all(x is None or str(x).isascii() for x in args)
                return 'OK',[b'11 12']
            if args[1].startswith('(BODY.PEEK[HEADER'):
                return 'OK',[(b'1 (UID 11 BODY[HEADER.FIELDS] {100}',other.as_bytes()),(b'2 (UID 12 BODY[HEADER.FIELDS] {100}',target.as_bytes())]
            assert args[0]==b'12'
            return 'OK',[(b'2 (UID 12 BODY[] {100}',target.as_bytes())]
    monkeypatch.setattr(sync,'parse_report',lambda content:{'report_day':day,'rows':[]})
    result=sync.candidates(Mail())
    assert len(result)==1 and result[0]['source_message_id']=='<daily-test>'
    assert all('PEEK' in args[1] for cmd,args in calls if cmd=='fetch')
