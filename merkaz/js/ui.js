// ui.js — formatters and shared components (Hebrew, RTL).
export const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nfInt = new Intl.NumberFormat('he-IL');
const nfCur = new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0});
export const n   = v => `<span class="num">${nfInt.format(Math.round(v||0))}</span>`;
export const ils = v => `<span class="cur">${nfCur.format(Math.round(v||0))}</span>`;
export const money = v => nfCur.format(Math.round(v||0));
export const bidi = s => `<bdi>${esc(s)}</bdi>`;

export function when(ts){
  if(!ts) return '—';
  const d=new Date(ts), now=new Date(), diff=now-d;
  const t=d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
  if(diff<60e3) return 'הרגע';
  if(diff<3600e3) return `לפני ${Math.round(diff/60e3)} דק׳`;
  if(d.toDateString()===now.toDateString()) return `היום ${t}`;
  if(new Date(now-864e5).toDateString()===d.toDateString()) return `אתמול ${t}`;
  return d.toLocaleDateString('he-IL',{day:'numeric',month:'short'})+' '+t;
}
export const dateOnly = ts => ts ? new Date(ts).toLocaleDateString('he-IL',{day:'numeric',month:'short',year:'numeric'}) : '—';

export const ICON = {
  dash:'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z',
  plus:'M12 5v14M5 12h14',
  orders:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  users:'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  box:'M21 8l-9-5-9 5m18 0l-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  chart:'M18 20V10M12 20V4M6 20v-6',
  cog:'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008 3.68 1.65 1.65 0 009 2.17V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 8v.09a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  back:'M9 18l6-6-6-6', check:'M20 6L9 17l-5-5', x:'M18 6L6 18M6 6l12 12',
  share:'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13',
  copy:'M20 9H11a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1',
  phone:'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z',
  pin:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z',
  mic:'M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8',
  cam:'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
  text:'M4 7V4h16v3M9 20h6M12 4v16',
  alert:'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  search:'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  down:'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  out:'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
};
export const icon = (k,s=20)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]||''}"/></svg>`;

export const pill = (t,tone='muted')=>`<span class="pill pill-${tone}">${esc(t)}</span>`;
export const STATUS_HE={draft:'טיוטה',open:'פתוחה',delivered:'נמסרה',cancelled:'בוטלה'};
export const STATUS_TONE={draft:'muted',open:'info',delivered:'ok',cancelled:'muted'};
export const statusPill = s=>pill(STATUS_HE[s]||s, STATUS_TONE[s]||'muted');
export const payPill = p=>pill(p==='paid'?'שולם לפי דיווח':'לא שולם', p==='paid'?'ok':'danger');
// The only accepted methods. Merkaz records what the Owner enters; it never
// connects to a bank, wallet or card processor and never verifies a payment.
export const PAY_METHOD_HE={cash:'מזומן',bit:'ביט',paybox:'פייבוקס',card:'אשראי',crypto:'קריפטו',other:'אחר'};

export const card=(inner,cls='')=>`<div class="card ${cls}">${inner}</div>`;
export const cardHead=(t,sub='',right='')=>`<div class="card-head"><h2>${esc(t)}</h2>${right}${sub?`<div class="sub">${esc(sub)}</div>`:''}</div>`;
export const pageHead=(t,sub='',actions='')=>`<div class="page-head"><h1>${esc(t)}</h1>${sub?`<div class="sub">${esc(sub)}</div>`:''}${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;
export const backLink=(to,l)=>`<button class="back-link" data-act="nav" data-to="${to}">${icon('back',16)}${esc(l)}</button>`;
export const empty=(t,s='',k='box')=>`<div class="empty"><div class="empty-mark">${icon(k,24)}</div><h3>${esc(t)}</h3>${s?`<p>${esc(s)}</p>`:''}</div>`;
export const notice=(html,tone='info',k='alert')=>`<div class="notice notice-${tone}">${icon(k,18)}<div>${html}</div></div>`;
export const dl=ps=>`<dl class="dl">${ps.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
export const bar=(p,t='')=>`<div class="bar"><i class="${t}" style="width:${Math.max(2,Math.min(100,p))}%"></i></div>`;
export const chips=(o,a,act)=>`<div class="chips">${o.map(x=>`<button class="chip ${x.v===a?'active':''}" data-act="${act}" data-v="${x.v}">${esc(x.l)}</button>`).join('')}</div>`;

export function stat({label,value,meta,tone,to,act,id}){
  const tag=(to||act)?'button':'div';
  const at=to?`data-act="nav" data-to="${to}"`:act?`data-act="${act}" data-id="${id||''}"`:'';
  return `<${tag} class="stat" ${at}><div class="stat-label">${tone?`<i class="stat-dot ${tone}"></i>`:''}${esc(label)}</div>
    <div class="stat-value">${value}</div>${meta?`<div class="stat-meta">${meta}</div>`:''}</${tag}>`;
}
export function row({title,sub,end,to,act,id,chev=true}){
  const tag=(to||act)?'button':'div';
  const at=to?`data-act="nav" data-to="${to}"`:act?`data-act="${act}" data-id="${id||''}"`:'';
  return `<${tag} class="row" ${at}><div class="row-main"><div class="row-title">${title}</div>
    ${sub?`<div class="row-sub">${sub}</div>`:''}</div>${end?`<div class="row-end">${end}</div>`:''}
    ${(to||act)&&chev?`<span class="chev">${icon('back',18)}</span>`:''}</${tag}>`;
}
export const tbl=(h,r)=>`<div class="tbl-wrap"><table><thead><tr>${h.map(x=>`<th class="${x.n?'n':''}">${esc(x.l||x)}</th>`).join('')}</tr></thead><tbody>${r.join('')}</tbody></table></div>`;

export function toast(msg,kind=''){
  const b=document.getElementById('toasts'); const e=document.createElement('div');
  e.className='toast '+kind; e.innerHTML=(kind==='ok'?icon('check',18):kind==='err'?icon('x',18):'')+`<span>${esc(msg)}</span>`;
  b.appendChild(e); setTimeout(()=>{e.style.opacity='0';e.style.transition='opacity .25s';setTimeout(()=>e.remove(),260);},2800);
}
export function modal({title,body,foot,onMount}){
  closeModal();
  const r=document.getElementById('modal-root');
  r.innerHTML=`<div class="modal-scrim" data-close="1"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close="1" aria-label="סגירה">${icon('x',20)}</button></div>
    <div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}</div></div>`;
  r.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',e=>{ if(e.target===b) closeModal(); }));
  document.body.style.overflow='hidden'; if(onMount) onMount(r);
}
export function closeModal(){ const r=document.getElementById('modal-root'); if(r) r.innerHTML=''; document.body.style.overflow=''; }
export const qtyField=(id,v,max)=>`<div class="qty"><button type="button" data-step="-1" data-target="${id}">−</button>
  <input id="${id}" type="number" value="${v}" min="0" ${max!=null?`max="${max}"`:''}><button type="button" data-step="1" data-target="${id}">+</button></div>`;
export function wireQty(s){ s.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{
  const i=s.querySelector('#'+b.dataset.target); const m=i.max!==''?+i.max:Infinity;
  i.value=Math.max(0,Math.min(m,(+i.value||0)+(+b.dataset.step))); })); }
export const spinner = (t='טוען…')=>`<div class="empty"><div class="spin"></div><p>${esc(t)}</p></div>`;

export function downloadCSV(filename, rows){
  const csv = rows.map(r=>r.map(c=>{
    const s = String(c??'');
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function downloadText(name, text, type='application/json'){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
