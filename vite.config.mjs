import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app lives in /client. In development, API requests are proxied to
// the Express server (npm run dev starts both).
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.PORT || 3001}` },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
