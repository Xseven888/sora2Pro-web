/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      '/sora/v1/characters': {
        target: 'https://api.sora2.email',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
      '/v1/video': {
        target: 'https://api.sora2.email',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
      '/v1/chat': {
        target: 'https://api.sora2.email',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
    }
  }
})


