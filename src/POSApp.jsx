// ============================================================
//  pos-client/src/POSApp.jsx
//  Entry point for POS — fixed auth response handling
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import POSLoginScreen from './screens/POSLoginScreen';
import POSMainScreen  from './screens/POSMainScreen';
import ShiftManager   from './screens/ShiftManager';

const API = import.meta.env.VITE_API_URL
  || 'http://localhost:5000/api/v1';

export default function POSApp() {
  const [screen,    setScreen]    = useState('login');
  const [cashier,   setCashier]   = useState(null);
  const [session,   setSession]   = useState(null);
  const [socket,    setSocket]    = useState(null);
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem('pos_token') || null
  );
  const [orgId, setOrgId] = useState(
    () => localStorage.getItem('pos_org_id') || null
  );
  const [paymentAlert, setPaymentAlert] = useState(null);

  // ── Socket.io connection ─────────────────────────────────
  useEffect(() => {
    if (!authToken || !orgId) return;
    const s = io(
      import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000',
      { auth: { token: authToken } }
    );
    s.emit('join_org', orgId);
    s.on('payment_confirmed', (data) => {
      setPaymentAlert(data);
      setTimeout(() => setPaymentAlert(null), 5000);
    });
    setSocket(s);
    return () => s.disconnect();
  }, [authToken, orgId]);

  // ── After login, check for open session ──────────────────
  const handleAuthSuccess = useCallback(
    async (token, user, org) => {
      // Safely extract orgId — handle different response shapes
      const resolvedOrgId =
        org?.id ||
        user?.org_id ||
        user?.orgId ||
        localStorage.getItem('pos_org_id') ||
        '1';

      localStorage.setItem('pos_token', token);
      localStorage.setItem('pos_org_id', String(resolvedOrgId));
      setAuthToken(token);
      setOrgId(String(resolvedOrgId));
      setCashier(user);

      try {
        const res = await fetch(`${API}/pos/session/current`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.data) {
          setSession(data.data);
          setScreen('pos');
        } else {
          setScreen('shift-open');
        }
      } catch {
        setScreen('shift-open');
      }
    },
    []
  );

  const handleSessionOpened = (sess) => {
    setSession(sess);
    setScreen('pos');
  };

  const handleShiftClose = () => {
    setSession(null);
    setCashier(null);
    setAuthToken(null);
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_org_id');
    setScreen('login');
  };

  return (
    <div style={{ height:'100vh', overflow:'hidden',
      fontFamily:'system-ui, sans-serif',
      background:'#0d1b2a' }}>

      {/* Real-time payment success banner */}
      {paymentAlert && (
        <div style={{ position:'fixed', top:0, left:0,
          right:0, zIndex:99999,
          background:'#16c79a', color:'white',
          padding:'16px 24px', textAlign:'center',
          fontSize:18, fontWeight:700,
          boxShadow:'0 4px 20px rgba(0,0,0,.4)' }}>
          ✓ Payment Confirmed!{' '}
          {paymentAlert.saleNumber}{' '}
          — GH₵ {parseFloat(paymentAlert.amount || 0).toFixed(2)}
        </div>
      )}

      {screen === 'login' && (
        <POSLoginScreen
          apiBase={API}
          onSuccess={handleAuthSuccess}/>
      )}

      {screen === 'shift-open' && (
        <ShiftManager
          mode="open"
          apiBase={API}
          token={authToken}
          cashier={cashier}
          onSessionOpened={handleSessionOpened}
          onCancel={() => setScreen('login')}/>
      )}

      {screen === 'pos' && (
        <POSMainScreen
          apiBase={API}
          token={authToken}
          cashier={cashier}
          session={session}
          socket={socket}
          onCloseShift={handleShiftClose}/>
      )}
    </div>
  );
}
