/**
 * 手续费与排序测试（第 4-6 步）。
 */

import { describe, it, expect } from 'vitest';
import { computeFxFee, computeChannelFee, pickChannelTier, isCardActive } from './fees';
import { rankSchemes, splitUnknown, TIE_THRESHOLD } from './rank';
import { DEFAULT_CHANNEL_FEES } from '../data/channelFees';
import { DEFAULT_FX_TABLE } from '../fx/fxReference';
import type { ChannelFeeRule } from '../types';
import type { Scheme } from '../types.result';

const fxResolution = {
  rate: 0.0195,
  fixedFee: 0,
  exempt: false,
  validity: { state: 'permanent' as const },
  sourceUrl: 'https://www.sc.com/hk/credit-cards/simplycash/',
  verifiedAt: '2026-10-31',
};

describe('computeFxFee', () => {
  it('外币手续费 = 金额 × 费率', () => {
    const r = computeFxFee(fxResolution, 1000);
    expect(r.amount).toBe(19.5);
  });

  it('含固定费时相加', () => {
    const r = computeFxFee({ ...fxResolution, fixedFee: 5 }, 1000);
    expect(r.amount).toBe(24.5);
  });

  it('豁免时金额为 0 且标记 exempt', () => {
    const r = computeFxFee({ ...fxResolution, rate: 0, exempt: true }, 1000);
    expect(r.amount).toBe(0);
    expect(r.exempt).toBe(true);
  });
});

describe('computeChannelFee：渠道 × 卡组织 × 金额档', () => {
  const base = {
    settlementCurrency: 'CNY' as const,
    region: 'CN' as const,
    freeUsed: 0,
    rules: DEFAULT_CHANNEL_FEES,
    fx: DEFAULT_FX_TABLE,
  };

  it('内地支付宝 + Visa + 1000 元 → 3%', () => {
    const r = computeChannelFee({ ...base, channel: 'alipay', network: 'visa', issuerRegion: 'HK', amount: 1000 });
    expect(r.rate).toBe(0.03);
    expect(r.amount).toBe(30);
  });

  it('内地支付宝 + 银联 → 无匹配规则，按 0 计并标注', () => {
    const r = computeChannelFee({ ...base, channel: 'alipay', network: 'unionpay', issuerRegion: 'HK', amount: 1000 });
    expect(r.amount).toBe(0);
    expect(r.note).toContain('未收录');
  });

  it('金额档边界：199 元免，200 元收 3%', () => {
    const at199 = computeChannelFee({ ...base, channel: 'alipay', network: 'visa', issuerRegion: 'HK', amount: 199 });
    const at200 = computeChannelFee({ ...base, channel: 'alipay', network: 'visa', issuerRegion: 'HK', amount: 200 });
    expect(at199.amount).toBe(0);
    expect(at200.amount).toBe(6);
  });

  it('实体刷卡 0 手续费', () => {
    const r = computeChannelFee({ ...base, channel: 'physical', network: 'visa', issuerRegion: 'HK', amount: 1000 });
    expect(r.amount).toBe(0);
  });

  it('带来源链接（AC-F4-02）', () => {
    const r = computeChannelFee({ ...base, channel: 'alipay', network: 'visa', issuerRegion: 'HK', amount: 1000 });
    expect(r.sourceUrl).toBeTruthy();
    expect(r.verifiedAt).toBe('2026-10-31');
  });

  it('月度免费额度：额度内不计费，超出的部分才计费', () => {
    const rule: ChannelFeeRule = {
      id: 'test-free',
      channel: 'alipay',
      networkIn: ['visa'],
      monthlyFreeAllowance: { amount: 3000, currency: 'HKD' },
      tiers: [{ fromAmount: 0, toAmount: null, rate: 0.025, fixedFee: 0 }],
      source: { url: 'https://alipayhk.com', verifiedAt: '2026-10-31' },
    };
    const r = computeChannelFee({
      ...base,
      amount: 1000,
      settlementCurrency: 'HKD',
      channel: 'alipay',
      network: 'visa',
      issuerRegion: 'HK',
      freeUsed: 2500,
      rules: [rule],
    });
    // 剩余免费额度 500，可计费 500 × 2.5% = 12.5
    expect(r.amount).toBe(12.5);
    expect(r.allowanceNote).toBeUndefined();
  });

  it('额度用尽后全额计费', () => {
    const rule: ChannelFeeRule = {
      id: 'test-free',
      channel: 'alipay',
      networkIn: ['visa'],
      monthlyFreeAllowance: { amount: 3000, currency: 'HKD' },
      tiers: [{ fromAmount: 0, toAmount: null, rate: 0.025, fixedFee: 0 }],
      source: { url: 'https://alipayhk.com', verifiedAt: '2026-10-31' },
    };
    const r = computeChannelFee({
      ...base,
      amount: 1000,
      settlementCurrency: 'HKD',
      channel: 'alipay',
      network: 'visa',
      issuerRegion: 'HK',
      freeUsed: 3000,
      rules: [rule],
    });
    expect(r.amount).toBe(25);
  });

  it('免费额度跨币种时给出折算说明', () => {
    const rule: ChannelFeeRule = {
      id: 'test-free',
      channel: 'alipay',
      monthlyFreeAllowance: { amount: 3000, currency: 'HKD' },
      tiers: [{ fromAmount: 0, toAmount: null, rate: 0.025, fixedFee: 0 }],
      source: { url: 'https://alipayhk.com', verifiedAt: '2026-10-31' },
    };
    const r = computeChannelFee({
      ...base,
      amount: 1000,
      settlementCurrency: 'MOP',
      channel: 'alipay',
      network: 'visa',
      issuerRegion: 'HK',
      rules: [rule],
    });
    expect(r.allowanceNote).toContain('免费额度');
  });

  it('反向验证：规则无金额档 → 抛错', () => {
    expect(() =>
      pickChannelTier({ id: 'x', channel: 'physical', tiers: [], source: { url: 'u', verifiedAt: 'd' } }, 100),
    ).toThrow(/没有任何金额档/);
  });

  it('issuerRegionIn 不匹配时不套用该规则', () => {
    const rule: ChannelFeeRule = {
      id: 'mo-only',
      channel: 'alipay',
      issuerRegionIn: ['MO'],
      tiers: [{ fromAmount: 0, toAmount: null, rate: 0.05, fixedFee: 0 }],
      source: { url: 'u', verifiedAt: 'd' },
    };
    const r = computeChannelFee({ ...base, channel: 'alipay', network: 'visa', issuerRegion: 'HK', amount: 1000, rules: [rule] });
    expect(r.amount).toBe(0);
  });
});

describe('isCardActive', () => {
  it('未声明 active 视为启用', () => {
    expect(isCardActive({})).toBe(true);
  });
  it('active=false 视为停用', () => {
    expect(isCardActive({ active: false })).toBe(false);
  });
});

const mkScheme = (over: Partial<Scheme>): Scheme => ({
  cardId: 'x',
  cardName: 'X',
  issuer: 'I',
  issuerRegion: 'HK',
  network: 'visa',
  confidence: 'high',
  verifiedAt: '2026-10-31',
  status: 'ranked',
  route: 'foreign',
  rateSide: 'foreign',
  grossCashback: 0,
  pointsValue: 0,
  fxFee: 0,
  channelFee: 0,
  netRealistic: 0,
  netOptimistic: 0,
  netRateRealistic: 0,
  netRateOptimistic: 0,
  breakdown: [],
  warnings: [],
  capsAffected: [],
  fxWaiverValidity: { state: 'permanent' },
  tieWithNext: false,
  ...over,
});

describe('rankSchemes：排序与并列', () => {
  it('按净回报率降序，不用净额', () => {
    // 小额高回报率卡应排在大额低回报率卡之前
    const highRateSmall = mkScheme({ cardId: 'a', netRealistic: 12, netRateRealistic: 0.0316 });
    const lowRateBig = mkScheme({ cardId: 'b', netRealistic: 240, netRateRealistic: 0.02 });
    const sorted = rankSchemes([lowRateBig, highRateSmall]);
    expect(sorted[0]!.cardId).toBe('a');
  });

  it('回报率相同时按净额降序', () => {
    const a = mkScheme({ cardId: 'a', netRealistic: 10, netRateRealistic: 0.02 });
    const b = mkScheme({ cardId: 'b', netRealistic: 20, netRateRealistic: 0.02 });
    expect(rankSchemes([a, b])[0]!.cardId).toBe('b');
  });

  it('全部相同时按 cardId 升序，保证确定性', () => {
    const a = mkScheme({ cardId: 'a' });
    const b = mkScheme({ cardId: 'b' });
    expect(rankSchemes([b, a]).map((s) => s.cardId)).toEqual(['a', 'b']);
  });

  it('unknown 卡不进入排序结果', () => {
    const unknown = mkScheme({ cardId: 'u', status: 'unknown' });
    const ok = mkScheme({ cardId: 'ok' });
    expect(rankSchemes([unknown, ok]).map((s) => s.cardId)).toEqual(['ok']);
  });

  it('差距小于阈值标 tieWithNext', () => {
    const a = mkScheme({ cardId: 'a', netRateRealistic: 0.02 });
    const b = mkScheme({ cardId: 'b', netRateRealistic: 0.02 - TIE_THRESHOLD / 2 });
    expect(rankSchemes([a, b])[0]!.tieWithNext).toBe(true);
  });

  it('差距大于阈值不标', () => {
    const a = mkScheme({ cardId: 'a', netRateRealistic: 0.02 });
    const b = mkScheme({ cardId: 'b', netRateRealistic: 0.01 });
    expect(rankSchemes([a, b])[0]!.tieWithNext).toBe(false);
  });

  it('不修改输入数组（纯函数）', () => {
    const input = [mkScheme({ cardId: 'b', netRateRealistic: 0.01 }), mkScheme({ cardId: 'a', netRateRealistic: 0.02 })];
    const snapshot = input.map((s) => s.cardId);
    rankSchemes(input);
    expect(input.map((s) => s.cardId)).toEqual(snapshot);
  });

  it('splitUnknown 按状态分组', () => {
    const { ranked, unranked } = splitUnknown([
      mkScheme({ cardId: 'a' }),
      mkScheme({ cardId: 'u', status: 'unknown' }),
    ]);
    expect(ranked.map((s) => s.cardId)).toEqual(['a']);
    expect(unranked.map((s) => s.cardId)).toEqual(['u']);
  });
});
