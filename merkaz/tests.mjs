// tests.mjs — ledger and workflow invariants. Run: node tests.mjs
globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null}, setItem(k,v){this._d[k]=v} };
const C = await import('./js/core.js');
const { PRODUCTS } = await import('./js/data.js');

let pass=0, fail=0;
const t=(name,fn)=>{ try{ fn(); console.log('  ✓',name); pass++; }catch(e){ console.log('  ✗',name,'→',e.message); fail++; } };
const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(`${m||''} got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };
const throws=(fn,frag)=>{ try{ fn(); }catch(e){ if(!e.message.includes(frag)) throw new Error('wrong error '+e.message); return; } throw new Error('expected throw '+frag); };
const fresh=()=>C.resetDemo(false);

console.log('\nמלאי · ledger invariants');
fresh();
t('opening balances are ledger transactions, not written values', ()=>{
  const open = C.S.txns.filter(x=>x.type==='opening_balance');
  eq(open.length, 8);
  eq(open.find(x=>x.product==='p_scissors').qty, 93);
  eq(open.find(x=>x.product==='p_dos').qty, 7);
});
t('no product ever holds a negative balance', ()=>{
  PRODUCTS.forEach(p=>{ if(C.whAvailable(p.id)<0||C.reserved(p.id)<0||C.inTransit(p.id)<0)
    throw new Error('negative on '+p.he); });
});
t('every transaction has an actor and a timestamp', ()=>{
  const bad = C.S.txns.filter(x=>!x.actor||!x.at);
  eq(bad.length, 0);
});
t('no transaction is dated in the future', ()=>{
  eq(C.S.txns.filter(x=>x.at>Date.now()+1000).length, 0);
});
t('every movement has a distinct source and destination', ()=>{
  eq(C.S.txns.filter(x=>x.from===x.to).length, 0);
});

console.log('\nשריון · reservation');
fresh();
t('confirmation reserves exactly the ordered quantity', ()=>{
  const before = C.whAvailable('p_vor');
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',5]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff');
  eq(C.whAvailable('p_vor'), before-5, 'available');
  eq(C.reserved('p_vor') >= 5, true, 'reserved');
});
t('insufficient stock aborts the whole confirmation, reserving nothing', ()=>{
  const avail = C.whAvailable('p_dos');
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',2],['p_dos',avail+50]], actor:'u_staff' });
  const vorBefore = C.whAvailable('p_vor');
  throws(()=>C.confirmOrder(o.id,'u_staff'),'INSUFFICIENT_STOCK');
  eq(C.whAvailable('p_vor'), vorBefore, 'first line must not be reserved either');
});
t('confirming twice does not double-reserve', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_koach',2]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff');
  const res = C.reserved('p_koach');
  throws(()=>C.confirmOrder(o.id,'u_staff'),'INVALID_TRANSITION');
  eq(C.reserved('p_koach'), res);
});
t('cancelling an order releases its reservation', ()=>{
  const before = C.whAvailable('p_water');
  const o = C.createOrder({ customerId:'c1', lines:[['p_water',3]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff');
  eq(C.whAvailable('p_water'), before-3);
  C.cancelOrder(o.id,'u_manager','הלקוח ביטל');
  eq(C.whAvailable('p_water'), before, 'stock must return to available');
});

console.log('\nשיבוץ · assignment');
fresh();
t('only the first driver to claim wins', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',1]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff');
  C.assignDriver(o.id,'u_d1','u_d1');
  throws(()=>C.assignDriver(o.id,'u_d2','u_d2'),'ALREADY_ASSIGNED');
  eq(C.order(o.id).driver,'u_d1');
});

console.log('\nמסירה לנהג · handoff');
fresh();
t('matching counts transfer stock from warehouse to driver', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',4]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d3','u_d3');
  const r = C.handoff(o.id,'u_manager',{ p_vor:4 });
  eq(r.ok,true); eq(C.driverHolds('u_d3','p_vor'),4);
  eq(C.order(o.id).status,'out_for_delivery');
});
t('a count mismatch moves nothing and raises a discrepancy', ()=>{
  const o = C.createOrder({ customerId:'c2', lines:[['p_koach',4]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d2','u_d2');
  const held = C.driverHolds('u_d2','p_koach');
  const dxBefore = C.openDiscrepancies().length;
  const r = C.handoff(o.id,'u_manager',{ p_koach:3 });
  eq(r.ok,false);
  eq(C.driverHolds('u_d2','p_koach'), held, 'no stock may move');
  eq(C.openDiscrepancies().length, dxBefore+1);
  eq(C.order(o.id).status,'exception');
});

console.log('\nמסירה ותשלום · delivery and payment');
fresh();
t('a failed delivery creates no sale and no payment', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_spider',2]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d1','u_d1'); C.handoff(o.id,'u_manager',{});
  const soldBefore = C.soldQty('p_spider');
  C.completeDelivery(o.id,'u_d1','failed',null,'הלקוח לא נמצא');
  eq(C.soldQty('p_spider'), soldBefore, 'sold must not change');
  eq(C.driverHolds('u_d1','p_spider') >= 2, true, 'stock stays with the driver');
  eq(C.S.payments.filter(p=>p.order===o.id).length, 0);
  eq(C.order(o.id).status,'failed');
});
t('a failed delivery without a reason is rejected', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_water',1]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d1','u_d1'); C.handoff(o.id,'u_manager',{});
  throws(()=>C.completeDelivery(o.id,'u_d1','failed',null,null),'REASON_REQUIRED');
});
t('delivered is not paid: the two statuses stay independent', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',2]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d2','u_d2'); C.handoff(o.id,'u_manager',{});
  C.completeDelivery(o.id,'u_d2','delivered');
  eq(C.order(o.id).status,'delivered');
  eq(C.order(o.id).payment,'unpaid');
  eq(C.order(o.id).due > 0, true);
});
t('partial delivery recalculates the total from what was delivered', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',10]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d3','u_d3'); C.handoff(o.id,'u_manager',{});
  const full = C.order(o.id).total;
  C.completeDelivery(o.id,'u_d3','partial',{ p_vor:4 },'חלקי');
  eq(C.order(o.id).status,'partially_delivered');
  eq(C.order(o.id).total, full*0.4, 'total must follow delivered quantity');
  eq(C.driverHolds('u_d3','p_vor') >= 6, true, 'undelivered units stay with the driver');
});
t('partial payment yields partially_paid, full payment yields paid', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_koach',2]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d1','u_d1'); C.handoff(o.id,'u_manager',{});
  C.completeDelivery(o.id,'u_d1','delivered');
  const due = C.order(o.id).due;
  C.recordPayment(o.id, Math.floor(due/2),'cash','u_d1');
  eq(C.order(o.id).payment,'partially_paid');
  C.recordPayment(o.id, C.order(o.id).due,'cash','u_d1');
  eq(C.order(o.id).payment,'paid');
  eq(C.order(o.id).due,0);
});

console.log('\nהחזרות ותיקונים · returns and corrections');
fresh();
t('a return moves stock from the driver back to the warehouse', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_horse',3]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d1','u_d1'); C.handoff(o.id,'u_manager',{});
  C.completeDelivery(o.id,'u_d1','failed',null,'הלקוח ביטל');
  const whBefore = C.whAvailable('p_horse');
  C.returnToWarehouse(o.id,'u_manager',null);
  eq(C.whAvailable('p_horse'), whBefore+3);
  eq(C.driverHolds('u_d1','p_horse'),0);
  eq(C.order(o.id).status,'returned');
});
t('a manual adjustment requires a reason', ()=>{
  throws(()=>C.adjustInventory('p_vor', C.LOC.WH, 5, '', 'u_owner'),'REASON_REQUIRED');
});
t('a reversal mirrors the original and keeps both rows', ()=>{
  const count = C.S.txns.length;
  const tx = C.S.txns.find(x=>x.type==='supplier_restock');
  C.reverseTxn(tx.id,'u_owner','נרשם בטעות');
  eq(C.S.txns.length, count+1, 'the original is never deleted');
  const rev = C.S.txns.find(x=>x.reverses===tx.id);
  eq([rev.from,rev.to],[tx.to,tx.from]);
});

console.log('\nעמידות · idempotency');
fresh();
t('the same movement key never posts twice', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',3]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d1','u_d1');
  C.handoff(o.id,'u_manager',{});
  const n1 = C.S.txns.length, held = C.driverHolds('u_d1','p_vor');
  C.handoff(o.id,'u_manager',{});           // replayed webhook / double tap
  eq(C.S.txns.length, n1, 'no duplicate transaction');
  eq(C.driverHolds('u_d1','p_vor'), held, 'no duplicate stock movement');
});
t('a repeated delivery report does not double-count the sale', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_water',2]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d2','u_d2'); C.handoff(o.id,'u_manager',{});
  C.completeDelivery(o.id,'u_d2','delivered');
  const sold = C.soldQty('p_water');
  C.completeDelivery(o.id,'u_d2','delivered');
  eq(C.soldQty('p_water'), sold);
});
t('a replayed payment request does not double-count', ()=>{
  const o = C.createOrder({ customerId:'c1', lines:[['p_vor',1]], actor:'u_staff' });
  C.confirmOrder(o.id,'u_staff'); C.assignDriver(o.id,'u_d1','u_d1'); C.handoff(o.id,'u_manager',{});
  C.completeDelivery(o.id,'u_d1','delivered');
  const due = C.order(o.id).due;
  C.recordPayment(o.id, due,'cash','u_d1', null, 'pay:'+o.id+':settle');
  const paid = C.paidAmount(C.order(o.id));
  C.recordPayment(o.id, due,'cash','u_d1', null, 'pay:'+o.id+':settle');  // replayed request
  eq(C.paidAmount(C.order(o.id)), paid);
});

console.log('\nנתונים שלא אושרו · unconfirmed data stays inert');
fresh();
t('low-stock thresholds are off and produce no alerts', ()=>{
  eq(C.S.settings.lowStockEnabled, false);
  eq(C.lowStock().length, 0);
  eq(Object.keys(C.S.settings.thresholds).length, 0);
});
t('the דוקטור alias is not merged by default', ()=>{
  eq(C.S.settings.aliasConfirmed, false);
});
t('3500 and the סחורה נמוכה list are parked as notes only', ()=>{
  const keys = C.S.settings.notes.map(x=>x.key);
  eq(keys.includes('unresolved_number_3500'), true);
  eq(keys.includes('low_goods_list'), true);
});

console.log('\nאיפוס · reset');
t('reset returns the demo to the approved opening count', ()=>{
  C.adjustInventory('p_vor', C.LOC.WH, 50, 'שינוי לצורך בדיקה', 'u_owner');
  fresh();
  const open = C.S.txns.filter(x=>x.type==='opening_balance');
  eq(open.find(x=>x.product==='p_scissors').qty, 93);
  eq(C.S.txns.filter(x=>x.note==='שינוי לצורך בדיקה').length, 0);
});

console.log(`\n${pass} עברו · ${fail} נכשלו\n`);
process.exit(fail?1:0);
