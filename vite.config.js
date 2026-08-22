import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward /api/* to the local serverless functions dev server so the SPA
      // can reach /api/ai/* during local development (mirrors Vercel, where the
      // api/* directory is served as serverless Functions). `vercel dev` serves
      // on http://localhost:3000 by default; override with VITE_API_PROXY_TARGET
      // if your local functions run elsewhere.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
