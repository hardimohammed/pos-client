// ============================================================
//  pos-client/src/components/PaymentModal.jsx
//  Cash / MoMo / Card payment with change calculator
// ============================================================
import { useState, useEffect, useRef } from 'react';

const METHODS = [
  { id:'cash',         label:'Cash',         icon:'💵' },
  { id:'mobile_money', label:'Mobile Money', icon:'📱' },
  { id:'card',         label:'Card',         icon:'💳' },
];

export default function PaymentModal({
  total, cart, apiBase, token, fmtCur, onComplete, onClose,
}) {
  const [method,    setMethod]    = useState('cash');
  const [tendered,  setTendered]  = useState('');
  const [momoPhone, setMomoPhone]  = useState('');
  const [momoProvider, setMomoProvider] = useState('mtn');
  const [notes,     setNotes]      = useState('');
  const [processing,setProcessing] = useState(false);
  const [chargeStatus, setChargeStatus] = useState(null); // 'charging' | 'success' | 'failed' | null

  // ── Split payment (e.g. part cash, part MoMo) ───────────────
  const [splitMode, setSplitMode] = useState(false);
  const [splitLegs, setSplitLegs] = useState([
    { method: 'cash', amount: '' },
    { method: 'mobile_money', amount: '' },
  ]);

  // ── Customer linking (walk-in / search / quick-capture) ────
  const [customer,       setCustomer]       = useState(null); // {id, name, phone} or null = walk-in
  const [showSearch,     setShowSearch]     = useState(false);
  const [query,          setQuery]          = useState('');
  const [results,        setResults]        = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [showQuickAdd,   setShowQuickAdd]   = useState(false);
  const [quickName,      setQuickName]      = useState('');
  const [quickPhone,     setQuickPhone]     = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!showSearch || !query.trim()) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`${apiBase}/customers?search=${encodeURIComponent(query.trim())}&limit=8`,
          { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setResults(data.data || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, showSearch, apiBase, token]);

  const selectCustomer = (c) => {
    setCustomer({ id: c.id, name: c.name, phone: c.phone });
    setShowSearch(false);
    setQuery('');
    setResults([]);
  };

  const clearCustomer = () => setCustomer(null);

  const handleQuickAdd = async () => {
    if (!quickName.trim()) return;
    setAddingCustomer(true);
    try {
      const res  = await fetch(`${apiBase}/customers`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: quickName.trim(), phone: quickPhone.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Could not add customer');
      setCustomer({ id: data.data.id, name: quickName.trim(), phone: quickPhone.trim() });
      setShowQuickAdd(false);
      setShowSearch(false);
      setQuickName(''); setQuickPhone('');
    } catch (err) {
      alert(err.message || 'Could not add customer');
    } finally { setAddingCustomer(false); }
  };

  const tenderedAmt = parseFloat(tendered) || 0;
  const change      = tenderedAmt >= total
    ? tenderedAmt - total : 0;

  const splitTotal     = splitLegs.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const splitRemaining = total - splitTotal;
  const splitValid     = Math.abs(splitRemaining) < 0.01
    && splitLegs.every(l => (parseFloat(l.amount) || 0) > 0)
    // A mobile_money leg needs a real phone number, same requirement
    // as the non-split flow — it's an actual Paystack charge now, not
    // just a trust-based line item.
    && splitLegs.every(l => l.method !== 'mobile_money' || (l.momoPhone || '').length >= 10);

  const isReady = splitMode
    ? splitValid
    : method === 'cash'
      ? tenderedAmt >= total
      : method === 'mobile_money'
        ? momoPhone.length >= 10
        : true;

  const updSplitLeg = (i, field, value) =>
    setSplitLegs(legs => legs.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const quickAmounts = [
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50,
    100, 200, 500,
  ].filter((v, i, arr) =>
    v >= total && arr.indexOf(v) === i
  ).slice(0, 4);

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      await onComplete(splitMode ? {
        method: 'split',
        payments: splitLegs.map(l => ({
          method: l.method, amount: parseFloat(l.amount) || 0,
          ...(l.method === 'mobile_money' ? { momoPhone: l.momoPhone, momoProvider: l.momoProvider || 'mtn' } : {}),
        })),
        amountTendered: total,
        changeGiven:    0,
        customerId:     customer?.id || null,
        customerName:   customer?.name || 'Walk-in Customer',
        notes,
      } : {
        method,
        amountTendered: method === 'cash' ? tenderedAmt : total,
        changeGiven:    change,
        customerId:     customer?.id || null,
        customerName:   customer?.name || 'Walk-in Customer',
        momoPhone,
        momoProvider,
        notes,
      });
    } finally { setProcessing(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0,
      background:'rgba(13,27,42,.7)',
      display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:9999, padding:20 }}>
      <div style={{ background:'white', borderRadius:20,
        width:'100%', maxWidth:460,
        boxShadow:'0 20px 60px rgba(0,0,0,.5)',
        overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#0d1b2a',
          padding:'20px 24px',
          display:'flex', justifyContent:'space-between',
          alignItems:'center' }}>
          <div>
            <div style={{ color:'white', fontWeight:700,
              fontSize:16 }}>Payment</div>
            <div style={{ color:'rgba(255,255,255,.6)',
              fontSize:13 }}>
              {cart.length} item{cart.length!==1?'s':''}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ color:'rgba(255,255,255,.6)',
              fontSize:12 }}>TOTAL DUE</div>
            <div style={{ color:'#16c79a', fontWeight:800,
              fontSize:24, fontFamily:'monospace' }}>
              {fmtCur(total)}
            </div>
          </div>
        </div>

        <div style={{ padding:24 }}>

          {/* Payment method selector */}
          {!splitMode && (
            <div style={{ display:'grid',
              gridTemplateColumns:'repeat(3,1fr)',
              gap:10, marginBottom:12 }}>
              {METHODS.map(m => (
                <button key={m.id}
                  onClick={() => setMethod(m.id)}
                  style={{ padding:'14px 8px',
                    borderRadius:12, border:'2px solid',
                    borderColor: method===m.id
                      ? '#1e6bbd' : '#e2e8f0',
                    background: method===m.id
                      ? 'rgba(30,107,189,.08)' : 'white',
                    cursor:'pointer',
                    display:'flex', flexDirection:'column',
                    alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:24 }}>{m.icon}</span>
                  <span style={{ fontSize:13, fontWeight:600,
                    color: method===m.id
                      ? '#1e6bbd' : '#6b7fa3' }}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Split payment toggle */}
          <div style={{ textAlign:'right', marginBottom:20 }}>
            <button onClick={() => setSplitMode(s => !s)}
              style={{ background:'none', border:'none',
                color:'#1e6bbd', fontSize:12, fontWeight:600,
                cursor:'pointer', padding:0 }}>
              {splitMode ? '← Back to single payment' : '🔀 Split Payment'}
            </button>
          </div>

          {/* Split payment legs */}
          {splitMode && (
            <div style={{ marginBottom:4 }}>
              {splitLegs.map((leg, i) => (
                <div key={i} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <select value={leg.method}
                      onChange={e => updSplitLeg(i, 'method', e.target.value)}
                      style={{ padding:'12px 10px', borderRadius:10,
                        border:'2px solid #e2e8f0', fontSize:13,
                        fontWeight:600, color:'#1a2740',
                        background:'white', flex:'0 0 150px' }}>
                      {METHODS.map(m => (
                        <option key={m.id} value={m.id}>{m.icon} {m.label}</option>
                      ))}
                    </select>
                    <input type="number" min="0" step="0.01"
                      placeholder="Amount"
                      value={leg.amount}
                      onChange={e => updSplitLeg(i, 'amount', e.target.value)}
                      style={{ flex:1, padding:'12px 14px',
                        border:'2px solid #e2e8f0', borderRadius:10,
                        fontSize:16, fontFamily:'monospace',
                        fontWeight:700, textAlign:'right',
                        outline:'none', boxSizing:'border-box' }}/>
                  </div>
                  {/* A mobile money leg is a real, remote Paystack charge
                      just like the non-split flow — it used to be
                      accepted on the cashier's say-so alone, with no
                      phone number and no charge ever attempted, yet
                      still counted toward completing the whole sale. */}
                  {leg.method === 'mobile_money' && (
                    <div style={{ display:'flex', gap:8, marginTop:8, paddingLeft:2 }}>
                      <select value={leg.momoProvider || 'mtn'}
                        onChange={e => updSplitLeg(i, 'momoProvider', e.target.value)}
                        style={{ padding:'10px 8px', borderRadius:8,
                          border:'2px solid #e2e8f0', fontSize:12,
                          fontWeight:600, color:'#1a2740',
                          background:'white', flex:'0 0 110px' }}>
                        <option value="mtn">MTN</option>
                        <option value="vod">Telecel</option>
                        <option value="tgo">AirtelTigo</option>
                      </select>
                      <input type="tel"
                        placeholder="Customer MoMo number, e.g. 0241234567"
                        value={leg.momoPhone || ''}
                        onChange={e => updSplitLeg(i, 'momoPhone', e.target.value)}
                        style={{ flex:1, padding:'10px 12px',
                          border: `2px solid ${(leg.momoPhone || '').length >= 10 ? '#e2e8f0' : '#fcd34d'}`,
                          borderRadius:8, fontSize:13,
                          fontFamily:'monospace', outline:'none',
                          boxSizing:'border-box' }}/>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between',
                padding:'10px 14px', borderRadius:10,
                background: splitValid ? 'rgba(22,199,154,.1)' : 'rgba(232,160,74,.12)',
                border: `1px solid ${splitValid ? 'rgba(22,199,154,.3)' : 'rgba(232,160,74,.35)'}` }}>
                <span style={{ fontSize:13, fontWeight:600,
                  color: splitValid ? '#0ea87f' : '#c47a1a' }}>
                  {splitValid ? 'Fully allocated' : splitRemaining > 0 ? 'Remaining' : 'Over by'}
                </span>
                <span style={{ fontFamily:'monospace', fontWeight:800,
                  fontSize:16, color: splitValid ? '#0ea87f' : '#c47a1a' }}>
                  {fmtCur(Math.abs(splitRemaining))}
                </span>
              </div>
            </div>
          )}

          {/* Cash inputs */}
          {!splitMode && method === 'cash' && (
            <div>
              <label style={{ display:'block', fontSize:12,
                fontWeight:600, color:'#6b7fa3',
                marginBottom:8, textTransform:'uppercase' }}>
                Amount Tendered
              </label>
              <input
                type="number" min={total} step="0.01"
                autoFocus
                value={tendered}
                onChange={e => setTendered(e.target.value)}
                style={{ width:'100%', padding:'14px 16px',
                  border:'2px solid #e2e8f0',
                  borderRadius:12, fontSize:20,
                  fontFamily:'monospace', fontWeight:700,
                  textAlign:'right', outline:'none',
                  boxSizing:'border-box' }}/>

              {/* Quick amount buttons */}
              <div style={{ display:'flex', gap:8,
                marginTop:10, flexWrap:'wrap' }}>
                {quickAmounts.map(amt => (
                  <button key={amt}
                    onClick={() => setTendered(String(amt))}
                    style={{ padding:'8px 14px',
                      borderRadius:8,
                      border:'1px solid #e2e8f0',
                      background:'#f8fafc',
                      fontFamily:'monospace',
                      fontWeight:600, fontSize:13,
                      cursor:'pointer',
                      color:'#1a2740' }}>
                    {amt}
                  </button>
                ))}
                <button
                  onClick={() =>
                    setTendered(total.toFixed(2))}
                  style={{ padding:'8px 14px',
                    borderRadius:8,
                    border:'1px solid #16c79a',
                    background:'rgba(22,199,154,.08)',
                    fontFamily:'monospace',
                    fontWeight:700, fontSize:13,
                    cursor:'pointer', color:'#0ea87f' }}>
                  Exact
                </button>
              </div>

              {/* Change display */}
              {tenderedAmt >= total && (
                <div style={{ background:'rgba(22,199,154,.1)',
                  border:'1px solid rgba(22,199,154,.3)',
                  borderRadius:12, padding:'12px 16px',
                  marginTop:16,
                  display:'flex',
                  justifyContent:'space-between',
                  alignItems:'center' }}>
                  <span style={{ fontWeight:600,
                    color:'#0ea87f', fontSize:14 }}>
                    Change to give
                  </span>
                  <span style={{ fontFamily:'monospace',
                    fontWeight:800, fontSize:22,
                    color:'#0ea87f' }}>
                    {fmtCur(change)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Mobile Money inputs */}
          {!splitMode && method === 'mobile_money' && (
            <div>
              <label style={{ display:'block', fontSize:12,
                fontWeight:600, color:'#6b7fa3',
                marginBottom:8, textTransform:'uppercase' }}>
                Network
              </label>
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {[
                  { id:'mtn', label:'MTN' },
                  { id:'vod', label:'Telecel' },
                  { id:'tgo', label:'AirtelTigo' },
                ].map(n => (
                  <button key={n.id} onClick={() => setMomoProvider(n.id)}
                    style={{ flex:1, padding:'10px 6px', borderRadius:8,
                      border:'2px solid', borderColor: momoProvider===n.id ? '#1e6bbd' : '#e2e8f0',
                      background: momoProvider===n.id ? 'rgba(30,107,189,.08)' : 'white',
                      color: momoProvider===n.id ? '#1e6bbd' : '#6b7fa3',
                      fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    {n.label}
                  </button>
                ))}
              </div>
              <label style={{ display:'block', fontSize:12,
                fontWeight:600, color:'#6b7fa3',
                marginBottom:8, textTransform:'uppercase' }}>
                Customer Phone (MoMo Number)
              </label>
              <input
                type="tel" autoFocus
                placeholder="e.g. 0241234567"
                value={momoPhone}
                onChange={e => setMomoPhone(e.target.value)}
                style={{ width:'100%', padding:'14px 16px',
                  border:'2px solid #e2e8f0',
                  borderRadius:12, fontSize:16,
                  fontFamily:'monospace', outline:'none',
                  boxSizing:'border-box' }}/>
              <div style={{ background:'#fffbeb',
                border:'1px solid #fcd34d',
                borderRadius:10, padding:'10px 14px',
                marginTop:12, fontSize:12,
                color:'#92400e' }}>
                📱 A Paystack payment request will be sent
                to this number. The sale will complete
                automatically once payment confirms.
              </div>
            </div>
          )}

          {/* Card inputs */}
          {!splitMode && method === 'card' && (
            <div style={{ background:'#f0f9ff',
              border:'1px solid #93c5fd',
              borderRadius:12, padding:16,
              fontSize:13, color:'#1e40af' }}>
              💳 Process card payment on your POS
              terminal for {fmtCur(total)},
              then confirm below.
            </div>
          )}

          {/* Customer linking — walk-in / search existing / quick-capture */}
          <div style={{ marginTop:16 }}>
            {customer ? (
              <div style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', padding:'10px 14px',
                border:'1.5px solid #1e6bbd', borderRadius:10,
                background:'rgba(30,107,189,.05)' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a2740' }}>
                    {customer.name}
                  </div>
                  {customer.phone && (
                    <div style={{ fontSize:11, color:'#6b7fa3' }}>{customer.phone}</div>
                  )}
                </div>
                <button onClick={clearCustomer}
                  style={{ background:'none', border:'none', color:'#6b7fa3',
                    fontSize:16, cursor:'pointer' }}>×</button>
              </div>
            ) : !showSearch ? (
              <div style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'#6b7fa3' }}>Walk-in Customer</span>
                <button onClick={() => setShowSearch(true)}
                  style={{ background:'none', border:'none', color:'#1e6bbd',
                    fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  + Link Customer
                </button>
              </div>
            ) : showQuickAdd ? (
              <div style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:12 }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>New Customer</div>
                <input placeholder="Name *" value={quickName}
                  onChange={e => setQuickName(e.target.value)}
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0',
                    borderRadius:8, fontSize:13, marginBottom:8, boxSizing:'border-box' }}/>
                <input placeholder="Phone (optional)" value={quickPhone}
                  onChange={e => setQuickPhone(e.target.value)}
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0',
                    borderRadius:8, fontSize:13, marginBottom:10, boxSizing:'border-box' }}/>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setShowQuickAdd(false)}
                    style={{ flex:1, padding:8, border:'1px solid #e2e8f0', background:'white',
                      borderRadius:8, fontSize:12, cursor:'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleQuickAdd} disabled={!quickName.trim() || addingCustomer}
                    style={{ flex:2, padding:8, border:'none',
                      background: (!quickName.trim() || addingCustomer) ? '#6b7fa3' : '#1e6bbd',
                      color:'white', borderRadius:8, fontSize:12, fontWeight:700,
                      cursor: (!quickName.trim() || addingCustomer) ? 'not-allowed' : 'pointer' }}>
                    {addingCustomer ? 'Saving…' : 'Save & Link'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                  <input autoFocus placeholder="Search name or phone..."
                    value={query} onChange={e => setQuery(e.target.value)}
                    style={{ flex:1, padding:'9px 12px', border:'1px solid #e2e8f0',
                      borderRadius:8, fontSize:13, boxSizing:'border-box' }}/>
                  <button onClick={() => { setShowSearch(false); setQuery(''); }}
                    style={{ padding:'0 10px', border:'1px solid #e2e8f0', background:'white',
                      borderRadius:8, color:'#6b7fa3', cursor:'pointer' }}>×</button>
                </div>
                {searching && (
                  <div style={{ fontSize:11, color:'#6b7fa3', padding:4 }}>Searching…</div>
                )}
                {results.map(c => (
                  <div key={c.id} onClick={() => selectCustomer(c)}
                    style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer',
                      display:'flex', justifyContent:'space-between',
                      border:'1px solid #f0f2f5', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{c.name}</span>
                    <span style={{ fontSize:11, color:'#6b7fa3' }}>{c.phone || ''}</span>
                  </div>
                ))}
                {!searching && query.trim() && results.length === 0 && (
                  <div style={{ fontSize:11, color:'#6b7fa3', padding:'4px 0 8px' }}>
                    No customer found for "{query}"
                  </div>
                )}
                <button onClick={() => { setShowQuickAdd(true); setQuickName(query); }}
                  style={{ width:'100%', marginTop:4, padding:8, border:'1.5px dashed #e2e8f0',
                    background:'none', borderRadius:8, color:'#1e6bbd', fontSize:12,
                    fontWeight:600, cursor:'pointer' }}>
                  + Add New Customer
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display:'flex', gap:12,
            marginTop:20 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:14,
                border:'1px solid #e2e8f0',
                background:'white', borderRadius:12,
                fontSize:14, fontWeight:600,
                cursor:'pointer',
                fontFamily:'sans-serif',
                color:'#6b7fa3' }}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isReady || processing}
              style={{ flex:2, padding:14,
                background: (!isReady || processing)
                  ? '#6b7fa3' : '#16c79a',
                color:'white', border:'none',
                borderRadius:12, fontSize:15,
                fontWeight:800,
                cursor: (!isReady || processing)
                  ? 'not-allowed' : 'pointer',
                fontFamily:'sans-serif' }}>
              {processing ? 'Processing...'
                : splitMode
                  ? 'Confirm Split Payment'
                  : method === 'cash'
                    ? `Confirm — Change ${fmtCur(change)}`
                    : method === 'mobile_money'
                      ? 'Send MoMo Request'
                      : 'Confirm Card Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
