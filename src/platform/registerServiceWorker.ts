/**
 * Service Worker 注册。
 *
 * 为什么单独成文件而不是塞进 main.tsx：main 的职责是装配视图，
 * 而这里涉及与浏览器生命周期的交互（更新提示、离线就绪），属于平台层。
 *
 * 为什么是 prompt 而非 autoUpdate（与 vite.config.ts 的 registerType 对应）：
 * 卡库是用户手改的数据。用户正在编辑规则时 app 被静默换成新版本，
 * 表单里未保存的输入会原地消失且没有任何解释。宁可让用户自己选时机。
 */

import { registerSW } from 'virtual:pwa-register';

/** 更新可见时的处置方式，由 UI 层提供。 */
type UpdateReadyHandler = (apply: () => void) => void;

let updateReadyHandler: UpdateReadyHandler | undefined;

/**
 * UI 层注册「有新版本」提示。返回取消注册函数。
 *
 * 注意时序：SW 的 onNeedRefresh 可能在 UI 挂载之前就触发
 * （首屏就检测到新版本），所以这里会把「待处理的更新」暂存，
 * 等 UI 注册时立刻补发一次 —— 否则那条最该被看到的提示会丢。
 */
export function listenForUpdate(handler: UpdateReadyHandler): () => void {
  updateReadyHandler = handler;
  if (pendingApply) {
    handler(pendingApply);
    pendingApply = undefined;
  }
  return () => {
    if (updateReadyHandler === handler) updateReadyHandler = undefined;
  };
}

/** 待补发的更新动作。onNeedRefresh 先于 UI 挂载时暂存于此。 */
let pendingApply: (() => void) | undefined;

export function registerServiceWorker(): void {
  // dev 环境不注册（vite.config.ts 里 devOptions.enabled = false）。
  // 这里再判一次，防止某些预览环境误开。
  if (import.meta.env.DEV) return;

  try {
    // registerSW 同步返回 updateSW 函数；必须在同一次调用里接住它，
    // 否则 onNeedRefresh 内部拿不到「应用更新」的入口。
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        const apply = (): void => {
          void updateSW(true);
        };
        if (updateReadyHandler) {
          updateReadyHandler(apply);
        } else {
          pendingApply = apply;
        }
      },
      onOfflineReady() {
        console.warn('离线壳已就绪：断网后仍可打开应用。');
      },
      onRegisteredSW(_swUrl, registration) {
        // 每小时检查一次更新。本产品数据变化频率是「天」级，
        // 更频繁的轮询只增加耗电，没有收益。
        if (!registration) return;
        setInterval(
          () => {
            void registration.update();
          },
          60 * 60 * 1000,
        );
      },
      onRegisterError(error) {
        // SW 注册失败不影响功能，但要让开发者在控制台看见
        console.error('Service Worker 注册失败：', error);
      },
    });
  } catch (error) {
    // PWA 未注入或浏览器不支持：引擎与界面在没有 SW 时完全可用，
    // 只是少了离线壳。不能因为 SW 失败就让 app 白屏。
    console.error('Service Worker 不可用，应用将以在线模式运行：', error);
  }
}
