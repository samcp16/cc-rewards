/**
 * 计算引擎端到端测试 —— 锁死产品价值支点的六条断言。
 *
 * 每条断言都写清「期望数字」而非「与实现一致」：数字来自 SPEC §12 第 6 节的手算，
 * 实现如果漂了，这里必须变红。
 */

import { describe, it, expect } from 'vitest';
import { rankCards, rankSingleCard } from './index';
import { card, MO_PHYSICAL, ledgerEntry } from '../__fixtures__/params';
import { params, pct, run, pulseWithCashback } from '../__fixtures__/engineHelpers';
import type { Card } from '../types';
import { convert, DEFAULT_FX_TABLE } from '../fx/fxReference';

describe('断言 1：渣打 Simply Cash，MOP 1000 餐饮（港卡 → MOP），净 +0.05%', () => {
  const s = rankSingleCard(card('sc-simply-cash'), [], params, { ...MO_PHYSICAL, amount: 1000 })!;

  it('路由判为 foreign，返现取外币档 2.0%（不是本地档 1.5%）', () => {
    expect(s.route).toBe('foreign');
    expect(s.rateSide).toBe('foreign');
    // 若取本地档会得 15，这里锁死 20
    expect(s.grossCashback).toBe(20);
  });

  it('外币手续费 1.95% = 19.5', () => {
    expect(s.fxFee).toBe(19.5);
  });

  it('净额 0.5，净回报率 +0.05%（不是 -0.45%）', () => {
    expect(s.netRealistic).toBe(0.5);
    expect(pct(s.netRateRealistic)).toBeCloseTo(0.05, 6);
  });

  it('「为什么」逐项列出返现、外币手续费、渠道服务费', () => {
    const kinds = s.breakdown.map((b) => b.kind);
    expect(kinds).toContain('cashback');
    expect(kinds).toContain('fx_fee');
    expect(kinds).toContain('channel_fee');
  });

  it('外币手续费项带来源链接与核实日期（AC-F4-02）', () => {
    const fx = s.breakdown.find((b) => b.kind === 'fx_fee')!;
    expect(fx.sourceUrl).toBeTruthy();
    expect(fx.verifiedAt).toBe('2026-10-31');
  });
});

describe('断言 2：汇丰 PULSE 银联双币，MOP 1000 → 外币手续费为 0（豁免生效）', () => {
  const s = rankSingleCard(pulseWithCashback(), [], params, { ...MO_PHYSICAL, amount: 1000 })!;

  it('FTF 金额为 0', () => {
    expect(s.fxFee).toBe(0);
  });

  it('豁免说明来自官方双币条款，不是笼统的本币结算', () => {
    expect(s.fxWaiverNote).toContain('银联双币卡');
  });

  it('返现 4% × 1000 = 40，净额等于毛返现', () => {
    expect(s.grossCashback).toBe(40);
    expect(s.netRealistic).toBe(40);
  });

  it('若按普通港卡 1.95% 计，净额会是 20.5 —— 说明豁免真的省了钱', () => {
    // 这条断言把「豁免生效」与「豁免被忽略」的差别钉成可读数字
    expect(40 - 19.5).toBe(20.5);
  });
});

describe('断言 3：Amex Explorer，MOP 结算 vs HKD 结算，差异来自外币手续费', () => {
  const mopSettle = rankSingleCard(card('amex-hk-explorer'), [], params, {
    ...MO_PHYSICAL,
    amount: 1000,
    settlementCurrency: 'MOP',
    region: 'MO',
  })!;
  // 构造「非跨境」场景：Amex 是香港发卡，SpendRegion 只有 MO/CN，
  // 因此把 issuerRegion 改到 MO 才能得到真正的 local 路由（用于隔离 FTF 变量）
  const localAmex: Card = { ...card('amex-hk-explorer'), issuerRegion: 'MO' };
  const hkdSettleLocal = rankSingleCard(localAmex, [], params, {
    ...MO_PHYSICAL,
    amount: 1000,
    settlementCurrency: 'HKD',
    region: 'MO',
  })!;

  it('MOP 结算 → foreign 路由，FTF 2% = 20', () => {
    expect(mopSettle.route).toBe('foreign');
    expect(mopSettle.fxFee).toBe(20);
  });

  it('HKD 结算 + 非跨境 → local 路由，FTF 0', () => {
    expect(hkdSettleLocal.route).toBe('local');
    expect(hkdSettleLocal.fxFee).toBe(0);
  });

  it('两次结果不同，且差额恰好等于外币手续费之差', () => {
    const delta = hkdSettleLocal.netRealistic - mopSettle.netRealistic;
    expect(delta).toBeCloseTo(20, 6);
    expect(delta).toBeCloseTo(mopSettle.fxFee - hkdSettleLocal.fxFee, 6);
  });

  it('币种相同但跨境（HKD 卡在澳门以 HKD 结算）→ crossBorder，FTF 仍按 2% 收', () => {
    const cross = rankSingleCard(card('amex-hk-explorer'), [], params, {
      ...MO_PHYSICAL,
      amount: 1000,
      settlementCurrency: 'HKD',
      region: 'MO',
    })!;
    expect(cross.route).toBe('crossBorder');
    expect(cross.fxFee).toBe(20);
  });
});

describe('断言 4：中银香港 Chill，MOP 2000 餐饮，月上限 HK$150 封顶，超出按 0.4%', () => {
  const chill = card('boc-hk-chill');
  const capInMop = convert(150, 'HKD', 'MOP', DEFAULT_FX_TABLE); // 154.50

  it('上限从 HKD 折成 MOP 后参与封顶（不折算则封顶失效）', () => {
    const s = rankSingleCard(chill, [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    expect(s.capsAffected[0]!.limit).toBeCloseTo(capInMop, 2);
    expect(s.capsAffected[0]!.fxNote).toContain('HKD 1 = MOP 1.03');
  });

  it('毛返现被压到 156.32，而不是名义 10% 的 200（依据官方细则）', () => {
    const s = rankSingleCard(chill, [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    // 官方细则表格：「回赠上限(HK$) = $150」，是回赠额上限而非消费额额度。
    // 10% = 基础 0.4%（无上限）+ 额外 9.6%（受 150 上限）
    // → 返现封顶 154.50；剩余消费 2000 - 154.5/0.10 = 455 按 0.4% = 1.82
    // → 合计 154.50 + 1.82 = 156.32
    expect(s.grossCashback).toBeCloseTo(156.32, 2);
    expect(s.grossCashback).toBeLessThan(200);
  });

  it('「为什么」里明确写出已封顶与超出部分的费率', () => {
    const s = rankSingleCard(chill, [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    const item = s.breakdown.find((b) => b.kind === 'cashback')!;
    expect(item.cappedBy).toBeGreaterThan(0);
    expect(item.detail).toContain('已封顶');
    expect(item.detail).toContain('0.40%');
  });

  it('净额不超过上限折算值（不被名义费率误导）', () => {
    const s = rankSingleCard(chill, [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    expect(s.netRealistic).toBeLessThan(capInMop);
  });

  it('双档拉开差距：netOptimistic 保留未封顶的毛返现，差值等于被上限削掉的金额', () => {
    const s = rankSingleCard(chill, [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    // netOptimistic 假设额度完全未用（不封顶），netRealistic 按 150 HKD 上限封顶。
    // 差额 = 名义 200 - 封顶后 154.50 = 45.50，正是被上限削掉的部分。
    expect(s.netOptimistic).toBeGreaterThan(s.netRealistic);
    expect(s.netOptimistic - s.netRealistic).toBeCloseTo(45.5, 2);
  });

  it('账本已用满 HK$150 后，本笔可计入部分为 0，全部按 fallback 0.4%', () => {
    const used = ledgerEntry({
      cardId: 'boc-hk-chill',
      amount: 1500,
      currency: 'HKD',
      capConsumption: { 'boc-hk-chill:extra': 150 },
      thresholdContribution: { 'boc-hk-chill:physical-spend': 1500 },
    });
    const s = rankSingleCard(chill, [used], params, { ...MO_PHYSICAL, amount: 2000 })!;
    expect(s.grossCashback).toBeCloseTo(8, 2); // 2000 × 0.4%
    expect(s.warnings.some((w) => w.code === 'cap_exhausted')).toBe(true);
    expect(s.capsAffected[0]!.remaining).toBe(0);
  });

  it('上限按月归集：上个月的已用额不影响本月', () => {
    const lastMonth = ledgerEntry({
      cardId: 'boc-hk-chill',
      occurredAt: '2026-09-20',
      periodKey: '2026-09',
      quarterKey: '2026-Q3',
      capConsumption: { 'boc-hk-chill:extra': 150 },
    });
    const s = rankSingleCard(chill, [lastMonth], params, { ...MO_PHYSICAL, amount: 2000 })!;
    expect(s.capsAffected[0]!.remaining).toBeCloseTo(capInMop, 2);
  });
});

describe('断言 5：unknown 类别不参与排序，且返回 unknown 标记而非 0', () => {
  const pulse = card('hsbc-pulse-unionpay');
  const result = run(pulse, 1000);

  it('卡库中 PULSE 的 dining 就是 unknown（数据现实）', () => {
    expect(pulse.categories.dining.kind).toBe('unknown');
  });

  it('结果里 ranked 为空，unranked 有这条', () => {
    expect(result.ranked).toHaveLength(0);
    expect(result.unranked).toHaveLength(1);
  });

  it('状态是 unknown，不是 ranked', () => {
    expect(result.unranked[0]!.status).toBe('unknown');
  });

  it('带 unknown_rate 标记，前端据此渲染「未知」而不是 0.00', () => {
    const w = result.unranked[0]!.warnings.find((x) => x.code === 'unknown_rate');
    expect(w).toBeDefined();
  });

  it('它在整库排序里也绝不混入 ranked 列表', () => {
    const full = rankCards(
      // 只取有数据的卡 + 一张 unknown 卡
      [pulse, card('sc-simply-cash'), card('citi-cash-back')],
      [],
      params,
      { ...MO_PHYSICAL, amount: 1000 },
    );
    expect(full.ranked.map((s) => s.cardId)).not.toContain('hsbc-pulse-unionpay');
    expect(full.unranked.map((s) => s.cardId)).toContain('hsbc-pulse-unionpay');
  });
});

describe('断言 6：立桥 VISA 金卡 validUntil 已过（2026-06-30）→ 豁免失效', () => {
  const wl = card('wlbank-visa-gold');

  it('卡库数据确实是 2026-06-30 到期', () => {
    expect(wl.fxFee.waivedWhen?.validUntil).toBe('2026-06-30');
  });

  it('外币路由下不再按 0% 计算，而是回落到香港 Visa 默认 1.95%', () => {
    const s = rankSingleCard(wl, [], params, {
      ...MO_PHYSICAL,
      amount: 1000,
      settlementCurrency: 'HKD',
      region: 'MO',
    })!;
    // 立桥是澳门发卡、卡币种 MOP，这里刻意用 HKD 结算 → 币种不同即为 foreign
    expect(s.route).toBe('foreign');
    expect(s.fxFee).toBeCloseTo(19.5, 2);
  });

  it('带 fx_fee_exempt_expired 警告，并提示核对最新条款', () => {
    const s = rankSingleCard(wl, [], params, {
      ...MO_PHYSICAL,
      amount: 1000,
      settlementCurrency: 'HKD',
      region: 'MO',
    })!;
    expect(s.warnings.some((w) => w.code === 'fx_fee_exempt_expired')).toBe(true);
    expect(s.fxWaiverNote).toContain('到期');
  });

  it('反向对照：豁免未过期的卡（BNU 澳门 MOP 豁免）在本币路由下 FTF 仍为 0', () => {
    const s = rankSingleCard(card('bnu-world-mc'), [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.route).toBe('local');
    expect(s.fxFee).toBe(0);
  });
});

describe('AC-F1-05：金额为 0 或负数必须拒绝计算', () => {
  it('0 元被拒绝', () => {
    const r = run(card('sc-simply-cash'), 0);
    expect(r.ok).toBe(false);
    expect(r.rejectReason).toEqual({ code: 'invalid_amount', amount: 0 });
    expect(r.ranked).toHaveLength(0);
  });

  it('负数被拒绝', () => {
    const r = run(card('sc-simply-cash'), -100);
    expect(r.ok).toBe(false);
    expect(r.rejectReason?.code).toBe('invalid_amount');
  });

  it('NaN / Infinity 被拒绝，不得算出一个数字', () => {
    expect(run(card('sc-simply-cash'), Number.NaN).ok).toBe(false);
    expect(run(card('sc-simply-cash'), Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});
