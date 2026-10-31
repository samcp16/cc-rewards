/**
 * 第 1 步：定档（Threshold）。
 *
 * 门槛与上限方向相反：门槛是「用得多 → 收益增加」，上限是「用得多 → 收益减少」。
 * 必须先定档再封顶（SPEC §6.2 次序不可调换的理由）：反过来会把用高档的额度错记到低档。
 *
 * 关键词「不可调换」不是风格偏好，是算错属性的分界线。
 *
 * ADR-011 之后本文件的职责被削掉一半：门槛**不再持有费率**，只回答
 * 「本笔是否达标」以及「达标这件事对哪几个类别加多少」。费率永远来自 `categories`。
 */

import type {
  Card,
  CurrencyCode,
  SpendCategory,
  ThresholdBonusTier,
  ThresholdDefinition,
} from '../types';
import type { FxTable } from '../types';
import { convert, describeRate } from '../fx/fxReference';
import { round2 } from '../../lib/money';
import { periodKeyFor } from '../../lib/period';

export interface ThresholdAggregates {
  /** thresholdId -> 周期内已累计金额（threshold.currency 计） */
  spentByThreshold: Record<string, number>;
}

export interface ThresholdOutcome {
  /**
   * 本笔是否达到门槛。无门槛的卡恒 false —— 但达标状态对费率**没有任何影响**
   * （因为 `categoryBindings` 不存在），所以这里的 false 不会被解读成「拿低档」。
   */
  reached: boolean;
  /**
   * 累计型门槛本笔命中的奖励档（`bonusTiers`）；按类别绑定的门槛为 null。
   * 奖励档的 `gain` 是增量，加在 `categories` 之上，不与类别绑定混用。
   */
  bonusTier: ThresholdBonusTier | null;
  definition: ThresholdDefinition | null;
  /** 人可读说明，进「为什么」的 label */
  note?: string;
  /** 跨币种折算说明，UI 必须展示 */
  fxNote?: string;
  /** 累计口径（已含本笔或未含） */
  countedSpend?: number;
}

/**
 * 判断本次消费是否计入该门槛的累计口径。
 *
 * 只回答「本笔金额是否计入周期累计」，从不参与费率决定 —— 这是 ADR-011 对
 * `countsCategories` 被误读为「费率作用域」的正面回应（改名 `accrualCategories`，
 * 字面即语义）。5 张门槛卡的 `'all'` 是正确的：Chill 的「月实体签账满 HK$1,500」
 * 确实由所有类别的签账累积，用餐饮还是超市累积都算。
 */
function accruesToward(definition: ThresholdDefinition, category: SpendCategory): boolean {
  return definition.accrualCategories === 'all' || definition.accrualCategories.includes(category);
}

/**
 * 定档。
 *
 * 多个门槛并存时直接抛错，不静默挑一个：同一笔交易在不同运行顺序下结果不同，
 * 是最难复现的一类缺陷。
 */
export function resolveThreshold(
  card: Pick<Card, 'thresholds'>,
  args: {
    amount: number;
    settlementCurrency: CurrencyCode;
    category: SpendCategory;
    occurredAt: string;
    aggregates: ThresholdAggregates;
    fx: FxTable;
  },
): ThresholdOutcome {
  const defs = card.thresholds ?? [];
  if (defs.length === 0) return { reached: false, bonusTier: null, definition: null };

  if (defs.length > 1) {
    throw new Error(
      `引擎只支持单门槛定档，该卡定义了 ${defs.length} 个门槛（${defs
        .map((d) => d.id)
        .join(', ')}）；请在数据层合并为一个门槛，勿依赖遍历顺序`,
    );
  }

  const definition = defs[0]!;
  const bonusLowest = definition.bonusTiers ? lowestBonusTier(definition.bonusTiers) : null;

  if (!accruesToward(definition, args.category)) {
    // 不计入累计 → 本笔不推进累计，也不可能视为达标。
    // 注意这**不影响费率**：本笔的费率由 categories 决定，与该类别是否计入累计无关。
    return {
      reached: false,
      bonusTier: bonusLowest,
      definition,
      note: '本次类别不计入该门槛累计，按最低档计算',
    };
  }

  // 累计额折算到门槛计价币种（跨币种折算只用于归集，不产生成本项）
  const rawSpent = args.aggregates.spentByThreshold[definition.id] ?? 0;
  const spentInDefCurrency = rawSpent;
  const currentInDefCurrency = convert(args.amount, args.settlementCurrency, definition.currency, args.fx);
  const countedSpend = definition.includeCurrentSpend
    ? spentInDefCurrency + currentInDefCurrency
    : spentInDefCurrency;

  const bonusTier = definition.bonusTiers
    ? pickBonusTier(definition.bonusTiers, countedSpend, definition.id)
    : null;
  const reached = countedSpend >= definition.thresholdAmount;

  const fxNote =
    args.settlementCurrency === definition.currency
      ? undefined
      : describeRate(args.settlementCurrency, definition.currency, args.fx);

  const note = definition.includeCurrentSpend
    ? `门槛累计 ${definition.currency} ${round2(countedSpend)}（含本笔）→ ${reachedLabel(reached)}`
    : `门槛累计 ${definition.currency} ${round2(spentInDefCurrency)}（不含本笔）→ ${reachedLabel(reached)}`;

  // 周期键校验：确保账本归集用的是与当前消费同一周期的记录
  periodKeyFor(definition.period, args.occurredAt);

  return { reached, bonusTier, definition, note, fxNote, countedSpend };
}

/**
 * 取满足 minSpend <= spent 的最高档。
 *
 * 只服务 `bonusTiers`（累计型门槛）。按类别绑定的门槛没有「档位」这个概念 ——
 * 它只有未达标/达标两态，由 binding 是否出现自然表达（ADR-011 §1b + 第四轮勘误：
 * binding 必含 fallback，gain 字段已删除）。
 */
export function pickBonusTier(tiers: ThresholdBonusTier[], spent: number, defId: string): ThresholdBonusTier {
  if (tiers.length === 0) {
    throw new Error(`门槛 ${defId} 没有任何奖励档定义`);
  }
  const sorted = [...tiers].sort((a, b) => a.minSpend - b.minSpend);
  const first = sorted[0]!;
  if (first.minSpend !== 0) {
    // 配置错误：第一档必须从 0 开始。不静默兜底，否则用户永远达不到任何档却看不到问题。
    throw new Error(`门槛 ${defId} 的最低档 minSpend 必须为 0，实际为 ${first.minSpend}`);
  }
  let chosen = first;
  for (const t of sorted) {
    if (t.minSpend <= spent) chosen = t;
    else break;
  }
  return chosen;
}

function lowestBonusTier(tiers: ThresholdBonusTier[]): ThresholdBonusTier | null {
  return [...tiers].sort((a, b) => a.minSpend - b.minSpend)[0] ?? null;
}

function reachedLabel(reached: boolean): string {
  return reached ? '已达门槛' : '未达门槛';
}
