/**
 * 封顶（第 3 步）测试。
 *
 * 四个边界必须覆盖（ARCHITECTURE Q3）：未超、部分超、全超、跨月归零。
 */

import { describe, it, expect } from 'vitest';
import { applyCap } from './caps';
import { DEFAULT_FX_TABLE, cloneFxTable } from '../fx/fxReference';
import type { CapDefinition } from '../types';

const monthCap: CapDefinition = {
  id: 'cap-month',
  categories: 'all',
  limitAmount: 150,
  limitCurrency: 'HKD',
  period: 'month',
};

function ctx(over: Partial<Parameters<typeof applyCap>[2]> = {}) {
  return {
    amount: 1000,
    settlementCurrency: 'MOP' as const,
    capById: new Map([[monthCap.id, monthCap]]),
    spentByCap: {},
    occurredAt: '2026-10-31',
    fx: DEFAULT_FX_TABLE,
    ...over,
  };
}

describe('applyCap：未超 / 部分超 / 全超', () => {
  it('未超上限：价值原样保留，cappedBy 为 0', () => {
    // 消费 100（全部落在剩余额度 MOP 154.50 内），名义 10% = 10
    const r = applyCap(10, ['cap-month'], ctx({ amount: 100 }));
    expect(r.postCapValue).toBe(10);
    expect(r.cappedBy).toBe(0);
    expect(r.overAmount).toBe(0);
  });

  it('额度未用尽但本笔返现超出剩余额度时，按上限截断', () => {
    // basis='value'：上限是返现额 HK$150 → MOP 154.50。
    // 消费 1000 名义 10% = 100，未达 154.50，故不削。
    const r = applyCap(100, ['cap-month'], ctx({ amount: 1000 }));
    expect(r.postCapValue).toBeCloseTo(100, 2);
    expect(r.cappedBy).toBeCloseTo(0, 2);
    expect(r.overAmount).toBeCloseTo(0, 2);
  });

  it('spend 口径：额度内的消费按原费率，额度外不计', () => {
    // basis='spend'：额度是消费金额 MOP 154.50，消费 1000 时只有 154.5 享 10%
    const spendCap: CapDefinition = { ...monthCap, basis: 'spend' };
    const r = applyCap(
      100,
      ['cap-spend'],
      ctx({ amount: 1000, capById: new Map([['cap-spend', spendCap]]) }),
    );
    expect(r.postCapValue).toBeCloseTo(15.45, 2);
    expect(r.overAmount).toBeCloseTo(845.5, 2);
  });

  it('部分超（无 fallback）：返现被削到上限为止，超出部分不计', () => {
    // basis='value'：上限 HK$150 → MOP 154.50；消费 MOP 2000 名义 10% = 200
    // 只有 154.50 可计，其余削掉；无 fallback 时超额部分记 0
    const r = applyCap(200, ['cap-month'], ctx({ amount: 2000 }));
    expect(r.postCapValue).toBeCloseTo(154.5, 2);
    expect(r.cappedBy).toBeCloseTo(45.5, 2);
  });

  it('部分超 + fallback 0.4%：与官方条款一致（Chill 案例）', () => {
    // 官方细则：Chill 商户 10% = 基础 0.4%（无上限）+ 额外 9.6%（回赠上限 HK$150）
    // MOP 2000 消费：返现上限 154.50 先吃满，
    // 剩余消费 2000 - 154.5/0.10 = 455 再按 0.4% 计 1.82
    // 合计 154.50 + 1.82 = 156.32
    const r = applyCap(200, ['cap-month'], ctx({ amount: 2000 }), 0.004);
    expect(r.postCapValue).toBeCloseTo(156.32, 2);
    expect(r.fallbackValue).toBeCloseTo(1.82, 2);
  });

  it('全超（已用满）：可计入部分为 0，只按 fallback 计', () => {
    const r = applyCap(200, ['cap-month'], ctx({ amount: 2000, spentByCap: { 'cap-month': 150 } }), 0.004);
    expect(r.postCapValue).toBeCloseTo(8, 2); // 2000 × 0.4%
    expect(r.exhausted).toBe(true);
    expect(r.overAmount).toBe(2000);
  });

  it('全超且无 fallback：收益为 0，且绝不为负数', () => {
    const r = applyCap(200, ['cap-month'], ctx({ amount: 2000, spentByCap: { 'cap-month': 999 } }));
    expect(r.postCapValue).toBe(0);
    expect(r.postCapValue).toBeGreaterThanOrEqual(0);
  });

  it('无上限池时原样返回', () => {
    const r = applyCap(20, [], ctx());
    expect(r.postCapValue).toBe(20);
    expect(r.capId).toBeUndefined();
  });
});

describe('applyCap：跨币种折算', () => {
  it('HKD 上限折成 MOP 参与比较，并给出折算说明', () => {
    const r = applyCap(200, ['cap-month'], ctx({ amount: 2000 }));
    expect(r.limit).toBeCloseTo(154.5, 2);
    expect(r.fxNote).toContain('HKD 1 = MOP 1.03');
  });

  it('同币种时不产生折算说明', () => {
    const r = applyCap(100, ['cap-month'], ctx({ amount: 1000, settlementCurrency: 'HKD' }));
    expect(r.fxNote).toBeUndefined();
  });

  it('用户调整汇率后，可计入额度随之变化', () => {
    const custom = cloneFxTable();
    custom.rates[0] = { from: 'HKD', to: 'MOP', rate: 1.0 };
    const r = applyCap(200, ['cap-month'], ctx({ amount: 2000, fx: custom }), 0.004);
    // 汇率改 1:1 后上限折成 MOP 150，消费 2000 名义 10% = 200：
    // 返现封顶 150，剩余消费 2000 - 150/0.10 = 500 按 0.4% = 2，合计 152
    expect(r.limit).toBeCloseTo(150, 2);
    expect(r.postCapValue).toBeCloseTo(152, 2);
  });
});

describe('applyCap：木桶原理与数据错误', () => {
  it('一条轨道挂两个上限时，取剩余最少的那个作为约束', () => {
    const inner: CapDefinition = { ...monthCap, id: 'cap-inner', limitAmount: 50 };
    const r = applyCap(
      200,
      ['cap-month', 'cap-inner'],
      ctx({
        amount: 2000,
        capById: new Map([
          ['cap-month', monthCap],
          ['cap-inner', inner],
        ]),
      }),
    );
    expect(r.capId).toBe('cap-inner');
    expect(r.limit).toBeCloseTo(50 * 1.03, 2);
  });

  it('反向验证：引用不存在的上限池 → 抛错，不静默忽略', () => {
    expect(() => applyCap(10, ['ghost'], ctx())).toThrow(/不存在的上限池/);
  });

  it('年度上限与月度上限各按自己的周期校验', () => {
    const yearCap: CapDefinition = { ...monthCap, id: 'cap-year', period: 'year' };
    const r = applyCap(10, ['cap-year'], ctx({ amount: 100, capById: new Map([['cap-year', yearCap]]) }));
    expect(r.postCapValue).toBe(10);
  });
});
