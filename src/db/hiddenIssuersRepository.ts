/**
 * 「添加卡片」候选列表里被藏起来的银行。
 *
 * 为什么不复用 `deletedPresetCards`：那个键的语义是「我删掉了这张卡」，
 * 作用是防止卡库升级把它塞回我的卡库。隐藏银行是另一件事 —— 一张卡都没删，
 * 只是不想在候选列表里反复看见。混用一个键，点「恢复」会把用户真删掉的卡
 * 一起复活，那是数据事故，不是误操作。
 *
 * 存的是 `region|issuer` 而不是卡片 id：银行是分组单位，卡增减不该让
 * 「藏了这家」这件事失效。以后卡库给某家银行加第 5 张卡，它依然是藏着的。
 */

import { db } from './schema';
import { issuerKey } from '../lib/issuerGroups';

/** settings 表里的内部键，UI 不展示 */
export const KEY_HIDDEN_ISSUERS = 'hiddenIssuers';

interface HiddenValue {
  keys?: string[];
}

export async function getHiddenIssuers(): Promise<Set<string>> {
  const row = await db.settings.get(KEY_HIDDEN_ISSUERS);
  const keys = (row?.value as HiddenValue | undefined)?.keys;
  return new Set<string>(Array.isArray(keys) ? keys : []);
}

async function writeHidden(keys: string[]): Promise<void> {
  await db.settings.put({ key: KEY_HIDDEN_ISSUERS, value: { keys } });
}

/** 藏一家银行。幂等：重复调用不会写出重复项。 */
export async function hideIssuer(region: 'MO' | 'HK', issuer: string): Promise<void> {
  const key = issuerKey(region, issuer);
  await db.transaction('rw', db.settings, async () => {
    const current = await getHiddenIssuers();
    if (current.has(key)) return;
    await writeHidden([...current, key]);
  });
}

/** 让一家银行重新出现。 */
export async function unhideIssuer(region: 'MO' | 'HK', issuer: string): Promise<void> {
  const key = issuerKey(region, issuer);
  await db.transaction('rw', db.settings, async () => {
    const current = await getHiddenIssuers();
    if (!current.has(key)) return;
    await writeHidden([...current].filter((k) => k !== key));
  });
}

/** 一次全恢复。清空整个键，而不是逐条删 —— 少一次读，也少一个「删了一半」的中间态。 */
export async function unhideAllIssuers(): Promise<void> {
  await db.settings.delete(KEY_HIDDEN_ISSUERS);
}
