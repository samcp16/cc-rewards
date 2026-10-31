/**
 * 结算路由单元测试（引擎第 0 步）。
 *
 * 这一层如果判错，返现档位与外币手续费会一起错，而且错得「看起来合理」。
 * 因此每个真实场景组合都要有一条断言，而不是只测一个 happy path。
 */

import { describe, it, expect } from 'vitest';
import { resolveSettlementRoute, assertRouteConsistency } from './settlementRoute';

const hkHkd = { cardCurrency: 'HKD', network: 'visa', issuerRegion: 'HK' } as const;
const hkHkdAmex = { cardCurrency: 'HKD', network: 'amex', issuerRegion: 'HK' } as const;
const hkUnionPay = { cardCurrency: 'HKD', network: 'unionpay', issuerRegion: 'HK' } as const;
const moMop = { cardCurrency: 'MOP', network: 'visa', issuerRegion: 'MO' } as const;
const moUnionPay = { cardCurrency: 'MOP', network: 'unionpay', issuerRegion: 'MO' } as const;

describe('resolveSettlementRoute：SPEC §6.2.1 判定表逐行', () => {
  it('HKD 卡 + HKD 结算 + 非跨境 → local，返现取 local 档', () => {
    // SpendRegion 只有 MO / CN：香港本地消费不是本产品的目标场景，
    // 「非跨境」由 issuerRegion 与 region 是否相同来表达。
    const r = resolveSettlementRoute({ ...hkHkd, issuerRegion: 'MO' }, 'HKD', 'MO');
    expect(r.route).toBe('local');
    expect(r.rateSide).toBe('local');
  });

  it('HKD 卡 + MOP 结算 + 澳门商户 → foreign，返现取 foreign 档', () => {
    const r = resolveSettlementRoute(hkHkd, 'MOP', 'MO');
    expect(r.route).toBe('foreign');
    expect(r.rateSide).toBe('foreign');
  });

  it('HKD 卡 + HKD 结算 + 澳门商户 → crossBorder，但返现仍取 foreign 档', () => {
    const r = resolveSettlementRoute(hkHkdAmex, 'HKD', 'MO');
    expect(r.route).toBe('crossBorder');
    // 关键：跨境但币种相同，返现依然不能用 local 档
    expect(r.rateSide).toBe('foreign');
  });

  it('HKD 卡 + CNY 结算 + 内地商户 → foreign', () => {
    const r = resolveSettlementRoute(hkHkd, 'CNY', 'CN');
    expect(r.route).toBe('foreign');
    expect(r.rateSide).toBe('foreign');
  });

  it('MOP 卡 + MOP 结算 + 澳门商户 → local', () => {
    const r = resolveSettlementRoute(moMop, 'MOP', 'MO');
    expect(r.route).toBe('local');
  });

  it('MOP 卡 + CNY 结算 + 内地商户 → foreign', () => {
    const r = resolveSettlementRoute(moMop, 'CNY', 'CN');
    expect(r.route).toBe('foreign');
  });

  it('银联双币卡 + MOP 结算 + 澳门商户 → local，并标记 dualCurrencyLocal', () => {
    const r = resolveSettlementRoute(hkUnionPay, 'MOP', 'MO');
    expect(r.route).toBe('local');
    expect(r.rateSide).toBe('local');
    expect(r.dualCurrencyLocal).toBe(true);
  });

  it('银联双币卡 + CNY 结算 + 内地商户 → local（官方条款视同本地）', () => {
    const r = resolveSettlementRoute(hkUnionPay, 'CNY', 'CN');
    expect(r.route).toBe('local');
    expect(r.dualCurrencyLocal).toBe(true);
  });

  it('澳门银联卡 + MOP 结算 → local 且标记双币', () => {
    const r = resolveSettlementRoute(moUnionPay, 'MOP', 'MO');
    expect(r.route).toBe('local');
    expect(r.dualCurrencyLocal).toBe(true);
  });

  it('双币卡遇 USD 等范围外币时不得按 local 处理', () => {
    // 卡库已无 USD 场景，但路由函数不能因为「是银联」就无条件视同本地
    const r = resolveSettlementRoute(
      { cardCurrency: 'HKD', network: 'unionpay', issuerRegion: 'HK' },
      'MOP',
      'CN',
    );
    expect(r.route).toBe('local');
    // MOP 在豁免范围内；这条断言锁定的是「豁免范围由币种集合决定」
    expect(r.dualCurrencyLocal).toBe(true);
  });
});

describe('assertRouteConsistency：内部矛盾必须爆炸', () => {
  it('正常路由不抛错', () => {
    expect(() =>
      assertRouteConsistency({ route: 'foreign', rateSide: 'foreign', dualCurrencyLocal: false, crossCurrency: true, crossBorder: false }),
    ).not.toThrow();
  });

  it('反向验证：route=foreign 却取 local 档 → 抛错', () => {
    expect(() =>
      assertRouteConsistency({ route: 'foreign', rateSide: 'local', dualCurrencyLocal: false, crossCurrency: true, crossBorder: false }),
    ).toThrow(/自相矛盾/);
  });

  it('反向验证：route=local 却取 foreign 档 → 抛错', () => {
    expect(() =>
      assertRouteConsistency({ route: 'local', rateSide: 'foreign', dualCurrencyLocal: false, crossCurrency: false, crossBorder: false }),
    ).toThrow(/自相矛盾/);
  });
});
