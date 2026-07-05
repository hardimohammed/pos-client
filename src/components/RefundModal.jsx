// ============================================================
//  pos-client/src/components/RefundModal.jsx
//  Search a sale by receipt number. A completed sale goes through
//  the usual full/partial item refund. A sale that's still pending
//  or declined (a mobile money/card charge that never confirmed —
//  or never even got that far) has nothing to refund, since no
//  payment was ever actually received; it can only be voided,
//  reversing the stock deduction, GL entry, and mirrored invoice so
//  a cashier can safely re-ring the same items another way.
// ============================================================
import { useState } from 'react';

export default function RefundModal({ apiBase, token, fmtCur, onClose, onRefunded }) {
  const authH = { Authorization: `Bearer ${token}` };

  const [step,        setStep]        = useState('search'); // search | select | void
  const [query,       setQuery]       = useState('');
  const [searching,   setSearching]   = useState(false);
  const [results,     setResults]     = useState([]);
  const [sale,        setSale]        = useState(null);
  const [qtyByItem,   setQtyByItem]   = useState({});
  const [reason,      setReason]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const res  = await fetch(
        `${apiBase}/pos/sales?search=${encodeURIComponent(query.trim())}`,
        { headers: authH }
      );
      const data = await res.json();
      setResults(data.data?.rows || []);
    } catch {
      setError('Search failed. Check your connection.');
    } finally { setSearching(false); }
  };

  const selectSale = async (saleId) => {
    setSearching(true);
    setError('');
    try {
      const res  = await fetch(`${apiBase}/pos/sales/${saleId}`, { headers: authH });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Could not load sale');
      const s = data.data;

      if (s.payment_status !== 'completed') {
        if (s.notes && s.notes.includes('Voided:')) {
          setError('This sale has already been voided.');
          setSearching(false);
          return;
        }
        setSale(s);
        setStep('void');
        setSearching(false);
        return;
      }

      setSale(s);
      const initial = {};
      (s.items || []).forEach(it => { initial[it.id] = 0; });
      setQtyByItem(initial);
      setStep('select');
    } catch (err) {
      setError(err.message || 'Could not load sale');
    } finally { setSearching(false); }
  };

  const remaining = (item) =>
    parseFloat(item.quantity) - parseFloat(item.refunded_qty || 0);

  const setQty = (itemId, qty, max) => {
    const clamped = Math.max(0, Math.min(max, qty));
    setQtyByItem(prev => ({ ...prev, [itemId]: clamped }));
  };

  const selectAllRemaining = () => {
    const next = {};
    (sale.items || []).forEach(it => { next[it.id] = remaining(it); });
    setQtyByItem(next);
  };

  const refundLines = (sale?.items || [])
    .map(it => ({ item: it, qty: qtyByItem[it.id] || 0 }))
    .filter(l => l.qty > 0);

  const refundEstimate = refundLines.reduce((sum, l) => {
    const unit = parseFloat(l.item.line_total) / parseFloat(l.item.quantity);
    return sum + unit * l.qty;
  }, 0);

  const handleConfirm = async () => {
    if (!reason.trim()) return setError('A reason is required for every refund');
    if (!refundLines.length) return setError('Select at least one item to refund');

    setSubmitting(true);
    setError('');
    try {
      const res  = await fetch(`${apiBase}/pos/sales/${sale.id}/refund`, {
        method:  'POST',
        headers: { ...authH, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          reason: reason.trim(),
          items:  refundLines.map(l => ({ saleItemId: l.item.id, quantity: l.qty })),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Refund failed');
      onRefunded?.(data.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Refund failed');
    } finally { setSubmitting(false); }
  };

  const handleVoid = async () => {
    if (!reason.trim()) return setError('A reason is required to void a sale');
    setSubmitting(true);
    setError('');
    try {
      const res  = await fetch(`${apiBase}/pos/sales/${sale.id}/void`, {
        method:  'POST',
        headers: { ...authH, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Void failed');
      onRefunded?.(data.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Void failed');
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0,
      background:'rgba(13,27,42,.7)', display:'flex',
      alignItems:'center', justifyContent:'center',
      zIndex:9999, padding:20 }}>
      <div style={{ background:'white', borderRadius:20,
        width:'100%', maxWidth:460, maxHeight:'90vh',
        overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>

        {/* Header */}
        <div style={{ background:'#0d1b2a', padding:'18px 24px',
          display:'flex', justifyContent:'space-between',
          alignItems:'center' }}>
          <div style={{ color:'white', fontWeight:800, fontSize:16 }}>
            {step === 'search' ? 'Find Sale' : step === 'void' ? `Void ${sale?.sale_number}` : `Refund ${sale?.sale_number}`}
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none',
              color:'rgba(255,255,255,.7)', fontSize:20,
              cursor:'pointer' }}>×</button>
        </div>

        <div style={{ padding:24 }}>
          {error && (
            <div style={{ background:'#fff5f5', border:'1px solid #fca5a5',
              borderRadius:8, padding:'10px 14px', marginBottom:16,
              fontSize:12, color:'#c04040' }}>
              {error}
            </div>
          )}

          {/* ── Step 1: search ─────────────────────────────── */}
          {step === 'search' && (
            <>
              <form onSubmit={handleSearch} style={{ display:'flex', gap:8, marginBottom:16 }}>
                <input
                  autoFocus
                  placeholder="Receipt number, e.g. POS-2026-00014"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ flex:1, padding:'12px 14px', border:'1.5px solid #e2e8f0',
                    borderRadius:10, fontSize:14, outline:'none',
                    fontFamily:'sans-serif' }}/>
                <button type="submit" disabled={searching}
                  style={{ padding:'0 18px', background:'#1e6bbd', color:'white',
                    border:'none', borderRadius:10, fontWeight:700,
                    cursor:'pointer', fontFamily:'sans-serif' }}>
                  {searching ? '…' : 'Search'}
                </button>
              </form>

              {results.map(r => (
                <div key={r.id} onClick={() => selectSale(r.id)}
                  style={{ padding:'12px 14px', border:'1px solid #e2e8f0',
                    borderRadius:10, marginBottom:8, cursor:'pointer',
                    display:'flex', justifyContent:'space-between',
                    alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{r.sale_number}</div>
                    <div style={{ fontSize:11, color:'#6b7fa3' }}>
                      {r.first_name} {r.last_name} · {r.payment_method}
                      {r.payment_status !== 'completed' && ` · ${r.payment_status}`}
                    </div>
                  </div>
                  <div style={{ fontWeight:700, color:'#1e6bbd', fontFamily:'monospace' }}>
                    {fmtCur(r.total_amount)}
                  </div>
                </div>
              ))}
              {!searching && query && results.length === 0 && (
                <div style={{ textAlign:'center', color:'#6b7fa3',
                  fontSize:13, padding:20 }}>
                  No sale found for "{query}"
                </div>
              )}
            </>
          )}

          {/* ── Step 2: select items + reason ──────────────── */}
          {step === 'select' && sale && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:12 }}>
                <span style={{ fontSize:12, color:'#6b7fa3' }}>
                  Original total: <b style={{ color:'#1a2740' }}>{fmtCur(sale.total_amount)}</b>
                  {parseFloat(sale.refunded_amount) > 0 &&
                    ` · already refunded ${fmtCur(sale.refunded_amount)}`}
                </span>
                <button onClick={selectAllRemaining}
                  style={{ fontSize:12, color:'#1e6bbd', background:'none',
                    border:'none', cursor:'pointer', fontWeight:600 }}>
                  Select full refund
                </button>
              </div>

              {(sale.items || []).map(it => {
                const max = remaining(it);
                return (
                  <div key={it.id} style={{ padding:'10px 0',
                    borderBottom:'1px solid #f0f2f5',
                    display:'flex', justifyContent:'space-between',
                    alignItems:'center', opacity: max <= 0 ? .4 : 1 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13 }}>
                        {it.product_name}{it.variant_label ? ` (${it.variant_label})` : ''}
                      </div>
                      <div style={{ fontSize:11, color:'#6b7fa3' }}>
                        Sold {it.quantity} · refundable {max}
                      </div>
                    </div>
                    <input
                      type="number" min="0" max={max} step="1"
                      disabled={max <= 0}
                      value={qtyByItem[it.id] || 0}
                      onChange={e => setQty(it.id, parseFloat(e.target.value) || 0, max)}
                      style={{ width:56, textAlign:'center', padding:'6px 0',
                        border:'1px solid #e2e8f0', borderRadius:8,
                        fontFamily:'monospace', fontWeight:700 }}/>
                  </div>
                );
              })}

              <div style={{ marginTop:16 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600,
                  color:'#1a2740', marginBottom:6 }}>
                  Reason for refund *
                </label>
                <textarea rows={3} value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Wrong size, customer changed mind..."
                  style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #e2e8f0',
                    borderRadius:8, fontSize:13, fontFamily:'sans-serif',
                    outline:'none', resize:'vertical', boxSizing:'border-box' }}/>
              </div>

              {sale.payment_method !== 'cash' && refundLines.length > 0 && (
                <div style={{ background:'#fffbeb', border:'1px solid #fcd34d',
                  borderRadius:8, padding:'10px 14px', marginTop:12,
                  fontSize:12, color:'#92400e' }}>
                  ⚠ Paid by {sale.payment_method.replace('_',' ')} — this refund will be
                  flagged for manual {sale.payment_method === 'card' ? 'card terminal' : 'Paystack'} processing.
                  It won't be sent automatically.
                </div>
              )}

              <div style={{ display:'flex', gap:12, marginTop:20 }}>
                <button onClick={() => { setStep('search'); setSale(null); setError(''); }}
                  style={{ flex:1, padding:12, border:'1px solid #e2e8f0',
                    background:'white', borderRadius:10, fontSize:13,
                    cursor:'pointer', fontFamily:'sans-serif' }}>
                  Back
                </button>
                <button onClick={handleConfirm} disabled={submitting || !refundLines.length}
                  style={{ flex:2, padding:12,
                    background: (submitting || !refundLines.length) ? '#6b7fa3' : '#e05c5c',
                    color:'white', border:'none', borderRadius:10, fontSize:14,
                    fontWeight:700,
                    cursor: (submitting || !refundLines.length) ? 'not-allowed' : 'pointer',
                    fontFamily:'sans-serif' }}>
                  {submitting ? 'Processing…' : `Refund ${fmtCur(refundEstimate)}`}
                </button>
              </div>
            </>
          )}

          {/* ── Step: void (sale never actually completed) ─────── */}
          {step === 'void' && sale && (
            <>
              <div style={{ background:'#fffbeb', border:'1px solid #fcd34d',
                borderRadius:8, padding:'12px 14px', marginBottom:16,
                fontSize:12, color:'#92400e' }}>
                This sale is <b>{sale.payment_status}</b> — no payment was ever confirmed
                for it, so there's nothing to refund. Voiding restores the stock it
                deducted and cancels its accounting entries, so you can safely ring up
                the same items again under a different payment method.
              </div>

              <div style={{ padding:'10px 0', borderBottom:'1px solid #f0f2f5', marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{sale.sale_number}</div>
                <div style={{ fontSize:12, color:'#6b7fa3' }}>
                  {sale.payment_method?.replace('_',' ')} · {fmtCur(sale.total_amount)}
                </div>
              </div>

              <label style={{ display:'block', fontSize:11, fontWeight:600,
                color:'#1a2740', marginBottom:6 }}>
                Reason for voiding *
              </label>
              <textarea rows={3} value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Mobile money charge was declined"
                style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #e2e8f0',
                  borderRadius:8, fontSize:13, fontFamily:'sans-serif',
                  outline:'none', resize:'vertical', boxSizing:'border-box' }}/>

              <div style={{ display:'flex', gap:12, marginTop:20 }}>
                <button onClick={() => { setStep('search'); setSale(null); setError(''); setReason(''); }}
                  style={{ flex:1, padding:12, border:'1px solid #e2e8f0',
                    background:'white', borderRadius:10, fontSize:13,
                    cursor:'pointer', fontFamily:'sans-serif' }}>
                  Back
                </button>
                <button onClick={handleVoid} disabled={submitting}
                  style={{ flex:2, padding:12,
                    background: submitting ? '#6b7fa3' : '#e05c5c',
                    color:'white', border:'none', borderRadius:10, fontSize:14,
                    fontWeight:700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily:'sans-serif' }}>
                  {submitting ? 'Processing…' : 'Void Sale'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
