/**
 * 安卓一键安装的事件接线（本文件的被测对象是 `beforeinstallprompt` 生命周期）。
 *
 * 为什么这个文件必须存在：这段代码过去只躺在一句注释里
 * （「Android 走 beforeinstallprompt 原生走安装条」），实际零实现。
 * 也就是说，安卓用户点「安装到桌面」永远拿不到真按钮 —— 而这类
 * 「注释声称有、代码没有」的缺口，只有对着事件打桩才测得出来。
 *
 * 四个不变量：
 * 1. `initInstallPrompt` 前不截获事件；截获后 `canPromptInstall()` 为真
 * 2. `preventDefault` 必须被调用，否则 Chrome 会自己弹迷你条，与设置页按钮打架
 * 3. `prompt()` 只能用一次 —— 用过必须清零，否则第二次点按钮会拿到已失效的事件
 * 4. `appinstalled` 之后不能再给按钮（已经装好了）
 *
 * 用假 window 而不是 jsdom 全局：本模块的行为全部围绕 `window.addEventListener`，
 * 自己造一个最小 window 能精确控制「事件何时到达」，比全局打桩更少副作用。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  canPromptInstall,
  getPlatformInfo,
  initInstallPrompt,
  promptInstall,
  shouldConsiderInstallGuide,
  subscribeInstallPrompt,
} from './installGuide';

/** 最小假事件：只实现被测代码会碰到的成员 */
function makePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

const realWindow = globalThis.window;
const realNavigator = globalThis.navigator;

function installFakeWindow(): { fire: (type: string, event: Event) => void; prevented: Event[] } {
  const handlers = new Map<string, Array<(event: Event) => void>>();
  const prevented: Event[] = [];
  const fakeWindow = {
    addEventListener: (type: string, fn: (event: Event) => void) => {
      const list = handlers.get(type) ?? [];
      list.push(fn);
      handlers.set(type, list);
    },
    matchMedia: () => ({ matches: false }),
  };
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true, writable: true });
  return {
    fire: (type, event) => {
      if (type === 'beforeinstallprompt') {
        // 真实 Chrome 的 PreventableEvent：记录 preventDefault 是否被调
        const original = event.preventDefault.bind(event);
        event.preventDefault = () => {
          prevented.push(event);
          original();
        };
      }
      for (const fn of handlers.get(type) ?? []) fn(event);
    },
    prevented,
  };
}

describe('安卓安装事件接线', () => {
  beforeEach(() => {
    // 模块级单例在测试间共享，每个用例都要从干净状态起步
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', { value: realWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true, writable: true });
  });

  it('未调用 initInstallPrompt 时，事件到达也不会有 deferredPrompt', async () => {
    // 关键回归：早期版本从没调用过 init，canPromptInstall 恒为 false
    const fake = installFakeWindow();
    await import('./installGuide').then((m) => {
      fake.fire('beforeinstallprompt', makePromptEvent());
      expect(m.canPromptInstall()).toBe(false);
    });
  });

  it('监听后截获事件：canPromptInstall 为真且调用了 preventDefault', () => {
    const fake = installFakeWindow();
    initInstallPrompt();
    const event = makePromptEvent();
    fake.fire('beforeinstallprompt', event);
    expect(canPromptInstall()).toBe(true);
    // 不 preventDefault 的话 Chrome 会自动弹条，与设置页按钮抢同一个入口
    expect(fake.prevented).toHaveLength(1);
  });

  it('promptInstall 返回用户选择，且无论结果如何都清空事件（只能用一次）', async () => {
    const fake = installFakeWindow();
    initInstallPrompt();

    fake.fire('beforeinstallprompt', makePromptEvent('accepted'));
    await expect(promptInstall()).resolves.toBe(true);
    expect(canPromptInstall()).toBe(false);

    // 第二次调用必须拿到 false，不能复用已失效的事件对象
    await expect(promptInstall()).resolves.toBe(false);
  });

  it('用户拒绝安装时返回 false，但事件同样被清空', async () => {
    const fake = installFakeWindow();
    initInstallPrompt();
    fake.fire('beforeinstallprompt', makePromptEvent('dismissed'));
    await expect(promptInstall()).resolves.toBe(false);
    expect(canPromptInstall()).toBe(false);
  });

  it('没有可用事件时 promptInstall 直接返回 false，不抛错', async () => {
    installFakeWindow();
    initInstallPrompt();
    await expect(promptInstall()).resolves.toBe(false);
  });

  it('appinstalled 之后不再提供按钮', () => {
    const fake = installFakeWindow();
    initInstallPrompt();
    fake.fire('beforeinstallprompt', makePromptEvent());
    expect(canPromptInstall()).toBe(true);
    fake.fire('appinstalled', new Event('appinstalled'));
    expect(canPromptInstall()).toBe(false);
  });

  it('subscribeInstallPrompt 在事件到达时通知订阅者，取消订阅后不再通知', () => {
    const fake = installFakeWindow();
    initInstallPrompt();
    const seen = vi.fn();
    const unsubscribe = subscribeInstallPrompt(seen);

    fake.fire('beforeinstallprompt', makePromptEvent());
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    fake.fire('appinstalled', new Event('appinstalled'));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('平台判定', () => {
  function withUA(ua: string, extra: { touches?: boolean; standalone?: boolean } = {}): void {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: () => ({ matches: extra.standalone === true }) },
      configurable: true,
      writable: true,
    });
    if (extra.touches === true) {
      Object.defineProperty(globalThis, 'document', {
        value: { ontouchend: null },
        configurable: true,
        writable: true,
      });
    }
  }

  const ANDROID_CHROME =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const IOS_SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  it('安卓 Chrome → isAndroid 为真、isIOS 为假', () => {
    withUA(ANDROID_CHROME);
    const info = getPlatformInfo();
    expect(info.isAndroid).toBe(true);
    expect(info.isIOS).toBe(false);
  });

  it('iPhone Safari → isIOS 为真、isAndroid 为假', () => {
    withUA(IOS_SAFARI);
    const info = getPlatformInfo();
    expect(info.isIOS).toBe(true);
    expect(info.isAndroid).toBe(false);
  });

  it('安卓不自动弹安装引导（只在 iOS 弹），但设置页入口始终可达', () => {
    withUA(ANDROID_CHROME);
    // 这是设计决策：安卓有原生安装能力，不该被自动弹窗打断
    expect(shouldConsiderInstallGuide(getPlatformInfo())).toBe(false);
  });

  it('iOS 未安装 → 自动弹；已安装 → 不弹', () => {
    withUA(IOS_SAFARI);
    expect(shouldConsiderInstallGuide(getPlatformInfo())).toBe(true);
    withUA(IOS_SAFARI, { standalone: true });
    expect(shouldConsiderInstallGuide(getPlatformInfo())).toBe(false);
  });

  it('安卓 standalone → installed 为真，设置页不再显示安装入口', () => {
    withUA(ANDROID_CHROME, { standalone: true });
    expect(getPlatformInfo().installed).toBe(true);
  });
});
