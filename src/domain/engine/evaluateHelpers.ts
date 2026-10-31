/**
 * 单卡测算的步骤细节函数：fallback 费率、分项构造、上限告警、unknown 结果、交易成本。
 *
 * 从 evaluateCard.ts 拆出：主流程（0→5 步编排）留在 evaluateCard.ts，
 * 这里放步骤内部的细节。拆分标准是「改引擎次序时看哪个文件」——
 * 看次序开 evaluateCard.ts，改某个步骤的细节开本文件。
 *
 * 全部为模块内私有逻辑，不对外导出（除测试经 evaluateCard 间接覆盖）；
 * resolveFallbackRate 例外：它读取卡库数据结构，单测要直接构造输入。
 * computeCardCosts 也是导出但仅引擎内部使用。
 */

import type { Card, CurrencyCode, EngineParams, PaymentChannel, SpendInput } from '../types';
import type { BreakdownItem, Scheme, SchemeWarning } from '../types.result';
import type { EarnCandidate } from './earn';
import { pickRate } from './earn';
import type { CapOutcome } from './caps';
import type { Aggregates } from './aggregate';
import type { RouteDecision } from './settlementRoute';
import { resolveFxFee } from '../fx/resolveFx';
import { computeFxFee, computeChannelFee } from './fees';
import { formatAmount2, formatPercent2 } from '../../lib/money';

/** 上限剩余低于该比例时提示「即将用尽」 */
export const CAP_NEARLY_EXHAUSTED_RATIO = 0.2;

/**
 * 「这个候选的费率是否就是 categories 声明的那一档」。
 *
 * 用途只有一个：判断封顶后的超额部分能否用 `cap.overLimitFallback` 计收益。
 *
 * 为什么需要它（ADR-011 之后新增）：门槛的增量可能把费率抬高（Chill dining
 * 达标后 10%，官方条款是「额外回赠 9.6% 受 HK$150 上限，基础 0.4% 无上限」）。
 * 此时超额部分若按 fallback 的 0.4% 计，恰好等于官方口径；但若用户「未达标」
 * （费率 0.4%，与 categories 的 10% 不同），超额部分再按 0.4% 计就等于把
 * 一个不存在的上限套在了本来无上限的费率上。差异化处理会很脆，所以口径定为：
 * **只有当轨道费率就是 `categories` 声明值时才承认 overLimitFallback**。
 * 门槛增量轨道（达标后升档）不认 fallback，超额部分不计收益 —— 保守方向，
 * 不会高估。这一条在 ADR-011 的「负面上限绑定回到 categories 层」之下是安全的：
 * 门槛不会新增上限池，只会在已有上限池上给出更高的名义费率。
 */
export function comparableRateOf(candidate: EarnCandidate, card: Card, category: SpendInput['category']): number | undefined {
  const rule = card.categories[category];
  if (!rule) return undefined;
  if (candidate.kind === 'cashback') return rule.rates?.local;
  if (candidate.kind === 'points') return rule.multiplier;
  return undefined;
}

/** 超额部分费率：优先 cap.overLimitFallback；无 fallback 返回 undefined（不计收益） */
export function resolveFallbackRate(
  candidate: EarnCandidate,
  card: Card,
  rateSide: 'local' | 'foreign',
  category: SpendInput['category'],
): number | undefined {
  const declared = comparableRateOf(candidate, card, category);
  if (declared !== undefined && Math.abs(candidate.rate - declared) > 1e-9) {
    // 费率已被门槛增量改写 → 上限池的 overLimitFallback 不适用于这一笔
    return undefined;
  }
  for (const capId of candidate.capIds) {
    const cardCap = card.caps.find((c) => c.id === capId);
    const fb = cardCap?.overLimitFallback;
    if (!fb) continue;

    // 只认「与当前轨道同属基础返现」的 fallback。
    // 数据里的 exclusivityGroup 写的是 'base'，而类别轨道用 'base.<category>'，
    // 二者是同一概念，这里显式归一，而不是靠字符串碰巧相等。
    const fbGroup = fb.exclusivityGroup;
    const sameBase = fbGroup === 'base' || fbGroup === candidate.exclusivityGroup;
    if (!sameBase) continue;

    if (fb.kind === 'cashback' && fb.rates) return pickRate(fb.rates, rateSide);
  }
  return undefined;
}

export function buildEarnItem(
  candidate: EarnCandidate,
  outcome: CapOutcome,
  currency: CurrencyCode,
  fallbackRate?: number,
): BreakdownItem {
  const capped = outcome.cappedBy > 0;
  const base = candidate.kind === 'points' ? `${candidate.label}（折合现金）` : candidate.label;
  const fbText = fallbackRate === undefined ? '0' : formatPercent2(fallbackRate);
  return {
    label: capped ? `${base}；超出部分按 ${fbText}` : base,
    amount: outcome.postCapValue,
    currency,
    kind: candidate.kind,
    cappedBy: capped ? outcome.cappedBy : undefined,
    detail: capped
      ? `已封顶：本笔超出上限 ${currency} ${formatAmount2(outcome.overAmount)}，超出部分按 ${fbText} 计`
      : undefined,
  };
}

export function pushCapWarnings(warnings: SchemeWarning[], outcome: CapOutcome, currency: CurrencyCode): void {
  if (!outcome.capId) return;
  if (outcome.exhausted) {
    warnings.push({ code: 'cap_exhausted', capId: outcome.capId });
    return;
  }
  if (
    outcome.remaining !== undefined &&
    outcome.limit !== undefined &&
    outcome.limit > 0 &&
    outcome.remaining / outcome.limit <= CAP_NEARLY_EXHAUSTED_RATIO
  ) {
    warnings.push({
      code: 'cap_nearly_exhausted',
      capId: outcome.capId,
      remaining: outcome.remaining,
      currency,
    });
  }
}

/**
 * 数据缺口卡：status='unknown'，不参与排序。
 * 数值位刻意保持 0，但前端**必须**读 status，不得读数值（SPEC §6.6 第 2 条）。
 *
 * `costs` 携带「即使收益未知也确定成立」的两项支出与豁免时效。
 * 为什么必须传：毛返现未知不等于成本未知。外币手续费 1.95% 与渠道服务费是
 * 卡与渠道的属性，与本笔能否算出返现无关。若这里返回 0，
 * 用户在「明细」里会看到「外币手续费 0%」这种与官方条款直接矛盾的数字。
 * 注意 netRealistic 仍为 0：把 -fee 当作净额是在暗示「你这笔只亏手续费」，
 * 而返现未知的卡连这个结论都不成立。
 */
export interface UnknownSchemeCosts {
  fxFee: number;
  channelFee: number;
  fxWaiverNote?: string;
  fxWaiverValidity: Scheme['fxWaiverValidity'];
}

export function unknownScheme(
  card: Card,
  route: Scheme['route'],
  rateSide: Scheme['rateSide'],
  warnings: SchemeWarning[],
  thresholdNote: string | undefined,
  costs: UnknownSchemeCosts,
): Scheme {
  return {
    cardId: card.cardId,
    cardName: card.cardName,
    issuer: card.issuer,
    issuerRegion: card.issuerRegion,
    network: card.network,
    confidence: card.confidence,
    verifiedAt: card.verifiedAt,
    status: 'unknown',
    route,
    rateSide,
    grossCashback: 0,
    pointsValue: 0,
    fxFee: costs.fxFee,
    channelFee: costs.channelFee,
    netRealistic: 0,
    netOptimistic: 0,
    netRateRealistic: 0,
    netRateOptimistic: 0,
    breakdown: [],
    warnings,
    capsAffected: [],
    fxWaiverNote: costs.fxWaiverNote,
    fxWaiverValidity: costs.fxWaiverValidity,
    thresholdNote,
    tieWithNext: false,
  };
}
/** 单卡交易成本（第 4-5 步）的落点。收益算不出来也不影响它成立。 */
export interface CardCosts {
  fxResolution: ReturnType<typeof resolveFxFee>;
  fxFeeOutcome: ReturnType<typeof computeFxFee>;
  channelOutcome: ReturnType<typeof computeChannelFee>;
}

/**
 * 第 4-5 步：本笔交易的外币手续费与渠道服务费。
 *
 * 单独抽出（而不是内联在 evaluateCard 里）有两个不可替代的理由：
 *
 * 1. **收益未知的卡也必须报出成本。** 毛返现算不出来，不等于成本算不出来：
 *    1.95% 的外币手续费是卡的属性，与本笔能否算出返现无关。若缺口分支直接返回 0，
 *    用户在明细里会看到「外币手续费 0%」这种与官方条款直接矛盾的数字。
 * 2. **排序回填缺口时要用同一份口径。** 全部卡都算不出收益时（例如用户把类别费率
 *    全填成 unknown），结论区需要靠「交易成本最低」给一个可行动的建议，
 *    它必须与本卡在有收益时的成本完全一致，不能另算一遍。
 *
 * 只依赖第 0 步的路由产物，不依赖定档结果 —— 故可在第 2 步之前执行。
 */
export function computeCardCosts(
  card: Card,
  params: EngineParams,
  input: SpendInput,
  occurredAt: string,
  agg: Aggregates,
  routeDecision: RouteDecision,
): CardCosts {
  // 双币卡按 local 处理时，豁免依据是官方条款（「以澳门币计算的款项手续费豁免」），
  // 必须把这条说明带给 UI，而不是笼统写「本币结算」——用户需要看到条款原文才能信任结论。
  const fxResolution = resolveFxFee(card.fxFee, {
    route: routeDecision.route,
    settlementCurrency: input.settlementCurrency,
    region: input.region,
    today: occurredAt,
    dualCurrencyLocal: routeDecision.dualCurrencyLocal,
    crossCurrency: routeDecision.crossCurrency,
    crossBorder: routeDecision.crossBorder,
  });
  const fxFeeOutcome = computeFxFee(fxResolution, input.amount);

  const matchedRule = params.channelFees.find(
    (r) =>
      r.channel === input.channel &&
      (!r.networkIn || r.networkIn.includes(card.network)) &&
      (!r.issuerRegionIn || r.issuerRegionIn.includes(card.issuerRegion)),
  );
  const channelOutcome = computeChannelFee({
    channel: input.channel,
    network: card.network,
    issuerRegion: card.issuerRegion,
    amount: input.amount,
    settlementCurrency: input.settlementCurrency,
    region: input.region,
    freeUsed: matchedRule ? (agg.freeUsedByRule[matchedRule.id] ?? 0) : 0,
    rules: params.channelFees,
    fx: params.fx,
  });

  return { fxResolution, fxFeeOutcome, channelOutcome };
}

/**
 * 该卡此类别下「被渠道挡掉的轨道」的渠道并集（ADR-010）。
 *
 * 用途：`channel_gated` 告警必须携带「换成哪个渠道就好了」这个可执行动作，
 * 否则用户只知道这张卡没了。并集取的是 `channelScope` 的合并结果，而不是
 * 「全部渠道减去本笔渠道」—— 后者会把该卡根本没有的渠道也说成可用。
 *
 * 顺序按 `PAYMENT_CHANNELS` 的声明序稳定输出，避免 UI 文案抖动。
 * 类别为 unknown 或全部轨道无 scope（即全渠道适用）时返回空数组，
 * 空数组在 UI 侧意味着「没有可换的具体渠道」，不应被当成「全部渠道」渲染。
 */
export function collectApplicableChannels(card: Card, category: SpendInput['category']): PaymentChannel[] {
  const rule = card.categories[category];
  if (!rule || rule.channelScope === undefined) return [];
  const seen = new Set(rule.channelScope);
  return PAYMENT_CHANNELS.filter((ch) => seen.has(ch));
}

/** 渠道声明的规范顺序，与 types.ts 的联合类型顺序一致 */
const PAYMENT_CHANNELS: PaymentChannel[] = ['physical', 'alipay', 'wechat', 'unionpay_qr', 'apple_pay'];

