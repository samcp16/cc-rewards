/**
 * 类别规则 -> 收益轨道。
 *
 * 单独成文件的原因：契约映射（categoryRule → EarnTrack）被 earn.ts 与
 * evaluateCard.ts 共用，放在任一处的内部会产生循环依赖。
 *
 * 这里必须回答一个数据现实：卡库里有大量 caps / thresholds 声明「这个类别有
 * 高额返现」，但类别条目本身只写了基础费率，轨道上没挂 capIds。若照抄数据，
 * 上限永远不会生效，Chill 这类卡会被高估 45%（SPEC §6.5 的原问题）。
 *
 * 数据迁移手册：docs/DECISIONS-data-cap-binding.md。
 */

import type { CapDefinition, Card, CategoryRule, EarnTrack, EarnTrackBase, SpendCategory } from '../types';

export interface TrackBinding {
  capIds: string[];
  /** 数据层未显式绑定，由类别守卫补挂；UI 应据此标注数据待核对 */
  inferred: boolean;
}

/**
 * 上限是否覆盖该类别。
 * `categories: 'all'` 或列表含该类别即为覆盖。
 */
export function capCoversCategory(cap: CapDefinition, category: SpendCategory): boolean {
  return cap.categories === 'all' || cap.categories.includes(category);
}

/**
 * 为类别轨道推导上限绑定（ADR-011 §1c）。
 *
 * 优先级：
 * 1. `CategoryRule.capIds` 显式声明 —— **含显式空数组**。空数组的含义是
 *    「本类别不受任何上限约束」，必须与「未声明」区分：Chill 的 grocery 恒 0.4%，
 *    官方条款里它不消耗 HK$150 的额外回赠上限；但 `cap.categories: 'all'` 按推断
 *    会把它算进去。推断只能保守（宁低估不高估），数据必须能纠正。
 * 2. 未声明时，挂上所有覆盖该类别的上限池（保守方向：宁可低估收益，
 *    也不让用户刷一张实际已超额的卡）。
 *
 * 门槛不参与上限绑定（ADR-011 Errata 第 3 条）：`withRateDelta` 一律只改
 * `rates` / `multiplier`，永不引入类别层没有的上限池；上限绑定单源决定于
 * `categories.capIds`（显式，含空数组）与 `cap.categories` 推断。
 */
export function bindCapsForCategory(card: Card, category: SpendCategory): TrackBinding {
  const explicit = card.categories[category]?.capIds;
  if (explicit !== undefined) {
    return { capIds: explicit, inferred: false };
  }
  const covering = card.caps.filter((c) => capCoversCategory(c, category)).map((c) => c.id);
  return { capIds: covering, inferred: covering.length > 0 };
}

function withGroup(base: EarnTrackBase, category: SpendCategory): EarnTrackBase {
  return { ...base, exclusivityGroup: `base.${category}` };
}

/**
 * 类别规则 -> 轨道。unknown 类别返回 null，由调用方标记为不可排序。
 *
 * `channelScope` 原样透传（ADR-010）：它是「轨道的渠道适用域」，在 `CategoryRule`
 * 与 `EarnTrack` 上语义完全相同，因此映射层不需要任何解释逻辑 —— 这也是选在
 * `EarnTrack` 而非 `CategoryRule` 上建模的连带收益（见 ADR-010 方案 F）。
 */
export function categoryToTrack(
  rule: CategoryRule,
  card: Card,
  category: SpendCategory,
): EarnTrack | null {
  const binding = bindCapsForCategory(card, category);
  const scope = rule.channelScope === undefined ? {} : { channelScope: rule.channelScope };

  if (rule.kind === 'cashback') {
    return {
      kind: 'cashback',
      rates: rule.rates ?? null,
      ...withGroup({ capIds: binding.capIds, exclusivityGroup: '' }, category),
      ...scope,
    };
  }
  if (rule.kind === 'points') {
    return {
      kind: 'points',
      multiplier: rule.multiplier ?? 1,
      pointProgramId: rule.pointProgramId ?? '',
      ...withGroup({ capIds: binding.capIds, exclusivityGroup: '' }, category),
      ...scope,
    };
  }
  return null;
}

/**
 * 把「费率增量」作用到类别轨道上（ADR-011 §2）。
 *
 * 为什么不在这里判断达标：`delta` 由 earn.ts 按「未达标取 fallback / 达标取 gain」
 * 解析好再传进来。本函数只做一件事 —— 在 `baseTrack` 之上加一个数，
 * 并**保留** `baseTrack` 的排他组、渠道作用域与上限绑定。
 *
 * 两条容易写错的地方：
 *
 * 1. **上限绑定不重新推导。** 达标后仍用 `baseTrack.capIds`（即 `categories` 层
 *    的绑定）。早期实现让门槛档的 `earn` 自己带 `capIds`，于是 grocery 这种
 *    「不挂上限」的类别被错误消耗了 Chill 的 extra 池（N1 连带污染）。
 *    现在的规则是：门槛只能「不参与」上限，不能「新增」上限。
 * 2. **渠道作用域要跟着走。** 轨道可能在 `physical` 下被挡（ADR-010），
 *    增量轨道若丢了 scope，就会凭空出现在不适用该渠道的候选中。
 */
export function withRateDelta(baseTrack: EarnTrack, delta: number): EarnTrack {
  if (baseTrack.kind === 'cashback') {
    if (!baseTrack.rates) return baseTrack;
    const rates = { ...baseTrack.rates, local: baseTrack.rates.local + delta };
    if (baseTrack.rates.foreign !== undefined) rates.foreign = baseTrack.rates.foreign + delta;
    return { ...baseTrack, rates };
  }
  if (baseTrack.kind === 'points') {
    return { ...baseTrack, multiplier: baseTrack.multiplier + delta };
  }
  return baseTrack;
}
