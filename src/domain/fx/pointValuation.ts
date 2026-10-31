/**
 * 积分估值解析。
 *
 * 数据现实：卡库里 6 个积分计划中 4 个的 `valuePerPoint` 为 null（里数类波动大，
 * 官方无固定值）。若直接把 null 当成「无法估值」而让整张卡判 unknown，
 * 会出现一个荒谬结果：**Amex Explorer 在餐饮场景完全无法参与比较**，
 * 而它恰恰是候选卡之一（SPEC §3.2 第 8 张）。
 *
 * 处理原则（方向安全：宁可低估，不可高估）：
 * 1. 有官方固定兑换率（yuu 200 分 = HK$1、澳门积分 200 分 = MOP 1）→ 直接用，标注 confirmed
 * 2. 无官方值（MR / 里数 / 奖赏钱）→ 用保守估计值，并在结果里标注 estimated
 *    保守值：每 1 单位消费货币得 1 分，每分按 0.005 计，即等效 0.5% 回赠。
 *    依据：这是港澳卡库里「积分型基础回赠」的最低档实测值（BNU / 立桥 / 工银澳门均为 0.5%），
 *    取全库最低档作为里数类估值下限，不会给用户虚高结论。
 * 3. 用户可在设置页覆盖，覆盖后 confidence 变 user_provided
 */

import type { CurrencyCode, PointValuation } from '../types';

export type ValuationBasis = 'confirmed' | 'estimated' | 'user_provided';

export interface ResolvedValuation {
  valuePerPoint: number;
  currency: CurrencyCode;
  basis: ValuationBasis;
  /** UI 必须展示的口径说明 */
  note: string;
}

/** 里数 / 浮动价值计划的保守下限：每分 0.005 单位计价货币（等效 0.5% 回赠） */
export const CONSERVATIVE_VALUE_PER_POINT = 0.005;

export function resolvePointValuation(
  valuation: PointValuation | null,
  userOverride?: { valuePerPoint: number | null; currency: CurrencyCode },
): ResolvedValuation | null {
  if (!valuation) return null;

  const userValue = userOverride?.valuePerPoint;
  if (typeof userValue === 'number' && Number.isFinite(userValue) && userValue > 0) {
    return {
      valuePerPoint: userValue,
      currency: userOverride!.currency,
      basis: 'user_provided',
      note: `按你设定的积分估值折算：每分 ${userOverride!.currency} ${userValue}`,
    };
  }

  if (valuation.valuePerPoint !== null) {
    return {
      valuePerPoint: valuation.valuePerPoint,
      currency: valuation.currency,
      basis: 'confirmed',
      note: valuation.derivation,
    };
  }

  return {
    valuePerPoint: CONSERVATIVE_VALUE_PER_POINT,
    currency: valuation.currency,
    basis: 'estimated',
    note: `该积分计划无官方固定兑换率，按保守下限折算：每分 ${valuation.currency} ${CONSERVATIVE_VALUE_PER_POINT}（等效 0.5% 回赠）`,
  };
}

/** 从卡库构建 programId -> 估值 的映射 */
export function buildPointValuations(
  cards: Array<{ pointsValuation: PointValuation | null }>,
): Record<string, ResolvedValuation> {
  const map: Record<string, ResolvedValuation> = {};
  for (const card of cards) {
    const pv = card.pointsValuation;
    if (!pv) continue;
    if (map[pv.programId]) continue;
    const resolved = resolvePointValuation(pv);
    if (resolved) map[pv.programId] = resolved;
  }
  return map;
}
