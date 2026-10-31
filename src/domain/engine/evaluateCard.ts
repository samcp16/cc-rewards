/**
 * 单卡测算：按 0 → 5 的顺序取数计算，产出 Scheme。
 *
 * 本文件不含排序（第 6 步在 rank.ts），也不含输入校验（在 index.ts），
 * 职责单一：把一张卡算完并说清「为什么」。
 */

import type { Card, EngineParams, SpendInput } from '../types';
import type { BreakdownItem, Scheme, SchemeWarning } from '../types.result';
import { resolveSettlementRoute, assertRouteConsistency } from './settlementRoute';
import { resolveThreshold } from './thresholds';
import { computeEarn, applyExclusivity } from './earn';
import type { EarnCandidate } from './earn';
import { buildEarnItem, collectApplicableChannels, computeCardCosts, pushCapWarnings, resolveFallbackRate, unknownScheme } from './evaluateHelpers';
import { applyCap } from './caps';
import type { CapOutcome } from './caps';
import { daysBetween } from '../../lib/period';
import { formatPercent2, rateOf, round2 } from '../../lib/money';
import type { Aggregates } from './aggregate';

/** 数据新鲜度阈值：超过 90 天提示过期（AC-F6-02），与 validUntil 的 60 天是两回事 */
export const STALE_DAYS = 90;

export function evaluateCard(
  card: Card,
  params: EngineParams,
  input: SpendInput,
  occurredAt: string,
  agg: Aggregates,
  fxNotes: Set<string>,
): Scheme {
  const warnings: SchemeWarning[] = [];
  const breakdown: BreakdownItem[] = [];
  const amount = input.amount;
  const currency = input.settlementCurrency;

  // ---------- 第 0 步：结算路由（唯一判定点，返现与手续费共用） ----------
  const routeDecision = resolveSettlementRoute(card, currency, input.region);
  assertRouteConsistency(routeDecision);
  // ---------- 第 1 步：定档 ----------
  const threshold = resolveThreshold(card, {
    amount,
    settlementCurrency: currency,
    category: input.category,
    occurredAt,
    aggregates: agg,
    fx: params.fx,
  });
  if (threshold.fxNote) fxNotes.add(threshold.fxNote);

  // ---------- 第 2 步：毛返现 + 排他组 ----------
  const earnOutcome = computeEarn({
    card,
    amount,
    settlementCurrency: currency,
    category: input.category,
    rateSide: routeDecision.rateSide,
    channel: input.channel,
    threshold,
    pointValuations: params.pointValuations,
  });

  const staleDays = daysBetween(params.today, card.verifiedAt);
  const commonWarnings: SchemeWarning[] = [];
  if (staleDays > STALE_DAYS) commonWarnings.push({ code: 'stale_rate', verifiedAt: card.verifiedAt });
  if (card.confidence === 'low') commonWarnings.push({ code: 'low_confidence', confidence: card.confidence });

  // ---------- 第 4-5 步：外币手续费 + 渠道服务费 ----------
  // 计算次序上 4/5 步先于第 2 步的缺口判定：毛返现算不出来，不等于成本算不出来。
  // 收益未知的卡仍要如实报出手续费，否则「为什么」里会出现「外币手续费 0%」这种
  // 与官方条款直接矛盾的数字（本缺陷此前被 B1 掩盖）。
  const { fxResolution, fxFeeOutcome, channelOutcome } = computeCardCosts(
    card,
    params,
    input,
    occurredAt,
    agg,
    routeDecision,
  );

  if (earnOutcome.hasUnknown) {
    // 区分三种缺口：类别费率缺失（unknown_rate）、积分计划估不出值（no_point_valuation）、
    // 本笔渠道不适用（channel_gated）。三者在 UI 上都要说「未知」，但用户能采取的
    // 补救动作不同：补类别费率 / 补积分估值 / 换支付渠道。不能一律归成 unknown_rate。
    //
    // `threshold_tier_incomplete` 已随 ADR-011 删除：新模型下费率永远来自 categories，
    // 不存在「档位没有收益声明」这个状态。
    const reasons: SchemeWarning[] = [];
    if (earnOutcome.unknownReasons.includes('unknown_rate')) {
      reasons.push({ code: 'unknown_rate', category: input.category });
    }
    if (earnOutcome.unknownReasons.includes('channel_gated')) {
      reasons.push({
        code: 'channel_gated',
        category: input.category,
        channel: input.channel,
        applicableChannels: collectApplicableChannels(card, input.category),
      });
    }
    for (const c of earnOutcome.candidates) {
      if (c.unknownReason === 'no_point_valuation') {
        reasons.push({ code: 'no_point_valuation', programId: c.pointProgramId ?? '' });
      }
    }
    return unknownScheme(
      card,
      routeDecision.route,
      routeDecision.rateSide,
      [...commonWarnings, ...reasons],
      threshold.note,
      {
        fxFee: fxFeeOutcome.amount,
        channelFee: channelOutcome.amount,
        fxWaiverNote: fxFeeOutcome.waiverNote,
        fxWaiverValidity: fxResolution.validity,
      },
    );
  }

  const chosen = applyExclusivity(earnOutcome.candidates);

  // ---------- 第 3 步：封顶 ----------
  const capById = new Map(card.caps.map((c) => [c.id, c]));
  const capOutcomes: Array<{ candidate: EarnCandidate; outcome: CapOutcome }> = [];
  let grossCashback = 0;
  let pointsValue = 0;

  for (const candidate of chosen) {
    const fallbackRate = resolveFallbackRate(candidate, card, routeDecision.rateSide, input.category);
    const outcome = applyCap(
      candidate.value,
      candidate.capIds,
      {
        amount,
        settlementCurrency: currency,
        capById,
        spentByCap: agg.spentByCap,
        occurredAt,
        fx: params.fx,
      },
      fallbackRate,
    );
    capOutcomes.push({ candidate, outcome });

    if (outcome.fxNote) fxNotes.add(outcome.fxNote);

    if (candidate.kind === 'cashback') grossCashback += outcome.postCapValue;
    else pointsValue += outcome.postCapValue;

    breakdown.push(buildEarnItem(candidate, outcome, currency, fallbackRate));
    pushCapWarnings(warnings, outcome, currency);

    if (candidate.unknownReason === 'no_point_valuation') {
      warnings.push({ code: 'no_point_valuation', programId: candidate.pointProgramId ?? '' });
    }
    if (candidate.valuationBasis === 'estimated' && candidate.pointProgramId) {
      warnings.push({
        code: 'point_valuation_estimated',
        programId: candidate.pointProgramId,
        note: candidate.valuationNote ?? '',
      });
    }
  }

  // ---------- 第 4-5 步的明细项：位置固定在毛返现之后 ----------
  // 与「毛返现 → 外币手续费 → 渠道服务费 → 净额」的阅读顺序一致（AC-F4-01）。
  breakdown.push({
    label: fxFeeOutcome.exempt
      ? `外币手续费 ${formatPercent2(fxFeeOutcome.rate)}（豁免）`
      : `外币手续费 ${formatPercent2(fxFeeOutcome.rate)}`,
    amount: -fxFeeOutcome.amount,
    currency,
    kind: 'fx_fee',
    sourceUrl: fxFeeOutcome.sourceUrl,
    verifiedAt: fxFeeOutcome.verifiedAt,
    detail: fxFeeOutcome.waiverNote,
  });
  breakdown.push({
    label:
      channelOutcome.rate > 0
        ? `渠道服务费 ${formatPercent2(channelOutcome.rate)}`
        : '渠道服务费 0',
    amount: -channelOutcome.amount,
    currency,
    kind: 'channel_fee',
    sourceUrl: channelOutcome.sourceUrl,
    verifiedAt: channelOutcome.verifiedAt,
    detail: channelOutcome.note ?? channelOutcome.allowanceNote,
  });

  if (fxResolution.validity.state === 'expired') {
    warnings.push({ code: 'fx_fee_exempt_expired', validUntil: fxResolution.validity.validUntil });
  } else if (fxResolution.validity.state === 'expiring_soon') {
    warnings.push({
      code: 'fx_fee_exempt_expiring',
      validUntil: fxResolution.validity.validUntil,
      daysLeft: fxResolution.validity.daysLeft,
    });
  }

  const grossRounded = round2(grossCashback);
  const pointsRounded = round2(pointsValue);
  const netRealistic = round2(grossRounded + pointsRounded - fxFeeOutcome.amount - channelOutcome.amount);

  // netOptimistic 只还原「被上限削减的部分」，不重跑全部计算
  const restoredCap = round2(capOutcomes.reduce((acc, o) => acc + o.outcome.cappedBy, 0));
  const netOptimistic = round2(netRealistic + restoredCap);

  if (input.region === 'CN' && input.channel === 'physical') {
    warnings.push({ code: 'dcc_risk' });
  }

  return {
    cardId: card.cardId,
    cardName: card.cardName,
    issuer: card.issuer,
    issuerRegion: card.issuerRegion,
    network: card.network,
    confidence: card.confidence,
    verifiedAt: card.verifiedAt,
    status: 'ranked',
    route: routeDecision.route,
    rateSide: routeDecision.rateSide,
    grossCashback: grossRounded,
    pointsValue: pointsRounded,
    fxFee: fxFeeOutcome.amount,
    channelFee: channelOutcome.amount,
    netRealistic,
    netOptimistic,
    netRateRealistic: rateOf(netRealistic, amount),
    netRateOptimistic: rateOf(netOptimistic, amount),
    breakdown,
    warnings: [...commonWarnings, ...warnings],
    capsAffected: capOutcomes
      .filter(({ outcome }) => outcome.capId !== undefined)
      .map(({ outcome }) => ({
        capId: outcome.capId!,
        remaining: outcome.remaining ?? 0,
        limit: outcome.limit ?? 0,
        currency,
        fxNote: outcome.fxNote,
      })),
    fxWaiverNote: fxFeeOutcome.waiverNote,
    fxWaiverValidity: fxResolution.validity,
    thresholdNote: threshold.note,
    tieWithNext: false,
  };
}
