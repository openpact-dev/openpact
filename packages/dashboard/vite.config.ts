import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  root: 'src',
  build: {
    outDir: '../dist/browser',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 7667,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7666',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, '/v1'),
      },
    },
  },
})
