import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

/**
 * Vite 配置。
 *
 * 三个决策点，都不是「默认值顺手用了」：
 *
 * 1. **CSP 用 meta 标签下发，且 connect-src 'none'。**
 *    这是「数据不出设备」的技术保证，不是文案承诺（SPEC O2）。
 *    但 Vite 的 HMR 需要 WebSocket，dev 模式下放开 connect-src 到 ws:，
 *    生产构建则完全禁止。若两处用同一份策略，app 会在 dev 里连不上 HMR，
 *    或者生产环境漏留一个 ws 口子——两种都比不留 CSP 更糟。
 *
 * 2. **PWA 的 runtimeCaching 用 NetworkFirst + 3s 超时。**
 *    澳门室内 / 内地漫游下 fetch 可能挂起数十秒，无限等待会让用户以为 app 挂了。
 *    3s 后回落缓存，是「宁可看到略旧的壳，也不要空白屏」。
 *
 * 3. **alias 手写而不用 tsconfig paths 自动同步。**
 *    TS7 移除了 baseUrl，paths 的解析规则变了；与其引入一个自动同步插件
 *    （多一个依赖 + 多一个可能失配的环节），不如两处各写一行、保持一致。
 */

const SRC = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  /**
   * 生产环境不含任何外部 origin。
   * 'unsafe-inline' 用于 style：Tailwind v4 与 React 的 style 属性都需要它，
   * 且本项目不接任何用户可控的 HTML，注入面为零。
   */
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    isDev ? "connect-src 'self' ws: http://localhost:*" : "connect-src 'none'",
    "form-action 'none'",
    // frame-ancestors 只能经 HTTP 头下发，写在 meta 里浏览器直接忽略并报
    // 控制台错误。部署到静态托管时用 _headers / vercel.json 补这条。
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  return {
    base: './',
    resolve: {
      alias: { '@': SRC },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        // 把 CSP 注入 index.html。放在插件里而不是手写进 index.html，
        // 是为了让 dev / prod 两套策略由同一处代码决定，避免手改漏改。
        name: 'inject-csp-meta',
        transformIndexHtml(html) {
          return html.replace(
            '<!--CSP-->',
            `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
          );
        },
      },
      VitePWA({
        // prompt 而非 autoUpdate：卡库是用户手改的数据，
        // 在用户正在编辑时静默换掉整个 app 会让表单状态凭空消失。
        registerType: 'prompt',
        injectRegister: 'auto',
        includeAssets: ['icons/apple-touch-icon.png'],
        manifest: {
          name: '刷哪张',
          short_name: '刷哪张',
          description: '付款前比较港澳信用卡净回报率',
          lang: 'zh-Hans',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          // 与 design-tokens 的 --surface-0 一致：启动画面不能闪白屏
          background_color: '#0B0E14',
          theme_color: '#0B0E14',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // 单页 app 的导航兜底：任何路径都回 index.html
          navigateFallback: 'index.html',
          // 逐项预缓存而非 cache.addAll：一个图标 404 不该让整个安装失败，
          // 否则用户连离线壳都没有。plugin 默认行为即如此，不要手写覆盖。
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          runtimeCaching: [
            {
              // 页面导航：弱网下 3s 必回退，不让用户对着白屏等
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'html-shell',
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
              },
            },
            {
              // 静态资源带 hash，命中即固定，用 CacheFirst 最短路径
              urlPattern: ({ request }) =>
                request.destination === 'script' ||
                request.destination === 'style' ||
                request.destination === 'font' ||
                request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: { maxEntries: 64, maxAgeSeconds: 365 * 24 * 60 * 60 },
              },
            },
          ],
        },
        devOptions: {
          // dev 下不启用 SW：否则改了代码刷新还是旧的，
          // 会浪费掉每个开发者每天几十次的排查时间
          enabled: false,
        },
      }),
    ],
    build: {
      target: 'es2022',
      sourcemap: false, // Tailwind v4 插件不产 sourcemap，开着只会得到 [SOURCEMAP_BROKEN] 噪音；生产排错用 dev 环境代替
      rollupOptions: {
        output: {
          // 把不常变的依赖拆出来：卡库数据在用户手里，
          // 每次改 UI 不该让用户重下 React。
          //
          // 用函数形式而非 { react: ['react','react-dom'] } 对象形式：
          // Rollup 4.5x 起对象形式在类型上已归入 ManualChunksFunction 的重载，
          // TypeScript 会判定不匹配。函数形式同样是官方推荐写法。
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
              return 'react';
            }
            if (id.includes('node_modules/dexie')) {
              return 'dexie';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
