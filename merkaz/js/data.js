// data.js — reference data, Hebrew label maps, fictional demo records.
// All customer/driver/address data here is invented for demonstration.

export const ACCESS_CODE = '2026';

export const PRODUCTS = [
  { id:'p_scissors', he:'מספרים', sku:'scissors', price: 42, opening: 93 },
  { id:'p_spider',   he:'עכביש',  sku:'spider',   price: 68, opening: 30 },
  { id:'p_height',   he:'גובה',   sku:'height',   price:120, opening: 17 },
  { id:'p_horse',    he:'סוס',    sku:'horse',    price: 95, opening: 20 },
  { id:'p_water',    he:'מים',    sku:'water',    price: 18, opening: 15 },
  { id:'p_dos',      he:'דוס',    sku:'dos',      price:150, opening:  7 },
  { id:'p_vor',      he:'ור',     sku:'vor',      price: 34, opening: 83 },
  { id:'p_koach',    he:'כח',     sku:'koach',    price: 76, opening: 29 },
];

// Parked. Not used in any calculation until the customer confirms its meaning.
export const LOW_GOODS_NOTE = [
  { as_written:'דוקטור (מספרים)', qty:50 }, { as_written:'גובה', qty:20 },
  { as_written:'סוס', qty:50 }, { as_written:'מים', qty:15 },
  { as_written:'דוס', qty:10 }, { as_written:'ור', qty:20 },
  { as_written:'כח', qty:30 },
];

export const USERS = [
  { id:'u_owner',   name:'רונן אלמוג',    role:'owner',         phone:'050-2214477', tg:'@ronen_a' },
  { id:'u_manager', name:'שירה בן דוד',   role:'store_manager',  phone:'052-8830145', tg:'@shira_bd' },
  { id:'u_staff',   name:'תמר גולן',      role:'staff',          phone:'054-6612093', tg:'@tamar_g' },
  { id:'u_staff2',  name:'אבי נחום',      role:'staff',          phone:'053-7742216', tg:'@avi_n' },
  { id:'u_d1',      name:'דוד לוי',       role:'driver',         phone:'052-4419087', tg:'@david_l', vehicle:'רכב 1' },
  { id:'u_d2',      name:'נועם כהן',      role:'driver',         phone:'054-9037251', tg:'@noam_c',  vehicle:'רכב 2' },
  { id:'u_d3',      name:'איתי מזרחי',    role:'driver',         phone:'058-3325640', tg:'@itay_m',  vehicle:'רכב 3' },
];

export const CUSTOMERS = [
  { id:'c1', name:'יעל שטרן',      phone:'052-3310984', address:'הרצל 12, תל אביב' },
  { id:'c2', name:'מוסך אלון בע"מ', phone:'03-6621450',  address:'המלאכה 7, חולון' },
  { id:'c3', name:'אורי בן שמעון', phone:'054-8812336', address:'ויצמן 44, רמת גן' },
  { id:'c4', name:'רותם פרץ',      phone:'050-9942178', address:'סוקולוב 3, הרצליה' },
  { id:'c5', name:'סטודיו נוגה',   phone:'077-4412890', address:'שדרות ירושלים 19, יפו' },
  { id:'c6', name:'חנן אליאס',     phone:'053-2276104', address:'בן גוריון 88, בני ברק' },
  { id:'c7', name:'מיכל ארז',      phone:'052-7719043', address:'אחד העם 21, פתח תקווה' },
  { id:'c8', name:'קפה בלוז',      phone:'09-7742130',  address:'הנשיא 5, כפר סבא' },
];

export const ROLE_HE = {
  owner:'בעלים', store_manager:'מנהל חנות', staff:'עובד', driver:'נהג',
};
export const ROLE_DESC = {
  owner:'גישה מלאה, כספים, ביקורת ואישורים',
  store_manager:'תפעול, שיבוץ נהגים, פערים והחזרות',
  staff:'טיוטות, אישור הזמנות ותקשורת עם לקוחות',
  driver:'המשלוחים והמלאי שלי בלבד',
};

export const STATUS_HE = {
  draft:'טיוטה', requires_review:'דורש בדיקה', confirmed:'מאושרת',
  awaiting_assignment:'ממתינה לשיבוץ', assigned:'משובצת',
  ready_for_pickup:'מוכנה לאיסוף', picked_up:'נאספה',
  out_for_delivery:'בדרך ללקוח', delivered:'נמסרה',
  partially_delivered:'נמסרה חלקית', payment_due:'ממתינה לתשלום',
  failed:'נכשלה', cancelled:'בוטלה', return_pending:'ממתינה להחזרה',
  returned:'הוחזרה', exception:'חריגה', closed:'סגורה',
};
export const STATUS_TONE = {
  draft:'muted', requires_review:'warn', confirmed:'brand',
  awaiting_assignment:'info', assigned:'info', ready_for_pickup:'info',
  picked_up:'violet', out_for_delivery:'violet', delivered:'ok',
  partially_delivered:'warn', payment_due:'warn', failed:'danger',
  cancelled:'muted', return_pending:'warn', returned:'muted',
  exception:'danger', closed:'muted',
};

export const PAY_HE = {
  unpaid:'לא שולם', partially_paid:'שולם חלקית', paid:'שולם',
  refunded:'הוחזר תשלום', partially_refunded:'הוחזר חלקית',
  disputed:'במחלוקת', written_off:'נמחק כחוב אבוד',
};
export const PAY_TONE = {
  unpaid:'danger', partially_paid:'warn', paid:'ok', refunded:'muted',
  partially_refunded:'muted', disputed:'danger', written_off:'muted',
};

export const MOVE_HE = {
  opening_balance:'מלאי פתיחה', supplier_restock:'קליטה מספק',
  warehouse_reservation:'שריון במחסן', reservation_release:'ביטול שריון',
  warehouse_to_driver:'העברה לנהג', driver_to_customer:'מסירה ללקוח',
  driver_to_warehouse:'החזרה למחסן', driver_to_driver:'העברה בין נהגים',
  damaged:'פגום', expired:'פג תוקף', missing:'חסר',
  manual_adjustment:'התאמה ידנית', reversal:'תיקון',
};

export const PAY_METHOD_HE = { cash:'מזומן', transfer:'העברה בנקאית', card:'אשראי', check:'צ׳ק' };

export const FAIL_REASONS = [
  'הלקוח לא נמצא בכתובת',
  'הלקוח ביקש לדחות למועד אחר',
  'כתובת שגויה',
  'הלקוח סירב לקבל את הסחורה',
  'לא ניתן היה להגיע לכתובת',
];

// Realistic Hebrew WhatsApp conversations for the intake simulator.
export const WA_SCRIPTS = [
  {
    customer:'c1',
    turns:[
      { dir:'in',  t:'היי, אפשר להזמין?' },
      { dir:'out', t:'בטח, מה תרצי?' },
      { dir:'in',  t:'4 מספרים ו־2 סוס' },
      { dir:'out', t:'מעולה. לאותה כתובת כמו פעם קודמת?' },
      { dir:'in',  t:'כן, הרצל 12 תל אביב. אפשר היום אחה״צ?' },
      { dir:'out', t:'כן, נשלח היום. תשלום מזומן במסירה?' },
      { dir:'in',  t:'כן מזומן. תודה!' },
    ],
    extract:{ lines:[['p_scissors',4],['p_horse',2]], payment:'cash', when:'היום אחר הצהריים', confidence:0.94, uncertain:[] },
  },
  {
    customer:'c3',
    turns:[
      { dir:'in',  t:'שלום, צריך 10 ור ו־3 כח בבקשה' },
      { dir:'out', t:'שלום אורי, רשמתי. הכתובת ויצמן 44 רמת גן?' },
      { dir:'in',  t:'כן. תשלחו מחר בבוקר' },
      { dir:'out', t:'בסדר גמור. איך תרצה לשלם?' },
      { dir:'in',  t:'העברה בנקאית אחרי הקבלה' },
    ],
    extract:{ lines:[['p_vor',10],['p_koach',3]], payment:'transfer', when:'מחר בבוקר', confidence:0.91, uncertain:[] },
  },
  {
    customer:'c6',
    turns:[
      { dir:'in',  t:'אחי צריך דוקטור דחוף' },
      { dir:'out', t:'כמה יחידות?' },
      { dir:'in',  t:'תביא 6' },
      { dir:'out', t:'לאיזו כתובת?' },
      { dir:'in',  t:'בן גוריון 88 בני ברק' },
    ],
    extract:{ lines:[['p_scissors',6]], payment:null, when:null, confidence:0.62,
      uncertain:['alias_ambiguous','payment_method','requested_time'], alias:true },
  },
  {
    customer:'c7',
    turns:[
      { dir:'in',  t:'היי רוצה להזמין 2 גובה' },
      { dir:'out', t:'שלום מיכל, אין בעיה. כתובת למשלוח?' },
      { dir:'in',  t:'אשלח אחר כך, קודם תשמרו לי' },
    ],
    extract:{ lines:[['p_height',2]], payment:null, when:null, confidence:0.71,
      uncertain:['delivery_address','payment_method'] },
  },
];

export const ICON = {
  dashboard:'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z',
  box:'M21 8l-9-5-9 5m18 0l-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  orders:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  truck:'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  chart:'M18 20V10M12 20V4M6 20v-6',
  money:'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  alert:'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  users:'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  plug:'M9 2v6M15 2v6M6 8h12v3a6 6 0 01-12 0V8zM12 17v5',
  history:'M3 3v5h5M3.05 13A9 9 0 106 5.3L3 8M12 7v5l4 2',
  back:'M9 18l6-6-6-6',
  check:'M20 6L9 17l-5-5',
  x:'M18 6L6 18M6 6l12 12',
  ret:'M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-1',
  wallet:'M20 12V8H6a2 2 0 010-4h12v4M4 6v12a2 2 0 002 2h14v-4M18 12a2 2 0 000 4h4v-4h-4z',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
};
