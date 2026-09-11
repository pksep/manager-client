import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: { dedupe: ['vue'] },
  server: {
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**'] },
  },
  build: {
    rollupOptions: { input: resolve(import.meta.dirname, 'widget.html') },
  },
})
