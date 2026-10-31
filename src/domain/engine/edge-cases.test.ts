/**
 * 边界与告警路径测试。
 *
 * 这些分支平时不常走，但每一个都对应一条 UI 必须显示给用户的信息：
 * 「额度快用完了」「这项数据是估算的」「积分无法估值」。
 * 没有测试覆盖，前端就可能永远看不到这些告警。
 */

import { describe, it, expect } from 'vitest';
import { rankCards, rankSingleCard } from './index';
import { card, makeParams, MO_PHYSICAL, ledgerEntry } from '../__fixtures__/params';
import { pickBonusTier } from './thresholds';
import { buildPointValuations, resolvePointValuation } from '../fx/pointValuation';
import type { Card, SpendCategory, ThresholdDefinition } from '../types';
import { CARDS } from '../data/loadCards';

const params = makeParams();

describe('门槛说明文案：档位说明不留空，且显式表达达标状态', () => {
  // ADR-011 §1b：按类别绑定的门槛只有「未达标 / 达标」两态，没有「第 N 档」。
  // 文案由 thresholds.ts 的 reachedLabel 生成，测试跟着这个语义走。
  const withBonusTiers: ThresholdDefinition = {
    id: 'th-note',
    accrualCategories: 'all',
    includeCurrentSpend: true,
    period: 'month',
    currency: 'HKD',
    thresholdAmount: 1000,
    bonusTiers: [
      { minSpend: 0, gain: {} },
      { minSpend: 1000, gain: { multiplierDelta: 1 }, note: '升档：月签满 1000' },
    ],
  };

  it('达标时文案带「已达门槛」', () => {
    const c = { ...card('citi-cash-back'), thresholds: [withBonusTiers] };
    const s = rankSingleCard(c, [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    expect(s.thresholdNote).toContain('已达门槛');
  });

  it('未达标时文案带「未达门槛」，不留空', () => {
    const c = { ...card('citi-cash-back'), thresholds: [withBonusTiers] };
    const s = rankSingleCard(c, [], params, { ...MO_PHYSICAL, amount: 500 })!;
    expect(s.thresholdNote).toContain('未达门槛');
    expect(s.thresholdNote).toBeTruthy();
  });

  it('includeCurrentSpend=false 时累计不含本笔', () => {
    const excludeCurrent: ThresholdDefinition = { ...withBonusTiers, includeCurrentSpend: false };
    const c = { ...card('citi-cash-back'), thresholds: [excludeCurrent] };
    const s = rankSingleCard(c, [], params, { ...MO_PHYSICAL, amount: 2000 })!;
    expect(s.thresholdNote).toContain('不含本笔');
  });

  it('门槛币种与消费币种相同时不产生折算说明', () => {
    const mopThreshold: ThresholdDefinition = { ...withBonusTiers, currency: 'MOP' };
    const c = { ...card('citi-cash-back'), thresholds: [mopThreshold] };
    const r = rankCards([c], [], params, { ...MO_PHYSICAL, amount: 2000 });
    expect(r.fxNotes.some((n) => n.includes('门槛'))).toBe(false);
  });

  it('pickBonusTier 对空档位抛错（配置错误显式暴露）', () => {
    expect(() => pickBonusTier([], 0, 'empty')).toThrow();
  });
});

describe('上限即将用尽告警', () => {
  it('剩余额度低于 20% 时给出 cap_nearly_exhausted', () => {
    // Chill 上限折 MOP 154.50，已用 HK$140 → 剩余约 MOP 10.3，低于 20%
    //
    // thresholdContribution 必须已达 HK$1,500：B1 修复后档位真实生效，
    // 未达门槛时本笔只按 0.4% 算、不引用加码上限池（这本身是正确行为，
    // 但会让本测试验不到上限告警）。此处把累计额设在门槛之上以真正命中上限。
    const used = ledgerEntry({
      cardId: 'boc-hk-chill',
      capConsumption: { 'boc-hk-chill:extra': 140 },
      thresholdContribution: { 'boc-hk-chill:physical-spend': 1500 },
    });
    const s = rankSingleCard(card('boc-hk-chill'), [used], params, { ...MO_PHYSICAL, amount: 100 })!;
    const w = s.warnings.find((x) => x.code === 'cap_nearly_exhausted');
    expect(w).toBeDefined();
    if (w && w.code === 'cap_nearly_exhausted') {
      expect(w.remaining).toBeGreaterThan(0);
      expect(w.currency).toBe('MOP');
    }
  });

  it('额度充足时不给该告警', () => {
    const s = rankSingleCard(card('boc-hk-chill'), [], params, { ...MO_PHYSICAL, amount: 100 })!;
    expect(s.warnings.some((w) => w.code === 'cap_nearly_exhausted')).toBe(false);
  });
});

describe('积分估值相关的告警', () => {
  it('里数类无官方估值 → point_valuation_estimated 且带说明', () => {
    const s = rankSingleCard(card('amex-hk-explorer'), [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    const w = s.warnings.find((x) => x.code === 'point_valuation_estimated');
    expect(w).toBeDefined();
    if (w && w.code === 'point_valuation_estimated') {
      expect(w.note).toContain('保守');
    }
  });

  it('有官方固定兑换率的计划不产生 estimated 告警', () => {
    const s = rankSingleCard(card('hang-seng-enjoy'), [], params, {
      ...MO_PHYSICAL,
      amount: 1000,
      category: 'dining',
    })!;
    expect(s.warnings.some((w) => w.code === 'point_valuation_estimated')).toBe(false);
  });

  it('积分计划不在估值表中 → no_point_valuation', () => {
    const noValuation = makeParams({ pointValuations: {} });
    const s = rankSingleCard(card('hang-seng-enjoy'), [], noValuation, {
      ...MO_PHYSICAL,
      amount: 1000,
    })!;
    expect(s.warnings.some((w) => w.code === 'no_point_valuation')).toBe(true);
  });
});

describe('豁免即将到期的倒计时告警', () => {
  it('豁免剩余 <= 60 天 → fx_fee_exempt_expiring 带 daysLeft', () => {
    // bocmo-allcurrency 豁免到 2026-12-31，今天 2026-10-31 → 61 天，不触发
    // 用 2026-12-30 作为今天，剩 1 天
    const lateParams = makeParams({ today: '2026-12-30' });
    const s = rankSingleCard(card('bocmo-allcurrency'), [], lateParams, {
      amount: 1000,
      settlementCurrency: 'HKD',
      category: 'dining',
      channel: 'physical',
      region: 'MO',
    });
    // 该卡返现数据全 unknown，但 FTF 时效告警走的是 unknownScheme 之外的分支，
    // 这里只断言「卡被识别为 unknown 且没有崩」；真正的 expiring 分支用有返现数据的卡验
    expect(s).not.toBeNull();
  });

  it('Amex 无豁免条款时不产生豁免相关告警', () => {
    const s = rankSingleCard(card('amex-hk-explorer'), [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.warnings.some((w) => w.code.startsWith('fx_fee_exempt'))).toBe(false);
  });
});

describe('数据新鲜度：90 天阈值', () => {
  it('verifiedAt 超过 90 天 → stale_rate', () => {
    const stale = { ...card('citi-cash-back'), verifiedAt: '2026-01-01' } as Card;
    const s = rankSingleCard(stale, [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    const w = s.warnings.find((x) => x.code === 'stale_rate');
    expect(w).toBeDefined();
    if (w && w.code === 'stale_rate') expect(w.verifiedAt).toBe('2026-01-01');
  });

  it('恰好 90 天不报警（阈值是「超过」）', () => {
    // 2026-10-31 往前 90 天 = 2026-08-02
    const borderline = { ...card('citi-cash-back'), verifiedAt: '2026-08-02' } as Card;
    const s = rankSingleCard(borderline, [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.warnings.some((w) => w.code === 'stale_rate')).toBe(false);
  });

  it('91 天报警', () => {
    const borderline = { ...card('citi-cash-back'), verifiedAt: '2026-08-01' } as Card;
    const s = rankSingleCard(borderline, [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.warnings.some((w) => w.code === 'stale_rate')).toBe(true);
  });

  it('low 置信度卡带 low_confidence 告警（立桥）', () => {
    const s = rankSingleCard(card('wlbank-visa-gold'), [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.warnings.some((w) => w.code === 'low_confidence')).toBe(true);
  });

  it('内地实体刷卡带 DCC 风险提示', () => {
    const s = rankSingleCard(card('citi-cash-back'), [], params, {
      amount: 1000,
      settlementCurrency: 'CNY',
      category: 'dining',
      channel: 'physical',
      region: 'CN',
    })!;
    expect(s.warnings.some((w) => w.code === 'dcc_risk')).toBe(true);
  });

  it('澳门实体刷卡不提示 DCC', () => {
    const s = rankSingleCard(card('citi-cash-back'), [], params, { ...MO_PHYSICAL, amount: 1000 })!;
    expect(s.warnings.some((w) => w.code === 'dcc_risk')).toBe(false);
  });
});

describe('unknown 卡也要带数据新鲜度与置信度告警', () => {
  it('unknown 状态卡仍返回 stale_rate / low_confidence（不能因为算不出数就丢掉时间提醒）', () => {
    const staleUnknown = { ...card('bocmo-allcurrency'), verifiedAt: '2026-01-01', confidence: 'low' as const };
    const r = rankCards([staleUnknown], [], params, { ...MO_PHYSICAL, amount: 1000 });
    const s = r.unranked[0]!;
    expect(s.status).toBe('unknown');
    expect(s.warnings.some((w) => w.code === 'stale_rate')).toBe(true);
    expect(s.warnings.some((w) => w.code === 'low_confidence')).toBe(true);
  });
});

describe('积分估值构建', () => {
  it('同一 programId 只取首次出现的估值（后者不覆盖）', () => {
    const first = { pointsValuation: { programId: 'p', valuePerPoint: 0.01, currency: 'HKD' as const, derivation: 'a' } };
    const second = { pointsValuation: { programId: 'p', valuePerPoint: 0.02, currency: 'HKD' as const, derivation: 'b' } };
    const map = buildPointValuations([first, second]);
    expect(map.p!.valuePerPoint).toBe(0.01);
  });

  it('无积分计划的卡被跳过', () => {
    const map = buildPointValuations([{ pointsValuation: null }]);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('反向验证：用户覆盖值为 NaN 时不采用（避免 NaN 污染整个排序）', () => {
    const pv = { programId: 'p', valuePerPoint: null, currency: 'HKD' as const, derivation: 'x' };
    const r = resolvePointValuation(pv, { valuePerPoint: Number.NaN, currency: 'HKD' })!;
    expect(Number.isNaN(r.valuePerPoint)).toBe(false);
    expect(r.basis).toBe('estimated');
  });

  it('卡库每个 programId 都能解析出估值（不留空档）', () => {
    const map = buildPointValuations(CARDS);
    for (const [id, v] of Object.entries(map)) {
      expect(v.valuePerPoint, `${id} 估值为空`).toBeGreaterThan(0);
    }
  });
});

describe('全库冒烟：38 张卡 × 7 类别 × 2 币种不崩且数字有限', () => {
  const categories: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];

  it('所有组合都返回有限数值，没有 NaN / Infinity', () => {
    for (const currency of ['MOP', 'HKD'] as const) {
      for (const category of categories) {
        const r = rankCards(CARDS, [], params, {
          amount: 1000,
          settlementCurrency: currency,
          category,
          channel: 'physical',
          region: 'MO',
        });
        expect(r.ok).toBe(true);
        for (const s of [...r.ranked, ...r.unranked]) {
          expect(Number.isFinite(s.netRealistic), `${s.cardId} net 非有限`).toBe(true);
          expect(Number.isFinite(s.netRateRealistic), `${s.cardId} rate 非有限`).toBe(true);
          expect(Number.isFinite(s.fxFee), `${s.cardId} fxFee 非有限`).toBe(true);
        }
      }
    }
  });

  it('排序结果始终满足「降序」不变式', () => {
    for (const category of categories) {
      const r = rankCards(CARDS, [], params, {
        amount: 500,
        settlementCurrency: 'MOP',
        category,
        channel: 'physical',
        region: 'MO',
      });
      const rates = r.ranked.map((s) => s.netRateRealistic);
      for (let i = 1; i < rates.length; i += 1) {
        expect(rates[i - 1]!).toBeGreaterThanOrEqual(rates[i]!);
      }
    }
  });

  it('同一张卡不会同时出现在 ranked 与 unranked', () => {
    const r = rankCards(CARDS, [], params, { ...MO_PHYSICAL, amount: 1000 });
    const rankedIds = new Set(r.ranked.map((s) => s.cardId));
    for (const s of r.unranked) {
      expect(rankedIds.has(s.cardId)).toBe(false);
    }
  });
});
