import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/embed.ts'),
      name: 'SepManager',
      formats: ['iife', 'es'],
      fileName: (format) => (format === 'iife' ? 'manager.js' : 'manager.mjs'),
    },
  },
})
