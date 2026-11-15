export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateShelfDraft(value){
 if(!value||!Array.isArray(value.items)||value.items.length<1||value.items.length>100)throw Error('shelf_items_missing');
 const seen=new Set();
 return value.items.map(x=>{
  const sku=String(x.sku||'').replace(/\s/g,'');
  if(!/^\d{1,8}(\/\d{1,8}){1,6}$/.test(sku))throw Error('shelf_sku_unclear');
  if(seen.has(sku))throw Error('shelf_duplicate_sku');seen.add(sku);
  const shelf=x.shelf_qty,reserve=x.reserve_qty;
  if(typeof shelf!=='number'||!Number.isFinite(shelf)||shelf<0||shelf>100000)throw Error('shelf_quantity_unclear');
  if(reserve!==null&&reserve!==undefined&&(typeof reserve!=='number'||!Number.isFinite(reserve)||reserve<0||reserve>100000))throw Error('shelf_quantity_unclear');
  return {sku,shelf_qty:shelf,reserve_qty:reserve??null};
 });
}
export function objectionReply(reason){
 const text=String(reason||'').toLocaleLowerCase('ru-RU');
 if(/дорог|цен/.test(text))return 'Уточните, с каким SKU и условиями клиент сравнивает цену: доставка, гарантия, отсрочка и комплектация. Зафиксируйте ответ; после этого подберём предложение. Скидку без согласования не обещайте.';
 if(/поставщик|уже.*работ/.test(text))return 'Уточните, что клиент ценит в действующем поставщике и чего не хватает. Предложите обсудить конкретное дополнение ассортимента или пробную поставку по его профилю.';
 if(/нет.*денег|бюджет|оплат/.test(text))return 'Уточните дату следующей закупки и доступный объём. Обсудите меньший пробный набор из подходящих SKU; отсрочку и финансовые условия сначала согласуйте.';
 if(/не.*нуж|спрос|не.*прода/.test(text))return 'Выясните, какие товары спрашивают покупатели и какие позиции уже занимают полку. Уточните сезонность и историю продаж перед предложением пробного ассортимента.';
 return 'Уточните конкретную причину отказа, кто принимает решение и при каких условиях клиент готов вернуться к разговору. Зафиксируйте следующий шаг и дату; окончательный отказ сохраните для разбора.';
}
