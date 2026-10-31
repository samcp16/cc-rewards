/**
 * ADR-011 全矩阵回归基线（本轮硬门禁，第四轮 N5 补强口径）。
 *
 * 三件事分开验，红的时候一眼能判断问题性质：
 * 1. 无关卡零变化 —— 改门槛模型不该影响一张没有门槛的卡
 * 2. 两态分离 —— 账本状态确实被读到（否则变异验证无从谈起）
 * 3. 阈值卡逐值符合快照 —— 5 张门槛卡的新行为被钉住
 *
 * 快照口径：38 卡 × 5 渠道 × 7 类别 × 3 金额档 × 2 账本状态 = 7980 条；
 * 金额三档 {1000, 3000, 8000}，其中 8000 档触及 chill/wewa/bea 的上限，
 * 快照行的 capsAffected 字段把上限绑定纳入回归网（QA N5 / 变异 M6）。
 */

import { describe, it, expect } from 'vitest';
import { rankSingleCard } from './index';
import { card, makeParams } from '../__fixtures__/params';
import { MATRIX_BASELINE, THRESHOLD_CARD_SET, unrelatedRows } from '../__fixtures__/adr011-baseline';
import type { LedgerEntry, PaymentChannel, SpendCategory, SpendInput } from '../types';

const params = makeParams();

/** 与 scripts/snapshot-matrix.ts 完全同源的账本构造 */
const OVER_LEDGER: Record<string, number> = {
  'boc-hk-chill:physical-spend': 15000,
  'boc-hk-cheers:monthly-retail': 50000,
  'bea-world-mc:qualified-spend': 40000,
  'dbs-black-world:monthly-spend': 200000,
  'wewa-unionpay:monthly': 15000,
};

function ledgerFor(cardId: string, state: string): LedgerEntry[] {
  if (state === 'empty') return [];
  const contribution: Record<string, number> = {};
  for (const th of card(cardId).thresholds ?? []) {
    contribution[th.id] = OVER_LEDGER[th.id] ?? 999999;
  }
  return [
    {
      id: `snapshot-${cardId}-${state}`,
      cardId,
      occurredAt: '2026-10-15',
      periodKey: '2026-10',
      quarterKey: '2026-Q4',
      yearKey: '2026',
      halfYearKey: '2026-H2',
      amount: 100000,
      currency: 'HKD',
      category: 'dining',
      channel: 'physical',
      capConsumption: {},
      thresholdContribution: contribution,
      channelFreeConsumption: {},
      earnedCashback: 0,
      earnedPoints: 0,
      createdAt: '2026-10-15T00:00:00.000Z',
    },
  ];
}

function actualOf(
  cardId: string,
  row: { channel: string; category: string; amount: number; state: string },
) {
  const input: SpendInput = {
    amount: row.amount,
    settlementCurrency: 'MOP',
    category: row.category as SpendCategory,
    channel: row.channel as PaymentChannel,
    region: 'MO',
    occurredAt: '2026-10-31',
  };
  const s = rankSingleCard(card(cardId), ledgerFor(cardId, row.state), params, input);
  return {
    status: s?.status ?? 'null',
    grossCashback: s?.grossCashback ?? null,
    pointsValue: s?.pointsValue ?? null,
    netRealistic: s?.netRealistic ?? null,
    fxFee: s?.fxFee ?? null,
    channelFee: s?.channelFee ?? null,
    warnings: (s?.warnings ?? []).map((w) => w.code).join(','),
    capsAffected: (s?.capsAffected ?? []).map((c) => c.capId).sort().join(','),
  };
}

const TOTAL_ROWS = 38 * 5 * 7 * 3 * 2;
const UNRELATED_ROWS = 33 * 5 * 7 * 3 * 2;

describe('快照口径自检', () => {
  it('38 卡 × 5 渠道 × 7 类别 × 3 金额档 × 2 态 = 7980 条，无缺漏无重复', () => {
    expect(MATRIX_BASELINE).toHaveLength(TOTAL_ROWS);
    const cards = new Set(MATRIX_BASELINE.map((r) => r.cardId));
    expect(cards.size).toBe(38);
    const keys = new Set(
      MATRIX_BASELINE.map((r) => `${r.cardId}/${r.channel}/${r.category}/${r.amount}/${r.state}`),
    );
    expect(keys.size).toBe(TOTAL_ROWS);
  });

  it('其中有门槛的卡 5 张，无关卡 33 张 × 5 渠道 × 7 类别 × 3 金额 × 2 态', () => {
    // 38 − 5 = 33。tai-fung 在 ADR-010 已定稿，本轮不得再变，故算作无关卡。
    expect(unrelatedRows()).toHaveLength(UNRELATED_ROWS);
  });
});

describe('硬门禁 1：33 张无关卡逐值零变化', () => {
  it('八个字段全等（含 capsAffected），0 处不一致', () => {
    const mismatches: string[] = [];
    for (const row of unrelatedRows()) {
      const actual = actualOf(row.cardId, row);
      if (JSON.stringify(actual) !== JSON.stringify(row.expect)) {
        mismatches.push(
          `${row.cardId}/${row.channel}/${row.category}/${row.amount}/${row.state}: ` +
            `期望 ${JSON.stringify(row.expect)} 实际 ${JSON.stringify(actual)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('硬门禁 2：两态确实分离（否则快照对未达标档失明）', () => {
  it('无关卡的两态值完全相同（无门槛 → 账本状态不影响）', () => {
    const byKey = new Map<string, (typeof MATRIX_BASELINE)[number]>();
    for (const r of MATRIX_BASELINE) {
      byKey.set(`${r.cardId}/${r.channel}/${r.category}/${r.amount}/${r.state}`, r);
    }

    let compared = 0;
    for (const r of unrelatedRows()) {
      if (r.state !== 'empty') continue;
      const over = byKey.get(`${r.cardId}/${r.channel}/${r.category}/${r.amount}/over`);
      expect(over, `${r.cardId} 缺 over 态记录`).toBeDefined();
      expect(
        JSON.stringify(over!.expect),
        `${r.cardId}/${r.channel}/${r.category}/${r.amount} 两态不一致`,
      ).toBe(JSON.stringify(r.expect));
      compared += 1;
    }
    expect(compared).toBe(33 * 5 * 7 * 3);
  });

  it('5 张门槛卡在 1000 档至少各有一个类别两态不同（未达标档真的被读到）', () => {
    // 1000 MOP 小于全部门槛，两态分离由该档专责保证（3000/8000 档空账本侧会自行达标）
    const byKey = new Map<string, (typeof MATRIX_BASELINE)[number]>();
    for (const r of MATRIX_BASELINE) {
      byKey.set(`${r.cardId}/${r.channel}/${r.category}/${r.amount}/${r.state}`, r);
    }

    for (const cardId of THRESHOLD_CARD_SET) {
      const differ = MATRIX_BASELINE.filter((r) => {
        if (r.cardId !== cardId || r.state !== 'empty' || r.amount !== 1000) return false;
        const over = byKey.get(`${r.cardId}/${r.channel}/${r.category}/${r.amount}/over`);
        return over && JSON.stringify(over.expect) !== JSON.stringify(r.expect);
      });
      expect(differ.length, `${cardId} 没有任何组合在两态间发生变化`).toBeGreaterThan(0);
    }
  });
});

describe('硬门禁 3：5 张门槛卡逐值符合快照', () => {
  it('八个字段全等（含 capsAffected），0 处不一致', () => {
    const mismatches: string[] = [];
    for (const row of MATRIX_BASELINE) {
      if (!THRESHOLD_CARD_SET.has(row.cardId)) continue;
      const actual = actualOf(row.cardId, row);
      if (JSON.stringify(actual) !== JSON.stringify(row.expect)) {
        mismatches.push(
          `${row.cardId}/${row.channel}/${row.category}/${row.amount}/${row.state}: ` +
            `期望 ${JSON.stringify(row.expect)} 实际 ${JSON.stringify(actual)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('N5 补强自检：上限机制在回归网内', () => {
  it('触顶档（8000）的 chill dining 快照行记录了 capsAffected', () => {
    const rows = MATRIX_BASELINE.filter(
      (r) => r.cardId === 'boc-hk-chill' && r.category === 'dining' && r.amount === 8000 && r.channel === 'physical',
    );
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.expect.capsAffected, JSON.stringify(row)).toContain('boc-hk-chill:extra');
    }
  });

  it('chill grocery 任何档位都不消耗 extra 池（N1 上限污染消失的结构保证）', () => {
    const rows = MATRIX_BASELINE.filter(
      (r) => r.cardId === 'boc-hk-chill' && r.category === 'grocery',
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.expect.capsAffected).not.toContain('boc-hk-chill:extra');
    }
  });
});
