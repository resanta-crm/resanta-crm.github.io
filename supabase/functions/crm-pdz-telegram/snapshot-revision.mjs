// Pure, side-effect-free gate for late 1C snapshots after the daily 11:00 Minsk digest.
export function shouldSendPdzSnapshot(old, reportDate, importedAt) {
 if (!reportDate) return false;
 if (!old) return true;
 const oldDate=String(old.report_date||'').slice(0,10);
 const nextDate=String(reportDate).slice(0,10);
 if (!oldDate) return false; // Old/incomplete log: do not send unsolicited repeated notices
 if (nextDate>oldDate) return true;
 if (nextDate<oldDate) return false;
 // Reimports of the same 1C date may correct an outstanding balance.
 // Only compare stored exact import times; legacy logs without it remain deduped.
 const oldImported=String(old.source_imported_at||'');
 const nextImported=String(importedAt||'');
 return Boolean(oldImported&&nextImported&&nextImported>oldImported);
}
export function correctionPrefix(old) {
 return old?'🔄 <b>Обновление ПДЗ после нового отчёта 1С.</b> Предыдущая рассылка устарела; проверяй текущий список. Изменение долга само по себе не подтверждает поступление оплаты.\n\n':'';
}
