import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
//
// LOCAL DEVELOPMENT CONFIGURATION REQUIREMENT:
// The FastAPI backend uses SameSite=Lax session cookies. For cookies to be
// sent correctly in development, both the frontend dev server and the backend
// must appear to the browser as the same origin.
//
// Required setup:
//   1. Run the frontend dev server on localhost:5173 (default: `npm run dev`)
//   2. Run the FastAPI backend on 127.0.0.1:8000
//   3. The CORS allow_origins in backend/app/main.py must include
//      "http://localhost:5173" (already configured).
//
// The proxy below forwards all /api/* requests from the Vite dev server to
// the backend so the browser sees a single origin (localhost:5173), which
// ensures the session cookie is included automatically.
//
// In production, serve the built frontend from the same domain/port as the
// backend (e.g. via a reverse proxy such as nginx), so no proxy config is
// needed there.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      // Forward all /api/* requests to FastAPI backend during development.
      // This makes both the frontend and API share localhost:5173 as their
      // origin, so the SameSite=Lax sentinel_session cookie is included.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  },
});

