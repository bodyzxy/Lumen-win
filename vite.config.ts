import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tauri 开发模式需要固定端口
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // WebView2（Chromium）和 macOS 上的 WebKit 都支持
    target: ['chrome111', 'safari16.4'],
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
})
