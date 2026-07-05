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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <POSApp />
  </React.StrictMode>,
)