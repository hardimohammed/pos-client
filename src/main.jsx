import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import POSApp from './POSApp'

// No-ops entirely when VITE_SENTRY_DSN isn't set — local dev never
// needs a Sentry account for this to work.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    tracesSampleRate: 0.1,
  })
}

// Belt-and-suspenders root-level boundary — POSApp itself wraps the
// actual sale/payment screen with a more specific one (see POSApp.jsx),
// this one only catches a crash in login/shift-open, which have no
// in-progress-sale state to lose.
const RootFallback = () => (
  <div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
    background: '#0d1b2a', color: 'white', fontFamily: 'system-ui, sans-serif',
    padding: 24, textAlign: 'center' }}>
    <div style={{ fontSize: 40 }}>⚠️</div>
    <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
    <button
      onClick={() => window.location.reload()}
      style={{ padding: '10px 24px', background: '#1e6bbd', color: 'white',
        border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
        cursor: 'pointer' }}
    >
      Reload
    </button>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<RootFallback />}>
      <POSApp />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)