/**
 * 账本写入（F5 「记一笔」）。
 *
 * 一条账本记录必须同时写四种周期键（periodKey / quarterKey / yearKey / halfYearKey）
 * 并按卡上所有上限池预计算 `capConsumption`。为什么在写入时算而不是读取时算：
 *
 * - 读取时算需要「重新判断这笔属于哪个上限池」，而判断依据是卡的规则；
 *   卡规则一旦被用户改过，历史记录的归集口径就会静默变化 —— 上个月的已用额
 *   会随着这次编辑而跳变，用户会以为数据坏了。
 * - 写入时快照，历史就是历史。
 */

import { db } from './schema';
import type { CardRow } from './schema';
import type { LedgerEntry } from '../domain/types';
import type { Scheme } from '../domain/types.result';
import { toDateKey, toHalfYearKey, toPeriodKey, toQuarterKey, toYearKey } from '../lib/period';
import { round2 } from '../lib/money';
import { todayKey } from '../hooks/buildDefaultParams';

export interface RecordSpendInput {
  card: CardRow;
  amount: number;
  currency: LedgerEntry['currency'];
  category: LedgerEntry['category'];
  channel: LedgerEntry['channel'];
  /** 由引擎算出的结果，用于回填 earnedCashback / capConsumption */
  scheme: Scheme;
}

function makeId(): string {
  // crypto.randomUUID 在 iOS 15.4+ 可用；兜底用时间戳 + 随机。
  // 账本不要求跨设备唯一性（单人自用、无同步），这个强度足够。
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `l-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
}

/**
 * 按卡的每个上限池算出「这一笔占用了多少额度」。
 *
 * 口径跟随 `cap.basis`（types.ts 里有详细说明）：
 * - `'value'`（返现上限，如 Chill 的 HK$150 回赠上限）→ 占用的是**返现额**
 * - `'spend'`（消费额度上限，如「首 HK$2,000 享 5%」）→ 占用的是**消费额**
 *
 * 写错会差一个量级：Chill 若按消费额算，刷 2000 MOP 会记成「用掉 2000 额度」，
 * 实际只该记「用掉 116 回赠」。所以这里不做「一律按消费额」的简化。
 */
function buildCapConsumption(input: RecordSpendInput): Record<string, number> {
  const { card, scheme, amount, category } = input;
  const consumption: Record<string, number> = {};
  for (const cap of card.caps) {
    if (cap.categories !== 'all' && !cap.categories.includes(category)) continue;
    consumption[cap.id] = cap.basis === 'spend' ? round2(amount) : round2(Math.max(0, scheme.grossCashback));
  }
  return consumption;
}

function buildThresholdContribution(input: RecordSpendInput): Record<string, number> {
  const { card, amount, category } = input;
  const contribution: Record<string, number> = {};
  for (const th of card.thresholds) {
    if (th.accrualCategories !== 'all' && !th.accrualCategories.includes(category)) continue;
    contribution[th.id] = round2(amount);
  }
  return contribution;
}

export function buildLedgerEntry(input: RecordSpendInput, occurredAt: string = todayKey()): LedgerEntry {
  const day = toDateKey(occurredAt);
  return {
    id: makeId(),
    cardId: input.card.cardId,
    occurredAt: day,
    periodKey: toPeriodKey(day),
    quarterKey: toQuarterKey(day),
    yearKey: toYearKey(day),
    halfYearKey: toHalfYearKey(day),
    amount: input.amount,
    currency: input.currency,
    category: input.category,
    channel: input.channel,
    capConsumption: buildCapConsumption(input),
    thresholdContribution: buildThresholdContribution(input),
    // 渠道免费额度：当前渠道规则里没有月免费额，留空比塞假数据安全
    channelFreeConsumption: {},
    earnedCashback: round2(input.scheme.grossCashback),
    earnedPoints: round2(input.scheme.pointsValue),
    createdAt: new Date().toISOString(),
  };
}

export async function recordSpend(input: RecordSpendInput): Promise<LedgerEntry> {
  const entry = buildLedgerEntry(input);
  await db.ledger.put(entry);
  return entry;
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  await db.ledger.delete(id);
}
