/**
 * 引擎测试的共享便利函数。
 *
 * 为什么单独放：index.test.ts 与 reverse.test.ts 都要用同一套「以 MOP 刷卡」的
 * 默认入参。若各自复制一份，某天默认参数改了、只改一边，两份测试就会验证
 * 不同前提，红绿灯失去意义。
 */

import { rankCards, rankSingleCard } from '../engine';
import { card, makeParams, MO_PHYSICAL } from './params';
import type { Card, SpendInput, LedgerEntry } from '../types';

export const params = makeParams();

export const pct = (n: number): number => n * 100;

/** 以默认 MOP 刷卡参数批量计算 */
export function run(
  c: Card | Card[],
  amount: number,
  over: Partial<SpendInput> = {},
  ledger: LedgerEntry[] = [],
) {
  return rankCards(Array.isArray(c) ? c : [c], ledger, params, { ...MO_PHYSICAL, amount, ...over });
}

/** 以默认 MOP 刷卡参数算单卡（渣打 Simply Cash） */
export function one(amount: number, over: Partial<SpendInput> = {}, ledger: LedgerEntry[] = []) {
  return rankSingleCard(card('sc-simply-cash'), ledger, params, {
    ...MO_PHYSICAL,
    amount,
    ...over,
  })!;
}

/**
 * 为 PULSE 补一份返现数据。
 * 卡库中该卡 7 类别全 unknown，但 FTF 豁免逻辑必须可验，故在测试内补齐费率。
 */
export function pulseWithCashback(): Card {
  const pulse = card('hsbc-pulse-unionpay');
  const categories = Object.fromEntries(
    Object.keys(pulse.categories).map((k) => [
      k,
      { kind: 'cashback' as const, rates: { local: 0.04 } },
    ]),
  ) as Card['categories'];
  return { ...pulse, categories };
}
