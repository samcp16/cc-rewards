/**
 * 端到端集成测试：数据库播种 → 数据订阅 → 引擎计算 → 答案状态。
 *
 * 为什么需要这个测试：
 * 沙箱里的 headless Chromium 不提供 IndexedDB（连 onupgradeneeded 都不触发），
 * 所以「页面停在正在算」无法在浏览器里区分是产品 bug 还是环境限制。
 * 这个测试用 fake-indexeddb 模拟真实浏览器的 IndexedDB，把整条链路跑一遍，
 * 从而证明：只要 IndexedDB 可用，答案就一定能算出来。
 *
 * 覆盖的验收标准：
 * - AC-F3-01 无须任何点击即展示答案
 * - AC-F7-01 数据持久化到 IndexedDB
 * - AC-F1-01 按净回报率降序排列
 * - AC-F6-01 每张卡带上次确认日期
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './schema';
import { seedCardsIfNeeded, presetTemplates } from './cardsRepository';
import { buildLedgerEntry } from './ledgerRepository';
import { rankCards } from '../domain/engine';
import { buildDefaultParams } from '../hooks/buildDefaultParams';
import type { SpendInput } from '../domain/types';

const MO_DINING: SpendInput = {
  amount: 500,
  settlementCurrency: 'MOP',
  category: 'dining',
  channel: 'physical',
  region: 'MO',
};

describe('端到端：播种 → 订阅 → 计算', () => {
  beforeAll(async () => {
    await db.delete();
    await db.open();
  });

  it('首次启动播种 12 张预置卡到 IndexedDB', async () => {
    const wrote = await seedCardsIfNeeded();
    expect(wrote).toBe(true);

    const count = await db.cards.count();
    expect(count).toBe(12);
  });

  it('播种是幂等的：第二次调用不重复写入', async () => {
    const wrote = await seedCardsIfNeeded();
    expect(wrote).toBe(false);
    expect(await db.cards.count()).toBe(12);
  });

  it('播种的卡 id 全部真实存在于卡库（防凭记忆编造 id）', async () => {
    const rows = await db.cards.toArray();
    const templates = presetTemplates().map((c) => c.cardId);
    // 预置模板必须能全部解析出来，不允许有 id 落空被 filter 掉
    expect(templates).toHaveLength(12);
    const rowIds = rows.map((r) => r.cardId).sort();
    expect(rowIds).toEqual([...templates].sort());
  });

  it('从数据库读出的卡能直接喂给引擎并算出结果（无点击即有答案）', async () => {
    const rows = await db.cards.toArray();
    const ledger = await db.ledger.toArray();
    const params = buildDefaultParams('2026-10-31');

    const result = rankCards(rows, ledger, params, MO_DINING);

    expect(result.ok).toBe(true);
    // 有卡参与排序才说明数据链路是通的
    expect(result.ranked.length).toBeGreaterThan(0);
    // AC-F1-01：按净回报率降序
    const rates = result.ranked.map((s) => s.netRateRealistic);
    const sorted = [...rates].sort((a, b) => b - a);
    expect(rates).toEqual(sorted);
  });

  it('每张卡带「上次确认日期」（AC-F6-01）', async () => {
    const rows = await db.cards.toArray();
    for (const row of rows) {
      expect(row.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('预置卡里存在 unknown 类别时才允许进 unranked，且绝不按 0 计', async () => {
    const rows = await db.cards.toArray();
    const params = buildDefaultParams('2026-10-31');
    const result = rankCards(rows, [], params, { ...MO_DINING, category: 'fuel' });

    for (const s of result.unranked) {
      // 未排序的卡必须给出原因，不能静默丢弃
      expect(['unknown', 'expired', 'no_card_for_category']).toContain(s.status);
      expect(s.warnings.length).toBeGreaterThan(0);
    }
  });

  it('写入账本后结果会变（F5 的上限联动）', async () => {
    const rows = await db.cards.toArray();
    const params = buildDefaultParams('2026-10-31');
    const query = { ...MO_DINING, amount: 2000 };

    const before = rankCards(rows, [], params, query);
    const chillBefore = before.ranked.find((s) => s.cardId === 'boc-hk-chill');
    expect(chillBefore).toBeDefined();

    // 走真实写入链路：引擎先算这一笔，再由 buildLedgerEntry 快照 capConsumption。
    // 不能手写账本条目 —— 手写的条目没有 capConsumption，归集会扫不到任何占用，
    // 测试就变成「验证一个假数据不会被引擎读到」，等于绕开被测代码。
    const chillRow = rows.find((r) => r.cardId === 'boc-hk-chill');
    expect(chillRow).toBeDefined();
    const spend = rankCards([chillRow!], [], params, { ...MO_DINING, amount: 1400 });
    const chillScheme = spend.ranked.find((s) => s.cardId === 'boc-hk-chill');
    expect(chillScheme).toBeDefined();

    const entry = buildLedgerEntry(
      {
        card: chillRow!,
        amount: 1400,
        currency: 'MOP',
        category: 'dining',
        channel: 'physical',
        scheme: chillScheme!,
      },
      '2026-10-15',
    );
    // 快照必须落在本月，否则归集会按周期过滤掉，联动无从验证
    expect(entry.periodKey).toBe('2026-10');
    expect(Object.keys(entry.capConsumption ?? {}).length).toBeGreaterThan(0);

    await db.ledger.put(entry);

    const ledger = await db.ledger.toArray();
    const after = rankCards(rows, ledger, params, query);
    const chillAfter = after.ranked.find((s) => s.cardId === 'boc-hk-chill');

    // 额度被占用后，实际可得收益必须下降（不能与未记账时相同）
    expect(chillAfter).toBeDefined();
    expect(chillAfter!.netRealistic).toBeLessThan(chillBefore!.netRealistic);
    expect(chillAfter!.netRealistic).toBeLessThan(chillAfter!.netOptimistic);
  });
});
