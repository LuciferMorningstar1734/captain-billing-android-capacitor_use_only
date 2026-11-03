(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, html) => Object.assign(document.createElement(tag), props, html != null ? { innerHTML: html } : {});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = n => '₹' + Calc.num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDate = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : (d || ''); };
  const RM = Calc.DEFAULT_RATE_MAP;                       // same fixed shortcut table as the Windows app (1 -> 1.5 …)

  /* ── state: everything comes from Firestore; nothing is stored in the app itself ─── */
  const DEFAULTS = { bizName: 'Captain Billing', bizTagline: '', bizGST: '', billNoStart: '0001', gstBillPrefix: 'GST-', nonGstBillPrefix: 'NGST-',
    billPrefixPosition: 'front', pdfPhone: '', pdfEmail: '', pdfAddress: '', pdfUpiId: '', pdfTerms: '', sheetTypes: [], priceLists: [], customerPriceListMap: {} };
  let user = null, bills = [], settings = Object.assign({}, DEFAULTS), contacts = {}, unsubs = [];
  let sync = { fromCache: false, pending: false, error: '' };
  const LK = 'cb.gst.defaults';                           // per-phone convenience only
  const lread = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lwrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600); }
  const fail = what => e => { console.error(what, e); toast(`${what}: ${(e && e.message) || e}`); };

  /* ── navigation ───────────────────────────────────────────────────────────── */
  let view = 'loading', draft = null;
  const TITLES = { loading: 'Captain Billing', login: 'Captain Billing', list: null, edit: null, settings: 'Settings' };
  function show(v, push = true) {
    view = v;
    ['loading', 'login', 'list', 'edit', 'settings'].forEach(n => $('#view-' + n).classList.toggle('hidden', n !== v));
    const app = v === 'list' || v === 'edit' || v === 'settings';
    $('#backBtn').classList.toggle('hidden', !(v === 'edit' || v === 'settings'));
    $('#settingsBtn').classList.toggle('hidden', v !== 'list');
    $('#fab').classList.toggle('hidden', v !== 'list');
    $('#title').textContent = TITLES[v] || (v === 'list' ? settings.bizName || 'Captain Billing' : (draft && draft._isNew ? 'New bill' : 'Edit bill'));
    if (push && app && v !== 'list') history.pushState({ v }, '');
    window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', () => { if (user && (view === 'edit' || view === 'settings')) { show('list', false); renderList(); } });
  $('#backBtn').onclick = () => history.back();

  /* ── auth ─────────────────────────────────────────────────────────────────── */
  $('#googleBtn').onclick = async () => {
    const b = $('#googleBtn'), err = $('#loginErr'); err.classList.add('hidden'); b.disabled = true; b.textContent = 'Signing in…';
    try { await Cloud.signIn(); }
    catch (e) { const m = String((e && e.message) || e); if (!/cancel|closed|popup/i.test(m)) { err.textContent = m; err.classList.remove('hidden'); } }
    b.disabled = false; b.textContent = 'Sign in with Google';
  };
  $('#logoutBtn').onclick = async () => { if (confirm('Sign out of this phone? Your data stays safe in the cloud.')) { await Cloud.logout(); } };

  function startSession(u) {
    user = u; bills = []; contacts = {}; settings = Object.assign({}, DEFAULTS); sync = { fromCache: true, pending: false, error: '' };
    const onErr = e => { sync.error = (e && e.code === 'permission-denied') ? 'Cloud denied access — check the Firestore rules for this account.' : String((e && e.message) || e); renderSync(); };
    unsubs = [
      Cloud.watchBills(u.uid, (list, meta) => {
        bills = list.map(r => { const b = Calc.normalizeBill(r, RM); if (b) { b._pending = r._pending; b._raw = r; } return b; }).filter(Boolean);
        sync.fromCache = meta.fromCache; sync.pending = meta.pending; sync.error = ''; renderSync();
        if (view === 'list') renderList();
      }, onErr),
      Cloud.watchSettings(u.uid, s => { settings = Object.assign({}, DEFAULTS, s); if (view === 'list') { $('#title').textContent = settings.bizName || 'Captain Billing'; } }, onErr),
      Cloud.watchContacts(u.uid, c => { contacts = c || {}; }, onErr),
    ];
    show('list', false); renderList(); renderSync();
  }
  function endSession() { unsubs.forEach(f => { try { f(); } catch {} }); unsubs = []; user = null; bills = []; draft = null; show('login', false); }

  function renderSync() {
    const n = $('#syncLine'); if (!n) return;
    const online = navigator.onLine !== false;
    let cls = '', txt;
    if (sync.error) { cls = 'bad'; txt = sync.error; }
    else if (!online) { cls = 'off'; txt = 'Offline — changes are saved on this phone and will sync automatically'; }
    else if (sync.pending) { cls = 'off'; txt = 'Syncing…'; }
    else if (sync.fromCache) { cls = 'off'; txt = 'Connecting to cloud…'; }
    else txt = `Synced · ${user ? user.email : ''}`;
    n.className = 'sync muted ' + cls; n.innerHTML = `<i></i>${esc(txt)}`;
  }
  window.addEventListener('online', renderSync); window.addEventListener('offline', renderSync);

  /* ── list ─────────────────────────────────────────────────────────────────── */
  let filter = 'all', fy = '';
  function renderList() {
    const fys = [...new Set(bills.map(b => b.financialYear.label).concat(Calc.financialYear().label))].sort().reverse();
    if (!fy || !fys.includes(fy)) fy = fys[0];
    $('#fySel').innerHTML = fys.map(f => `<option ${f === fy ? 'selected' : ''}>${f}</option>`).join('');
    const inFy = bills.filter(b => b.financialYear.label === fy);
    const billed = inFy.reduce((s, b) => s + Calc.num(b.grandTotal), 0), recd = inFy.reduce((s, b) => s + b.payment.paidAmount, 0);
    $('#summary').innerHTML = `<div><small>Billed</small><b>${inr(billed)}</b></div><div><small>Received</small><b>${inr(recd)}</b></div><div><small>Due</small><b>${inr(billed - recd)}</b></div>`;
    const q = $('#search').value.trim().toLowerCase();
    const rows = inFy.filter(b => (filter === 'all' || b.payment.status === filter) && (!q || (b.customerName + ' ' + b.billNumber).toLowerCase().includes(q)))
      .sort((a, b) => (b.billDate || '').localeCompare(a.billDate || '') || String(b.billNumber).localeCompare(String(a.billNumber), undefined, { numeric: true }) * -1);
    $('#billList').innerHTML = rows.map(b => `
      <div class="bill" data-id="${esc(b.id)}">
        <div class="l"><div class="name">${esc(b.customerName)}</div>
          <div class="meta">${esc(b.billNumber)} · ${fmtDate(b.billDate)}${b.taxMode === 'gst' ? ' · GST' : ''}${b._pending ? ' <span class="pend">● pending</span>' : ''}</div></div>
        <div class="r"><b>${inr(b.grandTotal)}</b><br><span class="badge ${b.payment.status}">${b.payment.status === 'partial' ? 'DUE ' + inr(b.payment.balance) : b.payment.status.toUpperCase()}</span></div>
      </div>`).join('');
    $('#emptyMsg').classList.toggle('hidden', bills.length > 0);
  }
  $('#billList').onclick = e => { const c = e.target.closest('.bill'); if (c) openEditor(bills.find(b => b.id === c.dataset.id)); };
  $('#search').oninput = renderList;
  $('#fySel').onchange = e => { fy = e.target.value; renderList(); };
  $('#chips').onclick = e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f;
    document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b)); renderList(); };

  /* ── editor ───────────────────────────────────────────────────────────────── */
  const gstDefaults = () => lread(LK, { cgst: 9, sgst: 9 });
  const blankItem = () => ({ date: draft ? draft.billDate : today(), cardType: '', rateValue: '', quantity: '', extra: '', amount: '0.00' });
  const nextNo = () => Calc.nextBillNumber(bills, draft.gst.enabled ? 'gst' : 'non-gst', draft.billDate, settings);

  function openEditor(bill) {
    if (bill) { draft = JSON.parse(JSON.stringify(Object.assign({}, bill, { _raw: undefined }))); draft._isNew = false; if (!draft.items.length) draft.items.push(blankItem()); }
    else {
      const g = gstDefaults();
      draft = { id: 'bill_' + Date.now(), _isNew: true, billNumber: '', customerName: '', custPhone: '', custGST: '', billDate: today(), items: [],
        discount: { enabled: false, mode: 'pct', value: 0 }, gst: { enabled: false, cgst: g.cgst, sgst: g.sgst }, payment: { status: 'unpaid', paidAmount: 0 } };
      draft.items.push(blankItem()); draft.billNumber = nextNo();
    }
    fillForm(); show('edit');
  }

  function fillForm() {
    $('#f-number').value = draft.billNumber; $('#f-date').value = draft.billDate; $('#f-name').value = draft.customerName === 'Unnamed' ? '' : draft.customerName;
    $('#f-phone').value = draft.custPhone; $('#f-gstin').value = draft.custGST;
    $('#disc-on').checked = draft.discount.enabled; $('#disc-val').value = draft.discount.value || '';
    $('#disc-pct').classList.toggle('on', draft.discount.mode === 'pct'); $('#disc-rs').classList.toggle('on', draft.discount.mode === 'rs');
    $('#gst-on').checked = draft.gst.enabled; $('#cgst').value = draft.gst.cgst; $('#sgst').value = draft.gst.sgst;
    $('#pay-amt').value = draft.payment.status === 'partial' ? draft.payment.paidAmount || '' : '';
    $('#delBtn').classList.toggle('hidden', draft._isNew);
    const names = new Set(Object.keys(contacts)); bills.forEach(b => names.add(b.customerName));
    $('#custList').innerHTML = [...names].filter(Boolean).sort().map(n => `<option value="${esc(n)}">`).join('');
    $('#itemList').innerHTML = (settings.sheetTypes || []).map(t => `<option value="${esc(t.name)}">`).join('');
    renderItems(); totals();
  }

  function renderItems() {
    const box = $('#items'); box.innerHTML = '';
    draft.items.forEach((it, i) => {
      const c = el('div', { className: 'item' }, `
        <div class="top"><label>Item<input data-k="cardType" list="itemList" value="${esc(it.cardType)}" placeholder="Item / description"></label>
          <div class="amt" data-amt>${inr(it.amount)}</div></div>
        <div class="grid">
          <label>Rate<input data-k="rateValue" value="${esc(it.rateValue)}" inputmode="decimal" placeholder="0"></label>
          <label>Qty<input data-k="quantity" value="${esc(it.quantity)}" inputmode="decimal" placeholder="0"></label>
          <label>Extra ₹<input data-k="extra" value="${esc(it.extra)}" inputmode="decimal" placeholder="0"></label>
        </div>
        <div class="grid" style="grid-template-columns:1fr auto;align-items:end"><label style="margin:0">Date<input data-k="date" type="date" value="${esc(it.date)}"></label>
          <button class="del" data-del>Remove</button></div>`);
      const rateInp = c.querySelector('[data-k=rateValue]');
      c.addEventListener('input', e => {
        const k = e.target.dataset.k; if (!k) return;
        it[k] = e.target.value; Calc.recalc(draft, RM); c.querySelector('[data-amt]').textContent = inr(it.amount); totals();
      });
      c.addEventListener('focusout', e => {
        const k = e.target.dataset.k;
        if (k === 'rateValue') { const r = Calc.resolveRate(it.rateValue, RM); if (r !== it.rateValue) { it.rateValue = r; e.target.value = r; } }
        if (k === 'cardType') {                           // shortcut key -> full name, then default price from the customer's price list
          const full = Calc.expandItemKey(settings, it.cardType); if (full !== it.cardType) { it.cardType = full; e.target.value = full; }
          if (!String(it.rateValue).trim()) { const pr = Calc.getPriceForItem(settings, draft.customerName, it.cardType); if (pr != null) { it.rateValue = String(pr); rateInp.value = it.rateValue; } }
        }
        Calc.recalc(draft, RM); c.querySelector('[data-amt]').textContent = inr(it.amount); totals();
      });
      c.querySelector('[data-del]').onclick = () => { draft.items.splice(i, 1); if (!draft.items.length) draft.items.push(blankItem()); renderItems(); totals(); };
      box.appendChild(c);
    });
  }
  $('#addItem').onclick = () => { draft.items.push(blankItem()); renderItems(); const l = $('#items').lastElementChild; l && l.querySelector('input').focus(); };

  function totals() {
    Calc.recalc(draft, RM);
    $('#t-sub').textContent = inr(draft.subtotal);
    $('#disc-box').classList.toggle('hidden', !draft.discount.enabled);
    $('#t-disc').textContent = draft.discount.enabled ? '− ' + inr(draft.discount.amount) : '';
    $('#gst-box').classList.toggle('hidden', !draft.gst.enabled);
    $('#t-gst').textContent = draft.gst.enabled ? `CGST ${inr(draft.gst.cgstAmt)} + SGST ${inr(draft.gst.sgstAmt)}` : '';
    $('#t-grand').textContent = inr(draft.grandTotal);
    $('#pay-box').classList.toggle('hidden', draft.payment.status !== 'partial');
    document.querySelectorAll('#payStatus button').forEach(b => b.classList.toggle('on', b.dataset.s === draft.payment.status));
    $('#t-bal').textContent = inr(draft.payment.balance);
    $('#balLine').classList.toggle('hidden', draft.payment.status === 'paid');
  }
  function renumberIfNew() { if (draft._isNew) { draft.billNumber = nextNo(); $('#f-number').value = draft.billNumber; } }

  $('#f-number').oninput = e => draft.billNumber = e.target.value.trim();
  $('#f-date').onchange = e => { draft.billDate = e.target.value; draft.financialYear = Calc.financialYear(draft.billDate); renumberIfNew(); };
  $('#f-name').oninput = e => { draft.customerName = e.target.value; };
  $('#f-name').onchange = e => {                          // known customer -> fill phone (cloud contacts first, then their last bill) and GSTIN
    const name = e.target.value.trim(), low = name.toLowerCase();
    const cKey = Object.keys(contacts).find(k => k.toLowerCase() === low);
    const prev = [...bills].reverse().find(b => b.customerName.toLowerCase() === low);
    if (!$('#f-phone').value) { const ph = (cKey && contacts[cKey]) || (prev && prev.custPhone) || ''; $('#f-phone').value = draft.custPhone = ph; }
    if (prev && !$('#f-gstin').value) { $('#f-gstin').value = draft.custGST = prev.custGST || ''; }
  };
  $('#f-phone').oninput = e => draft.custPhone = e.target.value.trim();
  $('#f-gstin').oninput = e => draft.custGST = e.target.value.trim().toUpperCase();
  $('#disc-on').onchange = e => { draft.discount.enabled = e.target.checked; totals(); };
  $('#disc-val').oninput = e => { draft.discount.value = e.target.value; totals(); };
  $('#disc-pct').onclick = () => { draft.discount.mode = 'pct'; $('#disc-pct').classList.add('on'); $('#disc-rs').classList.remove('on'); totals(); };
  $('#disc-rs').onclick = () => { draft.discount.mode = 'rs'; $('#disc-rs').classList.add('on'); $('#disc-pct').classList.remove('on'); totals(); };
  $('#gst-on').onchange = e => { draft.gst.enabled = e.target.checked; renumberIfNew(); totals(); };
  $('#cgst').oninput = e => { draft.gst.cgst = e.target.value; totals(); };
  $('#sgst').oninput = e => { draft.gst.sgst = e.target.value; totals(); };
  $('#payStatus').onclick = e => { const b = e.target.closest('button'); if (!b) return; draft.payment.status = b.dataset.s;
    if (b.dataset.s === 'partial') draft.payment.paidAmount = Calc.num($('#pay-amt').value); totals(); };
  $('#pay-amt').oninput = e => { draft.payment.paidAmount = Calc.num(e.target.value); totals(); };

  /** Validate + write to Firestore. Not awaited: offline, Firestore queues the write and the list already shows it. */
  function commit() {
    const clean = draft.items.filter(i => i.cardType || i.rateValue || i.quantity || i.extra);
    if (!clean.length) { toast('Add at least one item'); return null; }
    if (!draft.customerName.trim()) { toast('Enter the customer name'); return null; }
    draft.items = clean; draft.financialYear = Calc.financialYear(draft.billDate);
    const dup = bills.find(b => b.id !== draft.id && b.billNumber && b.billNumber === draft.billNumber && b.financialYear.label === draft.financialYear.label && (b.taxMode === draft.taxMode));
    if (dup && !confirm(`Bill number ${draft.billNumber} is already used by ${dup.customerName}. Save anyway?`)) return null;
    Calc.recalc(draft, RM);
    const isNew = !!draft._isNew, saved = JSON.parse(JSON.stringify(draft)); delete saved._isNew;
    Cloud.saveBill(user.uid, SyncMap.toCloudBill(saved, user, isNew)).catch(fail('Could not sync bill'));
    const nm = saved.customerName.trim(), ph = (saved.custPhone || '').trim();
    if (nm && ph && contacts[nm] !== ph) { contacts[nm] = ph; Cloud.saveContacts(user.uid, { [nm]: ph }).catch(fail('Could not sync contact')); }
    draft._isNew = false; $('#delBtn').classList.remove('hidden');
    return saved;
  }
  $('#saveBtn').onclick = () => { if (commit()) { toast(navigator.onLine === false ? 'Saved — will sync when online' : 'Saved'); history.back(); } };
  $('#shareBtn').onclick = async () => {
    const b = commit(); if (!b) return;
    try { await BillPDF.share(b, settings); } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Could not share: ' + ((e && e.message) || e)); }
  };
  $('#waBtn').onclick = () => {
    const b = commit(); if (!b) return;
    const phone = String(b.custPhone).replace(/\D/g, '');
    if (!phone) { toast('Add the customer phone number first'); return; }
    const full = phone.length === 10 ? '91' + phone : phone;
    const due = b.payment.status === 'paid' ? 'Paid in full. Thank you!' : `Amount due: ${inr(b.payment.balance)}` + (settings.pdfUpiId ? `\nUPI: ${settings.pdfUpiId}` : '');
    location.href = `https://wa.me/${full}?text=${encodeURIComponent(`${settings.bizName}\nBill ${b.billNumber} (${fmtDate(b.billDate)})\nTotal: ${inr(b.grandTotal)}\n${due}`)}`;
  };
  $('#delBtn').onclick = () => {
    if (!confirm(`Delete bill ${draft.billNumber} for ${draft.customerName}? It will be removed on the PC too. This cannot be undone.`)) return;
    Cloud.deleteBill(user.uid, draft.id).catch(fail('Could not delete')); toast('Deleted'); history.back();
  };

  /* ── settings / import / backup ───────────────────────────────────────────── */
  function openSettings() {
    const s = settings, g = gstDefaults();
    $('#acct').textContent = user ? `Signed in as ${user.email}` : '';
    $('#s-biz').value = s.bizName; $('#s-tag').value = s.bizTagline; $('#s-gstin').value = s.bizGST; $('#s-upi').value = s.pdfUpiId;
    $('#s-phone').value = s.pdfPhone; $('#s-email').value = s.pdfEmail; $('#s-addr').value = s.pdfAddress; $('#s-terms').value = s.pdfTerms;
    $('#s-gp').value = s.gstBillPrefix; $('#s-np').value = s.nonGstBillPrefix; $('#s-start').value = s.billNoStart; $('#s-pos').value = s.billPrefixPosition === 'last' ? 'last' : 'front';
    $('#s-cg').value = g.cgst; $('#s-sg').value = g.sgst;
    $('#priceInfo').textContent = `Item list (${(s.sheetTypes || []).length}) and price lists (${(s.priceLists || []).length}) are edited on the PC and sync here.`;
    $('#ver').textContent = `${bills.length} bills in your account`;
    show('settings');
  }
  $('#settingsBtn').onclick = openSettings;
  const pfx = v => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9_\-/]/g, '');
  $('#saveSettings').onclick = () => {
    lwrite(LK, { cgst: Calc.num($('#s-cg').value), sgst: Calc.num($('#s-sg').value) });
    const patch = {                                       // only the fields this screen owns; the PC's other settings (logo, price lists…) are untouched
      bizName: $('#s-biz').value.trim() || 'Captain Billing', bizTagline: $('#s-tag').value.trim(), bizGST: $('#s-gstin').value.trim().toUpperCase(),
      pdfUpiId: $('#s-upi').value.trim(), pdfPhone: $('#s-phone').value.trim(), pdfEmail: $('#s-email').value.trim(),
      pdfAddress: $('#s-addr').value.trim(), pdfTerms: $('#s-terms').value.trim(),
      gstBillPrefix: pfx($('#s-gp').value), nonGstBillPrefix: pfx($('#s-np').value),
      billNoStart: String($('#s-start').value).replace(/\D/g, '') || '0001', billPrefixPosition: $('#s-pos').value === 'last' ? 'last' : 'front' };
    settings = Object.assign({}, settings, patch);
    Cloud.saveSettings(user.uid, patch).catch(fail('Could not sync settings')); toast('Settings saved'); history.back();
  };

  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    let added = 0, updated = 0, bad = 0;
    for (const f of e.target.files) {
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data) ? data : (Array.isArray(data.bills) ? data.bills : [data]);
        list.forEach(raw => {
          const b = Calc.normalizeBill(raw, RM); if (!b) { bad++; return; }
          const exists = bills.some(x => x.id === b.id); if (exists) updated++; else added++;
          Cloud.saveBill(user.uid, SyncMap.toCloudBill(b, user, !exists)).catch(fail('Import sync'));
        });
      } catch { bad++; }
    }
    e.target.value = ''; toast(`Imported ${added} new, ${updated} updated${bad ? `, ${bad} skipped` : ''}`);
  };
  $('#exportBtn').onclick = async () => {
    if (!bills.length) { toast('Nothing to back up yet'); return; }
    const name = `captain-billing-backup-${today()}.json`;
    const json = JSON.stringify({ app: 'captain-billing-android', exported: new Date().toISOString(), bills: bills.map(b => b._raw || b) }, null, 2);
    try { await Cloud.shareFile(name, json, { title: 'Save backup (Drive, WhatsApp, email…)' }); }
    catch (err) { if (!/cancel/i.test(String(err && err.message))) toast('Backup failed: ' + ((err && err.message) || err)); }
  };
  $('#fab').onclick = () => openEditor(null);

  /* ── boot ─────────────────────────────────────────────────────────────────── */
  history.replaceState({ v: 'list' }, '');
  if (typeof Cloud === 'undefined') { $('#view-loading').innerHTML = '<p class="err center" style="margin-top:30vh">App files are incomplete (cloud.js missing).</p>'; return; }
  show('loading', false);
  Cloud.onAuth(u => { if (u) { if (!user || user.uid !== u.uid) startSession(u); } else endSession(); });
  window.__cb = { get bills() { return bills; }, get settings() { return settings; }, get draft() { return draft; } };
})();
