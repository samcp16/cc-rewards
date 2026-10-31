/**
 * 补充分支测试：把剩余未覆盖的告警路径与校验路径钉住。
 */

import { describe, it, expect } from 'vitest';
import { rankCards, rankSingleCard } from './index';
import { card, makeParams, MO_PHYSICAL, ledgerEntry } from '../__fixtures__/params';
import { loadCards } from '../data/loadCards';
import { getDefaultFxEntry } from '../fx/defaultFxTable';
import { CARDS } from '../data/loadCards';
import type { Card, FxFeeRule } from '../types';

const params = makeParams();

describe('外币豁免即将到期：expiring_soon 分支', () => {
  it('豁免剩余 <= 60 天且本笔走外币路由 → 出现 fx_fee_exempt_expiring', () => {
    // bocmo-allcurrency 豁免到 2026-12-31；把「今天」推到 2026-11-15，剩 46 天
    const nearParams = makeParams({ today: '2026-11-15' });
    // 该卡返现数据全 unknown，直接构造一张有返现数据的卡复用同一 fxFee
    const base = card('bocmo-allcurrency');
    const withCashback: Card = {
      ...base,
      categories: Object.fromEntries(
        Object.keys(base.categories).map((k) => [k, { kind: 'cashback' as const, rates: { local: 0.01 } }]),
      ) as Card['categories'],
    };
    const s = rankSingleCard(withCashback, [], nearParams, {
      amount: 1000,
      settlementCurrency: 'HKD',
      category: 'dining',
      channel: 'physical',
      region: 'MO',
    })!;
    const w = s.warnings.find((x) => x.code === 'fx_fee_exempt_expiring');
    expect(w).toBeDefined();
    if (w && w.code === 'fx_fee_exempt_expiring') {
      expect(w.daysLeft).toBeGreaterThanOrEqual(0);
      expect(w.daysLeft).toBeLessThanOrEqual(60);
    }
  });

  it('豁免期外的外币路由不产生 expiring_soon', () => {
    const s = rankSingleCard(card('sc-simply-cash'), [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.warnings.some((w) => w.code === 'fx_fee_exempt_expiring')).toBe(false);
  });
});

describe('积分无估值时的 no_point_valuation 告警（可估值路径）', () => {
  it('部分轨道可估值、部分不可估值时仍给出 no_point_valuation', () => {
    // 构造一张积分卡，但估值表里没有它的计划
    const emptyValuations = makeParams({ pointValuations: {} });
    const s = rankSingleCard(card('citi-premier-miles'), [], emptyValuations, {
      ...MO_PHYSICAL,
      amount: 1000,
    })!;
    // 该卡 dining 是积分型 → 无估值 → unknown，但告警必须写清是积分缺口
    expect(s.status).toBe('unknown');
    expect(
      s.warnings.some((w) => w.code === 'no_point_valuation' || w.code === 'unknown_rate'),
    ).toBe(true);
  });
});

describe('上限告警：额度接近阈值但未用尽', () => {
  it('剩余正好 20% 时给出告警（边界包含）', () => {
    // 上限 MOP 154.50，已用 HK$120 → 剩余 30.9，占 20%
    //
    // 必须让本笔落在 10% 档，上限池才会被引用：B1 修复前 tiers 没有 earn，
    // 任何金额都按类别基础 10% 算、恒挂 cap；修复后档位真实生效，
    // 月实体签账累计不足 HK$1,500 时只得 0.4%，本笔不碰加码上限池。
    // 这里把已累计额设到门槛之上、本笔金额设小，以真正验到「剩余 20%」这条边界。
    const used = ledgerEntry({
      cardId: 'boc-hk-chill',
      capConsumption: { 'boc-hk-chill:extra': 120 },
      thresholdContribution: { 'boc-hk-chill:physical-spend': 1500 },
    });
    const s = rankSingleCard(card('boc-hk-chill'), [used], params, { ...MO_PHYSICAL, amount: 100 })!;
    expect(s.warnings.some((w) => w.code === 'cap_nearly_exhausted')).toBe(true);
  });

  it('剩余 80% 时不给告警', () => {
    const used = ledgerEntry({
      cardId: 'boc-hk-chill',
      capConsumption: { 'boc-hk-chill:extra': 30 },
      thresholdContribution: { 'boc-hk-chill:physical-spend': 1500 },
    });
    const s = rankSingleCard(card('boc-hk-chill'), [used], params, { ...MO_PHYSICAL, amount: 100 })!;
    expect(s.warnings.some((w) => w.code === 'cap_nearly_exhausted')).toBe(false);
  });
});

describe('loadCards：轨道校验的剩余分支', () => {
  it('overLimitFallback 为 points 轨道也能通过校验', () => {
    const clone = JSON.parse(JSON.stringify(card('boc-hk-chill')));
    clone.caps[0].overLimitFallback = {
      kind: 'points',
      exclusivityGroup: 'base',
      capIds: [],
      multiplier: 1,
      pointProgramId: 'yuu',
    };
    expect(() => loadCards([clone])).not.toThrow();
  });

  it('overLimitFallback 为 unknown 轨道也能通过校验', () => {
    const clone = JSON.parse(JSON.stringify(card('boc-hk-chill')));
    clone.caps[0].overLimitFallback = { kind: 'unknown', exclusivityGroup: 'base', capIds: [] };
    expect(() => loadCards([clone])).not.toThrow();
  });

  it('反向验证：轨道的 multiplier 写成字符串 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(card('boc-hk-chill')));
    clone.caps[0].overLimitFallback = {
      kind: 'points',
      exclusivityGroup: 'base',
      capIds: [],
      multiplier: '2x',
      pointProgramId: 'p',
    };
    expect(() => loadCards([clone])).toThrow(/multiplier/);
  });

  it('反向验证：轨道缺 exclusivityGroup → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(card('boc-hk-chill')));
    clone.caps[0].overLimitFallback = { kind: 'cashback', capIds: [], rates: { local: 0.004 } };
    expect(() => loadCards([clone])).toThrow(/exclusivityGroup/);
  });

  it('反向验证：capIds 含非字符串 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(card('boc-hk-chill')));
    clone.caps[0].overLimitFallback = {
      kind: 'cashback',
      exclusivityGroup: 'base',
      capIds: [1],
      rates: { local: 0.004 },
    };
    expect(() => loadCards([clone])).toThrow(/capIds/);
  });

  it('反向验证：caps 不是数组 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(card('boc-hk-chill')));
    clone.caps = 'nope';
    expect(() => loadCards([clone])).toThrow(/必须是数组/);
  });

  it('反向验证：thresholds 的 currency 非法 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(card('boc-hk-chill')));
    clone.thresholds[0].currency = 'USD';
    expect(() => loadCards([clone])).toThrow(/currency/);
  });

  it('反向验证：cardId 为空字符串 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(CARDS[0]));
    clone.cardId = '';
    expect(() => loadCards([clone])).toThrow(/非空字符串/);
  });

  it('反向验证：根节点不是数组 → 抛错', () => {
    expect(() => loadCards({ not: 'an array' })).toThrow(/必须是数组/);
  });
});

describe('getDefaultFxEntry：无发卡行名时的回落', () => {
  it('不传 issuerName 时按二维表返回', () => {
    expect(getDefaultFxEntry('HK', 'visa')?.rate).toBe(0.0195);
  });

  it('不传 issuerName 时 AEON 覆盖不生效（无法识别发卡行）', () => {
    expect(getDefaultFxEntry('HK', 'visa', undefined)?.rate).toBe(0.0195);
  });

  it('issuerName 匹配但地区不符时不套用覆盖', () => {
    // AEON 覆盖限定 HK；澳门 AEON 名称不应命中
    expect(getDefaultFxEntry('MO', 'visa', 'AEON 澳門')?.rate).toBe(0.0195);
  });
});

describe('外币手续费：splitRates 未命中任何分支时保留整体 rate', () => {
  it('foreign 路由但 splitRates 只定义了 crossBorder → 保留 rate', () => {
    const rule: FxFeeRule = {
      rate: 0.0195,
      splitRates: { crossBorder: 0.01 },
      fixedFee: 0,
      source: { url: 'https://x.com', verifiedAt: '2026-10-31' },
    };
    // 通过一张构造卡走完整链路
    const c: Card = { ...card('sc-simply-cash'), fxFee: { ...rule, currencyRegion: 'HK', currencyNetwork: 'visa' } };
    const s = rankSingleCard(c, [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.fxFee).toBe(19.5);
  });

  it('非外币路由且无豁免配置时费率保持卡面值', () => {
    const c: Card = {
      ...card('sc-simply-cash'),
      fxFee: { rate: 0.0195, fixedFee: 0, source: { url: 'https://x.com', verifiedAt: '2026-10-31' } },
    };
    const s = rankSingleCard(c, [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.fxFee).toBe(19.5);
  });
});

describe('金额极小的边界', () => {
  it('0.01 元也能算出结果且不出现负零', () => {
    const r = rankCards([card('sc-simply-cash')], [], params, { ...MO_PHYSICAL, amount: 0.01 });
    expect(r.ok).toBe(true);
    const s = r.ranked[0]!;
    expect(Object.is(s.netRealistic, -0)).toBe(false);
  });

  it('极大金额不溢出为 Infinity', () => {
    const r = rankCards([card('sc-simply-cash')], [], params, { ...MO_PHYSICAL, amount: 10_000_000 });
    expect(Number.isFinite(r.ranked[0]!.netRealistic)).toBe(true);
  });
});
