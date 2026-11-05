import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev only: same /api prefix as nginx in Docker, so the app never needs CORS. API_URL overrides the target.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
})
