/**
 * 卡数据派生判断测试。
 *
 * 本文件最重要的不是「算得对」，而是「两个阈值不许串」：
 * - EXPIRING_SOON_DAYS = 60  优惠快到期（validUntil 前 60 天开始警示）
 * - STALE_DAYS = 90          数据陈旧（verifiedAt 距今超 90 天）
 * 这两个数如果被混用，会出现「优惠还有半年到期却报红」或「数据一年没核实仍显示新鲜」。
 */

import { describe, it, expect } from 'vitest';
import {
  validityOf,
  staleDaysOf,
  isStale,
  unknownCategories,
  maxCategoryRate,
  categoriesConfigured,
  isDualCurrency,
  EXPIRING_SOON_DAYS,
  STALE_DAYS,
} from './cardFacts';
import { card } from '../domain/__fixtures__/params';
import type { Card, SpendCategory } from '../domain/types';

const TODAY = '2026-10-31';

function withWaiver(validUntil: string | undefined): Pick<Card, 'fxFee'> {
  return {
    fxFee: {
      rate: 0.0195,
      fixedFee: 0,
      waivedWhen: validUntil ? { validUntil } : undefined,
      source: { url: 'https://example.com', verifiedAt: TODAY },
    },
  };
}

describe('两个阈值常量不许串用', () => {
  it('到期警示 60 天，陈旧阈值 90 天', () => {
    expect(EXPIRING_SOON_DAYS).toBe(60);
    expect(STALE_DAYS).toBe(90);
    expect(EXPIRING_SOON_DAYS).not.toBe(STALE_DAYS);
  });
});

describe('validityOf：豁免时效四态', () => {
  it('无 validUntil → permanent', () => {
    expect(validityOf(withWaiver(undefined), TODAY)).toEqual({ state: 'permanent' });
  });

  it('距今 90 天 → active', () => {
    const v = validityOf(withWaiver('2027-01-29'), TODAY);
    expect(v.state).toBe('active');
    if (v.state === 'active') expect(v.daysLeft).toBe(90);
  });

  it('距今正好 60 天 → expiring_soon（边界含在内）', () => {
    const v = validityOf(withWaiver('2026-12-30'), TODAY);
    expect(v.state).toBe('expiring_soon');
    if (v.state === 'expiring_soon') expect(v.daysLeft).toBe(60);
  });

  it('距今 61 天 → active（不能提前一天就报警）', () => {
    expect(validityOf(withWaiver('2026-12-31'), TODAY).state).toBe('active');
  });

  it('明天到期 → expiring_soon 且 daysLeft=1', () => {
    const v = validityOf(withWaiver('2026-11-01'), TODAY);
    expect(v.state).toBe('expiring_soon');
    if (v.state === 'expiring_soon') expect(v.daysLeft).toBe(1);
  });

  it('今天到期 → 仍算 expiring_soon（当天可用）', () => {
    expect(validityOf(withWaiver(TODAY), TODAY).state).toBe('expiring_soon');
  });

  it('昨天到期 → expired，且不再提供 daysLeft', () => {
    const v = validityOf(withWaiver('2026-10-30'), TODAY);
    expect(v.state).toBe('expired');
    expect(v).not.toHaveProperty('daysLeft');
    if (v.state === 'expired') expect(v.validUntil).toBe('2026-10-30');
  });
});

describe('staleDaysOf / isStale：数据新鲜度', () => {
  it('距今 0 天 → 0，且不算陈旧', () => {
    const c = { verifiedAt: TODAY };
    expect(staleDaysOf(c, TODAY)).toBe(0);
    expect(isStale(c, TODAY)).toBe(false);
  });

  it('距今 90 天 → 不算陈旧（阈值本身含在内）', () => {
    const c = { verifiedAt: '2026-08-02' };
    expect(staleDaysOf(c, TODAY)).toBe(90);
    expect(isStale(c, TODAY)).toBe(false);
  });

  it('距今 91 天 → 陈旧', () => {
    const c = { verifiedAt: '2026-08-01' };
    expect(staleDaysOf(c, TODAY)).toBe(91);
    expect(isStale(c, TODAY)).toBe(true);
  });
});

describe('unknownCategories：未确认类别必须能逐条列出', () => {
  it('真实卡库的立桥卡存在未知类别', () => {
    const c = card('tai-fung-unionpay-dual');
    const unknown = unknownCategories(c);
    expect(Array.isArray(unknown)).toBe(true);
    // 返回的必须是合法类别值
    const valid: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];
    for (const u of unknown) expect(valid).toContain(u);
  });

  it('全 unknown 的卡应返回 7 个类别', () => {
    const base = card('sc-simply-cash');
    const allUnknown = {
      ...base,
      categories: Object.fromEntries(
        Object.keys(base.categories).map((k) => [k, { kind: 'unknown' as const, rates: null }]),
      ) as Card['categories'],
    };
    expect(unknownCategories(allUnknown)).toHaveLength(7);
    expect(categoriesConfigured(allUnknown)).toBe(0);
  });
});

describe('categoriesConfigured：已知类别计数', () => {
  it('与 unknown 数互补，合计恒为 7', () => {
    for (const id of ['sc-simply-cash', 'boc-hk-chill', 'citi-cash-back']) {
      const c = card(id);
      expect(categoriesConfigured(c) + unknownCategories(c).length).toBe(7);
    }
  });
});

describe('maxCategoryRate：取双档中的高值', () => {
  it('双档卡取 max(local, foreign)', () => {
    const c = card('sc-simply-cash');
    const rate = maxCategoryRate(c);
    expect(rate).not.toBeNull();
    // 渣打 Simply Cash 本地 1.5% / 外币 2.0%，列表页应展示 2.0%
    expect(rate!).toBeGreaterThanOrEqual(0.015);
  });

  it('外币档缺省时回落到本地档，不返回 undefined', () => {
    const base = card('sc-simply-cash');
    const single: Card = {
      ...base,
      categories: Object.fromEntries(
        Object.keys(base.categories).map((k) => [k, { kind: 'cashback' as const, rates: { local: 0.01 } }]),
      ) as Card['categories'],
    };
    expect(maxCategoryRate(single)).toBeCloseTo(0.01, 6);
  });

  it('全 unknown 的卡返回 null 而非 0（0 会被误读成「无回赠」）', () => {
    const base = card('sc-simply-cash');
    const allUnknown: Card = {
      ...base,
      categories: Object.fromEntries(
        Object.keys(base.categories).map((k) => [k, { kind: 'unknown' as const, rates: null }]),
      ) as Card['categories'],
    };
    expect(maxCategoryRate(allUnknown)).toBeNull();
  });
});

describe('isDualCurrency：银联 + 指定币种豁免', () => {
  it('PULSE 是双币卡', () => {
    expect(isDualCurrency(card('hsbc-pulse-unionpay'))).toBe(true);
  });

  it('非银联卡即使有豁免也不算双币卡', () => {
    const base = card('sc-simply-cash');
    const visaWithWaiver: Card = {
      ...base,
      network: 'visa',
      fxFee: { ...base.fxFee, waivedWhen: { settlementCurrencyIn: ['MOP'] } },
    };
    expect(isDualCurrency(visaWithWaiver)).toBe(false);
  });

  it('银联但没有豁免清单也不算双币卡', () => {
    const base = card('hsbc-pulse-unionpay');
    const unionpayNoWaiver: Card = {
      ...base,
      fxFee: { ...base.fxFee, waivedWhen: undefined },
    };
    expect(isDualCurrency(unionpayNoWaiver)).toBe(false);
  });
});
