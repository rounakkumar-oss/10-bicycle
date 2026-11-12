import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function hoistImportmapsFirst(html: string): string {
  const importmapRe = /<script\b[^>]*\btype\s*=\s*['"]importmap['"][^>]*>[\s\S]*?<\/script>/gi;
  const blocks: string[] = [];
  const stripped = html.replace(importmapRe, (m) => {
    blocks.push(m);
    return '';
  });
  if (blocks.length === 0) return html;
  const headMatch = /<head\b[^>]*>/i.exec(stripped);
  if (!headMatch) {
    return blocks.join('\n') + '\n' + stripped;
  }
  const insertPos = headMatch.index + headMatch[0].length;
  return (
    stripped.slice(0, insertPos) +
    '\n  ' +
    blocks.join('\n  ') +
    stripped.slice(insertPos)
  );
}

function pelicanGstaticAssetsPlugin(): Plugin {
  return {
    name: 'pelican-gstatic-assets',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        return hoistImportmapsFirst(html);
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    pelicanGstaticAssetsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      manifest: {
        id: '/',
        name: 'Pelican Campus Quest · Mountain View Open World',
        short_name: 'PelicanQuest',
        description: 'Mountain View Open-World 3D Bicycle Game: 16 TPU Hunt, Gym Breakout, Free Roam & Story Auto-Pilot.',
        theme_color: '#0D1017',
        background_color: '#0D1017',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 6000,
  },
});
