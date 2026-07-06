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

// The login response and GET /auth/me both use camelCase
// (firstName/lastName) — ReceiptModal.jsx reads cashier.first_name/
// last_name (snake_case), so without this every receipt showed a
// blank cashier name, fresh login or not.
const normalizeCashier = (u) => u && ({
  ...u,
  first_name: u.first_name || u.firstName,
  last_name:  u.last_name  || u.lastName,
});

export default function POSApp() {
  // A valid pos_token can already be sitting in localStorage from a
  // previous session (that's the whole point of persisting it) — but
  // this used to always start on the login screen regardless, since
  // nothing here ever checked for one before deciding which screen to
  // render. Refreshing the page logged the cashier out every time,
  // even mid-shift. Start on a brief 'loading' screen instead and
  // let the effect below decide once it's confirmed the token (if
  // any) still works.
  const [screen,    setScreen]    = useState('loading');
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

  // ── Rehydrate on page load if a token already exists ──────
  useEffect(() => {
    if (!authToken) { setScreen('login'); return; }

    (async () => {
      try {
        const meRes = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const me = await meRes.json();
        if (!me.success) throw new Error('Session expired');
        setCashier(normalizeCashier(me.data));

        const sessRes = await fetch(`${API}/pos/session/current`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const sessData = await sessRes.json();
        if (sessData.data) {
          setSession(sessData.data);
          setScreen('pos');
        } else {
          setScreen('shift-open');
        }
      } catch {
        // Token expired/invalid — clear it rather than getting stuck
        // showing a broken screen with a token that no longer works.
        localStorage.removeItem('pos_token');
        localStorage.removeItem('pos_org_id');
        setAuthToken(null);
        setOrgId(null);
        setScreen('login');
      }
    })();
    // Only ever run this once on mount — authToken/orgId changing
    // afterward (e.g. right after a fresh login) is handled by
    // handleAuthSuccess instead, not this rehydration effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setCashier(normalizeCashier(user));

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

  // Signs out of the browser only — doesn't touch the shift/session
  // server-side, so whoever's mid-shift just resumes it next time they
  // log back in (same as handleShiftClose, minus the actual shift-close
  // API call). Used by both the "Cancel" button on the shift-open
  // screen and "Logout" on the main POS screen — previously "Cancel"
  // only switched which screen was showing without clearing the stored
  // token, so a page refresh right after would silently pull the
  // previous cashier's session right back.
  const handleLogout = () => {
    setSession(null);
    setCashier(null);
    setAuthToken(null);
    setOrgId(null);
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

      {screen === 'loading' && (
        <div style={{ height:'100%', display:'flex',
          alignItems:'center', justifyContent:'center',
          color:'rgba(255,255,255,.6)', fontSize:14 }}>
          Loading…
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
          onCancel={handleLogout}/>
      )}

      {screen === 'pos' && (
        <POSMainScreen
          apiBase={API}
          token={authToken}
          cashier={cashier}
          session={session}
          socket={socket}
          onCloseShift={handleShiftClose}
          onLogout={handleLogout}/>
      )}
    </div>
  );
}
