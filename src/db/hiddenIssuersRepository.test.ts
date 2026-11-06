/**
 * 隐藏银行 —— 「添加卡片」候选列表的精简。
 *
 * 这里锁的不是「能不能藏」，而是**藏与删必须分家**：
 * 用户藏掉一家银行，之后点「恢复」，只能让银行回到候选列表；
 * 他之前在卡库里真删掉的卡绝不能被顺带复活。这两个键混用的话，
 * 「恢复」会变成一次静默的数据事故，而且用户不会知道该怪谁。
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { getHiddenIssuers, hideIssuer, KEY_HIDDEN_ISSUERS, unhideAllIssuers, unhideIssuer } from './hiddenIssuersRepository';
import { KEY_DELETED_PRESETS } from './cardsRepository';
import { issuerKey } from '../lib/issuerGroups';

async function reset(): Promise<void> {
  await db.delete();
  await db.open();
}

describe('隐藏银行', () => {
  beforeEach(reset);

  it('全新安装时没有隐藏项', async () => {
    expect(await getHiddenIssuers()).toEqual(new Set());
  });

  it('藏起来后读得回来，且键里存的是 region|issuer', async () => {
    await hideIssuer('MO', '大丰银行 (Tai Fung Bank)');

    const hidden = await getHiddenIssuers();
    expect(hidden.has(issuerKey('MO', '大丰银行 (Tai Fung Bank)'))).toBe(true);
    expect(hidden.size).toBe(1);
  });

  it('同一家重复藏不会写出重复项（连点两次也不会）', async () => {
    await hideIssuer('HK', 'AEON 信贷财务');
    await hideIssuer('HK', 'AEON 信贷财务');

    const row = await db.settings.get(KEY_HIDDEN_ISSUERS);
    const keys = (row?.value as { keys?: string[] }).keys;
    expect(keys).toEqual([issuerKey('HK', 'AEON 信贷财务')]);
  });

  it('澳门与香港同名银行互不影响', async () => {
    await hideIssuer('MO', '中国银行');
    const hidden = await getHiddenIssuers();
    expect(hidden.has(issuerKey('HK', '中国银行'))).toBe(false);
  });

  it('恢复一家只去掉这一家', async () => {
    await hideIssuer('MO', '澳门国际银行');
    await hideIssuer('HK', '花旗银行香港');
    await unhideIssuer('MO', '澳门国际银行');

    const hidden = await getHiddenIssuers();
    expect(hidden.has(issuerKey('MO', '澳门国际银行'))).toBe(false);
    expect(hidden.has(issuerKey('HK', '花旗银行香港'))).toBe(true);
  });

  it('恢复一家时，别的银行连同「已删的卡」都不动', async () => {
    // 模拟：用户在卡库里真删过一张预置卡，同时又藏了两家银行
    await db.settings.put({ key: KEY_DELETED_PRESETS, value: { ids: ['citi-cash-back'] } });
    await hideIssuer('MO', '大丰银行 (Tai Fung Bank)');
    await hideIssuer('MO', '立桥银行 (Well Link Bank)');

    await unhideIssuer('MO', '大丰银行 (Tai Fung Bank)');

    const deleted = await db.settings.get(KEY_DELETED_PRESETS);
    expect((deleted?.value as { ids: string[] }).ids).toEqual(['citi-cash-back']);
    expect((await getHiddenIssuers()).has(issuerKey('MO', '立桥银行 (Well Link Bank)'))).toBe(true);
  });

  it('全部恢复会清空隐藏键，但已删的卡名单原样保留', async () => {
    await db.settings.put({ key: KEY_DELETED_PRESETS, value: { ids: ['citi-cash-back', 'mox-credit'] } });
    await hideIssuer('MO', '大丰银行 (Tai Fung Bank)');
    await hideIssuer('HK', 'AEON 信贷财务');

    await unhideAllIssuers();

    expect(await getHiddenIssuers()).toEqual(new Set());
    const deleted = await db.settings.get(KEY_DELETED_PRESETS);
    expect((deleted?.value as { ids: string[] }).ids).toEqual(['citi-cash-back', 'mox-credit']);
  });
});
