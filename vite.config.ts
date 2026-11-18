import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the API runs on :8797 (npm run api); Vite proxies /api so the app and the SSE stream share one origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5197, strictPort: true, proxy: { '/api': { target: 'http://localhost:8797', changeOrigin: false } } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
