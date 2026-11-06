/**
 * 卡库数据升级 —— 让「补好的官方数据」真的能到达老用户手机上。
 *
 * 为什么必须测这件事的**保护分支**而不只是「能不能更新」：
 * 升级是唯一会覆盖用户数据的代码路径。覆盖错了，用户改过的额度算法、
 * 删掉的卡都会在某个早上悄悄复活或被改回去 —— 那种 bug 用户不会报错，
 * 只会发现「怎么算的不对了」，然后不再信任这个工具。
 *
 * 三条保护各有一个用例锁住：用户改过的行、用户删过的卡、用户自建的副本。
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  CARDS_DATA_VERSION,
  KEY_CARDS_DATA_VERSION,
  KEY_DELETED_PRESETS,
  deleteCard,
  putCard,
  seedCardsIfNeeded,
  syncPresetCardsIfOutdated,
} from './cardsRepository';

async function reset(): Promise<void> {
  await db.delete();
  await db.open();
}

/** 把版本号改回 0，模拟「装在手机上的老版本」 */
async function pretendOldInstall(): Promise<void> {
  await db.settings.put({ key: KEY_CARDS_DATA_VERSION, value: { version: 0 } });
}

async function currentVersion(): Promise<number> {
  const row = await db.settings.get(KEY_CARDS_DATA_VERSION);
  const v = (row?.value as { version?: number } | undefined)?.version;
  return typeof v === 'number' ? v : 0;
}

describe('卡库数据升级', () => {
  beforeEach(reset);

  it('新安装播种后版本即最新，同步是空操作', async () => {
    await seedCardsIfNeeded();
    expect(await currentVersion()).toBe(CARDS_DATA_VERSION);

    const result = await syncPresetCardsIfOutdated();
    expect(result).toEqual({ updated: 0, kept: 0 });
  });

  it('老版本安装：同步把 12 张预置卡刷成新数据', async () => {
    await seedCardsIfNeeded();
    await pretendOldInstall();
    // 制造「旧数据」：把某张卡的名字改旧，但走 bulkPut 不打 editedByUser 标记
    const card = await db.cards.get('boc-hk-chill');
    expect(card).toBeDefined();
    await db.cards.put({ ...card!, cardName: '旧名字', editedByUser: false });

    const result = await syncPresetCardsIfOutdated();

    expect(result.updated).toBe(12);
    expect(result.kept).toBe(0);
    expect(await currentVersion()).toBe(CARDS_DATA_VERSION);
    const after = await db.cards.get('boc-hk-chill');
    expect(after?.cardName).not.toBe('旧名字');
  });

  it('用户改过的行不被覆盖 —— 他调过的值就是真实情况', async () => {
    await seedCardsIfNeeded();
    await pretendOldInstall();

    const card = await db.cards.get('mox-credit');
    expect(card).toBeDefined();
    await putCard({ ...card!, cardName: '我自己的叫法' });

    const result = await syncPresetCardsIfOutdated();

    expect(result.kept).toBe(1);
    expect(result.updated).toBe(11);
    const after = await db.cards.get('mox-credit');
    expect(after?.cardName).toBe('我自己的叫法');
  });

  it('用户删掉的预置卡不会被塞回来 —— 否则「删除」是假的', async () => {
    await seedCardsIfNeeded();
    await deleteCard('citi-cash-back');
    await pretendOldInstall();

    const result = await syncPresetCardsIfOutdated();

    expect(await db.cards.get('citi-cash-back')).toBeUndefined();
    expect(result.kept).toBe(1);
    expect(result.updated).toBe(11);
    const count = await db.cards.count();
    expect(count).toBe(11);
  });

  it('删掉用户自建的卡不进「已删预置」名单，避免名单无意义膨胀', async () => {
    await seedCardsIfNeeded();
    const card = await db.cards.get('mox-credit');
    await putCard({ ...card!, cardId: 'user-123', origin: 'user' });
    await deleteCard('user-123');

    const row = await db.settings.get(KEY_DELETED_PRESETS);
    expect(row).toBeUndefined();
  });

  it('已是最新版本时不重复写库', async () => {
    await seedCardsIfNeeded();
    await syncPresetCardsIfOutdated();
    const before = await db.cards.toArray();

    const second = await syncPresetCardsIfOutdated();

    expect(second).toEqual({ updated: 0, kept: 0 });
    expect(await db.cards.toArray()).toEqual(before);
  });
});
