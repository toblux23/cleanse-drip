import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate config, separate build step (see package.json "build" script) —
// this produces one self-contained embed.js (React + ReactDOM + the widget
// + its CSS, all inlined) meant to be loaded directly via <script src> on a
// third-party page, distinct from the main app's index.html/availability.html
// build in vite.config.ts. Kept in its own file because library/IIFE output
// mode doesn't combine cleanly with that build's multi-page-app input config.
export default defineConfig({
  plugins: [react()],
  // Library/IIFE mode doesn't get Vite's usual process.env.NODE_ENV
  // replacement for free — without this, React (and possibly other deps)
  // reference the bare Node global `process`, which doesn't exist in a
  // plain browser <script> context and throws at runtime.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // don't wipe out what vite.config.ts already built
    lib: {
      entry: resolve(__dirname, 'src/embed.tsx'),
      name: 'CleanseDripAvailabilityEmbed',
      formats: ['iife'],
      fileName: () => 'embed.js',
    },
  },
});
