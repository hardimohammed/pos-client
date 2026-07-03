// ============================================================
//  pos-client/src/components/ParkedSalesModal.jsx
//  List held tickets, resume one into the active cart, or
//  discard it entirely.
// ============================================================
import { useState, useEffect } from 'react';

export default function ParkedSalesModal({ apiBase, token, fmtCur, hasActiveCart, onClose, onResume }) {
  const authH = { Authorization: `Bearer ${token}` };

  const [parked,    setParked]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [busyId,    setBusyId]    = useState(null);

  const load = () => {
    setLoading(true);
    fetch(`${apiBase}/pos/parked-sales`, { headers: authH })
      .then(r => r.json())
      .then(data => setParked(data.data || []))
      .catch(() => setError('Failed to load parked sales'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResume = async (id) => {
    // Confirm BEFORE calling the API — the resume endpoint marks the
    // ticket as consumed server-side, so this must not fire after a
    // cancelled confirmation or the held sale would be silently lost.
    if (hasActiveCart && !window.confirm(
      'This will replace your current cart with the held sale. Continue?'
    )) return;

    setBusyId(id);
    setError('');
    try {
      const res  = await fetch(`${apiBase}/pos/parked-sales/${id}/resume`, {
        method: 'POST', headers: authH,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Could not resume this sale');
      onResume(data.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not resume this sale');
      setBusyId(null);
    }
  };

  const handleDiscard = async (id) => {
    if (!window.confirm('Discard this held sale? This cannot be undone.')) return;
    setBusyId(id);
    setError('');
    try {
      const res  = await fetch(`${apiBase}/pos/parked-sales/${id}`, {
        method: 'DELETE', headers: authH,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Could not discard this sale');
      load();
    } catch (err) {
      setError(err.message || 'Could not discard this sale');
    } finally { setBusyId(null); }
  };

  return (
    <div style={{ position:'fixed', inset:0,
      background:'rgba(13,27,42,.7)', display:'flex',
      alignItems:'center', justifyContent:'center',
      zIndex:9999, padding:20 }}>
      <div style={{ background:'white', borderRadius:20,
        width:'100%', maxWidth:440, maxHeight:'85vh',
        overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>

        {/* Header */}
        <div style={{ background:'#0d1b2a', padding:'18px 24px',
          display:'flex', justifyContent:'space-between',
          alignItems:'center' }}>
          <div style={{ color:'white', fontWeight:800, fontSize:16 }}>
            Held Sales
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

          {loading && (
            <div style={{ textAlign:'center', color:'#6b7fa3', padding:30 }}>Loading…</div>
          )}

          {!loading && parked.length === 0 && (
            <div style={{ textAlign:'center', color:'#6b7fa3', padding:30 }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🅿️</div>
              No held sales right now
            </div>
          )}

          {parked.map(p => (
            <div key={p.id} style={{ padding:'12px 14px', border:'1px solid #e2e8f0',
              borderRadius:10, marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{p.park_number}</div>
                  {p.label && (
                    <div style={{ fontSize:12, color:'#1a2740', marginTop:2 }}>{p.label}</div>
                  )}
                  <div style={{ fontSize:11, color:'#6b7fa3', marginTop:2 }}>
                    {p.first_name} {p.last_name} · {new Date(p.created_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}
                    {' · '}{parseFloat(p.item_count)} item{parseFloat(p.item_count) !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ fontWeight:700, color:'#1e6bbd', fontFamily:'monospace' }}>
                  {fmtCur(p.total_amount)}
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => handleResume(p.id)} disabled={busyId === p.id}
                  style={{ flex:2, padding:9, background:'#1e6bbd', color:'white',
                    border:'none', borderRadius:8, fontSize:12, fontWeight:700,
                    cursor: busyId === p.id ? 'not-allowed' : 'pointer',
                    fontFamily:'sans-serif' }}>
                  {busyId === p.id ? '…' : 'Resume'}
                </button>
                <button onClick={() => handleDiscard(p.id)} disabled={busyId === p.id}
                  style={{ flex:1, padding:9, border:'1px solid #e05c5c',
                    background:'white', color:'#e05c5c', borderRadius:8,
                    fontSize:12, fontWeight:600,
                    cursor: busyId === p.id ? 'not-allowed' : 'pointer',
                    fontFamily:'sans-serif' }}>
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
