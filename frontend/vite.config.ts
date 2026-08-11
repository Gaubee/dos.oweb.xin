import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// Vite 配置（纯静态 PWA 站点）。
// covers/emularity/games.json 由 public/ 直接服务。
// PWA：外壳 precache + games.json SWR（发布后重载生效）+ covers/emularity CacheFirst。
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: '中文 DOS 游戏',
        short_name: 'DOS 游戏',
        lang: 'zh-Hans',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 只预缓存外壳（js/css/html），绝不收 png（40MB 封面会超限）
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/dosbox-sync.js'], // 5.3MB 走 runtime
        // 放开 precache 文件大小限制（playcanvas 引擎 2.9MB，precache 让离线可玩）
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // games.json：SWR（秒开旧版 + 后台拉新，发布后重载生效）
            urlPattern: ({ url }) => url.pathname === '/games.json',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'games-json' },
          },
          {
            // featured/mirrors：同 games.json 策略
            urlPattern: ({ url }) =>
              url.pathname === '/featured.json' || url.pathname === '/mirrors.json',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'config-json' },
          },
          {
            // 封面：CacheFirst + 过期控制（量大，不可变假设）
            urlPattern: ({ url }) => url.pathname.startsWith('/covers/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'covers',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // emularity（含 dosbox-sync.js 5.3MB）：CacheFirst
            urlPattern: ({ url }) => url.pathname.startsWith('/emularity/'),
            handler: 'CacheFirst',
            options: { cacheName: 'emularity' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // dev 模式：自托管 zip 源代理到 Go 后端
      '/storage': 'http://localhost:7780',
      // dev 模式：admin API 代理（frontend 也可调 admin API）
      '/api': 'http://localhost:7780',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
