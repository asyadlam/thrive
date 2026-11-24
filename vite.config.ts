import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'logo-wordmark.png'],
      manifest: {
        name: 'Thrive',
        short_name: 'Thrive',
        description: 'A gentle daily companion for building healthy habits.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF6EF',
        theme_color: '#6B9E7A',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Keep companion images available offline after they've been seen once.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/pets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'thrive-pets', expiration: { maxEntries: 20 } },
          },
          // The Nunito font (Google Fonts), so the app keeps its font offline.
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'thrive-font-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'thrive-font-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
