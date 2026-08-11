import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Vite 配置：admin SPA，proxy 到 Go 后端 (localhost:7780)。
// /api/admin/* 为管理接口，/covers 为游戏封面静态资源。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:7780',
        changeOrigin: true,
      },
      '/covers': {
        target: 'http://localhost:7780',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
