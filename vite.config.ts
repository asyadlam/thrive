import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Thrive',
        short_name: 'Thrive',
        description: 'A gentle daily companion for building healthy habits.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF6F0',
        theme_color: '#6B9E7A',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Keep companion images available offline after they've been seen once.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/pets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'thrive-pets', expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
});
