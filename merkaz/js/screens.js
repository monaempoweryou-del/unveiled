// screens.js — every screen renderer. Returns HTML strings; app.js delegates events.
import * as C from './core.js';
import { PRODUCTS, USERS, CUSTOMERS, ROLE_HE, ROLE_DESC, STATUS_HE, MOVE_HE,
         PAY_METHOD_HE, LOW_GOODS_NOTE } from './data.js';
import { esc, n, ils, bidi, when, dateOnly, icon, pill, statusPill, paymentPill,
         card, cardHead, stat, empty, notice, pageHead, backLink, row, seg, chips,
         bar, dl, tbl } from './ui.js';

const DAY = 86400000;
const drivers = () => USERS.filter(u=>u.role==='driver');
const cust = id => C.customer(id) || { name:'לקוח', phone:'', address:'' };
const pName = id => C.product(id)?.he || id;
const uName = id => C.user(id)?.name || '—';

const orderLinesText = o => o.lines.map(l=>`${pName(l.product)} × ${l.qty}`).join(' · ');

export function orderRow(o, opts={}){
  const c = cust(o.customer);
  return row({
    title: `${bidi(o.no)} ${statusPill(o.status)} ${o.exception && o.status!=='exception' ? pill('חריגה','danger') : ''}`,
    sub: `${esc(c.name)} · ${esc(orderLinesText(o))}`,
    end: `<span class="row-value">${ils(o.status==='delivered'||o.status==='partially_delivered'?C.deliveredTotal(o):o.total)}</span>${opts.pay!==false?paymentPill(o.payment):''}`,
    to: '#/order/'+o.id,
  });
}

// ============================================================ 1. DASHBOARD
export function dashboard(){
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0,0,0,0);
  const today = C.revenueBetween(startToday.getTime());
  const week  = C.revenueBetween(now - 7*DAY);
  const month = C.revenueBetween(now - 30*DAY);
  const open  = C.openOrders(), active = C.activeDeliveries();
  const done  = C.S.orders.filter(o=>o.status==='delivered'||o.status==='partially_delivered');
  const failed= C.S.orders.filter(o=>o.status==='failed');
  const unpaid= C.unpaidOrders();
  const owed  = unpaid.reduce((a,o)=>a+(o.due||0),0);
  const dx    = C.openDiscrepancies();
  const drafts= C.pendingDrafts();
  const whUnits = PRODUCTS.reduce((a,p)=>a+C.whAvailable(p.id),0);
  const drvUnits= PRODUCTS.reduce((a,p)=>a+C.inTransit(p.id),0);
  const low = C.lowStock();

  return `
  ${pageHead('לוח בקרה','תמונת מצב חיה של התפעול')}
  ${drafts.length ? notice(`<b>${drafts.length} טיוטות הזמנה</b> ממתינות לאישור עובד. <button class="btn btn-sm btn-primary" style="margin-inline-start:8px" data-act="nav" data-to="#/drafts">מעבר לטיוטות</button>`,'brand','check') : ''}
  ${dx.length ? notice(`<b>${dx.length} פערים פתוחים</b> דורשים החלטת מנהל. <button class="btn btn-sm btn-ghost" style="margin-inline-start:8px" data-act="nav" data-to="#/exceptions">בדיקה</button>`,'warn') : ''}

  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'מכירות היום',value:ils(today),meta:'סכום שנמסר בפועל',tone:'ok',to:'#/sales'})}
    ${stat({label:'מכירות השבוע',value:ils(week),meta:'7 ימים אחרונים',to:'#/sales'})}
    ${stat({label:'מכירות החודש',value:ils(month),meta:'30 ימים אחרונים',to:'#/sales'})}
  </div>

  <div class="grid grid-4" style="margin-block-end:14px">
    ${stat({label:'הזמנות פעילות',value:n(open.length),meta:`${active.length} בדרך ללקוח`,tone:'info',to:'#/orders'})}
    ${stat({label:'הזמנות שהושלמו',value:n(done.length),meta:'נמסרו במלואן או חלקית',tone:'ok',to:'#/history'})}
    ${stat({label:'משלוחים שנכשלו',value:n(failed.length),meta:'לא נרשמה מכירה',tone:failed.length?'danger':'',to:'#/history'})}
    ${stat({label:'יתרות לתשלום',value:ils(owed),meta:`${unpaid.length} הזמנות פתוחות`,tone:owed?'warn':'',to:'#/payments'})}
  </div>

  <div class="grid grid-2" style="margin-block-end:14px">
    ${stat({label:'מלאי זמין במחסן',value:n(whUnits)+' <span style="font-size:14px;font-weight:400;color:var(--muted)">יח׳</span>',meta:'לא כולל משוריין',to:'#/inventory/warehouse'})}
    ${stat({label:'מלאי אצל נהגים',value:n(drvUnits)+' <span style="font-size:14px;font-weight:400;color:var(--muted)">יח׳</span>',meta:`${drivers().length} נהגים`,to:'#/inventory/drivers'})}
  </div>

  <div class="grid grid-2">
    ${stat({label:'התראות מלאי נמוך',value: C.S.settings.lowStockEnabled ? n(low.length) : '<span style="font-size:17px;font-weight:500;color:var(--muted)">לא הוגדר</span>',
            meta: C.S.settings.lowStockEnabled ? 'מוצרים מתחת לסף' : 'ממתין להגדרת ספים',tone:'warn',to:'#/lowstock'})}
    ${stat({label:'פערים פתוחים',value:n(dx.length),meta:'דורשים אישור מנהל',tone:dx.length?'danger':'',to:'#/exceptions'})}
  </div>

  ${card(cardHead('פעילות אחרונה') + `<ul class="list">${
    C.S.orders.slice(0,6).map(o=>orderRow(o)).join('') || empty('אין פעילות')
  }</ul><div class="card-foot"><button class="btn btn-ghost btn-block" data-act="nav" data-to="#/orders">כל ההזמנות</button></div>`, 'card-top')}
  `;
}

// ============================================================ DRIVER HOME
export function driverHome(){
  const me = C.S.driverId || 'u_d1';
  const mine = C.S.orders.filter(o=>o.driver===me);
  const activeMine = mine.filter(o=>['assigned','ready_for_pickup','picked_up','out_for_delivery'].includes(o.status));
  const doneToday = mine.filter(o=>o.status==='delivered' && o.updatedAt > Date.now()-DAY);
  const held = PRODUCTS.map(p=>({p, q:C.driverHolds(me,p.id)})).filter(r=>r.q>0);
  const openQueue = C.S.orders.filter(o=>o.status==='awaiting_assignment');

  return `
  ${pageHead('המשלוחים שלי', uName(me))}
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'משלוחים פעילים',value:n(activeMine.length),tone:'info'})}
    ${stat({label:'הושלמו היום',value:n(doneToday.length),tone:'ok'})}
    ${stat({label:'יחידות ברכב',value:n(held.reduce((a,r)=>a+r.q,0))})}
  </div>

  ${openQueue.length ? card(cardHead('ממתין לשיבוץ','משלוחים פנויים לקבלה') +
    `<ul class="list">${openQueue.map(o=>row({
      title:`${bidi(o.no)} ${pill('פנוי','info')}`,
      sub:`${esc(cust(o.customer).name)} · ${esc(o.address)}`,
      end:`<span class="row-value">${ils(o.total)}</span><button class="btn btn-sm btn-primary" data-act="claim" data-id="${o.id}">קבלת משלוח</button>`,
      chev:false })).join('')}</ul>`) : ''}

  ${card(cardHead('בדרך ללקוח') + (activeMine.length
    ? `<ul class="list">${activeMine.map(o=>orderRow(o)).join('')}</ul>`
    : empty('אין משלוחים פעילים','כשתקבל משלוח הוא יופיע כאן','truck')))}

  ${card(cardHead('המלאי ברכב שלי') + (held.length
    ? `<ul class="list">${held.map(r=>row({ title:esc(r.p.he), sub:'יחידות ברכב',
        end:`<span class="row-value">${n(r.q)}</span>`, chev:false })).join('')}</ul>`
    : empty('הרכב ריק','אין כרגע סחורה באחריותך','box')))}
  `;
}

// ============================================================ 3-5. INVENTORY
export function inventoryOverview(){
  const totals = PRODUCTS.map(p=>({
    p, avail:C.whAvailable(p.id), res:C.reserved(p.id), drv:C.inTransit(p.id),
    sold:C.soldQty(p.id), ret:C.returnedQty(p.id), lost:C.lostQty(p.id),
  }));
  const sum = k => totals.reduce((a,t)=>a+t[k],0);
  return `
  ${pageHead('מלאי','תמונת מלאי מלאה לפי מיקום')}
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'זמין במחסן',value:n(sum('avail')),meta:'ניתן להבטחה ללקוח',tone:'ok',to:'#/inventory/warehouse'})}
    ${stat({label:'משוריין',value:n(sum('res')),meta:'שמור להזמנות מאושרות',tone:'info'})}
    ${stat({label:'אצל נהגים',value:n(sum('drv')),meta:'באחריות נהג',tone:'warn',to:'#/inventory/drivers'})}
  </div>
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'נמכר',value:n(sum('sold')),meta:'נמסר ללקוחות'})}
    ${stat({label:'הוחזר',value:n(sum('ret')),meta:'חזר למחסן'})}
    ${stat({label:'פגום · חסר · פג תוקף',value:n(sum('lost')),meta:'ירידות מלאי'})}
  </div>
  ${card(cardHead('פירוט לפי מוצר','לחיצה על מוצר פותחת היסטוריית תנועות מלאה') +
    tbl([{l:'מוצר'},{l:'זמין',n:1},{l:'משוריין',n:1},{l:'אצל נהגים',n:1},{l:'נמכר',n:1},{l:'סה״כ במערכת',n:1}],
      totals.map(t=>`<tr data-act="nav" data-to="#/product/${t.p.id}" style="cursor:pointer">
        <td><b>${esc(t.p.he)}</b></td>
        <td class="n">${n(t.avail)}</td><td class="n">${t.res?n(t.res):'—'}</td>
        <td class="n">${t.drv?n(t.drv):'—'}</td><td class="n">${n(t.sold)}</td>
        <td class="n"><b>${n(t.avail+t.res+t.drv)}</b></td></tr>`)))}
  `;
}

export function warehouse(){
  const rows = PRODUCTS.map(p=>{
    const av=C.whAvailable(p.id), res=C.reserved(p.id), phys=av+res;
    const pct = phys? (av/phys)*100 : 0;
    return { p, av, res, phys, pct };
  });
  const canAdjust = ['owner','store_manager'].includes(C.S.role);
  return `
  ${backLink('#/inventory','מלאי')}
  ${pageHead('מחסן ראשי','זמין מול משוריין')}
  ${notice('<b>זמין</b> הוא מה שניתן להבטיח ללקוח חדש. <b>משוריין</b> הוא מלאי ששמור להזמנות שכבר אושרו ואינו זמין לאף לקוח אחר.','brand','check')}
  <div style="height:14px"></div>
  ${card(`<ul class="list">${rows.map(r=>`
    <div class="row">
      <div class="row-main">
        <div class="row-title">${esc(r.p.he)} ${r.res?pill('משוריין '+r.res,'info'):''}</div>
        <div class="row-sub">סה״כ פיזי במחסן: ${r.phys} יח׳</div>
        ${bar(r.pct, r.pct<25?'danger':r.pct<50?'warn':'ok')}
      </div>
      <div class="row-end">
        <span class="row-value" style="font-size:19px">${n(r.av)}</span>
        <span style="font-size:12px;color:var(--muted)">זמין</span>
        ${canAdjust?`<button class="btn btn-sm btn-ghost" data-act="adjust" data-id="${r.p.id}">תיקון</button>`:''}
      </div>
    </div>`).join('')}</ul>`)}
  `;
}

export function driversInventory(){
  const list = drivers().map(d=>{
    const items = PRODUCTS.map(p=>({p,q:C.driverHolds(d.id,p.id)})).filter(x=>x.q>0);
    const active = C.S.orders.filter(o=>o.driver===d.id && ['assigned','ready_for_pickup','picked_up','out_for_delivery'].includes(o.status));
    return { d, items, units:items.reduce((a,i)=>a+i.q,0), active:active.length };
  });
  return `
  ${backLink('#/inventory','מלאי')}
  ${pageHead('מלאי לפי נהג','לכל נהג מיקום מלאי נפרד')}
  ${list.map(x=> card(
    cardHead(x.d.name, `${x.d.vehicle} · ${x.active} משלוחים פעילים`,
      `<span style="margin-inline-start:auto">${pill(x.units+' יח׳', x.units?'warn':'muted')}</span>`) +
    (x.items.length
      ? `<ul class="list" style="margin-block-start:12px">${x.items.map(i=>row({
          title:esc(i.p.he), end:`<span class="row-value">${n(i.q)}</span>`, chev:false })).join('')}</ul>`
      : `<div class="card-body"><div style="color:var(--muted);font-size:13.5px">הרכב ריק</div></div>`) +
    `<div class="card-foot"><button class="btn btn-ghost btn-sm" data-act="nav" data-to="#/inventory/driver/${x.d.id}">פירוט ותנועות</button></div>`
  )).join('')}
  `;
}

export function driverInventory(id){
  const d = C.user(id); if(!d) return empty('נהג לא נמצא');
  const items = PRODUCTS.map(p=>({p,q:C.driverHolds(id,p.id)})).filter(x=>x.q>0);
  const txns = C.S.txns.filter(t=>t.from===C.driverLoc(id)||t.to===C.driverLoc(id)).sort((a,b)=>b.at-a.at).slice(0,40);
  const orders = C.S.orders.filter(o=>o.driver===id);
  return `
  ${backLink('#/inventory/drivers','מלאי נהגים')}
  ${pageHead(d.name, `${d.vehicle} · ${d.phone}`)}
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'יחידות ברכב',value:n(items.reduce((a,i)=>a+i.q,0)),tone:'warn'})}
    ${stat({label:'משלוחים פעילים',value:n(orders.filter(o=>['assigned','ready_for_pickup','picked_up','out_for_delivery'].includes(o.status)).length),tone:'info'})}
    ${stat({label:'הושלמו',value:n(orders.filter(o=>o.status==='delivered').length),tone:'ok'})}
  </div>
  ${card(cardHead('מלאי נוכחי') + (items.length
    ? `<ul class="list">${items.map(i=>row({title:esc(i.p.he),end:`<span class="row-value">${n(i.q)}</span>`,chev:false})).join('')}</ul>`
    : empty('הרכב ריק','','box')))}
  ${card(cardHead('תנועות מלאי אחרונות') + (txns.length
    ? `<ul class="list">${txns.map(t=>row({
        title:`${esc(MOVE_HE[t.type]||t.type)} · ${esc(pName(t.product))}`,
        sub:`${when(t.at)} · ${esc(uName(t.actor))}${t.order?' · '+esc(C.order(t.order)?.no||''):''}`,
        end:`<span class="row-value">${t.to===C.driverLoc(id)?'+':'−'}${n(t.qty)}</span>`, chev:false })).join('')}</ul>`
    : empty('אין תנועות')))}
  `;
}

// ============================================================ 6. PRODUCT
export function productDetail(id){
  const p = C.product(id); if(!p) return empty('מוצר לא נמצא');
  const av=C.whAvailable(id), res=C.reserved(id), drv=C.inTransit(id);
  const txns = C.S.txns.filter(t=>t.product===id).sort((a,b)=>b.at-a.at);
  const alias = C.S.settings.aliasConfirmed;
  return `
  ${backLink('#/inventory','מלאי')}
  ${pageHead(p.he, `מחיר יחידה ${new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(p.price)}`)}
  ${id==='p_scissors' ? notice(alias
    ? 'השם <b>דוקטור</b> מאושר כשם נוסף למוצר זה. הודעות עם שני השמות ישויכו אוטומטית.'
    : 'השם <b>דוקטור</b> מסומן כשם אפשרי נוסף למוצר זה, אך <b>טרם אושר</b>. עד לאישור, כל הודעה עם השם הזה תסומן לבדיקה ידנית ולא תמוזג אוטומטית.', alias?'brand':'warn') : ''}
  <div style="height:14px"></div>
  <div class="grid grid-4" style="margin-block-end:14px">
    ${stat({label:'זמין',value:n(av),tone:'ok'})}
    ${stat({label:'משוריין',value:n(res),tone:'info'})}
    ${stat({label:'אצל נהגים',value:n(drv),tone:'warn'})}
    ${stat({label:'נמכר',value:n(C.soldQty(id))})}
  </div>
  ${card(cardHead('היסטוריית תנועות מלאה',`${txns.length} תנועות. הרישום הוא לצפייה בלבד ואינו ניתן למחיקה.`) +
    tbl([{l:'תנועה'},{l:'כמות',n:1},{l:'ממקור'},{l:'ליעד'},{l:'מבצע'},{l:'מתי'}],
      txns.map(t=>`<tr>
        <td>${esc(MOVE_HE[t.type]||t.type)}${t.reverses?' '+pill('תיקון','warn'):''}</td>
        <td class="n">${n(t.qty)}</td>
        <td>${esc(C.locName(t.from))}</td><td>${esc(C.locName(t.to))}</td>
        <td>${esc(uName(t.actor))}</td><td style="white-space:nowrap;color:var(--muted)">${when(t.at)}</td></tr>`)))}
  `;
}

// ============================================================ 7. ORDERS
const ORDER_FILTERS = [
  {v:'all',l:'הכול'},{v:'open',l:'פעילות'},{v:'draft',l:'טיוטות'},
  {v:'delivery',l:'במשלוח'},{v:'done',l:'הושלמו'},{v:'problem',l:'בעיות'},
];
export function orders(filter='all'){
  let list = C.S.orders.slice();
  if(C.S.role==='driver') list = list.filter(o=>o.driver===C.S.driverId);
  const f = {
    open:o=>['awaiting_assignment','assigned','ready_for_pickup','picked_up','out_for_delivery'].includes(o.status),
    draft:o=>['draft','requires_review'].includes(o.status),
    delivery:o=>['assigned','ready_for_pickup','picked_up','out_for_delivery'].includes(o.status),
    done:o=>['delivered','partially_delivered','closed'].includes(o.status),
    problem:o=>['failed','exception','return_pending','returned','cancelled'].includes(o.status)||o.exception,
  }[filter];
  if(f) list = list.filter(f);
  return `
  ${pageHead('הזמנות',`${list.length} הזמנות`)}
  ${chips(ORDER_FILTERS, filter, 'filter-orders')}
  ${card(list.length ? `<ul class="list">${list.map(o=>orderRow(o)).join('')}</ul>`
    : empty('אין הזמנות בסינון הזה','נסו סינון אחר','orders'))}
  `;
}

// ============================================================ 8. ORDER DETAIL
export function orderDetail(id){
  const o = C.order(id); if(!o) return empty('הזמנה לא נמצאה');
  const c = cust(o.customer);
  const hist = C.S.history.filter(h=>h.order===o.id).sort((a,b)=>b.at-a.at);
  const pays = C.S.payments.filter(p=>p.order===o.id);
  const dxs  = C.S.discrepancies.filter(d=>d.order===o.id);
  const role = C.S.role;
  const isDelivered = ['delivered','partially_delivered'].includes(o.status);
  const total = isDelivered ? C.deliveredTotal(o) : o.total;

  let actions = '';
  if(['draft','requires_review'].includes(o.status) && role!=='driver')
    actions += `<button class="btn btn-primary" data-act="confirm-order" data-id="${o.id}">${icon('check',18)} אישור הזמנה</button>
                <button class="btn btn-ghost" data-act="cancel-order" data-id="${o.id}">ביטול</button>`;
  if(o.status==='awaiting_assignment' && ['owner','store_manager'].includes(role))
    actions += `<button class="btn btn-primary" data-act="assign" data-id="${o.id}">${icon('truck',18)} שיבוץ נהג</button>`;
  if(o.status==='awaiting_assignment' && role==='driver')
    actions += `<button class="btn btn-primary" data-act="claim" data-id="${o.id}">קבלת משלוח</button>`;
  if(o.status==='assigned' && role!=='staff')
    actions += `<button class="btn btn-primary" data-act="handoff" data-id="${o.id}">${icon('box',18)} מסירה לנהג</button>`;
  if(o.status==='out_for_delivery')
    actions += `<button class="btn btn-ok" data-act="outcome" data-id="${o.id}">${icon('check',18)} עדכון תוצאת משלוח</button>`;
  if(isDelivered && o.payment!=='paid' && role!=='staff')
    actions += `<button class="btn btn-primary" data-act="pay" data-id="${o.id}">${icon('money',18)} רישום תשלום</button>`;
  if(['failed','partially_delivered'].includes(o.status) && ['owner','store_manager'].includes(role))
    actions += `<button class="btn btn-ghost" data-act="return" data-id="${o.id}">${icon('ret',18)} החזרה למחסן</button>`;
  if(o.status==='assigned' && ['owner','store_manager'].includes(role))
    actions += `<button class="btn btn-ghost" data-act="assign" data-id="${o.id}">שיבוץ מחדש</button>`;

  return `
  ${backLink('#/orders','הזמנות')}
  ${pageHead(o.no, `נוצרה ${when(o.createdAt)} · ${uName(o.createdBy)}`)}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-block-end:14px">
    ${statusPill(o.status)} ${paymentPill(o.payment)} ${o.exception && o.status!=='exception' ? pill('חריגה פתוחה','danger') : ''}
  </div>
  ${o.status==='failed' && o.failReason ? notice(`<b>סיבת הכישלון:</b> ${esc(o.failReason)}<br><span style="opacity:.85">לא נרשמה מכירה. הסחורה נשארת באחריות הנהג עד להחזרה או ניסיון נוסף.</span>`,'danger') : ''}
  ${o.status==='exception' ? notice('<b>ההזמנה מוקפאת בגלל פער בספירה.</b> לא בוצעה תנועת מלאי. נדרשת החלטת מנהל במסך החריגות.','danger') : ''}
  ${actions?`<div class="page-actions" style="margin-block-end:14px">${actions}</div>`:''}

  ${card(cardHead('פריטים') + `<ul class="list">${o.lines.map(l=>`
      <div class="row"><div class="row-main">
        <div class="row-title">${esc(pName(l.product))}</div>
        <div class="row-sub">${isDelivered
          ? `נמסרו ${l.delivered} מתוך ${l.qty} · ${new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(l.price)} ליחידה`
          : `${l.qty} יחידות · ${new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(l.price)} ליחידה`}</div>
      </div><div class="row-end"><span class="row-value">${ils((isDelivered?l.delivered:l.qty)*l.price)}</span>
      ${isDelivered && l.delivered<l.qty ? pill('חסר '+(l.qty-l.delivered),'warn') : ''}</div></div>`).join('')}</ul>` +
    `<div class="card-foot" style="justify-content:space-between;align-items:center">
      <span style="color:var(--muted);font-size:13.5px">${isDelivered?'סכום לפי מה שנמסר בפועל':'סכום ההזמנה'}</span>
      <b style="font-size:18px">${ils(total)}</b></div>`)}

  ${card(cardHead('לקוח ומשלוח') + `<div class="card-body">${dl([
    ['שם', bidi(c.name)],
    ['טלפון', bidi(c.phone)],
    ['כתובת', o.address ? esc(o.address) : pill('חסר','warn')],
    ['מועד מבוקש', o.when?esc(o.when):'—'],
    ['אמצעי תשלום', o.payMethod?esc(PAY_METHOD_HE[o.payMethod]||o.payMethod):'—'],
    ['נהג משובץ', o.driver?esc(uName(o.driver)):'—'],
  ])}</div>`)}

  ${card(cardHead('תשלום', 'סטטוס התשלום נשמר בנפרד מסטטוס המשלוח') + `<div class="card-body">${dl([
    ['סטטוס', paymentPill(o.payment)],
    ['שולם', ils(C.paidAmount(o))],
    ['יתרה', o.due>0?`<span style="color:var(--danger)">${ils(o.due)}</span>`:ils(0)],
  ])}${pays.length?`<ul class="list" style="margin-block-start:10px">${pays.map(p=>row({
      title:ils(p.amount)+' · '+esc(PAY_METHOD_HE[p.method]||p.method),
      sub:`${esc(uName(p.by))} · ${when(p.at)}`, chev:false })).join('')}</ul>`:''}</div>`)}

  ${dxs.length ? card(cardHead('פערים') + `<ul class="list">${dxs.map(d=>row({
    title:`${esc(pName(d.product))} ${d.status==='open'?pill('פתוח','danger'):pill('נסגר','ok')}`,
    sub:`צפוי ${d.expected} · נספר ${d.actual}${d.resolution?' · '+esc(d.resolution):''}`, chev:false })).join('')}</ul>`) : ''}

  ${card(cardHead('היסטוריית סטטוס','כל שינוי נרשם עם המשתמש, הערוץ והזמן') +
    `<div class="card-body"><ul class="tl">${hist.map(h=>`<li>
      <div class="tl-title">${esc(STATUS_HE[h.to]||h.to)}${h.from?` <span style="color:var(--faint);font-weight:400">מתוך ${esc(STATUS_HE[h.from]||h.from)}</span>`:''}</div>
      <div class="tl-meta">${esc(uName(h.actor))} · ${h.channel==='telegram'?'טלגרם':'מערכת'} · ${when(h.at)}${h.note?' · '+esc(h.note):''}</div>
    </li>`).join('')}</ul></div>`)}
  `;
}

// ============================================================ 9. DRAFTS
export function drafts(){
  const list = C.pendingDrafts();
  const review = C.S.orders.filter(o=>['draft','requires_review'].includes(o.status));
  return `
  ${pageHead('הזמנות חדשות וטיוטות','שיחות שזוהו כהזמנה אפשרית, ממתינות לאישור אנושי')}
  ${notice('טיוטה אינה משנה מלאי ואינה יוצרת מכירה. רק לאחר אישור של עובד מוסמך המערכת משריינת סחורה.','brand','shield')}
  <div style="height:14px"></div>
  ${card(cardHead('טיוטות מוואטסאפ', list.length?`${list.length} ממתינות`:'') + (list.length
    ? `<ul class="list">${list.map(d=>{
        const c = cust(d.customer);
        const low = d.confidence < .8;
        return row({
          title:`${esc(c.name)} ${low?pill('דורש בדיקה','warn'):pill('ביטחון גבוה','ok')}`,
          sub:`${esc(d.lines.map(l=>pName(l.product)+' × '+l.qty).join(' · '))}`,
          end:`<span style="font-size:12.5px;color:var(--muted)">${when(d.at)}</span>`,
          to:'#/draft/'+d.id });
      }).join('')}</ul>`
    : empty('אין טיוטות ממתינות','הפעילו את סימולטור הוואטסאפ כדי לראות שיחה נכנסת','orders')))}
  ${review.length ? card(cardHead('הזמנות שדורשות השלמה') +
    `<ul class="list">${review.map(o=>orderRow(o)).join('')}</ul>`) : ''}
  `;
}

// ============================================================ 10. STAFF CONFIRMATION
export function draftReview(id){
  const d = C.S.drafts.find(x=>x.id===id); if(!d) return empty('טיוטה לא נמצאה');
  const c = cust(d.customer);
  const missing = [];
  if(!d.address) missing.push('כתובת למשלוח');
  if(!d.payMethod) missing.push('אמצעי תשלום');
  if(d.alias && !C.S.settings.aliasConfirmed) missing.push('זיהוי מוצר לא ודאי');
  const total = d.lines.reduce((a,l)=>a + l.qty*C.product(l.product).price, 0);

  return `
  ${backLink('#/drafts','טיוטות')}
  ${pageHead('אישור הזמנה', `${c.name} · ${when(d.at)}`)}

  ${d.alias && !C.S.settings.aliasConfirmed ? notice(
    'הלקוח כתב <b>דוקטור</b>. ייתכן שזהו שם נוסף למוצר <b>מספרים</b>, אך הקשר טרם אושר. המערכת <b>אינה</b> ממזגת אותם אוטומטית. בחרו ידנית את המוצר הנכון לפני האישור.','warn') : ''}
  ${missing.length ? notice(`<b>חסר מידע:</b> ${esc(missing.join(' · '))}`,'warn') : ''}

  <div class="grid grid-2" style="margin-block-end:14px">
    ${stat({label:'רמת ביטחון בזיהוי',value:`<span class="num">${Math.round(d.confidence*100)}%</span>`,
      meta:d.confidence<.8?'מומלץ לעבור על הפרטים':'זיהוי ברור',tone:d.confidence<.8?'warn':'ok'})}
    ${stat({label:'סכום משוער',value:ils(total),meta:'לפי מחירון'})}
  </div>

  ${card(cardHead('השיחה המקורית','הטקסט נשמר כפי שהתקבל ואינו ניתן לשינוי') +
    `<div class="card-body"><div class="chat">${d.messages.map(m=>
      `<div class="bub ${m.dir==='in'?'in':'out'}">${esc(m.text)}<span class="t">${new Date(m.at).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})}</span></div>`
    ).join('')}</div></div>`)}

  ${card(cardHead('מה המערכת הבינה','ניתן לערוך כל שדה לפני האישור') +
    tbl([{l:'מוצר'},{l:'כמות',n:1},{l:'מחיר',n:1},{l:'סה״כ',n:1}],
      d.lines.map(l=>`<tr><td>${esc(pName(l.product))}${d.alias&&l.product==='p_scissors'?' '+pill('זוהה כ"דוקטור"','warn'):''}</td>
        <td class="n">${n(l.qty)}</td><td class="n">${ils(C.product(l.product).price)}</td>
        <td class="n">${ils(l.qty*C.product(l.product).price)}</td></tr>`)) +
    `<div class="card-body">${dl([
      ['לקוח', bidi(c.name)],['טלפון', bidi(c.phone)],
      ['כתובת', d.address?esc(d.address):pill('חסר','warn')],
      ['מועד מבוקש', d.when?esc(d.when):pill('לא צוין','warn')],
      ['אמצעי תשלום', d.payMethod?esc(PAY_METHOD_HE[d.payMethod]):pill('לא צוין','warn')],
    ])}</div>
    <div class="card-foot">
      <button class="btn btn-primary" data-act="promote-draft" data-id="${d.id}">${icon('check',18)} אישור הזמנה</button>
      <button class="btn btn-ghost" data-act="edit-draft" data-id="${d.id}">עריכת הזמנה</button>
      <button class="btn btn-ghost" data-act="ask-draft" data-id="${d.id}">בקשת הבהרה מהלקוח</button>
      <button class="btn btn-danger" data-act="discard-draft" data-id="${d.id}">ביטול טיוטה</button>
    </div>`)}
  `;
}

// ============================================================ 11. ASSIGNMENT
export function assignment(){
  const queue = C.S.orders.filter(o=>o.status==='awaiting_assignment');
  const assigned = C.S.orders.filter(o=>['assigned','ready_for_pickup'].includes(o.status));
  return `
  ${pageHead('שיבוץ נהגים','הזמנות מאושרות שממתינות לנהג')}
  ${notice('רק נהג אחד יכול להחזיק שיבוץ פעיל. אם שני נהגים לוחצים "קבלת משלוח" באותו רגע, הראשון מקבל והשני מקבל הודעה שהמשלוח כבר נתפס.','brand','shield')}
  <div style="height:14px"></div>
  ${card(cardHead('ממתין לשיבוץ', queue.length?`${queue.length} הזמנות`:'') + (queue.length
    ? `<ul class="list">${queue.map(o=>row({
        title:`${bidi(o.no)} ${statusPill(o.status)}`,
        sub:`${esc(cust(o.customer).name)} · ${esc(o.address||'ללא כתובת')}`,
        end:`<span class="row-value">${ils(o.total)}</span><button class="btn btn-sm btn-primary" data-act="assign" data-id="${o.id}">שיבוץ</button>`,
        chev:false })).join('')}</ul>`
    : empty('אין הזמנות שממתינות לשיבוץ','','truck')))}
  ${card(cardHead('משובצות, ממתינות לאיסוף') + (assigned.length
    ? `<ul class="list">${assigned.map(o=>row({
        title:`${bidi(o.no)} · ${esc(uName(o.driver))}`,
        sub:`${esc(cust(o.customer).name)} · ${esc(orderLinesText(o))}`,
        end:`<button class="btn btn-sm btn-ghost" data-act="handoff" data-id="${o.id}">מסירה לנהג</button>`,
        chev:false })).join('')}</ul>`
    : empty('אין הזמנות ממתינות לאיסוף','','box')))}
  `;
}

// ============================================================ 12-13. DELIVERIES
export function deliveries(){
  let list = C.activeDeliveries();
  if(C.S.role==='driver') list = list.filter(o=>o.driver===C.S.driverId);
  const byDriver = {};
  list.forEach(o=>{ (byDriver[o.driver||'none'] ||= []).push(o); });
  return `
  ${pageHead('משלוחים פעילים',`${list.length} משלוחים בדרך`)}
  ${Object.keys(byDriver).length ? Object.entries(byDriver).map(([d,os])=> card(
    cardHead(d==='none'?'ללא נהג':uName(d), `${os.length} משלוחים`) +
    `<ul class="list">${os.map(o=>orderRow(o)).join('')}</ul>`)).join('')
    : card(empty('אין משלוחים פעילים כרגע','משלוח יופיע כאן ברגע שנהג מקבל אותו','truck'))}
  `;
}

export function history(kind='done'){
  const map = {
    done:o=>['delivered','partially_delivered','closed'].includes(o.status),
    failed:o=>o.status==='failed',
    cancelled:o=>o.status==='cancelled',
  };
  let list = C.S.orders.filter(map[kind]);
  if(C.S.role==='driver') list = list.filter(o=>o.driver===C.S.driverId);
  return `
  ${pageHead('משלוחים שהושלמו ונכשלו','ארכיון תוצאות המשלוח')}
  ${chips([{v:'done',l:'הושלמו'},{v:'failed',l:'נכשלו'},{v:'cancelled',l:'בוטלו'}], kind, 'filter-history')}
  ${kind==='failed'?notice('משלוח שנכשל <b>לעולם אינו נרשם כמכירה</b>. הסחורה נשארת רשומה על הנהג עד להחזרה או לניסיון נוסף.','warn'):''}
  <div style="height:${kind==='failed'?'14px':'0'}"></div>
  ${card(list.length ? `<ul class="list">${list.map(o=>orderRow(o)).join('')}</ul>` : empty('אין רשומות בקטגוריה הזו','','truck'))}
  `;
}

// ============================================================ 14. RETURNS
export function returns(){
  const pending = C.S.orders.filter(o=>
    (['failed','partially_delivered'].includes(o.status)) &&
    o.lines.some(l=>C.driverHolds(o.driver, l.product)>0));
  const done = C.S.orders.filter(o=>o.status==='returned');
  return `
  ${pageHead('החזרות','סחורה שחוזרת מהנהג למחסן')}
  ${notice('החזרה דורשת אישור משני הצדדים: הנהג מוסר, והמחסן מאשר קבלה. כל פער בין הספירות נפתח כפער שדורש החלטת מנהל.','brand','shield')}
  <div style="height:14px"></div>
  ${card(cardHead('ממתין להחזרה', pending.length?`${pending.length} הזמנות`:'') + (pending.length
    ? `<ul class="list">${pending.map(o=>row({
        title:`${bidi(o.no)} ${statusPill(o.status)}`,
        sub:`${esc(uName(o.driver))} · ${esc(o.lines.filter(l=>C.driverHolds(o.driver,l.product)>0).map(l=>pName(l.product)+' × '+(l.qty-(l.delivered||0))).join(' · '))}`,
        end:`<button class="btn btn-sm btn-primary" data-act="return" data-id="${o.id}">קליטת החזרה</button>`,
        chev:false })).join('')}</ul>`
    : empty('אין סחורה שממתינה להחזרה','','ret')))}
  ${card(cardHead('החזרות שהושלמו') + (done.length
    ? `<ul class="list">${done.map(o=>orderRow(o,{pay:false})).join('')}</ul>`
    : empty('אין החזרות','','ret')))}
  `;
}

// ============================================================ 15. PAYMENTS
export function payments(){
  const unpaid = C.unpaidOrders();
  const owed = unpaid.reduce((a,o)=>a+(o.due||0),0);
  const paid = C.S.orders.filter(o=>o.payment==='paid' && ['delivered','partially_delivered'].includes(o.status));
  const collected = C.S.payments.reduce((a,p)=>a+p.amount,0);
  const byMethod = {};
  C.S.payments.forEach(p=>{ byMethod[p.method] = (byMethod[p.method]||0)+p.amount; });
  return `
  ${pageHead('מעקב תשלומים','סטטוס תשלום נשמר בנפרד מסטטוס המשלוח')}
  ${notice('הזמנה יכולה להיות <b>נמסרה</b> וגם <b>לא שולמה</b>. המערכת לעולם אינה מסיקה תשלום ממסירה.','brand','shield')}
  <div style="height:14px"></div>
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'יתרות פתוחות',value:ils(owed),meta:`${unpaid.length} הזמנות`,tone:owed?'danger':'ok'})}
    ${stat({label:'נגבה בסך הכול',value:ils(collected),meta:`${C.S.payments.length} תשלומים`,tone:'ok'})}
    ${stat({label:'הזמנות ששולמו',value:n(paid.length),tone:'ok'})}
  </div>
  ${card(cardHead('יתרות לגבייה') + (unpaid.length
    ? `<ul class="list">${unpaid.map(o=>row({
        title:`${bidi(o.no)} · ${esc(cust(o.customer).name)} ${paymentPill(o.payment)}`,
        sub:`נמסר ${when(o.updatedAt)} · ${esc(uName(o.driver))}`,
        end:`<span class="row-value" style="color:var(--danger)">${ils(o.due)}</span>
             <button class="btn btn-sm btn-primary" data-act="pay" data-id="${o.id}">רישום תשלום</button>`,
        chev:false })).join('')}</ul>`
    : empty('אין יתרות פתוחות','כל ההזמנות שנמסרו שולמו','money')))}
  ${card(cardHead('פילוח לפי אמצעי תשלום') + `<div class="card-body">${
    Object.keys(byMethod).length ? dl(Object.entries(byMethod).map(([m,v])=>[PAY_METHOD_HE[m]||m, ils(v)]))
    : '<div style="color:var(--muted);font-size:13.5px">אין תשלומים</div>'}</div>`)}
  `;
}

// ============================================================ 16. SALES
export function sales(period='30'){
  const from = period==='today' ? new Date(new Date().setHours(0,0,0,0)).getTime()
             : Date.now() - (+period)*DAY;
  const rows = C.salesRows(from);
  const revenue = rows.reduce((a,r)=>a+r.revenue,0);
  const units = rows.reduce((a,r)=>a+r.qty,0);
  const delivered = C.S.orders.filter(o=>['delivered','partially_delivered'].includes(o.status) && o.updatedAt>=from);
  const aov = delivered.length ? revenue/delivered.length : 0;
  const max = Math.max(1, ...rows.map(r=>r.revenue));

  const byDriver = {};
  C.S.txns.filter(t=>t.type==='driver_to_customer' && t.at>=from).forEach(t=>{
    const o = C.order(t.order); if(!o) return;
    const l = o.lines.find(x=>x.product===t.product); if(!l) return;
    byDriver[o.driver] = (byDriver[o.driver]||0) + t.qty*l.price;
  });
  const byStaff = {};
  delivered.forEach(o=>{ byStaff[o.confirmedBy||o.createdBy] = (byStaff[o.confirmedBy||o.createdBy]||0) + C.deliveredTotal(o); });

  return `
  ${pageHead('דוחות מכירות','מבוסס על מה שנמסר בפועל, לא על מה שהוזמן')}
  ${chips([{v:'today',l:'היום'},{v:'7',l:'7 ימים'},{v:'30',l:'30 ימים'},{v:'90',l:'90 יום'}], period, 'filter-sales')}
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'הכנסות',value:ils(revenue),tone:'ok'})}
    ${stat({label:'יחידות שנמסרו',value:n(units)})}
    ${stat({label:'ממוצע להזמנה',value:ils(aov),meta:`${delivered.length} הזמנות`})}
  </div>
  ${card(cardHead('מכירות לפי מוצר') + (rows.length ? `<ul class="list">${rows.map(r=>`
    <div class="row"><div class="row-main">
      <div class="row-title">${esc(pName(r.product))}</div>
      <div class="row-sub">${r.qty} יחידות</div>${bar(r.revenue/max*100)}
    </div><div class="row-end"><span class="row-value">${ils(r.revenue)}</span></div></div>`).join('')}</ul>`
    : empty('אין מכירות בתקופה הזו','','chart')))}
  <div class="grid grid-2">
    ${card(cardHead('לפי נהג') + `<div class="card-body">${Object.keys(byDriver).length
      ? dl(Object.entries(byDriver).sort((a,b)=>b[1]-a[1]).map(([d,v])=>[uName(d), ils(v)]))
      : '<div style="color:var(--muted);font-size:13.5px">אין נתונים</div>'}</div>`)}
    ${card(cardHead('לפי עובד') + `<div class="card-body">${Object.keys(byStaff).length
      ? dl(Object.entries(byStaff).sort((a,b)=>b[1]-a[1]).map(([d,v])=>[uName(d), ils(v)]))
      : '<div style="color:var(--muted);font-size:13.5px">אין נתונים</div>'}</div>`)}
  </div>
  ${card(cardHead('רווח גולמי') + `<div class="card-body">${notice(
    'חישוב רווח גולמי <b>מושבת</b> עד לקבלת עלויות המוצרים מהלקוח. לא מוצג אומדן ולא מומצא מספר.','warn')}</div>`)}
  `;
}

// ============================================================ 17. LOW STOCK
export function lowStock(){
  const on = C.S.settings.lowStockEnabled;
  const rows = PRODUCTS.map(p=>({ p, avail:C.whAvailable(p.id), th:C.S.settings.thresholds[p.id] ?? '' }));
  const breached = on ? rows.filter(r=>r.th!=='' && r.avail<=r.th) : [];
  return `
  ${pageHead('התראות מלאי נמוך', on?'ספים פעילים':'ממתין להגדרת ספים')}
  ${!on ? notice(
    'הרשימה שהתקבלה תחת הכותרת <b>"סחורה נמוכה"</b> נשמרה במערכת אך <b>אינה מופעלת</b>, כי טרם הובהר אם מדובר בספי התראה, בכמויות להזמנה מחדש או ברמות מלאי רצויות. עד להבהרה, המערכת אינה מייצרת התראות ואינה משתמשת במספרים האלה באף חישוב.','warn')
  : notice(`${breached.length} מוצרים נמצאים מתחת לסף שהוגדר.`, breached.length?'warn':'brand', breached.length?'alert':'check')}
  <div style="height:14px"></div>

  ${card(cardHead('הגדרת ספים','ניתן להפעיל רק לאחר אישור הלקוח למשמעות המספרים') +
    `<div class="card-body">
      <label style="display:flex;align-items:center;gap:10px;font-size:14.5px;cursor:pointer">
        <input type="checkbox" id="ls-toggle" ${on?'checked':''} style="width:20px;height:20px">
        <span>הפעלת התראות מלאי נמוך</span>
      </label>
    </div>` +
    tbl([{l:'מוצר'},{l:'זמין',n:1},{l:'סף התראה',n:1},{l:'סטטוס'}],
      rows.map(r=>`<tr>
        <td>${esc(r.p.he)}</td><td class="n">${n(r.avail)}</td>
        <td class="n"><input type="number" data-th="${r.p.id}" value="${r.th}" placeholder="—"
           style="width:82px;padding:6px;text-align:center" ${on?'':'disabled'}></td>
        <td>${!on?pill('לא פעיל','muted'): r.th===''?pill('לא הוגדר','muted'): r.avail<=r.th?pill('מתחת לסף','danger'):pill('תקין','ok')}</td>
      </tr>`)) +
    `<div class="card-foot"><button class="btn btn-primary btn-sm" data-act="save-thresholds">שמירת ספים</button></div>`)}

  ${card(cardHead('הנתונים שהתקבלו מהלקוח','נשמרים כרשומת קליטה בלבד') +
    tbl([{l:'שם כפי שנכתב'},{l:'כמות',n:1}],
      LOW_GOODS_NOTE.map(r=>`<tr><td>${esc(r.as_written)}</td><td class="n">${n(r.qty)}</td></tr>`)) +
    `<div class="card-body">${notice('המוצר <b>עכביש</b> אינו מופיע ברשימה זו ולא הומצא עבורו ערך.','info')}</div>`)}
  `;
}

// ============================================================ 18. EXCEPTIONS
export function exceptions(){
  const open = C.openDiscrepancies();
  const closed = C.S.discrepancies.filter(d=>d.status==='resolved');
  const exOrders = C.S.orders.filter(o=>o.status==='exception');
  const canResolve = ['owner','store_manager'].includes(C.S.role);
  return `
  ${pageHead('חריגות ופערים','כל מקרה שדורש החלטה אנושית')}
  <div class="grid grid-3" style="margin-block-end:14px">
    ${stat({label:'פערים פתוחים',value:n(open.length),tone:open.length?'danger':'ok'})}
    ${stat({label:'הזמנות מוקפאות',value:n(exOrders.length),tone:exOrders.length?'warn':'ok'})}
    ${stat({label:'פערים שנסגרו',value:n(closed.length)})}
  </div>
  ${card(cardHead('פערים פתוחים') + (open.length ? `<ul class="list">${open.map(d=>{
    const diff = d.actual - d.expected;
    return row({
      title:`${esc(pName(d.product))} ${pill(d.kind==='handoff_mismatch'?'פער במסירה לנהג':'פער בהחזרה','danger')}`,
      sub:`הזמנה ${esc(C.order(d.order)?.no||'')} · צפוי ${d.expected} · נספר ${d.actual} · הפרש ${diff>0?'+':''}${diff} · ${when(d.at)}`,
      end: canResolve?`<button class="btn btn-sm btn-primary" data-act="resolve-dx" data-id="${d.id}">טיפול</button>`
        :`<span style="font-size:12.5px;color:var(--muted)">נדרש מנהל</span>`,
      chev:false });
  }).join('')}</ul>` : empty('אין פערים פתוחים','כל הספירות תואמות','check')))}
  ${closed.length ? card(cardHead('פערים שטופלו') + `<ul class="list">${closed.map(d=>row({
    title:`${esc(pName(d.product))} ${pill('נסגר','ok')}`,
    sub:`${esc(d.resolution||'')} · ${esc(uName(d.resolvedBy))} · ${when(d.resolvedAt||d.at)}`, chev:false })).join('')}</ul>`) : ''}
  ${card(cardHead('מקורות חריגה נוספים') + `<div class="card-body">${dl([
    ['אירועי וובהוק שנכשלו', n(0)],
    ['אירועים כפולים שנחסמו', n(C.S.txns.length ? 0 : 0)],
    ['טיוטות בביטחון נמוך', n(C.S.drafts.filter(d=>d.confidence<0.8).length)],
    ['שיבוצי נהג שהוחלפו', n(C.S.audit.filter(a=>a.action==='reassign').length)],
    ['הזמנות שבוטלו', n(C.S.orders.filter(o=>o.status==='cancelled').length)],
  ])}</div>`)}
  `;
}

// ============================================================ 19. USERS
export function users(){
  return `
  ${pageHead('משתמשים ונהגים','כל פעולה במערכת משויכת למשתמש מזוהה')}
  ${['owner','store_manager','staff','driver'].map(r=>{
    const list = USERS.filter(u=>u.role===r);
    if(!list.length) return '';
    return card(cardHead(ROLE_HE[r], ROLE_DESC[r]) + `<ul class="list">${list.map(u=>{
      const dOrders = u.role==='driver' ? C.S.orders.filter(o=>o.driver===u.id) : [];
      const units = u.role==='driver' ? PRODUCTS.reduce((a,p)=>a+C.driverHolds(u.id,p.id),0) : 0;
      return row({
        title:`${esc(u.name)} ${pill(ROLE_HE[u.role], u.role==='owner'?'brand':u.role==='driver'?'violet':'muted')}`,
        sub:`${bidi(u.phone)}${u.tg?' · טלגרם '+bidi(u.tg):''}${u.role==='driver'?` · ${dOrders.length} משלוחים · ${units} יח׳ ברכב`:''}`,
        end: u.role==='driver'?`<button class="btn btn-sm btn-ghost" data-act="nav" data-to="#/inventory/driver/${u.id}">מלאי</button>`:'',
        chev:false });
    }).join('')}</ul>`);
  }).join('')}
  ${card(cardHead('זיהוי בטלגרם','נהג יכול לפעול רק אם חשבון הטלגרם שלו מקושר למשתמש מאומת') +
    `<div class="card-body">${notice('קישור חשבונות טלגרם יבוצע בעת חיבור הבוט. עד אז, כל פעולה בהדגמה מיוחסת למשתמש הנבחר במחליף התפקידים.','info')}</div>`)}
  `;
}

// ============================================================ 20. INTEGRATIONS
export function integrations(){
  const wa = C.S.settings.waStatus, tg = C.S.settings.tgStatus;
  const badge = s => s==='connected'?pill('מחובר','ok'):s==='error'?pill('שגיאה','danger'):pill('ממתין לחיבור','warn');
  const feat = t => `<div class="feat">${icon('check',16)}<span>${t}</span></div>`;
  return `
  ${pageHead('אינטגרציות','חיבור ערוצי התקשורת למערכת')}
  ${notice('שני החיבורים <b>אינם פעילים</b> בגרסת ההדגמה. כדי להפעיל אותם נדרשים אישור והרשאות מהלקוח. המסכים והתהליכים במערכת כבר בנויים ומוכנים לחיבור.','warn')}
  <div style="height:14px"></div>

  ${card(`<div class="card-body">
    <div class="integ">
      <div class="integ-logo wa">${icon('orders',24)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <h2 style="font-size:17px">WhatsApp Business</h2>${badge(wa)}
        </div>
        <p style="color:var(--muted);font-size:13.5px;margin-block-start:4px">הערוץ מול הלקוחות. הצוות ממשיך לדבר עם הלקוחות כרגיל.</p>
      </div>
    </div>
    <div style="margin-block-start:16px">
      ${feat('קליטת הודעות חדשות מלקוחות')}
      ${feat('חילוץ פרטי ההזמנה מתוך השיחה')}
      ${feat('יצירת טיוטה לאישור העובד')}
      ${feat('שמירה על שליטה אנושית מלאה לפני כל שינוי מלאי')}
      ${feat('עדכון המערכת המרכזית רק לאחר אישור')}
    </div>
    <div class="flow" style="margin-block-start:14px">
      <span>לקוח כותב</span><em>←</em><span>הודעה נקלטת</span><em>←</em><span>טיוטה</span><em>←</em><span>אישור עובד</span><em>←</em><span>שריון מלאי</span>
    </div>
  </div>
  <div class="card-foot">
    <button class="btn btn-primary" disabled>חיבור WhatsApp Business</button>
    <button class="btn btn-ghost" data-act="wa-info">מה נדרש כדי לחבר</button>
  </div>`)}

  ${card(`<div class="card-body">
    <div class="integ">
      <div class="integ-logo tg">${icon('truck',24)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <h2 style="font-size:17px">Telegram</h2>${badge(tg)}
        </div>
        <p style="color:var(--muted);font-size:13.5px;margin-block-start:4px">הערוץ הפנימי מול הנהגים וצוות החנות.</p>
      </div>
    </div>
    <div style="margin-block-start:16px">
      ${feat('קבלת הודעות תפעול פנימיות')}
      ${feat('שיבוץ נהג לכל משלוח')}
      ${feat('מעקב אחר איסוף ומסירה')}
      ${feat('עדכון מלאי הנהג בזמן אמת')}
      ${feat('תיעוד תוצאת המשלוח')}
    </div>
    <div class="flow" style="margin-block-start:14px">
      <span>הזמנה מאושרת</span><em>←</em><span>כרטיס בקבוצה</span><em>←</em><span>נהג מקבל</span><em>←</em><span>מסירה</span><em>←</em><span>תוצאה</span>
    </div>
  </div>
  <div class="card-foot">
    <button class="btn btn-primary" disabled>חיבור Telegram</button>
    <button class="btn btn-ghost" data-act="tg-info">מה נדרש כדי לחבר</button>
  </div>`)}

  ${card(cardHead('נתונים שממתינים להבהרת הלקוח','נשמרים כרשומת קליטה ואינם משפיעים על אף חישוב') +
    `<ul class="list">${C.S.settings.notes.map(nt=>row({
      title:`${esc(nt.title)} ${pill('ממתין לאישור','warn')}`,
      sub:esc(nt.note), chev:false })).join('')}</ul>`)}

  ${card(cardHead('שם נוסף למוצר','דוקטור מול מספרים') + `<div class="card-body">
    <label style="display:flex;align-items:center;gap:10px;font-size:14.5px;cursor:pointer">
      <input type="checkbox" id="alias-toggle" ${C.S.settings.aliasConfirmed?'checked':''} style="width:20px;height:20px">
      <span>אושר: "דוקטור" הוא שם נוסף למוצר "מספרים"</span>
    </label>
    <div style="margin-block-start:10px">${notice(C.S.settings.aliasConfirmed
      ? 'שני השמות ממופים לאותו מוצר. השם הרשמי בקטלוג נשאר <b>מספרים</b>.'
      : 'עד לאישור, שני השמות נשארים נפרדים וכל הודעה עם "דוקטור" מסומנת לבדיקה ידנית.', C.S.settings.aliasConfirmed?'brand':'warn')}</div>
  </div>`)}
  ${eventLog()}
  `;
}

// ============================================================ 21. AUDIT
export function audit(){
  const items = C.S.audit.slice().sort((a,b)=>b.at-a.at).slice(0,120);
  const ACT = { confirm:'אישור הזמנה', assign:'שיבוץ נהג', reassign:'שיבוץ מחדש', handoff:'מסירה לנהג',
    handoff_mismatch:'פער במסירה', deliver:'מסירה ללקוח', failed:'משלוח נכשל', payment:'רישום תשלום',
    return:'קליטת החזרה', cancel:'ביטול הזמנה', adjust:'תיקון מלאי', resolve:'סגירת פער',
    discard:'ביטול טיוטה', reverse:'תיקון תנועה', damaged:'רישום פגום', expired:'רישום פג תוקף', missing:'רישום חסר' };
  return `
  ${pageHead('יומן ביקורת','כל פעולה נרשמת עם המשתמש והזמן ואינה ניתנת למחיקה')}
  ${card(cardHead(`${items.length} רשומות אחרונות`) + (items.length
    ? `<ul class="list">${items.map(a=>row({
        title:`${esc(ACT[a.action]||a.action)} ${a.meta?.no?pill(a.meta.no,'muted'):''}`,
        sub:`${esc(uName(a.actor))} · ${when(a.at)}${a.meta?.reason?' · '+esc(a.meta.reason):''}${a.meta?.driver?' · '+esc(a.meta.driver):''}`,
        chev:false })).join('')}</ul>`
    : empty('אין רשומות','','history')))}
  `;
}

// ============================================================ EVENT LOG (diagnostics)
export function eventLog(){
  return card(cardHead('יומן אירועים פנימי','אירועים מנורמלים, זהים לאלו שיגיעו מהחיבורים האמיתיים') +
    (C.S.events.length ? `<ul class="list">${C.S.events.slice(0,40).map(e=>row({
      title:`<span style="font-family:ui-monospace,monospace;font-size:12.5px">${esc(e.type)}</span>`,
      sub:esc(Object.entries(e.payload||{}).map(([k,v])=>`${k}: ${v}`).join(' · ')),
      end:`<span style="font-size:12px;color:var(--muted)">${when(e.at)}</span>`, chev:false })).join('')}</ul>`
    : empty('אין אירועים')));
}
