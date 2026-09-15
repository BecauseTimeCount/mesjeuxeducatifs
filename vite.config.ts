import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// Le site est servi à la racine du domaine custom https://jeux.becausetimecounts.fr/
const BASE = '/'

export default defineConfig({
  base: BASE,
  build: {
    // three seul pèse ~700 Ko brut : chunk dédié, chargé uniquement par les jeux arcade
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        // Landing statique à la racine, application (SPA) sous /jouer/
        main: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'jouer/index.html'),
      },
      output: {
        // Piste arcade : three et R3F/drei dans des chunks stables, partagés entre jeux 3D,
        // jamais dans l'entrée `app` (vérifié : grep WebGLRenderer dist/assets/app-*.js → 0)
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('node_modules/@react-three/') || id.includes('node_modules/three-stdlib/')) return 'r3f'
          return undefined
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'v1/*.html', 'audio/**/*'],
      workbox: {
        // webp : décors V3 et sprites arcade ; glb : modèles 3D (meshopt) de la piste arcade
        globPatterns: ['**/*.{js,css,html,svg,png,webp,glb,woff2,mp3,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/jouer/index.html',
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
        start_url: '/jouer/',
        scope: '/',
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
