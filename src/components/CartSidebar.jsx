// ============================================================
//  pos-client/src/components/CartSidebar.jsx
// ============================================================
export default function CartSidebar({
  cart, subtotal, taxTotal, discount, discountType, totalDiscount,
  total, itemCount, onUpdateQty, onUpdateDiscount,
  onOrderDiscount, onOrderDiscountType, onClear, onCheckout, onHold, fmtCur,
}) {
  return (
    <div style={{ width:340, background:'white',
      display:'flex', flexDirection:'column',
      borderLeft:'1px solid #e2e8f0',
      boxShadow:'-4px 0 20px rgba(13,27,42,.08)' }}>

      {/* Cart header */}
      <div style={{ padding:'16px 20px',
        borderBottom:'1px solid #e2e8f0',
        display:'flex', justifyContent:'space-between',
        alignItems:'center' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>
            Cart
          </div>
          <div style={{ fontSize:12, color:'#6b7fa3' }}>
            {itemCount} item{itemCount!==1?'s':''}
          </div>
        </div>
        {cart.length > 0 && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onHold}
              style={{ padding:'6px 12px', borderRadius:8,
                border:'1px solid #e8a04a',
                background:'none', color:'#e8a04a',
                fontSize:12, fontWeight:600,
                cursor:'pointer' }}>
              Hold
            </button>
            <button onClick={onClear}
              style={{ padding:'6px 12px', borderRadius:8,
                border:'1px solid #e05c5c',
                background:'none', color:'#e05c5c',
                fontSize:12, fontWeight:600,
                cursor:'pointer' }}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Cart items */}
      <div style={{ flex:1, overflowY:'auto', padding:12 }}>
        {cart.length === 0 ? (
          <div style={{ textAlign:'center',
            padding:'40px 20px', color:'#6b7fa3' }}>
            <div style={{ fontSize:40,
              marginBottom:12 }}>🛒</div>
            <div style={{ fontSize:14, fontWeight:600 }}>
              Cart is empty
            </div>
            <div style={{ fontSize:12, marginTop:4 }}>
              Tap a product to add it
            </div>
          </div>
        ) : (
          cart.map(item => {
            const gross   = item.unitPrice * item.quantity;
            const discAmt = gross * (item.discountPct / 100);
            const net     = gross - discAmt;
            return (
              <div key={item.key}
                style={{ background:'#f8fafc',
                  borderRadius:12, padding:12,
                  marginBottom:8,
                  border:'1px solid #e2e8f0' }}>
                <div style={{ display:'flex',
                  justifyContent:'space-between',
                  marginBottom:8 }}>
                  <div style={{ flex:1, paddingRight:8 }}>
                    <div style={{ fontWeight:600,
                      fontSize:13, marginBottom:2 }}>
                      {item.name}
                    </div>
                    {item.variantLabel && (
                      <div style={{ fontSize:11,
                        color:'#7c3aed',
                        fontWeight:600 }}>
                        {item.variantLabel}
                      </div>
                    )}
                    <div style={{ fontSize:11,
                      color:'#6b7fa3' }}>
                      GH₵ {item.unitPrice.toFixed(2)} each
                    </div>
                  </div>
                  <div style={{ fontWeight:700,
                    color:'#1e6bbd', fontFamily:'monospace',
                    fontSize:14 }}>
                    {fmtCur(net)}
                  </div>
                </div>

                {/* Quantity controls */}
                <div style={{ display:'flex',
                  alignItems:'center', gap:8 }}>
                  <button
                    onClick={() =>
                      onUpdateQty(item.key, item.quantity - 1)}
                    style={{ width:32, height:32,
                      borderRadius:8,
                      border:'1px solid #e2e8f0',
                      background:'white', fontSize:18,
                      cursor:'pointer', fontWeight:700,
                      display:'flex', alignItems:'center',
                      justifyContent:'center' }}>
                    −
                  </button>
                  <input
                    type="number" min="1"
                    value={item.quantity}
                    onChange={e =>
                      onUpdateQty(item.key,
                        parseInt(e.target.value)||1)}
                    style={{ width:48, textAlign:'center',
                      border:'1px solid #e2e8f0',
                      borderRadius:8, padding:'6px 0',
                      fontWeight:700, fontSize:14,
                      fontFamily:'monospace' }}/>
                  <button
                    onClick={() =>
                      onUpdateQty(item.key, item.quantity + 1)}
                    style={{ width:32, height:32,
                      borderRadius:8,
                      border:'1px solid #e2e8f0',
                      background:'white', fontSize:18,
                      cursor:'pointer', fontWeight:700,
                      display:'flex', alignItems:'center',
                      justifyContent:'center' }}>
                    +
                  </button>

                  {/* Per-item discount */}
                  <div style={{ marginLeft:'auto',
                    display:'flex', alignItems:'center',
                    gap:4 }}>
                    <input
                      type="number" min="0" max="100"
                      placeholder="0"
                      value={item.discountPct || ''}
                      onChange={e =>
                        onUpdateDiscount(item.key,
                          parseFloat(e.target.value)||0)}
                      style={{ width:44, textAlign:'center',
                        border:'1px solid #e2e8f0',
                        borderRadius:6, padding:'5px 0',
                        fontSize:12, fontFamily:'monospace' }}/>
                    <span style={{ fontSize:11,
                      color:'#6b7fa3' }}>%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Order totals */}
      {cart.length > 0 && (
        <div style={{ padding:'12px 16px',
          borderTop:'1px solid #e2e8f0' }}>

          {/* Order-level discount */}
          <div style={{ display:'flex',
            alignItems:'center', gap:8, marginBottom:10 }}>
            <span style={{ fontSize:12, color:'#6b7fa3',
              flex:1 }}>Order Discount</span>
            <div style={{ display:'flex', border:'1px solid #e2e8f0',
              borderRadius:6, overflow:'hidden' }}>
              {['flat','percentage'].map(t => (
                <button key={t}
                  onClick={() => onOrderDiscountType(t)}
                  style={{ padding:'5px 9px', border:'none',
                    background: discountType===t ? '#1e6bbd' : 'white',
                    color: discountType===t ? 'white' : '#6b7fa3',
                    fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {t==='flat' ? 'GH₵' : '%'}
                </button>
              ))}
            </div>
            <input
              type="number" min="0" max={discountType==='percentage' ? 100 : undefined}
              placeholder="0"
              value={discount || ''}
              onChange={e =>
                onOrderDiscount(
                  parseFloat(e.target.value) || 0)}
              style={{ width:64, textAlign:'right',
                border:'1px solid #e2e8f0',
                borderRadius:6, padding:'6px 8px',
                fontSize:13, fontFamily:'monospace' }}/>
          </div>

          {/* Summary rows */}
          {[
            { label:'Subtotal', value:fmtCur(subtotal) },
            { label:'Discount', value:`- ${fmtCur(totalDiscount)}`,
              hidden: totalDiscount===0, color:'#16c79a' },
            { label:'Tax',      value:fmtCur(taxTotal),
              hidden: taxTotal===0 },
          ].filter(r => !r.hidden).map((r,i) => (
            <div key={i} style={{ display:'flex',
              justifyContent:'space-between',
              marginBottom:6, fontSize:13 }}>
              <span style={{ color:'#6b7fa3' }}>
                {r.label}
              </span>
              <span style={{ fontFamily:'monospace',
                color: r.color || '#1a2740' }}>
                {r.value}
              </span>
            </div>
          ))}

          {/* Total */}
          <div style={{ display:'flex',
            justifyContent:'space-between',
            padding:'10px 0',
            borderTop:'2px solid #1e6bbd',
            marginTop:6, marginBottom:12 }}>
            <span style={{ fontWeight:800, fontSize:16 }}>
              TOTAL
            </span>
            <span style={{ fontFamily:'monospace',
              fontWeight:800, fontSize:20,
              color:'#1e6bbd' }}>
              {fmtCur(total)}
            </span>
          </div>

          {/* Checkout button */}
          <button onClick={onCheckout}
            style={{ width:'100%', padding:16,
              background:'#16c79a', color:'white',
              border:'none', borderRadius:12,
              fontSize:16, fontWeight:800,
              cursor:'pointer', fontFamily:'sans-serif',
              letterSpacing:.5 }}>
            CHARGE {fmtCur(total)}
          </button>
        </div>
      )}
    </div>
  );
}
