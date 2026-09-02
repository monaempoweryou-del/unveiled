// views.js — screens. Each returns HTML; data always comes from the database.
import * as A from './api.js';
import { esc,n,ils,money,bidi,when,dateOnly,icon,pill,statusPill,payPill,STATUS_HE,PAY_METHOD_HE,
         card,cardHead,pageHead,backLink,empty,notice,dl,bar,chips,stat,row,tbl } from './ui.js';
import { incomeBars, donut, hBars, PAY_COLORS } from './charts.js';

const t0 = () => { const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
export const cache = { products:[], stock:[], drivers:[] };
export async function warm(){
  [cache.products, cache.stock, cache.drivers] = await Promise.all([A.products(), A.stock(), A.drivers()]);
}
const pName = id => cache.products.find(p=>p.id===id)?.name_he || '—';
const pPrice = id => +(cache.products.find(p=>p.id===id)?.price || 0);
export const itemsText = o => (o.order_items||[]).map(i=>`${i.products?.name_he||pName(i.product_id)} × ${i.qty}`).join(' · ');
const amountOf = o => +(o.final_amount ?? o.total ?? 0);

export function orderRow(o){
  return row({
    title:`${o.order_no?bidi('#'+o.order_no):pill('טיוטה','muted')} ${statusPill(o.status)} ${o.status==='delivered'?payPill(o.payment_status):''}`,
    sub:`${esc(o.customers?.name||'ללא לקוח')} · ${esc(itemsText(o))||'ללא פריטים'}`,
    end:`<span class="row-value">${ils(amountOf(o))}</span><span style="font-size:12px;color:var(--faint)">${when(o.created_at)}</span>`,
    to:'#/order/'+o.id });
}

// ------------------------------------------------------------------ dashboard
export async function dashboard(){
  const [all, st] = await Promise.all([A.orders(''), A.stock()]);
  cache.stock = st;
  const today = t0();
  const open = all.filter(o=>o.status==='open');
  const delivToday = all.filter(o=>o.status==='delivered' && o.delivered_at >= today);
  const salesToday = delivToday.reduce((a,o)=>a+amountOf(o),0);
  const paidToday  = delivToday.filter(o=>o.payment_status==='paid').reduce((a,o)=>a+amountOf(o),0);
  const unpaid = all.filter(o=>o.status==='delivered' && o.payment_status==='unpaid');
  const unpaidTotal = unpaid.reduce((a,o)=>a+amountOf(o),0);
  const low = st.filter(s=>s.low_stock_threshold!=null && s.available<=s.low_stock_threshold);
  const noStock = st.every(s=>s.physical===0);

  return `${pageHead('לוח בקרה','תמונת מצב נוכחית')}
  ${noStock ? notice('טרם הוזן מלאי פתיחה. <button class="btn btn-sm btn-primary" style="margin-inline-start:8px" data-act="nav" data-to="#/inventory/opening">הזנת מלאי פתיחה</button>','warn') : ''}
  <div style="height:${noStock?'14px':'0'}"></div>
  <div class="grid grid-2" style="margin-block-end:12px">
    ${stat({label:'הזמנות פתוחות',value:n(open.length),meta:'ממתינות לעדכון',tone:'info',to:'#/orders'})}
    ${stat({label:'נמסרו היום',value:n(delivToday.length),tone:'ok',to:'#/orders?f=delivered'})}
  </div>
  <div class="grid grid-2" style="margin-block-end:12px">
    ${stat({label:'מכירות היום',value:ils(salesToday),meta:'הזמנות שנמסרו',tone:'ok',to:'#/reports'})}
    ${stat({label:'נגבה היום',value:ils(paidToday),meta:'מתוך מה שנמסר',to:'#/reports'})}
  </div>
  <div class="grid grid-2" style="margin-block-end:12px">
    ${stat({label:'חוב פתוח',value:ils(unpaidTotal),meta:`${unpaid.length} הזמנות`,tone:unpaidTotal?'danger':'ok',to:'#/orders?f=unpaid'})}
    ${stat({label:'מלאי נמוך',value: low.length?n(low.length):'<span style="font-size:18px;color:var(--muted)">תקין</span>',
      meta: low.length?low.map(l=>l.name_he).join(', '):'אין חריגות',tone:low.length?'warn':'',to:'#/inventory'})}
  </div>
  ${open.length ? card(cardHead('ממתינות לעדכון',`${open.length} הזמנות פתוחות`,
      `<button class="btn btn-sm btn-primary" style="margin-inline-start:auto" data-act="nav" data-to="#/daily">עדכון יומי</button>`)
    + `<ul class="list">${open.slice(0,6).map(orderRow).join('')}</ul>`)
   : card(empty('אין הזמנות פתוחות','כל ההזמנות עודכנו','check'))}`;
}

// ------------------------------------------------------------------ new order
export function newOrder(mode='text'){
  const tabs = [{v:'text',l:'טקסט'},{v:'manual',l:'טופס'}];
  let body = '';
  if(mode==='text') body = `
    <div class="field"><label>הדביקו או הקלידו את ההזמנה כפי שהתקבלה</label>
      <textarea id="raw" rows="7" placeholder="לדוגמה:&#10;יעל שטרן&#10;4 מספרים ו־2 סוס&#10;כתובת: הרצל 12 תל אביב&#10;052-3310984"></textarea></div>
    <button class="btn btn-primary btn-lg btn-block" data-act="parse-text">${icon('check',18)} קריאת ההזמנה</button>`;
  if(mode==='manual') body = `<div id="manual-form"></div>`;
  return `${pageHead('הזמנה חדשה','בחרו איך נוח לכם להזין')}
    ${chips(tabs.map(t=>({v:t.v,l:t.l})), mode, 'new-mode')}
    ${card(`<div class="card-body">${body}</div>`)}`;
}

export function manualFormHtml(pre={}){
  const items = pre.items || [];
  return `
  <div class="field"><label>לקוח</label>
    <input id="cust-q" type="text" autocomplete="off" placeholder="שם, טלפון או כתובת"
      value="${esc(pre.name||'')}"><div id="cust-hits" class="hits"></div>
    <input type="hidden" id="cust-id" value="${esc(pre.customer_id||'')}">
    <div id="cust-chosen" class="hint"></div></div>
  <div class="grid grid-2">
    <div class="field"><label>טלפון</label><input id="f-phone" type="tel" value="${esc(pre.phone||'')}"></div>
    <div class="field"><label>כתובת</label><input id="f-addr" type="text" value="${esc(pre.address||'')}"></div>
  </div>
  <div class="field"><label>פריטים</label>
    <div class="line-head"><span>מוצר</span><span>כמות</span><span>מחיר ליחידה</span><span></span></div>
    <div id="lines">${
    (items.length?items:[{product_id:'',qty:1}]).map((it,i)=>lineHtml(it,i)).join('')}</div>
    <button class="btn btn-ghost btn-sm" data-act="add-line" style="margin-block-start:8px">${icon('plus',16)} הוספת פריט</button></div>
  <div class="field"><label>הערות והוראות מסירה</label><input id="f-notes" type="text" value="${esc(pre.notes||'')}"></div>
  <div class="tot" id="tot"></div>
  <button class="btn btn-primary btn-lg btn-block" data-act="review" style="margin-block-start:12px">${icon('check',18)} יצירת הזמנה</button>`;
}
export function lineHtml(it={},i=0){
  const price = it.unit_price ?? (cache.products.find(p=>p.id===it.product_id)?.price ?? '');
  return `<div class="line" data-line="${i}">
    <select class="l-prod">${['<option value="">בחרו מוצר</option>'].concat(
      cache.products.map(p=>`<option value="${p.id}" data-price="${p.price}" ${it.product_id===p.id?'selected':''}>${esc(p.name_he)}</option>`)).join('')}</select>
    <input class="l-qty" type="number" min="1" value="${it.qty||1}">
    <input class="l-price" type="number" min="0" step="0.5" value="${price}" placeholder="מחיר">
    <button class="icon-btn" data-act="del-line" data-i="${i}" aria-label="הסרה">${icon('x',18)}</button></div>`;
}

// ------------------------------------------------------------------ orders
export async function ordersView(filter='open'){
  const map = { open:'&status=eq.open', delivered:'&status=eq.delivered',
    cancelled:'&status=eq.cancelled', draft:'&status=eq.draft', unpaid:'&status=eq.delivered&payment_status=eq.unpaid', all:'' };
  const list = await A.orders(map[filter] ?? '');
  return `${pageHead('הזמנות',`${list.length} רשומות`,
    `<button class="btn btn-primary btn-sm" data-act="nav" data-to="#/new">${icon('plus',16)} הזמנה חדשה</button>
     ${filter==='open'&&list.length?`<button class="btn btn-ghost btn-sm" data-act="nav" data-to="#/daily">עדכון יומי</button>`:''}`)}
    ${chips([{v:'open',l:'פתוחות'},{v:'delivered',l:'נמסרו'},{v:'unpaid',l:'לא שולמו'},
             {v:'draft',l:'טיוטות'},{v:'cancelled',l:'בוטלו'},{v:'all',l:'הכול'}], filter,'filter-orders')}
    ${card(list.length?`<ul class="list">${list.map(orderRow).join('')}</ul>`:empty('אין הזמנות בסינון הזה','','orders'))}`;
}

export async function orderDetail(id){
  const o = await A.order(id);
  if(!o) return empty('הזמנה לא נמצאה');
  const amt = amountOf(o);
  const c = o.customers || {};
  let actions = '';
  if(o.status==='draft') actions += `<button class="btn btn-primary" data-act="open-order" data-id="${o.id}">${icon('check',18)} פתיחת הזמנה</button>`;
  if(o.status==='open') actions += `<button class="btn btn-primary" data-act="quick" data-id="${o.id}">${icon('check',18)} עדכון מהיר</button>`;
  if(o.status!=='delivered'&&o.status!=='cancelled') actions += `<button class="btn btn-ghost" data-act="edit-order" data-id="${o.id}">עריכה</button>`;
  if(o.status!=='cancelled'&&o.status!=='delivered') actions += `<button class="btn btn-danger" data-act="cancel-order" data-id="${o.id}">ביטול</button>`;

  return `${backLink('#/orders','הזמנות')}
  ${pageHead(o.order_no?('הזמנה #'+o.order_no):'טיוטה', `${when(o.created_at)}`)}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-block-end:14px">${statusPill(o.status)}
    ${o.status==='delivered'?payPill(o.payment_status):''}
    ${o.payment_method?pill(PAY_METHOD_HE[o.payment_method]||o.payment_method,'muted'):''}</div>
  ${actions?`<div class="page-actions" style="margin-block-end:14px">${actions}</div>`:''}

  ${card(cardHead('פריטים') + `<ul class="list">${(o.order_items||[]).map(i=>row({
      title:esc(i.products?.name_he||pName(i.product_id)),
      sub:`${i.qty} × ${money(i.unit_price)}`,
      end:`<span class="row-value">${ils(i.qty*i.unit_price)}</span>`, chev:false })).join('')
      || '<div class="card-body" style="color:var(--muted)">אין פריטים</div>'}</ul>
    <div class="card-foot" style="justify-content:space-between;align-items:center">
      <span style="color:var(--muted);font-size:13.5px">${o.final_amount!=null?'סכום סופי':'סכום ההזמנה'}</span>
      <b style="font-size:18px">${ils(amt)}</b></div>`)}

  ${card(cardHead('לקוח') + `<div class="card-body">${dl([
    ['שם', c.name?`<a href="#/customer/${o.customer_id}" data-act="nav" data-to="#/customer/${o.customer_id}" style="color:var(--brand)">${esc(c.name)}</a>`:'—'],
    ['טלפון', c.phone?bidi(c.phone):'—'],
    ['כתובת', esc(o.address||c.address||'—')],
    ['הערות', esc(o.notes||'—')],
  ])}</div>`)}

  ${card(cardHead('שליח','המערכת מכינה את ההודעה, אתם שולחים אותה') + `<div class="card-body">
    <div class="field"><label>בחירת שליח</label><select id="drv">
      <option value="">ללא שליח</option>
      ${cache.drivers.map(d=>`<option value="${d.id}" ${o.driver_id===d.id?'selected':''}>${esc(d.name)} · ${esc(d.phone)}</option>`).join('')}
    </select></div>
    ${cache.drivers.length?'':notice('לא הוגדרו שליחים. הוסיפו אותם בהגדרות.','warn')}
    <div style="display:grid;gap:8px;margin-block-start:12px">
      <button class="btn btn-primary btn-lg" data-act="share-driver" data-id="${o.id}">${icon('share',18)} שלח לשליח</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn btn-ghost" data-act="copy-msg" data-id="${o.id}">${icon('copy',16)} העתקה</button>
        <button class="btn btn-ghost" data-act="nav-map" data-id="${o.id}">${icon('pin',16)} ניווט</button>
      </div>
      <button class="btn btn-ghost" data-act="call-cust" data-id="${o.id}">${icon('phone',16)} התקשרות ללקוח</button>
    </div></div>`)}

  ${o.raw_input?card(cardHead('הטקסט שהוזן')+`<div class="card-body"><pre class="raw">${esc(o.raw_input)}</pre></div>`):''}
  ${o.attachment_url?card(cardHead('צרופה')+`<div class="card-body"><img src="${esc(o.attachment_url)}" style="max-width:100%;border-radius:12px"></div>`):''}`;
}

export function driverMessage(o){
  const c = o.customers||{};
  const lines = [
    `הזמנה #${o.order_no||''}`,
    `לקוח: ${c.name||''}`,
    c.phone?`טלפון: ${c.phone}`:'',
    `כתובת: ${o.address||c.address||''}`,
    '',
    ...(o.order_items||[]).map(i=>`${i.products?.name_he||pName(i.product_id)} × ${i.qty}`),
    '',
    o.payment_status!=='paid' ? `לגבייה: ${money(amountOf(o))}` : 'שולם מראש',
    o.instructions?`הוראות: ${o.instructions}`:'',
    o.notes?`הערות: ${o.notes}`:'',
  ];
  return lines.filter(l=>l!=='').join('\n');
}

// ------------------------------------------------------------------ daily update
export async function daily(){
  const list = await A.openOrders();
  const done = window.__dailyDone || new Set();
  const left = list.filter(o=>!done.has(o.id));
  return `${pageHead('עדכון יומי','עברו על ההזמנות הפתוחות אחת אחרי השנייה')}
  ${list.length?`<div class="prog"><b>${done.size} מתוך ${list.length} הזמנות עודכנו</b>${bar(list.length?done.size/list.length*100:0,'ok')}</div>`:''}
  ${left.length ? card(`<ul class="list">${left.map(o=>row({
      title:`${bidi('#'+o.order_no)} ${esc(o.customers?.name||'')}`,
      sub:`${esc(itemsText(o))} · ${esc(o.address||o.customers?.address||'')}`,
      end:`<span class="row-value">${ils(amountOf(o))}</span>
           <button class="btn btn-sm btn-primary" data-act="quick" data-id="${o.id}">עדכון מהיר</button>`,
      chev:false })).join('')}</ul>`)
    : card(empty('הכול מעודכן','אין הזמנות פתוחות שנותרו','check'))}`;
}

// ------------------------------------------------------------------ customers
export async function customersView(){
  const list = await A.customers();
  return `${pageHead('לקוחות',`${list.length} לקוחות`,
    `<button class="btn btn-ghost btn-sm" data-act="new-customer">${icon('plus',16)} לקוח חדש</button>`)}
  <div class="searchbar">${icon('search',18)}<input id="cust-search" type="search" placeholder="שם, טלפון, כתובת או מספר הזמנה" autocomplete="off"></div>
  <div id="search-results"></div>
  ${card(list.length?`<ul class="list" id="cust-list">${list.map(customerRow).join('')}</ul>`
    :empty('אין לקוחות עדיין','לקוח נוצר אוטומטית עם ההזמנה הראשונה','users'))}`;
}
export const customerRow = c => row({
  title:esc(c.name),
  sub:`${c.phone?bidi(c.phone):''}${c.address?' · '+esc(c.address):''}${c.last_order_at?' · '+dateOnly(c.last_order_at):''}`,
  end:`${+c.unpaid_balance>0?pill('חוב '+money(c.unpaid_balance),'danger'):''}<span style="font-size:12px;color:var(--faint)">${c.completed_orders||0} הזמנות</span>`,
  to:'#/customer/'+c.customer_id });

export async function customerDetail(id){
  const [c, s, os] = await Promise.all([A.customer(id), A.customerStats(id), A.customerOrders(id)]);
  if(!c) return empty('לקוח לא נמצא');
  return `${backLink('#/customers','לקוחות')}
  ${pageHead(c.name, c.phone||'')}
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'הזמנות שהושלמו',value:n(s?.completed_orders||0)})}
    ${stat({label:'סך מכירות',value:ils(s?.total_sales||0),tone:'ok'})}
    ${stat({label:'חוב פתוח',value:ils(s?.unpaid_balance||0),tone:+s?.unpaid_balance>0?'danger':'ok'})}
  </div>
  ${card(cardHead('פרטים',' ',`<button class="btn btn-sm btn-ghost" style="margin-inline-start:auto" data-act="edit-customer" data-id="${c.id}">עריכה</button>`)
    + `<div class="card-body">${dl([
      ['טלפון', c.phone?bidi(c.phone):'—'],
      ['טלפון נוסף', c.phone_alt?bidi(c.phone_alt):'—'],
      ['כתובת', esc(c.address||'—')],
      ['הוראות מסירה', esc(c.instructions||'—')],
      ['הערות', esc(c.notes||'—')],
      ['הזמנה אחרונה', dateOnly(s?.last_order_at)],
    ])}</div>`)}
  ${card(cardHead('היסטוריית הזמנות') + (os.length?`<ul class="list">${os.map(orderRow).join('')}</ul>`:empty('אין הזמנות')))}`;
}

// ------------------------------------------------------------------ inventory
export async function inventory(){
  const st = await A.stock(); cache.stock = st;
  const none = st.every(s=>s.physical===0 && s.reserved===0);
  return `${pageHead('מלאי','כמות פיזית, משוריין וזמין',
    `<button class="btn btn-ghost btn-sm" data-act="nav" data-to="#/inventory/opening">מלאי פתיחה</button>
     <button class="btn btn-ghost btn-sm" data-act="nav" data-to="#/inventory/moves">היסטוריית תנועות</button>`)}
  ${none?notice('לא הוזן מלאי. <button class="btn btn-sm btn-primary" style="margin-inline-start:8px" data-act="nav" data-to="#/inventory/opening">הזנת מלאי פתיחה</button>','warn'):''}
  <div style="height:${none?'14px':'0'}"></div>
  ${card(`<ul class="list">${st.map(s=>{
    const low = s.low_stock_threshold!=null && s.available<=s.low_stock_threshold;
    const pct = s.physical? (s.available/s.physical)*100 : 0;
    return `<div class="row"><div class="row-main">
      <div class="row-title">${esc(s.name_he)} ${s.reserved?pill('משוריין '+s.reserved,'info'):''} ${low?pill('נמוך','warn'):''}</div>
      <div class="row-sub">פיזי ${s.physical} · נמכר ${s.sold}</div>${bar(pct, pct<25?'danger':pct<50?'warn':'ok')}
    </div><div class="row-end"><span class="row-value" style="font-size:19px">${n(s.available)}</span>
      <span style="font-size:12px;color:var(--muted)">זמין</span>
      <button class="btn btn-sm btn-ghost" data-act="adjust" data-id="${s.product_id}">תיקון</button></div></div>`;
  }).join('')}</ul>`)}`;
}

export async function openingInventory(){
  const st = await A.stock(); cache.stock = st;
  const any = st.some(s=>s.physical!==0);
  return `${backLink('#/inventory','מלאי')}
  ${pageHead('מלאי פתיחה','הזינו את הכמויות האמיתיות שנמצאות במחסן עכשיו')}
  ${any?notice('כבר קיים מלאי במערכת. הזנה כאן <b>מוסיפה</b> תנועת פתיחה נוספת. לתיקון כמות קיימת השתמשו ב"תיקון" במסך המלאי.','warn')
       :notice('הכמויות שתזינו נרשמות כתנועת "מלאי פתיחה" עם שמכם והתאריך. אפשר לתקן בהמשך, וכל תיקון נשמר בהיסטוריה.','brand','check')}
  <div style="height:14px"></div>
  ${card(`<ul class="list">${st.map(s=>`<div class="row"><div class="row-main">
      <div class="row-title">${esc(s.name_he)}</div>
      <div class="row-sub">כמות נוכחית במערכת: ${s.physical}</div></div>
    <div class="row-end"><input class="op-qty" data-pid="${s.product_id}" type="number" min="0" placeholder="—"
      style="width:96px;text-align:center"></div></div>`).join('')}</ul>
    <div class="card-foot"><button class="btn btn-primary btn-block" data-act="save-opening">שמירת מלאי פתיחה</button></div>`)}`;
}

export async function movesView(){
  const ms = await A.movements(300);
  const KIND={opening:'מלאי פתיחה',adjust:'תיקון ידני',reserve:'שריון',release:'שחרור שריון',sale:'מכירה'};
  return `${backLink('#/inventory','מלאי')}
  ${pageHead('היסטוריית תנועות מלאי',`${ms.length} תנועות אחרונות`,
    `<button class="btn btn-ghost btn-sm" data-act="csv-moves">${icon('down',16)} ייצוא CSV</button>`)}
  ${card(ms.length?tbl([{l:'תנועה'},{l:'מוצר'},{l:'פיזי',n:1},{l:'משוריין',n:1},{l:'הזמנה'},{l:'סיבה'},{l:'מתי'}],
    ms.map(m=>`<tr><td>${esc(KIND[m.kind]||m.kind)}</td><td>${esc(m.products?.name_he||'')}</td>
      <td class="n">${m.physical_delta>0?'+':''}${m.physical_delta||''}</td>
      <td class="n">${m.reserved_delta>0?'+':''}${m.reserved_delta||''}</td>
      <td>${m.orders?.order_no?'#'+m.orders.order_no:'—'}</td>
      <td>${esc(m.reason||'')}</td><td style="white-space:nowrap;color:var(--muted)">${when(m.created_at)}</td></tr>`))
    :empty('אין תנועות'))}`;
}

// ------------------------------------------------------------------ reports
// Everything here reflects what the Owner entered. Merkaz does not connect to any
// payment service and never verifies that money moved.
function rangeOf(period, customFrom, customTo){
  const now = new Date();
  if(period==='today') return { from:t0(), to:null, label:'היום' };
  if(period==='week'){ const d=new Date(); d.setDate(d.getDate()-6); d.setHours(0,0,0,0);
    return { from:d.toISOString(), to:null, label:'השבוע' }; }
  if(period==='month'){ const d=new Date(); d.setDate(d.getDate()-29); d.setHours(0,0,0,0);
    return { from:d.toISOString(), to:null, label:'החודש' }; }
  if(period==='custom' && customFrom){
    const f=new Date(customFrom); f.setHours(0,0,0,0);
    const t=customTo?new Date(customTo):new Date(); t.setHours(23,59,59,999);
    return { from:f.toISOString(), to:t.toISOString(), label:'טווח מותאם' };
  }
  return { from:t0(), to:null, label:'היום' };
}

export async function reports(period='today', customFrom=null, customTo=null){
  const R = rangeOf(period, customFrom, customTo);
  const all = await A.orders('');
  const st  = await A.stock(); cache.stock = st;

  const inRange = ts => ts && ts >= R.from && (!R.to || ts <= R.to);
  const delivered = all.filter(o=>o.status==='delivered' && inRange(o.delivered_at));
  const cancelled = all.filter(o=>o.status==='cancelled' && inRange(o.updated_at));
  const openNow   = all.filter(o=>o.status==='open');

  const income  = delivered.reduce((a,o)=>a+amountOf(o),0);
  const paidSum = delivered.filter(o=>o.payment_status==='paid').reduce((a,o)=>a+amountOf(o),0);
  const unpaidSum = income - paidSum;
  const unpaidCount = delivered.filter(o=>o.payment_status==='unpaid').length;
  const avg = delivered.length ? income/delivered.length : 0;
  const unitsSold = delivered.reduce((a,o)=>a+(o.order_items||[]).reduce((b,i)=>b+i.qty,0),0);

  // income by day
  const byDay = {};
  delivered.forEach(o=>{ const k=(o.delivered_at||'').slice(0,10); byDay[k]=(byDay[k]||0)+amountOf(o); });
  const dayRows = Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>({
    label: dateOnly(k), short: new Date(k).toLocaleDateString('he-IL',{day:'numeric',month:'numeric'}), value:v }));

  // payment method: paid orders by the method entered, plus everything still unpaid
  const METHODS = ['cash','bit','crypto','other'];
  const byMethod = Object.fromEntries(METHODS.map(m=>[m,0]));
  delivered.filter(o=>o.payment_status==='paid').forEach(o=>{
    const m = METHODS.includes(o.payment_method) ? o.payment_method : 'other';
    byMethod[m] += amountOf(o);
  });
  const slices = METHODS.map(m=>({ label:PAY_METHOD_HE[m], value:byMethod[m], color:PAY_COLORS[m] }))
    .concat([{ label:'לא שולם', value:unpaidSum, color:PAY_COLORS.unpaid }]);

  // products sold
  const byProduct = {};
  delivered.forEach(o=>(o.order_items||[]).forEach(i=>{
    const k=i.products?.name_he||pName(i.product_id);
    (byProduct[k] ||= {qty:0,rev:0}); byProduct[k].qty+=i.qty; byProduct[k].rev+=i.qty*i.unit_price; }));
  const prodRows = Object.entries(byProduct).sort((a,b)=>b[1].qty-a[1].qty)
    .map(([k,v])=>({ label:k, value:v.qty, sub:`הכנסה מדווחת ${money(v.rev)}` }));

  const low = st.filter(s=>s.low_stock_threshold!=null && s.available<=s.low_stock_threshold);
  window.__rep = { all, delivered, byProduct, byMethod, byDay, range:R };

  return `${pageHead('דוחות','לפי מה שהוזן במערכת. אין חיבור לאמצעי תשלום ואין אימות של קבלת כסף.')}

  <div class="rng">
    ${[['today','היום'],['week','השבוע'],['month','החודש'],['custom','טווח מותאם']].map(([v,l])=>
      `<button class="rng-b ${period===v?'active':''}" data-act="filter-reports" data-v="${v}">${l}</button>`).join('')}
  </div>
  ${period==='custom'?`<div class="rng-custom">
    <label>מתאריך<input type="date" id="rf" value="${customFrom||''}"></label>
    <label>עד<input type="date" id="rt" value="${customTo||''}"></label>
    <button class="btn btn-primary btn-sm" data-act="apply-range">הצגה</button></div>`:''}

  <div class="grid grid-2" style="margin-block-end:12px">
    ${stat({label:'הכנסה מדווחת',value:ils(income),meta:R.label,tone:'ok'})}
    ${stat({label:'הזמנות שהושלמו',value:n(delivered.length),meta:`${unitsSold} יחידות`,tone:'info'})}
  </div>
  <div class="grid grid-2" style="margin-block-end:12px">
    ${stat({label:'שולם לפי דיווח',value:ils(paidSum),tone:'ok'})}
    ${stat({label:'טרם שולם',value:ils(unpaidSum),meta:`${unpaidCount} הזמנות`,tone:unpaidSum?'danger':'ok'})}
  </div>
  <div class="grid grid-2" style="margin-block-end:14px">
    ${stat({label:'ממוצע להזמנה',value:ils(avg)})}
    ${stat({label:'יחידות שנמכרו',value:n(unitsSold)})}
  </div>

  ${card(cardHead('הכנסה מדווחת לאורך זמן','לפי יום המסירה') + `<div class="card-body">${incomeBars(dayRows)}</div>`)}

  ${card(cardHead('פילוח לפי אמצעי תשלום שהוזן','הסכומים הם מה שדווח, לא אישור מהבנק')
    + `<div class="card-body">${donut(slices)}</div>`)}

  ${card(cardHead('סיכום הזמנות') + `<div class="card-body"><div class="grid grid-2">
      ${stat({label:'פתוחות',value:n(openNow.length),tone:'info',to:'#/orders?f=open'})}
      ${stat({label:'נמסרו',value:n(delivered.length),tone:'ok',to:'#/orders?f=delivered'})}
      ${stat({label:'בוטלו',value:n(cancelled.length),to:'#/orders?f=cancelled'})}
      ${stat({label:'לא שולמו',value:n(unpaidCount),tone:unpaidCount?'danger':'',to:'#/orders?f=unpaid'})}
    </div></div>`)}

  ${card(cardHead('מוצרים שנמכרו','כמויות שנמסרו בתקופה') + `<div class="card-body">${hBars(prodRows)}</div>`)}

  ${card(cardHead('מצב מלאי','נכון לעכשיו, לא תלוי בטווח התאריכים') + `<div class="card-body">
    ${low.length?notice(`<b>${low.length} מוצרים מתחת לסף:</b> ${esc(low.map(l=>l.name_he).join(', '))}`,'warn'):''}
    ${hBars(st.map(s=>({ label:s.name_he, value:s.available,
        sub:`פיזי ${s.physical} · משוריין ${s.reserved}`,
        color:(s.low_stock_threshold!=null && s.available<=s.low_stock_threshold)?'#B45309':undefined })),{unit:'זמין'})}
  </div>`)}

  ${card(cardHead('ייצוא','אופציונלי. הדוח המלא מוצג כאן במסך.') + `<div class="card-foot">
    <button class="btn btn-ghost btn-sm" data-act="csv-orders">${icon('down',16)} הזמנות</button>
    <button class="btn btn-ghost btn-sm" data-act="csv-products">${icon('down',16)} מוצרים</button>
    <button class="btn btn-ghost btn-sm" data-act="csv-customers">${icon('down',16)} לקוחות</button>
    <button class="btn btn-ghost btn-sm" data-act="csv-stock">${icon('down',16)} מלאי</button>
  </div>`)}`;
}

// ------------------------------------------------------------------ settings
export async function settings(){
  const [ds, ps] = await Promise.all([A.allDrivers(), A.products()]);
  cache.drivers = ds.filter(d=>d.active); cache.products = ps;
  const u = A.me();
  return `${pageHead('הגדרות')}
  ${card(cardHead('שליחים','אנשי קשר בלבד. אין להם חשבון או גישה למערכת.',
    `<button class="btn btn-sm btn-ghost" style="margin-inline-start:auto" data-act="new-driver">${icon('plus',16)} הוספה</button>`)
    + (ds.length?`<ul class="list">${ds.map(d=>row({
        title:esc(d.name)+(d.active?'':' '+pill('לא פעיל','muted')),
        sub:bidi(d.phone)+' · '+esc({whatsapp:'וואטסאפ',telegram:'טלגרם',sms:'SMS'}[d.method]||d.method),
        end:`<button class="btn btn-sm btn-ghost" data-act="edit-driver" data-id="${d.id}">עריכה</button>`,
        chev:false })).join('')}</ul>`:empty('לא הוגדרו שליחים','הוסיפו שליח כדי לשלוח לו הזמנות','users')))}
  ${card(cardHead('מוצרים ומחירים',' ',`<button class="btn btn-sm btn-ghost" style="margin-inline-start:auto" data-act="new-product">${icon('plus',16)} הוספה</button>`)
    + `<ul class="list">${ps.map(p=>row({ title:esc(p.name_he),
        sub:`${money(p.price)} ליחידה${p.low_stock_threshold!=null?' · סף התראה '+p.low_stock_threshold:''}`,
        end:`<button class="btn btn-sm btn-ghost" data-act="edit-product" data-id="${p.id}">עריכה</button>`, chev:false })).join('')}</ul>`)}
  ${card(cardHead('משתמש מחובר')+`<div class="card-body">${dl([
    ['שם', esc(u?.name||'—')], ['תפקיד', u?.role==='owner'?'בעלים':'מוקד'],
  ])}<button class="btn btn-ghost btn-block" data-act="signout" style="margin-block-start:12px">${icon('out',16)} יציאה</button></div>`)}
  ${card(cardHead('יומן פעילות')+`<div class="card-body"><button class="btn btn-ghost btn-block" data-act="nav" data-to="#/activity">צפייה ביומן</button></div>`)}`;
}

export async function activityView(){
  const rows = await A.activity(150);
  const ACT={draft_created:'טיוטה נוצרה',opened:'הזמנה נפתחה',delivered:'נמסרה',cancelled:'בוטלה',
    driver_set:'שליח שובץ',edit:'עריכה',create:'יצירה',update:'עדכון',adjust:'תיקון מלאי',opening:'מלאי פתיחה'};
  return `${backLink('#/settings','הגדרות')}${pageHead('יומן פעילות','כל שינוי נרשם עם המשתמש והזמן')}
  ${card(rows.length?`<ul class="list">${rows.map(r=>row({
    title:esc(ACT[r.action]||r.action)+' '+pill(r.entity,'muted'),
    sub:`${esc(r.app_users?.name||'—')} · ${when(r.created_at)}`, chev:false })).join('')}</ul>`:empty('אין רשומות'))}`;
}
