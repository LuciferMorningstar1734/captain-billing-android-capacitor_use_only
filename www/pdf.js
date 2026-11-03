/* PDF generation + sharing. jsPDF's built-in fonts have no ₹ glyph, so the PDF uses "Rs.". */
(function () {
  const money = n => 'Rs. ' + Calc.num(n).toFixed(2);
  const fmtDate = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : (d || ''); };

  function build(bill, s) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, L = 14, R = W - 14;
    let y = 18;

    doc.setFont('helvetica', 'bold').setFontSize(20).text(s.bizName || 'Captain Billing', L, y);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(100);
    if (s.bizTagline) { y += 6; doc.text(s.bizTagline, L, y); }
    if (s.pdfAddress) doc.splitTextToSize(s.pdfAddress, 110).slice(0, 3).forEach(t => { y += 5; doc.text(t, L, y); });
    const contact = [s.pdfPhone, s.pdfEmail].filter(Boolean).join('  |  ');
    if (contact) { y += 5; doc.text(contact, L, y); }
    if (s.bizGST && bill.taxMode === 'gst') { y += 5; doc.text('GSTIN: ' + s.bizGST, L, y); }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold').setFontSize(13).text(bill.taxMode === 'gst' ? 'TAX INVOICE' : 'BILL', R, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal').setFontSize(10);
    doc.text('Bill No: ' + (bill.billNumber || '-'), R, 24, { align: 'right' });
    doc.text('Date: ' + fmtDate(bill.billDate), R, 29, { align: 'right' });

    y = Math.max(y, 29) + 9;
    doc.setDrawColor(200).line(L, y, R, y); y += 7;
    doc.setFont('helvetica', 'bold').text('Billed to: ' + (bill.customerName || ''), L, y);
    doc.setFont('helvetica', 'normal');
    if (bill.custPhone) { y += 5; doc.text('Phone: ' + bill.custPhone, L, y); }
    if (bill.custGST) { y += 5; doc.text('GSTIN: ' + bill.custGST, L, y); }
    y += 8;

    const cols = { date: L + 2, item: L + 28, rate: 128, qty: 148, extra: 168, amt: R - 2 };
    const head = () => {
      doc.setFillColor(15, 118, 110).rect(L, y - 5, R - L, 8, 'F');
      doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(9);
      doc.text('Date', cols.date, y); doc.text('Item', cols.item, y);
      doc.text('Rate', cols.rate, y, { align: 'right' }); doc.text('Qty', cols.qty, y, { align: 'right' });
      doc.text('Extra', cols.extra, y, { align: 'right' }); doc.text('Amount', cols.amt, y, { align: 'right' });
      doc.setTextColor(0).setFont('helvetica', 'normal').setFontSize(10);
      y += 8;
    };
    head();
    bill.items.forEach((it, i) => {
      if (y > 262) { doc.addPage(); y = 20; head(); }
      if (i % 2) { doc.setFillColor(244, 247, 246).rect(L, y - 5, R - L, 7, 'F'); }
      const rate = Calc.resolveRate(it.rateValue, Calc.DEFAULT_RATE_MAP);
      doc.text(fmtDate(it.date), cols.date, y);
      doc.text(doc.splitTextToSize(it.cardType || '', 55)[0] || '', cols.item, y);
      doc.text(rate ? Calc.num(rate).toString() : '', cols.rate, y, { align: 'right' });
      doc.text(String(it.quantity || ''), cols.qty, y, { align: 'right' });
      doc.text(it.extra ? Calc.num(it.extra).toFixed(2) : '', cols.extra, y, { align: 'right' });
      doc.text(Calc.num(it.amount).toFixed(2), cols.amt, y, { align: 'right' });
      y += 7;
    });

    if (y > 225) { doc.addPage(); y = 20; }
    y += 4; doc.setDrawColor(200).line(L, y, R, y); y += 7;
    const row = (label, val, bold) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 10);
      doc.text(label, 130, y); doc.text(val, cols.amt, y, { align: 'right' }); y += bold ? 8 : 6;
    };
    row('Subtotal', money(bill.subtotal));
    if (bill.discount.enabled && bill.discount.amount > 0)
      row('Discount' + (bill.discount.mode === 'pct' ? ` (${bill.discount.value}%)` : ''), '- ' + money(bill.discount.amount));
    if (bill.gst.enabled) {
      row(`CGST (${bill.gst.cgst}%)`, money(bill.gst.cgstAmt));
      row(`SGST (${bill.gst.sgst}%)`, money(bill.gst.sgstAmt));
    }
    doc.setDrawColor(200).line(128, y - 3, R, y - 3); y += 2;
    row('TOTAL', money(bill.grandTotal), true);
    const p = bill.payment;
    if (p.status === 'paid') { doc.setTextColor(6, 118, 71); row('PAID IN FULL', '', true); }
    else if (p.status === 'partial') { row('Received', money(p.paidAmount)); doc.setTextColor(180, 35, 24); row('Balance due', money(p.balance), true); }
    else { doc.setTextColor(180, 35, 24); row('Balance due', money(p.balance), true); }
    doc.setTextColor(0);
    if (s.pdfUpiId && p.status !== 'paid') { y += 4; doc.setFont('helvetica', 'normal').setFontSize(10).text('Pay by UPI: ' + s.pdfUpiId, L, y); }
    if (s.pdfTerms) { y += 10; doc.setFontSize(8).setTextColor(100); doc.splitTextToSize(s.pdfTerms, R - L).slice(0, 6).forEach(t => { if (y > 285) return; doc.text(t, L, y); y += 4; }); doc.setTextColor(0); }
    return doc;
  }

  const safeName = b => `${b.billNumber || 'bill'}_${b.customerName || ''}`.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_') + '.pdf';

  async function share(bill, s) {
    const doc = build(bill, s), name = safeName(bill);
    await Cloud.shareFile(name, doc.output('datauristring').split(',')[1], { base64: true, title: `Bill ${bill.billNumber} - ${bill.customerName}` });
  }

  window.BillPDF = { build, share, safeName };
})();
