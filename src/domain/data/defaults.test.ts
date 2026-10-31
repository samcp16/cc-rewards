/**
 * 数据层测试：默认费率表、积分估值、渠道费率。
 *
 * 这些是「输入能否被信任」的关口。把关口测松了，后面所有数字都没有意义。
 * 卡库结构校验（loadCards）单独在 loadCards.test.ts —— 它有自己的 20 多条反向验证，
 * 混在一起会让「校验规则漏了哪条」难以一眼确认。
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultFx,
  getDefaultFxEntry,
  UNIONPAY_DUAL_CURRENCY_WAIVER,
} from '../fx/defaultFxTable';
import {
  resolvePointValuation,
  buildPointValuations,
  CONSERVATIVE_VALUE_PER_POINT,
} from '../fx/pointValuation';
import { DEFAULT_CHANNEL_FEES } from './channelFees';
import { CARDS } from './loadCards';

describe('defaultFxTable：按 issuerRegion + network 二维带出', () => {
  it('香港 Visa / MC = 1.95%', () => {
    expect(getDefaultFx('HK', 'visa')).toBe(0.0195);
    expect(getDefaultFx('HK', 'mastercard')).toBe(0.0195);
  });

  it('Amex = 2.0%', () => {
    expect(getDefaultFx('HK', 'amex')).toBe(0.02);
  });

  it('香港银联 = 1%（其他外币），人民币/澳门币走卡级豁免', () => {
    expect(getDefaultFx('HK', 'unionpay')).toBe(0.01);
  });

  it('澳门银联 = 0%', () => {
    expect(getDefaultFx('MO', 'unionpay')).toBe(0);
  });

  it('AEON 发卡行级覆盖为 1.5%（AC-F2-03 明确列出）', () => {
    const entry = getDefaultFxEntry('HK', 'visa', 'AEON Credit Service');
    expect(entry?.rate).toBe(0.015);
  });

  it('非 AEON 的香港 Visa 不受该覆盖影响', () => {
    const entry = getDefaultFxEntry('HK', 'visa', 'HSBC');
    expect(entry?.rate).toBe(0.0195);
  });

  it('未覆盖组合返回 null，由表单强制用户填写（AC-F2-04）', () => {
    expect(getDefaultFx('HK', 'jcb')).toBe(0.0195);
    expect(getDefaultFxEntry('MO', 'jcb', undefined)?.rate).toBe(0.0195);
  });

  it('银联双币豁免币种集合为 MOP / HKD / CNY', () => {
    expect(UNIONPAY_DUAL_CURRENCY_WAIVER).toEqual(['MOP', 'HKD', 'CNY']);
  });

  it('所有默认值都带 source（不得出现无出处的魔法数字）', () => {
    for (const region of ['HK', 'MO'] as const) {
      for (const network of ['visa', 'mastercard', 'unionpay', 'amex'] as const) {
        const entry = getDefaultFxEntry(region, network);
        expect(entry?.source.url).toBeTruthy();
        expect(entry?.source.verifiedAt).toBe('2026-10-31');
      }
    }
  });
});

describe('pointValuation：积分估值', () => {
  const yuu = { programId: 'yuu', valuePerPoint: 0.005, currency: 'HKD' as const, derivation: 'yuu 200 分 = HK$1' };
  const mr = { programId: 'amex-mr', valuePerPoint: null, currency: 'HKD' as const, derivation: '官方无固定值' };

  it('有官方固定值 → confirmed', () => {
    const r = resolvePointValuation(yuu)!;
    expect(r.basis).toBe('confirmed');
    expect(r.valuePerPoint).toBe(0.005);
  });

  it('无官方值 → estimated，用保守下限并说明', () => {
    const r = resolvePointValuation(mr)!;
    expect(r.basis).toBe('estimated');
    expect(r.valuePerPoint).toBe(CONSERVATIVE_VALUE_PER_POINT);
    expect(r.note).toContain('保守');
  });

  it('用户覆盖优先于一切', () => {
    const r = resolvePointValuation(mr, { valuePerPoint: 0.01, currency: 'HKD' })!;
    expect(r.basis).toBe('user_provided');
    expect(r.valuePerPoint).toBe(0.01);
  });

  it('用户传 0 或负数不作为有效覆盖（避免把估值改成 0 让卡消失）', () => {
    expect(resolvePointValuation(mr, { valuePerPoint: 0, currency: 'HKD' })!.basis).toBe('estimated');
    expect(resolvePointValuation(mr, { valuePerPoint: -1, currency: 'HKD' })!.basis).toBe('estimated');
  });

  it('无积分计划返回 null', () => {
    expect(resolvePointValuation(null)).toBeNull();
  });

  it('buildPointValuations 覆盖卡库全部积分计划，且不重复', () => {
    const map = buildPointValuations(CARDS);
    const programIds = new Set(CARDS.filter((c) => c.pointsValuation).map((c) => c.pointsValuation!.programId));
    expect(Object.keys(map).sort()).toEqual([...programIds].sort());
  });

  it('卡库里 estimated 的计划确实存在（说明这条兜底不是空逻辑）', () => {
    const map = buildPointValuations(CARDS);
    const estimated = Object.values(map).filter((v) => v.basis === 'estimated');
    expect(estimated.length).toBeGreaterThan(0);
  });
});

describe('channelFees：默认规则集', () => {
  it('覆盖全部五种渠道', () => {
    const channels = new Set(DEFAULT_CHANNEL_FEES.map((r) => r.channel));
    expect([...channels].sort()).toEqual(['alipay', 'apple_pay', 'physical', 'unionpay_qr', 'wechat']);
  });

  it('每条规则都带来源', () => {
    for (const r of DEFAULT_CHANNEL_FEES) {
      expect(r.source.url).toBeTruthy();
      expect(r.source.verifiedAt).toBe('2026-10-31');
    }
  });
});
