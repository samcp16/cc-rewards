/**
 * 第 3 步：封顶（Cap）。
 *
 * 三个必须做对的地方：
 * 1. 按 cap.period 取对应周期的账本归集，不是一律按月（EarnMORE 按年计）
 * 2. 跨币种折算：上限 HK$150 而消费是 MOP 时不折算，上限功能直接失效
 * 3. 超额部分按 overLimitFallback，无 fallback 则不计收益（不是负数）
 *
 * 「汇率折算」在这里发生，但它产生的数字**不出现在成本项**——它不是成本（SPEC §6.5）。
 */

import type { CapDefinition, CurrencyCode, FxTable } from '../types';
import { convert, describeRate } from '../fx/fxReference';
import { periodKeyFor } from '../../lib/period';
import { round2 } from '../../lib/money';

export interface CapOutcome {
  /** 原始价值（未封顶） */
  preCapValue: number;
  /** 封顶后价值 */
  postCapValue: number;
  /** 被上限削掉的金额 = preCapValue - postCapValue */
  cappedBy: number;
  /** 超额部分金额（settlementCurrency 计） */
  overAmount: number;
  /** 超额部分按 fallback 计出的额外价值 */
  fallbackValue: number;
  /** 命中的上限池 */
  capId?: string;
  /** 剩余额度（settlementCurrency 计） */
  remaining?: number;
  limit?: number;
  currency?: CurrencyCode;
  /** 折算说明，跨币种时非空 */
  fxNote?: string;
  /** 已用尽 */
  exhausted: boolean;
}

export interface CapContext {
  amount: number;
  settlementCurrency: CurrencyCode;
  capById: Map<string, CapDefinition>;
  /** capId -> 该周期内已用金额（cap.limitCurrency 计） */
  spentByCap: Record<string, number>;
  occurredAt: string;
  fx: FxTable;
}

/**
 * 回到消费币种的上限换算率。
 * 上限以 limitCurrency 计，消费以 settlementCurrency 计；
 * 转成「消费货币单位的上限」才能与消费金额直接比较。
 */
function capLimitInSettlementCurrency(
  cap: CapDefinition,
  settlementCurrency: CurrencyCode,
  fx: FxTable,
): { limit: number; fxNote?: string } {
  const limit = convert(cap.limitAmount, cap.limitCurrency, settlementCurrency, fx);
  const fxNote =
    cap.limitCurrency === settlementCurrency
      ? undefined
      : describeRate(cap.limitCurrency, settlementCurrency, fx);
  return { limit, fxNote };
}

/**
 * 应用封顶。
 *
 * 木桶原理：一条轨道可能挂多个上限池，取「剩余最少」的那个作为约束。
 */
export function applyCap(
  preCapValue: number,
  capIds: string[],
  ctx: CapContext,
  fallbackRate?: number,
): CapOutcome {
  if (capIds.length === 0) {
    return {
      preCapValue,
      postCapValue: preCapValue,
      cappedBy: 0,
      overAmount: 0,
      fallbackValue: 0,
      exhausted: false,
    };
  }

  let bindingCap: CapDefinition | undefined;
  let bindingRemainingInSettlement = Number.POSITIVE_INFINITY;
  let bindingLimitInSettlement = Number.POSITIVE_INFINITY;
  let bindingFxNote: string | undefined;

  for (const capId of capIds) {
    const cap = ctx.capById.get(capId);
    if (!cap) {
      throw new Error(`轨道引用了不存在的上限池 ${capId}，拒绝静默忽略`);
    }
    // 周期校验：确认归集键与本次消费同期
    periodKeyFor(cap.period, ctx.occurredAt);

    const { limit, fxNote } = capLimitInSettlementCurrency(cap, ctx.settlementCurrency, ctx.fx);
    const usedInCapCurrency = ctx.spentByCap[capId] ?? 0;
    const usedInSettlement = convert(usedInCapCurrency, cap.limitCurrency, ctx.settlementCurrency, ctx.fx);
    const remaining = Math.max(limit - usedInSettlement, 0);

    if (remaining < bindingRemainingInSettlement) {
      bindingRemainingInSettlement = remaining;
      bindingLimitInSettlement = limit;
      bindingCap = cap;
      bindingFxNote = fxNote;
    }
  }

  if (!bindingCap) {
    return {
      preCapValue,
      postCapValue: preCapValue,
      cappedBy: 0,
      overAmount: 0,
      fallbackValue: 0,
      exhausted: false,
    };
  }

  // 额度的计量口径由 cap.basis 决定，默认 'value'（返现额上限）。
  //
  // 'value' 口径（默认，符合官方条款的常见写法）：
  //   官方细则表格写的是「回赠上限(HK$) = $150」，即返现额封顶 150。
  //   中银 Chill：10% 由基础 0.4%（无上限）+ 额外 9.6%（受 150 上限）构成。
  //   刷 2000 MOP：基础 8 + 额外 min(2000*0.096, 154.5) = 154.5 → 合计 162.5。
  //   本实现以「先算总额、按上限截断、超出部分走 fallback」表达同一语义。
  //
  // 'spend' 口径：limitAmount 指可享优惠的消费金额额度（如「首 HK$2,000 享 5%」）。
  //
  // 两种口径差一个量级：Chill 按 spend 得 22.83，按 value 得 156.32，推荐会反向。
  const basis: 'value' | 'spend' = bindingCap.basis ?? 'value';

  const effectiveRate = ctx.amount === 0 ? 0 : preCapValue / ctx.amount;

  let eligibleAmount: number;
  let overAmount: number;
  let eligibleValue: number;

  if (basis === 'spend') {
    // 额度是消费金额：额度内的消费按原费率，额度外按 fallback
    eligibleAmount = Math.min(ctx.amount, bindingRemainingInSettlement);
    overAmount = Math.max(ctx.amount - eligibleAmount, 0);
    eligibleValue = round2(eligibleAmount * effectiveRate);
  } else {
    // 额度是返现额：先用剩余额度截断本笔可计的返现，再反推对应消费金额
    eligibleValue = round2(Math.min(preCapValue, bindingRemainingInSettlement));
    // 返现额达到额度后，剩余消费按 fallback；preCapValue 为 0 时全部算超额
    eligibleAmount =
      effectiveRate > 0 ? Math.min(ctx.amount, round2(eligibleValue / effectiveRate)) : 0;
    overAmount = Math.max(ctx.amount - eligibleAmount, 0);
  }

  const cappedBy = round2(Math.max(preCapValue - eligibleValue, 0));

  // 用尽判定：本笔可计入的部分为 0（即已无剩余额度）
  const exhausted = bindingRemainingInSettlement <= 0;

  // 超额部分按 fallback 计收益；无 fallback 则不计（不是负数）
  const fallbackValue = fallbackRate === undefined ? 0 : round2(overAmount * fallbackRate);

  return {
    preCapValue,
    postCapValue: round2(eligibleValue + fallbackValue),
    cappedBy,
    overAmount,
    fallbackValue,
    capId: bindingCap.id,
    remaining: round2(bindingRemainingInSettlement),
    limit: round2(bindingLimitInSettlement),
    currency: ctx.settlementCurrency,
    fxNote: bindingFxNote,
    exhausted,
  };
}

