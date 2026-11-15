import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 主站用绝对根路径 + History 路由（Caddy try_files → index.html，刷新不 404）。
// DeWEB / IPFS 仍用相对 base，可挂在任意目录。
export default defineConfig(({ mode }) => ({
  base: mode === 'deweb' ? './' : '/',
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
