/**
 * 应用入口 —— 只装配，不做别的（ARCHITECTURE §5：main.tsx < 40 行）。
 *
 * 三个 import 的顺序有实际意义：
 *   1. design-tokens + index.css 必须在任何组件之前求值，
 *      否则 React 首帧渲染时 CSS 变量还没挂上，会闪一帧无色内容；
 *   2. App 不做懒加载：本产品首屏就是答案页，
 *      拆包只会把「3 秒出结果」变成「3 秒 + 一次 chunk 往返」。
 *
 * 路由用 HashRouter 而不是 BrowserRouter：
 * 本产品是纯静态 PWA，用户可能把它装到主屏、也可能被托管在任意子路径
 * （GitHub Pages / 内网目录 / CDN 前缀）。BrowserRouter 的 /cards 这类深链
 * 在刷新时会向服务器请求 /cards，静态托管没有回退规则就是 404 ——
 * 离线时 Service Worker 的 navigateFallback 也救不了「用户先清了缓存」的场景。
 * HashRouter 把路径放在 # 后，永不发请求，离线刷新天然安全（AC-F11-03）。
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import { App } from './App';
import { bootstrapApp } from './platform/bootstrap';
import { initInstallPrompt } from './platform/installGuide';
import { registerServiceWorker } from './platform/registerServiceWorker';

const container = document.getElementById('root');
if (!container) {
  // 走到这里说明 index.html 与 main.tsx 不同步（构建配置错误），
  // 静默失败会让用户看到永久空白页，所以宁可抛错留下明确栈信息
  throw new Error('挂载点 #root 不存在：检查 index.html');
}

// 播种卡库与申请持久化存储。不 await：首屏不该等 IndexedDB，
// 各页面用 useLiveQuery / loaded 标志处理「还没读出来」的那一帧。
void bootstrapApp();

// 安卓安装事件只触发一次，且必须在它到达之前就挂好监听 ——
// 放到设置页组件里监听等于永远收不到（用户点开设置时事件早就发过了）。
// 这里拦下事件、不自动弹框，交给设置页的按钮在用户主动点击时触发。
initInstallPrompt();

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

registerServiceWorker();
