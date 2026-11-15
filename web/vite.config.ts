import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' 让构建产物可以挂在 DeWEB / IPFS 任意路径下；路由走 hash。
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'deweb-offline-fonts',
      transformIndexHtml: (html) => (mode === 'deweb' ? html.replace(/^\s*<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\n/gm, '') : html),
    },
  ],
  server: {
    port: 5288,
    proxy: { '/api': 'http://localhost:8787' },
    watch: { ignored: ['**/dist/**', '**/dist-deweb/**'] },
    fs: { deny: ['**/dist-deweb/**'] },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
}));
