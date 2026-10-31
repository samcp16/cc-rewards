/**
 * 反向验证 —— 故意传错值，引擎必须拒绝或标记，而不是给出一个像样的数字。
 *
 * 为什么单独成文件而不混在主链路断言里：
 * 主链路测试回答「算得对不对」，这一组回答「算不出来时会不会装作算出来了」。
 * 后者是这类决策工具最容易翻车的地方 —— 一个错误的推荐比没有推荐更伤人。
 * 两类断言的前提不同，混在一个文件里，读的人容易把「拒绝」当成「失败」。
 *
 * 从 index.test.ts 拆出（单文件 ≤ 300 行门禁），断言内容一字未改。
 */

import { describe, it, expect } from 'vitest';
import { rankCards } from './index';
import { card, MO_PHYSICAL } from '../__fixtures__/params';
import { params, one } from '../__fixtures__/engineHelpers';
import { DEFAULT_FX_TABLE } from '../fx/fxReference';

describe('反向验证：故意传错值，引擎必须报错或标记，而不是给出一个像样的数字', () => {
  it('非法币种 → 明确拒绝', () => {
    const r = rankCards([card('sc-simply-cash')], [], params, {
      ...MO_PHYSICAL,
      amount: 1000,
      settlementCurrency: 'USD' as never,
    });
    expect(r.ok).toBe(false);
    expect(r.rejectReason?.code).toBe('invalid_currency');
  });

  it('非法类别 → 明确拒绝，不得落进 other 里算出一个数', () => {
    const r = rankCards([card('sc-simply-cash')], [], params, {
      ...MO_PHYSICAL,
      amount: 1000,
      category: 'entertainment' as never,
    });
    expect(r.ok).toBe(false);
    expect(r.rejectReason?.code).toBe('invalid_category');
  });

  it('卡数据里费率写成字符串 → loadCards 抛错（类型系统在数据入口失效时靠这里兜底）', async () => {
    const { loadCards, CardDataError } = await import('../data/loadCards');
    const broken = [
      {
        cardId: 'x',
        issuer: 'x',
        issuerRegion: 'HK',
        cardName: 'x',
        network: 'visa',
        cardCurrency: 'HKD',
        annualFee: { amount: 0, currency: 'HKD' },
        fxFee: { rate: '2%', fixedFee: 0, source: { url: 'https://x.com', verifiedAt: '2026-10-31' } },
        categories: {},
        source: [],
        verifiedAt: '2026-10-31',
        confidence: 'high',
      },
    ];
    expect(() => loadCards(broken)).toThrow(CardDataError);
  });

  it('旧版单值 rate 结构 → 直接拒绝，不允许悄悄迁移', async () => {
    const { loadCards } = await import('../data/loadCards');
    const { CARDS } = await import('../data/loadCards');
    const clone = JSON.parse(JSON.stringify(CARDS[0])) as Record<string, unknown>;
    const caps = [{ id: 'c', categories: 'all', limitAmount: 100, limitCurrency: 'HKD', period: 'month', overLimitFallback: { kind: 'cashback', exclusivityGroup: 'base', capIds: [], rate: 0.004 } }];
    expect(() => loadCards([{ ...clone, caps }])).toThrow(/rates|rate/);
  });

  it('cap.period 拼错 → 抛错，不默认按月', async () => {
    const { loadCards } = await import('../data/loadCards');
    const { CARDS } = await import('../data/loadCards');
    const clone = JSON.parse(JSON.stringify(CARDS[0])) as Record<string, unknown>;
    const caps = [{ id: 'c', categories: 'all', limitAmount: 100, limitCurrency: 'HKD', period: 'quarterly' }];
    expect(() => loadCards([{ ...clone, caps }])).toThrow(/period 必须是/);
  });

  it('cardId 重复 → 抛错（凭记忆写 id 是已记录的坑）', async () => {
    const { loadCards } = await import('../data/loadCards');
    const { CARDS } = await import('../data/loadCards');
    expect(() => loadCards([CARDS[0], CARDS[0]])).toThrow(/cardId 重复/);
  });

  it('capId 引用不存在的上限池 → 抛错，不静默忽略', async () => {
    const { applyCap } = await import('./caps');
    expect(() =>
      applyCap(10, ['no-such-cap'], {
        amount: 1000,
        settlementCurrency: 'MOP',
        capById: new Map(),
        spentByCap: {},
        occurredAt: '2026-10-31',
        fx: DEFAULT_FX_TABLE,
      }),
    ).toThrow(/不存在的上限池/);
  });

  it('金额为字符串 → 拒绝（防止上游把输入框的原始字符串直接传进来）', () => {
    const r = rankCards([card('sc-simply-cash')], [], params, {
      ...MO_PHYSICAL,
      amount: '1000' as never,
    });
    expect(r.ok).toBe(false);
  });

  it('一张卡都算不出时，ranked 为空但 ok 仍为 true（不是错误，是数据缺口）', () => {
    const allUnknown = [card('hsbc-pulse-unionpay'), card('bocmo-allcurrency')];
    const r = rankCards(allUnknown, [], params, { ...MO_PHYSICAL, amount: 1000 });
    expect(r.ok).toBe(true);
    expect(r.ranked).toHaveLength(0);
    expect(r.unranked.length).toBeGreaterThan(0);
  });

  it('one() 基线自检：同一条断言在实现漂移时会变红', () => {
    // 若引擎把外币档取成本地档，grossCashback 会是 15，这条会失败
    expect(one(1000).grossCashback).toBe(20);
  });
});
