/**
 * 平台探测：安装状态与 iOS 判定。
 *
 * 判断「已安装」必须用 `display-mode: standalone` 或 `navigator.standalone`，
 * **不能按 UA 判断 Safari**：从主屏幕图标打开时 UA 依然是 Safari，
 * 按 UA 会把它误判成「未安装」，用户就会反复看到安装引导（settings.md §4.1 的明确警告）。
 */

export interface PlatformInfo {
  isIOS: boolean;
  isSafari: boolean;
  /** 安卓：可走 beforeinstallprompt 一键安装，不需要逐步引导 */
  isAndroid: boolean;
  installed: boolean;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function getPlatformInfo(): PlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false, isSafari: false, isAndroid: false, installed: false };
  }
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ 的 UA 与 macOS Safari 相同，用触点数区分
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger|QQBrowser|Quark/.test(ua);
  const isAndroid = /Android/.test(ua);
  const standaloneMatch =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const installed = standaloneMatch || (navigator as NavigatorWithStandalone).standalone === true;
  return { isIOS, isSafari, isAndroid, installed };
}

/** 应当在启动后展示安装引导的条件（onboarding-install.md §2） */
export function shouldConsiderInstallGuide(info: PlatformInfo): boolean {
  if (info.installed) return false;
  // 非 iOS 不弹：Android 有 beforeinstallprompt 原生走安装条，桌面没有 7 天清除问题
  return info.isIOS;
}

export const INSTALL_GUIDE_DELAY_MS = 8000;
export const INSTALL_GUIDE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const INSTALL_GUIDE_MAX_DISMISS = 3;

/**
 * 安卓一键安装。
 *
 * 为什么安卓能做「真按钮」而 iOS 不能：iOS Safari 没有任何 API 能让网页触发
 * 「添加到主屏幕」，给按钮等于给假承诺（见 InstallGuide 头注释）。
 * 安卓 Chrome 走 `beforeinstallprompt`，可以存下事件、由用户手势触发原生安装框。
 *
 * 这个事件只会在「满足安装条件」时触发一次，且必须在用户手势里调用 `prompt()`。
 * 所以必须在应用启动时就监听并存下来 —— 等到用户点按钮再监听已经来不及。
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** 在应用入口调用一次，越早越好 */
export function initInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    // 不 preventDefault 的话 Chrome 会自动弹迷你信息条。
    // 这里拦下来，改由设置页的按钮在用户主动点击时调用 —— 默认自动弹条会被
    // 用户当成广告，而设置页是他主动找「怎么装」的地方。
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export function subscribeInstallPrompt(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 必须在用户手势（click）里调用。返回用户是否接受 */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  await event.prompt();
  const choice = await event.userChoice;
  // prompt 只能用一次，无论结果如何都要清掉
  deferredPrompt = null;
  notify();
  return choice.outcome === 'accepted';
}
