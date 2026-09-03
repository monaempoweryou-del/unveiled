// app.js — router, actions, and the interactive flows.
import * as A from './api.js';
import * as V from './views.js';
import { parseOrder } from './parse.js';
import { wireCharts } from './charts.js';
import { esc,n,ils,money,icon,pill,notice,toast,modal,closeModal,qtyField,wireQty,
         spinner,downloadCSV,PAY_METHOD_HE,dateOnly,when } from './ui.js';

const $ = s => document.querySelector(s);
const ALIASES = { 'מספרים':['דוקטור'] };   // confirmed alias, editable in a later pass

const NAV = [
  { to:'#/',          label:'לוח בקרה',  ic:'dash' },
  { to:'#/new',       label:'הזמנה חדשה', ic:'plus' },
  { to:'#/orders',    label:'הזמנות',     ic:'orders' },
  { to:'#/customers', label:'לקוחות',     ic:'users' },
  { to:'#/inventory', label:'מלאי',       ic:'box' },
  { to:'#/reports',   label:'דוחות',      ic:'chart' },
];

let state = { ordersFilter:'open', reportsPeriod:'today', repFrom:null, repTo:null,
              newMode:'text', draft:null };
window.__dailyDone = new Set();

function renderNav(){
  const cur = location.hash || '#/';
  const act = t => cur===t || (t!=='#/' && cur.startsWith(t));
  $('#sidebar').innerHTML = `<div class="nav-group">${NAV.map(i=>
    `<button class="nav-item ${act(i.to)?'active':''}" data-act="nav" data-to="${i.to}">${icon(i.ic,18)}<span>${esc(i.label)}</span></button>`).join('')}
    <button class="nav-item ${act('#/settings')?'active':''}" data-act="nav" data-to="#/settings">${icon('cog',18)}<span>הגדרות</span></button></div>`;
  $('#tabbar').innerHTML = NAV.slice(0,5).map(i=>
    `<button class="tab ${act(i.to)?'active':''}" data-act="nav" data-to="${i.to}">${icon(i.ic,20)}<span>${esc(i.label)}</span></button>`).join('');
}

async function route(){
  const h = location.hash || '#/';
  const [path, qs] = h.split('?');
  const seg = path.split('/');
  const q = new URLSearchParams(qs||'');
  const view = $('#view');
  view.innerHTML = spinner();
  renderNav();
  try{
    let html;
    switch(seg[1]){
      case '': case undefined: html = await V.dashboard(); break;
      case 'new':       html = V.newOrder(state.newMode); break;
      case 'orders':    if(q.get('f')) state.ordersFilter = q.get('f');
                        html = await V.ordersView(state.ordersFilter); break;
      case 'order':     html = await V.orderDetail(seg[2]); break;
      case 'daily':     html = await V.daily(); break;
      case 'customers': html = await V.customersView(); break;
      case 'customer':  html = await V.customerDetail(seg[2]); break;
      case 'inventory':
        html = seg[2]==='opening' ? await V.openingInventory()
             : seg[2]==='moves'   ? await V.movesView()
             : await V.inventory(); break;
      case 'reports':   html = await V.reports(state.reportsPeriod, state.repFrom, state.repTo); break;
      case 'settings':  html = await V.settings(); break;
      case 'activity':  html = await V.activityView(); break;
      default:          html = await V.dashboard();
    }
    view.innerHTML = html;
    window.scrollTo(0,0);
    afterRender(seg);
  }catch(e){
    view.innerHTML = notice('אירעה שגיאה בטעינת המסך: '+esc(e.message),'danger');
  }
  closeNav();
}

function afterRender(seg){
  if(seg[1]==='new' && state.newMode !== 'text') mountManualForm();
  if(seg[1]==='reports') wireCharts(document);
  if(seg[1]==='customers') wireCustomerSearch();
  const d = $('#drv');
  if(d) d.addEventListener('change', async ()=>{
    const id = location.hash.split('/')[2];
    await A.setDriver(id, d.value||null); toast('השליח עודכן','ok');
  });
}

// ---------------------------------------------------------------- new order
function mountManualForm(pre){
  const host = $('#manual-form'); if(!host) return;
  host.innerHTML = V.manualFormHtml(pre||state.draft||{});
  wireLines(); wireCustomerPicker(); recalc();
}
function wireLines(){
  document.querySelectorAll('.l-prod').forEach(sel=> sel.addEventListener('change', ()=>{
    // choosing a product fills in its catalog price, which stays editable
    const priceEl = sel.closest('.line').querySelector('.l-price');
    const listed = sel.selectedOptions[0]?.dataset.price;
    if(priceEl && listed != null && listed !== '') priceEl.value = listed;
    recalc();
  }));
  document.querySelectorAll('.l-qty,.l-price').forEach(el=>{
    el.addEventListener('change', recalc); el.addEventListener('input', recalc);
  });
}
function recalc(){
  const t = collectItems().reduce((a,i)=>a+i.qty*i.unit_price,0);
  const el = $('#tot'); if(el) el.innerHTML = `<span>סה״כ</span><b>${money(t)}</b>`;
}
function collectItems(){
  return [...document.querySelectorAll('.line')].map(l=>{
    const pid = l.querySelector('.l-prod').value;
    const qty = +l.querySelector('.l-qty').value||0;
    if(!pid || qty<=0) return null;
    const priceEl = l.querySelector('.l-price');
    const typed = priceEl && priceEl.value !== '' ? +priceEl.value : null;
    const listed = +(V.cache.products.find(x=>x.id===pid)?.price || 0);
    // the agreed price wins; the catalog price is only the starting suggestion
    return { product_id:pid, qty, unit_price: typed != null && typed >= 0 ? typed : listed };
  }).filter(Boolean);
}
function wireCustomerPicker(){
  const q = $('#cust-q'), hits = $('#cust-hits');
  if(!q) return;
  let t;
  q.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(async ()=>{
      const term = q.value.trim();
      if(term.length < 1){ hits.innerHTML=''; return; }
      const res = await A.searchCustomers(term);
      hits.innerHTML = res.length ? res.map(c=>`<button class="hit" data-act="pick-cust" data-id="${c.customer_id}"
        data-name="${esc(c.name)}" data-phone="${esc(c.phone||'')}" data-addr="${esc(c.address||'')}">
        <b>${esc(c.name)}</b><span>${esc(c.phone||'')} · ${esc(c.address||'')} · ${c.last_order_at?dateOnly(c.last_order_at):'לקוח חדש'}</span></button>`).join('')
        : `<div class="hit-none">לא נמצא לקוח קיים. ייווצר לקוח חדש.</div>`;
    }, 140);
  });
}
function wireCustomerSearch(){
  const q = $('#cust-search'), out = $('#search-results'), list = $('#cust-list');
  if(!q) return;
  let t;
  q.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(async ()=>{
      const term = q.value.trim();
      if(!term){ out.innerHTML=''; if(list) list.style.display=''; return; }
      if(/^#?\d{3,}$/.test(term)){
        const no = term.replace('#','');
        const os = await A.orders(`&order_no=eq.${no}`);
        out.innerHTML = os.length ? `<div class="card"><ul class="list">${os.map(V.orderRow).join('')}</ul></div>`
          : `<div class="card">${notice('לא נמצאה הזמנה במספר הזה','warn')}</div>`;
      } else {
        const res = await A.searchCustomers(term);
        out.innerHTML = res.length ? `<div class="card"><ul class="list">${res.map(V.customerRow).join('')}</ul></div>`
          : `<div class="card">${notice('לא נמצאו תוצאות','warn')}</div>`;
      }
      if(list) list.style.display='none';
    }, 140);
  });
}

async function reviewAndOpen(){
  const items = collectItems();
  if(!items.length) return toast('הוסיפו לפחות פריט אחד','err');
  const name = $('#cust-q')?.value.trim();
  if(!name) return toast('בחרו או הזינו שם לקוח','err');
  const phone = $('#f-phone')?.value.trim() || null;
  const address = $('#f-addr')?.value.trim() || null;
  const notesV = $('#f-notes')?.value.trim() || null;
  const pm = $('#f-pm')?.value || null;
  const custId = $('#cust-id')?.value || null;
  const total = items.reduce((a,i)=>a+i.qty*i.unit_price,0);
  const missing = [];
  if(!phone) missing.push('טלפון');
  if(!address) missing.push('כתובת');

  modal({ title:'בדיקה לפני פתיחה',
    body:`${missing.length?notice('<b>חסר מידע:</b> '+esc(missing.join(' · '))+'. אפשר לפתוח בכל זאת ולהשלים אחר כך.','warn'):''}
      <div style="margin-block:${missing.length?'14px':'0'} 12px">
        <div class="rev"><span>לקוח</span><b>${esc(name)}</b></div>
        <div class="rev"><span>טלפון</span><b>${esc(phone||'—')}</b></div>
        <div class="rev"><span>כתובת</span><b>${esc(address||'—')}</b></div>
        ${notesV?`<div class="rev"><span>הערות</span><b>${esc(notesV)}</b></div>`:''}
        ${pm?`<div class="rev"><span>אמצעי תשלום צפוי</span><b>${esc(PAY_METHOD_HE[pm]||pm)}</b></div>`:''}
      </div>
      <div style="border-block-start:1px solid var(--line-2);padding-block-start:10px">
      ${items.map(i=>`<div class="rev"><span>${esc(V.cache.products.find(p=>p.id===i.product_id)?.name_he)} × ${i.qty}</span><b>${money(i.qty*i.unit_price)}</b></div>`).join('')}
      <div class="rev tot-row"><span>סה״כ</span><b>${money(total)}</b></div></div>`,
    foot:`<button class="btn btn-primary" id="go">פתיחת הזמנה</button>
          <button class="btn btn-ghost" data-close="1">חזרה לעריכה</button>`,
    onMount:r=> r.querySelector('#go').addEventListener('click', async ()=>{
      const btn = r.querySelector('#go'); btn.disabled = true; btn.textContent = 'שומר…';
      try{
        let cid = custId;
        if(!cid){
          if(phone){ const ex = await A.findByPhone(phone); if(ex) cid = ex.id; }
          if(!cid) cid = (await A.upsertCustomer({ name, phone, address })).id;
        }
        const d = await A.createDraft({ customer_id:cid, items, address, notes:notesV, payment_method: pm,
          source: state.newMode==='manual'?'manual':state.newMode, raw_input: state.draft?.raw || null });
        const o = await A.openOrder(d.id);
        closeModal(); state.draft=null;
        toast('הזמנה #'+o.order_no+' נפתחה','ok');
        location.hash = '#/order/'+o.id;
      }catch(e){ btn.disabled=false; btn.textContent='פתיחת הזמנה'; toast(e.message,'err'); }
    })});
}

// ---------------------------------------------------------------- quick update
async function quickUpdate(id){
  const o = await A.order(id);
  const amt = +(o.final_amount ?? o.total ?? 0);
  modal({ title:`עדכון מהיר · #${o.order_no}`,
    body:`<div style="color:var(--muted);font-size:13.5px;margin-block-end:12px">${esc(o.customers?.name||'')} · ${esc(V.itemsText(o))}</div>
      <div class="seg-big" id="oc">
        <button class="ocb active" data-oc="delivered">נמסרה</button>
        <button class="ocb" data-oc="cancelled">בוטלה</button>
      </div>
      <div id="deliv-fields">
        <div class="field"><label>סכום סופי</label><input id="q-amt" type="number" inputmode="decimal" value="${Math.round(amt)}"></div>
        <div class="field"><label>תשלום</label>
          <div class="seg-big" id="pay">
            <button class="pb active" data-pay="paid">שולם</button>
            <button class="pb" data-pay="unpaid">לא שולם</button>
          </div></div>
        <div class="field" id="pm-wrap"><label>אמצעי תשלום שהוזן</label>
          <div class="seg-big" id="pm">${Object.entries(PAY_METHOD_HE).map(([k,v],i)=>
            `<button class="mb ${(o.payment_method ? k===o.payment_method : i===0)?'active':''}" data-pm="${k}">${esc(v)}</button>`).join('')}</div>
          <div class="hint">נרשם לפי דיווחכם בלבד. המערכת אינה מתחברת לבנק, לביט או לארנק ואינה מאמתת קבלת תשלום.</div>
        </div>
      </div>
      <div class="field" id="cancel-reason" style="display:none"><label>סיבת הביטול</label>
        <input id="q-reason" type="text" placeholder="לא חובה"></div>
      <div class="field"><label>הערה</label><input id="q-note" type="text" placeholder="לא חובה"></div>`,
    foot:`<button class="btn btn-primary" id="save">שמירה</button>
          <button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>{
      let outcome='delivered', pay='paid', method = o.payment_method || 'cash';
      r.querySelectorAll('.ocb').forEach(b=>b.addEventListener('click',()=>{
        r.querySelectorAll('.ocb').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        outcome=b.dataset.oc;
        r.querySelector('#deliv-fields').style.display = outcome==='delivered'?'':'none';
        r.querySelector('#cancel-reason').style.display = outcome==='cancelled'?'':'none';
      }));
      r.querySelectorAll('.pb').forEach(b=>b.addEventListener('click',()=>{
        r.querySelectorAll('.pb').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        pay=b.dataset.pay; r.querySelector('#pm-wrap').style.display = pay==='paid'?'':'none';
      }));
      r.querySelectorAll('.mb').forEach(b=>b.addEventListener('click',()=>{
        r.querySelectorAll('.mb').forEach(x=>x.classList.remove('active')); b.classList.add('active'); method=b.dataset.pm;
      }));
      r.querySelector('#save').addEventListener('click', async ()=>{
        const btn=r.querySelector('#save'); btn.disabled=true; btn.textContent='שומר…';
        try{
          if(outcome==='cancelled'){ await A.cancelOrder(id, r.querySelector('#q-reason').value.trim()); }
          else {
            await A.deliverOrder(id, { final_amount:+r.querySelector('#q-amt').value||0,
              payment_status:pay, payment_method: pay==='paid'?method:null,
              note: r.querySelector('#q-note').value.trim()||null });
          }
          window.__dailyDone.add(id);
          closeModal(); toast(outcome==='cancelled'?'ההזמנה בוטלה':'ההזמנה עודכנה','ok');
          route();
        }catch(e){ btn.disabled=false; btn.textContent='שמירה'; toast(e.message,'err'); }
      });
    }});
}

// ---------------------------------------------------------------- actions
const H = {
  nav: el => { location.hash = el.dataset.to; },
  'filter-orders': el => { state.ordersFilter = el.dataset.v; route(); },
  'filter-reports': el => {
    state.reportsPeriod = el.dataset.v;
    if(el.dataset.v === 'custom' && !state.repFrom){
      const d = new Date(); d.setDate(d.getDate()-6);
      state.repFrom = d.toISOString().slice(0,10);
      state.repTo = new Date().toISOString().slice(0,10);
    }
    route();
  },
  'apply-range': () => {
    state.repFrom = $('#rf')?.value || state.repFrom;
    state.repTo   = $('#rt')?.value || state.repTo;
    state.reportsPeriod = 'custom';
    route();
  },
  'new-mode': el => { state.newMode = el.dataset.v; state.draft=null; route(); },
  'add-line': () => { const box=$('#lines'); const i=box.children.length;
    box.insertAdjacentHTML('beforeend', V.lineHtml({},i)); wireLines(); },
  'del-line': el => { const l=el.closest('.line'); if($('#lines').children.length>1) l.remove(); else {
      l.querySelector('.l-prod').value=''; l.querySelector('.l-qty').value=1; } recalc(); },
  'pick-cust': el => {
    $('#cust-id').value = el.dataset.id;
    $('#cust-q').value = el.dataset.name;
    if(!$('#f-phone').value) $('#f-phone').value = el.dataset.phone;
    if(!$('#f-addr').value)  $('#f-addr').value  = el.dataset.addr;
    $('#cust-hits').innerHTML='';
    $('#cust-chosen').innerHTML = `לקוח קיים נמצא: <b>${esc(el.dataset.name)}</b>`;
  },
  review: () => reviewAndOpen(),
  quick: el => quickUpdate(el.dataset.id),
  'open-order': async el => { try{ const o = await A.openOrder(el.dataset.id);
      toast('הזמנה #'+o.order_no+' נפתחה','ok'); route(); }catch(e){ toast(e.message,'err'); } },
  'cancel-order': el => askCancel(el.dataset.id),
  'edit-order': el => toast('לעריכה מלאה: בטלו ופתחו מחדש. עריכת פריטים תתווסף בשלב הבא.',''),
  signout: () => { A.signOut(); location.reload(); },

  'parse-text': () => {
    const raw = $('#raw').value.trim();
    if(!raw) return toast('הדביקו טקסט של הזמנה','err');
    const r = parseOrder(raw, V.cache.products, ALIASES);
    state.draft = { ...r, customer_id:null, items:r.items, raw };
    $('#raw').closest('.card-body').innerHTML =
      (r.uncertain.length?notice('<b>לא זוהה בוודאות:</b> '+esc(r.uncertain.join(' · '))+'. השלימו למטה.','warn'):
        notice('כל הפרטים זוהו. בדקו ואשרו.','brand','check'))
      + `<pre class="raw" style="margin-block:12px">${esc(raw)}</pre><div id="manual-form"></div>`;
    mountManualForm(state.draft);
    if(state.draft.phone) $('#f-phone').value = state.draft.phone;
    if(state.draft.address) $('#f-addr').value = state.draft.address;
    if(state.draft.notes) $('#f-notes').value = state.draft.notes;
  },

  'share-driver': async el => {
    const o = await A.order(el.dataset.id);
    if(!o.driver_id) return toast('בחרו שליח תחילה','err');
    const msg = V.driverMessage(o);
    const d = V.cache.drivers.find(x=>x.id===o.driver_id);
    try{
      if(navigator.share){ await navigator.share({ text: msg }); }
      else { await navigator.clipboard.writeText(msg);
        toast('ההודעה הועתקה. הדביקו אצל '+(d?.name||'השליח'),'ok'); }
    }catch(e){ /* user dismissed the share sheet */ }
  },
  'copy-msg': async el => {
    const o = await A.order(el.dataset.id);
    await navigator.clipboard.writeText(V.driverMessage(o)); toast('ההודעה הועתקה','ok');
  },
  'nav-map': async el => {
    const o = await A.order(el.dataset.id);
    const a = o.address || o.customers?.address;
    if(!a) return toast('אין כתובת להזמנה','err');
    window.open('https://waze.com/ul?q='+encodeURIComponent(a), '_blank');
  },
  'call-cust': async el => {
    const o = await A.order(el.dataset.id);
    const p = o.customers?.phone;
    if(!p) return toast('אין טלפון ללקוח','err');
    location.href = 'tel:'+p.replace(/[^\d+]/g,'');
  },

  'save-opening': async () => {
    const rows = [...document.querySelectorAll('.op-qty')].map(i=>({ product_id:i.dataset.pid, qty:i.value.trim() }));
    const filled = rows.filter(r=>r.qty!=='');
    if(!filled.length) return toast('הזינו לפחות כמות אחת','err');
    try{ await A.openingInventory(filled); toast(filled.length+' שורות נשמרו','ok'); location.hash='#/inventory'; }
    catch(e){ toast(e.message,'err'); }
  },
  adjust: el => askAdjust(el.dataset.id),
  'new-customer': () => editCustomer(null),
  'edit-customer': el => editCustomer(el.dataset.id),
  'new-driver': () => editDriver(null),
  'edit-driver': el => editDriver(el.dataset.id),
  'new-product': () => editProduct(null),
  'edit-product': el => editProduct(el.dataset.id),

  'csv-orders': () => {
    const rows = [['מספר','תאריך','לקוח','טלפון','כתובת','סטטוס','תשלום','אמצעי','סכום','פריטים']];
    (window.__rep?.all||[]).forEach(o=>rows.push([o.order_no||'', (o.delivered_at||o.created_at||'').slice(0,10),
      o.customers?.name||'', o.customers?.phone||'', o.address||'', ({draft:'טיוטה',open:'פתוחה',delivered:'נמסרה',cancelled:'בוטלה'})[o.status],
      o.status==='delivered'?(o.payment_status==='paid'?'שולם':'לא שולם'):'', PAY_METHOD_HE[o.payment_method]||'',
      (o.final_amount??o.total??0), V.itemsText(o)]));
    downloadCSV('merkaz-orders.csv', rows);
  },
  'csv-products': () => {
    const rows=[['מוצר','יחידות','הכנסה']];
    Object.entries(window.__rep?.byProduct||{}).forEach(([k,v])=>rows.push([k,v.qty,v.rev]));
    downloadCSV('merkaz-sales-by-product.csv', rows);
  },
  'csv-customers': async () => {
    const cs = await A.customers();
    const rows=[['לקוח','טלפון','כתובת','הזמנות','סך מכירות','חוב פתוח','הזמנה אחרונה']];
    cs.forEach(c=>rows.push([c.name,c.phone||'',c.address||'',c.completed_orders||0,c.total_sales||0,c.unpaid_balance||0,(c.last_order_at||'').slice(0,10)]));
    downloadCSV('merkaz-customers.csv', rows);
  },
  'csv-stock': async () => {
    const st = await A.stock();
    const rows=[['מוצר','פיזי','משוריין','זמין','נמכר']];
    st.forEach(s=>rows.push([s.name_he,s.physical,s.reserved,s.available,s.sold]));
    downloadCSV('merkaz-stock.csv', rows);
  },
  'csv-moves': async () => {
    const ms = await A.movements(1000);
    const rows=[['תאריך','תנועה','מוצר','פיזי','משוריין','הזמנה','סיבה']];
    ms.forEach(m=>rows.push([m.created_at, m.kind, m.products?.name_he||'', m.physical_delta, m.reserved_delta,
      m.orders?.order_no||'', m.reason||'']));
    downloadCSV('merkaz-inventory-movements.csv', rows);
  },
};

function askCancel(id){
  modal({ title:'ביטול הזמנה',
    body:`<div class="field"><label>סיבה</label><input id="r" type="text" placeholder="לא חובה"></div>
      ${notice('אם ההזמנה פתוחה, השריון ישוחרר והמלאי יחזור להיות זמין. ההזמנה נשמרת בהיסטוריה.','info')}`,
    foot:`<button class="btn btn-danger" id="go">ביטול ההזמנה</button><button class="btn btn-ghost" data-close="1">חזרה</button>`,
    onMount:r=>r.querySelector('#go').addEventListener('click',async()=>{
      try{ await A.cancelOrder(id, r.querySelector('#r').value.trim()); closeModal(); toast('ההזמנה בוטלה','ok'); route(); }
      catch(e){ toast(e.message,'err'); } })});
}
function askAdjust(pid){
  const s = V.cache.stock.find(x=>x.product_id===pid) || {};
  modal({ title:'תיקון מלאי · '+(s.name_he||''),
    body:`${notice('תיקון נרשם כתנועה חדשה עם שמכם והסיבה. הרישום הקודם נשמר.','warn')}
      <div class="field" style="margin-block-start:14px"><label>כמות פיזית נוכחית</label>
        <div style="font-size:22px;font-weight:700">${s.physical ?? 0}</div></div>
      <div class="field"><label>שינוי (מספר חיובי מוסיף, שלילי מפחית)</label>
        <input id="delta" type="number" placeholder="לדוגמה: -3"></div>
      <div class="field"><label>סיבה (חובה)</label><input id="why" type="text" placeholder="ספירה מחדש, פגום, חסר…"></div>`,
    foot:`<button class="btn btn-primary" id="go">רישום התיקון</button><button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>r.querySelector('#go').addEventListener('click',async()=>{
      const d=+r.querySelector('#delta').value||0, w=r.querySelector('#why').value.trim();
      if(!d) return toast('הזינו שינוי','err');
      if(!w) return toast('חובה לציין סיבה','err');
      try{ await A.adjustStock(pid,d,w); closeModal(); toast('התיקון נרשם','ok'); route(); }
      catch(e){ toast(e.message,'err'); } })});
}
async function editCustomer(id){
  const c = id ? await A.customer(id) : {};
  modal({ title: id?'עריכת לקוח':'לקוח חדש',
    body:['name:שם','phone:טלפון','phone_alt:טלפון נוסף','address:כתובת','instructions:הוראות מסירה','notes:הערות']
      .map(f=>{const [k,l]=f.split(':');return `<div class="field"><label>${l}</label><input id="c-${k}" type="text" value="${esc(c[k]||'')}"></div>`;}).join(''),
    foot:`<button class="btn btn-primary" id="go">שמירה</button><button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>r.querySelector('#go').addEventListener('click',async()=>{
      const v = k => r.querySelector('#c-'+k).value.trim()||null;
      if(!v('name')) return toast('שם חובה','err');
      try{ await A.upsertCustomer({ ...(id?{id}:{}) , name:v('name'), phone:v('phone'), phone_alt:v('phone_alt'),
        address:v('address'), instructions:v('instructions'), notes:v('notes') });
        closeModal(); toast('נשמר','ok'); route(); }catch(e){ toast(e.message,'err'); } })});
}
async function editDriver(id){
  const d = id ? (await A.allDrivers()).find(x=>x.id===id) : { method:'whatsapp', active:true };
  modal({ title: id?'עריכת שליח':'שליח חדש',
    body:`<div class="field"><label>שם</label><input id="d-name" type="text" value="${esc(d.name||'')}"></div>
      <div class="field"><label>טלפון</label><input id="d-phone" type="tel" value="${esc(d.phone||'')}"></div>
      <div class="field"><label>אמצעי מועדף</label><select id="d-m">
        ${[['whatsapp','וואטסאפ'],['telegram','טלגרם'],['sms','SMS']].map(([k,l])=>`<option value="${k}" ${d.method===k?'selected':''}>${l}</option>`).join('')}
      </select></div>
      <label style="display:flex;gap:9px;align-items:center;font-size:14.5px"><input id="d-act" type="checkbox" ${d.active!==false?'checked':''} style="width:19px;height:19px"> פעיל</label>`,
    foot:`<button class="btn btn-primary" id="go">שמירה</button><button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>r.querySelector('#go').addEventListener('click',async()=>{
      const name=r.querySelector('#d-name').value.trim(), phone=r.querySelector('#d-phone').value.trim();
      if(!name||!phone) return toast('שם וטלפון חובה','err');
      try{ await A.saveDriver({ ...(id?{id}:{}) , name, phone, method:r.querySelector('#d-m').value, active:r.querySelector('#d-act').checked });
        closeModal(); toast('נשמר','ok'); route(); }catch(e){ toast(e.message,'err'); } })});
}
async function editProduct(id){
  const p = id ? V.cache.products.find(x=>x.id===id) : {};
  modal({ title: id?'עריכת מוצר':'מוצר חדש',
    body:`<div class="field"><label>שם</label><input id="p-name" type="text" value="${esc(p.name_he||'')}"></div>
      <div class="field"><label>מחיר ליחידה</label><input id="p-price" type="number" value="${p.price||0}"></div>
      <div class="field"><label>סף התראת מלאי נמוך</label><input id="p-th" type="number" value="${p.low_stock_threshold??''}" placeholder="לא הוגדר"></div>`,
    foot:`<button class="btn btn-primary" id="go">שמירה</button><button class="btn btn-ghost" data-close="1">ביטול</button>`,
    onMount:r=>r.querySelector('#go').addEventListener('click',async()=>{
      const name=r.querySelector('#p-name').value.trim();
      if(!name) return toast('שם חובה','err');
      const th=r.querySelector('#p-th').value.trim();
      try{ await A.saveProduct({ ...(id?{id}:{}) , name_he:name, price:+r.querySelector('#p-price').value||0,
        low_stock_threshold: th===''?null:+th });
        await V.warm(); closeModal(); toast('נשמר','ok'); route(); }catch(e){ toast(e.message,'err'); } })});
}

document.addEventListener('click', e=>{
  const el = e.target.closest('[data-act]'); if(!el) return;
  const fn = H[el.dataset.act]; if(!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el)).catch(err=>toast(err.message||'הפעולה נכשלה','err'));
});

const openNav = ()=>{ $('#sidebar').classList.add('open'); $('#scrim').hidden=false; };
const closeNav= ()=>{ $('#sidebar').classList.remove('open'); $('#scrim').hidden=true; };
$('#menu-btn').addEventListener('click', ()=> $('#sidebar').classList.contains('open')?closeNav():openNav());
$('#scrim').addEventListener('click', closeNav);
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(); closeNav(); } });
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------- boot
async function start(){
  $('#login').hidden = true; $('#app').hidden = false;
  const u = A.me();
  $('#who').textContent = u ? `${u.name} · ${u.role==='owner'?'בעלים':'מוקד'}` : '';
  await V.warm();
  route();
}
let loginRole = 'owner';
document.querySelectorAll('#role-pick .rb').forEach(b=> b.addEventListener('click', ()=>{
  document.querySelectorAll('#role-pick .rb').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); loginRole = b.dataset.role;
}));
$('#login-btn').addEventListener('click', async ()=>{
  const b=$('#login-btn'); const err=$('#login-err');
  err.hidden=true; b.disabled=true; b.textContent='מתחבר…';
  try{ await A.signInWithCode($('#pw').value, loginRole); await start(); }
  catch(e){ err.textContent=e.message; err.hidden=false; b.disabled=false; b.textContent='כניסה';
    $('#pw').value=''; $('#pw').focus(); }
});
$('#pw').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#login-btn').click(); });
if(A.isSignedIn()) start().catch(()=>{ A.signOut(); $('#login').hidden=false; $('#app').hidden=true; });
