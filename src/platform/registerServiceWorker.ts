/**
 * Service Worker 注册。
 *
 * 为什么单独成文件而不是塞进 main.tsx：main 的职责是装配视图，
 * 而这里涉及与浏览器生命周期的交互（更新提示、离线就绪），属于平台层。
 *
 * 为什么是 prompt 而非 autoUpdate（与 vite.config.ts 的 registerType 对应）：
 * 卡库是用户手改的数据。用户正在编辑规则时 app 被静默换成新版本，
 * 表单里未保存的输入会原地消失且没有任何解释。宁可让用户自己选时机。
 *
 * 「暂存 + 补发」的时序在这个文件之外（updateSignal.ts），因为那个文件
 * 可测；这里 import 了虚拟模块，只有真实构建环境才存在。
 */

import { registerSW } from 'virtual:pwa-register';
import { notifyUpdateReady } from './updateSignal';

/** 后台检查更新的间隔。本产品数据变化频率是「天」级，更密只增加耗电。 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

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
        notifyUpdateReady(() => {
          void updateSW(true);
        });
      },
      onOfflineReady() {
        console.warn('离线壳已就绪：断网后仍可打开应用。');
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;

        const check = (): void => {
          // 只在前台检查：手机 PWA 经常整夜留在后台，
          // 那个时段的轮询既拿不到新版本也没有意义。
          if (document.visibilityState !== 'visible') return;
          void registration.update();
        };

        setInterval(check, UPDATE_CHECK_INTERVAL_MS);

        // 手机上「切回应用」比「等满一小时」常见得多。
        // 不补这一条，用户可能整整一天都收不到更新提示。
        document.addEventListener('visibilitychange', check);
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
