import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // Separate real HTML entry (not a hash route on index.html) so it can
        // carry its own, more permissive frame-ancestors CSP for embedding —
        // see vercel.json.
        availability: resolve(__dirname, 'availability.html'),
      },
    },
  },
});
