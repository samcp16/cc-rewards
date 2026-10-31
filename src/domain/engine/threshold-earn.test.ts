/**
 * 门槛的收益作用域（ADR-011）。
 *
 * 这个文件被重写过两轮，两轮的原因都值得记住：
 *
 * 第一轮（ADR-009）修的是「门槛档位对收益零影响」——`tier.earn` 覆盖率 0%，
 * 引擎恒兜底到类别基础费率，文案说得对、数字算得错。
 *
 * 第二轮（ADR-011）修的是第一轮的修法本身错了：`tier.earn` 被写成「无条件替换
 * 类别基础轨道」，而 5 张门槛卡的 `countsCategories` 都是 `'all'`，于是门槛档
 * 的费率被套到了所有类别上。chill 的 grocery 声明 0.4%，实测 5.344%（高估 13 倍）；
 * cheers 的 flight 声明 4%，实测 0.400%（低估 3.6pp）。方向两头都错。
 *
 * 关键洞察（ADR-011 §1a）：`categories` 里每个类别的费率本来就已经写对了，
 * `tier.earn` 不但没补充信息，反而把正确信息覆盖坏了。所以本轮把 `tier.earn`
 * 整体删除，门槛只声明「增量」，`categories` 是费率的唯一事实来源。
 *
 * 因此这里的断言全部围绕「两态 × 逐类别」展开，而不是「档位之间的大小关系」——
 * 后者在 N1 期间是绿的，恰恰因为没验「没被门槛点名的类别」。
 *
 * 口径注意：金额一律取 1000 MOP，小于所有门槛。这是刻意的 —— 5 张卡都是
 * `includeCurrentSpend: true`，本笔会推进累计；若金额本身跨过门槛（如 3000 MOP
 * ≈ 2912 HKD > chill 的 1500），「未达标」这一侧就根本不存在，测出来是假绿。
 */

import { describe, it, expect } from 'vitest';
import { rankSingleCard } from './index';
import { card, makeParams, ledgerEntry, MO_PHYSICAL } from '../__fixtures__/params';
import { CARDS } from '../data/loadCards';
import type { LedgerEntry, SpendCategory, SpendInput } from '../types';

const params = makeParams();

/** 本笔金额：小于全部门槛，保证「空账本」这一侧真的是未达标 */
const SMALL = 1000;

/** 账本推进到门槛之上 */
function overLedger(cardId: string, thresholdId: string, spent: number): LedgerEntry[] {
  return [ledgerEntry({ cardId, thresholdContribution: { [thresholdId]: spent } })];
}

/**
 * 同一张卡、同一类别、同一金额，分别在「未达标（空账本）」与「已达标」两个账本状态下取值。
 */
function twoStates(
  cardId: string,
  category: SpendCategory,
  opts: { thresholdId: string; spent: number; amount?: number },
) {
  const c = card(cardId);
  const input: SpendInput = { ...MO_PHYSICAL, amount: opts.amount ?? SMALL, category };
  const below = rankSingleCard(c, [], params, input)!;
  const above = rankSingleCard(c, overLedger(cardId, opts.thresholdId, opts.spent), params, input)!;
  return { below, above };
}

/**
 * 费率（%）。
 *
 * 分母用 MOP 面额而非 HKD 折算值：引擎按结算币种金额 × 费率算返现，
 * 所以「返现 / MOP 金额」才是用户看到的那个百分比。用 HKD 折算值当分母
 * 会让 0.4% 显示成 0.412%，凭空多出一个汇率因子。
 */
function ratePct(status: { grossCashback: number }, amountMop: number): number {
  return (status.grossCashback / amountMop) * 100;
}

describe('ADR-011 §4a：boc-hk-chill —— 门槛只点名 dining/flight/hotel/online', () => {
  const TH = 'boc-hk-chill:physical-spend';

  it('grocery 未达标：0.4%（N1 期间实测 5.344%，高估 13 倍）', () => {
    const { below } = twoStates('boc-hk-chill', 'grocery', { thresholdId: TH, spent: 2000 });
    expect(ratePct(below, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('grocery 达标：仍是 0.4% —— 达标状态对该类别零影响', () => {
    const { above } = twoStates('boc-hk-chill', 'grocery', { thresholdId: TH, spent: 2000 });
    expect(ratePct(above, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('grocery 两态都不消耗 extra 上限池（capIds: [] 的显式豁免）', () => {
    const { below, above } = twoStates('boc-hk-chill', 'grocery', { thresholdId: TH, spent: 2000 });
    expect(below.capsAffected.some((c) => c.capId === 'boc-hk-chill:extra')).toBe(false);
    expect(above.capsAffected.some((c) => c.capId === 'boc-hk-chill:extra')).toBe(false);
  });

  it('dining 未达标：0.4%（N1 期间被套成 10%）', () => {
    const { below } = twoStates('boc-hk-chill', 'dining', { thresholdId: TH, spent: 0 });
    expect(ratePct(below, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('dining 达标：10%，3000 MOP 下超 HK$150 上限后被截断为 5.344%', () => {
    const { above } = twoStates('boc-hk-chill', 'dining', { thresholdId: TH, spent: 2000 });
    // 1000 MOP ≈ 970 HKD × 10% = 97，未触顶
    expect(ratePct(above, SMALL)).toBeCloseTo(10, 3);

    // 3000 MOP 的 10% 折算约 HK$291，超出 HK$150 上限；
    // 超出部分落到 cap.overLimitFallback 的 0.4%，故实际费率是 5.344% 而非 5%。
    // 这个数与 ADR-011 §Verification 的表一致（chill dining 3000 MOP → 5.344%）。
    const big = twoStates('boc-hk-chill', 'dining', { thresholdId: TH, spent: 2000, amount: 3000 });
    expect(ratePct(big.above, 3000)).toBeCloseTo(5.344, 2);
    expect(big.above.capsAffected.some((c) => c.capId === 'boc-hk-chill:extra')).toBe(true);
    // 注意：3000 MOP 本笔已越过 HK$1,500（≈2912 HKD），两态都是达标，
    // 所以这里不能断言「未达标侧 0.4%」—— 小额那一侧已在上一条用例覆盖。
  });

  it('flight 未达标：4%（categories 记的是达标值 5%，靠 fallback 4% 回落）', () => {
    const { below } = twoStates('boc-hk-chill', 'flight', { thresholdId: TH, spent: 0 });
    expect(ratePct(below, SMALL)).toBeCloseTo(4, 3);
  });

  it('flight 达标：5%', () => {
    const { above } = twoStates('boc-hk-chill', 'flight', { thresholdId: TH, spent: 2000 });
    expect(ratePct(above, SMALL)).toBeCloseTo(5, 3);
  });
});

describe('ADR-011 §4b：boc-hk-cheers —— 未达门槛 0.4%，达标 4%', () => {
  const TH = 'boc-hk-cheers:monthly-retail';

  it('fuel 未达标：0.4%，且不被任何 binding 点名', () => {
    const { below } = twoStates('boc-hk-cheers', 'fuel', { thresholdId: TH, spent: 6000 });
    expect(ratePct(below, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('fuel 达标：仍 0.4%（N1 期间被套成 4%，高估 10 倍）', () => {
    const { above } = twoStates('boc-hk-cheers', 'fuel', { thresholdId: TH, spent: 6000 });
    expect(ratePct(above, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('online 达标：仍 0.4%（同类证明，换一个未绑定类别）', () => {
    const { above } = twoStates('boc-hk-cheers', 'online', { thresholdId: TH, spent: 6000 });
    expect(ratePct(above, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('dining 未达标：0.4%', () => {
    const { below } = twoStates('boc-hk-cheers', 'dining', { thresholdId: TH, spent: 0 });
    expect(ratePct(below, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('dining 达标：4%（categories 记达标档，不叠加）', () => {
    const { above } = twoStates('boc-hk-cheers', 'dining', { thresholdId: TH, spent: 6000 });
    expect(ratePct(above, SMALL)).toBeCloseTo(4, 3);
  });

  it('flight 达标：4%，与 dining 同档（达标侧不叠加增量）', () => {
    const { above } = twoStates('boc-hk-cheers', 'flight', { thresholdId: TH, spent: 6000 });
    expect(ratePct(above, SMALL)).toBeCloseTo(4, 3);
  });
});

describe('ADR-011 §4c：bea-world-mc —— 未知类别不因门槛变成已知', () => {
  const TH = 'bea-world-mc:qualified-spend';

  for (const cat of ['grocery', 'fuel', 'other'] as const) {
    it(`${cat} 两态均 status='unknown'（数据本身未知，门槛不得兜出数字）`, () => {
      const { below, above } = twoStates('bea-world-mc', cat, { thresholdId: TH, spent: 5000 });
      expect(below.status).toBe('unknown');
      expect(above.status).toBe('unknown');
    });
  }
});

describe('ADR-011 §4d：wewa-unionpay —— 门槛不污染未绑定类别', () => {
  const TH = 'wewa-unionpay:monthly';

  it('grocery 两态均 0.4%（N1 期间实测 4.000%，高估 10 倍）', () => {
    const { below, above } = twoStates('wewa-unionpay', 'grocery', { thresholdId: TH, spent: 2000 });
    expect(ratePct(below, SMALL)).toBeCloseTo(0.4, 3);
    expect(ratePct(above, SMALL)).toBeCloseTo(0.4, 3);
  });

  it('dining：未达标 0.4% → 达标 4%', () => {
    const { below, above } = twoStates('wewa-unionpay', 'dining', { thresholdId: TH, spent: 2000 });
    expect(ratePct(below, SMALL)).toBeCloseTo(0.4, 3);
    expect(ratePct(above, SMALL)).toBeCloseTo(4, 3);
  });
});

describe('ADR-011 §4e：dbs-black-world —— bonusTiers 的 gain 是倍数增量', () => {
  const TH = 'dbs-black-world:monthly-spend';

  it('达标后 pointsValue 严格等于 1x 的 2 倍（不是替换、是 +1x）', () => {
    const c = card('dbs-black-world');
    const input: SpendInput = { ...MO_PHYSICAL, amount: 5000, category: 'flight' };
    const below = rankSingleCard(c, [], params, input)!;
    const above = rankSingleCard(c, overLedger('dbs-black-world', TH, 25000), params, input)!;
    expect(below.grossCashback).toBe(0);
    expect(above.pointsValue).toBeCloseTo(below.pointsValue * 2, 2);
  });
});

describe('ADR-011 §2：门槛不持有费率（结构断言）', () => {
  it('全库门槛定义上不存在 earn / tiers 字段', () => {
    for (const c of CARDS) {
      for (const th of c.thresholds) {
        const raw = th as unknown as Record<string, unknown>;
        expect(raw.earn, `${c.cardId} 仍带 earn`).toBeUndefined();
        expect(raw.tiers, `${c.cardId} 仍带 tiers`).toBeUndefined();
      }
    }
  });

  it('门槛只能通过 categoryBindings / bonusTiers 二选一表达收益', () => {
    for (const c of CARDS) {
      for (const th of c.thresholds) {
        const hasBinding = th.categoryBindings !== undefined;
        const hasBonus = th.bonusTiers !== undefined;
        expect(hasBinding !== hasBonus, `${c.cardId} 的 ${th.id} 两种表达都声明或都没声明`).toBe(true);
      }
    }
  });

  it('categoryBindings 的每个 key 都必须是真类别', () => {
    const valid = new Set<string>(['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other']);
    for (const c of CARDS) {
      for (const th of c.thresholds) {
        for (const k of Object.keys(th.categoryBindings ?? {})) {
          expect(valid.has(k), `${c.cardId} 的 binding 键 ${k} 不是类别`).toBe(true);
        }
      }
    }
  });

  it('每张卡的 thresholdAmount 为正数（达标线不能丢）', () => {
    for (const c of CARDS) {
      for (const th of c.thresholds) {
        expect(th.thresholdAmount, `${c.cardId} 缺 thresholdAmount`).toBeGreaterThan(0);
      }
    }
  });
});

describe('未达门槛时不占用加码上限池（B1 修复引出的独立规则）', () => {
  it('Chill 月累计不足 HK$1,500 时，dining 不进入 10% 档', () => {
    const below = rankSingleCard(card('boc-hk-chill'), [], params, {
      ...MO_PHYSICAL,
      amount: 100,
      category: 'dining',
    })!;
    // 未达标 → 0.4% 基础档
    expect(ratePct(below, 100)).toBeCloseTo(0.4, 3);
    expect(below.grossCashback).toBeLessThan(1);
  });

  it('累计达标后同一笔才进入 10% 档并引用 extra 上限池', () => {
    const above = rankSingleCard(
      card('boc-hk-chill'),
      overLedger('boc-hk-chill', 'boc-hk-chill:physical-spend', 1500),
      params,
      { ...MO_PHYSICAL, amount: 100, category: 'dining' },
    )!;
    expect(above.capsAffected.some((c) => c.capId === 'boc-hk-chill:extra')).toBe(true);
    expect(ratePct(above, 100)).toBeCloseTo(10, 3);
  });
});

describe('全库不变式：门槛的存在不改变未被点名的类别', () => {
  const cats: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];

  it('任何卡的任何未被 binding 点名的类别，两态毛返现必须完全相同', () => {
    for (const c of CARDS) {
      for (const th of c.thresholds) {
        if (!th.categoryBindings) continue;
        const bound = new Set(Object.keys(th.categoryBindings));
        for (const cat of cats) {
          if (bound.has(cat)) continue;
          const input: SpendInput = { ...MO_PHYSICAL, amount: SMALL, category: cat };
          const below = rankSingleCard(c, [], params, input);
          const above = rankSingleCard(
            c,
            overLedger(c.cardId, th.id, th.thresholdAmount * 2),
            params,
            input,
          );
          if (!below || !above) continue;
          expect(
            above.grossCashback,
            `${c.cardId} 的 ${cat} 被 ${th.id} 影响了（未绑定却变值）`,
          ).toBeCloseTo(below.grossCashback, 6);
        }
      }
    }
  });
});
