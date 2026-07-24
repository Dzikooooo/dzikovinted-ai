import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        lang: 'fr',
        name: 'Resell OS — Le système complet du revendeur Vinted',
        short_name: 'ResellOS',
        description:
          "Génère tes annonces Vinted par IA, détecte les opportunités d'achat et centralise stock et comptabilité.",
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // Dev uniquement : accepte tout hostname (ex. *.trycloudflare.com) --
    // le sous-domaine change a chaque lancement du tunnel Cloudflare.
    allowedHosts: true,
  },
});
