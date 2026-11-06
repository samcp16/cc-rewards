/**
 * 「更新已就绪」信号总线。
 *
 * 为什么要有这一层，而不是让 registerServiceWorker 直接回调 UI：
 * `virtual:pwa-register` 是构建期注入的虚拟模块，在 vitest（node 环境、
 * 不跑 vite 插件）里根本不存在。把「暂存 + 补发」这段唯一的时序逻辑
 * 放在 import 了虚拟模块的文件里，就永远没有测试能覆盖它 ——
 * 而它恰恰是最容易写错的一段（先到的事件会因为还没人订阅而被丢掉）。
 *
 * 所以：信号总线纯函数、可测；registerServiceWorker 只负责把 SW 的回调
 * 翻译成一次 notify，UI 层只管订阅。
 *
 * 一个 updateSignal 只有一个消费者（App 里那一个 banner）。不做多播，
 * 因为多播意味着「谁负责在更新后重载」这件事有第二个答案。
 */

/** 执行更新的动作。调它 = skipWaiting + 由 workbox-window 负责 reload。 */
export type ApplyUpdate = () => void;

type UpdateHandler = (apply: ApplyUpdate) => void;

let handler: UpdateHandler | undefined;
let pending: ApplyUpdate | undefined;

/**
 * SW 报告有新版本。
 *
 * 若此时 UI 还没订阅（首屏就检测到更新：SW 注册与 React 挂载是赛跑关系），
 * 先把动作暂存，等订阅到来立刻补发。丢掉这一条等于让用户永远停在旧版。
 */
export function notifyUpdateReady(apply: ApplyUpdate): void {
  if (handler) {
    handler(apply);
    return;
  }
  pending = apply;
}

/**
 * UI 订阅更新就绪事件。返回值用于卸载时取消订阅。
 *
 * 注意这里用 `=` 而不是 add 进集合：同一时刻只允许一个消费者，
 * 后来的覆盖先来的（StrictMode 双挂载下这是正确行为，不是 bug）。
 */
export function subscribeUpdateReady(next: UpdateHandler): () => void {
  handler = next;
  if (pending) {
    const apply = pending;
    pending = undefined;
    next(apply);
  }
  return () => {
    if (handler === next) handler = undefined;
  };
}

/** 仅供测试：清空模块级状态，避免用例之间互相污染。 */
export function resetUpdateSignal(): void {
  handler = undefined;
  pending = undefined;
}
