/**
 * 启动期的一次性副作用（平台层）。
 *
 * 两件事，都必须在「用户看到界面之前」就发起，晚一步就来不及：
 *
 * 1. `navigator.storage.persist()`（AC-F11-02）。申请持久化存储，
 *    降低浏览器在空间紧张时清掉 IndexedDB 的概率。结果要能被设置页读到 ——
 *    「浏览器没给权限」是用户必须知道的事（settings.md §8）。
 * 2. 卡库播种。放在这里而不是某个页面里：用户可能直接从 /settings 进来，
 *    那时主查询页从未挂载，卡库若还没播种，额度页与卡库页都会是空的。
 *
 * 为什么用模块级单例 Promise 而不是 useEffect：React StrictMode 在开发模式
 * 会把 effect 跑两遍，播种逻辑虽然幂等，但 transaction 会真的执行两次。
 */

import { seedCardsIfNeeded, syncPresetCardsIfOutdated } from '../db/cardsRepository';

export type PersistState = 'granted' | 'denied' | 'unsupported' | 'pending';

let persistState: PersistState = 'pending';
const persistListeners = new Set<(state: PersistState) => void>();

function setPersistState(next: PersistState): void {
  persistState = next;
  for (const listener of persistListeners) listener(next);
}

export function getPersistState(): PersistState {
  return persistState;
}

export function onPersistState(listener: (state: PersistState) => void): () => void {
  persistListeners.add(listener);
  listener(persistState);
  return () => {
    persistListeners.delete(listener);
  };
}

async function requestPersist(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    setPersistState('unsupported');
    return;
  }
  try {
    const granted = await navigator.storage.persist();
    setPersistState(granted ? 'granted' : 'denied');
  } catch {
    setPersistState('denied');
  }
}

let bootstrapPromise: Promise<void> | null = null;

/** 幂等：多次调用只会真正执行一次 */
export function bootstrapApp(): Promise<void> {
  bootstrapPromise ??= (async () => {
    // 先播种（首次用户），再升级（老用户拿到新卡库数据）。
    // 顺序不能反：新用户还没卡，直接跑升级会先把版本号推到最新，
    // 随后播种写入的却是同版本数据 —— 看起来对，但版本号已经失去意义。
    await Promise.all([requestPersist(), seedCardsIfNeeded()]);
    await syncPresetCardsIfOutdated();
  })();
  return bootstrapPromise;
}
