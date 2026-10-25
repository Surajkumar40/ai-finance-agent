import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tests are compiled by the same JSX settings as the app
  oxc: { jsx: { runtime: 'automatic' } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Big libraries get their own files. They change rarely, so browsers keep them between releases,
        // and only the pages that draw charts have to download the chart library.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/recharts|victory-vendor|d3-|internmap|decimal\.js-light|es-toolkit|immer|reselect|redux|react-redux/.test(id)) return 'charts';
          if (/react-router|@remix-run|react-dom|scheduler|[\\/]react[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
})