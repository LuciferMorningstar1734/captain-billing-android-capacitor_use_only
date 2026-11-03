const C = require('../www/calc.js'); const assert = require('assert');
const map = C.DEFAULT_RATE_MAP;
// rate shorthand: "1" => 1.5
const b = C.normalizeBill({ billDate: '2026-10-21', items: [
  { rateValue: '1', quantity: '10' },            // 15
  { rateValue: '3', quantity: '4', extra: '5' }, // 17
  { rateValue: '2.75', quantity: '2' }           // 5.5
]}, map);
assert.equal(b.subtotal, 37.5); assert.equal(b.grandTotal, '37.5'); assert.equal(b.taxMode, 'non-gst');
// % discount + GST 9/9
b.discount = { enabled: true, mode: 'pct', value: 10 }; b.gst = { enabled: true, cgst: 9, sgst: 9 };
C.recalc(b, map);
assert.equal(b.discount.amount, 3.75); assert.equal(b.discount.afterDiscount, 33.75);
assert.equal(b.gst.cgstAmt, 3.04); assert.equal(b.gst.grandWithGST, 39.83); assert.equal(b.taxMode, 'gst');
// flat discount is capped at subtotal; partial payment is capped at total
b.gst.enabled = false; b.discount = { enabled: true, mode: 'rs', value: 999 }; b.payment = { status: 'partial', paidAmount: 5 };
C.recalc(b, map); assert.equal(b.discount.afterDiscount, 0); assert.equal(b.payment.balance, 0);
// financial year boundary
assert.equal(C.financialYear('2026-03-31').label, '2025-26'); assert.equal(C.financialYear('2026-04-01').label, '2026-27');
// numbering = same rules as the Windows app (main.js nextBillNumber)
const s = { gstBillPrefix: 'GST-', nonGstBillPrefix: 'NGST-', billNoStart: '0001', billPrefixPosition: 'front' };
const bills = [{ billNumber: 'NGST-0007', taxMode: 'non-gst', billDate: '2026-05-01' }, { billNumber: 'GST-0003', taxMode: 'gst', billDate: '2026-05-01' }];
assert.equal(C.nextBillNumber(bills, 'non-gst', '2026-10-21', s), 'NGST-0008');   // width 4 from "0001"
assert.equal(C.nextBillNumber(bills, 'gst', '2026-10-21', s), 'GST-0004');
assert.equal(C.nextBillNumber(bills, 'non-gst', '2027-04-02', s), 'NGST-0001');   // new FY restarts
assert.equal(C.nextBillNumber(bills, 'gst', '2026-10-21', { ...s, billPrefixPosition: 'last' }), '0004GST-');
assert.equal(C.nextBillNumber([{ billNumber: '07GST-', taxMode: 'gst', billDate: '2026-05-01' }], 'gst', '2026-06-01', { ...s, billNoStart: '01', billPrefixPosition: 'last' }), '08GST-');
assert.equal(C.nextBillNumber([], 'gst', '2026-06-01', { ...s, billNoStart: '100' }), 'GST-100');
assert.equal(C.nextBillNumber([], 'non-gst', '2026-06-01', { nonGstBillPrefix: '' }), '0001');
// price lists: customer list beats the item sheet; unknown -> null; shortcut keys expand
const st = { sheetTypes: [{ key: 'v', name: 'Visiting card', price: '2' }, { key: 'f', name: 'Flex', price: '' }],
             priceLists: [{ name: 'Wholesale', prices: { 'visiting card': 1.2 } }], customerPriceListMap: { 'ravi traders': 'Wholesale' } };
assert.equal(C.getPriceForItem(st, 'Ravi Traders', 'Visiting Card'), 1.2);
assert.equal(C.getPriceForItem(st, 'Someone Else', 'visiting card'), '2');
assert.equal(C.getPriceForItem(st, 'x', 'Flex'), null); assert.equal(C.getPriceForItem(st, 'x', 'nope'), null);
assert.equal(C.expandItemKey(st, 'V'), 'Visiting card'); assert.equal(C.expandItemKey(st, 'hello'), 'hello');
// rate map text round trip
assert.deepEqual(C.parseRateMap('1=1.5, 2=2\n9=x'), { '1': '1.5', '2': '2' });
assert.equal(C.normalizeBill({ nope: 1 }), null);
console.log('all calc tests passed');
