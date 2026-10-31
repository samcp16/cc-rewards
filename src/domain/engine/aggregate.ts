/**
 * 账本归集。一次 O(n) 算完，避免在每张卡、每条轨道里重复扫描账本。
 *
 * 按 cap.period 选对应周期键：只按月归集会算错按年上限的卡（EarnMORE），
 * 这是 SPEC §11 已列明的坑。
 */

import type { LedgerEntry } from '../types';
import { periodKeyFor } from '../../lib/period';

export interface Aggregates {
  /** capId -> 周期内已用（cap.limitCurrency 计） */
  spentByCap: Record<string, number>;
  /** thresholdId -> 周期内累计（threshold.currency 计） */
  spentByThreshold: Record<string, number>;
  /** channelRuleId -> 本月已用免费额度 */
  freeUsedByRule: Record<string, number>;
}

/**
 * 归集键的取值优先级：月度上限只看 periodKey，年度上限只看 yearKey。
 *
 * 为什么不能「任一键命中就计入」：那样上个月（2026-09）的条目会因为
 * 同属 2026 年而被算进本月上限，把本月剩余额度错误地扣光。
 * 周期口径必须与上限自身的 period 严格对应。
 */
export function aggregateLedger(
  ledger: LedgerEntry[],
  occurredAt: string,
  capPeriods: Record<string, 'month' | 'year' | 'half_year'> = {},
): Aggregates {
  const spentByCap: Record<string, number> = {};
  const spentByThreshold: Record<string, number> = {};
  const freeUsedByRule: Record<string, number> = {};

  const periodKeys = {
    month: periodKeyFor('month', occurredAt),
    year: periodKeyFor('year', occurredAt),
    half_year: periodKeyFor('half_year', occurredAt),
  };
  const monthKey = periodKeys.month;

  for (const entry of ledger) {
    for (const [capId, consumed] of Object.entries(entry.capConsumption ?? {})) {
      const period = capPeriods[capId] ?? 'month';
      // 按该上限自己的周期取对应键比对
      const entryKey =
        period === 'year' ? entry.yearKey : period === 'half_year' ? entry.halfYearKey : entry.periodKey;
      if (entryKey !== periodKeys[period]) continue;
      spentByCap[capId] = (spentByCap[capId] ?? 0) + consumed;
    }
    for (const [thId, contributed] of Object.entries(entry.thresholdContribution ?? {})) {
      // 门槛同理：默认按自然月归集
      if (entry.periodKey !== monthKey) continue;
      spentByThreshold[thId] = (spentByThreshold[thId] ?? 0) + contributed;
    }
    if (entry.periodKey === monthKey) {
      for (const [ruleId, consumed] of Object.entries(entry.channelFreeConsumption ?? {})) {
        freeUsedByRule[ruleId] = (freeUsedByRule[ruleId] ?? 0) + consumed;
      }
    }
  }

  return { spentByCap, spentByThreshold, freeUsedByRule };
}
