// core.js — ledger engine + business services.
// The ledger is append-only. Balances are ALWAYS derived, never stored.
// Every service here mirrors an atomic SQL function in the Phase 0 design and is
// the only path that may write a movement. Swapping this file for Supabase RPC
// calls is the production migration; no screen touches the ledger directly.

import { PRODUCTS, USERS, CUSTOMERS, WA_SCRIPTS, LOW_GOODS_NOTE } from './data.js';

export const KEY = 'merkaz.demo.v1';
const DAY = 86400000;

export const LOC = {
  WH:'l_wh', RES:'l_res', OPEN:'l_open', SUP:'l_sup', CUST:'l_cust',
  DMG:'l_dmg', EXP:'l_exp', MISS:'l_miss', ADJ:'l_adj',
};
export const driverLoc = uid => 'l_drv_' + uid;

function baseLocations(){
  const v = (id,he) => ({ id, kind:'virtual', he });
  const list = [
    { id:LOC.WH, kind:'warehouse', he:'מחסן ראשי' },
    v(LOC.RES,'משוריין'), v(LOC.OPEN,'פתיחת מלאי'), v(LOC.SUP,'ספק'),
    v(LOC.CUST,'לקוח'), v(LOC.DMG,'פגום'), v(LOC.EXP,'פג תוקף'),
    v(LOC.MISS,'חסר'), v(LOC.ADJ,'התאמה ידנית'),
  ];
  USERS.filter(u=>u.role==='driver').forEach(u=>
    list.push({ id:driverLoc(u.id), kind:'driver', he:u.vehicle+' · '+u.name, driver:u.id }));
  return list;
}

// ---------------------------------------------------------------- state
export let S = null;
let seq = 0;
const uid = p => p+'_'+(++seq).toString(36)+Math.random().toString(36).slice(2,6);
const subs = new Set();
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
function emit(){ save(); subs.forEach(f=>f()); }

export function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
export function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){ const p = JSON.parse(raw); if(p && p.v===1){ S = p; return true; } }
  }catch(e){}
  return false;
}
export function boot(){ if(!load()) resetDemo(false); }
export function resetDemo(notify=true){ S = seed(); save(); if(notify) subs.forEach(f=>f()); }

// ---------------------------------------------------------------- ledger
function post({ product, qty, from, to, type, order=null, actor, key, note=null, at=null, ref=null, reverses=null }){
  if(S.txns.some(t=>t.key===key)) return S.txns.find(t=>t.key===key); // idempotent
  if(from===to) throw new Error('MERKAZ_SELF_TRANSFER');
  if(!(qty>0)) throw new Error('MERKAZ_BAD_QTY');
  const t = { id:uid('tx'), product, qty, from, to, type, order, actor,
              at: at || Date.now(), note, key, ref, reverses };
  S.txns.push(t);
  return t;
}

export function balance(loc, product){
  let n = 0;
  for(const t of S.txns){
    if(t.product!==product) continue;
    if(t.to===loc) n += t.qty;
    if(t.from===loc) n -= t.qty;
  }
  return n;
}
export const reserved       = p => balance(LOC.RES, p);
export const whAvailable    = p => balance(LOC.WH, p);
export const whPhysical     = p => balance(LOC.WH, p) + reserved(p);
export const driverHolds    = (uidr,p) => balance(driverLoc(uidr), p);
export const soldQty        = p => balance(LOC.CUST, p);
export const returnedQty    = p => S.txns.filter(t=>t.product===p && t.type==='driver_to_warehouse').reduce((a,t)=>a+t.qty,0);
export const lostQty        = p => balance(LOC.DMG,p)+balance(LOC.EXP,p)+balance(LOC.MISS,p);
export const inTransit      = p => USERS.filter(u=>u.role==='driver').reduce((a,u)=>a+driverHolds(u.id,p),0);

export const product = id => PRODUCTS.find(p=>p.id===id);
export const user    = id => USERS.find(u=>u.id===id);
export const customer= id => CUSTOMERS.find(c=>c.id===id);
export const order   = id => S.orders.find(o=>o.id===id);
export const locName = id => (S.locations.find(l=>l.id===id)||{}).he || id;

// ---------------------------------------------------------------- journals
function audit(entity, entityId, action, actor, meta={}, at=null){
  S.audit.push({ id:uid('a'), entity, entityId, action, actor, meta, at: at||Date.now() });
}
function setStatus(o, next, actor, channel='dashboard', note=null, at=null){
  S.history.push({ id:uid('h'), order:o.id, from:o.status, to:next, actor, channel, note, at: at||Date.now() });
  o.status = next; o.updatedAt = at||Date.now();
}
function event(type, payload, at=null){
  S.events.unshift({ id:uid('e'), type, payload, at: at||Date.now() });
  if(S.events.length>300) S.events.length = 300;
}
export const EVENTS = ['MessageReceived','OrderCandidateDetected','OrderDraftCreated','OrderConfirmed',
  'DriverAssigned','InventoryReserved','InventoryTransferred','DeliveryCompleted','DeliveryFailed',
  'PaymentRecorded','InventoryReturned','ExceptionRaised'];

// ---------------------------------------------------------------- orders
export function orderTotal(o){
  const gross = o.lines.reduce((a,l)=>a + l.qty*l.price, 0);
  return Math.max(0, gross - (o.discount||0));
}
export function deliveredTotal(o){
  const gross = o.lines.reduce((a,l)=>a + (l.delivered||0)*l.price, 0);
  return Math.max(0, gross - (o.discount||0));
}
export function paidAmount(o){ return S.payments.filter(p=>p.order===o.id).reduce((a,p)=>a+p.amount,0); }
export function refreshPayment(o){
  const due = o.status==='delivered'||o.status==='partially_delivered' ? deliveredTotal(o) : orderTotal(o);
  const paid = paidAmount(o);
  o.payment = paid<=0 ? 'unpaid' : paid+0.001 < due ? 'partially_paid' : 'paid';
  o.due = Math.max(0, +(due - paid).toFixed(2));
}

let orderNo = 100;
function newOrderNumber(){ return 'ORD-' + String(++orderNo).padStart(6,'0'); }

export function createOrder({ customerId, lines, address, when, payMethod, notes, actor, status='draft', draftId=null, at=null }){
  const o = {
    id:uid('o'), no:newOrderNumber(), status, payment:'unpaid',
    customer:customerId, driver:null, draft:draftId,
    address: address || (customer(customerId)||{}).address || '',
    when: when||null, payMethod: payMethod||null, notes: notes||null,
    lines: lines.map(([pid,q])=>({ product:pid, qty:q, delivered:0, price:product(pid).price })),
    discount:0, exception:false, failReason:null,
    createdBy:actor, confirmedBy:null, confirmedAt:null,
    createdAt: at||Date.now(), updatedAt: at||Date.now(), due:0,
  };
  o.total = orderTotal(o);
  S.orders.unshift(o);
  S.history.push({ id:uid('h'), order:o.id, from:null, to:status, actor, channel:'dashboard', at:at||Date.now() });
  return o;
}

// GATE 2 — the only action that reserves stock. All lines or none.
export function confirmOrder(orderId, actor, at=null){
  const o = order(orderId);
  if(!o) throw new Error('MERKAZ_NOT_FOUND');
  if(!['draft','requires_review'].includes(o.status)) throw new Error('MERKAZ_INVALID_TRANSITION');
  for(const l of o.lines){
    const avail = whAvailable(l.product);
    if(avail < l.qty) throw new Error('MERKAZ_INSUFFICIENT_STOCK:'+product(l.product).he+':'+avail);
  }
  for(const l of o.lines){
    post({ product:l.product, qty:l.qty, from:LOC.WH, to:LOC.RES, type:'warehouse_reservation',
           order:o.id, actor, key:'reserve:'+o.id+':'+l.product, note:'שריון בעת אישור הזמנה', at });
  }
  o.confirmedBy = actor; o.confirmedAt = at||Date.now(); o.total = orderTotal(o);
  refreshPayment(o);
  setStatus(o,'awaiting_assignment',actor,'dashboard',null,at);
  if(o.draft){ const d = S.drafts.find(x=>x.id===o.draft); if(d) d.status='promoted'; }
  audit('order',o.id,'confirm',actor,{ no:o.no, total:o.total },at);
  event('InventoryReserved',{ order:o.no, lines:o.lines.length },at);
  event('OrderConfirmed',{ order:o.no, by:user(actor).name },at);
  emit(); return o;
}

export function releaseReservation(orderId, actor, at=null){
  const o = order(orderId);
  for(const l of o.lines){
    if(balance(LOC.RES,l.product) <= 0) continue;
    post({ product:l.product, qty:l.qty, from:LOC.RES, to:LOC.WH, type:'reservation_release',
           order:o.id, actor, key:'release:'+o.id+':'+l.product, note:'ביטול שריון', at });
  }
}

export function cancelOrder(orderId, actor, reason){
  const o = order(orderId);
  if(['awaiting_assignment','assigned','ready_for_pickup'].includes(o.status)) releaseReservation(orderId, actor);
  o.failReason = reason || null;
  setStatus(o,'cancelled',actor,'dashboard',reason);
  audit('order',o.id,'cancel',actor,{ no:o.no, reason });
  emit(); return o;
}

// GATE 3 — first claim wins.
export function assignDriver(orderId, driverId, actor, channel='telegram', at=null){
  const o = order(orderId);
  if(o.driver && o.driver!==driverId && ['assigned','ready_for_pickup','picked_up','out_for_delivery'].includes(o.status))
    throw new Error('MERKAZ_ALREADY_ASSIGNED');
  if(!['awaiting_assignment','assigned'].includes(o.status)) throw new Error('MERKAZ_INVALID_TRANSITION');
  const prev = o.driver;
  o.driver = driverId;
  setStatus(o,'assigned',actor,channel,null,at);
  audit('order',o.id,'assign',actor,{ no:o.no, driver:user(driverId).name, previous: prev?user(prev).name:null },at);
  event('DriverAssigned',{ order:o.no, driver:user(driverId).name },at);
  emit(); return o;
}

export function reassignDriver(orderId, driverId, actor, reason){
  const o = order(orderId); const prev = o.driver;
  o.driver = driverId;
  S.history.push({ id:uid('h'), order:o.id, from:o.status, to:o.status, actor, channel:'dashboard',
    note:'שיבוץ מחדש: '+(prev?user(prev).name:'ללא')+' ← '+user(driverId).name+(reason?' · '+reason:''), at:Date.now() });
  audit('order',o.id,'reassign',actor,{ no:o.no, from:prev?user(prev).name:null, to:user(driverId).name, reason });
  emit(); return o;
}

// GATE 4 — two-sided handoff. A mismatch moves nothing.
export function handoff(orderId, actor, driverCounts, at=null){
  const o = order(orderId);
  if(!o.driver) throw new Error('MERKAZ_NO_DRIVER');
  const mismatch = o.lines.filter(l => (driverCounts[l.product] ?? l.qty) !== l.qty);
  if(mismatch.length){
    mismatch.forEach(l=>{
      S.discrepancies.push({ id:uid('dx'), order:o.id, product:l.product, location:LOC.WH,
        expected:l.qty, actual:driverCounts[l.product] ?? 0, kind:'handoff_mismatch',
        status:'open', raisedBy:actor, at:at||Date.now(), resolution:null, resolvedBy:null });
    });
    o.exception = true;
    setStatus(o,'exception',actor,'dashboard','פער בספירת מסירה לנהג',at);
    audit('order',o.id,'handoff_mismatch',actor,{ no:o.no, lines:mismatch.length },at);
    event('ExceptionRaised',{ order:o.no, kind:'פער בהעברה לנהג' },at);
    emit();
    return { ok:false, mismatch:mismatch.length };
  }
  const dl = driverLoc(o.driver);
  for(const l of o.lines){
    post({ product:l.product, qty:l.qty, from:LOC.RES, to:dl, type:'warehouse_to_driver',
           order:o.id, actor, key:'handoff:'+o.id+':'+l.product, note:'מסירה פיזית לנהג', at });
  }
  setStatus(o,'out_for_delivery',actor,'dashboard',null,at);
  audit('order',o.id,'handoff',actor,{ no:o.no, driver:user(o.driver).name },at);
  event('InventoryTransferred',{ order:o.no, to:user(o.driver).name },at);
  emit();
  return { ok:true };
}

// GATE 5 — a failure can never produce a sale.
export function completeDelivery(orderId, actor, outcome, deliveredMap=null, reason=null, at=null){
  const o = order(orderId);
  const dl = driverLoc(o.driver);

  if(outcome==='failed' || outcome==='cancelled_by_customer'){
    if(!reason) throw new Error('MERKAZ_REASON_REQUIRED');
    o.failReason = reason; o.exception = true;
    setStatus(o, outcome==='failed'?'failed':'cancelled', actor,'telegram',reason,at);
    audit('order',o.id,outcome,actor,{ no:o.no, reason },at);
    event('DeliveryFailed',{ order:o.no, reason },at);
    emit(); return o;
  }

  const map = deliveredMap || Object.fromEntries(o.lines.map(l=>[l.product,l.qty]));
  let any=false, partial=false;
  for(const l of o.lines){
    const q = Math.max(0, Math.min(l.qty, map[l.product] ?? 0));
    l.delivered = q;
    if(q>0){ any=true;
      post({ product:l.product, qty:q, from:dl, to:LOC.CUST, type:'driver_to_customer',
             order:o.id, actor, key:'deliver:'+o.id+':'+l.product, note:'מסירה ללקוח', at });
    }
    if(q < l.qty) partial=true;
  }
  if(!any){ o.failReason = reason||'לא נמסרו פריטים'; setStatus(o,'failed',actor,'telegram',o.failReason,at);
    event('DeliveryFailed',{ order:o.no, reason:o.failReason },at); emit(); return o; }

  setStatus(o, partial?'partially_delivered':'delivered', actor,'telegram',reason,at);
  o.total = deliveredTotal(o);
  refreshPayment(o);
  audit('order',o.id,'deliver',actor,{ no:o.no, partial },at);
  event('DeliveryCompleted',{ order:o.no, partial },at);
  emit(); return o;
}

// idem: the caller supplies the idempotency key, exactly as it will with the real
// integrations. The UI mints one when the payment dialog opens, so a double tap or a
// retried request reuses it and posts once, while a genuine later payment gets a new one.
export function recordPayment(orderId, amount, method, actor, at=null, idem=null){
  const o = order(orderId);
  const ts = at || Date.now();
  const p = { id:uid('pay'), order:o.id, amount:+amount, method, by:actor, at: ts,
              key: idem || ('pay:'+o.id+':'+ts+':'+Math.random().toString(36).slice(2,8)) };
  if(S.payments.some(x=>x.key===p.key)) return o;
  S.payments.push(p);
  refreshPayment(o);
  audit('order',o.id,'payment',actor,{ no:o.no, amount:p.amount, method },at);
  event('PaymentRecorded',{ order:o.no, amount:p.amount },at);
  emit(); return o;
}

export function returnToWarehouse(orderId, actor, counts=null, at=null){
  const o = order(orderId);
  const dl = driverLoc(o.driver);
  let moved = false;
  for(const l of o.lines){
    const held = Math.min(balance(dl,l.product), l.qty - (l.delivered||0));
    const q = counts ? Math.min(held, counts[l.product] ?? held) : held;
    if(q>0){
      moved = true;
      post({ product:l.product, qty:q, from:dl, to:LOC.WH, type:'driver_to_warehouse',
             order:o.id, actor, key:'return:'+o.id+':'+l.product, note:'החזרה למחסן', at });
    }
    if(counts && (counts[l.product] ?? held) !== held){
      S.discrepancies.push({ id:uid('dx'), order:o.id, product:l.product, location:LOC.WH,
        expected:held, actual:counts[l.product] ?? 0, kind:'return_mismatch', status:'open',
        raisedBy:actor, at:at||Date.now(), resolution:null, resolvedBy:null });
      o.exception = true;
    }
  }
  if(moved){
    setStatus(o,'returned',actor,'dashboard',null,at);
    event('InventoryReturned',{ order:o.no },at);
  }
  audit('order',o.id,'return',actor,{ no:o.no },at);
  emit(); return o;
}

export function adjustInventory(productId, locId, delta, reason, actor){
  if(!reason) throw new Error('MERKAZ_REASON_REQUIRED');
  const n = Math.abs(delta);
  const k = 'adj:'+productId+':'+locId+':'+Date.now();
  if(delta>0) post({ product:productId, qty:n, from:LOC.ADJ, to:locId, type:'manual_adjustment', actor, key:k, note:reason });
  else        post({ product:productId, qty:n, from:locId, to:LOC.ADJ, type:'manual_adjustment', actor, key:k, note:reason });
  audit('inventory',productId,'adjust',actor,{ delta, location:locName(locId), reason });
  emit();
}

export function writeOff(productId, locId, qty, kind, reason, actor){
  const dest = kind==='damaged'?LOC.DMG : kind==='expired'?LOC.EXP : LOC.MISS;
  post({ product:productId, qty, from:locId, to:dest, type:kind, actor,
         key:kind+':'+productId+':'+locId+':'+Date.now(), note:reason });
  audit('inventory',productId,kind,actor,{ qty, location:locName(locId), reason });
  emit();
}

export function reverseTxn(txnId, actor, reason){
  const t = S.txns.find(x=>x.id===txnId);
  if(!t || t.reverses) return;
  post({ product:t.product, qty:t.qty, from:t.to, to:t.from, type:'reversal', order:t.order,
         actor, key:'rev:'+t.id, note:reason||'תיקון תנועה', reverses:t.id });
  audit('inventory',t.product,'reverse',actor,{ txn:t.id, reason });
  emit();
}

export function resolveDiscrepancy(dxId, actor, note, applyActual){
  const d = S.discrepancies.find(x=>x.id===dxId);
  if(!d || d.status==='resolved') return;
  if(applyActual && d.actual !== d.expected){
    const delta = d.actual - d.expected;
    const n = Math.abs(delta);
    if(n>0) post({ product:d.product, qty:n, from: delta>0?LOC.ADJ:LOC.WH, to: delta>0?LOC.WH:LOC.ADJ,
      type:'manual_adjustment', order:d.order, actor, key:'dxfix:'+d.id, note:'תיקון בעקבות פער · '+note });
  }
  d.status='resolved'; d.resolution=note; d.resolvedBy=actor; d.resolvedAt=Date.now();
  const o = order(d.order);
  if(o && !S.discrepancies.some(x=>x.order===o.id && x.status==='open')){
    o.exception = false;
    if(o.status==='exception') setStatus(o,'awaiting_assignment',actor,'dashboard','פער נסגר');
  }
  audit('discrepancy',d.id,'resolve',actor,{ note });
  emit();
}

// ---------------------------------------------------------------- drafts
export function createDraftFromScript(scriptIndex, at=null){
  const sc = WA_SCRIPTS[scriptIndex % WA_SCRIPTS.length];
  const c = customer(sc.customer);
  const now = at || Date.now();
  const msgs = sc.turns.map((t,i)=>({ id:uid('m'), dir:t.dir, text:t.t, at: now - (sc.turns.length-i)*45000 }));
  msgs.forEach(m=> event('MessageReceived',{ from:c.name, text:m.text }, m.at));
  const d = {
    id:uid('d'), customer:c.id, phone:c.phone, messages:msgs,
    lines: sc.extract.lines.map(([p,q])=>({ product:p, qty:q })),
    address: sc.extract.uncertain?.includes('delivery_address') ? null : c.address,
    payMethod: sc.extract.payment, when: sc.extract.when,
    confidence: sc.extract.confidence, uncertain: sc.extract.uncertain||[],
    alias: !!sc.extract.alias, status:'pending_review', at: now,
  };
  S.drafts.unshift(d);
  event('OrderCandidateDetected',{ from:c.name }, now);
  event('OrderDraftCreated',{ from:c.name, confidence:d.confidence }, now);
  emit();
  return d;
}
export function discardDraft(id, actor){
  const d = S.drafts.find(x=>x.id===id); if(!d) return;
  d.status='discarded'; audit('draft',id,'discard',actor,{}); emit();
}

// ---------------------------------------------------------------- derived
export function lowStock(){
  if(!S.settings.lowStockEnabled) return [];
  return PRODUCTS.map(p=>({ p, avail:whAvailable(p.id), th:S.settings.thresholds[p.id] }))
    .filter(r=>r.th!=null && r.avail<=r.th);
}
export function salesRows(fromTs=0){
  const rows = {};
  for(const t of S.txns){
    if(t.type!=='driver_to_customer' || t.at<fromTs) continue;
    const o = order(t.order); if(!o) continue;
    const line = o.lines.find(l=>l.product===t.product); if(!line) continue;
    const r = rows[t.product] || (rows[t.product] = { product:t.product, qty:0, revenue:0 });
    r.qty += t.qty; r.revenue += t.qty*line.price;
  }
  return Object.values(rows).sort((a,b)=>b.revenue-a.revenue);
}
export function revenueBetween(from, to=Date.now()){
  let sum = 0;
  for(const t of S.txns){
    if(t.type!=='driver_to_customer' || t.at<from || t.at>to) continue;
    const o = order(t.order); if(!o) continue;
    const line = o.lines.find(l=>l.product===t.product); if(!line) continue;
    sum += t.qty*line.price;
  }
  return sum;
}
export const openOrders = () => S.orders.filter(o=>
  ['draft','requires_review','awaiting_assignment','assigned','ready_for_pickup','picked_up','out_for_delivery','exception'].includes(o.status));
export const activeDeliveries = () => S.orders.filter(o=>['assigned','ready_for_pickup','picked_up','out_for_delivery'].includes(o.status));
export const unpaidOrders = () => S.orders.filter(o=>
  ['delivered','partially_delivered'].includes(o.status) && o.payment!=='paid');
export const openDiscrepancies = () => S.discrepancies.filter(d=>d.status==='open');
export const pendingDrafts = () => S.drafts.filter(d=>d.status==='pending_review');

// ---------------------------------------------------------------- seed
function seed(){
  seq = 0; orderNo = 100;
  const now = Date.now();
  S = {
    v:1, role:'owner', locations:baseLocations(),
    txns:[], orders:[], history:[], payments:[], drafts:[], discrepancies:[], audit:[], events:[],
    settings:{
      lowStockEnabled:false, thresholds:{}, aliasConfirmed:false,
      waStatus:'pending', tgStatus:'pending',
      notes:[
        { key:'unresolved_number_3500', title:'המספר 3500', value:'3500',
          note:'הופיע מעל טבלת מלאי הפתיחה. המשמעות אינה ידועה ולא נעשה בו שימוש באף חישוב.' },
        { key:'low_goods_list', title:'רשימת "סחורה נמוכה"', value:LOW_GOODS_NOTE,
          note:'ייתכן שאלו רמות התראה, כמויות להזמנה או ספירה נפרדת. לא מופעל עד לאישור הלקוח. המוצר עכביש אינו מופיע ברשימה ולא הומצא עבורו ערך.' },
      ],
    },
  };

  // opening balances, as ledger transactions dated the opening day
  const openAt = now - 21*DAY;
  PRODUCTS.forEach(p=> post({ product:p.id, qty:p.opening, from:LOC.OPEN, to:LOC.WH,
    type:'opening_balance', actor:'u_owner', key:'opening:'+p.id, at:openAt,
    note:'ספירת פתיחה מאושרת', ref:'opening-count' }));

  // restocks so history looks lived-in
  post({ product:'p_vor', qty:40, from:LOC.SUP, to:LOC.WH, type:'supplier_restock',
         actor:'u_manager', key:'sup:1', at:now-9*DAY, note:'קליטת סחורה מספק' });
  post({ product:'p_water', qty:24, from:LOC.SUP, to:LOC.WH, type:'supplier_restock',
         actor:'u_manager', key:'sup:2', at:now-5*DAY, note:'קליטת סחורה מספק' });

  const H = [
    // completed + paid
    { c:'c2', lines:[['p_vor',12],['p_koach',4]], drv:'u_d1', d:-8, outcome:'full', pay:'cash' },
    { c:'c5', lines:[['p_water',6],['p_scissors',5]], drv:'u_d2', d:-7, outcome:'full', pay:'card' },
    { c:'c1', lines:[['p_horse',2]], drv:'u_d1', d:-6, outcome:'full', pay:'cash' },
    { c:'c8', lines:[['p_scissors',8],['p_vor',6]], drv:'u_d3', today:0.15, outcome:'full', pay:'transfer' },
    { c:'c4', lines:[['p_height',1],['p_koach',2]], drv:'u_d2', today:0.40, outcome:'full', pay:'cash' },
    // delivered, payment still open
    { c:'c3', lines:[['p_dos',1],['p_vor',4]], drv:'u_d1', today:0.65, outcome:'full', pay:null },
    { c:'c7', lines:[['p_scissors',6]], drv:'u_d3', d:-2, outcome:'full', pay:null },
    // partial
    { c:'c6', lines:[['p_koach',5],['p_water',4]], drv:'u_d2', d:-3, outcome:'partial', pay:'cash' },
    // failed, still with driver
    { c:'c4', lines:[['p_spider',2]], drv:'u_d3', d:-2, outcome:'failed' },
    // returned
    { c:'c5', lines:[['p_horse',3]], drv:'u_d1', d:-4, outcome:'returned' },
  ];

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const sinceMidnight = Math.max(60e3, now - todayStart.getTime());
  H.forEach((h,i)=>{
    // a 'today' entry lands its delivery partway through the current day so the
    // dashboard always has same-day sales whatever hour the demo is opened
    const t0 = h.today != null
      ? Math.max(todayStart.getTime()+30e3, now - sinceMidnight*h.today) - 3.2*3600e3
      : now + h.d*DAY;
    const o = createOrder({ customerId:h.c, lines:h.lines, actor:'u_staff', at:t0,
      payMethod:h.pay||'cash', when:'לפי סיכום' });
    confirmOrder(o.id,'u_staff', t0+3600e3);
    assignDriver(o.id, h.drv, h.drv,'telegram', t0+5400e3);
    handoff(o.id,'u_manager', {}, t0+7200e3);
    if(h.outcome==='full'){
      completeDelivery(o.id, h.drv,'delivered', null, null, t0+3.2*3600e3);
      if(h.pay) recordPayment(o.id, deliveredTotal(o), h.pay, h.drv, t0+3.3*3600e3, 'pay:'+o.id+':settle');
    } else if(h.outcome==='partial'){
      const m = {}; o.lines.forEach((l,ix)=> m[l.product] = ix===0 ? Math.max(1,l.qty-2) : l.qty);
      completeDelivery(o.id, h.drv,'partial', m, 'הלקוח קיבל חלק מהכמות', t0+3.2*3600e3);
      if(h.pay) recordPayment(o.id, deliveredTotal(o), h.pay, h.drv, t0+3.3*3600e3, 'pay:'+o.id+':settle');
    } else if(h.outcome==='failed'){
      completeDelivery(o.id, h.drv,'failed', null,'הלקוח לא נמצא בכתובת', t0+3.2*3600e3);
    } else if(h.outcome==='returned'){
      completeDelivery(o.id, h.drv,'failed', null,'הלקוח ביטל בדלת', t0+3.2*3600e3);
      returnToWarehouse(o.id,'u_manager', null, t0+6*3600e3);
    }
  });

  // live pipeline
  const a = createOrder({ customerId:'c1', lines:[['p_scissors',4],['p_horse',2]], actor:'u_staff',
    at:now-5*3600e3, payMethod:'cash', when:'היום אחר הצהריים' });
  confirmOrder(a.id,'u_staff', now-4.8*3600e3);

  const b = createOrder({ customerId:'c8', lines:[['p_vor',10],['p_water',3]], actor:'u_staff',
    at:now-4*3600e3, payMethod:'transfer', when:'היום' });
  confirmOrder(b.id,'u_staff', now-3.9*3600e3);
  assignDriver(b.id,'u_d2','u_d2','telegram', now-3.5*3600e3);

  const c = createOrder({ customerId:'c3', lines:[['p_koach',3],['p_vor',5]], actor:'u_staff2',
    at:now-3*3600e3, payMethod:'cash', when:'היום' });
  confirmOrder(c.id,'u_staff2', now-2.8*3600e3);
  assignDriver(c.id,'u_d1','u_d1','telegram', now-2.6*3600e3);
  handoff(c.id,'u_manager', {}, now-2.2*3600e3);

  const dOrd = createOrder({ customerId:'c5', lines:[['p_scissors',3],['p_water',2]], actor:'u_staff',
    at:now-2*3600e3, payMethod:'cash', when:'היום' });
  confirmOrder(dOrd.id,'u_staff', now-1.9*3600e3);
  assignDriver(dOrd.id,'u_d3','u_d3','telegram', now-1.7*3600e3);
  handoff(dOrd.id,'u_manager', { p_scissors:2, p_water:2 }, now-1.4*3600e3); // deliberate mismatch

  // needs review, missing address
  const e = createOrder({ customerId:'c7', lines:[['p_height',2]], actor:'u_staff', at:now-70*60e3 });
  e.address=''; setStatus(e,'requires_review','u_staff','dashboard','חסרה כתובת למשלוח', now-70*60e3);

  // two pending WhatsApp drafts, one of them alias-ambiguous
  createDraftFromScript(2, now-40*60e3);
  createDraftFromScript(1, now-16*60e3);

  S.orders.forEach(refreshPayment);
  return S;
}
