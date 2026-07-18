import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // The whole point of this terminal is staying usable with no
    // network — but without a service worker, that only ever covered
    // API calls (the Dexie-queued offline sale). The app SHELL itself
    // (index.html/JS/CSS) still had to come from the network on every
    // load, so a refresh — or the browser/OS restarting the tab — while
    // offline hit Chrome's native "No internet" page instead of the POS
    // UI, with no way back in even after connectivity returned, until
    // the tab was manually reloaded again. This precaches the built
    // shell and serves it for any navigation request the network can't
    // fulfill, so a refresh mid-outage still opens the terminal (API
    // calls still queue offline exactly as before).
    VitePWA({
      registerType: 'autoUpdate',
      // Deliberately NOT enabling devOptions here. vite-plugin-pwa's
      // dev-mode service worker only precaches the entry HTML — Vite's
      // dev server otherwise serves the module graph as many separate
      // on-demand ESM requests, which a service worker can't usefully
      // precache the way it can a real static build. Turning this on
      // under `npm run dev` doesn't actually fix the offline-refresh
      // problem, it just swaps Chrome's honest "No internet" page for a
      // silently blank one — worse, not better. This protection is real
      // (and verified) for `npm run build` + however the build actually
      // gets served, which is what a deployed terminal runs anyway.
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      manifest: {
        name: 'FinSuite POS',
        short_name: 'FinSuite POS',
        start_url: '/',
        display: 'standalone',
        background_color: '#0d1b2a',
        theme_color: '#1e6bbd',
      },
    }),
  ],
  // accounting-api's CORS allowlist (and .env.example/DEPLOYMENT.md)
  // assume the POS client runs on 3001 — without pinning it here, Vite's
  // default (5173) gets silently rejected by the API's CORS check.
  server: {
    port: 3001,
  },
})
