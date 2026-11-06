/**
 * 主题偏好读写。
 *
 * 真正的应用发生在 public/boot-theme.js（同步、首帧前）。这里只是它的类型化入口，
 * 以及给 React 订阅变更用的 hook —— 不重复实现一遍解析逻辑，
 * 否则两处判断不一致时会出现「设置显示浅色、界面是深色」这种最难查的 bug。
 *
 * 为什么存 localStorage 而不是 Dexie：主题必须在首帧前同步读到。IndexedDB 是异步的，
 * 等它读完，浅色用户已经看到一闪而过的深色界面了。
 */

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';

interface BootThemeApi {
  get(): { theme: Theme; preference: ThemePreference };
  set(next: ThemePreference): void;
}

declare global {
  interface Window {
    __theme?: BootThemeApi;
  }
}

/** 极端情况下的兜底（boot-theme.js 被 CSP 拦掉、或在 jsdom 里跑测试） */
function fallbackGet(): { theme: Theme; preference: ThemePreference } {
  const attr = document.documentElement.getAttribute('data-theme');
  const theme: Theme = attr === 'light' ? 'light' : 'dark';
  let preference: ThemePreference = 'system';
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') preference = stored;
  } catch {
    /* 隐私模式 */
  }
  return { theme, preference };
}

export function getThemeState(): { theme: Theme; preference: ThemePreference } {
  return window.__theme?.get() ?? fallbackGet();
}

export function setThemePreference(next: ThemePreference): void {
  if (window.__theme) {
    window.__theme.set(next);
    return;
  }
  /* 兜底路径：至少让界面变了，否则设置页点了没反应比不生效更糟 */
  document.documentElement.setAttribute('data-theme', next === 'system' ? getThemeState().theme : next);
  try {
    if (next === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', next);
  } catch {
    /* 存不进去不影响本次会话 */
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: { preference: next } }));
}

/** 订阅主题变更。返回取消订阅函数，符合 useSyncExternalStore 契约 */
export function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener('themechange', onChange);
  return () => window.removeEventListener('themechange', onChange);
}

/** 给 useSyncExternalStore 用 —— 必须返回稳定值，否则会无限重渲染 */
export function getThemeSnapshot(): string {
  const { theme, preference } = getThemeState();
  return `${preference}|${theme}`;
}
