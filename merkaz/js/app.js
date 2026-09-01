// app.js — shell, router, role gating, interaction handlers, demo simulator.
import * as C from './core.js';
import * as V from './screens.js';
import { ACCESS_CODE, PRODUCTS, USERS, ROLE_HE, ROLE_DESC, PAY_METHOD_HE, FAIL_REASONS, WA_SCRIPTS } from './data.js';
import { esc, n, ils, icon, pill, toast, modal, closeModal, notice, qtyField, wireQty, when } from './ui.js';

const $ = s => document.querySelector(s);
const drivers = () => USERS.filter(u=>u.role==='driver');
const pName = id => C.product(id)?.he || id;
const uName = id => C.user(id)?.name || '—';

// who is acting, given the demo role
function actor(){
  const r = C.S.role;
  if(r==='driver') return C.S.driverId || 'u_d1';
  return { owner:'u_owner', store_manager:'u_manager', staff:'u_staff' }[r];
}
const can = (...roles) => roles.includes(C.S.role);

// ---------------------------------------------------------------- navigation
const NAV = [
  { g:'ראשי', items:[
    { to:'#/', label:'לוח בקרה', ic:'dashboard', roles:['owner','store_manager','staff'] },
    { to:'#/', label:'המשלוחים שלי', ic:'truck', roles:['driver'] },
  ]},
  { g:'הזמנות', items:[
    { to:'#/drafts', label:'טיוטות והזמנות חדשות', ic:'orders', roles:['owner','store_manager','staff'], badge:()=>C.pendingDrafts().length },
    { to:'#/orders', label:'כל ההזמנות', ic:'orders', roles:['owner','store_manager','staff','driver'] },
    { to:'#/assign', label:'שיבוץ נהגים', ic:'users', roles:['owner','store_manager'], badge:()=>C.S.orders.filter(o=>o.status==='awaiting_assignment').length },
  ]},
  { g:'משלוחים', items:[
    { to:'#/deliveries', label:'משלוחים פעילים', ic:'truck', roles:['owner','store_manager','driver'] },
    { to:'#/history', label:'הושלמו ונכשלו', ic:'history', roles:['owner','store_manager','driver'] },
    { to:'#/returns', label:'החזרות', ic:'ret', roles:['owner','store_manager'] },
  ]},
  { g:'מלאי', items:[
    { to:'#/inventory', label:'סקירת מלאי', ic:'box', roles:['owner','store_manager','staff'] },
    { to:'#/inventory/warehouse', label:'מחסן ראשי', ic:'box', roles:['owner','store_manager','staff'] },
    { to:'#/inventory/drivers', label:'מלאי נהגים', ic:'truck', roles:['owner','store_manager'] },
    { to:'#/lowstock', label:'התראות מלאי נמוך', ic:'alert', roles:['owner','store_manager'] },
  ]},
  { g:'כספים', items:[
    { to:'#/payments', label:'מעקב תשלומים', ic:'money', roles:['owner','store_manager'] },
    { to:'#/sales', label:'דוחות מכירות', ic:'chart', roles:['owner','store_manager'] },
  ]},
  { g:'ניהול', items:[
    { to:'#/exceptions', label:'חריגות ופערים', ic:'alert', roles:['owner','store_manager','staff'], badge:()=>C.openDiscrepancies().length },
    { to:'#/users', label:'משתמשים ונהגים', ic:'users', roles:['owner','store_manager'] },
    { to:'#/integrations', label:'אינטגרציות', ic:'plug', roles:['owner','store_manager'] },
    { to:'#/audit', label:'יומן ביקורת', ic:'shield', roles:['owner'] },
  ]},
];
const TABS = {
  owner:        [['#/','לוח בקרה','dashboard'],['#/orders','הזמנות','orders'],['#/inventory','מלאי','box'],['#/sales','מכירות','chart'],['#/integrations','חיבורים','plug']],
  store_manager:[['#/','לוח בקרה','dashboard'],['#/assign','שיבוץ','users'],['#/deliveries','משלוחים','truck'],['#/inventory','מלאי','box'],['#/exceptions','חריגות','alert']],
  staff:        [['#/','לוח בקרה','dashboard'],['#/drafts','טיוטות','orders'],['#/orders','הזמנות','orders'],['#/inventory','מלאי','box']],
  driver:       [['#/','שלי','truck'],['#/orders','הזמנות','orders'],['#/deliveries','פעילים','truck'],['#/history','היסטוריה','history']],
};

function renderNav(){
  const cur = location.hash || '#/';
  $('#sidebar').innerHTML = NAV.map(g=>{
    const items = g.items.filter(i=>i.roles.includes(C.S.role));
    if(!items.length) return '';
    return `<div class="nav-group"><div class="nav-title">${esc(g.g)}</div>${items.map(i=>{
      const b = i.badge ? i.badge() : 0;
      const active = cur===i.to || (i.to!=='#/' && cur.startsWith(i.to));
      return `<button class="nav-item ${active?'active':''}" data-act="nav" data-to="${i.to}">
        ${icon(i.ic,18)}<span>${esc(i.label)}</span>${b?`<span class="nav-badge ${i.to==='#/exceptions'?'':'soft'}">${b}</span>`:''}</button>`;
    }).join('')}</div>`;
  }).join('');
  $('#tabbar').innerHTML = (TABS[C.S.role]||TABS.owner).map(([to,label,ic])=>{
    const active = cur===to || (to!=='#/' && cur.startsWith(to));
    return `<button class="tab ${active?'active':''}" data-act="nav" data-to="${to}">${icon(ic,20)}<span>${esc(label)}</span></button>`;
  }).join('');
  $('#role-label').textContent = C.S.role==='driver' ? uName(C.S.driverId||'u_d1') : ROLE_HE[C.S.role];
}

// ---------------------------------------------------------------- router
let filters = { orders:'all', history:'done', sales:'30' };

function route(){
  const h = location.hash || '#/';
  const [, p1, p2, p3] = h.split('/');
  const role = C.S.role;
  let html;

  const guard = (allowed, view) => allowed.includes(role) ? view() :
    `<div class="card">${notice('אין לך הרשאה לצפות במסך הזה בתפקיד הנוכחי. החליפו תפקיד כדי לראות אותו.','warn')}</div>`;

  switch(p1){
    case '': case undefined:
      html = role==='driver' ? V.driverHome() : V.dashboard(); break;
    case 'orders':      html = V.orders(filters.orders); break;
    case 'order':       html = V.orderDetail(p2); break;
    case 'drafts':      html = guard(['owner','store_manager','staff'], V.drafts); break;
    case 'draft':       html = guard(['owner','store_manager','staff'], ()=>V.draftReview(p2)); break;
    case 'assign':      html = guard(['owner','store_manager'], V.assignment); break;
    case 'deliveries':  html = V.deliveries(); break;
    case 'history':     html = V.history(filters.history); break;
    case 'returns':     html = guard(['owner','store_manager'], V.returns); break;
    case 'inventory':
      if(p2==='warehouse')   html = guard(['owner','store_manager','staff'], V.warehouse);
      else if(p2==='drivers')html = guard(['owner','store_manager'], V.driversInventory);
      else if(p2==='driver') html = V.driverInventory(p3);
      else                   html = guard(['owner','store_manager','staff'], V.inventoryOverview);
      break;
    case 'product':     html = V.productDetail(p2); break;
    case 'lowstock':    html = guard(['owner','store_manager'], V.lowStock); break;
    case 'payments':    html = guard(['owner','store_manager'], V.payments); break;
    case 'sales':       html = guard(['owner','store_manager'], ()=>V.sales(filters.sales)); break;
    case 'exceptions':  html = guard(['owner','store_manager','staff'], V.exceptions); break;
    case 'users':       html = guard(['owner','store_manager'], V.users); break;
    case 'integrations':html = guard(['owner','store_manager'], V.integrations); break;
    case 'audit':       html = guard(['owner'], V.audit); break;
    default:            html = V.dashboard();
  }
  $('#view').innerHTML = html;
  renderNav();
  window.scrollTo(0,0);
  wirePage();
  closeNav();
}

function wirePage(){
  const t = $('#ls-toggle');
  if(t) t.addEventListener('change', ()=>{
    C.S.settings.lowStockEnabled = t.checked;
    if(t.checked && !Object.keys(C.S.settings.thresholds).length)
      toast('הופעל. הזינו ספים ושמרו.','');
    C.save(); route();
  });
  const a = $('#alias-toggle');
  if(a) a.addEventListener('change', ()=>{
    C.S.settings.aliasConfirmed = a.checked; C.save();
    toast(a.checked?'השם "דוקטור" מקושר כעת ל"מספרים"':'הקישור בוטל. השמות נפרדים.','ok');
    route();
  });
}

// ---------------------------------------------------------------- actions
const H = {
  nav: el => { location.hash = el.dataset.to; },
  'filter-orders': el => { filters.orders = el.dataset.v; route(); },
  'filter-history':el => { filters.history= el.dataset.v; route(); },
  'filter-sales':  el => { filters.sales  = el.dataset.v; route(); },

  'confirm-order': el => doConfirm(el.dataset.id),
  'cancel-order':  el => askCancel(el.dataset.id),
  claim:           el => doClaim(el.dataset.id),
  assign:          el => askAssign(el.dataset.id),
  handoff:         el => askHandoff(el.dataset.id),
  outcome:         el => askOutcome(el.dataset.id),
  pay:             el => askPay(el.dataset.id),
  return:          el => askReturn(el.dataset.id),
  'resolve-dx':    el => askResolve(el.dataset.id),
  adjust:          el => askAdjust(el.dataset.id),

  'promote-draft': el => promoteDraft(el.dataset.id),
  'edit-draft':    el => editDraft(el.dataset.id),
  'ask-draft':     el => { toast('נשלחה בקשת הבהרה ללקוח (הדגמה)','ok'); },
  'discard-draft': el => { C.discardDraft(el.dataset.id, actor()); toast('הטיוטה בוטלה'); location.hash='#/drafts'; },

  'save-thresholds': () => {
    document.querySelectorAll('[data-th]').forEach(i=>{
      const v = i.value.trim();
      if(v==='') delete C.S.settings.thresholds[i.dataset.th];
      else C.S.settings.thresholds[i.dataset.th] = +v;
    });
    C.save(); toast('הספים נשמרו','ok'); route();
  },
  'wa-info': () => modal({ title:'מה נדרש כדי לחבר את WhatsApp', body:`
    ${notice('החיבור מתבצע דרך הממשק הרשמי של Meta בלבד. אין שימוש בכלים לא רשמיים או באוטומציה של הדפדפן.','brand','shield')}
    <ol style="margin:16px 0 0;padding-inline-start:20px;line-height:2;font-size:14.5px">
      <li>חשבון עסקי ב-Meta Business על שם הלקוח</li>
      <li>אימות העסק מול Meta</li>
      <li>מספר הטלפון העסקי שישמש את המערכת</li>
      <li>הרשאת גישה עבורנו כמפתחים</li>
      <li>החלטה עסקית: העברת המספר הקיים, מספר חדש, או עבודה דרך ספק רשמי</li>
    </ol>
    <div style="margin-block-start:16px">${notice('החלטה חשובה: מספר שעובר לממשק הרשמי אינו ניתן יותר לשימוש באפליקציית וואטסאפ הרגילה בטלפון.','warn')}</div>`,
    foot:`<button class="btn btn-ghost" data-close="1">סגירה</button>` }),
  'tg-info': () => modal({ title:'מה נדרש כדי לחבר את Telegram', body:`
    <ol style="margin:0;padding-inline-start:20px;line-height:2;font-size:14.5px">
      <li>יצירת בוט דרך BotFather</li>
      <li>הוספת הבוט כמנהל לקבוצת התפעול הפרטית</li>
      <li>רשימת הנהגים וחשבונות הטלגרם שלהם</li>
      <li>אישור אילו קבוצות מורשות לפעול מול המערכת</li>
    </ol>
    <div style="margin-block-start:16px">${notice('הבוט מקבל הרשאה לקבוצה אחת מוגדרת בלבד. משתמש שאינו מזוהה במערכת לא יוכל לבצע פעולות.','brand','shield')}</div>`,
    foot:`<button class="btn btn-ghost" data-close="1">סגירה</button>` }),

  'sim-wa':  el => { const d = C.createDraftFromScript(+el.dataset.i); toast('התקבלה שיחה חדשה בוואטסאפ','ok'); location.hash='#/draft/'+d.id; closeSim(); },
  'sim-reset': () => modal({ title:'איפוס הדגמה', body:`<p style="font-size:14.5px;line-height:1.7">
      הפעולה תחזיר את ההדגמה למצב ההתחלתי: מלאי הפתיחה המאושר, הזמנות הדוגמה והטיוטות הממתינות.
      כל השינויים שביצעתם במהלך ההדגמה יימחקו.</p>`,
    foot:`<button class="btn btn-danger" data-act="sim-reset-go">איפוס ההדגמה</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>` }),
  'sim-reset-go': () => { C.resetDemo(); closeModal(); closeSim(); location.hash='#/'; route(); toast('ההדגמה אופסה','ok'); },
  'sim-next': () => { runNextStep(); },
};

document.addEventListener('click', e=>{
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const fn = H[el.dataset.act];
  if(!fn) return;
  e.preventDefault();
  try{ fn(el); }catch(err){ toast(friendly(err.message),'err'); }
});

function friendly(msg){
  if(msg.startsWith('MERKAZ_INSUFFICIENT_STOCK')){
    const [,p,av] = msg.split(':');
    return `אין מספיק מלאי זמין: ${p} (זמין ${av})`;
  }
  return {
    MERKAZ_ALREADY_ASSIGNED:'המשלוח כבר נלקח על ידי נהג אחר',
    MERKAZ_INVALID_TRANSITION:'לא ניתן לבצע את הפעולה מהסטטוס הנוכחי',
    MERKAZ_REASON_REQUIRED:'חובה לציין סיבה',
    MERKAZ_NO_DRIVER:'לא שובץ נהג להזמנה',
    MERKAZ_NOT_FOUND:'ההזמנה לא נמצאה',
  }[msg] || 'הפעולה נכשלה';
}

// ---------------------------------------------------------------- flows
function doConfirm(id){
  const o = C.order(id);
  const short = o.lines.filter(l=>C.whAvailable(l.product) < l.qty);
  modal({
    title:'אישור הזמנה '+o.no,
    body: (short.length ? notice(`<b>אין מספיק מלאי זמין:</b> ${short.map(l=>`${pName(l.product)} (דרוש ${l.qty}, זמין ${C.whAvailable(l.product)})`).join(' · ')}`,'danger')
      : notice('לאחר האישור המערכת תשריין את הכמויות במחסן. הסחורה לא תהיה זמינה ללקוח אחר.','brand','shield')) +
      `<div style="margin-block-start:14px">${o.lines.map(l=>
        `<div style="display:flex;justify-content:space-between;padding:9px 0;border-block-end:1px solid var(--line-2)">
          <span>${esc(pName(l.product))}</span>
          <span><b>${l.qty}</b> <span style="color:var(--muted);font-size:13px">· זמין ${C.whAvailable(l.product)}</span></span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding-block-start:12px;font-size:16px">
        <b>סה״כ</b><b>${ils(o.total)}</b></div></div>`,
    foot: short.length
      ? `<button class="btn btn-ghost" data-close="1">סגירה</button>`
      : `<button class="btn btn-primary" id="go">אישור ושריון מלאי</button>
         <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount: r => { const b = r.querySelector('#go'); if(b) b.addEventListener('click', ()=>{
      try{ C.confirmOrder(id, actor()); closeModal(); toast('ההזמנה אושרה והמלאי שוריין','ok'); route(); }
      catch(err){ toast(friendly(err.message),'err'); }
    }); }
  });
}

function askCancel(id){
  const o = C.order(id);
  modal({ title:'ביטול הזמנה '+o.no,
    body:`<div class="field"><label>סיבת הביטול</label>
      <input id="rsn" type="text" placeholder="לדוגמה: הלקוח ביטל"></div>
      ${notice('אם המלאי כבר שוריין, השריון יבוטל והסחורה תחזור להיות זמינה.','info')}`,
    foot:`<button class="btn btn-danger" id="go">ביטול ההזמנה</button>
          <button class="btn btn-ghost" data-close="1">חזרה</button>`,
    onMount:r=> r.querySelector('#go').addEventListener('click',()=>{
      C.cancelOrder(id, actor(), r.querySelector('#rsn').value.trim()||'ללא סיבה');
      closeModal(); toast('ההזמנה בוטלה'); route();
    })});
}

function doClaim(id){
  const me = C.S.role==='driver' ? (C.S.driverId||'u_d1') : 'u_d1';
  try{
    C.assignDriver(id, me, me, 'telegram');
    toast('המשלוח שובץ אליך','ok'); route();
  }catch(err){ toast(friendly(err.message),'err'); }
}

function askAssign(id){
  const o = C.order(id);
  modal({ title:'שיבוץ נהג · '+o.no,
    body:`${notice('רק נהג אחד יכול להחזיק שיבוץ פעיל להזמנה.','brand','shield')}
      <div style="margin-block-start:14px">${drivers().map(d=>{
        const units = PRODUCTS.reduce((a,p)=>a+C.driverHolds(d.id,p.id),0);
        const act = C.S.orders.filter(x=>x.driver===d.id && ['assigned','out_for_delivery'].includes(x.status)).length;
        return `<button class="row" style="border:1px solid var(--line);border-radius:12px;margin-block-end:8px" data-drv="${d.id}">
          <div class="row-main"><div class="row-title">${esc(d.name)}</div>
          <div class="row-sub">${esc(d.vehicle)} · ${act} משלוחים פעילים · ${units} יח׳ ברכב</div></div>
          ${o.driver===d.id?pill('משובץ','brand'):''}</button>`;
      }).join('')}</div>`,
    foot:`<button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=> r.querySelectorAll('[data-drv]').forEach(b=> b.addEventListener('click',()=>{
      const d = b.dataset.drv;
      try{
        if(o.driver && o.driver!==d) C.reassignDriver(id, d, actor(), 'שיבוץ מחדש על ידי מנהל');
        else C.assignDriver(id, d, actor(), 'dashboard');
        closeModal(); toast('שובץ: '+uName(d),'ok'); route();
      }catch(err){ toast(friendly(err.message),'err'); }
    }))});
}

function askHandoff(id){
  const o = C.order(id);
  modal({ title:'מסירה לנהג · '+o.no,
    body:`${notice('נדרש אישור משני הצדדים. אם הספירה של הנהג שונה מספירת המחסן, לא תבוצע תנועת מלאי ותיפתח חריגה.','brand','shield')}
      <div style="margin-block-start:14px">${o.lines.map(l=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-block-end:1px solid var(--line-2)">
          <div><div style="font-weight:500">${esc(pName(l.product))}</div>
            <div style="font-size:12.5px;color:var(--muted)">המחסן מוסר ${l.qty}</div></div>
          ${qtyField('hq_'+l.product, l.qty, l.qty)}</div>`).join('')}</div>`,
    foot:`<button class="btn btn-primary" id="go">אישור מסירה</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>{ wireQty(r);
      r.querySelector('#go').addEventListener('click',()=>{
        const counts = {}; o.lines.forEach(l=> counts[l.product] = +r.querySelector('#hq_'+l.product).value||0);
        const res = C.handoff(id, actor(), counts);
        closeModal();
        if(res.ok){ toast('המלאי הועבר לנהג','ok'); }
        else toast('נמצא פער בספירה. נפתחה חריגה ולא בוצעה תנועת מלאי.','err');
        route();
      }); }});
}

function askOutcome(id){
  const o = C.order(id);
  modal({ title:'תוצאת המשלוח · '+o.no,
    body:`<div style="display:grid;gap:9px">
      <button class="btn btn-ok btn-lg" data-oc="paid">נמסר ושולם</button>
      <button class="btn btn-primary btn-lg" data-oc="unpaid">נמסר · תשלום פתוח</button>
      <button class="btn btn-ghost btn-lg" data-oc="partial">נמסר חלקית</button>
      <button class="btn btn-danger btn-lg" data-oc="failed">המשלוח נכשל</button>
      <button class="btn btn-ghost btn-lg" data-oc="cancelled">הלקוח ביטל</button>
    </div>
    ${notice('משלוח שנכשל אינו נרשם כמכירה. סטטוס התשלום נשמר בנפרד מסטטוס המסירה.','info')}`,
    foot:`<button class="btn btn-ghost" data-close="1">חזרה</button>`,
    onMount:r=> r.querySelectorAll('[data-oc]').forEach(b=> b.addEventListener('click',()=>{
      const oc = b.dataset.oc;
      if(oc==='partial') return partialModal(id);
      if(oc==='failed'||oc==='cancelled') return failModal(id, oc);
      C.completeDelivery(id, actor(), 'delivered');
      if(oc==='paid') C.recordPayment(id, C.deliveredTotal(C.order(id)), o.payMethod||'cash', actor(), null, 'pay:'+id+':settle');
      closeModal(); toast(oc==='paid'?'נמסר ושולם':'נמסר. התשלום נשאר פתוח.','ok'); route();
    }))});
}

function partialModal(id){
  const o = C.order(id);
  modal({ title:'מסירה חלקית · '+o.no,
    body:`${notice('הזינו את הכמות שנמסרה בפועל לכל פריט. הסכום יחושב מחדש לפי מה שנמסר, והיתרה תישאר באחריות הנהג.','warn')}
      <div style="margin-block-start:14px">${o.lines.map(l=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-block-end:1px solid var(--line-2)">
          <div><div style="font-weight:500">${esc(pName(l.product))}</div>
            <div style="font-size:12.5px;color:var(--muted)">הוזמן ${l.qty}</div></div>
          ${qtyField('pq_'+l.product, l.qty, l.qty)}</div>`).join('')}</div>`,
    foot:`<button class="btn btn-primary" id="go">אישור מסירה חלקית</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>{ wireQty(r);
      r.querySelector('#go').addEventListener('click',()=>{
        const m={}; o.lines.forEach(l=> m[l.product] = +r.querySelector('#pq_'+l.product).value||0);
        C.completeDelivery(id, actor(), 'partial', m, 'מסירה חלקית');
        closeModal(); toast('נרשמה מסירה חלקית','ok'); route();
      }); }});
}

function failModal(id, kind){
  modal({ title: kind==='failed'?'משלוח נכשל':'הלקוח ביטל',
    body:`${notice('חובה לציין סיבה. <b>לא תירשם מכירה</b> והסחורה נשארת רשומה על הנהג עד להחזרה.','danger')}
      <div class="field" style="margin-block-start:14px"><label>סיבה</label>
        <select id="rsn">${FAIL_REASONS.map(x=>`<option>${esc(x)}</option>`).join('')}<option value="">אחר…</option></select></div>
      <div class="field"><label>הערה חופשית</label><input id="note" type="text" placeholder="לא חובה"></div>`,
    foot:`<button class="btn btn-danger" id="go">רישום התוצאה</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=> r.querySelector('#go').addEventListener('click',()=>{
      const reason = (r.querySelector('#rsn').value || r.querySelector('#note').value || 'ללא סיבה').trim();
      const note = r.querySelector('#note').value.trim();
      C.completeDelivery(id, actor(), kind==='failed'?'failed':'cancelled_by_customer', null, note?reason+' · '+note:reason);
      closeModal(); toast('התוצאה נרשמה. לא נרשמה מכירה.','err'); route();
    })});
}

function askPay(id){
  const o = C.order(id);
  const idem = 'pay:'+id+':'+Date.now()+':'+Math.random().toString(36).slice(2,8);
  modal({ title:'רישום תשלום · '+o.no,
    body:`<div class="field"><label>סכום</label>
        <input id="amt" type="number" value="${Math.round(o.due||0)}" min="0"></div>
      <div class="field"><label>אמצעי תשלום</label><select id="mth">
        ${Object.entries(PAY_METHOD_HE).map(([k,v])=>`<option value="${k}" ${o.payMethod===k?'selected':''}>${esc(v)}</option>`).join('')}
      </select></div>
      ${notice(`יתרה לתשלום: <b>${new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(o.due||0)}</b>. תשלום חלקי אפשרי ויעודכן בהתאם.`,'info')}`,
    foot:`<button class="btn btn-primary" id="go">רישום התשלום</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=> r.querySelector('#go').addEventListener('click',()=>{
      const amt = +r.querySelector('#amt').value||0;
      if(amt<=0) return toast('יש להזין סכום','err');
      C.recordPayment(id, amt, r.querySelector('#mth').value, actor(), null, idem);
      closeModal(); toast('התשלום נרשם','ok'); route();
    })});
}

function askReturn(id){
  const o = C.order(id);
  const lines = o.lines.map(l=>({ l, held: C.driverHolds(o.driver, l.product) })).filter(x=>x.held>0);
  if(!lines.length){ toast('אין סחורה שממתינה להחזרה בהזמנה זו','err'); return; }
  modal({ title:'קליטת החזרה · '+o.no,
    body:`${notice('הנהג מוסר, המחסן סופר. פער בין הספירות ייפתח כחריגה שדורשת החלטת מנהל.','brand','shield')}
      <div style="margin-block-start:14px">${lines.map(({l,held})=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-block-end:1px solid var(--line-2)">
          <div><div style="font-weight:500">${esc(pName(l.product))}</div>
            <div style="font-size:12.5px;color:var(--muted)">אצל הנהג ${held}</div></div>
          ${qtyField('rq_'+l.product, held, held)}</div>`).join('')}</div>`,
    foot:`<button class="btn btn-primary" id="go">קליטת ההחזרה</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>{ wireQty(r);
      r.querySelector('#go').addEventListener('click',()=>{
        const counts={}; lines.forEach(({l})=> counts[l.product] = +r.querySelector('#rq_'+l.product).value||0);
        C.returnToWarehouse(id, actor(), counts);
        closeModal(); toast('ההחזרה נקלטה למחסן','ok'); route();
      }); }});
}

function askResolve(id){
  const d = C.S.discrepancies.find(x=>x.id===id);
  const diff = d.actual - d.expected;
  modal({ title:'טיפול בפער',
    body:`<div style="font-size:14.5px;line-height:1.9;margin-block-end:14px">
        <div><b>מוצר:</b> ${esc(pName(d.product))}</div>
        <div><b>צפוי:</b> ${d.expected} · <b>נספר:</b> ${d.actual} · <b>הפרש:</b> ${diff>0?'+':''}${diff}</div>
        <div><b>הזמנה:</b> ${esc(C.order(d.order)?.no||'—')}</div></div>
      <div class="field"><label>החלטה</label><select id="mode">
        <option value="apply">לקבל את הספירה בפועל ולתקן את המלאי</option>
        <option value="note">לסגור ללא שינוי מלאי (הסבר בלבד)</option>
      </select></div>
      <div class="field"><label>סיבה מתועדת (חובה)</label>
        <input id="note" type="text" placeholder="לדוגמה: נספר מחדש, נמצאה יחידה חסרה"></div>
      ${notice('כל תיקון נרשם כתנועת מלאי חדשה. הרישום המקורי נשמר ואינו נמחק.','info')}`,
    foot:`<button class="btn btn-primary" id="go">סגירת הפער</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=> r.querySelector('#go').addEventListener('click',()=>{
      const note = r.querySelector('#note').value.trim();
      if(!note) return toast('חובה לתעד סיבה','err');
      C.resolveDiscrepancy(id, actor(), note, r.querySelector('#mode').value==='apply');
      closeModal(); toast('הפער נסגר','ok'); route();
    })});
}

function askAdjust(pid){
  const p = C.product(pid);
  modal({ title:'תיקון מלאי · '+p.he,
    body:`${notice('תיקון ידני יוצר תנועת מלאי חדשה עם שם המשתמש והסיבה. אין מחיקה של רישומים קיימים.','warn')}
      <div class="field" style="margin-block-start:14px"><label>זמין כעת במחסן</label>
        <div style="font-size:22px;font-weight:700">${C.whAvailable(pid)}</div></div>
      <div class="field"><label>סוג התיקון</label><select id="kind">
        <option value="adj+">הוספת יחידות (נמצאה סחורה)</option>
        <option value="adj-">הפחתת יחידות (התאמה)</option>
        <option value="damaged">רישום כפגום</option>
        <option value="expired">רישום כפג תוקף</option>
        <option value="missing">רישום כחסר</option>
      </select></div>
      <div class="field"><label>כמות</label>${qtyField('aq', 1, 9999)}</div>
      <div class="field"><label>סיבה (חובה)</label><input id="rsn" type="text" placeholder="תיעוד הסיבה"></div>`,
    foot:`<button class="btn btn-primary" id="go">רישום התיקון</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>{ wireQty(r);
      r.querySelector('#go').addEventListener('click',()=>{
        const q = +r.querySelector('#aq').value||0;
        const rsn = r.querySelector('#rsn').value.trim();
        const kind = r.querySelector('#kind').value;
        if(q<=0) return toast('יש להזין כמות','err');
        if(!rsn) return toast('חובה לתעד סיבה','err');
        try{
          if(kind==='adj+') C.adjustInventory(pid, C.LOC.WH, q, rsn, actor());
          else if(kind==='adj-') C.adjustInventory(pid, C.LOC.WH, -q, rsn, actor());
          else C.writeOff(pid, C.LOC.WH, q, kind, rsn, actor());
          closeModal(); toast('התיקון נרשם','ok'); route();
        }catch(err){ toast('לא ניתן לרשום תיקון שיוביל למלאי שלילי','err'); }
      }); }});
}

// ---------------------------------------------------------------- drafts
function promoteDraft(id){
  const d = C.S.drafts.find(x=>x.id===id);
  if(d.alias && !C.S.settings.aliasConfirmed) return aliasModal(d);
  if(!d.address) return editDraft(id, 'חסרה כתובת למשלוח. השלימו אותה לפני האישור.');
  const o = C.createOrder({ customerId:d.customer, lines:d.lines.map(l=>[l.product,l.qty]),
    address:d.address, when:d.when, payMethod:d.payMethod||'cash', actor:actor(), draftId:d.id });
  try{
    C.confirmOrder(o.id, actor());
    toast('ההזמנה אושרה והמלאי שוריין','ok');
    location.hash = '#/order/'+o.id;
  }catch(err){
    toast(friendly(err.message),'err');
    C.S.orders = C.S.orders.filter(x=>x.id!==o.id); C.save(); route();
  }
}

function aliasModal(d){
  modal({ title:'זיהוי מוצר לא ודאי',
    body:`${notice('הלקוח כתב <b>דוקטור</b>. ייתכן שזהו שם נוסף למוצר <b>מספרים</b>, אך הקשר לא אושר על ידכם. המערכת לא תמזג את השמות לבד. בחרו מה לעשות:','warn')}
      <div style="display:grid;gap:9px;margin-block-start:16px">
        <button class="btn btn-primary btn-lg" data-pick="scissors">זה המוצר "מספרים" · המשך עם ההזמנה</button>
        <button class="btn btn-ghost btn-lg" data-pick="confirm">אשר קבוע: "דוקטור" = "מספרים"</button>
        <button class="btn btn-ghost btn-lg" data-pick="ask">בקש הבהרה מהלקוח</button>
      </div>`,
    foot:`<button class="btn btn-ghost" data-close="1">חזרה</button>`,
    onMount:r=> r.querySelectorAll('[data-pick]').forEach(b=> b.addEventListener('click',()=>{
      const p = b.dataset.pick;
      if(p==='ask'){ closeModal(); toast('נשלחה בקשת הבהרה ללקוח (הדגמה)','ok'); return; }
      if(p==='confirm'){ C.S.settings.aliasConfirmed = true; C.save(); toast('הקישור אושר לצמיתות','ok'); }
      d.alias = false; C.save(); closeModal(); promoteDraft(d.id);
    }))});
}

function editDraft(id, warn){
  const d = C.S.drafts.find(x=>x.id===id);
  const c = C.customer(d.customer);
  modal({ title:'עריכת הזמנה',
    body:`${warn?notice(esc(warn),'warn'):''}
      <div style="margin-block:${warn?'14px':'0'} 14px">${d.lines.map(l=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-block-end:1px solid var(--line-2)">
          <div style="font-weight:500">${esc(pName(l.product))}</div>
          ${qtyField('eq_'+l.product, l.qty, 999)}</div>`).join('')}</div>
      <div class="field"><label>כתובת למשלוח</label>
        <input id="addr" type="text" value="${esc(d.address||'')}" placeholder="${esc(c.address)}"></div>
      <div class="field"><label>מועד מבוקש</label>
        <input id="whn" type="text" value="${esc(d.when||'')}" placeholder="לדוגמה: היום אחר הצהריים"></div>
      <div class="field"><label>אמצעי תשלום</label><select id="pm">
        ${Object.entries(PAY_METHOD_HE).map(([k,v])=>`<option value="${k}" ${d.payMethod===k?'selected':''}>${esc(v)}</option>`).join('')}
      </select></div>`,
    foot:`<button class="btn btn-primary" id="go">שמירה</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>{ wireQty(r);
      r.querySelector('#go').addEventListener('click',()=>{
        d.lines.forEach(l=> l.qty = Math.max(1, +r.querySelector('#eq_'+l.product).value||1));
        d.address = r.querySelector('#addr').value.trim() || c.address;
        d.when = r.querySelector('#whn').value.trim() || d.when;
        d.payMethod = r.querySelector('#pm').value;
        d.uncertain = d.uncertain.filter(u=>u!=='delivery_address'&&u!=='payment_method');
        C.save(); closeModal(); toast('הטיוטה עודכנה','ok'); route();
      }); }});
}

// ---------------------------------------------------------------- simulator
function openSim(){
  const p = $('#simpanel');
  const pending = C.pendingDrafts().length;
  const queue = C.S.orders.filter(o=>o.status==='awaiting_assignment');
  const assigned = C.S.orders.filter(o=>o.status==='assigned');
  const out = C.S.orders.filter(o=>o.status==='out_for_delivery');

  const step = (i,title,sub,state) =>
    `<div class="step ${state}"><div class="step-n">${state==='done'?'✓':i}</div>
      <div class="step-main"><div class="step-title">${esc(title)}</div><div class="step-sub">${esc(sub)}</div></div></div>`;

  p.innerHTML = `
    <div class="sim-head">
      <h2>סימולטור הדגמה</h2>
      <button class="icon-btn" id="sim-close" aria-label="סגירה">${icon('x',20)}</button>
    </div>

    <div class="sim-sec">
      <h3>מסלול ההדגמה המלא</h3>
      ${step(1,'שיחת וואטסאפ נכנסת','לקוח כותב הזמנה', pending?'done':'next')}
      ${step(2,'טיוטה לאישור עובד','המערכת מחלצת פרטים', pending?'next':'')}
      ${step(3,'אישור ושריון מלאי','המלאי נשמר להזמנה', queue.length?'done':'')}
      ${step(4,'פרסום בטלגרם ושיבוץ נהג','נהג מקבל את המשלוח', assigned.length||out.length?'done':queue.length?'next':'')}
      ${step(5,'מסירה לנהג','המלאי עובר מהמחסן לרכב', out.length?'done':assigned.length?'next':'')}
      ${step(6,'תוצאת המשלוח','נמסר, נכשל, חלקי או הוחזר', out.length?'next':'')}
      <button class="btn btn-primary btn-block" data-act="sim-next" style="margin-block-start:14px">
        ${icon('check',18)} הרצת השלב הבא</button>
    </div>

    <div class="sim-sec">
      <h3>וואטסאפ · הודעה נכנסת</h3>
      <p style="font-size:13px;color:var(--muted);margin-block-end:11px">
        בחרו תרחיש שיחה. המערכת תיצור טיוטה בדיוק כפי שתעשה עם החיבור האמיתי.</p>
      ${WA_SCRIPTS.map((s,i)=>{
        const c = C.customer(s.customer);
        return `<button class="btn btn-ghost btn-block" style="justify-content:flex-start;margin-block-end:7px;text-align:start"
          data-act="sim-wa" data-i="${i}">
          <span style="flex:1">${esc(c.name)} · ${esc(s.extract.lines.map(([p,q])=>pName(p)+' ×'+q).join(', '))}</span>
          ${s.extract.confidence<0.8?pill('לא ודאי','warn'):''}</button>`;
      }).join('')}
    </div>

    <div class="sim-sec">
      <h3>טלגרם · תצוגת כרטיס הזמנה</h3>
      ${queue.length||assigned.length||out.length ? tgCard(queue[0]||assigned[0]||out[0]) :
        `<p style="font-size:13px;color:var(--muted)">אין הזמנה פעילה להצגה. אשרו טיוטה כדי לראות את הכרטיס.</p>`}
    </div>

    <div class="sim-sec">
      <h3>איפוס</h3>
      <p style="font-size:13px;color:var(--muted);margin-block-end:11px">
        החזרת ההדגמה למצב ההתחלתי, כולל מלאי הפתיחה המאושר.</p>
      <button class="btn btn-danger btn-block" data-act="sim-reset">${icon('history',18)} איפוס הדגמה</button>
    </div>

    <div class="sim-sec" style="border-block-end:none">
      <h3>סטטוס חיבורים</h3>
      <div style="display:flex;gap:9px;flex-wrap:wrap">
        <span>WhatsApp Business</span>${pill('ממתין לחיבור','warn')}
      </div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-block-start:9px">
        <span>Telegram</span>${pill('ממתין לחיבור','warn')}
      </div>
    </div>`;
  p.hidden = false;
  $('#scrim').hidden = false;
  $('#sim-close').addEventListener('click', closeSim);
  document.body.style.overflow='hidden';
}
function closeSim(){ $('#simpanel').hidden = true; $('#scrim').hidden = true; document.body.style.overflow=''; }

function tgCard(o){
  if(!o) return '';
  const c = C.customer(o.customer);
  return `<div class="tg"><div class="tg-card">
    <div style="font-weight:600;margin-block-end:7px">🆕 הזמנה חדשה · ${esc(o.no)}</div>
    <div>לקוח: ${esc(c.name)}</div>
    <div>כתובת: ${esc(o.address||'—')}</div>
    <div style="margin-block-start:7px">${o.lines.map(l=>`${esc(pName(l.product))} × ${l.qty}`).join('<br>')}</div>
    <div style="margin-block-start:7px;font-weight:600">סה״כ: ${new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(o.total)}</div>
    <div class="tg-btns">
      <button class="tg-btn">קבלת משלוח</button><button class="tg-btn">צפייה בהזמנה</button>
      <button class="tg-btn">דחיית משלוח</button><button class="tg-btn">דיווח על בעיה</button>
    </div>
    <div style="font-size:11px;opacity:.6;margin-block-start:9px">תצוגה בלבד. הבוט אינו מחובר.</div>
  </div></div>`;
}

function runNextStep(){
  const drafts = C.pendingDrafts();
  const queue = C.S.orders.filter(o=>o.status==='awaiting_assignment');
  const assigned = C.S.orders.filter(o=>o.status==='assigned');
  const out = C.S.orders.filter(o=>o.status==='out_for_delivery');
  closeSim();
  if(!drafts.length && !queue.length && !assigned.length && !out.length){
    const d = C.createDraftFromScript(0); toast('התקבלה שיחה חדשה','ok'); location.hash='#/draft/'+d.id; return;
  }
  if(drafts.length){ toast('טיוטה ממתינה לאישור','ok'); location.hash='#/draft/'+drafts[0].id; return; }
  if(queue.length){ location.hash='#/order/'+queue[0].id; setTimeout(()=>askAssign(queue[0].id),350); return; }
  if(assigned.length){ location.hash='#/order/'+assigned[0].id; setTimeout(()=>askHandoff(assigned[0].id),350); return; }
  if(out.length){ location.hash='#/order/'+out[0].id; setTimeout(()=>askOutcome(out[0].id),350); return; }
}

// ---------------------------------------------------------------- role switch
function openRoles(){
  modal({ title:'תצוגת תפקיד',
    body:`${notice('מחליף התפקידים מיועד להדגמה בלבד. בגרסת הייצור התפקיד נקבע לפי המשתמש המחובר וההרשאות נאכפות בשרת.','info')}
      <div style="display:grid;gap:9px;margin-block-start:16px">
      ${['owner','store_manager','staff'].map(r=>`
        <button class="row" style="border:1px solid ${C.S.role===r?'var(--brand)':'var(--line)'};border-radius:12px" data-role="${r}">
          <div class="row-main"><div class="row-title">${esc(ROLE_HE[r])}</div>
          <div class="row-sub">${esc(ROLE_DESC[r])}</div></div>
          ${C.S.role===r?pill('נבחר','brand'):''}</button>`).join('')}
      <div style="font-size:12px;color:var(--faint);margin-block-start:6px">נהגים</div>
      ${drivers().map(d=>`
        <button class="row" style="border:1px solid ${C.S.role==='driver'&&C.S.driverId===d.id?'var(--brand)':'var(--line)'};border-radius:12px" data-role="driver" data-drv="${d.id}">
          <div class="row-main"><div class="row-title">${esc(d.name)}</div>
          <div class="row-sub">${esc(d.vehicle)} · רואה רק את המשלוחים והמלאי שלו</div></div>
          ${C.S.role==='driver'&&C.S.driverId===d.id?pill('נבחר','brand'):''}</button>`).join('')}
      </div>`,
    foot:`<button class="btn btn-ghost" data-close="1">סגירה</button>`,
    onMount:r=> r.querySelectorAll('[data-role]').forEach(b=> b.addEventListener('click',()=>{
      C.S.role = b.dataset.role;
      if(b.dataset.drv) C.S.driverId = b.dataset.drv;
      C.save(); closeModal(); location.hash='#/'; route();
      toast('תצוגה: '+(C.S.role==='driver'?uName(C.S.driverId):ROLE_HE[C.S.role]),'ok');
    }))});
}

// ---------------------------------------------------------------- nav toggles
const openNav  = () => { $('#sidebar').classList.add('open'); $('#scrim').hidden=false; };
const closeNav = () => { $('#sidebar').classList.remove('open'); if($('#simpanel').hidden) $('#scrim').hidden=true; };

// ---------------------------------------------------------------- boot
function start(){
  $('#gate').hidden = true;
  $('#app').hidden = false;
  C.boot();
  if(!C.S.driverId) C.S.driverId = 'u_d1';
  renderNav();
  route();
}

window.addEventListener('hashchange', route);
$('#menu-btn').addEventListener('click', ()=> $('#sidebar').classList.contains('open') ? closeNav() : openNav());
$('#scrim').addEventListener('click', ()=>{ closeNav(); closeSim(); });
$('#role-btn').addEventListener('click', openRoles);
$('#sim-btn').addEventListener('click', openSim);
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(); closeNav(); closeSim(); } });

function tryEnter(){
  const v = $('#code').value.trim();
  if(v === ACCESS_CODE){ sessionStorage.setItem('merkaz.ok','1'); start(); }
  else { $('#gate-err').hidden = false; $('#code').value=''; $('#code').focus(); }
}
$('#gate-btn').addEventListener('click', tryEnter);
$('#code').addEventListener('keydown', e=>{ if(e.key==='Enter') tryEnter(); });

if(sessionStorage.getItem('merkaz.ok')==='1') start();
else $('#code').focus();
