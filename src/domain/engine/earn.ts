/**
 * 第 2 步：毛返现（含排他组处理）。
 *
 * 核心不变量：同 exclusivityGroup 内只取价值最高一条，不同组才相加。
 * 这把「会不会重复计算」从代码里的 if 判断，变成数据里的声明（SPEC §6.4）。
 *
 * 验证用例：Apple Card「Apple Pay 2% / 实体卡 1%」同组 → 只取 2%，不会得出 3%。
 */

import type {
  Card,
  CashbackRates,
  CategoryRule,
  CurrencyCode,
  EarnTrack,
  PaymentChannel,
  SpendCategory,
} from '../types';
import type { ThresholdOutcome } from './thresholds';
import { categoryToTrack, withRateDelta } from './tracks';
import { filterByChannel } from './channelGate';
import { formatPercent2, round2 } from '../../lib/money';

/** 单条候选轨道（组内比较的对象） */
export interface EarnCandidate {
  kind: 'cashback' | 'points';
  exclusivityGroup: string;
  /** 本次取用的费率（cashback）或倍数（points） */
  rate: number;
  /** 计算出的价值，settlementCurrency 计（points 为折算后现金值） */
  value: number;
  /** 尚未封顶的名义价值 */
  preCapValue: number;
  capIds: string[];
  label: string;
  /** 数据缺口标记：points 但无估值 / cashback 但 rates 为 null */
  unknownReason?: 'unknown_rate' | 'no_point_valuation';
  pointProgramId?: string;
  /** 估值依据：confirmed 官方固定兑换率 / estimated 保守下限 / user_provided 用户设定 */
  valuationBasis?: 'confirmed' | 'estimated' | 'user_provided';
  valuationNote?: string;
}

export interface EarnOutcome {
  candidates: EarnCandidate[];
  /** 是否有轨道因为数据缺失而无法估值 */
  hasUnknown: boolean;
  /**
   * 缺口原因。类别本身声明为 unknown 时不会有轨道产生，
   * 因此不能只靠 candidate.unknownReason 反推——那样会得到「有缺口但没说原因」。
   *
   * `channel_gated` 不是「某个轨道估不出值」，而是「整张卡在本笔渠道下的
   * 收益无法确定」：所有轨道的渠道作用域都不覆盖本笔渠道。它连候选轨道都不存在
   * （candidates 为空），因此只出现在 unknownReasons 里。
   *
   * `threshold_tier_incomplete` 已删除（ADR-011）：新模型下费率永远来自
   * `categories`，不存在「档位没有收益声明」这个状态。等价的危险形态
   * （binding 缺 fallback / 未声明 isBaseTierRate: false）在加载期就红灯。
   */
  unknownReasons: UnknownReason[];
}

/**
 * 收益无法确定的原因。两种原因的补救动作不同，UI 必须分别提示：
 * 补类别费率/积分估值 / 换支付渠道。
 */
export type UnknownReason = 'unknown_rate' | 'no_point_valuation' | 'channel_gated';

export interface EarnContext {
  card: Card;
  amount: number;
  settlementCurrency: CurrencyCode;
  category: SpendCategory;
  /** 第 0 步产出的档位（local / foreign） */
  rateSide: 'local' | 'foreign';
  /** 本笔支付渠道：用于筛选轨道（ADR-010），不影响费率档位 */
  channel: PaymentChannel;
  threshold: ThresholdOutcome;
  pointValuations: Record<string, PointValuationLike>;
}

/** 积分估值的最小契约；basis 用于让 UI 如实标注「这是估计值」 */
export interface PointValuationLike {
  valuePerPoint: number | null;
  currency: CurrencyCode;
  basis?: 'confirmed' | 'estimated' | 'user_provided';
  note?: string;
}

/** 从双档费率里取本次该用的那一档；foreign 缺省时沿用 local */
export function pickRate(rates: CashbackRates, side: 'local' | 'foreign'): number {
  if (side === 'local') return rates.local;
  return rates.foreign ?? rates.local;
}

/**
 * 计算毛返现候选。
 *
 * 排他组口径：类别基础费率落在 `base.<category>` 组。
 * 用类别命名而非固定 'base'，是为了让「同卡不同类别的返现」不会被误判为一组——
 * 卡库里 cap.overLimitFallback 声明的 exclusivityGroup: 'base' 与类别轨道
 * 本就属于同一个「基础返现」概念，因此 fallback 轨道也归入 base.<category>。
 *
 * 门槛**不再替换**类别轨道（ADR-011）。三条互斥路径：
 *
 * a. `categoryBindings[category]` 存在：未达标取 `fallback`，达标取 `categories` 原值
 * b. `bonusTiers` 存在：达标档的 `gain` 加在 `categories` 之上（与类别正交）
 * c. 都没有：**完全沿用 `categories`，达标状态对费率零影响**
 *
 * 为什么必须这样：5 张门槛卡的类别声明本身是对的（Chill grocery 0.4%、
 * chill dining 10%），门槛档再抄一份就必然漂移 —— 门控一错，grocery 被算成
 * 5.344%（高估 13 倍），cheers fuel 达标后被算成 4%（高估 10 倍）。费率只有一个
 * 事实来源，引擎才不可能「听错」。
 */
export function computeEarn(ctx: EarnContext): EarnOutcome {
  const { card, category, threshold, rateSide } = ctx;
  const categoryRule: CategoryRule | undefined = card.categories[category];

  if (!categoryRule || categoryRule.kind === 'unknown') {
    return { candidates: [], hasUnknown: true, unknownReasons: ['unknown_rate'] };
  }

  const baseTrack = categoryToTrack(categoryRule, card, category);
  if (!baseTrack) return { candidates: [], hasUnknown: true, unknownReasons: ['unknown_rate'] };

  // 三条互斥路径收敛为「一条轨道」
  const tracks: EarnTrack[] = [applyThresholdDelta(baseTrack, category, threshold)];

  // 渠道筛选（ADR-010）：不在 scope 内的轨道不是「值 0」，是「本笔不适用」。
  // 若按 0 进入排他组，同组会取到 0 值那条，等于告诉用户「这张卡这笔不赚钱」——
  // 而事实是「这张卡这笔的费率我们不知道」。两者的用户动作完全不同（换卡 vs 换渠道）。
  // 全部轨道被挡 → 整卡收益无法确定，进 unranked 由 UI 说明「换哪个渠道就好了」。
  const applicable = filterByChannel(tracks, ctx.channel);
  if (applicable.length === 0) {
    return { candidates: [], hasUnknown: true, unknownReasons: ['channel_gated'] };
  }

  const candidates: EarnCandidate[] = [];
  let hasUnknown = false;
  const unknownReasons: UnknownReason[] = [];

  for (const track of applicable) {
    const c = evaluateTrack(track, { ...ctx, rateSide });
    if (c.unknownReason) {
      hasUnknown = true;
      unknownReasons.push(c.unknownReason);
    }
    candidates.push(c);
  }

  return { candidates, hasUnknown, unknownReasons };
}

/**
 * 把门槛的作用落到类别轨道上。只改未达标侧的费率，不换轨道。
 *
 * 为什么返回「一条轨道」而不是「一组轨道」：门槛的语义是「未达标时降到 fallback」，
 * 它不产生新的排他组、不改变渠道作用域、不新增上限池。任何让门槛产生
 * 第二条轨道的实现，都会重新引入「门槛侧复述费率」或「门槛侧带 capIds」的老问题。
 *
 * ADR-011 第四轮勘误后模型收敛为两态：
 * - `categories[cat].rates` 记达标档（主档）→ 达标时**原样使用 baseTrack**，
 *   不叠加任何增量（原 `gain` 字段全库恒 0，已删除 —— 它的存在会误导下一个
 *   读者以为「达标值 = categories + gain」）
 * - `fallback` 记未达标绝对值 → 未达标时按「绝对值 - 当前值 = 增量」换算
 *
 * 未列入 `categoryBindings` 的类别完全不受门槛影响（路径 c），这是结构保证：
 * 引擎只读 binding，不读别的。
 */
function applyThresholdDelta(
  baseTrack: EarnTrack,
  category: SpendCategory,
  threshold: ThresholdOutcome,
): EarnTrack {
  const definition = threshold.definition;
  if (!definition) return baseTrack;

  // a. 按类别绑定：binding 必含 fallback（加载期强制，见 loadCards.threshold.ts 第 3 条）
  const binding = definition.categoryBindings?.[category];
  if (binding) {
    if (threshold.reached) return baseTrack; // 达标：categories 记的就是达标档
    // 未达标：fallback 是**绝对值**（「官方未达标 4%」），换算成增量作用到轨道
    const target = binding.fallback;
    if (!target) return baseTrack; // 加载期已拒绝该形态，此处仅防御
    const current = rateOf(baseTrack);
    const delta = (target.rate ?? target.multiplierDelta ?? 0) - current;
    return withRateDelta(baseTrack, delta);
  }

  // b. 累计型门槛：bonusTiers 的 gain 加在 categories 之上（增量，DBS 的 multiplierDelta: 1）
  const bonus = threshold.bonusTier?.gain;
  if (bonus) {
    const delta = bonus.rate ?? bonus.multiplierDelta ?? 0;
    return delta === 0 ? baseTrack : withRateDelta(baseTrack, delta);
  }

  // c. 无 binding、无 bonus：达标状态对费率零影响
  return baseTrack;
}

/** 轨道当前的「费率/倍数」标量，只用于把绝对值换算成增量 */
function rateOf(track: EarnTrack): number {
  if (track.kind === 'cashback') return track.rates?.local ?? 0;
  if (track.kind === 'points') return track.multiplier;
  return 0;
}

/**
 * 单轨道估值。
 *
 * cashback：value = amount × rate
 * points：  value = amount × multiplier × valuePerPoint（valuePerPoint 为 null 时无法折算）
 */
export function evaluateTrack(track: EarnTrack, ctx: EarnContext): EarnCandidate {
  const { amount, rateSide } = ctx;

  if (track.kind === 'cashback') {
    if (!track.rates) {
      return blankCandidate(track, 'unknown_rate');
    }
    const rate = pickRate(track.rates, rateSide);
    const value = round2(amount * rate);
    return {
      kind: 'cashback',
      exclusivityGroup: track.exclusivityGroup,
      rate,
      value,
      preCapValue: value,
      capIds: track.capIds,
      label: `返现 ${formatPercent2(rate)}`,
    };
  }

  if (track.kind === 'points') {
    const valuation = ctx.pointValuations[track.pointProgramId];
    if (!valuation || valuation.valuePerPoint === null) {
      return blankCandidate(track, 'no_point_valuation');
    }
    // 积分价值 = 金额 × 倍数 × 每分价值。每分价值以其 own currency 计价，
    // 这里不做币种换算：卡库内所有 pointValuation.currency 与卡币种一致，
    // 出现不一致属于数据错误，直接抛出比静默换算更安全。
    const points = amount * track.multiplier;
    const value = round2(points * valuation.valuePerPoint);
    return {
      kind: 'points',
      exclusivityGroup: track.exclusivityGroup,
      rate: track.multiplier,
      value,
      preCapValue: value,
      capIds: track.capIds,
      label: `积分 ${track.multiplier}x`,
      pointProgramId: track.pointProgramId,
      valuationBasis: valuation.basis,
      valuationNote: valuation.note,
    };
  }

  return blankCandidate(track, 'unknown_rate');
}

function blankCandidate(track: EarnTrack, reason: 'unknown_rate' | 'no_point_valuation'): EarnCandidate {
  return {
    kind: track.kind === 'points' ? 'points' : 'cashback',
    exclusivityGroup: track.exclusivityGroup,
    rate: 0,
    value: 0,
    preCapValue: 0,
    capIds: track.capIds,
    label: reason === 'unknown_rate' ? '费率未知' : '积分估值缺失',
    unknownReason: reason,
    pointProgramId: track.kind === 'points' ? track.pointProgramId : undefined,
  };
}

/**
 * 按排他组收敛：同组取价值最高，不同组相加。
 * 显式 `additive.` 前缀的组全部保留（渠道加成属真叠加）。
 */
export function applyExclusivity(candidates: EarnCandidate[]): EarnCandidate[] {
  const groups = new Map<string, EarnCandidate[]>();
  for (const c of candidates) {
    const list = groups.get(c.exclusivityGroup) ?? [];
    list.push(c);
    groups.set(c.exclusivityGroup, list);
  }

  const chosen: EarnCandidate[] = [];
  for (const [groupKey, list] of groups) {
    if (groupKey.startsWith('additive.')) {
      chosen.push(...list);
      continue;
    }
    // 稳定取最大：值相同时保留先出现的，避免排序抖动
    let best = list[0]!;
    for (const c of list) {
      if (c.value > best.value) best = c;
    }
    chosen.push(best);
  }
  return chosen;
}



