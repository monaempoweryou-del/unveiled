// recon.js — התחשבנות נהגים. Pure calculation, no database access.
// A driver earns a fixed fee per delivered order and takes it out of the cash
// they collected. This is a reconciliation view only: it never changes an
// order's revenue, payment method, or any sales total.
export const DRIVER_FEE = 100;

// Orders are chained day by day in delivery order. The balance the company
// still owes a driver carries into the next day, and into the next report
// period, so the opening balance for any date range is derived from every
// delivery before it, never from the filter the user happens to have set.
export function reconcileDrivers(orders, { from, to=null, fee=DRIVER_FEE, drivers=[] }={}){
  const fromDay = String(from).slice(0,10);
  const toDay   = to ? String(to).slice(0,10) : null;

  const byDriver = {};
  for(const d of drivers) byDriver[d.id] = { id:d.id, name:d.name, days:{} };
  for(const o of orders){
    if(o.status !== 'delivered' || !o.driver_id || !o.delivered_at) continue;
    const drv = byDriver[o.driver_id] ||= { id:o.driver_id, name:o.drivers?.name || '—', days:{} };
    const day = o.delivered_at.slice(0,10);
    const row = drv.days[day] ||= { date:day, delivered:0, cash:0 };
    row.delivered += 1;
    if(o.payment_status === 'paid' && o.payment_method === 'cash') row.cash += +(o.final_amount ?? o.total ?? 0);
  }

  const result = Object.values(byDriver).map(drv=>{
    const days = Object.values(drv.days).sort((a,b)=>a.date.localeCompare(b.date));
    let balance = 0;                 // owed to the driver, carried forward
    let opening = null;
    const periodDays = [];
    const sum = { delivered:0, pay:0, cash:0, kept:0, toOwner:0 };
    for(const d of days){
      if(toDay && d.date > toDay) break;
      const earned  = d.delivered * fee;
      const due     = balance + earned;
      const kept    = Math.min(d.cash, due);
      const toOwner = Math.max(d.cash - due, 0);
      const closing = Math.max(due - d.cash, 0);
      if(d.date < fromDay){ balance = closing; continue; }
      if(opening === null) opening = balance;
      periodDays.push({ date:d.date, delivered:d.delivered, earned, cash:d.cash, opening:balance, due, kept, toOwner, closing });
      sum.delivered += d.delivered; sum.pay += earned; sum.cash += d.cash; sum.kept += kept; sum.toOwner += toOwner;
      balance = closing;
    }
    if(opening === null) opening = balance;   // no deliveries in the period: opening is whatever is carried
    const totalDue = opening + sum.pay;
    const owed = balance;                     // closing balance after the last day in the period
    const status = owed > 0 ? 'owed' : sum.toOwner > 0 ? 'transfer' : 'settled';
    return { id:drv.id, name:drv.name, delivered:sum.delivered, pay:sum.pay, cash:sum.cash,
             opening, totalDue, kept:sum.kept, toOwner:sum.toOwner, owed, status, days:periodDays };
  });

  result.sort((a,b)=> (b.delivered - a.delivered) || a.name.localeCompare(b.name,'he'));
  const combined = result.reduce((c,r)=>({ delivered:c.delivered+r.delivered, pay:c.pay+r.pay, cash:c.cash+r.cash,
    toOwner:c.toOwner+r.toOwner, owed:c.owed+r.owed }), { delivered:0, pay:0, cash:0, toOwner:0, owed:0 });
  return { drivers: result, combined };
}
