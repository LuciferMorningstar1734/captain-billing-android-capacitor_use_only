/* Pure billing logic — no DOM. Same bill shape as the Windows app (.lbb files). */
(function (root) {
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

  const DEFAULT_RATE_MAP = { '1': '1.5', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8' };

  function resolveRate(raw, map) {
    raw = String(raw == null ? '' : raw).trim();
    return (map && map[raw] != null) ? map[raw] : raw;
  }

  function itemAmount(item, map) {
    return r2(num(resolveRate(item.rateValue, map)) * num(item.quantity) + num(item.extra));
  }

  /** Recompute every derived number on a bill. Mutates and returns the bill. */
  function recalc(bill, map) {
    bill.items.forEach(it => { it.amount = itemAmount(it, map).toFixed(2); });
    const subtotal = r2(bill.items.reduce((s, it) => s + num(it.amount), 0));

    const d = bill.discount || (bill.discount = { enabled: false, mode: 'pct', value: 0 });
    let discAmt = 0;
    if (d.enabled && num(d.value) > 0) {
      discAmt = d.mode === 'pct'
        ? r2(subtotal * Math.min(num(d.value), 100) / 100)
        : r2(Math.min(num(d.value), subtotal));
    }
    const after = r2(subtotal - discAmt);
    d.amount = discAmt; d.afterDiscount = after;

    const g = bill.gst || (bill.gst = { enabled: false, cgst: 9, sgst: 9 });
    g.cgstAmt = g.enabled ? r2(after * num(g.cgst) / 100) : 0;
    g.sgstAmt = g.enabled ? r2(after * num(g.sgst) / 100) : 0;
    g.grandWithGST = g.enabled ? r2(after + g.cgstAmt + g.sgstAmt) : after;

    const total = g.enabled ? g.grandWithGST : after;
    bill.subtotal = subtotal;
    bill.grandTotal = String(total);
    bill.taxMode = g.enabled ? 'gst' : 'non-gst';

    const p = bill.payment || (bill.payment = { status: 'unpaid', paidAmount: 0 });
    let paid = 0;
    if (p.status === 'paid') paid = total;
    else if (p.status === 'partial') paid = Math.min(num(p.paidAmount), total);
    p.paidAmount = r2(paid); p.totalAmount = total; p.balance = r2(total - paid);
    return bill;
  }

  function financialYear(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const ok = !isNaN(d.getTime());
    const y = ok ? d.getFullYear() : new Date().getFullYear();
    const m = ok ? d.getMonth() + 1 : new Date().getMonth() + 1;
    const start = m >= 4 ? y : y - 1;
    return { startYear: start, endYear: start + 1, label: `${start}-${String(start + 1).slice(-2)}`,
             folder: `fy_${start}_${String(start + 1).slice(-2)}` };
  }

  const escRe = x => String(x).replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  const cleanPrefix = (v, fb) => { const c = String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9_\-/]/g, ''); return c; };

  /** Same rules as the Windows app: per financial year + tax mode, width = length of "start" setting, prefix front/last. */
  function nextBillNumber(bills, mode, dateStr, s) {
    s = s || {};
    const fy = financialYear(dateStr).label;
    const startRaw = String(s.billNoStart || '0001').replace(/\D/g, '') || '0001';
    const start = Math.max(1, parseInt(startRaw, 10) || 1);
    const prefix = mode === 'gst'
      ? cleanPrefix(s.gstBillPrefix === undefined ? 'GST-' : s.gstBillPrefix)
      : cleanPrefix(s.nonGstBillPrefix === undefined ? 'NGST-' : s.nonGstBillPrefix);
    const re = escRe(prefix);
    let max = start - 1;
    bills.forEach(b => {
      if ((b.taxMode || (b.gst && b.gst.enabled ? 'gst' : 'non-gst')) !== mode) return;
      const bfy = (b.financialYear && b.financialYear.label) || financialYear(b.billDate).label;
      if (bfy !== fy) return;
      const raw = String(b.billNumber || '').trim();
      const m = (prefix ? raw.match(new RegExp('^' + re + '(\\d+)$', 'i')) : raw.match(/^(\d+)$/))
             || (prefix ? raw.match(new RegExp('^(\\d+)' + re + '$', 'i')) : null)
             || raw.match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    });
    const n = String(Math.max(max + 1, start)).padStart(Math.max(startRaw.length, 1), '0');
    return s.billPrefixPosition === 'last' ? n + prefix : prefix + n;
  }

  /** Default price for an item: customer's price list first, then the item sheet (same as desktop getPriceForItem). */
  function getPriceForItem(settings, customerName, itemName) {
    const item = String(itemName || '').trim().toLowerCase();
    if (!item) return null;
    const cust = String(customerName || '').trim().toLowerCase();
    const map = (settings && settings.customerPriceListMap) || {};
    if (cust && map[cust]) {
      const pl = ((settings.priceLists) || []).find(p => String(p.name).toLowerCase() === String(map[cust]).toLowerCase());
      if (pl && pl.prices && pl.prices[item] != null) return pl.prices[item];
    }
    const t = ((settings && settings.sheetTypes) || []).find(x => String(x.name).toLowerCase() === item);
    return t && t.price !== '' && t.price != null ? t.price : null;
  }

  /** If text equals an item shortcut key (e.g. "v" -> "Visiting card"), return the full name. */
  function expandItemKey(settings, text) {
    const t = String(text || '').trim().toLowerCase();
    const hit = t && ((settings && settings.sheetTypes) || []).find(x => x.key && String(x.key).toLowerCase() === t);
    return hit ? hit.name : text;
  }

  function parseRateMap(text) {
    const map = {};
    String(text || '').split(/[\n,;]+/).forEach(p => {
      const [k, v] = p.split('=').map(x => (x || '').trim());
      if (k && v && isFinite(parseFloat(v))) map[k] = v;
    });
    return map;
  }
  const rateMapToText = map => Object.entries(map).map(([k, v]) => `${k}=${v}`).join(', ');

  /** Accept a bill from the Windows app / a backup and fill any missing fields. */
  function normalizeBill(raw, map) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return null;
    const b = {
      id: raw.id || 'bill_' + Date.now() + Math.random().toString(36).slice(2, 6),
      billNumber: raw.billNumber || '',
      customerName: raw.customerName || 'Unnamed',
      custPhone: raw.custPhone || '', custGST: raw.custGST || '',
      billDate: raw.billDate || new Date().toISOString().slice(0, 10),
      items: raw.items.map(i => ({ date: i.date || '', cardType: i.cardType || '', rateValue: String(i.rateValue ?? ''),
                                   quantity: String(i.quantity ?? ''), extra: String(i.extra ?? ''), amount: '0.00' })),
      discount: Object.assign({ enabled: false, mode: 'pct', value: 0 }, raw.discount),
      gst: Object.assign({ enabled: false, cgst: 9, sgst: 9 }, raw.gst),
      payment: Object.assign({ status: 'unpaid', paidAmount: 0 }, raw.payment),
      lastModified: raw.lastModified || new Date().toISOString()
    };
    b.financialYear = financialYear(b.billDate);
    return recalc(b, map);
  }

  const api = { r2, num, DEFAULT_RATE_MAP, resolveRate, itemAmount, recalc, financialYear,
                nextBillNumber, getPriceForItem, expandItemKey, parseRateMap, rateMapToText, normalizeBill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
