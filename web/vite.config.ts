import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

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
  resolve: {
    // MetaMask SDK 可选 peer；浏览器侧用内存 stub，避免 Vite 解析失败
    alias: {
      '@react-native-async-storage/async-storage': path.resolve(root, 'src/shims/async-storage.ts'),
    },
  },
  server: {
    port: 5288,
    proxy: { '/api': 'http://localhost:8787' },
    watch: { ignored: ['**/dist/**', '**/dist-deweb/**'] },
    fs: { deny: ['**/dist/**', '**/dist-deweb/**'] },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
}));
