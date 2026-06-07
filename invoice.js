/* ═══════════════════════════════════════════════════
   invoice.js  ·  We App Testers Invoice Generator
   ═══════════════════════════════════════════════════ */

/* ── Predefined services ──────────────────────────── */
const SERVICES = [
  { id:'s1', label:'14-Day Testing',          desc:'14-Day Closed Testing Service',     unit:1 },
  { id:'sc', label:'Custom Service',         desc:'',                                  unit:1, custom:true },
];

/* ── Package price presets ────────────────────────── */
const PRESETS = [
  { id:'p1', label:'₹1,286', value:1286, currency:'₹' },
  { id:'p2', label:'₹1,574', value:1574, currency:'₹' },
  { id:'p3', label:'$25',    value:25,   currency:'$' },
  { id:'p4', label:'$31',    value:31,   currency:'$' },
  { id:'pc', label:'Custom', value:0,    currency:'₹', custom:true },
];

const DEFAULT_NOTES = 'Thank you for choosing We App Testers. Payment has been received successfully. This invoice serves as proof of payment.';

/* ── State ────────────────────────────────────────── */
let state = {
  /* services - now support multiple */
  services: [],
  
  /* pricing */
  preset: null,
  unitPrice: 0,         /* base unit price */
  currency: '₹',
  agreedPrice: null,    /* Final Agreed Price (optional) */

  /* payments */
  payments: [],
  useManual: false,
  manualReceived: '',
};

/* ── Formatters ───────────────────────────────────── */
function fmt(n, cur) {
  if (cur === '$') return '$' + Number(n).toFixed(2);
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB',
    { day:'2-digit', month:'short', year:'numeric' });
}
function todayISO()     { return new Date().toISOString().slice(0,10); }
function todayDisplay() {
  return new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

/* ── Package name extractor ───────────────────────── */
function extractPkg(raw) {
  if (!raw) return '';
  try { const u=new URL(raw.trim()); const id=u.searchParams.get('id'); if(id) return id; } catch(e) {}
  return raw.trim();
}

/* ── Invoice number ───────────────────────────────── */
function buildInvNum() {
  const p1 = (document.getElementById('inp-inv-p1')?.value || 'WAT').trim();
  const p2 = (document.getElementById('inp-inv-p2')?.value || '').trim();
  const p3 = (document.getElementById('inp-inv-p3')?.value || new Date().getFullYear()).toString().trim();
  return p2 ? `${p1}-${p2}-${p3}` : `${p1}-${p3}`;
}

/* ── Derived price values ─────────────────────────── */
function lineTotal() {
  /* Unit price × number of services selected */
  return state.unitPrice * state.services.length;
}
function subtotal() {
  /* Before agreed-price discount */
  return lineTotal();
}
function finalAmount() {
  /* After agreed-price discount (or same as subtotal) */
  if (state.agreedPrice !== null && state.agreedPrice >= 0) return state.agreedPrice;
  return subtotal();
}
function effectivePaid() {
  if (state.useManual) return parseFloat(state.manualReceived) || 0;
  if (state.payments.length === 0) return finalAmount(); /* auto full payment */
  return state.payments.reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
}

/* ── Render service selector tabs (checkboxes now) ── */
function renderServiceTabs() {
  const wrap = document.getElementById('service-tabs');
  if (!wrap) return;
  wrap.innerHTML = '';
  SERVICES.forEach(s => {
    const isChecked = state.services.some(srv => srv.id === s.id);
    const lbl = document.createElement('label');
    lbl.className = 'preset-label' + (isChecked ? ' active' : '');
    lbl.innerHTML = `<input type="checkbox" name="service" value="${s.id}" ${isChecked?'checked':''}><span>${s.label}</span>`;
    lbl.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        state.services.push(s);
      } else {
        state.services = state.services.filter(srv => srv.id !== s.id);
      }
      renderServiceTabs();
      toggleCustomServiceFields();
      updateCalculations();
    });
    wrap.appendChild(lbl);
  });
}

function toggleCustomServiceFields() {
  const cw = document.getElementById('custom-svc-wrap');
  if (!cw) return;
  const hasCustom = state.services.some(s => s.custom);
  cw.style.display = hasCustom ? '' : 'none';
}

/* ── Render preset radios ─────────────────────────── */
function renderPresets() {
  const wrap = document.getElementById('preset-radios');
  if (!wrap) return;
  wrap.innerHTML = '';
  PRESETS.forEach(p => {
    const lbl = document.createElement('label');
    lbl.className = 'preset-label' + (state.preset?.id===p.id ? ' active' : '');
    lbl.innerHTML = `<input type="radio" name="preset" value="${p.id}" ${state.preset?.id===p.id?'checked':''}><span>${p.label}</span>`;
    lbl.querySelector('input').addEventListener('change', () => {
      state.preset = p;
      const cpw = document.getElementById('custom-price-wrap');
      if (p.custom) {
        cpw && (cpw.style.display='flex');
        applyCustomPreset();
      } else {
        cpw && (cpw.style.display='none');
        state.unitPrice = p.value;
        state.currency  = p.currency;
      }
      renderPresets();
      updateCalculations();
    });
    wrap.appendChild(lbl);
  });
}

function applyCustomPreset() {
  const amt = parseFloat(document.getElementById('inp-custom-price')?.value) || 0;
  const cur = document.getElementById('inp-custom-currency')?.value || '₹';
  state.unitPrice = amt;
  state.currency  = cur;
}

/* ── Render payment entries ───────────────────────── */
function renderPaymentEntries() {
  const list = document.getElementById('payment-list');
  if (!list) return;
  list.innerHTML = '';
  state.payments.forEach((pay,idx) => {
    const row = document.createElement('div');
    row.className = 'pay-entry';
    row.innerHTML = `
      <input type="date" class="pay-date" value="${pay.date||''}">
      <input type="number" class="pay-amount-input" value="${pay.amount||''}" placeholder="Amount" min="0" step="0.01">
      <button class="pay-remove">✕</button>`;
    row.querySelector('.pay-date').addEventListener('input', e => { state.payments[idx].date=e.target.value; updateCalculations(); });
    row.querySelector('.pay-amount-input').addEventListener('input', e => { state.payments[idx].amount=e.target.value; updateCalculations(); });
    row.querySelector('.pay-remove').addEventListener('click', () => { state.payments.splice(idx,1); renderPaymentEntries(); updateCalculations(); });
    list.appendChild(row);
  });
}

/* ── Render service descriptions in table ─────────── */
function renderServiceDescriptions() {
  const tbody = document.getElementById('svc-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const cur = state.currency;
  
  state.services.forEach((svc, idx) => {
    const desc = svc.custom 
      ? (document.getElementById('inp-custom-svc-desc')?.value || 'Custom Service')
      : svc.desc;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${desc}</td>
      <td>1</td>
      <td>${state.unitPrice > 0 ? fmt(state.unitPrice, cur) : '—'}</td>
      <td class="amount">${state.unitPrice > 0 ? fmt(state.unitPrice, cur) : '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── Master update ────────────────────────────────── */
function updateCalculations() {
  const cur   = state.currency;
  const sub   = subtotal();      /* unitPrice × qty */
  const final = finalAmount();   /* after agreed-price */
  const paid  = effectivePaid();
  const balance = final > 0 ? Math.max(0, final - paid) : 0;
  const isPaid  = final > 0 && balance <= 0.005;
  const isOut   = final > 0 && balance >  0.005;

  /* ── Service table rows ── */
  renderServiceDescriptions();

  /* ── Summary ── */
  // Subtotal
  setText('val-subtotal', sub > 0 ? fmt(sub, cur) : '—');

  // Agreed-price discount rows
  const discountSection = document.getElementById('summary-discount-section');
  if (state.agreedPrice !== null && state.agreedPrice >= 0 && state.agreedPrice !== sub) {
    const discAmt = sub - state.agreedPrice;
    const discPct = sub > 0 ? (Math.abs(discAmt)/sub*100).toFixed(2) : '0.00';
    setText('val-discount-amt', `−${fmt(Math.abs(discAmt),cur)}`);
    setText('val-discount-pct', `(${discPct}%)`);
    setText('val-final-amount', fmt(state.agreedPrice, cur));
    if (discountSection) discountSection.style.display='';
  } else {
    if (discountSection) discountSection.style.display='none';
  }

  // Total = final amount
  setText('val-total', final > 0 ? fmt(final, cur) : '—');

  // Paid / balance
  setText('val-paid',    final > 0 ? fmt(paid, cur) : '—');
  setText('val-balance', final > 0 ? fmt(balance, cur) : '—');

  // Due row colour
  const dueRow = document.getElementById('due-row');
  if (dueRow) dueRow.className = 'summary-row due-row' + (isPaid?' zero':'');

  // Extra paid (overpayment)
  hide('extra-row');
  if (final > 0 && paid - final > 0.005) {
    const pct = ((paid-final)/final*100).toFixed(2);
    setText('val-extra', '+' + pct + '%');
    show('extra-row');
  }

  /* ── Badge / Title / Stamp ── */
  let statusText = 'OUTSTANDING', badgeClass = 'badge-outstanding', titleText = 'OUTSTANDING INVOICE';
  if (isPaid || final === 0) {
    statusText='PAID'; badgeClass='badge-paid'; titleText='PAID INVOICE';
  }
  const badge = document.getElementById('status-badge');
  if (badge) { badge.textContent=statusText; badge.className='inv-status-badge '+badgeClass; }
  setText('inv-title', titleText);

  const stamp = document.getElementById('paid-stamp');
  if (stamp) {
    stamp.className = 'paid-stamp' + (isOut?' outstanding':'');
    const st = stamp.querySelector('.stamp-text');
    if (st) st.textContent = isOut ? 'OUTSTANDING' : 'PAID';
  }

  /* ── Payment history preview ── */
  renderPayHistPreview(cur, final);
}

function renderPayHistPreview(cur, finalAmt) {
  const tbody = document.getElementById('ph-tbody');
  const phSec = document.getElementById('ph-section');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.payments.length === 0) {
    if (finalAmt > 0 && !state.useManual) {
      phSec && (phSec.style.display='');
      const tr = document.createElement('tr');
      tr.innerHTML=`
        <td style="padding:7px 12px;font-size:11.5px">1</td>
        <td style="padding:7px 12px;font-size:11.5px">${todayDisplay()}</td>
        <td class="pay-amount" style="padding:7px 12px;font-size:12px;font-weight:700;color:#1B5E20;text-align:right">${fmt(finalAmt,cur)}</td>`;
      tbody.appendChild(tr);
    } else {
      phSec && (phSec.style.display='none');
    }
    return;
  }
  phSec && (phSec.style.display='');
  state.payments.forEach((p,i) => {
    const amt = parseFloat(p.amount)||0;
    const tr = document.createElement('tr');
    tr.innerHTML=`
      <td style="padding:7px 12px;font-size:11.5px">${i+1}</td>
      <td style="padding:7px 12px;font-size:11.5px">${fmtDate(p.date)}</td>
      <td class="pay-amount" style="padding:7px 12px;font-size:12px;font-weight:700;color:#1B5E20;text-align:right">${fmt(amt,cur)}</td>`;
    tbody.appendChild(tr);
  });
}

/* ── Helpers ──────────────────────────────────────── */
function setText(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function show(id){ const e=document.getElementById(id); if(e) e.style.display=''; }
function hide(id){ const e=document.getElementById(id); if(e) e.style.display='none'; }

/* ── PDF Download ─────────────────────────────────── */
function downloadPDF() {
  const element = document.getElementById('invoice-page');
  const opt = {
    margin: 0,
    filename: 'invoice.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(element).save();
}

/* ── Init ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Date ── */
  const dateInp = document.getElementById('inp-date');
  const dateDisp = document.getElementById('disp-date');
  if (dateInp) {
    dateInp.value = todayISO();
    if (dateDisp) dateDisp.textContent = todayDisplay();
    dateInp.addEventListener('input', () => {
      if (dateDisp) dateDisp.textContent = fmtDate(dateInp.value);
    });
  }

  /* ── Invoice number ── */
  const p3el = document.getElementById('inp-inv-p3');
  if (p3el) p3el.value = new Date().getFullYear();
  ['inp-inv-p1','inp-inv-p2','inp-inv-p3'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const num = buildInvNum();
      setText('disp-inv-number', num);
      const prev = document.getElementById('inv-num-preview');
      if (prev) prev.textContent = num;
    });
  });
  const initNum = buildInvNum();
  setText('disp-inv-number', initNum);
  const prevEl = document.getElementById('inv-num-preview');
  if (prevEl) prevEl.textContent = initNum;

  /* ── Client name ── */
  document.getElementById('inp-client-name')?.addEventListener('input', e => {
    setText('disp-client-name', e.target.value || 'Client Name');
  });

  /* ── Client email — hide if empty ── */
  const emailInp  = document.getElementById('inp-client-email');
  const emailWrap = document.getElementById('disp-client-email-wrap');
  if (emailInp && emailWrap) {
    emailWrap.style.display = 'none';
    emailInp.addEventListener('input', e => {
      const v = e.target.value.trim();
      emailWrap.style.display = v ? '' : 'none';
      setText('disp-client-email', v);
    });
  }

  /* ── Client phone — hide if empty ── */
  const phoneInp  = document.getElementById('inp-client-phone');
  const phoneWrap = document.getElementById('disp-client-phone-wrap');
  if (phoneInp && phoneWrap) {
    phoneWrap.style.display = 'none';
    phoneInp.addEventListener('input', e => {
      const v = e.target.value.trim();
      phoneWrap.style.display = v ? '' : 'none';
      setText('disp-client-phone', v);
    });
  }

  /* ── Package name — extract from Play Store URL ── */
  const pkgInp  = document.getElementById('inp-pkg-name');
  const pkgWrap = document.getElementById('disp-pkg-wrap');
  if (pkgInp) {
    if (pkgWrap) pkgWrap.style.display='none';
    pkgInp.addEventListener('input', e => {
      const extracted = extractPkg(e.target.value);
      setText('disp-pkg-name', extracted || '—');
      if (pkgWrap) pkgWrap.style.display = extracted ? '' : 'none';
    });
  }

  /* ── App name ── */
  document.getElementById('inp-app-name')?.addEventListener('input', e => {
    setText('disp-app-name', e.target.value || '—');
  });

  /* ── Testers / Duration defaults ── */
  const testersInp = document.getElementById('inp-testers');
  if (testersInp) {
    setText('disp-testers', '12+ Testers');
    testersInp.addEventListener('input', e => setText('disp-testers', e.target.value.trim() || '12+ Testers'));
  }
  const durInp = document.getElementById('inp-duration');
  if (durInp) {
    setText('disp-duration', '14 Days');
    durInp.addEventListener('input', e => setText('disp-duration', e.target.value.trim() || '14 Days'));
  }

  /* ── Service selector tabs (checkboxes) ── */
  renderServiceTabs();
  toggleCustomServiceFields();

  /* ── Custom service fields ── */
  document.getElementById('inp-custom-svc-desc')?.addEventListener('input', e => {
    updateCalculations();
  });
  document.getElementById('inp-custom-svc-unit')?.addEventListener('input', e => {
    updateCalculations();
  });
  document.getElementById('inp-custom-svc-price')?.addEventListener('input', e => {
    state.unitPrice = parseFloat(e.target.value)||0;
    updateCalculations();
  });
  document.getElementById('inp-custom-svc-currency')?.addEventListener('change', e => {
    state.currency = e.target.value;
    updateCalculations();
  });

  /* ── Agreed / Final price ── */
  const agreedInp = document.getElementById('inp-agreed-price');
  if (agreedInp) {
    agreedInp.addEventListener('input', e => {
      const v = e.target.value.trim();
      state.agreedPrice = v === '' ? null : (parseFloat(v)||0);
      updateCalculations();
    });
  }

  /* ── Package presets ── */
  renderPresets();
  document.getElementById('inp-custom-price')?.addEventListener('input', () => {
    if (state.preset?.custom) { applyCustomPreset(); updateCalculations(); }
  });
  document.getElementById('inp-custom-currency')?.addEventListener('change', () => {
    if (state.preset?.custom) { applyCustomPreset(); updateCalculations(); }
  });

  /* ── Add payment ── */
  document.getElementById('btn-add-payment')?.addEventListener('click', () => {
    state.payments.push({ date: todayISO(), amount: '' });
    renderPaymentEntries();
    updateCalculations();
  });

  /* ── Manual override ── */
  document.getElementById('chk-manual')?.addEventListener('change', e => {
    state.useManual = e.target.checked;
    const mf = document.getElementById('manual-field');
    if (mf) mf.style.display = state.useManual ? 'flex' : 'none';
    updateCalculations();
  });
  document.getElementById('inp-manual-received')?.addEventListener('input', e => {
    state.manualReceived = e.target.value;
    updateCalculations();
  });

  /* ── Notes ── */
  const notesInp  = document.getElementById('inp-notes');
  const notesDisp = document.getElementById('inv-notes-block');
  if (notesInp) {
    notesInp.value = DEFAULT_NOTES;
    setText('disp-notes', DEFAULT_NOTES);
    if (notesDisp) notesDisp.style.display='';
    notesInp.addEventListener('input', e => {
      const v = e.target.value.trim();
      if (notesDisp) notesDisp.style.display = v ? '' : 'none';
      setText('disp-notes', v);
    });
  }

  /* ── PDF Download button ── */
  document.getElementById('btn-print')?.addEventListener('click', downloadPDF);

  /* ── Initial render ── */
  updateCalculations();
});
