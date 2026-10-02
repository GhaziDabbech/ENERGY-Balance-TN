import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Citizen portal runs on port 5174 so it doesn't conflict with the
// main STEG operator frontend which runs on 5173.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
