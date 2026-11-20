/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE permite publicar en un subdirectorio (p.ej. GitHub Pages: /pam-eps/)
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // ExcelJS (~1 MB) solo se usa al importar/exportar: se descarga cuando hace falta
        globIgnores: ['**/exceljs*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Planes de acciones de mejora · EPS',
        short_name: 'Planes mejora',
        description: 'Gestión de los planes de acciones de mejora de la Escuela Politécnica Superior',
        lang: 'es',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#4263eb',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
