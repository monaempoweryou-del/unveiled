// parse.js — deterministic Hebrew order reader. No AI key required.
// Finds catalog products, quantities, phone and address in free Hebrew text.
// Everything it returns is a proposal shown on the review screen before saving.

const HE_NUM = { 'אחד':1,'אחת':1,'שתיים':2,'שניים':2,'שתי':2,'שני':2,'שלוש':3,'שלושה':3,
  'ארבע':4,'ארבעה':4,'חמש':5,'חמישה':5,'שש':6,'שישה':6,'שבע':7,'שבעה':7,
  'שמונה':8,'תשע':9,'תשעה':9,'עשר':10,'עשרה':10,'עשרים':20,'שלושים':30 };

const stripPunct = s => s.replace(/[.,!?;:()\[\]"']/g,' ').replace(/\s+/g,' ').trim();

export function parseOrder(text, products, aliases = {}){
  const raw = String(text||'');
  const clean = stripPunct(raw);
  const words = clean.split(' ');
  const items = [], seen = new Set();
  const uncertain = [];

  // build a lookup of every recognised product word
  const lookup = new Map();
  products.forEach(p=>{
    lookup.set(p.name_he, p.id);
    (aliases[p.name_he]||[]).forEach(a=>lookup.set(a, p.id));
  });

  const deprefix = w => w.replace(/^ו[־\-]?/,'');
  const asQty = w => {
    if(!w) return null;
    const c = deprefix(w);
    if(/^\d+$/.test(c)) return +c;
    if(HE_NUM[c]) return HE_NUM[c];
    return null;
  };
  const qtyAt = i => {
    // nearest first, then one word further out, so "דוקטור דחוף 6" still reads 6
    for(const j of [i-1, i+1, i-2, i+2]){
      if(j < 0 || j >= words.length) continue;
      const q = asQty(words[j]);
      if(q != null) return { qty:q, used:j };
    }
    return { qty:1, used:-1, guessed:true };
  };

  words.forEach((w,i)=>{
    const key = deprefix(w);
    const pid = lookup.get(key) || lookup.get(w);
    if(!pid || seen.has(pid)) return;
    const { qty, guessed } = qtyAt(i);
    seen.add(pid);
    items.push({ product_id:pid, qty, guessed:!!guessed });
    if(guessed) uncertain.push(`כמות עבור ${key}`);
  });

  const phoneMatch = raw.match(/0\d{1,2}[-\s]?\d{7}|0\d{9}/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s/g,'') : null;
  if(!phone) uncertain.push('מספר טלפון');

  // address: a line containing a street-ish word plus a number, or an explicit label
  let address = null;
  const lines = raw.split(/\n|,/).map(s=>s.trim()).filter(Boolean);
  for(const l of lines){
    if(/כתובת\s*[:\-]/.test(l)){ address = l.replace(/.*כתובת\s*[:\-]\s*/,'').trim(); break; }
  }
  if(!address){
    const cand = lines.find(l=>/\d+/.test(l) && /[א-ת]{3,}/.test(l) && !lookup.has(stripPunct(l)) &&
      !/^\d+$/.test(stripPunct(l)) && l.length>6 && !phoneMatch?.[0]?.includes(l.trim()));
    if(cand && !/^\s*0\d/.test(cand)) address = cand;
  }
  if(!address) uncertain.push('כתובת');

  // customer name: after an explicit label, else the first short line with no digits
  let name = null;
  const nameLine = lines.find(l=>/^(שם|לקוח)\s*[:\-]/.test(l));
  if(nameLine) name = nameLine.replace(/^(שם|לקוח)\s*[:\-]\s*/,'').trim();
  if(!name){
    const c = lines.find(l=>!/\d/.test(l) && l.split(' ').length<=4 && l.length>=3 && !lookup.has(stripPunct(l)));
    if(c) name = c;
  }
  if(!name) uncertain.push('שם לקוח');

  let notes = null;
  const noteLine = lines.find(l=>/הערה|הערות|לצלצל|להתקשר|קומה|דירה|כניסה/.test(l));
  if(noteLine) notes = noteLine;

  return { items, phone, address, name, notes, uncertain, raw };
}
