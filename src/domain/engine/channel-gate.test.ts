/**
 * 渠道门控（ADR-010）。
 *
 * 这组断言的由来与 ADR-009 同理，都是「测试全绿但产品全错」：
 * `tai-fung-unionpay-dual` 的 7 个类别 5% 全部带「仅限云闪付/丰付宝/微信/支付宝，
 * 实体刷卡不适用」前提，而引擎此前从不读渠道条件 —— `physical` 下照样给 5%，
 * 380 MOP 餐饮档排第一。用户带着手机去实体刷卡，拿到的是一个不存在的回报率。
 *
 * 因此这里钉住四件事：
 * 1. 杀手断言：同卡同类别，换渠道必须换结论（数值层 + 状态层）
 * 2. 排名断言：physical 下该卡不进 ranked（榜单层）
 * 3. 结构断言：全库声明了 channelScope 的条目恰为 tai-fung 的 7 个（数据层，防「下次加卡手滑」）
 * 4. 通道语义断言：被挡的轨道是「移除」不是「按 0 计」（语义层 —— 这条最容易被写反）
 *
 * 第 8 条（全库逐值回归基线）在 channel-gate-baseline.test.ts：
 * 那组断言证明「其他 37 张卡一个值都没动」，与「tai-fung 改对了」是两个关注点。
 */

import { describe, it, expect } from 'vitest';
import { rankCards, rankSingleCard } from './index';
import { trackAppliesToChannel, filterByChannel } from './channelGate';
import { card, makeParams, MO_PHYSICAL } from '../__fixtures__/params';
import { CARDS } from '../data/loadCards';
import type { EarnTrack, PaymentChannel, SpendCategory, SpendInput } from '../types';

const params = makeParams();
const TAI_FUNG = 'tai-fung-unionpay-dual';
const GATED_CHANNELS: PaymentChannel[] = ['unionpay_qr', 'wechat', 'alipay'];
const BLOCKED_CHANNELS: PaymentChannel[] = ['physical', 'apple_pay'];

function input(over: Partial<SpendInput> & Pick<SpendInput, 'amount'>): SpendInput {
  return { ...MO_PHYSICAL, ...over };
}

function schemeFor(cardId: string, over: Partial<SpendInput> & Pick<SpendInput, 'amount'>) {
  const s = rankSingleCard(card(cardId), [], params, input(over));
  if (!s) throw new Error(`卡 ${cardId} 没有算出任何结果`);
  return s;
}

// ============================================================
// 1. 杀手断言：同卡同类别，渠道不同则结论不同
// ============================================================

describe('杀手断言：tai-fung 同卡同类别，physical 与 unionpay_qr 结论必须相反（ADR-010 §2）', () => {
  // MOP 2000 餐饮：5% 恰好打满 MOP 100 的月上限（capsNote：「月累计满 MOP 2,000 可获 MOP 100」）
  it('physical：status=unknown 且 warnings 含 channel_gated，不给数字', () => {
    const s = schemeFor(TAI_FUNG, { amount: 2000, category: 'dining', channel: 'physical' });
    expect(s.status).toBe('unknown');
    expect(s.warnings.map((w) => w.code)).toContain('channel_gated');
    // 「不给数字」在 Scheme 上的表现形式是走 unknownScheme 分支：毛返现为 0 且不在 ranked
    expect(s.grossCashback).toBe(0);
  });

  it('unionpay_qr：status=ranked 且 grossCashback = 100（2000 × 5%，已封顶 MOP 100）', () => {
    const s = schemeFor(TAI_FUNG, { amount: 2000, category: 'dining', channel: 'unionpay_qr' });
    expect(s.status).toBe('ranked');
    expect(s.grossCashback).toBe(100);
    expect(s.warnings.map((w) => w.code)).not.toContain('channel_gated');
  });

  it('告警携带可供用户执行的补救动作：applicableChannels = [alipay, wechat, unionpay_qr]', () => {
    const s = schemeFor(TAI_FUNG, { amount: 2000, category: 'dining', channel: 'physical' });
    const gated = s.warnings.find((w) => w.code === 'channel_gated');
    expect(gated).toBeDefined();
    if (gated?.code !== 'channel_gated') throw new Error('类型收窄失败');
    // 只报该卡真正可用的渠道，不能把 physical / apple_pay 也算进去
    expect(gated.applicableChannels).toEqual(['alipay', 'wechat', 'unionpay_qr']);
    expect(gated.channel).toBe('physical');
    expect(gated.category).toBe('dining');
  });

  // 变异验证位：注释掉 earn.ts 的 filterByChannel 两行后，本 describe 前两条必红（physical 变回 100）。
});

// ============================================================
// 2. 排名断言：physical 下 tai-fung 不进 ranked
// ============================================================

describe('排名断言：MOP 380 餐饮 physical，ranked 中不含 tai-fung', () => {
  const result = rankCards(CARDS, [], params, input({ amount: 380, category: 'dining', channel: 'physical' }));

  it('tai-fung 落在 unranked，且原因是 channel_gated', () => {
    expect(result.ranked.map((s) => s.cardId)).not.toContain(TAI_FUNG);
    const taiFung = result.unranked.find((s) => s.cardId === TAI_FUNG);
    expect(taiFung).toBeDefined();
    expect(taiFung?.warnings.map((w) => w.code)).toContain('channel_gated');
  });

  /**
   * 第一名是 ocbc-mo-premier（3.000%），不是 ADR-010 Consequences 里写的 bcm-world-mc。
   *
   * 实测依据（2026-10-31，账本为空，MOP 结算，澳门商户，physical）：
   *   1. ocbc-mo-premier   3.000%（gross 11.4）
   *   2. earnmore-unionpay 2.000%（gross 7.6）
   *   3. bcm-world-mc      1.000%（gross 3.8）
   * 两张卡都在 tai-fung 之前：ocbc 的周末前提是 ADR-010 §312 明确移交的已知高估
   * （不分平日/周末，引擎一律按 3% 算）；earnmore 的 2% 是本地档费率，与门控无关。
   * 因此移除 tai-fung 后第一名必然是 ocbc，bcm 只是第三。
   *
   * 断言按实测事实写，不迁就 ADR 的「bcm 第一」——那句话漏算了 ocbc 与 earnmore。
   * 若要走 ADR 的隐含口径（只保留「费率已核实且无已知高估」的卡），见下一条。
   */
  it('第一名是 ocbc-mo-premier（3.000%），依次 earnmore 2.000% / bcm 1.000%', () => {
    const [first, second, third] = result.ranked;
    expect(first?.cardId).toBe('ocbc-mo-premier');
    expect(first?.netRateRealistic).toBeCloseTo(0.03, 6);
    expect(second?.cardId).toBe('earnmore-unionpay');
    expect(second?.netRateRealistic).toBeCloseTo(0.02, 6);
    expect(third?.cardId).toBe('bcm-world-mc');
    expect(third?.netRateRealistic).toBeCloseTo(0.01, 6);
    // 380 × 1% = 3.8
    expect(third?.grossCashback).toBeCloseTo(3.8, 2);
  });

  it('剔除 2 张「已知高估/移交项」后榜首为 bcm-world-mc 1.000%（ADR 口径）', () => {
    const withoutKnownGaps = CARDS.filter(
      (c) =>
        c.cardId !== TAI_FUNG &&
        c.cardId !== 'ocbc-mo-premier' && // 周末前提未建模，平日高估 2 个百分点（ADR-010 §312）
        c.cardId !== 'earnmore-unionpay', // 本卡上限 period 口径待核对
    );
    const r = rankCards(withoutKnownGaps, [], params, input({ amount: 380, category: 'dining', channel: 'physical' }));
    expect(r.ranked[0]?.cardId).toBe('bcm-world-mc');
    expect(r.ranked[0]?.netRateRealistic).toBeCloseTo(0.01, 6);
  });

  it('切到 unionpay_qr 后 tai-fung 回到榜首（渠道恢复的终点）', () => {
    const r = rankCards(CARDS, [], params, input({ amount: 380, category: 'dining', channel: 'unionpay_qr' }));
    expect(r.unranked.map((s) => s.cardId)).not.toContain(TAI_FUNG);
    const taiFung = r.ranked.find((s) => s.cardId === TAI_FUNG);
    expect(taiFung).toBeDefined();
    // 380 × 5% = 19，未触及 MOP 100 上限
    expect(taiFung?.grossCashback).toBeCloseTo(19, 2);
  });
});

// ============================================================
// 3. 跨渠道一致性
// ============================================================

describe('跨渠道一致性：结论只取决于渠道是否在 scope 内', () => {
  const categories: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];

  it('physical 与 apple_pay 结论相同：全部类别 channel_gated', () => {
    for (const ch of BLOCKED_CHANNELS) {
      for (const cat of categories) {
        const s = schemeFor(TAI_FUNG, { amount: 500, category: cat, channel: ch });
        expect(s.status, `${ch}/${cat} 应为 unknown`).toBe('unknown');
        expect(s.warnings.map((w) => w.code), `${ch}/${cat} 应含 channel_gated`).toContain(
          'channel_gated',
        );
      }
    }
  });

  it('unionpay_qr / wechat / alipay 结论相同：全部类别 5%', () => {
    for (const ch of GATED_CHANNELS) {
      for (const cat of categories) {
        const s = schemeFor(TAI_FUNG, { amount: 500, category: cat, channel: ch });
        expect(s.status, `${ch}/${cat} 应为 ranked`).toBe('ranked');
        // 500 × 5% = 25
        expect(s.grossCashback, `${ch}/${cat} 应为 25`).toBeCloseTo(25, 2);
        expect(s.warnings.map((w) => w.code)).not.toContain('channel_gated');
      }
    }
  });

  it('apple_pay 被挡的理由是条款枚举不含它（手续费视同实体 ≠ 收益适用）', () => {
    const s = schemeFor(TAI_FUNG, { amount: 500, category: 'dining', channel: 'apple_pay' });
    expect(s.status).toBe('unknown');
    expect(s.warnings.map((w) => w.code)).toContain('channel_gated');
  });
});

// ============================================================
// 4. 结构断言（防回归地基）
// ============================================================

describe('结构断言：全库声明 channelScope 的类别条目恰为 7 条且全属 tai-fung', () => {
  const scoped = CARDS.flatMap((c) =>
    (Object.keys(c.categories) as SpendCategory[])
      .filter((cat) => c.categories[cat].channelScope !== undefined)
      .map((cat) => ({ cardId: c.cardId, category: cat, scope: c.categories[cat].channelScope! })),
  );

  it('恰为 7 条', () => {
    expect(scoped).toHaveLength(7);
  });

  it('全部属于 tai-fung（一旦其他卡也声明，必须显式复核而非静默通过）', () => {
    expect([...new Set(scoped.map((s) => s.cardId))]).toEqual([TAI_FUNG]);
  });

  it('7 条覆盖该卡全部类别，且 scope 均为三个移动支付渠道', () => {
    expect(scoped.map((s) => s.category).sort()).toEqual(
      ['dining', 'flight', 'fuel', 'grocery', 'hotel', 'online', 'other'].sort(),
    );
    for (const s of scoped) {
      expect(s.scope).toEqual(['unionpay_qr', 'wechat', 'alipay']);
    }
  });

  it('其余 37 张卡没有任何轨道声明 channelScope（缺省即全渠道，语义不变）', () => {
    const others = CARDS.filter((c) => c.cardId !== TAI_FUNG);
    expect(others).toHaveLength(37);
    for (const c of others) {
      for (const cat of Object.keys(c.categories) as SpendCategory[]) {
        expect(c.categories[cat].channelScope, `${c.cardId}.${cat}`).toBeUndefined();
      }
    }
  });
});

// ============================================================
// 5. 通道语义断言：筛选，不是按 0 计（最容易被写反的一条）
// ============================================================

describe('通道语义断言：被挡的轨道是「移除」，不是「值 0」', () => {
  const scopedFive: EarnTrack = {
    kind: 'cashback',
    rates: { local: 0.05 },
    exclusivityGroup: 'base.dining',
    capIds: [],
    channelScope: ['alipay'],
  };
  const unscopedOne: EarnTrack = {
    kind: 'cashback',
    rates: { local: 0.01 },
    exclusivityGroup: 'base.dining',
    capIds: [],
  };

  it('trackAppliesToChannel：缺省 scope = 全渠道适用', () => {
    for (const ch of [...GATED_CHANNELS, ...BLOCKED_CHANNELS]) {
      expect(trackAppliesToChannel(unscopedOne, ch)).toBe(true);
    }
    expect(trackAppliesToChannel(scopedFive, 'alipay')).toBe(true);
    expect(trackAppliesToChannel(scopedFive, 'physical')).toBe(false);
  });

  it('filterByChannel：physical 下只剩无 scope 的那条', () => {
    const kept = filterByChannel([scopedFive, unscopedOne], 'physical');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(unscopedOne);
  });

  it('physical 下取 1%（无 scope 兜底），不是 0% —— 0 会被读成「这张卡不赚钱」', () => {
    // 5% 那条在 physical 下不存在于候选中，组内只剩 1% 一条（不是「0 与 1 取最大」）。
    const chosen = filterByChannel([scopedFive, unscopedOne], 'physical').filter(
      (t) => t.exclusivityGroup === 'base.dining',
    );
    expect(chosen).toHaveLength(1);
    if (chosen[0]?.kind !== 'cashback') throw new Error('类型收窄失败');
    expect(chosen[0].rates?.local).toBe(0.01);
  });

  it('全部轨道都被挡时，结果为空数组而非「一组 0 值轨道」', () => {
    expect(filterByChannel([scopedFive], 'physical')).toEqual([]);
  });
});

// ============================================================
// 6. 兜底恢复断言：补一条无 scope 的轨道，channel_gated 自动消失
// ============================================================
describe('兜底恢复：补一条无 channelScope 的兜底轨道后，缺口自动关闭（无需改引擎）', () => {
  /** 复制 tai-fung，把 physical 档的兜底轨道注入 dining，并去掉 channelScope */
  function withFallbackTracks(): typeof CARDS {
    const source = card(TAI_FUNG);
    const patched = {
      ...source,
      categories: {
        ...source.categories,
        dining: {
          ...source.categories.dining,
          // 模拟官方公布实体刷卡费率后的数据形态：去掉 scope 的兜底轨道
          rates: { local: 0.004 },
          channelScope: undefined,
          note: '兜底轨道：无 channelScope，全渠道适用',
        },
      },
    };
    return [patched];
  }

  it('注入后 physical 下不再是 channel_gated，且返回兜底值', () => {
    const s = rankSingleCard(withFallbackTracks()[0]!, [], params, input({ amount: 1000, category: 'dining', channel: 'physical' }));
    expect(s).not.toBeNull();
    expect(s?.status).toBe('ranked');
    expect(s?.warnings.map((w) => w.code)).not.toContain('channel_gated');
    // 1000 × 0.4% = 4
    expect(s?.grossCashback).toBeCloseTo(4, 2);
  });

  it('对照：未注入时同一输入是 channel_gated（证明上一条的差异来自兜底轨道）', () => {
    const s = schemeFor(TAI_FUNG, { amount: 1000, category: 'dining', channel: 'physical' });
    expect(s.status).toBe('unknown');
    expect(s.warnings.map((w) => w.code)).toContain('channel_gated');
  });
});
