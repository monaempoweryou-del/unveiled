// ui.js — formatters and shared component builders (Hebrew, RTL).
import { ICON, STATUS_HE, STATUS_TONE, PAY_HE, PAY_TONE } from './data.js';

export const esc = s => String(s??'').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const nfInt = new Intl.NumberFormat('he-IL');
const nfCur = new Intl.NumberFormat('he-IL',{ style:'currency', currency:'ILS', maximumFractionDigits:0 });

export const n   = v => `<span class="num">${nfInt.format(Math.round(v||0))}</span>`;
export const ils = v => `<span class="cur">${nfCur.format(Math.round(v||0))}</span>`;
export const bidi= s => `<bdi>${esc(s)}</bdi>`;

export function when(ts){
  const d = new Date(ts), now = new Date(), diff = now - d;
  const t = d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
  if(diff < 60e3) return 'הרגע';
  if(diff < 3600e3) return `לפני ${Math.round(diff/60e3)} דק׳`;
  if(d.toDateString() === now.toDateString()) return `היום ${t}`;
  const y = new Date(now - 86400e3);
  if(d.toDateString() === y.toDateString()) return `אתמול ${t}`;
  return d.toLocaleDateString('he-IL',{day:'numeric',month:'short'}) + ' ' + t;
}
export const dateOnly = ts => new Date(ts).toLocaleDateString('he-IL',{day:'numeric',month:'short',year:'numeric'});

export const icon = (name, size=20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[name]||''}"/></svg>`;

export const pill  = (text, tone='muted') => `<span class="pill pill-${tone}">${esc(text)}</span>`;
export const statusPill  = s => pill(STATUS_HE[s]||s, STATUS_TONE[s]||'muted');
export const paymentPill = p => pill(PAY_HE[p]||p, PAY_TONE[p]||'muted');

export const card = (inner, cls='') => `<div class="card ${cls}">${inner}</div>`;
export const cardHead = (title, sub='', right='') =>
  `<div class="card-head"><h2>${esc(title)}</h2>${right}${sub?`<div class="sub">${esc(sub)}</div>`:''}</div>`;

export function stat({label,value,meta,tone,to,act,id}){
  const tag = (to||act) ? 'button' : 'div';
  const attrs = to ? `data-act="nav" data-to="${to}"` : act ? `data-act="${act}" data-id="${id||''}"` : '';
  return `<${tag} class="stat" ${attrs}>
    <div class="stat-label">${tone?`<i class="stat-dot ${tone}"></i>`:''}${esc(label)}</div>
    <div class="stat-value">${value}</div>
    ${meta?`<div class="stat-meta">${meta}</div>`:''}
  </${tag}>`;
}

export const empty = (title, sub='', ic='box') => `<div class="empty">
  <div class="empty-mark">${icon(ic,24)}</div><h3>${esc(title)}</h3>${sub?`<p>${esc(sub)}</p>`:''}</div>`;

export const notice = (text, tone='info', ic='alert') =>
  `<div class="notice notice-${tone}">${icon(ic,18)}<div>${text}</div></div>`;

export function pageHead(title, sub='', actions=''){
  return `<div class="page-head"><h1>${esc(title)}</h1>${sub?`<div class="sub">${esc(sub)}</div>`:''}
    ${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;
}
export const backLink = (to,label) =>
  `<button class="back-link" data-act="nav" data-to="${to}">${icon('back',16)}${esc(label)}</button>`;

export function row({title, sub, end, to, act, id, chev=true}){
  const tag = (to||act)?'button':'div';
  const attrs = to?`data-act="nav" data-to="${to}"`: act?`data-act="${act}" data-id="${id||''}"`:'';
  return `<${tag} class="row" ${attrs}>
    <div class="row-main"><div class="row-title">${title}</div>${sub?`<div class="row-sub">${sub}</div>`:''}</div>
    ${end?`<div class="row-end">${end}</div>`:''}
    ${(to||act)&&chev?`<span class="chev">${icon('back',18)}</span>`:''}
  </${tag}>`;
}

export const seg = (opts, active, act) => `<div class="seg">${opts.map(o=>
  `<button class="${o.v===active?'active':''}" data-act="${act}" data-v="${o.v}">${esc(o.l)}</button>`).join('')}</div>`;
export const chips = (opts, active, act) => `<div class="chips">${opts.map(o=>
  `<button class="chip ${o.v===active?'active':''}" data-act="${act}" data-v="${o.v}">${esc(o.l)}</button>`).join('')}</div>`;

export const bar = (pct, tone='') =>
  `<div class="bar"><i class="${tone}" style="width:${Math.max(2,Math.min(100,pct))}%"></i></div>`;

export const dl = pairs => `<dl class="dl">${pairs.map(([k,v])=>
  `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;

export const tbl = (heads, rows) => `<div class="tbl-wrap"><table>
  <thead><tr>${heads.map(h=>`<th class="${h.n?'n':''}">${esc(h.l||h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.join('')}</tbody></table></div>`;

// -------------------------------------------------- toast + modal
export function toast(msg, kind=''){
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = (kind==='ok'?icon('check',18):kind==='err'?icon('x',18):'') + `<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .25s'; setTimeout(()=>el.remove(),260); }, 2600);
}

let modalOn = false;
export function modal({ title, body, foot, onMount }){
  closeModal();
  modalOn = true;
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-scrim" data-close="1">
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${esc(title)}</h2>
        <button class="icon-btn" data-close="1" aria-label="סגירה">${icon('x',20)}</button></div>
      <div class="modal-body">${body}</div>
      ${foot?`<div class="modal-foot">${foot}</div>`:''}
    </div></div>`;
  root.querySelectorAll('[data-close]').forEach(b=> b.addEventListener('click', e=>{
    if(e.target===b) closeModal();
  }));
  document.body.style.overflow='hidden';
  if(onMount) onMount(root);
}
export function closeModal(){
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML='';
  document.body.style.overflow='';
  modalOn = false;
}
export const isModalOpen = () => modalOn;

export function qtyField(id, value, max){
  return `<div class="qty">
    <button type="button" data-step="-1" data-target="${id}">−</button>
    <input id="${id}" type="number" value="${value}" min="0" ${max!=null?`max="${max}"`:''}>
    <button type="button" data-step="1" data-target="${id}">+</button>
  </div>`;
}
export function wireQty(scope){
  scope.querySelectorAll('[data-step]').forEach(b=> b.addEventListener('click', ()=>{
    const inp = scope.querySelector('#'+b.dataset.target);
    const max = inp.max!==''? +inp.max : Infinity;
    inp.value = Math.max(0, Math.min(max, (+inp.value||0) + (+b.dataset.step)));
  }));
}
