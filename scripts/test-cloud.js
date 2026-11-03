const M = require('../www/sync-map.js'); const assert = require('assert');
assert.equal(M.buildBillName('Ravi  Traders/', '2026-10-21'), 'Ravi_Traders_Oct_2026');   // matches desktop buildBillName
assert.equal(M.buildBillName('', ''), 'Unnamed');
const user = { uid: 'u1', email: 'a@b.com', displayName: 'Ayush L' };
assert.deepEqual(M.localUser(user), { uid: 'u1', email: 'a@b.com', label: 'Ayush L', folder: 'Ayush_L' });
const bill = { id: 'bill_1', _pending: true, customerName: 'Ravi', billDate: '2026-10-21', subtotal: 5, note: undefined, items: [{ cardType: 'x' }] };
const out = M.toCloudBill(bill, user, true);
assert.ok(!('_pending' in out) && !('subtotal' in out) && !('note' in out), 'UI-only / derived / undefined fields are stripped');
assert.equal(out.billName, 'Ravi_Oct_2026'); assert.equal(out.localUser.uid, 'u1');
// an existing bill keeps the original owner info
assert.ok(!('localUser' in M.toCloudBill(bill, user, false)), 'existing bill: owner info is not rewritten (merge keeps the original)');
// Firestore Timestamp-bearing docs come back clean
const back = M.fromCloudDoc({ billNumber: 'X', updatedAt: { seconds: 1 } }, 'docid');
assert.deepEqual(back, { billNumber: 'X', id: 'docid' });
console.log('all cloud-mapping tests passed');
