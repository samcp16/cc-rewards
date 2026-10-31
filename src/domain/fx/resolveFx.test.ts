/**
 * 外币手续费解析测试。
 *
 * 覆盖三条最容易出错的语义：
 * 1. 费率由路由决定，不在这里二次判币种
 * 2. 豁免有生效期，过期必须失效（AC-F6-04）
 * 3. splitRates 优先于 rate
 */

import { describe, it, expect } from 'vitest';
import { resolveFxFee, resolveValidity } from './resolveFx';
import type { FxFeeRule } from '../types';

const scRule: FxFeeRule = {
  rate: 0.0195,
  fixedFee: 0,
  source: { url: 'https://www.sc.com/hk/credit-cards/simplycash/', verifiedAt: '2026-10-31' },
};

const today = '2026-10-31';

describe('resolveValidity：提前 60 天警示', () => {
  it('无 validUntil → permanent', () => {
    expect(resolveValidity(undefined, today)).toEqual({ state: 'permanent' });
  });

  it('剩余超过 60 天 → active', () => {
    const v = resolveValidity('2027-03-31', today);
    expect(v.state).toBe('active');
  });

  it('剩余恰好 60 天 → expiring_soon（边界包含）', () => {
    // 2026-10-31 + 60 天 = 2026-12-30
    const v = resolveValidity('2026-12-30', today);
    expect(v.state).toBe('expiring_soon');
    if (v.state === 'expiring_soon') expect(v.daysLeft).toBe(60);
  });

  it('剩余 61 天 → active（边界外）', () => {
    const v = resolveValidity('2026-12-31', today);
    expect(v.state).toBe('active');
  });

  it('当地日期已过 → expired', () => {
    const v = resolveValidity('2026-06-30', today);
    expect(v.state).toBe('expired');
    if (v.state === 'expired') expect(v.validUntil).toBe('2026-06-30');
  });

  it('当天到期仍算未过期（不在到期日当天就剥夺权益）', () => {
    const v = resolveValidity('2026-10-31', today);
    expect(v.state).toBe('expiring_soon');
    if (v.state === 'expiring_soon') expect(v.daysLeft).toBe(0);
  });
});

describe('resolveFxFee：路由决定费率', () => {
  it('local 路由 FTF 为 0', () => {
    const r = resolveFxFee(scRule, {
      route: 'local',
      settlementCurrency: 'HKD',
      region: 'CN',
      today,
      dualCurrencyLocal: false,
      crossCurrency: false,
      crossBorder: false,
    });
    expect(r.rate).toBe(0);
    expect(r.exempt).toBe(true);
    expect(r.waiverNote).toContain('本币结算');
  });

  it('双币卡 local 路由给出官方条款说明，而不是笼统的本币结算', () => {
    const r = resolveFxFee(scRule, {
      route: 'local',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: true,
      crossCurrency: false,
      crossBorder: false,
    });
    expect(r.waiverNote).toContain('银联双币卡');
  });

  it('foreign 路由取 rate', () => {
    const r = resolveFxFee(scRule, {
      route: 'foreign',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: false,
      crossCurrency: true,
      crossBorder: false,
    });
    expect(r.rate).toBe(0.0195);
    expect(r.exempt).toBe(false);
  });

  it('splitRates 存在时 foreign 取 foreign 分项', () => {
    const bcm: FxFeeRule = {
      rate: 0.015,
      splitRates: { foreign: 0.005, crossBorder: 0.01 },
      fixedFee: 0,
      source: { url: 'https://www.smartcardmacao.com/', verifiedAt: '2026-10-31' },
    };
    const r = resolveFxFee(bcm, {
      route: 'foreign',
      settlementCurrency: 'CNY',
      region: 'CN',
      today,
      dualCurrencyLocal: false,
      crossCurrency: true,
      crossBorder: false,
    });
    expect(r.rate).toBe(0.005);
  });

  it('splitRates 存在时 crossBorder 取 crossBorder 分项', () => {
    const bcm: FxFeeRule = {
      rate: 0.015,
      splitRates: { foreign: 0.005, crossBorder: 0.01 },
      fixedFee: 0,
      source: { url: 'https://www.smartcardmacao.com/', verifiedAt: '2026-10-31' },
    };
    const r = resolveFxFee(bcm, {
      route: 'crossBorder',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: false,
      crossCurrency: false,
      crossBorder: true,
    });
    expect(r.rate).toBe(0.01);
  });

  it('crossBorder 未定义分项时退回 foreign，而不是整体 rate', () => {
    const rule: FxFeeRule = {
      rate: 0.0195,
      splitRates: { foreign: 0.005 },
      fixedFee: 0,
      source: { url: 'https://example.com', verifiedAt: '2026-10-31' },
    };
    const r = resolveFxFee(rule, {
      route: 'crossBorder',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: false,
      crossCurrency: false,
      crossBorder: true,
    });
    expect(r.rate).toBe(0.005);
  });
});

describe('resolveFxFee：豁免与时效', () => {
  const waivedRule: FxFeeRule = {
    rate: 0.0195,
    fixedFee: 0,
    waivedWhen: { settlementCurrencyIn: ['MOP', 'HKD', 'CNY'], validUntil: '2026-12-31' },
    source: { url: 'https://www.bochk.com/', verifiedAt: '2026-10-31', note: '官方豁免条款' },
  };

  it('豁免期内 foreign 路由 → rate 0 且 exempt', () => {
    const r = resolveFxFee(waivedRule, {
      route: 'foreign',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: false,
      crossCurrency: true,
      crossBorder: false,
    });
    expect(r.rate).toBe(0);
    expect(r.exempt).toBe(true);
    // 2026-10-31 → 2026-12-31 为 61 天，尚未进入 60 天警示窗
    expect(r.validity.state).toBe('active');
  });

  it('豁免到期后 → 不再按 0 计算，回落到默认费率表', () => {
    const expired: FxFeeRule = {
      ...waivedRule,
      rate: 0, // 推广期内的 0% 本身也失效了
      waivedWhen: { settlementCurrencyIn: ['MOP', 'HKD', 'CNY'], validUntil: '2026-06-30' },
      currencyRegion: 'HK',
      currencyNetwork: 'unionpay',
    };
    const r = resolveFxFee(expired, {
      route: 'foreign',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: false,
      crossCurrency: true,
      crossBorder: false,
    });
    expect(r.validity.state).toBe('expired');
    // 香港银联默认 1%，不是 0%
    expect(r.rate).toBe(0.01);
    expect(r.exempt).toBe(false);
    expect(r.waiverNote).toContain('到期');
  });

  it('豁免币种不在范围内 → 不豁免', () => {
    const rule: FxFeeRule = {
      ...waivedRule,
      waivedWhen: { settlementCurrencyIn: ['HKD'] },
    };
    const r = resolveFxFee(rule, {
      route: 'foreign',
      settlementCurrency: 'CNY',
      region: 'CN',
      today,
      dualCurrencyLocal: false,
      crossCurrency: true,
      crossBorder: false,
    });
    expect(r.rate).toBe(0.0195);
    expect(r.exempt).toBe(false);
  });

  it('豁免地区不在范围内 → 不豁免', () => {
    const rule: FxFeeRule = {
      ...waivedRule,
      waivedWhen: { regions: ['MO'] },
    };
    const r = resolveFxFee(rule, {
      route: 'foreign',
      settlementCurrency: 'MOP',
      region: 'CN',
      today,
      dualCurrencyLocal: false,
      crossCurrency: true,
      crossBorder: false,
    });
    expect(r.rate).toBe(0.0195);
  });

  it('fixedFee 非 0 时即使费率为 0 也不算豁免', () => {
    const rule: FxFeeRule = { rate: 0, fixedFee: 5, source: { url: 'https://x.com', verifiedAt: '2026-10-31' } };
    const r = resolveFxFee(rule, {
      route: 'foreign',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: false,
      crossCurrency: true,
      crossBorder: false,
    });
    expect(r.exempt).toBe(false);
    expect(r.fixedFee).toBe(5);
  });
});

/**
 * local 早退保护（ADR-011 决策 1）。
 *
 * 为什么要抛错而不是返回 0：BCM 的 waivedWhen 在成分可加模型下是多余的 ——
 * 本币结算时跨货币成分天然为 0，不需要一条「豁免」记录。若数据层同时留着
 * splitRates 与 waivedWhen，而本币又不在豁免列表里，那么「local 就免」这件事
 * 没有任何可陈述的依据，静默返回 0 等于把一条本该收的跨境费吃成 0。
 */
describe('local 早退保护：splitRates 存在时必须有明确的豁免依据', () => {
  const withSplit: FxFeeRule = {
    rate: 0.015,
    splitRates: { foreign: 0.005, crossBorder: 0.01, crossCurrencyComponent: 0.005 },
    fixedFee: 0,
    waivedWhen: { settlementCurrencyIn: ['HKD'] },
    source: { url: 'https://example.com', verifiedAt: '2026-10-31' },
  };

  it('splitRates + waivedWhen 不覆盖该币种 + 非双币 → 抛错', () => {
    expect(() =>
      resolveFxFee(withSplit, {
        route: 'local',
        settlementCurrency: 'MOP',
        region: 'MO',
        today,
        dualCurrencyLocal: false,
        crossCurrency: false,
        crossBorder: false,
      }),
    ).toThrow(/缺少明确豁免依据/);
  });

  it('双币卡（dualCurrencyLocal）→ 正常豁免，不抛错', () => {
    const r = resolveFxFee(withSplit, {
      route: 'local',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: true,
      crossCurrency: false,
      crossBorder: false,
    });
    expect(r.rate).toBe(0);
    expect(r.exempt).toBe(true);
  });

  it('splitRates 但无 waivedWhen → 正常豁免（local 就是「没有外币成分」）', () => {
    const noWaiver: FxFeeRule = { ...withSplit, waivedWhen: undefined };
    const r = resolveFxFee(noWaiver, {
      route: 'local',
      settlementCurrency: 'MOP',
      region: 'MO',
      today,
      dualCurrencyLocal: false,
      crossCurrency: false,
      crossBorder: false,
    });
    expect(r.rate).toBe(0);
    expect(r.exempt).toBe(true);
  });

  it('没有 splitRates 的单值卡 → 不触发该保护（旧数据形态）', () => {
    const r = resolveFxFee(
      { ...scRule, waivedWhen: { settlementCurrencyIn: ['HKD'] } },
      { route: 'local', settlementCurrency: 'MOP', region: 'MO', today, dualCurrencyLocal: false, crossCurrency: false, crossBorder: false },
    );
    expect(r.rate).toBe(0);
  });
});
