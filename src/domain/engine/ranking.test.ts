/**
 * 排序与费用机制 —— 跨卡、跨渠道的横切验证。
 *
 * 与 index.test.ts 的分工：
 * - index.test.ts  按 SPEC §12 断言 1~6，逐张卡锁定「某个具体场景该算出多少钱」
 * - 本文件          锁定「多张卡放一起时排序规则对不对」「费用是参与排序还是只在
 *                   明细里摆着」「跨币种折算会不会误入成本项」
 *
 * 分开的理由：断言 1~6 是产品价值支点，改动卡数据时必须逐条对照手算；
 * 本文件的断言不依赖单卡的具体费率，卡数据更新后应当依然为绿。
 * 混在一起会让「该跟着卡数据一起改」和「不该改」的断言难以区分。
 *
 * 从 index.test.ts 拆出（单文件 ≤ 300 行门禁），断言内容一字未改。
 */

import { describe, it, expect } from 'vitest';
import { rankCards, rankSingleCard } from './index';
import { card, MO_PHYSICAL } from '../__fixtures__/params';
import { params } from '../__fixtures__/engineHelpers';

describe('排序：按净回报率降序，且确定', () => {
  const cards = [card('sc-simply-cash'), card('citi-cash-back'), card('boc-hk-chill'), card('earnmore-unionpay')];

  it('降序排列', () => {
    const r = rankCards(cards, [], params, { ...MO_PHYSICAL, amount: 1000 });
    const rates = r.ranked.map((s) => s.netRateRealistic);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
  });

  it('同一输入跑 100 次，顺序完全一致（排序确定性）', () => {
    const first = rankCards(cards, [], params, { ...MO_PHYSICAL, amount: 1000 }).ranked.map((s) => s.cardId);
    for (let i = 0; i < 100; i += 1) {
      const again = rankCards(cards, [], params, { ...MO_PHYSICAL, amount: 1000 }).ranked.map((s) => s.cardId);
      expect(again).toEqual(first);
    }
  });

  it('冠亚军差距 < 0.1% 时标 tieWithNext', () => {
    // 构造两张完全一致的卡，必然并列
    const a = { ...card('citi-cash-back'), cardId: 'tie-a' };
    const b = { ...card('citi-cash-back'), cardId: 'tie-b' };
    const r = rankCards([a, b], [], params, { ...MO_PHYSICAL, amount: 1000 });
    expect(r.ranked[0]!.tieWithNext).toBe(true);
  });

  it('最后一名 tieWithNext 恒为 false', () => {
    const r = rankCards(cards, [], params, { ...MO_PHYSICAL, amount: 1000 });
    expect(r.ranked[r.ranked.length - 1]!.tieWithNext).toBe(false);
  });

  it('停用卡不参与排序', () => {
    const inactive = { ...card('citi-cash-back'), active: false };
    const r = rankCards([card('sc-simply-cash'), inactive], [], params, { ...MO_PHYSICAL, amount: 1000 });
    expect(r.ranked.map((s) => s.cardId)).not.toContain('citi-cash-back');
  });
});

describe('跨币种折算只进上限归集，不出现在成本项', () => {
  it('Chill 的「为什么」里没有折算成本项', () => {
    const s = rankSingleCard(card('boc-hk-chill'), [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    const kinds = s.breakdown.map((b) => b.kind);
    expect(kinds).not.toContain('fx_conversion');
    // 折算说明出现在 capsAffected / fxNotes，而不是 cost 项
    expect(s.capsAffected[0]!.fxNote).toContain('折算');
  });

  it('引擎返回 fxNotes 供 UI 展示折算依据（不允许静默折算）', () => {
    const r = rankCards([card('boc-hk-chill')], [], params, { ...MO_PHYSICAL, amount: 2000 });
    expect(r.fxNotes.length).toBeGreaterThan(0);
    expect(r.fxNotes.some((n) => n.includes('HKD 1 = MOP 1.03') || n.includes('MOP 1 = HKD'))).toBe(true);
  });
});

describe('渠道服务费参与排序而非仅展示（AC-F1-02）', () => {
  it('内地支付宝 200 元以上收 3%，净额明显下降', () => {
    const physical = rankSingleCard(card('citi-cash-back'), [], params, {
      amount: 1000,
      settlementCurrency: 'CNY',
      category: 'dining',
      channel: 'physical',
      region: 'CN',
    })!;
    const alipay = rankSingleCard(card('citi-cash-back'), [], params, {
      amount: 1000,
      settlementCurrency: 'CNY',
      category: 'dining',
      channel: 'alipay',
      region: 'CN',
    })!;
    expect(alipay.channelFee).toBe(30);
    expect(physical.channelFee).toBe(0);
    expect(physical.netRealistic - alipay.netRealistic).toBeCloseTo(30, 2);
  });

  it('内地支付宝 200 元以下免手续费（档位边界）', () => {
    const s = rankSingleCard(card('citi-cash-back'), [], params, {
      amount: 200,
      settlementCurrency: 'CNY',
      category: 'dining',
      channel: 'alipay',
      region: 'CN',
    })!;
    // 恰好 200 落在 [200, ∞) 档，应收费
    expect(s.channelFee).toBeCloseTo(6, 2);
  });

  it('云闪付绑银联卡 0 手续费', () => {
    const s = rankSingleCard(card('tai-fung-unionpay-dual'), [], params, {
      ...MO_PHYSICAL,
      amount: 100,
      channel: 'unionpay_qr',
    })!;
    expect(s.channelFee).toBe(0);
  });
});
