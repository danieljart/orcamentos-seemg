import { defineConfig } from 'vite'
import path from "path"
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

const commitCount = execSync('git rev-list --count HEAD').toString().trim()
const appVersion = `v1.3.0.${commitCount}`

export default defineConfig({
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(appVersion)
  },
  server: {
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      },
      includeAssets: ['icon-192.png', 'icon-512.png', 'template.xlsx'],
      manifest: {
        name: 'Orçamentos SEEMG',
        short_name: 'SEEMG',
        description: 'Plataforma para elaboração de planilhas orçamentárias SEEMG',
        theme_color: '#065f46', // emerald-800
        background_color: '#f8fafc', // slate-50
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
