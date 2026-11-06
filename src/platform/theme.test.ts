/**
 * 主题偏好的读写契约。
 *
 * 用最小 DOM stub 而不是 jsdom：本模块只碰三样东西（documentElement 的
 * data-theme、localStorage、窗口事件），拉一整个 jsdom 进来启动成本高，
 * 还会在本机 Node 上触发 undici 的加载问题。
 *
 * 测的是三件会静默出错的事：
 *   1. 读不出设置时必须回落到「跟随系统」，而不是硬编码深色
 *   2. set 之后要派发事件，否则设置页的滑块不动（界面与状态脱节）
 *   3. boot-theme.js 不在场时（测试环境 / CSP 拦截）也要能工作，
 *      否则用户点了切换，界面毫无反应
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getThemeSnapshot, getThemeState, setThemePreference, subscribeTheme } from './theme';

type Handler = (event: { type: string }) => void;

let attrs: Record<string, string>;
let store: Map<string, string>;
let handlers: Map<string, Set<Handler>>;

beforeEach(() => {
  attrs = {};
  store = new Map();
  handlers = new Map();

  const element = {
    setAttribute: (name: string, value: string) => {
      attrs[name] = value;
    },
    getAttribute: (name: string) => attrs[name] ?? null,
    removeAttribute: (name: string) => {
      delete attrs[name];
    },
  };

  const target = {
    addEventListener: (type: string, fn: Handler) => {
      const set = handlers.get(type) ?? new Set<Handler>();
      set.add(fn);
      handlers.set(type, set);
    },
    removeEventListener: (type: string, fn: Handler) => {
      handlers.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string }) => {
      handlers.get(event.type)?.forEach((fn) => {
        fn(event);
      });
      return true;
    },
  };

  Object.assign(globalThis, {
    document: { documentElement: element },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
    window: target,
    CustomEvent: class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  });

  delete (globalThis as { __theme?: unknown }).__theme;
});

describe('theme：没有 boot-theme.js 时的兜底', () => {
  it('localStorage 没有值时认为「跟随系统」，不是深色', () => {
    expect(getThemeState().preference).toBe('system');
  });

  it('存了 dark 就返回 dark', () => {
    localStorage.setItem('theme', 'dark');
    expect(getThemeState().preference).toBe('dark');
  });

  it('存了非法值按「跟随系统」处理，不崩', () => {
    localStorage.setItem('theme', 'purple');
    expect(getThemeState().preference).toBe('system');
  });

  it('set 会写进 localStorage 并改 data-theme', () => {
    setThemePreference('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('set system 会删掉 key —— 「跟随系统」不该留下一个显式值', () => {
    localStorage.setItem('theme', 'dark');
    setThemePreference('system');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('set 会派发 themechange，否则界面不知道状态变了', () => {
    const spy = vi.fn();
    window.addEventListener('themechange', spy);
    setThemePreference('dark');
    window.removeEventListener('themechange', spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('theme：有 boot-theme.js 时走它', () => {
  it('优先调用 window.__theme，不重复实现一套判断', () => {
    const set = vi.fn();
    (window as unknown as { __theme?: unknown }).__theme = {
      get: () => ({ theme: 'light', preference: 'system' }),
      set,
    };
    setThemePreference('dark');
    expect(set).toHaveBeenCalledWith('dark');
    // 兜底路径不该同时执行
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('getThemeState 直接用 boot-theme 的解析结果', () => {
    (window as unknown as { __theme?: unknown }).__theme = {
      get: () => ({ theme: 'light', preference: 'system' }),
      set: vi.fn(),
    };
    expect(getThemeState()).toEqual({ theme: 'light', preference: 'system' });
  });
});

describe('theme：useSyncExternalStore 契约', () => {
  it('快照是稳定的字符串，同样状态两次调用相等', () => {
    expect(getThemeSnapshot()).toBe(getThemeSnapshot());
  });

  it('订阅后能收到变更，取消订阅后收不到', () => {
    const spy = vi.fn();
    const unsubscribe = subscribeTheme(spy);
    setThemePreference('dark');
    expect(spy).toHaveBeenCalledTimes(1);
    unsubscribe();
    setThemePreference('light');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
