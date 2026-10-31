/**
 * 第 6 步：排序与「基本持平」判定。
 *
 * 排序主键是净**回报率**而非净额（SPEC §6.1）：
 * 「刷 MOP 380 赚 12」与「刷 MOP 12,000 赚 240」无法直接比较，但 3.16% vs 2.00% 可以。
 *
 * 稳定性要求（ARCHITECTURE Q6）：同输入跑 100 次顺序必须一致。
 * 排序键中带上 cardId 作为终极 tie-breaker，不依赖 Array.prototype.sort 的实现细节。
 */

import type { Scheme } from '../types.result';

/** 冠亚军差小于该值视为基本持平（ARCHITECTURE §12.1 F1-AC4） */
export const TIE_THRESHOLD = 0.001;

/**
 * 排序：净回报率降序 → 净额降序 → cardId 升序。
 *
 * 不含 status='unknown' 的卡：它们不参与排序（SPEC §6.6 第 1 条），
 * 由调用方放在 unranked 里单独展示。
 */
export function rankSchemes(schemes: Scheme[]): Scheme[] {
  const ranked = schemes.filter((s) => s.status === 'ranked');
  const sorted = [...ranked].sort((a, b) => {
    if (b.netRateRealistic !== a.netRateRealistic) {
      return b.netRateRealistic - a.netRateRealistic;
    }
    if (b.netRealistic !== a.netRealistic) {
      return b.netRealistic - a.netRealistic;
    }
    return a.cardId.localeCompare(b.cardId);
  });

  return sorted.map((s, i) => {
    const next = sorted[i + 1];
    const tieWithNext = next ? Math.abs(s.netRateRealistic - next.netRateRealistic) < TIE_THRESHOLD : false;
    return { ...s, tieWithNext };
  });
}

/** 目标卡之外的方案：按原顺序返回，不做二次排序 */
export function splitUnknown(schemes: Scheme[]): { ranked: Scheme[]; unranked: Scheme[] } {
  return {
    ranked: schemes.filter((s) => s.status === 'ranked'),
    unranked: schemes.filter((s) => s.status !== 'ranked'),
  };
}
