/**
 * 卡数据派生判断（纯函数）。组件不自己写日期算术 ——
 * UI 自己算 daysLeft 会出现时区差一天的错误，而那恰好会让用户在最后一天误判
 * （card-detail.md §4.3 明确要求这部分由引擎给出）。
 *
 * 引擎已经给了 `Scheme.fxWaiverValidity`，但「卡详情页 / 卡列表」需要在**没有测算结果**时
 * 也能判断时效。所以这里的 `validityOf` 只做同一件事的展示侧实现，阈值常量直接
 * 复用引擎导出的 STALE_DAYS，避免两处各写 90。
 */

import type { Card, SpendCategory, ValidityState } from '../domain/types';
import { daysBetween } from './period';
import { STALE_DAYS } from '../domain/engine/evaluateCard';

export { STALE_DAYS };

/** 优惠到期提前警示天数（SPEC §5：与 90 天陈旧阈值是两回事） */
export const EXPIRING_SOON_DAYS = 60;

export function validityOf(card: Pick<Card, 'fxFee'>, today: string): ValidityState {
  const validUntil = card.fxFee.waivedWhen?.validUntil;
  if (!validUntil) return { state: 'permanent' };
  const daysLeft = daysBetween(validUntil, today);
  if (daysLeft < 0) return { state: 'expired', validUntil };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { state: 'expiring_soon', validUntil, daysLeft };
  return { state: 'active', validUntil, daysLeft };
}

/** 数据新鲜度：返回距今天数（正数=已过去多少天） */
export function staleDaysOf(card: Pick<Card, 'verifiedAt'>, today: string): number {
  return daysBetween(today, card.verifiedAt);
}

export function isStale(card: Pick<Card, 'verifiedAt'>, today: string): boolean {
  return staleDaysOf(card, today) > STALE_DAYS;
}

/** 该卡的 unknown 类别清单 —— 卡详情页必须逐条列出（SPEC §6.6 第 4 条） */
export function unknownCategories(card: Card): SpendCategory[] {
  const all: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];
  return all.filter((c) => card.categories[c].kind === 'unknown');
}

/** 该卡所有类别里的最高名义费率（不含积分），用于卡库列表右侧那一列 */
export function maxCategoryRate(card: Card): number | null {
  const rates = Object.values(card.categories)
    .map((rule) => {
      if (rule.kind !== 'cashback' || !rule.rates) return null;
      return Math.max(rule.rates.local, rule.rates.foreign ?? rule.rates.local);
    })
    .filter((r): r is number => r !== null);
  if (rates.length === 0) return null;
  return Math.max(...rates);
}

export function categoriesConfigured(card: Card): number {
  return 7 - unknownCategories(card).length;
}

/** 是否为双币卡（银联 + 卡币种与结算场景跨币），用于列表副行文案 */
export function isDualCurrency(card: Card): boolean {
  return card.network === 'unionpay' && Boolean(card.fxFee.waivedWhen?.settlementCurrencyIn?.length);
}
