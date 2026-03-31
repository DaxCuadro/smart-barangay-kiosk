// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-calendar': ['react-calendar'],
          'vendor-holidays': ['date-holidays'],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),  // Official Vite plugin for Tailwind v4 – handles everything automatically
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true  // Enables PWA testing in dev (offline mode, manifest, etc.)
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*$/i,
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*$/i,
            handler: 'CacheFirst',
            method: 'GET',
            options: {
              cacheName: 'supabase-storage-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
        ],
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Smart Barangay Kiosk',
        short_name: 'Barangay Kiosk',
        description: 'Offline-first document requests & resident management for Philippine barangays',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
          // Add more sizes/icons later from realfavicongenerator.net
        ]
      }
    })
  ]
});