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
  preset: null,
  agreedPrice: null,
  services: [],
  payments: [],
  useManual: false,
  manualReceived: '',
};

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
function todayISO() { return new Date().toISOString().slice(0,10); }
function todayDisplay() {
  return new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function extractPkg(raw) {
  if (!raw) return '';
  try { const u=new URL(raw.trim()); const id=u.searchParams.get('id'); if(id) return id; } catch(e){}
  return raw.trim();
}
function buildInvNum() {
  const p1=(document.getElementById('inp-inv-p1')?.value||'WAT').trim();
  const p2=(document.getElementById('inp-inv-p2')?.value||'').trim();
  const p3=(document.getElementById('inp-inv-p3')?.value||new Date().getFullYear()).toString().trim();
  return p2 ? `${p1}-${p2}-${p3}` : `${p1}-${p3}`;
}

/* ── Validation ─────────────────────────────── */
function validateForm() {
  const errors = [];
  const clientName = (document.getElementById('inp-client-name')?.value||'').trim();
  if (!clientName) errors.push('Client Name is required.');
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
    const btn = document.getElementById('btn-download');
    btn.parentNode.insertBefore(errBox, btn);
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
  return state.services.reduce((sum,s) => sum + (parseFloat(s.unitPrice)||0)*(parseInt(s.qty)||1), 0);
}
function finalAmount() {
  const sub = servicesSubtotal();
  if (state.agreedPrice !== null && state.agreedPrice >= 0) return state.agreedPrice;
  return sub;
}
function effectivePaid() {
  if (state.useManual) return parseFloat(state.manualReceived)||0;
  if (state.payments.length === 0) return finalAmount();
  return state.payments.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
}

/* ── Master update ──────────────────────────── */
function updateAll() {
  /* Keeps state consistent; can be extended for live preview */
  clearErrors();
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
          <input type="text" class="svc-desc" value="${escHtml(svc.desc)}" placeholder="Service description">
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
      <input type="number" class="pay-amt" value="${pay.amount||''}" placeholder="Amount" min="0" step="0.01">
      <button class="pay-remove">✕</button>`;
    row.querySelector('.pay-date').addEventListener('input', e=>{ state.payments[idx].date=e.target.value; updateAll(); });
    row.querySelector('.pay-amt').addEventListener('input', e=>{ state.payments[idx].amount=e.target.value; updateAll(); });
    row.querySelector('.pay-remove').addEventListener('click', ()=>{ state.payments.splice(idx,1); renderPaymentEntries(); updateAll(); });
    list.appendChild(row);
  });
}

/* ── Build invoice HTML for PDF printing ─────── */
function buildInvoiceHTML() {
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
  const testers     = (document.getElementById('inp-testers')?.value||'').trim() || '12+ Testers';
  const duration    = (document.getElementById('inp-duration')?.value||'').trim() || '14 Days';
  const notes       = (document.getElementById('inp-notes')?.value||'').trim();
  const invNum      = buildInvNum();
  const dateVal     = document.getElementById('inp-date')?.value;
  const dateStr     = dateVal ? fmtDate(dateVal) : todayDisplay();

  const statusLabel = isPaid ? 'PAID' : 'OUTSTANDING';
  const statusColor = isPaid ? '#1B5E20' : '#e65100';
  const statusBg    = isPaid ? '#e8f5e9' : '#fff3e0';
  const statusBorder= isPaid ? '#4CAF50' : '#e65100';
  const titleText   = isPaid ? 'PAID INVOICE' : 'OUTSTANDING INVOICE';

  /* ── Service rows ── */
  let svcRows = '';
  if (state.services.length===0) {
    svcRows = `<tr><td colspan="4" style="padding:14px 16px;color:#aaa;font-style:italic;font-size:13px">No services added</td></tr>`;
  } else {
    state.services.forEach(s => {
      const up  = parseFloat(s.unitPrice)||0;
      const qty = parseInt(s.qty)||1;
      const sc  = s.currency||cur;
      const amt = up*qty;
      svcRows += `
        <tr>
          <td style="padding:14px 16px;font-size:13.5px;color:#222;border-bottom:1px solid #eee">${escHtml(s.desc||'Service')}</td>
          <td style="padding:14px 16px;font-size:13.5px;color:#222;text-align:center;border-bottom:1px solid #eee">${qty}</td>
          <td style="padding:14px 16px;font-size:13.5px;color:#222;text-align:right;border-bottom:1px solid #eee">${up>0?fmt(up,sc):'—'}</td>
          <td style="padding:14px 16px;font-size:13.5px;font-weight:700;color:#222;text-align:right;border-bottom:1px solid #eee">${amt>0?fmt(amt,sc):'—'}</td>
        </tr>`;
    });
  }

  /* ── Payment history rows ── */
  let phRows = '';
  if (state.payments.length===0 && !state.useManual && final>0) {
    phRows = `<tr>
      <td style="padding:11px 14px;font-size:13px;color:#333">1</td>
      <td style="padding:11px 14px;font-size:13px;color:#333">${dateStr}</td>
      <td style="padding:11px 14px;font-size:13px;font-weight:700;color:#1B5E20;text-align:right">${fmt(final,cur)}</td>
    </tr>`;
  } else {
    state.payments.forEach((p,i) => {
      const amt=parseFloat(p.amount)||0;
      phRows += `<tr>
        <td style="padding:11px 14px;font-size:13px;color:#333">${i+1}</td>
        <td style="padding:11px 14px;font-size:13px;color:#333">${fmtDate(p.date)}</td>
        <td style="padding:11px 14px;font-size:13px;font-weight:700;color:#1B5E20;text-align:right">${fmt(amt,cur)}</td>
      </tr>`;
    });
  }
  const showPH = state.payments.length>0 || (!state.useManual && final>0);

  /* ── Discount section ── */
  let discountHTML = '';
  if (state.agreedPrice!==null && state.agreedPrice>=0 && Math.abs(state.agreedPrice-sub)>0.005) {
    const discAmt = sub-state.agreedPrice;
    const discPct = sub>0 ? (Math.abs(discAmt)/sub*100).toFixed(2) : '0.00';
    discountHTML = `
      <tr>
        <td style="padding:8px 16px;font-size:13px;color:#888;text-align:left">Discount</td>
        <td style="padding:8px 16px;font-size:13px;font-weight:700;color:#C9A84C;text-align:right">−${fmt(Math.abs(discAmt),cur)} <span style="font-size:11px;opacity:.8">(${discPct}%)</span></td>
      </tr>
      <tr>
        <td style="padding:8px 16px;font-size:13px;color:#555;text-align:left;font-weight:600">Final Amount</td>
        <td style="padding:8px 16px;font-size:13px;font-weight:700;color:#1a1464;text-align:right">${fmt(state.agreedPrice,cur)}</td>
      </tr>`;
  }

  /* ── Extra paid ── */
  let extraHTML = '';
  if (final>0 && paid-final>0.005) {
    const pct=((paid-final)/final*100).toFixed(2);
    extraHTML=`<tr>
      <td style="padding:8px 16px;font-size:13px;color:#888">Extra Paid</td>
      <td style="padding:8px 16px;font-size:13px;font-weight:700;color:#7b1fa2;text-align:right">+${pct}%</td>
    </tr>`;
  }

  /* ── Balance row colour ── */
  const balColor  = isPaid ? '#1B5E20' : '#e65100';
  const balBg     = isPaid ? '#e8f5e9' : '#fff3e0';
  const balBorder = isPaid ? '#4CAF50' : '#e65100';

  /* ── Notes HTML ── */
  const notesHTML = notes ? `
    <div style="display:flex;align-items:flex-start;gap:14px;background:#f0faf0;border:1.5px solid #4CAF50;border-radius:10px;padding:14px 18px;margin-bottom:28px">
      <div style="width:28px;height:28px;background:#4CAF50;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
        <span style="color:#fff;font-size:15px;font-weight:700">&#10003;</span>
      </div>
      <div style="font-family:'DM Sans',sans-serif;font-size:12.5px;color:#1a1a1a;line-height:1.65">
        <strong style="display:block;margin-bottom:3px;color:#1B5E20">${escHtml(notes.split('.')[0])}.</strong>
        ${escHtml(notes.split('.').slice(1).join('.').trim())}
      </div>
    </div>` : '';

  /* ── Client info lines ── */
  let clientLines = `<div style="font-size:14px;font-weight:700;color:#1a1464;margin-bottom:4px">${escHtml(clientName||'—')}</div>`;
  if (clientEmail) clientLines += `<div style="font-size:13px;color:#444;margin-bottom:2px">${escHtml(clientEmail)}</div>`;
  if (clientPhone) clientLines += `<div style="font-size:13px;color:#444">${escHtml(clientPhone)}</div>`;

  /* ── App details grid ── */
  const pkgCell = pkg ? `
    <div style="border-left:1px solid #eee;padding:0 18px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#888;margin-bottom:5px">PACKAGE NAME</div>
      <div style="font-size:13.5px;color:#222;font-weight:500">${escHtml(pkg)}</div>
    </div>` : '';

  /* NOTE: Logo uses data-uri placeholder — replace with your actual base64 logo for offline use */
  const logoSrc = 'https://i.ibb.co/bM7b6WSn/Icon-comp.png';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&family=Caveat:wght@700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'DM Sans',sans-serif;
    background:#fff;
    color:#222;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .page{
    width:210mm;
    min-height:297mm;
    background:#fff;
    padding:0;
    display:flex;
    flex-direction:column;
    margin:0 auto;
  }
  @media print {
    html,body { width:210mm; height:297mm; margin:0; padding:0; }
    .page { width:210mm; min-height:297mm; page-break-after:avoid; }
    @page { size:A4; margin:0; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div style="background:#fff;padding:28px 40px 22px;border-bottom:3px solid #1a1464;display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
    <div style="display:flex;align-items:center;gap:16px">
      <img src="${logoSrc}" style="width:72px;height:72px;object-fit:contain" crossorigin="anonymous" onerror="this.style.display='none'">
      <div>
        <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:24px;color:#1a1464;letter-spacing:.04em;text-transform:uppercase;line-height:1">WE APP TESTERS</div>
        <div style="margin-top:10px;line-height:2">
          <div style="font-size:12.5px;color:#333">&#128222; +91 9122061839</div>
          <div style="font-size:12.5px;color:#333">&#9993; contact@weapptesters.com</div>
          <div style="font-size:12.5px;color:#333">&#127760; www.weapptesters.com</div>
        </div>
      </div>
    </div>
    <div style="border-left:2px solid #eee;padding-left:32px;min-width:260px">
      <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:22px;color:#1a1464;letter-spacing:.03em;text-transform:uppercase;margin-bottom:16px">${titleText}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;font-size:12px"><strong style="font-family:'Montserrat',sans-serif;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#555">INVOICE NO.</strong></td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#222;text-align:right">${escHtml(invNum)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:12px"><strong style="font-family:'Montserrat',sans-serif;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#555">DATE ISSUED</strong></td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;color:#222;text-align:right">${escHtml(dateStr)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:12px"><strong style="font-family:'Montserrat',sans-serif;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#555">STATUS</strong></td>
          <td style="padding:6px 0;text-align:right">
            <span style="display:inline-block;padding:3px 14px;border:1.5px solid ${statusBorder};border-radius:4px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:11px;letter-spacing:.08em;color:${statusColor};background:${statusBg}">${statusLabel}</span>
          </td>
        </tr>
      </table>
    </div>
  </div>

  <!-- BILLED TO + APP DETAILS -->
  <div style="padding:22px 40px;display:grid;grid-template-columns:1fr 1.6fr;gap:20px">
    <div style="border:1.5px solid #e8e8e8;border-radius:10px;padding:18px 20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="width:32px;height:32px;background:#1a1464;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="color:#fff;font-size:15px">&#128100;</span>
        </div>
        <span style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#1a1464">BILLED TO</span>
      </div>
      ${clientLines}
    </div>
    <div style="border:1.5px solid #e8e8e8;border-radius:10px;padding:18px 20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="width:32px;height:32px;background:#1a1464;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="color:#fff;font-size:15px">&#9638;</span>
        </div>
        <span style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#1a1464">APP &amp; TEST DETAILS</span>
      </div>
      <div style="display:grid;grid-template-columns:${pkg?'1fr 1fr':'1fr'};border:1px solid #eee;border-radius:7px;overflow:hidden;margin-bottom:10px">
        <div style="padding:10px 14px;${pkg?'border-right:1px solid #eee':''}">
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#999;margin-bottom:4px">APP NAME</div>
          <div style="font-size:13.5px;color:#222;font-weight:500">${escHtml(appName||'—')}</div>
        </div>
        ${pkgCell}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #eee;border-radius:7px;overflow:hidden">
        <div style="padding:10px 14px;border-right:1px solid #eee">
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#999;margin-bottom:4px">TESTERS</div>
          <div style="font-size:13.5px;color:#222;font-weight:500">${escHtml(testers)}</div>
        </div>
        <div style="padding:10px 14px">
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#999;margin-bottom:4px">DURATION</div>
          <div style="font-size:13.5px;color:#222;font-weight:500">${escHtml(duration)}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PRICING DETAILS -->
  <div style="padding:0 40px 20px">
    <div style="display:flex;align-items:center;gap:0;margin-bottom:14px">
      <div style="background:#1a1464;color:#fff;display:flex;align-items:center;gap:10px;padding:9px 20px;border-radius:6px 0 0 6px">
        <span style="font-size:16px">&#128203;</span>
        <span style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase">PRICING DETAILS</span>
      </div>
      <div style="flex:1;height:4px;background:linear-gradient(90deg,#1a1464,transparent)"></div>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f5f7fb">
          <th style="padding:12px 16px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a1464;text-align:left;border-bottom:2px solid #eee">DESCRIPTION</th>
          <th style="padding:12px 16px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a1464;text-align:center;border-bottom:2px solid #eee">QTY</th>
          <th style="padding:12px 16px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a1464;text-align:right;border-bottom:2px solid #eee">UNIT PRICE</th>
          <th style="padding:12px 16px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a1464;text-align:right;border-bottom:2px solid #eee">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${svcRows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <table style="width:300px;border-collapse:collapse">
        <tr>
          <td style="padding:8px 16px;font-size:13px;color:#555">Subtotal</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:600;color:#222;text-align:right">${sub>0?fmt(sub,cur):'—'}</td>
        </tr>
        ${discountHTML}
        <tr style="background:#1a1464">
          <td style="padding:10px 16px;font-family:'Montserrat',sans-serif;font-size:13.5px;font-weight:700;color:#fff">Total</td>
          <td style="padding:10px 16px;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:800;color:#fff;text-align:right">${final>0?fmt(final,cur):'—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;font-size:13px;color:#555">Amount Paid</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:600;color:#1B5E20;text-align:right">${final>0?fmt(effectivePaid(),cur):'—'}</td>
        </tr>
        ${extraHTML}
        <tr style="background:${balBg}">
          <td style="padding:10px 16px;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;color:${balColor}">Balance Due</td>
          <td style="padding:10px 16px;font-family:'Montserrat',sans-serif;font-size:15px;font-weight:800;color:${balColor};text-align:right">${final>0?fmt(bal,cur):'—'}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- PAYMENT HISTORY -->
  ${showPH ? `
  <div style="padding:0 40px 20px">
    <div style="display:flex;align-items:center;gap:0;margin-bottom:12px">
      <div style="background:#1B5E20;color:#fff;display:flex;align-items:center;gap:10px;padding:9px 20px;border-radius:6px 0 0 6px">
        <span style="font-size:16px">&#128179;</span>
        <span style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase">PAYMENT HISTORY</span>
      </div>
      <div style="flex:1;height:4px;background:linear-gradient(90deg,#1B5E20,transparent)"></div>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f0faf0">
          <th style="padding:10px 14px;font-family:'Montserrat',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1B5E20;text-align:left;border-bottom:2px solid #c8e6c9;width:36px">#</th>
          <th style="padding:10px 14px;font-family:'Montserrat',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1B5E20;text-align:left;border-bottom:2px solid #c8e6c9">DATE</th>
          <th style="padding:10px 14px;font-family:'Montserrat',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1B5E20;text-align:right;border-bottom:2px solid #c8e6c9">AMOUNT RECEIVED</th>
        </tr>
      </thead>
      <tbody>${phRows}</tbody>
    </table>
  </div>` : ''}

  <!-- NOTES + SIGNATURE -->
  <div style="padding:4px 40px 24px;display:grid;grid-template-columns:1fr 1px 1fr;gap:0;align-items:center;margin-top:auto">
    <div style="padding-right:28px">${notesHTML}</div>
    <div style="background:#ddd;height:100%;min-height:80px"></div>
    <div style="padding-left:28px;text-align:center">
      <div style="font-family:'Caveat',cursive;font-weight:700;font-size:42px;color:#1a1464;line-height:1.1">Aaditya Kumar</div>
      <div style="border-bottom:2px solid #4CAF50;margin:4px 20px 10px"></div>
      <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:13px;color:#1a1464">Aaditya Kumar</div>
      <div style="font-size:12px;color:#555;margin-top:2px">Founder, We App Testers</div>
      <div style="font-size:11px;color:#999;margin-top:1px">Authorized Signatory</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div style="border-top:1.5px dashed #ddd;padding:14px 40px;text-align:center">
    <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12.5px;color:#1a1464;margin-bottom:6px">Generated by We App Testers</div>
    <div style="display:flex;justify-content:center;align-items:center;gap:24px;font-size:12px;color:#555">
      <span>&#127760; www.weapptesters.com</span>
      <span style="color:#ccc">|</span>
      <span>&#128222; +91 9122061839</span>
    </div>
  </div>

</div>
</body>
</html>`;
}

/* ── PDF Download — uses print dialog (fast, no corruption) ── */
function downloadPDF() {
  /* Validate first */
  const errors = validateForm();
  if (errors.length > 0) { showErrors(errors); return; }
  clearErrors();

  const btn = document.getElementById('btn-download');
  if (btn) { btn.textContent = '⏳ Opening PDF...'; btn.disabled = true; }

  const invoiceHTML = buildInvoiceHTML();

  /* Open in new tab and trigger print — browser saves as PDF */
  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) {
    alert('Pop-up blocked! Please allow pop-ups for this site and try again.');
    if (btn) { btn.textContent = '⬇ Download Invoice PDF'; btn.disabled = false; }
    return;
  }

  printWin.document.open();
  printWin.document.write(invoiceHTML);
  printWin.document.close();

  /* Wait for fonts to load then print */
  printWin.onload = function() {
    setTimeout(() => {
      printWin.focus();
      printWin.print();
      if (btn) { btn.textContent = '⬇ Download Invoice PDF'; btn.disabled = false; }
    }, 800);
  };

  /* Fallback if onload doesn't fire */
  setTimeout(() => {
    if (btn && btn.disabled) {
      btn.textContent = '⬇ Download Invoice PDF';
      btn.disabled = false;
    }
  }, 4000);
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
  document.getElementById('inp-testers').value = '';
  document.getElementById('inp-duration').value = '';
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

/* ── Init ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  /* Date default */
  const dateInp = document.getElementById('inp-date');
  if (dateInp) dateInp.value = todayISO();

  /* Invoice number — year autofill */
  const p3 = document.getElementById('inp-inv-p3');
  if (p3) p3.value = new Date().getFullYear();
  ['inp-inv-p1','inp-inv-p2','inp-inv-p3'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const prev = document.getElementById('inv-num-preview');
      if (prev) prev.textContent = buildInvNum();
    });
  });
  const prev = document.getElementById('inv-num-preview');
  if (prev) prev.textContent = buildInvNum();

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
    state.payments.push({ date:todayISO(), amount:'' });
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

  /* Download */
  document.getElementById('btn-download')?.addEventListener('click', downloadPDF);

  /* Reset */
  document.getElementById('btn-reset')?.addEventListener('click', resetForm);

  /* Default service */
  addService('14day');
});
