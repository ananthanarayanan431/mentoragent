import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `@/` is src/, for imports across folders (tsconfig.app.json declares the same path).
const src = fileURLToPath(new URL('./src', import.meta.url))

// In development the app is served from :5173 while the API runs on :8000.
// Proxying instead of calling the API cross-origin keeps the browser on one
// origin, so no CORS configuration is needed to run the stack locally.
const BACKEND = process.env.VITE_DEV_BACKEND ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': src },
  },
  server: {
    port: 5173,
    proxy: {
      // `ws: true` is what lets /api/v1/ws/chat upgrade through the proxy.
      '/api': { target: BACKEND, changeOrigin: true, ws: true },
      '/health': { target: BACKEND, changeOrigin: true },
      '/ready': { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    // Source maps make production stack traces readable; they are separate
    // files, so browsers only fetch them when devtools are open.
    sourcemap: true,
    // Phaser is one ~1.4 MB library loaded lazily with the world (create-game);
    // it cannot be split further, so warn only above that.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/app/main.tsx'],
    },
  },
})
