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
    // Big libraries get their own files. They change rarely, so browsers keep them between releases,
    // and only the pages that draw charts have to download the chart library.
    // React is listed first (higher priority) so the chart file does not swallow it and get loaded on every page.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|@remix-run|scheduler)[\\/]/, priority: 20 },
            { name: 'charts', test: /node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+|internmap|decimal\.js-light|es-toolkit|immer|reselect|redux|react-redux|use-sync-external-store|react-is)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})