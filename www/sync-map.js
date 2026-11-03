/* Pure mapping between the app's bill objects and the Firestore documents the Windows app uses. No Firebase here. */
(function (root) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Same format as desktop buildBillName(): Customer_Mon_YYYY */
  function buildBillName(customer, isoDate) {
    const cust = String(customer || 'Unnamed').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Unnamed';
    const p = String(isoDate || '').split('-');
    const out = [cust];
    if (p.length === 3 && p[0].length === 4) {
      const m = parseInt(p[1], 10) - 1, y = parseInt(p[0], 10);
      if (m >= 0 && m <= 11 && y > 1900) { out.push(MONTHS[m], String(y)); }
    }
    return out.join('_');
  }

  const safeSeg = (v, fb) => (String(v || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || fb);

  function localUser(user) {
    const label = (user && (user.displayName || user.email)) || 'Local User';
    return { uid: (user && user.uid) || '', email: (user && user.email) || '', label, folder: safeSeg(label, 'Local_User') };
  }

  /** Firestore rejects `undefined`; also drop UI-only keys (those starting with "_"). */
  function clean(obj) {
    return JSON.parse(JSON.stringify(obj, (k, v) => (k && k[0] === '_' ? undefined : v)));
  }

  /**
   * Document to write for a bill. Written with {merge:true}, so any field the desktop app stores that we
   * don't know about (localUser, etc.) is left untouched on bills that already exist.
   */
  function toCloudBill(bill, user, isNew) {
    const b = clean(bill);
    b.billName = buildBillName(b.customerName, b.billDate);
    if (isNew) b.localUser = localUser(user);   // never rewrite the owner info of a bill that already exists
    else delete b.localUser;
    b.lastModified = new Date().toLocaleString();
    delete b.subtotal;          // derived locally; desktop doesn't store it
    delete b.updatedAt;         // set by serverTimestamp() in cloud.js
    return b;
  }

  /** Firestore document -> plain bill (Timestamps stripped, id guaranteed). */
  function fromCloudDoc(data, docId) {
    const b = Object.assign({}, data);
    delete b.updatedAt;
    b.id = b.id || docId;
    return b;
  }

  const api = { buildBillName, localUser, clean, toCloudBill, fromCloudDoc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SyncMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
