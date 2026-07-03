// ============================================================
//  pos-client/src/components/ReceiptModal.jsx
// ============================================================
import { useRef } from 'react';

// Plain-text receipt summary shared by WhatsApp/Email sharing
const buildReceiptText = (sale, fmtCur, cashierName) => {
  const lines = [
    'FINSUITE POS',
    `Receipt: ${sale.saleNumber}`,
    new Date().toLocaleString('en-GB'),
    cashierName ? `Cashier: ${cashierName}` : null,
    '',
    ...(sale.items || []).map(item =>
      `${item.quantity} x ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} - ${fmtCur(item.lineTotal || item.unitPrice * item.quantity)}`
    ),
    '',
    sale.discountAmount > 0 ? `Discount: -${fmtCur(sale.discountAmount)}` : null,
    `Total: ${fmtCur(sale.total)}`,
    sale.amountTendered ? `Paid: ${fmtCur(sale.amountTendered)}` : null,
    (sale.changeGiven > 0) ? `Change: ${fmtCur(sale.changeGiven)}` : null,
    (sale.payments && sale.payments.length > 0)
      ? `Payment (split):\n${sale.payments.map(p => `  ${p.method.replace('_', ' ').toUpperCase()}: ${fmtCur(p.amount)}`).join('\n')}`
      : sale.paymentMethod ? `Payment: ${sale.paymentMethod.replace('_', ' ').toUpperCase()}` : null,
    '',
    'Thank you for shopping with us!',
  ].filter(Boolean);
  return lines.join('\n');
};

export default function ReceiptModal({ sale, fmtCur, cashier, onClose }) {
  const printRef = useRef();
  const cashierName = cashier
    ? `${cashier.first_name || ''} ${cashier.last_name || ''}`.trim()
    : '';

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win     = window.open('', '_blank', 'width=400');
    win.document.write(`
      <html><head>
        <title>Receipt ${sale.saleNumber}</title>
        <style>
          body{font-family:monospace;font-size:12px;
               width:300px;margin:0 auto;padding:10px}
          .center{text-align:center}
          .line{border-top:1px dashed #000;margin:8px 0}
          .row{display:flex;justify-content:space-between}
          .bold{font-weight:bold}
          .big{font-size:16px}
        </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    win.print();
  };

  const handleWhatsApp = () => {
    const text = buildReceiptText(sale, fmtCur, cashierName);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleEmail = () => {
    const text    = buildReceiptText(sale, fmtCur, cashierName);
    const subject = `Receipt ${sale.saleNumber}`;
    window.location.href =
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };

  const now = new Date().toLocaleString('en-GB');

  return (
    <div style={{ position:'fixed', inset:0,
      background:'rgba(13,27,42,.7)',
      display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:9999, padding:20 }}>
      <div style={{ background:'white', borderRadius:20,
        width:'100%', maxWidth:380,
        boxShadow:'0 20px 60px rgba(0,0,0,.5)',
        overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#16c79a',
          padding:'20px 24px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:6 }}>{sale.offline ? '📴' : '✓'}</div>
          <div style={{ color:'white', fontWeight:800,
            fontSize:18 }}>{sale.offline ? 'Saved Offline' : 'Sale Complete!'}</div>
          <div style={{ color:'rgba(255,255,255,.8)',
            fontSize:13 }}>{sale.saleNumber}</div>
          {sale.offline && (
            <div style={{ color:'rgba(255,255,255,.8)', fontSize:11, marginTop:4 }}>
              Will sync automatically once back online
            </div>
          )}
        </div>

        {/* Receipt content */}
        <div ref={printRef}
          style={{ padding:'20px 24px',
            fontFamily:'monospace', fontSize:13 }}>

          <div style={{ textAlign:'center',
            marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>
              FINSUITE POS
            </div>
            <div style={{ fontSize:11, color:'#6b7fa3' }}>
              {now}
            </div>
            <div style={{ fontSize:11, color:'#6b7fa3' }}>
              Receipt: {sale.saleNumber}
            </div>
            {cashierName && (
              <div style={{ fontSize:11, color:'#6b7fa3' }}>
                Cashier: {cashierName}
              </div>
            )}
          </div>

          <div style={{ borderTop:'1px dashed #ccc',
            margin:'8px 0' }}/>

          {/* Items */}
          {(sale.items || []).map((item, i) => (
            <div key={i} style={{ marginBottom:6 }}>
              <div style={{ fontWeight:600, fontSize:12 }}>
                {item.name}
                {item.variantLabel
                  ? ` (${item.variantLabel})` : ''}
              </div>
              <div style={{ display:'flex',
                justifyContent:'space-between',
                fontSize:11, color:'#6b7fa3' }}>
                <span>
                  {item.quantity} ×
                  GH₵{item.unitPrice?.toFixed(2)}
                </span>
                <span style={{ fontWeight:700,
                  color:'#1a2740' }}>
                  {fmtCur(item.lineTotal
                    || item.unitPrice * item.quantity)}
                </span>
              </div>
            </div>
          ))}

          <div style={{ borderTop:'1px dashed #ccc',
            margin:'10px 0' }}/>

          {/* Totals */}
          {[
            { label:'Subtotal',
              value:fmtCur((sale.subtotal||0) + (sale.discountAmount||0)) },
            { label:'Discount',
              value:`- ${fmtCur(sale.discountAmount||0)}`,
              hidden:!sale.discountAmount, color:'#16c79a' },
            { label:'Tax',
              value:fmtCur(sale.taxTotal || 0),
              hidden:!sale.taxTotal },
            { label:'Total',
              value:fmtCur(sale.total),
              bold:true, big:true },
            { label:'Paid',
              value:sale.amountTendered
                ? fmtCur(sale.amountTendered) : fmtCur(sale.total)
            },
            { label:'Change',
              value:fmtCur(sale.changeGiven||0),
              hidden:!sale.changeGiven || sale.changeGiven<=0 },
          ].filter(r => !r.hidden).map((r,i) => (
            <div key={i} style={{ display:'flex',
              justifyContent:'space-between',
              marginBottom:4,
              fontWeight: r.bold ? 700 : 400,
              fontSize: r.big ? 15 : 12 }}>
              <span style={{ color:
                r.bold ? '#1a2740' : '#6b7fa3' }}>
                {r.label}
              </span>
              <span style={{ color:
                r.color || (r.bold ? '#1e6bbd' : '#1a2740') }}>
                {r.value}
              </span>
            </div>
          ))}

          <div style={{ borderTop:'1px dashed #ccc',
            margin:'10px 0' }}/>

          <div style={{ textAlign:'center',
            fontSize:11, color:'#6b7fa3' }}>
            {sale.payments && sale.payments.length > 0 ? (
              <div>
                Payment (split):
                {sale.payments.map((p, i) => (
                  <div key={i}>
                    {p.method.replace('_', ' ').toUpperCase()}: {fmtCur(p.amount)}
                  </div>
                ))}
              </div>
            ) : (
              <>Payment: {sale.paymentMethod
                ?.replace('_', ' ').toUpperCase()}</>
            )}
            {sale.invoiceNumber && (
              <div>Invoice: {sale.invoiceNumber}</div>
            )}
            <div style={{ marginTop:8, fontStyle:'italic' }}>
              Thank you for shopping with us!
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding:'0 24px 12px',
          display:'flex', gap:10 }}>
          <button onClick={handlePrint}
            style={{ flex:1, padding:12,
              border:'1px solid #1e6bbd',
              background:'white', borderRadius:10,
              color:'#1e6bbd', fontSize:13,
              fontWeight:600, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            🖨 Print
          </button>
          <button onClick={handleWhatsApp}
            style={{ flex:1, padding:12,
              border:'1px solid #16c79a',
              background:'white', borderRadius:10,
              color:'#0ea87f', fontSize:13,
              fontWeight:600, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            💬 WhatsApp
          </button>
          <button onClick={handleEmail}
            style={{ flex:1, padding:12,
              border:'1px solid #6b7fa3',
              background:'white', borderRadius:10,
              color:'#6b7fa3', fontSize:13,
              fontWeight:600, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            ✉ Email
          </button>
        </div>
        <div style={{ padding:'0 24px 24px' }}>
          <button onClick={onClose}
            style={{ width:'100%', padding:12,
              background:'#1e6bbd', color:'white',
              border:'none', borderRadius:10,
              fontSize:14, fontWeight:700,
              cursor:'pointer',
              fontFamily:'sans-serif' }}>
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}
