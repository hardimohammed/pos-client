// ============================================================
//  pos-client/src/POSApp.jsx
//  Entry point for POS — fixed auth response handling
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { io } from 'socket.io-client';
import POSLoginScreen from './screens/POSLoginScreen';
import POSMainScreen  from './screens/POSMainScreen';
import ShiftManager   from './screens/ShiftManager';

// A render error inside the sale/payment screen used to white-screen
// the entire terminal, mid-sale, with no recovery but a manual reload
// — and a manual reload here is actually fine (session state lives
// server-side in pos_sessions, so the rehydration effect above just
// resumes the same open shift) — but a cashier shouldn't have to
// figure that out themselves from a blank page.
const POSMainScreenFallback = ({ onReload }) => (
  <div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
    background: '#0d1b2a', color: 'white', fontFamily: 'system-ui, sans-serif',
    padding: 24, textAlign: 'center' }}>
    <div style={{ fontSize: 40 }}>⚠️</div>
    <h1 style={{ fontSize: 20, margin: 0 }}>The till hit an unexpected error</h1>
    <p style={{ color: 'rgba(255,255,255,.6)', maxWidth: 420, margin: 0 }}>
      Your shift is still open on the server — reloading will bring you
      right back to it. The current sale in progress will need to be re-rung.
    </p>
    <button
      onClick={onReload}
      style={{ padding: '10px 24px', background: '#1e6bbd', color: 'white',
        border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
        cursor: 'pointer' }}
    >
      Reload
    </button>
  </div>
);

const API = import.meta.env.VITE_API_URL
  || 'http://localhost:5000/api/v1';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Vite bakes VITE_* vars in at BUILD time, not runtime — a deploy
// pipeline that only sets these in a runtime env panel (instead of the
// build step) ships a terminal that silently talks to localhost, which
// then just fails every request with no clue why. Local dev
// (`npm run dev`, unset vars) is unaffected — this only fires for an
// actual production build missing them.
const MISSING_PROD_CONFIG = import.meta.env.PROD && !import.meta.env.VITE_API_URL;

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
  // A refresh while offline used to force a full logout: any failure
  // here — an actually-invalid token, OR simply "fetch couldn't reach
  // the server because there's no network" — was treated identically,
  // clearing the stored token and dropping the cashier back to the
  // login screen. That's correct for the first case, wrong for the
  // second, and doubly wrong for a POS terminal whose entire point is
  // staying usable offline: it meant a refresh mid-outage couldn't just
  // fail to update, it actively logged the cashier out and blocked them
  // from ringing up anything — including syncing the sale still sitting
  // in the offline queue, since that only happens once POSMainScreen is
  // mounted. A network-level failure now keeps the token, falls back to
  // the last-known cashier/session (cached in localStorage on every
  // successful fetch below) so the terminal is immediately usable
  // again, and re-verifies for real the moment the browser's `online`
  // event fires. Only a genuine server-side rejection (expired/invalid
  // token) clears it — that's still a real logout.
  useEffect(() => {
    if (!authToken) { setScreen('login'); return; }

    let cancelled = false;
    const attemptRehydrate = async () => {
      try {
        const meRes = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (meRes.status === 401 || meRes.status === 403) {
          throw Object.assign(new Error('Session expired'), { authFailure: true });
        }
        const me = await meRes.json();
        if (!me.success) throw Object.assign(new Error('Session expired'), { authFailure: true });
        if (cancelled) return;
        const normalized = normalizeCashier(me.data);
        setCashier(normalized);
        localStorage.setItem('pos_cashier_cache', JSON.stringify(normalized));

        const sessRes = await fetch(`${API}/pos/session/current`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const sessData = await sessRes.json();
        if (cancelled) return;
        if (sessData.data) {
          setSession(sessData.data);
          localStorage.setItem('pos_session_cache', JSON.stringify(sessData.data));
          setScreen('pos');
        } else {
          localStorage.removeItem('pos_session_cache');
          setScreen('shift-open');
        }
      } catch (err) {
        if (cancelled) return;
        if (err.authFailure) {
          localStorage.removeItem('pos_token');
          localStorage.removeItem('pos_org_id');
          localStorage.removeItem('pos_cashier_cache');
          localStorage.removeItem('pos_session_cache');
          setAuthToken(null);
          setOrgId(null);
          setScreen('login');
          return;
        }
        // fetch itself threw — offline or unreachable, not a
        // rejection. Fall back to the last-known cashier/session (if
        // any survived a previous successful fetch) so the terminal
        // stays usable through the outage rather than blocking on it.
        const cachedCashier = localStorage.getItem('pos_cashier_cache');
        const cachedSession = localStorage.getItem('pos_session_cache');
        if (cachedCashier && cachedSession) {
          setCashier(JSON.parse(cachedCashier));
          setSession(JSON.parse(cachedSession));
          setScreen('pos');
        } else {
          setScreen('reconnecting');
        }
      }
    };

    attemptRehydrate();
    const retry = () => attemptRehydrate();
    window.addEventListener('online', retry);
    return () => { cancelled = true; window.removeEventListener('online', retry); };
    // Only ever run this once on mount — authToken/orgId changing
    // afterward (e.g. right after a fresh login) is handled by
    // handleAuthSuccess instead, not this rehydration effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Socket.io connection ─────────────────────────────────
  useEffect(() => {
    if (!authToken || !orgId) return;
    const s = io(SOCKET_URL, { auth: { token: authToken } });
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
        localStorage.getItem('pos_org_id');

      // A silent fallback to org 1 here used to mean a login response
      // missing org info would join THIS terminal to org 1's real-time
      // socket room instead of failing — every other terminal's stock/
      // payment/shift-variance events would then show up on a cashier
      // screen that has nothing to do with that org. Fail loudly.
      if (!resolvedOrgId) {
        alert('Login succeeded but the server response is missing organization info — please contact support instead of continuing.');
        return;
      }

      localStorage.setItem('pos_token', token);
      localStorage.setItem('pos_org_id', String(resolvedOrgId));
      setAuthToken(token);
      setOrgId(String(resolvedOrgId));
      const normalized = normalizeCashier(user);
      setCashier(normalized);
      localStorage.setItem('pos_cashier_cache', JSON.stringify(normalized));

      try {
        const res = await fetch(`${API}/pos/session/current`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.data) {
          setSession(data.data);
          localStorage.setItem('pos_session_cache', JSON.stringify(data.data));
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
    localStorage.setItem('pos_session_cache', JSON.stringify(sess));
    setScreen('pos');
  };

  const handleShiftClose = () => {
    setSession(null);
    setCashier(null);
    setAuthToken(null);
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_org_id');
    localStorage.removeItem('pos_cashier_cache');
    localStorage.removeItem('pos_session_cache');
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
    localStorage.removeItem('pos_cashier_cache');
    localStorage.removeItem('pos_session_cache');
    setScreen('login');
  };

  if (MISSING_PROD_CONFIG) {
    return (
      <div style={{ height:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', gap:16,
        background:'#0d1b2a', color:'white', fontFamily:'system-ui, sans-serif',
        padding:24, textAlign:'center' }}>
        <div style={{ fontSize:40 }}>⚠️</div>
        <h1 style={{ fontSize:20, margin:0 }}>POS terminal is not configured</h1>
        <p style={{ color:'rgba(255,255,255,.6)', maxWidth:460, margin:0 }}>
          This build is missing VITE_API_URL, so it would otherwise silently
          try to talk to localhost. Set VITE_API_URL (and VITE_SOCKET_URL) at
          <strong> build time</strong> and redeploy — these are baked in when
          the app is built, not read at runtime.
        </p>
      </div>
    );
  }

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

      {screen === 'reconnecting' && (
        <div style={{ height:'100%', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:12,
          color:'rgba(255,255,255,.8)', textAlign:'center', padding:24 }}>
          <div style={{ fontSize:32 }}>📡</div>
          <div style={{ fontSize:15, fontWeight:600 }}>Waiting for connection…</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', maxWidth:320 }}>
            You're still signed in — this will resume automatically the
            moment the network is back.
          </div>
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
        <Sentry.ErrorBoundary
          fallback={({ resetError }) => (
            <POSMainScreenFallback
              onReload={() => { resetError(); window.location.reload(); }}
            />
          )}
        >
          <POSMainScreen
            apiBase={API}
            token={authToken}
            cashier={cashier}
            session={session}
            socket={socket}
            onCloseShift={handleShiftClose}
            onLogout={handleLogout}/>
        </Sentry.ErrorBoundary>
      )}
    </div>
  );
}
