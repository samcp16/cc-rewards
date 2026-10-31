/**
 * 定档（第 1 步）测试。
 *
 * 门槛与上限是相反方向：门槛是「用得多 → 收益增加」。
 * 这里钉住的是「先定档」这件事本身、跨币种累计的折算，以及
 * ADR-011 之后门槛**只回答是否达标**这一职责边界（它不再持有费率）。
 */

import { describe, it, expect } from 'vitest';
import { resolveThreshold, pickBonusTier } from './thresholds';
import { card, makeParams } from '../__fixtures__/params';
import { DEFAULT_FX_TABLE } from '../fx/fxReference';
import type { ThresholdBonusTier, ThresholdDefinition } from '../types';

const params = makeParams();
const chill = card('boc-hk-chill');

const base = {
  amount: 2000,
  settlementCurrency: 'MOP' as const,
  category: 'dining' as const,
  occurredAt: '2026-10-31',
  aggregates: { spentByThreshold: {} },
  fx: DEFAULT_FX_TABLE,
};

describe('resolveThreshold：Chill 实体签账门槛', () => {
  it('累计为 0 但 includeCurrentSpend 时，本笔 MOP 2000 折算后已达标', () => {
    // Chill 门槛 includeCurrentSpend: true，本笔就计入累计
    const r = resolveThreshold(chill, base);
    expect(r.reached).toBe(true);
    expect(r.note).toContain('含本笔');
    expect(r.note).toContain('已达门槛');
  });

  it('小额消费未达门槛 → reached=false', () => {
    const r = resolveThreshold(chill, { ...base, amount: 100 });
    expect(r.reached).toBe(false);
  });

  it('累计已达 1500（含本笔）时 reached=true', () => {
    const r = resolveThreshold(chill, {
      ...base,
      aggregates: { spentByThreshold: { 'boc-hk-chill:physical-spend': 1500 } },
      amount: 100,
    });
    expect(r.reached).toBe(true);
  });

  it('无门槛的卡返回 reached=false 且 definition 为 null', () => {
    const r = resolveThreshold(card('sc-simply-cash'), base);
    expect(r.reached).toBe(false);
    expect(r.definition).toBeNull();
    expect(r.bonusTier).toBeNull();
  });

  it('门槛不覆盖的类别 → 不达标并说明「不计入累计」', () => {
    const onlyDining: ThresholdDefinition = {
      id: 'th-dining-only',
      accrualCategories: ['dining'],
      thresholdAmount: 1000,
      includeCurrentSpend: true,
      period: 'month',
      currency: 'HKD',
    };
    const cardWithTh = { ...card('citi-cash-back'), thresholds: [onlyDining] };
    const r = resolveThreshold(cardWithTh, { ...base, category: 'fuel' });
    expect(r.reached).toBe(false);
    expect(r.note).toContain('不计入');
  });

  it('跨币种累计时给出折算说明（不允许静默折算）', () => {
    const r = resolveThreshold(chill, {
      ...base,
      aggregates: { spentByThreshold: { 'boc-hk-chill:physical-spend': 1000 } },
    });
    // 门槛币种 HKD，消费币种 MOP → 必须有折算说明
    expect(r.fxNote).toContain('MOP');
  });
});

describe('pickBonusTier：档位选择边界', () => {
  const tiers: ThresholdBonusTier[] = [
    { minSpend: 0, gain: {} },
    { minSpend: 1000, gain: { multiplierDelta: 1 } },
    { minSpend: 5000, gain: { multiplierDelta: 2 } },
  ];

  it('恰好等于门槛值即升档（>= 语义）', () => {
    expect(pickBonusTier(tiers, 1000, 't').minSpend).toBe(1000);
  });

  it('差 1 分不升档', () => {
    expect(pickBonusTier(tiers, 999.99, 't').minSpend).toBe(0);
  });

  it('超过最高档仍取最高档', () => {
    expect(pickBonusTier(tiers, 99_999, 't').minSpend).toBe(5000);
  });

  it('乱序输入也能取对档', () => {
    const shuffled: ThresholdBonusTier[] = [
      { minSpend: 5000, gain: { multiplierDelta: 2 } },
      { minSpend: 0, gain: {} },
      { minSpend: 1000, gain: { multiplierDelta: 1 } },
    ];
    expect(pickBonusTier(shuffled, 1500, 't').minSpend).toBe(1000);
  });

  it('反向验证：最低档 minSpend 不为 0 → 抛错（配置错误不得静默兜底）', () => {
    expect(() => pickBonusTier([{ minSpend: 500, gain: {} }], 1000, 'bad')).toThrow(/必须为 0/);
  });

  it('反向验证：空档位 → 抛错', () => {
    expect(() => pickBonusTier([], 1000, 'empty')).toThrow(/没有任何奖励档定义/);
  });

  it('反向验证：多个门槛定义 → 抛错，不依赖遍历顺序', () => {
    const two: ThresholdDefinition = {
      id: 'th-2',
      accrualCategories: 'all',
      thresholdAmount: 1000,
      includeCurrentSpend: true,
      period: 'month',
      currency: 'HKD',
    };
    const cardWithTwo = { ...card('boc-hk-chill'), thresholds: [...card('boc-hk-chill').thresholds, two] };
    expect(() => resolveThreshold(cardWithTwo, base)).toThrow(/只支持单门槛/);
  });
});

describe('门槛不再持有费率（ADR-011 的职责边界）', () => {
  it('ThresholdDefinition 上没有 tiers / countsCategories 字段', () => {
    const th = chill.thresholds[0]!;
    expect(Object.hasOwn(th, 'tiers')).toBe(false);
    expect(Object.hasOwn(th, 'countsCategories')).toBe(false);
    // 累计口径字段改名后字面即语义
    expect(th.accrualCategories).toBe('all');
  });

  it('定档结果只含「是否达标 + 奖励档」，不含任何费率字段', () => {
    const r = resolveThreshold(chill, base);
    expect(Object.keys(r).sort()).toEqual([
      'bonusTier',
      'countedSpend',
      'definition',
      'fxNote',
      'note',
      'reached',
    ]);
  });

  it('params 未被意外修改（纯函数）', () => {
    const before = JSON.stringify(params);
    resolveThreshold(chill, base);
    expect(JSON.stringify(params)).toBe(before);
  });
});
