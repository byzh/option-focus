import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // fail instead of auto-incrementing if port is taken
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
  },
})
