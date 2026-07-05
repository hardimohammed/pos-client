// ============================================================
//  pos-client/src/screens/ShiftManager.jsx
//  Open and close cashier shifts with float management
// ============================================================
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';

export default function ShiftManager({
  mode, session, apiBase, token, cashier,
  onSessionOpened, onSessionClosed, onCancel,
}) {
  const [float,    setFloat]    = useState('');
  const [counted,  setCounted]  = useState('');
  const [notes,    setNotes]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [summary,  setSummary]  = useState(null);
  const [exporting,setExporting]= useState(false);
  // session (the prop) is set once at open/login and never updated
  // as sales/refunds happen — every sale/refund updates the real
  // totals in pos_sessions server-side, but this screen never saw
  // it. Refetch on open so the close preview shows what's actually
  // in the database instead of stale/zeroed numbers.
  const [liveSession, setLiveSession] = useState(session);

  const authH = {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  useEffect(() => {
    if (mode !== 'close' || !session?.id) return;
    fetch(`${apiBase}/pos/session/current`, { headers: authH })
      .then(res => res.json())
      .then(data => { if (data.success) setLiveSession(data.data); })
      .catch(() => {}); // keep the stale prop as a fallback if this fails
  }, [mode, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpen = async () => {
    if (!float && float !== '0')
      return alert('Please enter opening float amount');
    setLoading(true);
    try {
      const res  = await fetch(`${apiBase}/pos/session/open`, {
        method:  'POST',
        headers: authH,
        body:    JSON.stringify({
          openingFloat: parseFloat(float) || 0,
          terminalName: 'Main Till',
        }),
      });
      const data = await res.json();
      if (!data.success)
        throw new Error(data.message || 'Failed to open shift');
      onSessionOpened({
        id: data.data.id,
        opening_float: parseFloat(float) || 0,
        terminal_name: 'Main Till',
        status: 'open',
      });
    } catch (err) {
      alert(err.message);
    } finally { setLoading(false); }
  };

  const handleClose = async () => {
    if (counted === '')
      return alert('Please count and enter your cash');
    setLoading(true);
    try {
      const res  = await fetch(
        `${apiBase}/pos/session/${session.id}/close`, {
          method:  'POST',
          headers: authH,
          body:    JSON.stringify({
            cashCounted: parseFloat(counted) || 0,
            notes,
          }),
        }
      );
      const data = await res.json();
      if (!data.success)
        throw new Error(data.message || 'Failed to close shift');
      setSummary(data.data);
    } catch (err) {
      alert(err.message);
    } finally { setLoading(false); }
  };

  const fmtCur = (n) =>
    `GH₵ ${parseFloat(n||0).toFixed(2)}`;

  const handleExportPdf = () => {
    if (!summary) return;
    setExporting(true);
    try {
      const cashierName = `${cashier?.first_name || ''} ${cashier?.last_name || ''}`.trim() || 'Cashier';
      const variance = parseFloat(summary.variance || 0);
      const now = new Date();

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const left = 40, right = 555;
      let y = 50;

      doc.setFontSize(18).setFont(undefined, 'bold');
      doc.text('FinSuite POS', left, y);
      doc.setFontSize(10).setFont(undefined, 'normal');
      y += 18;
      doc.text('End-of-Shift Summary', left, y);

      doc.setFontSize(10).setFont(undefined, 'normal');
      doc.text(`Closed: ${now.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}`, 340, 50);
      doc.text(`Cashier: ${cashierName}`, 340, 66);
      doc.text(`Terminal: ${session?.terminal_name || 'Main Till'}`, 340, 82);

      y += 34;
      doc.setDrawColor(220).line(left, y, right, y);
      y += 24;

      const row = (label, value, opts = {}) => {
        doc.setFontSize(opts.big ? 13 : 11).setFont(undefined, opts.bold ? 'bold' : 'normal');
        doc.text(label, left, y);
        doc.setTextColor(...(opts.color || [20, 20, 20]));
        doc.text(value, right, y, { align: 'right' });
        doc.setTextColor(0);
        y += opts.big ? 22 : 18;
      };

      row('Total Sales', fmtCur(summary.totalSales), { bold: true, big: true });
      row('Cash Sales', fmtCur(summary.cashSales));
      row('Mobile Money Sales', fmtCur(summary.momoSales));
      row('Card Sales', fmtCur(summary.cardSales));
      row('Transactions', String(summary.transactions));

      y += 8;
      doc.setDrawColor(220).line(left, y, right, y);
      y += 24;

      row('Opening Float', fmtCur(session?.opening_float));
      row('Expected Cash in Drawer', fmtCur(summary.expectedCash));
      row('Cash Counted', fmtCur(summary.cashCounted));
      row('Variance', fmtCur(variance), {
        bold: true, big: true,
        color: Math.abs(variance) < 0.01 ? [14, 168, 127]
          : variance > 0 ? [30, 107, 189] : [224, 92, 92],
      });

      if (notes) {
        y += 16;
        doc.setFontSize(10).setFont(undefined, 'bold');
        doc.text('Notes', left, y);
        y += 14;
        doc.setFont(undefined, 'normal');
        doc.text(notes, left, y, { maxWidth: right - left });
      }

      const fileCashier = cashierName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const fileDate = now.toISOString().slice(0, 10);
      doc.save(`shift-summary-${fileCashier}-${fileDate}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  // After successful close, show summary then sign out
  if (summary) {
    const variance = parseFloat(summary.variance || 0);
    return (
      <div style={{ position:'fixed', inset:0,
        background:'rgba(13,27,42,.8)',
        display:'flex', alignItems:'center',
        justifyContent:'center', zIndex:9999, padding:20 }}>
        <div style={{ background:'white', borderRadius:20,
          padding:36, width:'100%', maxWidth:440,
          boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:48, marginBottom:8 }}>
              {Math.abs(variance) < 0.01 ? '✅' :
               variance > 0 ? '📈' : '⚠️'}
            </div>
            <div style={{ fontWeight:800, fontSize:20 }}>
              Shift Closed
            </div>
          </div>

          {[
            { label:'Total Sales',
              value:fmtCur(summary.totalSales), bold:true },
            { label:'Cash Sales',
              value:fmtCur(summary.cashSales) },
            { label:'MoMo Sales',
              value:fmtCur(summary.momoSales) },
            { label:'Card Sales',
              value:fmtCur(summary.cardSales) },
            { label:'Transactions',
              value:summary.transactions },
            null,
            { label:'Expected Cash',
              value:fmtCur(summary.expectedCash) },
            { label:'Cash Counted',
              value:fmtCur(summary.cashCounted) },
            { label:'Variance',
              value:fmtCur(variance),
              color: Math.abs(variance) < 0.01
                ? '#16c79a'
                : variance > 0 ? '#1e6bbd' : '#e05c5c',
              bold: true },
          ].map((row, i) => {
            if (!row) return (
              <div key={i} style={{ height:1,
                background:'#e2e8f0', margin:'10px 0' }}/>
            );
            return (
              <div key={i} style={{ display:'flex',
                justifyContent:'space-between',
                marginBottom:8, fontSize:14,
                fontWeight: row.bold ? 700 : 400 }}>
                <span style={{ color:'#6b7fa3' }}>
                  {row.label}
                </span>
                <span style={{ fontFamily:'monospace',
                  color: row.color || '#1a2740' }}>
                  {row.value}
                </span>
              </div>
            );
          })}

          <button
            onClick={handleExportPdf}
            disabled={exporting}
            style={{ width:'100%', marginTop:24,
              padding:12, background:'white',
              color:'#1e6bbd', border:'1.5px solid #1e6bbd',
              borderRadius:12, fontSize:14,
              fontWeight:700,
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontFamily:'sans-serif' }}>
            {exporting ? 'Exporting…' : '⬇ Export PDF Summary'}
          </button>

          <button
            onClick={onSessionClosed}
            style={{ width:'100%', marginTop:10,
              padding:14, background:'#1e6bbd',
              color:'white', border:'none',
              borderRadius:12, fontSize:15,
              fontWeight:700, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'fixed', inset:0,
      background:'rgba(13,27,42,.8)',
      display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:9999, padding:20 }}>
      <div style={{ background:'white', borderRadius:20,
        padding:36, width:'100%', maxWidth:420,
        boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>

        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>
            {mode === 'open' ? '🔓' : '🔒'}
          </div>
          <div style={{ fontWeight:800, fontSize:20 }}>
            {mode === 'open' ? 'Open Shift' : 'Close Shift'}
          </div>
          <div style={{ fontSize:13, color:'#6b7fa3',
            marginTop:4 }}>
            {cashier?.first_name} {cashier?.last_name}
            {' — '}Main Till
          </div>
        </div>

        {mode === 'open' ? (
          <div>
            <label style={{ display:'block', fontSize:12,
              fontWeight:600, color:'#6b7fa3',
              marginBottom:8, textTransform:'uppercase' }}>
              Opening Cash Float (GH₵)
            </label>
            <input
              type="number" min="0" step="0.01"
              autoFocus
              placeholder="e.g. 200.00"
              value={float}
              onChange={e => setFloat(e.target.value)}
              style={{ width:'100%', padding:'16px',
                border:'2px solid #e2e8f0',
                borderRadius:12, fontSize:20,
                fontFamily:'monospace', fontWeight:700,
                textAlign:'center', outline:'none',
                boxSizing:'border-box',
                marginBottom:24 }}/>
          </div>
        ) : (
          <div>
            {liveSession && (
              <div style={{ background:'#f8fafc',
                borderRadius:12, padding:14,
                marginBottom:20, fontSize:13 }}>
                {[
                  { label:'Opening Float',
                    value:fmtCur(liveSession.opening_float) },
                  { label:'Cash Sales',
                    value:fmtCur(liveSession.total_cash_sales) },
                  { label:'Transactions',
                    value:liveSession.total_transactions },
                  { label:'Total Sales',
                    value:fmtCur(liveSession.total_sales),
                    bold:true },
                ].map((r,i) => (
                  <div key={i} style={{ display:'flex',
                    justifyContent:'space-between',
                    marginBottom:6,
                    fontWeight: r.bold ? 700 : 400 }}>
                    <span style={{ color:'#6b7fa3' }}>
                      {r.label}
                    </span>
                    <span style={{ fontFamily:'monospace' }}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <label style={{ display:'block', fontSize:12,
              fontWeight:600, color:'#6b7fa3',
              marginBottom:8, textTransform:'uppercase' }}>
              Cash Counted in Drawer (GH₵)
            </label>
            <input
              type="number" min="0" step="0.01"
              autoFocus
              placeholder="Count cash and enter total"
              value={counted}
              onChange={e => setCounted(e.target.value)}
              style={{ width:'100%', padding:'16px',
                border:'2px solid #e2e8f0',
                borderRadius:12, fontSize:20,
                fontFamily:'monospace', fontWeight:700,
                textAlign:'center', outline:'none',
                boxSizing:'border-box',
                marginBottom:12 }}/>
            <textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ width:'100%', padding:12,
                border:'1px solid #e2e8f0',
                borderRadius:10, fontSize:13,
                fontFamily:'sans-serif', resize:'none',
                height:60, outline:'none',
                boxSizing:'border-box',
                marginBottom:20 }}/>
          </div>
        )}

        <div style={{ display:'flex', gap:12 }}>
          <button onClick={onCancel}
            style={{ flex:1, padding:14,
              border:'1px solid #e2e8f0',
              background:'white', borderRadius:12,
              color:'#6b7fa3', fontSize:14,
              fontWeight:600, cursor:'pointer',
              fontFamily:'sans-serif' }}>
            Cancel
          </button>
          <button
            onClick={mode==='open' ? handleOpen : handleClose}
            disabled={loading}
            style={{ flex:2, padding:14,
              background: loading ? '#6b7fa3' : '#1e6bbd',
              color:'white', border:'none',
              borderRadius:12, fontSize:15,
              fontWeight:700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily:'sans-serif' }}>
            {loading
              ? (mode==='open' ? 'Opening...' : 'Closing...')
              : (mode==='open' ? 'Open Shift' : 'Close Shift')}
          </button>
        </div>
      </div>
    </div>
  );
}
