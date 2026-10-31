/**
 * 毛返现与排他组测试（第 2 步）。
 *
 * 最怕的错法是「同组取和而非取最大」——那会把 Apple Pay 2% + 实体 1% 算成 3%。
 */

import { describe, it, expect } from 'vitest';
import { pickRate, applyExclusivity, evaluateTrack } from './earn';
import type { EarnCandidate } from './earn';
import { rankSingleCard } from './index';
import { card, makeParams, ledgerEntry, MO_PHYSICAL } from '../__fixtures__/params';
import type { Card, CashbackRates, SpendInput } from '../types';

const params = makeParams();

describe('pickRate：双档费率取档', () => {
  const rates: CashbackRates = { local: 0.015, foreign: 0.02 };

  it('local 档取 local', () => {
    expect(pickRate(rates, 'local')).toBe(0.015);
  });

  it('foreign 档取 foreign', () => {
    expect(pickRate(rates, 'foreign')).toBe(0.02);
  });

  it('foreign 缺省时沿用 local（不得当 0）', () => {
    expect(pickRate({ local: 0.004 }, 'foreign')).toBe(0.004);
  });

  it('反向验证：若取错档，渣打场景会从 +0.05% 变成 -0.45%', () => {
    const amount = 1000;
    const fx = 0.0195;
    const correct = (amount * pickRate(rates, 'foreign') - amount * fx) / amount;
    const wrong = (amount * pickRate(rates, 'local') - amount * fx) / amount;
    expect(correct).toBeCloseTo(0.0005, 6);
    expect(wrong).toBeCloseTo(-0.0045, 6);
    expect(Math.sign(correct)).not.toBe(Math.sign(wrong));
  });
});

describe('applyExclusivity：同组取最大，异组相加', () => {
  const mk = (over: Partial<EarnCandidate>): EarnCandidate => ({
    kind: 'cashback',
    exclusivityGroup: 'base.dining',
    rate: 0.02,
    value: 20,
    preCapValue: 20,
    capIds: [],
    label: 'x',
    ...over,
  });

  it('同组两条只保留价值最高的一条（Apple Pay 2% vs 实体 1%）', () => {
    const chosen = applyExclusivity([
      mk({ value: 20, label: 'Apple Pay 2%' }),
      mk({ value: 10, label: '实体卡 1%' }),
    ]);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]!.value).toBe(20);
    // 关键：绝不能是 30
    expect(chosen.reduce((a, c) => a + c.value, 0)).toBe(20);
  });

  it('不同组相加（渠道加成是真叠加）', () => {
    const chosen = applyExclusivity([
      mk({ value: 20, exclusivityGroup: 'base.dining' }),
      mk({ value: 5, exclusivityGroup: 'additive.alipay-bonus' }),
    ]);
    expect(chosen).toHaveLength(2);
    expect(chosen.reduce((a, c) => a + c.value, 0)).toBe(25);
  });

  it('additive. 前缀组全部保留，即使同组有多条', () => {
    const chosen = applyExclusivity([
      mk({ value: 5, exclusivityGroup: 'additive.bonus' }),
      mk({ value: 3, exclusivityGroup: 'additive.bonus' }),
    ]);
    expect(chosen).toHaveLength(2);
    expect(chosen.reduce((a, c) => a + c.value, 0)).toBe(8);
  });

  it('值相同时稳定保留先出现的（不因排序抖动改变结果）', () => {
    const a = mk({ value: 10, label: 'first' });
    const b = mk({ value: 10, label: 'second' });
    expect(applyExclusivity([a, b])[0]!.label).toBe('first');
  });

  it('空输入返回空', () => {
    expect(applyExclusivity([])).toEqual([]);
  });
});

describe('evaluateTrack：估值', () => {
  const baseCtx = {
    card: undefined as never,
    amount: 1000,
    settlementCurrency: 'MOP' as const,
    category: 'dining' as const,
    rateSide: 'local' as const,
    channel: 'physical' as const,
    threshold: { reached: false, bonusTier: null, definition: null },
    pointValuations: { yuu: { valuePerPoint: 0.005, currency: 'HKD' as const, basis: 'confirmed' as const } },
  };

  it('cashback：金额 × 费率', () => {
    const c = evaluateTrack(
      { kind: 'cashback', rates: { local: 0.02 }, exclusivityGroup: 'base.dining', capIds: [] },
      baseCtx,
    );
    expect(c.value).toBe(20);
    expect(c.unknownReason).toBeUndefined();
  });

  it('points：金额 × 倍数 × 每分价值', () => {
    const c = evaluateTrack(
      { kind: 'points', multiplier: 4, pointProgramId: 'yuu', exclusivityGroup: 'base.dining', capIds: [] },
      baseCtx,
    );
    // 1000 × 4 × 0.005 = 20
    expect(c.value).toBe(20);
    expect(c.kind).toBe('points');
  });

  it('cashback 但 rates 为 null → 标记 unknown_rate，值为 0 但不可排序', () => {
    const c = evaluateTrack(
      { kind: 'cashback', rates: null, exclusivityGroup: 'base.dining', capIds: [] },
      baseCtx,
    );
    expect(c.unknownReason).toBe('unknown_rate');
  });

  it('points 但计划无估值 → 标记 no_point_valuation', () => {
    const c = evaluateTrack(
      { kind: 'points', multiplier: 1, pointProgramId: 'unknown-program', exclusivityGroup: 'base.dining', capIds: [] },
      baseCtx,
    );
    expect(c.unknownReason).toBe('no_point_valuation');
  });

  it('points 估值 basis 透传，供 UI 标注「估计值」', () => {
    const c = evaluateTrack(
      { kind: 'points', multiplier: 1, pointProgramId: 'yuu', exclusivityGroup: 'base.dining', capIds: [] },
      baseCtx,
    );
    expect(c.valuationBasis).toBe('confirmed');
  });

  it('kind=unknown 的轨道标记 unknown_rate', () => {
    const c = evaluateTrack(
      { kind: 'unknown', rates: null, exclusivityGroup: 'base.dining', capIds: [] },
      baseCtx,
    );
    expect(c.unknownReason).toBe('unknown_rate');
  });
});

/**
 * points 轨道的增量换算（`rateOf` 的 points 分支）。
 *
 * 现金卡的门槛走 `rate`，积分卡的门槛走 `multiplierDelta`。两条路的换算方向相反
 * 但都要落在 `withRateDelta` 上：前者改 `rates.local`，后者改 `multiplier`。
 * 这里用一张合成的积分卡验证 points 侧的绝对值 → 增量换算不写错方向。
 */
describe('points 轨道：未达标 fallback 也要能换算成 delta', () => {
  it('fallback.multiplierDelta 小于 categories 倍数时，未达标按 fallback 倍数计', () => {
    const base = card('dbs-black-world');
    const synthetic: Card = {
      ...base,
      categories: {
        ...base.categories,
        flight: { kind: 'points', multiplier: 2, pointProgramId: base.categories.flight?.pointProgramId ?? '', isBaseTierRate: false },
      },
      thresholds: [
        {
          id: 'synthetic:points-th',
          accrualCategories: 'all',
          thresholdAmount: 1000,
          includeCurrentSpend: true,
          period: 'month',
          currency: 'HKD',
          categoryBindings: {
            // 未达标 1x，达标 2x（categories 记的是 2x；binding 只声明未达标侧）
            flight: { fallback: { multiplierDelta: 1 } },
          },
        },
      ],
    };

    const input: SpendInput = { ...MO_PHYSICAL, amount: 1000, category: 'flight' };
    const below = rankSingleCard(synthetic, [], params, input)!;
    const above = rankSingleCard(
      synthetic,
      [ledgerEntry({ cardId: 'dbs-black-world', thresholdContribution: { 'synthetic:points-th': 5000 } })],
      params,
      input,
    )!;

    expect(above.pointsValue).toBeCloseTo(below.pointsValue * 2, 2);
  });
});
