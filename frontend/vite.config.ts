/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Date tests must not depend on the machine's time zone.
    env: { TZ: 'UTC' },
  },
  build: {
    // maplibre-gl alone is ~1.1 MB minified (~300 kB gzip); it is split into its own chunk.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Keep the large map library in its own long-cacheable chunk.
        manualChunks: { maplibre: ['maplibre-gl'] },
      },
    },
  },
})
