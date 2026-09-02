// api.js — Supabase auth + REST + domain operations.
// The database is the source of truth. Nothing here caches business data.
const URL_ = 'https://bqmwgcttuyqoyrvlmbmi.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxbXdnY3R0dXlxb3lydmxtYm1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNzA1MTUsImV4cCI6MjEwMzk0NjUxNX0.SsiD1DU6Hhjb8jbNUCUSAARi6Qyn3TMFVmsjOsgJ8_8';
const SESS = 'merkaz.session';

let session = null;
try { session = JSON.parse(localStorage.getItem(SESS) || 'null'); } catch(e){}
export const currentUser = () => session?.user || null;
export const isSignedIn = () => !!session?.access_token;

function saveSession(s){ session = s; localStorage.setItem(SESS, JSON.stringify(s)); }
export function signOut(){ session = null; localStorage.removeItem(SESS); }

export async function signIn(email, password){
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method:'POST', headers:{ apikey:ANON, 'Content-Type':'application/json' },
    body: JSON.stringify({ email, password }) });
  const d = await r.json();
  if(!r.ok) throw new Error(d.error_description || d.msg || 'התחברות נכשלה');
  saveSession({ access_token:d.access_token, refresh_token:d.refresh_token, user:d.user });
  const me = await rest(`app_users?id=eq.${d.user.id}&select=*`);
  saveSession({ ...session, profile: me[0] || null });
  return session;
}
async function refresh(){
  if(!session?.refresh_token) throw new Error('NO_SESSION');
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
    method:'POST', headers:{ apikey:ANON, 'Content-Type':'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if(!r.ok){ signOut(); throw new Error('SESSION_EXPIRED'); }
  const d = await r.json();
  saveSession({ ...session, access_token:d.access_token, refresh_token:d.refresh_token });
}
export const me = () => session?.profile || null;
export const myId = () => session?.user?.id || null;

export async function rest(path, opts={}, retry=true){
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey:ANON, Authorization:`Bearer ${session?.access_token||ANON}`,
      'Content-Type':'application/json', Prefer: opts.prefer || 'return=representation',
      ...(opts.headers||{}) },
  });
  if(r.status === 401 && retry){ await refresh(); return rest(path, opts, false); }
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if(!r.ok) throw new Error(data?.message || data?.hint || 'שגיאת מסד נתונים');
  return data;
}
const get  = p => rest(p);
const post = (p,b) => rest(p, { method:'POST', body: JSON.stringify(b) });
const patch= (p,b) => rest(p, { method:'PATCH', body: JSON.stringify(b) });

// ---------------------------------------------------------------- log
async function log(entity, entity_id, action, before_val, after_val){
  try{ await post('activity_log', { entity, entity_id, action, user_id: myId(), before_val, after_val }); }
  catch(e){ /* logging must never block the business action */ }
}

// ---------------------------------------------------------------- reads
export const products   = () => get('products?select=*&order=name_he');
export const stock      = () => get('stock?select=*&order=name_he');
export const drivers    = () => get('drivers?select=*&active=eq.true&order=name');
export const allDrivers  = () => get('drivers?select=*&order=name');
export const customers  = (q='') => get(`customer_stats?select=*${q}&order=name`);
export const customer   = id => get(`customers?id=eq.${id}&select=*`).then(r=>r[0]);
export const customerStats = id => get(`customer_stats?customer_id=eq.${id}&select=*`).then(r=>r[0]);
export const movements  = (limit=200) =>
  get(`inventory_movements?select=*,products(name_he),orders(order_no)&order=created_at.desc&limit=${limit}`);
export const activity   = (limit=150) =>
  get(`activity_log?select=*,app_users(name)&order=created_at.desc&limit=${limit}`);

const ORDER_SEL = '*,customers(name,phone,address),drivers(name,phone,method),order_items(*,products(name_he,price))';
export const orders   = (filter='') => get(`orders?select=${ORDER_SEL}${filter}&order=created_at.desc`);
export const order    = id => get(`orders?id=eq.${id}&select=${ORDER_SEL}`).then(r=>r[0]);
export const openOrders = () => orders('&status=eq.open');
export const customerOrders = cid => orders(`&customer_id=eq.${cid}`);

export async function searchCustomers(term){
  const t = term.trim();
  if(!t) return [];
  const esc = t.replace(/[,()*]/g,' ');
  const q = `or=(name.ilike.*${esc}*,phone.ilike.*${esc}*,address.ilike.*${esc}*)`;
  return get(`customer_stats?select=*&${q}&limit=8`);
}
export const findByPhone = phone =>
  get(`customers?phone=eq.${encodeURIComponent(phone)}&select=*`).then(r=>r[0]||null);

// ---------------------------------------------------------------- customers
export async function upsertCustomer(c){
  if(c.id){
    const before = await customer(c.id);
    const r = await patch(`customers?id=eq.${c.id}`, { ...c, updated_at:new Date().toISOString() });
    await log('customer', c.id, 'update', before, r[0]);
    return r[0];
  }
  const r = await post('customers', c);
  await log('customer', r[0].id, 'create', null, r[0]);
  return r[0];
}

// ---------------------------------------------------------------- orders
export async function createDraft({ customer_id, items, address, instructions, notes, source, raw_input, attachment_url }){
  const total = items.reduce((a,i)=>a + i.qty*i.unit_price, 0);
  const o = (await post('orders', { customer_id, address, instructions, notes,
    source: source||'manual', raw_input: raw_input||null, attachment_url: attachment_url||null,
    total, status:'draft', created_by: myId(), updated_by: myId() }))[0];
  if(items.length) await post('order_items', items.map(i=>({ order_id:o.id, product_id:i.product_id, qty:i.qty, unit_price:i.unit_price })));
  await log('order', o.id, 'draft_created', null, { total, items: items.length });
  return o;
}

// Draft -> Open. Assigns the permanent number and reserves stock exactly once.
export async function openOrder(id){
  const o = await order(id);
  if(o.status !== 'draft') throw new Error('ההזמנה כבר אינה טיוטה');
  let no;
  try { no = await rest('rpc/next_order_no', { method:'POST', body:'{}' }); }
  catch(e){ no = await nextOrderNoFallback(); }
  if(typeof no !== 'number') no = await nextOrderNoFallback();
  const moves = o.order_items.map(it=>({ product_id: it.product_id, kind:'reserve',
    physical_delta:0, reserved_delta: it.qty, order_id:o.id, user_id: myId(), reason:'שריון בפתיחת הזמנה' }));
  if(moves.length) await post('inventory_movements', moves);
  const r = await patch(`orders?id=eq.${id}`, { status:'open', order_no: no,
    updated_by: myId(), updated_at:new Date().toISOString() });
  await log('order', id, 'opened', { status:'draft' }, { status:'open', order_no:no });
  return r[0];
}
async function nextOrderNoFallback(){
  const r = await get('orders?select=order_no&order=order_no.desc.nullslast&limit=1');
  return (r[0]?.order_no || 1000) + 1;
}

export async function deliverOrder(id, { final_amount, payment_status, payment_method, note }){
  const o = await order(id);
  if(o.status !== 'open') throw new Error('רק הזמנה פתוחה ניתן לסמן כנמסרה');
  const moves = o.order_items.map(it=>({ product_id: it.product_id, kind:'sale',
    physical_delta: -it.qty, reserved_delta: -it.qty, order_id:o.id, user_id: myId(), reason:'מסירה ללקוח' }));
  if(moves.length) await post('inventory_movements', moves);
  const r = await patch(`orders?id=eq.${id}`, { status:'delivered',
    final_amount: final_amount ?? o.total, payment_status, payment_method,
    delivered_at:new Date().toISOString(), notes: note ? ((o.notes||'')+'\n'+note).trim() : o.notes,
    updated_by: myId(), updated_at:new Date().toISOString() });
  await log('order', id, 'delivered', { status:'open' },
    { status:'delivered', final_amount: final_amount ?? o.total, payment_status, payment_method });
  return r[0];
}

export async function cancelOrder(id, reason){
  const o = await order(id);
  if(o.status === 'delivered') throw new Error('לא ניתן לבטל הזמנה שנמסרה');
  if(o.status === 'open' && o.order_items.length){
    const moves = o.order_items.map(it=>({ product_id: it.product_id, kind:'release',
      physical_delta:0, reserved_delta: -it.qty, order_id:o.id, user_id: myId(), reason:'ביטול הזמנה' }));
    await post('inventory_movements', moves);
  }
  const r = await patch(`orders?id=eq.${id}`, { status:'cancelled', cancelled_reason: reason||null,
    updated_by: myId(), updated_at:new Date().toISOString() });
  await log('order', id, 'cancelled', { status:o.status }, { status:'cancelled', reason });
  return r[0];
}

export async function setDriver(id, driver_id){
  const before = await order(id);
  const r = await patch(`orders?id=eq.${id}`, { driver_id, updated_by: myId(), updated_at:new Date().toISOString() });
  await log('order', id, 'driver_set', { driver_id: before.driver_id }, { driver_id });
  return r[0];
}
export async function updateOrderFields(id, fields){
  const before = await order(id);
  const r = await patch(`orders?id=eq.${id}`, { ...fields, updated_by: myId(), updated_at:new Date().toISOString() });
  await log('order', id, 'edit', before, r[0]);
  return r[0];
}
export async function setItems(orderId, items){
  await rest(`order_items?order_id=eq.${orderId}`, { method:'DELETE', prefer:'return=minimal' });
  if(items.length) await post('order_items', items.map(i=>({ order_id:orderId, product_id:i.product_id, qty:i.qty, unit_price:i.unit_price })));
  const total = items.reduce((a,i)=>a+i.qty*i.unit_price,0);
  await patch(`orders?id=eq.${orderId}`, { total, updated_by: myId() });
  return total;
}

// ---------------------------------------------------------------- inventory
export async function openingInventory(rows, reason='ספירת פתיחה'){
  const moves = rows.filter(r=>r.qty !== '' && r.qty != null).map(r=>({
    product_id: r.product_id, kind:'opening', physical_delta: Number(r.qty), reserved_delta:0,
    user_id: myId(), reason }));
  if(!moves.length) return 0;
  await post('inventory_movements', moves);
  await log('inventory', null, 'opening', null, { lines: moves.length });
  return moves.length;
}
export async function adjustStock(product_id, delta, reason){
  if(!reason) throw new Error('חובה לציין סיבה');
  await post('inventory_movements', { product_id, kind:'adjust',
    physical_delta: Number(delta), reserved_delta:0, user_id: myId(), reason });
  await log('inventory', product_id, 'adjust', null, { delta, reason });
}

// ---------------------------------------------------------------- settings
export async function saveDriver(d){
  if(d.id){ const r = await patch(`drivers?id=eq.${d.id}`, d); await log('driver', d.id,'update',null,r[0]); return r[0]; }
  const r = await post('drivers', d); await log('driver', r[0].id,'create',null,r[0]); return r[0];
}
export async function saveProduct(p){
  if(p.id){ const r = await patch(`products?id=eq.${p.id}`, p); await log('product', p.id,'update',null,r[0]); return r[0]; }
  const r = await post('products', p); await log('product', r[0].id,'create',null,r[0]); return r[0];
}
