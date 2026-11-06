/**
 * 更新信号总线的时序契约。
 *
 * 这段逻辑唯一的价值就是「不丢事件」，而它最容易出错的场景恰恰是最难
 * 用手点出来的那个：SW 在 UI 挂载之前就报告了新版本。
 * 三个用例分别钉住：先到先存、后到直投、取消订阅不吞消息。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  notifyUpdateReady,
  resetUpdateSignal,
  subscribeUpdateReady,
} from './updateSignal';

beforeEach(() => {
  resetUpdateSignal();
});

describe('updateSignal', () => {
  it('订阅之前到达的更新，订阅时补发一次', () => {
    const handler = vi.fn();
    notifyUpdateReady(() => {});
    subscribeUpdateReady(handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(typeof handler.mock.calls[0]?.[0]).toBe('function');
  });

  it('已订阅时直接投递，不留下 pending', () => {
    const first = vi.fn();
    subscribeUpdateReady(first);
    notifyUpdateReady(() => {});
    expect(first).toHaveBeenCalledTimes(1);

    // 若 pending 被残留，第二个消费者会莫名其妙收到一次旧事件
    const second = vi.fn();
    subscribeUpdateReady(second);
    expect(second).not.toHaveBeenCalled();
  });

  it('补发只发生一次，第二个订阅者不会再收到同一条', () => {
    const first = vi.fn();
    notifyUpdateReady(() => {});
    subscribeUpdateReady(first);

    const second = vi.fn();
    subscribeUpdateReady(second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('取消订阅后再来更新，新订阅者仍能收到（消息不被取消动作吞掉）', () => {
    const unsub = subscribeUpdateReady(vi.fn());
    unsub();
    notifyUpdateReady(() => {});

    const next = vi.fn();
    subscribeUpdateReady(next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('新订阅覆盖旧订阅，旧 handler 不再被调用', () => {
    const old = vi.fn();
    subscribeUpdateReady(old);
    subscribeUpdateReady(vi.fn());
    notifyUpdateReady(() => {});
    expect(old).not.toHaveBeenCalled();
  });

  it('取消订阅只解除自己，不影响后来者', () => {
    const first = vi.fn();
    const unsubFirst = subscribeUpdateReady(first);
    const second = vi.fn();
    subscribeUpdateReady(second);
    unsubFirst();
    notifyUpdateReady(() => {});
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
