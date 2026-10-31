/**
 * 额度用量派生（卡库页 / 额度页共用）。
 *
 * 这里只做「按上限池汇总」这一件事，不重算收益 —— 账本里每条的 `capConsumption`
 * 是写入时快照，读取时只需按当前周期求和（ledgerRepository 头部说明了为什么）。
 *
 * 关键口径：
 * - 周期要按 `cap.period` 选对应的 key（month→periodKey / year→yearKey / half_year→halfYearKey）。
 *   一律用 periodKey 会把年度上限算成月度，数字小 12 倍，用户会以为额度还很多。
 * - 币种不同要折算（SPEC §6.5：折算必须做，但只用于上限归集）。
 *   用 `params.fx` 的倍数换算，折算说明交给 UI 显示，不静默。
 */

import { useMemo } from 'react';
import type { Card, CapDefinition, CurrencyCode, LedgerEntry } from '../domain/types';
import type { FxTable } from '../domain/types.params';
import { lookupRate } from '../domain/fx/fxReference';
import { round2 } from '../lib/money';
import { toHalfYearKey, toPeriodKey, toYearKey } from '../lib/period';

export interface CapUsage {
  capId: string;
  /** 上限口径对应的周期 */
  period: CapDefinition['period'];
  /** 已用（已折算到 limitCurrency） */
  used: number;
  limit: number;
  currency: CurrencyCode;
  /** 0–1+ */
  ratio: number;
  /** 已折算时非空，UI 必须展示 */
  fxNote?: string;
}

/** 某条账本记录对某个周期是否算「本期」 */
function periodKeyOf(period: CapDefinition['period'], today: string): string {
  if (period === 'year') return toYearKey(today);
  if (period === 'half_year') return toHalfYearKey(today);
  return toPeriodKey(today);
}

function entryKeyOf(period: CapDefinition['period'], entry: LedgerEntry): string {
  if (period === 'year') return entry.yearKey;
  if (period === 'half_year') return entry.halfYearKey;
  return entry.periodKey;
}

export function computeCapUsages(
  card: Card,
  ledger: LedgerEntry[],
  fx: FxTable,
  today: string,
): CapUsage[] {
  const own = ledger.filter((e) => e.cardId === card.cardId);
  return card.caps.map((cap) => {
    const key = periodKeyOf(cap.period, today);
    const inPeriod = own.filter((e) => entryKeyOf(cap.period, e) === key);

    let used = 0;
    let convertedFrom: CurrencyCode | null = null;
    let missingRate = false;
    for (const entry of inPeriod) {
      const raw = entry.capConsumption[cap.id] ?? 0;
      if (raw === 0) continue;
      if (entry.currency === cap.limitCurrency) {
        used += raw;
        continue;
      }
      // 跨币种：折算到上限币种。查不到汇率时**不静默按 1:1** ——
      // 那个上限会看起来「还很多」，而实际可能早已打满。
      // 这里按原值计入并把「缺汇率」显式标出来，由 UI 决定怎么提醒。
      const rate = lookupRate(fx, entry.currency, cap.limitCurrency);
      if (rate === null) {
        used += raw;
        missingRate = true;
      } else {
        used += raw * rate;
      }
      convertedFrom = entry.currency;
    }

    const fxNote = missingRate
      ? `缺 ${convertedFrom ?? ''} 兑 ${cap.limitCurrency} 折算率，已按 1:1 粗算，请去设置页补上`
      : convertedFrom !== null
        ? `已从 ${convertedFrom} 折算为 ${cap.limitCurrency} 归集，折算不影响返现额`
        : undefined;

    return {
      capId: cap.id,
      period: cap.period,
      used: round2(used),
      limit: cap.limitAmount,
      currency: cap.limitCurrency,
      ratio: cap.limitAmount > 0 ? used / cap.limitAmount : 0,
      fxNote,
    };
  });
}

/** 一张卡「最紧张」的那个上限池 —— 列表里的微进度条只显示它 */
export function tightestUsage(usages: CapUsage[]): CapUsage | null {
  const monthly = usages.filter((u) => u.period === 'month');
  const pool = monthly.length > 0 ? monthly : usages;
  if (pool.length === 0) return null;
  return pool.reduce((worst, u) => (u.ratio > worst.ratio ? u : worst));
}

export function useCardUsages(
  cards: Card[],
  ledger: LedgerEntry[],
  fx: FxTable,
  today: string,
): Map<string, CapUsage[]> {
  return useMemo(() => {
    const map = new Map<string, CapUsage[]>();
    for (const card of cards) {
      map.set(card.cardId, computeCapUsages(card, ledger, fx, today));
    }
    return map;
  }, [cards, ledger, fx, today]);
}
