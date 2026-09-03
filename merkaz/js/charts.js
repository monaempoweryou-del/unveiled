// charts.js — inline SVG charts. No library, no CDN, no subscription.
// Every chart scales to its container via viewBox, so nothing scrolls sideways on a phone.
import { esc, money, n } from './ui.js';

// Categorical hues for payment methods, fixed order, never cycled.
// Validated for colour-vision deficiency; every segment is also directly labelled,
// so identity never depends on colour alone.
export const PAY_COLORS = {
  cash:'#067A4E', bit:'#1D4ED8', paybox:'#C2410C', card:'#7C3AED', crypto:'#0D9488',
  unpaid:'#B3261E', other:'#4338CA',
};
// Ring order for the donut. Chosen so no two neighbours (including the wrap from
// the last slice back to the first) fall in the colour-blind confusion band.
export const PAY_RING = ['cash','bit','paybox','card','crypto','unpaid','other'];
const INK='#0B1220', MUTED='#64748B', GRID='#E3E8EF', BRAND='#0E5F66';

const fmtShort = v => v>=1000 ? (v/1000).toFixed(v>=10000?0:1).replace('.0','')+'K' : String(Math.round(v));

/* ---------- 1. income over time: vertical bars ---------- */
export function incomeBars(rows, { height=170 }={}){
  if(!rows.length) return emptyChart('אין הכנסה בתקופה שנבחרה');
  const W=340, H=height, padB=26, padT=14, padS=6;
  const max = Math.max(1, ...rows.map(r=>r.value));
  const n_ = rows.length;
  const slot = (W - padS*2) / n_;
  const bw = Math.max(6, Math.min(38, slot*0.62));
  const bars = rows.map((r,i)=>{
    const h = Math.max(r.value>0?3:0, (r.value/max)*(H-padB-padT));
    const x = padS + slot*i + (slot-bw)/2;
    const y = H-padB-h;
    return `<g class="ch-hit" data-label="${esc(r.label)}" data-value="${r.value}" tabindex="0" role="listitem"
        aria-label="${esc(r.label)}: ${money(r.value)}">
      <rect x="${x-2}" y="${padT}" width="${bw+4}" height="${H-padB-padT}" fill="transparent"></rect>
      <rect class="ch-bar" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${BRAND}"></rect>
    </g>`;
  }).join('');
  // label only the ends and the peak, never every bar
  const peak = rows.reduce((m,r,i)=> r.value>rows[m].value?i:m, 0);
  const keep = new Set([0, n_-1, peak]);
  const ticks = rows.map((r,i)=> keep.has(i)
    ? `<text x="${padS+slot*i+slot/2}" y="${H-8}" text-anchor="middle" font-size="10.5" fill="${MUTED}">${esc(r.short)}</text>` : '').join('');
  return `<div class="ch">
    <div class="ch-read" data-read>סה״כ ${money(rows.reduce((a,r)=>a+r.value,0))}</div>
    <svg viewBox="0 0 ${W} ${H}" role="list" aria-label="הכנסה מדווחת לפי יום" preserveAspectRatio="none">
      <line x1="${padS}" y1="${H-padB}" x2="${W-padS}" y2="${H-padB}" stroke="${GRID}" stroke-width="1"></line>
      ${bars}${ticks}
    </svg></div>`;
}

/* ---------- 2. payment method: donut ---------- */
export function donut(slices, { size=190 }={}){
  const total = slices.reduce((a,s)=>a+s.value,0);
  if(!total) return emptyChart('אין תשלומים מדווחים בתקופה שנבחרה');
  const R=size/2, r=R*0.60, cx=R, cy=R;
  let ang = -Math.PI/2;
  const arcs = slices.filter(s=>s.value>0).map(s=>{
    const frac = s.value/total;
    const a0 = ang, a1 = ang + frac*Math.PI*2;
    ang = a1;
    // a 2px surface gap between segments
    const gap = total>1 ? 0.014 : 0;
    const b0 = a0+gap, b1 = Math.max(b0+0.001, a1-gap);
    const large = (b1-b0) > Math.PI ? 1 : 0;
    const p = (rad,a)=>`${(cx+rad*Math.cos(a)).toFixed(2)} ${(cy+rad*Math.sin(a)).toFixed(2)}`;
    const d = `M ${p(R,b0)} A ${R} ${R} 0 ${large} 1 ${p(R,b1)} L ${p(r,b1)} A ${r} ${r} 0 ${large} 0 ${p(r,b0)} Z`;
    return `<path class="ch-hit ch-seg" d="${d}" fill="${s.color}" tabindex="0" role="listitem"
      data-label="${esc(s.label)}" data-value="${s.value}" data-pct="${Math.round(frac*100)}"
      aria-label="${esc(s.label)}: ${money(s.value)}, ${Math.round(frac*100)} אחוז"></path>`;
  }).join('');
  const legend = slices.filter(s=>s.value>0).map(s=>`
    <div class="ch-leg-row ch-hit" data-label="${esc(s.label)}" data-value="${s.value}"
         data-pct="${Math.round(s.value/total*100)}" tabindex="0">
      <i style="background:${s.color}"></i>
      <span class="ch-leg-name">${esc(s.label)}</span>
      <b class="ch-leg-val">${money(s.value)}</b>
      <span class="ch-leg-pct">${Math.round(s.value/total*100)}%</span>
    </div>`).join('');
  return `<div class="ch">
    <div class="ch-read" data-read>סה״כ מדווח ${money(total)}</div>
    <div class="ch-donut-wrap">
      <svg viewBox="0 0 ${size} ${size}" role="list" aria-label="פילוח לפי אמצעי תשלום שהוזן">
        ${arcs}
        <text x="${cx}" y="${cy-3}" text-anchor="middle" font-size="15" font-weight="700" fill="${INK}">${fmtShort(total)}</text>
        <text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="9.5" fill="${MUTED}">₪ מדווח</text>
      </svg>
    </div>
    <div class="ch-legend">${legend}</div></div>`;
}

/* ---------- 3. products sold: horizontal bars ---------- */
export function hBars(rows, { unit='יח׳' }={}){
  if(!rows.length) return emptyChart('לא נמכרו מוצרים בתקופה שנבחרה');
  const max = Math.max(1, ...rows.map(r=>r.value));
  return `<div class="ch"><div class="hb">${rows.map(r=>`
    <div class="hb-row ch-hit" data-label="${esc(r.label)}" data-value="${r.value}" data-unit="${esc(unit)}" tabindex="0">
      <div class="hb-top"><span>${esc(r.label)}</span><b>${n(r.value)} ${esc(unit)}</b></div>
      <div class="hb-track"><i style="width:${Math.max(2,(r.value/max)*100)}%;background:${r.color||BRAND}"></i></div>
      ${r.sub?`<div class="hb-sub">${esc(r.sub)}</div>`:''}
    </div>`).join('')}</div></div>`;
}

export const emptyChart = msg => `<div class="ch-empty">${esc(msg)}</div>`;

/* ---------- tap / focus to reveal the exact value ---------- */
export function wireCharts(scope=document){
  scope.querySelectorAll('.ch').forEach(ch=>{
    const read = ch.querySelector('[data-read]');
    if(!read) return;
    const base = read.textContent;
    const show = el => {
      const l = el.dataset.label, v = +el.dataset.value;
      const pct = el.dataset.pct, unit = el.dataset.unit;
      read.textContent = unit ? `${l}: ${v} ${unit}` : `${l}: ${money(v)}${pct?` · ${pct}%`:''}`;
      ch.querySelectorAll('.ch-hit').forEach(x=>x.classList.remove('on'));
      el.classList.add('on');
    };
    ch.querySelectorAll('.ch-hit').forEach(el=>{
      el.addEventListener('click', ()=>show(el));
      el.addEventListener('focus', ()=>show(el));
      el.addEventListener('mouseenter', ()=>show(el));
    });
    ch.addEventListener('mouseleave', ()=>{
      read.textContent = base;
      ch.querySelectorAll('.ch-hit').forEach(x=>x.classList.remove('on'));
    });
  });
}
