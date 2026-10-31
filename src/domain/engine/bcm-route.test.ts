/**
 * ADR-012：结算路由正交事实（crossCurrency / crossBorder）——BCM 成分模型回归。
 *
 * 官方收费表口径（三源独立核实，见 docs/QA-REVERIFY-R3.md B3'）：
 *   外币交易 0.5% / 跨域交易 1.0% / 最多合共收取 1.5%
 * 第三列「最多合共」是封顶，不是「两项必收」。两项是否各收，取决于交易是否
 * 真的同时满足「跨境」与「换币」两个事实。
 *
 * 修复前（ADR-011 决策 1 的错误）：foreign = 跨境 1% + 跨货币 0.5%，
 * 澳门本地 HKD 结算被收 1.5%（官方 0.5%，高估 3 倍，净回报 +5 翻成 -5）。
 *
 * 期望值全部来自官方收费表，不是引擎输出（ADR-011 Verification plan 的纪律）。
 */

import { describe, it, expect } from 'vitest';
import { resolveSettlementRoute, assertRouteConsistency } from './settlementRoute';
import { resolveFxFee } from '../fx/resolveFx';
import { rankSingleCard } from './index';
import { card, makeParams } from '../__fixtures__/params';
import { CARDS } from '../data/loadCards';
import type { Card, CurrencyCode } from '../types';

const params = makeParams();
const TODAY = '2026-10-31';
const bcm = card('bcm-world-mc');

/** 卡库无 USD 场景（CurrencyCode 只有 MOP/HKD/CNY），矩阵第三行需要它表达「另一外币」 */
const USD = 'USD' as unknown as CurrencyCode;

interface FxCase {
  label: string;
  settlementCurrency: CurrencyCode;
  region: 'MO' | 'CN';
  route: string;
  crossCurrency: boolean;
  crossBorder: boolean;
  fxFeeRate: number;
}

const FX_MATRIX: FxCase[] = [
  { label: '澳门商户 + MOP 结算（同币同地）', settlementCurrency: 'MOP', region: 'MO', route: 'local', crossCurrency: false, crossBorder: false, fxFeeRate: 0 },
  { label: '澳门商户 + HKD 结算（只换币）', settlementCurrency: 'HKD', region: 'MO', route: 'foreign', crossCurrency: true, crossBorder: false, fxFeeRate: 0.005 },
  { label: '澳门商户 + USD 结算（只换币）', settlementCurrency: USD, region: 'MO', route: 'foreign', crossCurrency: true, crossBorder: false, fxFeeRate: 0.005 },
  { label: '内地商户 + MOP 结算（只跨境）', settlementCurrency: 'MOP', region: 'CN', route: 'crossBorder', crossCurrency: false, crossBorder: true, fxFeeRate: 0.01 },
  { label: '内地商户 + USD 结算（跨境+换币）', settlementCurrency: USD, region: 'CN', route: 'foreign', crossCurrency: true, crossBorder: true, fxFeeRate: 0.015 },
];

describe('ADR-012 验收：BCM 五场景 FX 矩阵', () => {
  for (const c of FX_MATRIX) {
    it(`${c.label} → fxFee ${(c.fxFeeRate * 100).toFixed(2)}%`, () => {
      const d = resolveSettlementRoute(bcm, c.settlementCurrency, c.region);
      assertRouteConsistency(d);
      expect(d.route).toBe(c.route);
      expect(d.crossCurrency).toBe(c.crossCurrency);
      expect(d.crossBorder).toBe(c.crossBorder);
      const r = resolveFxFee(bcm.fxFee, {
        route: d.route,
        settlementCurrency: c.settlementCurrency,
        region: c.region,
        today: TODAY,
        dualCurrencyLocal: d.dualCurrencyLocal,
        crossCurrency: d.crossCurrency,
        crossBorder: d.crossBorder,
      });
      expect(r.rate).toBeCloseTo(c.fxFeeRate, 6);
    });
  }

  it('端到端：澳门本地 HKD 结算的净回报必须为正（B3 反转回归）', () => {
    // 修复前：fxFee 15 > gross 10 → net -5（结论反转）。官方口径 fxFee 5 → net +5。
    const s = rankSingleCard(bcm, [], params, {
      amount: 1000,
      settlementCurrency: 'HKD',
      category: 'dining',
      channel: 'physical',
      region: 'MO',
      occurredAt: TODAY,
    })!;
    expect(s.fxFee).toBeCloseTo(5, 2);
    expect(s.grossCashback).toBeCloseTo(10, 2);
    expect(s.netRealistic).toBeCloseTo(5, 2);
  });
});

describe('ADR-012 不变量：布尔与 route 自洽', () => {
  it('crossCurrency === false && crossBorder === false 当且仅当 route === local', () => {
    for (const c of CARDS) {
      for (const [cur, region] of [
        ['MOP', 'MO'], ['HKD', 'MO'], ['CNY', 'MO'], ['MOP', 'CN'], ['HKD', 'CN'], ['CNY', 'CN'],
      ] as const) {
        const d = resolveSettlementRoute(c, cur, region);
        const bothFalse = !d.crossCurrency && !d.crossBorder;
        expect(bothFalse, `${c.cardId}/${cur}/${region}`).toBe(d.route === 'local');
      }
    }
  });

  it('crossCurrency === true 当且仅当 route === foreign', () => {
    for (const c of CARDS) {
      for (const [cur, region] of [
        ['MOP', 'MO'], ['HKD', 'MO'], ['CNY', 'MO'], ['MOP', 'CN'], ['HKD', 'CN'], ['CNY', 'CN'],
      ] as const) {
        const d = resolveSettlementRoute(c, cur, region);
        expect(d.crossCurrency, `${c.cardId}/${cur}/${region}`).toBe(d.route === 'foreign');
      }
    }
  });

  it('反向验证：route=local 却声明 crossCurrency → 抛错', () => {
    expect(() =>
      assertRouteConsistency({ route: 'local', rateSide: 'local', dualCurrencyLocal: false, crossCurrency: true, crossBorder: false }),
    ).toThrow(/自相矛盾/);
  });

  it('反向验证：route=crossBorder 却声明 crossCurrency → 抛错', () => {
    expect(() =>
      assertRouteConsistency({ route: 'crossBorder', rateSide: 'foreign', dualCurrencyLocal: false, crossCurrency: true, crossBorder: true }),
    ).toThrow(/自相矛盾/);
  });
});

describe('ADR-012：银联双币卡豁免把两个布尔归零', () => {
  it('HK 银联卡 + MOP 结算 + 澳门商户 → local 且两布尔为 false', () => {
    const d = resolveSettlementRoute(
      { cardCurrency: 'HKD', network: 'unionpay', issuerRegion: 'HK' },
      'MOP',
      'MO',
    );
    expect(d.route).toBe('local');
    expect(d.crossCurrency).toBe(false);
    expect(d.crossBorder).toBe(false);
    expect(d.dualCurrencyLocal).toBe(true);
  });

  it('HK 银联卡 + USD 结算（范围外币种）→ 不豁免，布尔如实报告', () => {
    const d = resolveSettlementRoute(
      { cardCurrency: 'HKD', network: 'unionpay', issuerRegion: 'HK' },
      USD,
      'MO',
    );
    expect(d.route).toBe('foreign');
    expect(d.crossCurrency).toBe(true);
    // 发卡地 HK ≠ 商户地 MO：豁免不适用时跨境事实如实报告，不再被双币条款掩盖
    expect(d.crossBorder).toBe(true);
  });
});

/**
 * 死字段清除的结构断言（QA 死字段清单，防回归）：
 * ThresholdCategoryBinding.attachCaps 与 ThresholdCategoryBinding.gain 已删除。
 * 注意 bonusTiers[].gain 保留（DBS multiplierDelta 在用），故只查 categoryBindings。
 */
describe('死字段清除：全库不存在 attachCaps 与 binding.gain', () => {
  it('categoryBindings 里不得出现 gain 或 attachCaps 键', () => {
    const offenders: string[] = [];
    for (const c of CARDS) {
      for (const th of c.thresholds ?? []) {
        for (const [cat, binding] of Object.entries(th.categoryBindings ?? {})) {
          if ('gain' in binding) offenders.push(`${c.cardId}/${th.id}/${cat}.gain`);
          if ('attachCaps' in binding) offenders.push(`${c.cardId}/${th.id}/${cat}.attachCaps`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('原始数据文本中不得出现 attachCaps（类型与数据一起清除）', () => {
    const raw = JSON.stringify(CARDS);
    expect(raw).not.toContain('attachCaps');
  });

  it('bonusTiers 的 gain 保留（DBS 在用，不属于死字段）', () => {
    const dbs = card('dbs-black-world');
    const tier = dbs.thresholds[0]!.bonusTiers!.find((t) => t.minSpend === 20000)!;
    expect(tier.gain.multiplierDelta).toBe(1);
  });
});

/** 保证类型形状：binding 必须声明 fallback（编译期由类型表达，运行期由加载期校验兜底） */
describe('类型契约：binding 的 fallback 必填', () => {
  it('全部 binding 都有 fallback（数据层通过加载校验的间接证明）', () => {
    for (const c of CARDS as Card[]) {
      for (const th of c.thresholds ?? []) {
        for (const [cat, binding] of Object.entries(th.categoryBindings ?? {})) {
          expect(binding.fallback, `${c.cardId}/${th.id}/${cat}`).toBeDefined();
        }
      }
    }
  });
});
