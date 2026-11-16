import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/** 线上 API；本地默认代理过去，读真实运营库。 */
const PROD_API = 'https://chipet.web3book.io';

function apiProxy(target: string): ProxyOptions {
  const toHttps = target.startsWith('https://');
  return {
    target,
    changeOrigin: true,
    secure: toHttps,
    // 上游若是 HTTPS，会下发 Secure Cookie；浏览器在 http://localhost 存不下 → 剥掉 Secure/Domain
    configure: (proxy) => {
      proxy.on('proxyRes', (proxyRes) => {
        const raw = proxyRes.headers['set-cookie'];
        if (!raw) return;
        const list = Array.isArray(raw) ? raw : [raw];
        proxyRes.headers['set-cookie'] = list.map((c) =>
          c.replace(/;\s*Secure/gi, '').replace(/;\s*Domain=[^;]*/gi, ''));
      });
    },
  };
}

// 主站用绝对根路径 + History 路由（Caddy try_files → index.html，刷新不 404）。
// DeWEB / IPFS 仍用相对 base，可挂在任意目录。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  // 开发默认打线上；要打本机 API：VITE_API_PROXY=http://localhost:8787
  const apiTarget = (env.VITE_API_PROXY || (mode === 'development' ? PROD_API : 'http://localhost:8787')).replace(/\/$/, '');

  if (mode === 'development') {
    console.log(`[vite] /api → ${apiTarget}`);
  }

  return {
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
      proxy: { '/api': apiProxy(apiTarget) },
      // 只忽略本包构建产物；勿用 **/dist/**，会误伤 node_modules/@rainbow-me/.../dist/index.css
      watch: {
        ignored: [
          path.resolve(root, 'dist'),
          path.resolve(root, 'dist-deweb'),
        ],
      },
      fs: {
        deny: [
          path.resolve(root, 'dist'),
          path.resolve(root, 'dist-deweb'),
        ],
      },
    },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  };
});
