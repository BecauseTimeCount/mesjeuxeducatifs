import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// Le site est servi à la racine du domaine custom https://jeux.becausetimecounts.fr/
const BASE = '/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'v1/*.html', 'audio/**/*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: `${BASE}index.html`,
        // Les jeux V1 sont de vraies pages HTML précachées, pas des routes SPA
        navigateFallbackDenylist: [/\/v1\//],
      },
      manifest: {
        name: 'Mes Jeux Éducatifs',
        short_name: 'Mes Jeux',
        description:
          "Jeux éducatifs gratuits, sans pub et sans compte, pour les enfants de 4 à 7 ans — alignés sur les programmes officiels.",
        lang: 'fr',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE,
        scope: BASE,
        background_color: '#fdf6ec',
        theme_color: '#0e7490',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
