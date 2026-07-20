/* ═══════════════════════════════════════════════
   invoice.js  ·  We App Testers Invoice Generator
   ═══════════════════════════════════════════════ */

const PRESETS = [
  { id:'p1', label:'₹1,286', value:1286, currency:'₹' },
  { id:'p2', label:'₹1,574', value:1574, currency:'₹' },
  { id:'p3', label:'$25',    value:25,   currency:'$' },
  { id:'p4', label:'$31',    value:31,   currency:'$' },
  { id:'pc', label:'Custom', value:0,    currency:'₹', custom:true },
];

const DEFAULT_NOTES = 'Thank you for choosing We App Testers. Payment has been received successfully. This invoice serves as proof of payment.';

let state = {
  currency: '₹',
  rates: {},
  preset: null,
  agreedPrice: null,
  services: [],
  payments: [],
  useManual: false,
  manualReceived: '',
};

/* ── Currency Exchange ──────────────────────── */
const CUR_CODES = { '₹':'INR', '$':'USD', '€':'EUR', '£':'GBP', 'A$':'AUD', 'C$':'CAD' };
const CUR_SYMBOLS = { 'INR':'₹', 'USD':'$', 'EUR':'€', 'GBP':'£', 'AUD':'A$', 'CAD':'C$' };

async function fetchExchangeRates() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await res.json();
    state.rates = data.rates;
    updateAll();
  } catch (e) {
    console.error('Failed to fetch exchange rates:', e);
  }
}

function convertCur(amount, fromSym, toSym) {
  if (fromSym === toSym) return amount;
  const fromCode = CUR_CODES[fromSym] || 'USD';
  const toCode = CUR_CODES[toSym] || 'USD';
  const rFrom = state.rates[fromCode] || 1;
  const rTo = state.rates[toCode] || 1;
  return (amount / rFrom) * rTo;
}

/* ── Formatters ─────────────────────────────── */
function fmt(n, cur) {
  cur = cur || state.currency;
  if (cur === '$') return '$' + Number(n).toFixed(2);
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function todayISO() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const v = {};
  parts.forEach(p => v[p.type] = p.value);
  return `${v.year}-${v.month}-${v.day}`;
}
function todayDisplay() {
  return new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric' });
}
function extractPkg(raw) {
  if (!raw) return '';
  try { const u=new URL(raw.trim()); const id=u.searchParams.get('id'); if(id) return id; } catch(e){}
  return raw.trim();
}
function buildInvNum() {
  const p1=(document.getElementById('inp-inv-p1')?.value||'WAT').trim().toUpperCase();
  const p2=(document.getElementById('inp-inv-p2')?.value||'').trim().toUpperCase();
  const p3=(document.getElementById('inp-inv-p3')?.value||new Date().getFullYear()).toString().trim().toUpperCase();
  return p2 ? `${p1}-${p2}-${p3}` : `${p1}-${p3}`;
}

/* ── Validation ─────────────────────────────── */
function validateForm() {
  const errors = [];
  const clientName = (document.getElementById('inp-client-name')?.value||'').trim();
  const appName = (document.getElementById('inp-app-name')?.value||'').trim();
  const dateInp = (document.getElementById('inp-date')?.value||'').trim();

  if (!clientName) errors.push('Client Name is required.');
  if (!appName) errors.push('App Name is required.');
  if (!dateInp) errors.push('Invoice Date is required.');
  if (state.services.length === 0) errors.push('Please add at least one service.');
  const hasBlankService = state.services.some(s => !s.desc || !s.desc.trim());
  if (hasBlankService) errors.push('All services must have a description.');
  return errors;
}

function showErrors(errors) {
  let errBox = document.getElementById('validation-errors');
  if (!errBox) {
    errBox = document.createElement('div');
    errBox.id = 'validation-errors';
    errBox.style.cssText = 'background:#fff0f0;border:1.5px solid #e00;border-radius:8px;padding:12px 16px;margin:0 auto 12px;width:760px;max-width:100%;font-size:13px;color:#c00;';
    const actionRow = document.querySelector('.action-row');
    if (actionRow) {
      actionRow.parentNode.insertBefore(errBox, actionRow);
    } else {
      document.body.appendChild(errBox);
    }
  }
  errBox.innerHTML = '<strong>Please fix these issues:</strong><ul style="margin:6px 0 0 18px">' +
    errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
  errBox.style.display = 'block';
  errBox.scrollIntoView({ behavior:'smooth', block:'center' });
}

function clearErrors() {
  const errBox = document.getElementById('validation-errors');
  if (errBox) errBox.style.display = 'none';
}

/* ── Calculations ───────────────────────────── */
function servicesSubtotal() {
  return state.services.reduce((sum, s) => {
    const amount = (parseFloat(s.unitPrice)||0) * (parseInt(s.qty)||1);
    return sum + convertCur(amount, s.currency || state.currency, state.currency);
  }, 0);
}
function finalAmount() {
  const sub = servicesSubtotal();
  if (state.agreedPrice !== null && state.agreedPrice >= 0) return state.agreedPrice;
  return sub;
}
function effectivePaid() {
  if (state.useManual) return parseFloat(state.manualReceived)||0;
  return state.payments.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
}

/* ── Master update ──────────────────────────── */
function updateAll() {
  /* Keeps state consistent; can be extended for live preview */
  clearErrors();
  
  const final = finalAmount();
  const paid = effectivePaid();
  const bal = final > 0 ? Math.max(0, final - paid) : 0;
  const isPaid = final > 0 && bal <= 0.005;

  const notesInp = document.getElementById('inp-notes');
  if (notesInp) {
    let current = notesInp.value.trim();
    if (isPaid) {
      if (current === 'Thank you for choosing We App Testers.') {
        notesInp.value = DEFAULT_NOTES;
      }
    } else {
      if (current === DEFAULT_NOTES) {
        notesInp.value = 'Thank you for choosing We App Testers.';
      } else {
        let replaced = current.replace(' Payment has been received successfully. This invoice serves as proof of payment.', '');
        if (replaced !== current) notesInp.value = replaced;
      }
    }
  }
}

/* ── Render service rows (form) ─────────────── */
function renderServiceRows() {
  const list = document.getElementById('service-list');
  if (!list) return;
  list.innerHTML = '';
  state.services.forEach((svc, idx) => {
    const row = document.createElement('div');
    row.className = 'svc-entry';
    row.innerHTML = `
      <div class="svc-row-top">
        <div class="svc-pills">
          <label class="svc-pill${svc.type==='14day'?' active':''}">
            <input type="radio" name="svctype${idx}" value="14day" ${svc.type==='14day'?'checked':''}> 14-Day Testing
          </label>
          <label class="svc-pill${svc.type==='custom'?' active':''}">
            <input type="radio" name="svctype${idx}" value="custom" ${svc.type==='custom'?'checked':''}> Custom
          </label>
        </div>
        <button class="svc-remove">✕ Remove</button>
      </div>
      <div class="svc-fields">
        <div class="svc-fg" style="flex:3">
          <label>Description</label>
          <input type="text" class="svc-desc" value="${escHtml(svc.desc)}" placeholder="Service description" list="common-services">
        </div>
        <div class="svc-fg" style="flex:1">
          <label>Qty</label>
          <input type="number" class="svc-qty" value="${svc.qty||1}" min="1">
        </div>
        <div class="svc-fg" style="flex:1">
          <label>Currency</label>
          <select class="svc-cur">
            <option value="₹"${svc.currency==='₹'?' selected':''}>₹ INR</option>
            <option value="$"${svc.currency==='$'?' selected':''}>$ USD</option>
            <option value="€"${svc.currency==='€'?' selected':''}>€ EUR</option>
            <option value="£"${svc.currency==='£'?' selected':''}>£ GBP</option>
            <option value="A$"${svc.currency==='A$'?' selected':''}>A$ AUD</option>
            <option value="C$"${svc.currency==='C$'?' selected':''}>C$ CAD</option>
          </select>
        </div>
        <div class="svc-fg" style="flex:1.5">
          <label>Unit Price</label>
          <input type="number" class="svc-price" value="${svc.unitPrice||''}" min="0" step="0.01" placeholder="0.00">
        </div>
      </div>`;

    row.querySelectorAll('input[type=radio]').forEach(r => {
      r.addEventListener('change', () => {
        state.services[idx].type = r.value;
        if (r.value === '14day') {
          state.services[idx].desc = '14-Day Closed Testing Service';
          row.querySelector('.svc-desc').value = '14-Day Closed Testing Service';
        }
        row.querySelectorAll('.svc-pill').forEach(p=>p.classList.remove('active'));
        r.closest('.svc-pill').classList.add('active');
        updateAll();
      });
    });
    row.querySelector('.svc-desc').addEventListener('input', e => { state.services[idx].desc=e.target.value; updateAll(); });
    row.querySelector('.svc-qty').addEventListener('input', e => { state.services[idx].qty=Math.max(1,parseInt(e.target.value)||1); updateAll(); });
    row.querySelector('.svc-cur').addEventListener('change', e => { state.services[idx].currency=e.target.value; updateAll(); });
    row.querySelector('.svc-price').addEventListener('input', e => { state.services[idx].unitPrice=parseFloat(e.target.value)||0; updateAll(); });
    row.querySelector('.svc-remove').addEventListener('click', () => { state.services.splice(idx,1); renderServiceRows(); updateAll(); });
    list.appendChild(row);
  });
}

function addService(type) {
  const desc = type==='14day' ? '14-Day Closed Testing Service' : '';
  state.services.push({ type, desc, qty:1, currency:state.currency, unitPrice:0 });
  renderServiceRows();
  updateAll();
}

/* ── Render preset pills ────────────────────── */
function renderPresets() {
  const wrap = document.getElementById('preset-radios');
  if (!wrap) return;
  wrap.innerHTML = '';
  PRESETS.forEach(p => {
    const lbl = document.createElement('label');
    lbl.className = 'preset-pill' + (state.preset?.id===p.id?' active':'');
    lbl.innerHTML = `<input type="radio" name="preset" value="${p.id}" ${state.preset?.id===p.id?'checked':''}><span>${p.label}</span>`;
    lbl.querySelector('input').addEventListener('change', () => {
      state.preset = p;
      const cpw = document.getElementById('custom-price-wrap');
      if (p.custom) {
        cpw && (cpw.style.display='flex');
        applyCustomPreset();
      } else {
        cpw && (cpw.style.display='none');
        state.currency = p.currency;
        state.services.forEach(s => { s.unitPrice=p.value; s.currency=p.currency; });
        renderServiceRows();
      }
      renderPresets();
      updateAll();
    });
    wrap.appendChild(lbl);
  });
}
function applyCustomPreset() {
  const amt = parseFloat(document.getElementById('inp-custom-price')?.value)||0;
  const cur = document.getElementById('inp-custom-currency')?.value||'₹';
  state.currency=cur;
  state.services.forEach(s=>{ s.unitPrice=amt; s.currency=cur; });
  renderServiceRows();
}

/* ── Render payment entries (form) ──────────── */
function renderPaymentEntries() {
  const list = document.getElementById('payment-list');
  if (!list) return;
  list.innerHTML='';
  state.payments.forEach((pay,idx) => {
    const row = document.createElement('div');
    row.className='pay-entry';
    row.innerHTML=`
      <input type="date" class="pay-date" value="${pay.date||''}">
      <select class="pay-method">
        <option value="" ${!pay.method ? 'selected' : ''}>Method...</option>
        <option value="UPI" ${pay.method==='UPI' ? 'selected' : ''}>UPI</option>
        <option value="PayPal" ${pay.method==='PayPal' ? 'selected' : ''}>PayPal</option>
        <option value="Binance" ${pay.method==='Binance' ? 'selected' : ''}>Binance</option>
        <option value="PhonePe" ${pay.method==='PhonePe' ? 'selected' : ''}>PhonePe</option>
        <option value="Bank Transfer" ${pay.method==='Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
        <option value="Cash" ${pay.method==='Cash' ? 'selected' : ''}>Cash</option>
        <option value="Other" ${pay.method==='Other' ? 'selected' : ''}>Other</option>
      </select>
      <input type="text" class="pay-ref" value="${escHtml(pay.ref||'')}" placeholder="Ref No / UTR">
      <input type="number" class="pay-amt" value="${pay.amount||''}" placeholder="Amount" min="0" step="0.01">
      <button class="pay-remove">✕</button>`;
    row.querySelector('.pay-date').addEventListener('input', e=>{ state.payments[idx].date=e.target.value; updateAll(); });
    row.querySelector('.pay-method').addEventListener('change', e=>{ state.payments[idx].method=e.target.value; updateAll(); });
    row.querySelector('.pay-ref').addEventListener('input', e=>{ state.payments[idx].ref=e.target.value; updateAll(); });
    row.querySelector('.pay-amt').addEventListener('input', e=>{ state.payments[idx].amount=e.target.value; updateAll(); });
    row.querySelector('.pay-remove').addEventListener('click', ()=>{ state.payments.splice(idx,1); renderPaymentEntries(); updateAll(); });
    list.appendChild(row);
  });
}

/* ── Build invoice HTML for PDF printing ─────── */
function buildInvoiceHTML(exportMode = 'html') {

  const cur     = state.currency;
  const sub     = servicesSubtotal();
  const final   = finalAmount();
  const paid    = effectivePaid();
  const bal     = final>0 ? Math.max(0,final-paid) : 0;
  const isPaid  = final>0 && bal<=0.005;
  const isOut   = final>0 && bal>0.005;

  const clientName  = (document.getElementById('inp-client-name')?.value||'').trim();
  const clientEmail = (document.getElementById('inp-client-email')?.value||'').trim();
  const clientPhone = (document.getElementById('inp-client-phone')?.value||'').trim();
  const appName     = (document.getElementById('inp-app-name')?.value||'').trim();
  const pkgRaw      = (document.getElementById('inp-pkg-name')?.value||'').trim();
  const pkg         = extractPkg(pkgRaw);
  const testers     = (document.getElementById('inp-testers')?.value||'').trim();
  const duration    = (document.getElementById('inp-duration')?.value||'').trim();
  let notes         = (document.getElementById('inp-notes')?.value||'').trim();
  if (!isPaid) {
    if (notes === DEFAULT_NOTES) {
      notes = 'Thank you for choosing We App Testers.';
    } else {
      notes = notes.replace(' Payment has been received successfully. This invoice serves as proof of payment.', '');
    }
  }
  const invNum      = buildInvNum();
  const dateVal     = document.getElementById('inp-date')?.value;
  const dateStr     = dateVal ? fmtDate(dateVal) : todayDisplay();
  let docTitle      = (document.getElementById('inp-doc-title')?.value||'INVOICE').trim();
  const useAppCodeTitle = document.getElementById('chk-doc-title-format')?.checked;
  if (useAppCodeTitle) {
    const p2=(document.getElementById('inp-inv-p2')?.value||'').trim().toUpperCase();
    const p3=(document.getElementById('inp-inv-p3')?.value||new Date().getFullYear()).toString().trim().toUpperCase();
    docTitle = p2 ? `${p2} ${p3}` : `${p3}`;
  }
  const downloadFileName = `Invoice_${invNum}_${appName || 'App'}`;

  const statusLabel = isPaid ? 'PAID' : 'OUTSTANDING';
  const statusColor = isPaid ? '#59cb52' : '#e65100';
  const statusBg    = isPaid ? '#f0faef' : '#fff3e0';
  const statusBorder= isPaid ? '#59cb52' : '#e65100';

  let stampHTML = '';
  if (final > 0) {
    let stampText = 'UNPAID';
    let stampColor = '#e53935';
    let stampSize = '36px';
    let stampPad = '8px 20px';
    if (isPaid) {
      stampText = 'PAID';
      stampColor = '#59cb52';
    } else if (paid > 0) {
      stampText = 'OUTSTANDING';
      stampColor = '#e65100';
      stampSize = '24px';
      stampPad = '6px 14px';
    }
    stampHTML = `<div style="display:inline-block; font-family:'Montserrat',sans-serif; font-size:${stampSize}; font-weight:800; text-transform:uppercase; color:${stampColor}; border:4px solid ${stampColor}; border-radius:8px; padding:${stampPad}; transform:rotate(-10deg); opacity:0.85; letter-spacing:4px; margin-left:20px;">${stampText}</div>`;
  }
  const titleText   = isPaid ? 'PAID INVOICE' : 'OUTSTANDING INVOICE';
  const balColor    = statusColor;

  /* ── Client info lines ── */
  let clientLines = `<div style="font-size:16px;font-weight:700;color:#1e0c82;margin-bottom:8px;text-transform:capitalize;">${escHtml(clientName||'—')}</div>`;
  if (clientEmail) clientLines += `<div style="font-size:13px;color:#444;margin-bottom:4px">${escHtml(clientEmail)}</div>`;
  if (clientPhone) clientLines += `<div style="font-size:13px;color:#444">${escHtml(clientPhone)}</div>`;

  /* ── Header HTML ── */
  let basePath = window.location.pathname;
  if (!basePath.endsWith('/')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  }
  const logoSrc = window.location.origin + basePath + 'logo.png';
  const headerHTML = `
  <div style="padding:20px 45px 15px; display:flex; justify-content:space-between; align-items:flex-start;">
    <div style="display:flex; align-items:center; gap:20px;">
      <img src="${logoSrc}" style="width:75px; height:75px; object-fit:contain;" crossorigin="anonymous" onerror="this.style.display='none'">
      <div>
        <div style="font-family:'Montserrat',sans-serif; font-weight:800; font-size:26px; color:#1e0c82; letter-spacing:1px; line-height:1; margin-bottom:10px;">WE <span style="color:#8cc63f;">APP</span> TESTERS</div>
        <div style="font-family:'DM Sans',sans-serif; font-size:12.5px; color:#666; line-height:1.6;">
          WeAppTesters@gmail.com<br>
          +91 9122061839<br>
          www.weapptesters.com
        </div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-family:'Montserrat',sans-serif; font-weight:800; font-size:36px; color:#1e0c82; letter-spacing:2px; text-transform:uppercase; margin-bottom:15px; line-height:1;">${escHtml(docTitle)}</div>
      <table style="width:100%; border-collapse:collapse; margin-left:auto;">
        <tr>
          <td style="padding:4px 15px 4px 0; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#888; text-align:right;">Invoice No.</td>
          <td style="padding:4px 0; font-size:13px; font-weight:600; color:#1a1a1a; text-align:right;">${escHtml(invNum)}</td>
        </tr>
        <tr>
          <td style="padding:4px 15px 4px 0; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#888; text-align:right;">Date Issued</td>
          <td style="padding:4px 0; font-size:13px; font-weight:600; color:#1a1a1a; text-align:right;">${escHtml(dateStr)}</td>
        </tr>
        <tr>
          <td style="padding:4px 15px 4px 0; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#888; text-align:right;">Status</td>
          <td style="padding:4px 0; text-align:right;">
            <span style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${statusColor};">${statusLabel}</span>
          </td>
        </tr>
      </table>
    </div>
  </div>`;

  /* ── Billed To & App Details ── */
  const detailsHTML = `
  <div style="padding:5px 45px 15px; display:grid; grid-template-columns:1fr 1fr; gap:30px;">
    <div style="background:#f8f9fc; border-radius:12px; padding:20px;">
      <div style="font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#888; margin-bottom:12px;">Billed To</div>
      ${clientLines}
    </div>
    <div style="background:#f8f9fc; border-radius:12px; padding:20px;">
      <div style="font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#888; margin-bottom:12px;">App & Test Details</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:12px;">
        ${appName ? `<div>
          <div style="font-size:10px; color:#888; margin-bottom:2px;">App Name</div>
          <div style="font-size:13px; font-weight:600; color:#1a1a1a; text-transform:capitalize;">${escHtml(appName)}</div>
        </div>` : ''}
        ${pkg ? `<div><div style="font-size:10px; color:#888; margin-bottom:2px;">Package</div><div style="font-size:13px; font-weight:600; color:#1a1a1a;">${escHtml(pkg)}</div></div>` : ''}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
        ${testers ? `<div>
          <div style="font-size:10px; color:#888; margin-bottom:2px;">Testers</div>
          <div style="font-size:13px; font-weight:600; color:#1a1a1a; text-transform:capitalize;">${escHtml(testers)}</div>
        </div>` : ''}
        ${duration ? `<div>
          <div style="font-size:10px; color:#888; margin-bottom:2px;">Duration</div>
          <div style="font-size:13px; font-weight:600; color:#1a1a1a; text-transform:capitalize;">${escHtml(duration)}</div>
        </div>` : ''}
      </div>
    </div>
  </div>`;

  /* ── Service rows ── */
  let svcRows = '';
  if (state.services.length===0) {
    svcRows = `<tr><td colspan="4" style="padding:12px 24px;color:#999;font-style:italic;font-size:13px;border-bottom:1px solid #f0f0f0;">No services added</td></tr>`;
  } else {
    state.services.forEach(s => {
      const up  = parseFloat(s.unitPrice)||0;
      const qty = parseInt(s.qty)||1;
      const sc  = s.currency||cur;
      const amt = up*qty;
      let amtDisplay = up>0 ? fmt(amt,sc) : '—';
      if (sc !== cur && up>0) {
        amtDisplay += `<br><span style="font-size:10px;color:#888;">${fmt(convertCur(amt, sc, cur), cur)}</span>`;
      }
      svcRows += `
        <tr>
          <td style="padding:12px 24px;font-size:13px;color:#222;border-bottom:1px solid #f0f0f0;text-transform:capitalize;">${escHtml(s.desc||'Service')}</td>
          <td style="padding:12px 24px;font-size:13px;color:#555;text-align:center;border-bottom:1px solid #f0f0f0;">${qty}</td>
          <td style="padding:12px 24px;font-size:13px;color:#555;text-align:right;border-bottom:1px solid #f0f0f0;">${up>0?fmt(up,sc):'—'}</td>
          <td style="padding:12px 24px;font-size:13px;font-weight:700;color:#1a1a1a;text-align:right;border-bottom:1px solid #f0f0f0;line-height:1.2;">${amtDisplay}</td>
        </tr>`;
    });
  }

  let discountHTML = '';
  if (state.agreedPrice!==null && state.agreedPrice>=0 && Math.abs(state.agreedPrice-sub)>0.005) {
    const discAmt = sub-state.agreedPrice;
    const discPct = sub>0 ? (Math.abs(discAmt)/sub*100).toFixed(2) : '0.00';
    discountHTML = `
      <tr>
        <td style="padding:8px 0; font-size:13px; color:#666;">Discount <span style="font-size:11px;">(${discPct}%)</span></td>
        <td style="padding:8px 0; font-size:13px; font-weight:600; color:#c9a84c; text-align:right;">−${fmt(Math.abs(discAmt),cur)}</td>
      </tr>`;
  }

  let extraHTML = '';
  if (final>0 && paid-final>0.005) {
    const pct=((paid-final)/final*100).toFixed(2);
    extraHTML=`<tr>
      <td style="padding:8px 0; font-size:13px; color:#666;">Extra Paid</td>
      <td style="padding:8px 0; font-size:13px; font-weight:600; color:#7b1fa2; text-align:right;">+${pct}%</td>
    </tr>`;
  }

  const pricingHTML = `
  <div style="padding:5px 45px 15px;">
    <div style="border-radius:12px; overflow:hidden; border:1px solid #eaeaea;">
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#1e0c82;">
            <th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#fff; text-align:left;">Description</th>
            <th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#fff; text-align:center;">Qty</th>
            <th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#fff; text-align:right;">Unit Price</th>
            <th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#fff; text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${svcRows}
        </tbody>
      </table>
      <div style="padding:16px 24px; display:flex; justify-content:space-between; align-items:center; background:#fafbfc;">
        <div>${stampHTML}</div>
        <table style="width:320px; border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0; font-size:13px; color:#666;">Subtotal</td>
            <td style="padding:8px 0; font-size:13px; font-weight:600; color:#1a1a1a; text-align:right;">${sub>0?fmt(sub,cur):'—'}</td>
          </tr>
          ${discountHTML}
          <tr>
            <td colspan="2"><div style="height:1px; background:#e0e0e0; margin:12px 0;"></div></td>
          </tr>
          <tr>
            <td style="padding:8px 0; font-family:'Montserrat',sans-serif; font-size:14px; font-weight:700; color:#1e0c82;">Total Amount</td>
            <td style="padding:8px 0; font-family:'Montserrat',sans-serif; font-size:16px; font-weight:800; color:#1e0c82; text-align:right;">${final>0?fmt(final,cur):'—'}</td>
          </tr>
          <tr>
            <td style="padding:8px 0; font-size:13px; color:#666;">Amount Paid</td>
            <td style="padding:8px 0; font-size:13px; font-weight:600; color:#59cb52; text-align:right;">${final>0?fmt(effectivePaid(),cur):'—'}</td>
          </tr>
          ${extraHTML}
          <tr>
            <td colspan="2"><div style="height:1px; background:#e0e0e0; margin:12px 0;"></div></td>
          </tr>
          <tr>
            <td style="padding:8px 0; font-family:'Montserrat',sans-serif; font-size:14px; font-weight:700; color:${balColor};">Balance Due</td>
            <td style="padding:8px 0; font-family:'Montserrat',sans-serif; font-size:16px; font-weight:800; color:${balColor}; text-align:right;">${final>0?fmt(bal,cur):'—'}</td>
          </tr>
        </table>
      </div>
    </div>
  </div>`;

  /* ── Payment history rows ── */
  let phRows = '';
  const hasMethodOrRef = state.payments.some(p => p.method || p.ref);
  const methodHeader = hasMethodOrRef ? `<th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#666; text-align:left;">Method</th>` : '';
  const refHeader = hasMethodOrRef ? `<th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#666; text-align:left;">Reference</th>` : '';

  state.payments.forEach((p,i) => {
    const amt=parseFloat(p.amount)||0;
    const mStr = p.method ? escHtml(p.method) : '—';
    const rStr = p.ref ? escHtml(p.ref) : '—';
    phRows += `<tr>
      <td style="padding:12px 24px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;">${i+1}</td>
      <td style="padding:12px 24px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;">${fmtDate(p.date)}</td>
      ${hasMethodOrRef ? `<td style="padding:12px 24px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;">${mStr}</td>` : ''}
      ${hasMethodOrRef ? `<td style="padding:12px 24px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;">${rStr}</td>` : ''}
      <td style="padding:12px 24px;font-size:13px;font-weight:700;color:#59cb52;text-align:right;border-bottom:1px solid #f0f0f0;">${fmt(amt,cur)}</td>
    </tr>`;
  });
  const showPH = state.payments.length>0;

  const phHTML = showPH ? `
  <div style="padding:0 45px 15px;">
    <div style="font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#888; margin-bottom:12px;">Payment History</div>
    <div style="border-radius:12px; overflow:hidden; border:1px solid #eaeaea;">
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f9fc;">
            <th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#666; text-align:left; width:50px;">#</th>
            <th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#666; text-align:left;">Date</th>
            ${methodHeader}
            ${refHeader}
            <th style="padding:12px 24px; font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#666; text-align:right;">Amount Received</th>
          </tr>
        </thead>
        <tbody>${phRows}</tbody>
      </table>
    </div>
  </div>` : '';

  const notesHTML = notes ? `
    <div style="background:#f8f9fc; border-left:4px solid #1e0c82; border-radius:4px 8px 8px 4px; padding:20px 24px;">
      <div style="font-family:'Montserrat',sans-serif; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#1e0c82; margin-bottom:8px;">Notes</div>
      <div style="font-size:13px; color:#444; line-height:1.6;">${escHtml(notes).replace(/\n/g, '<br>')}</div>
    </div>` : '';

  const signatureHTML = `
  <div style="padding:5px 45px 20px; display:flex; justify-content:space-between; align-items:flex-end; margin-top:auto;">
    <div style="flex:1; max-width:55%; padding-right:40px;">
      ${notesHTML}
    </div>
    <div style="text-align:center; min-width:200px;">
      <div style="font-family:'Caveat',cursive; font-weight:700; font-size:42px; color:#1e0c82; margin-bottom:-10px; line-height:1; padding-bottom:5px;">Aaditya Kumar</div>
      <div style="width:100%; height:1.5px; background:#e0e0e0; margin-bottom:10px;"></div>
      <div style="font-size:12px; color:#888; font-weight:600; text-transform:uppercase; letter-spacing:1.5px;">Founder, We App Testers</div>
    </div>
  </div>`;

  const footerHTML = `
  <div style="background:#1e0c82; color:#fff; padding:15px 45px; display:flex; justify-content:space-between; align-items:center;">
    <div style="font-size:12px; font-weight:500;">Thank you for your business!</div>
    <div style="font-family:'Montserrat',sans-serif; font-size:11px; font-weight:600; letter-spacing:1px; opacity:0.8;">WEAPPTESTERS.COM</div>
  </div>`;

  let scriptHTML = '';
  if (exportMode === 'img') {
    scriptHTML = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
  window.onload = () => {
    setTimeout(() => {
      html2canvas(document.body, {scale: 2}).then(canvas => {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = '${escHtml(downloadFileName)}.png';
        a.click();
        window.parent.postMessage('img-done', '*');
      });
    }, 800);
  };
</script>`;
  } else if (exportMode === 'pdf') {
    scriptHTML = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
  window.onload = () => {
    setTimeout(() => {
      const element = document.querySelector('.page');
      const opt = {
        margin:       0,
        filename:     '${escHtml(downloadFileName)}.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(element).save().then(() => {
        window.parent.postMessage('pdf-done', '*');
      });
    }, 800);
  };
</script>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escHtml(downloadFileName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&family=Caveat:wght@700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'DM Sans',sans-serif;
    background:#fff;
    color:#1a1a1a;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .page{
    width:210mm;
    min-height:296.5mm; /* Slightly less than 297mm to prevent a blank second page */
    background:#fff;
    padding:0;
    display:flex;
    flex-direction:column;
    margin:0 auto;
    position:relative;
    overflow:hidden;
  }
  @media print {
    html,body { width:210mm; height:296.5mm; margin:0; padding:0; overflow:hidden; }
    .page { width:210mm; min-height:296.5mm; page-break-after:avoid; border:none; box-shadow:none; }
    @page { size:A4; margin:0; }
  }
</style>
</head>
<body>
<div class="page">
  ${headerHTML}
  ${detailsHTML}
  ${pricingHTML}
  ${phHTML}
  ${signatureHTML}
  ${footerHTML}
</div>
${scriptHTML}
</body>
</html>`;
}

/* ── PDF Download — direct download via html2pdf ── */
function downloadPDF() {
  /* Validate first */
  const errors = validateForm();
  if (errors.length > 0) { showErrors(errors); return; }
  clearErrors();

  document.querySelectorAll('.btn-download-pdf').forEach(btn => {
    btn.textContent = '⏳ Generating...'; btn.disabled = true;
  });

  const invoiceHTML = buildInvoiceHTML('pdf');

  const iframe = document.createElement('iframe');
  iframe.className = 'download-frame';
  iframe.style.position = 'absolute';
  iframe.style.width = '210mm';
  iframe.style.height = '296.5mm';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  document.body.appendChild(iframe);

  iframe.contentDocument.open();
  iframe.contentDocument.write(invoiceHTML);
  iframe.contentDocument.close();
}

/* ── Reset form ─────────────────────────────── */
function resetForm() {
  if (!confirm('Reset all fields? This cannot be undone.')) return;
  state = { currency:'₹', preset:null, agreedPrice:null, services:[], payments:[], useManual:false, manualReceived:'' };

  document.getElementById('inp-client-name').value = '';
  document.getElementById('inp-client-email').value = '';
  document.getElementById('inp-client-phone').value = '';
  document.getElementById('inp-date').value = todayISO();
  document.getElementById('inp-inv-p1').value = 'WAT';
  document.getElementById('inp-inv-p2').value = '';
  document.getElementById('inp-inv-p3').value = new Date().getFullYear();
  document.getElementById('inp-app-name').value = '';
  document.getElementById('inp-pkg-name').value = '';
  document.getElementById('inp-testers').value = '12+ Testers';
  document.getElementById('inp-duration').value = '14 Days';
  document.getElementById('inp-agreed-price').value = '';
  document.getElementById('inp-notes').value = DEFAULT_NOTES;
  document.getElementById('inp-manual-received').value = '';
  document.getElementById('chk-manual').checked = false;
  document.getElementById('manual-field').style.display = 'none';
  document.getElementById('custom-price-wrap').style.display = 'none';

  const prev = document.getElementById('inv-num-preview');
  if (prev) prev.textContent = buildInvNum();

  renderPresets();
  renderServiceRows();
  renderPaymentEntries();
  clearErrors();
  addService('14day');
}

/* ── Helpers ────────────────────────────────── */
function setText(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Preview Invoice ── */
function updatePreviewScale() {
  const container = document.querySelector('.preview-content');
  const wrapper = document.getElementById('preview-wrapper');
  const frame = document.getElementById('preview-frame');
  if (!container || !wrapper || !frame) return;

  const padding = 40; // 20px padding on each side
  const availableWidth = container.clientWidth - padding;
  // 210mm is approx 794px
  const scale = Math.min(1, availableWidth / 794);

  frame.style.transformOrigin = 'top left';
  frame.style.transform = `scale(${scale})`;

  wrapper.style.width = `${794 * scale}px`;
  wrapper.style.height = `${1123 * scale}px`; // 297mm ~ 1123px
}

function showPreview() {
  const errors = validateForm();
  if (errors.length > 0) { showErrors(errors); return; }
  clearErrors();

  const modal = document.getElementById('preview-modal');
  const frame = document.getElementById('preview-frame');
  
  if (modal && frame) {
    const invoiceHTML = buildInvoiceHTML();
    frame.contentDocument.open();
    frame.contentDocument.write(invoiceHTML);
    frame.contentDocument.close();
    modal.style.display = 'flex';
    
    // Calculate and apply scaling immediately after showing
    setTimeout(updatePreviewScale, 10);
  }
}

function hidePreview() {
  const modal = document.getElementById('preview-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

window.addEventListener('resize', updatePreviewScale);

/* ── Generate Image ── */
function downloadImage() {
  const errors = validateForm();
  if (errors.length > 0) { showErrors(errors); return; }
  clearErrors();

  document.querySelectorAll('.btn-download-img').forEach(btn => {
    btn.textContent = '⏳ Generating...'; btn.disabled = true;
  });

  const invoiceHTML = buildInvoiceHTML('img');

  const iframe = document.createElement('iframe');
  iframe.className = 'download-frame';
  iframe.style.position = 'absolute';
  iframe.style.width = '210mm';
  iframe.style.height = '296.5mm';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  document.body.appendChild(iframe);

  iframe.contentDocument.open();
  iframe.contentDocument.write(invoiceHTML);
  iframe.contentDocument.close();
}

window.addEventListener('message', (e) => {
  if (e.data === 'img-done') {
    document.querySelectorAll('.btn-download-img').forEach(btn => {
      btn.textContent = '⬇ Image'; btn.disabled = false;
    });
    document.querySelectorAll('iframe.download-frame').forEach(ifr => ifr.remove());
  } else if (e.data === 'pdf-done') {
    document.querySelectorAll('.btn-download-pdf').forEach(btn => {
      btn.textContent = '⬇ PDF'; btn.disabled = false;
    });
    document.querySelectorAll('iframe.download-frame').forEach(ifr => ifr.remove());
  }
});

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-preview')?.addEventListener('click', showPreview);
  document.getElementById('btn-close-preview')?.addEventListener('click', hidePreview);
  document.querySelectorAll('.btn-download-pdf').forEach(btn => btn.addEventListener('click', downloadPDF));
  document.querySelectorAll('.btn-download-img').forEach(btn => btn.addEventListener('click', downloadImage));
  /* Date default */
  const dateInp = document.getElementById('inp-date');
  if (dateInp) dateInp.value = todayISO();

  /* Master Currency */
  const mcInp = document.getElementById('inp-master-currency');
  if (mcInp) {
    mcInp.value = state.currency;
    mcInp.addEventListener('change', e => {
      state.currency = e.target.value;
      updateAll();
    });
  }

  /* Fetch Exchange Rates */
  fetchExchangeRates();

  /* Invoice number — year autofill */
  const p3 = document.getElementById('inp-inv-p3');
  if (p3) p3.value = new Date().getFullYear();
  ['inp-inv-p1','inp-inv-p2','inp-inv-p3'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      const prev = document.getElementById('inv-num-preview');
      if (prev) prev.textContent = buildInvNum();
    });
  });
  const prev = document.getElementById('inv-num-preview');
  if (prev) prev.textContent = buildInvNum();
  
  document.getElementById('chk-doc-title-format')?.addEventListener('change', () => {
    // Let's call updateAll if we were using it, but here just in case:
    // buildInvoiceHTML() isn't automatically called on input unless preview is implemented.
    // wait, invoice.js might not have a generic live preview update, but it doesn't hurt.
  });

  /* Notes prefill */
  const notesInp = document.getElementById('inp-notes');
  if (notesInp) notesInp.value = DEFAULT_NOTES;

  /* Service buttons */
  document.getElementById('btn-add-14day')?.addEventListener('click', () => addService('14day'));
  document.getElementById('btn-add-custom')?.addEventListener('click', () => addService('custom'));

  /* Presets */
  renderPresets();
  document.getElementById('inp-custom-price')?.addEventListener('input', () => {
    if (state.preset?.custom) { applyCustomPreset(); }
  });
  document.getElementById('inp-custom-currency')?.addEventListener('change', () => {
    if (state.preset?.custom) { applyCustomPreset(); }
  });

  /* Agreed price */
  document.getElementById('inp-agreed-price')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    state.agreedPrice = v==='' ? null : (parseFloat(v)||0);
  });

  /* Add payment */
  document.getElementById('btn-add-payment')?.addEventListener('click', () => {
    state.payments.push({ date:todayISO(), method:'', ref:'', amount:'' });
    renderPaymentEntries();
  });

  /* Manual override */
  document.getElementById('chk-manual')?.addEventListener('change', e => {
    state.useManual = e.target.checked;
    const mf = document.getElementById('manual-field');
    if (mf) mf.style.display = state.useManual ? 'flex' : 'none';
  });
  document.getElementById('inp-manual-received')?.addEventListener('input', e => {
    state.manualReceived = e.target.value;
  });

  /* Reset */
  document.getElementById('btn-reset')?.addEventListener('click', resetForm);

  /* Default service */
  addService('14day');
});

