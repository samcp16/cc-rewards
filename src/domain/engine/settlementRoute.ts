/**
 * 第 0 步：结算路由判定。
 *
 * 为什么必须最先执行且只执行一次（SPEC §6.2 新增步骤的理由）：
 * 返现档位与外币手续费费率**依赖同一个判定**。若两处各判一次，就会出现
 * 「返现按外币档、手续费按本地档」的内部矛盾，而这种矛盾在结果里看不出来。
 */

import type {
  Card,
  CardNetwork,
  CurrencyCode,
  IssuerRegion,
  SettlementRoute,
  SpendRegion,
} from '../types';

/**
 * 银联双币卡：官方明文「以澳门币计算的款项手续费豁免」，故在港澳 / 内地场景
 * 视同本地处理（SPEC §6.2.1 表格注）。
 */
const DUAL_CURRENCY_NETWORKS: ReadonlySet<CardNetwork> = new Set<CardNetwork>(['unionpay']);

/** 双币卡按 local 处理的结算币种集合 */
const DUAL_CURRENCY_LOCAL_SCOPE: ReadonlySet<CurrencyCode> = new Set<CurrencyCode>(['MOP', 'HKD', 'CNY']);

/**
 * 判定是否跨境：商户注册地 vs **卡的发卡地区**。
 *
 * 口径（SPEC §5 注：不由用户判断币种档位，但商户地是用户唯一能确定的输入）：
 * 香港发行的卡在香港本地商户刷卡 → 非跨境；
 * 香港发行的卡在澳门 / 内地商户刷卡 → 跨境。
 *
 * 这里刻意不看结算币种：澳门商户完全可以用 HKD 结算（港币在澳门流通），
 * 那笔交易仍然是跨境交易，Amex 的跨境港币交易费条款正是为此而设。
 * 用结算币种推断地域会在「澳门商户、HKD 结算」这个真实场景上判错。
 */
function isCrossBorder(issuerRegion: IssuerRegion, region: SpendRegion): boolean {
  return issuerRegion !== region;
}

export interface RouteDecision {
  route: SettlementRoute;
  /** 返现取哪一档 */
  rateSide: 'local' | 'foreign';
  /**
   * 银联双币卡在港澳 / 内地币种下按 local 处理的标记。
   * FTF 豁免判定需要它，但不是独立的路由判定。
   */
  dualCurrencyLocal: boolean;
  /**
   * 生效事实（ADR-012）：本笔是否换币（卡币种 ≠ 结算币种）。
   * `route` 是档位与展示用的枚举，这两个布尔才是手续费成分的计算依据 ——
   * 单值枚举会把「只换币」与「换币 + 跨境」压扁成同一个 `foreign`，
   * 信息在路由判定那一刻就丢了，这是 BCM 澳门本地 HKD 结算被多收 1% 的根因。
   */
  crossCurrency: boolean;
  /** 生效事实（ADR-012）：本笔是否跨境（发卡地区 ≠ 商户地区） */
  crossBorder: boolean;
}

/**
 * 判定结算路由。
 *
 * 判定顺序（短路，先命中先返回）：
 * 1. 双币卡 + 结算币种在豁免范围 → local（官方条款优先于通用规则）
 * 2. 卡币种 != 结算币种 → foreign
 * 3. 卡币种 == 结算币种 且 跨境 → crossBorder
 * 4. 其余 → local
 */
export function resolveSettlementRoute(
  card: Pick<Card, 'cardCurrency' | 'network' | 'issuerRegion'>,
  settlementCurrency: CurrencyCode,
  region: SpendRegion,
): RouteDecision {
  const dualCurrencyLocal =
    DUAL_CURRENCY_NETWORKS.has(card.network) && DUAL_CURRENCY_LOCAL_SCOPE.has(settlementCurrency);

  const crossCurrency = card.cardCurrency !== settlementCurrency;
  const crossBorder = isCrossBorder(card.issuerRegion, region);

  if (dualCurrencyLocal) {
    // 官方豁免条款优先（ADR-012）：双币卡视同 local，两个生效事实一并归零
    return { route: 'local', rateSide: 'local', dualCurrencyLocal: true, crossCurrency: false, crossBorder: false };
  }

  if (crossCurrency) {
    // 换币（含「换币 + 跨境」）：route 用 foreign 表达档位，成分由布尔组合决定
    return { route: 'foreign', rateSide: 'foreign', dualCurrencyLocal: false, crossCurrency, crossBorder };
  }

  if (crossBorder) {
    // 跨境但币种相同：返现仍取外币档（SPEC §6.2.1：HKD 卡在澳门以 HKD 结算 → 返现取 foreign）
    return { route: 'crossBorder', rateSide: 'foreign', dualCurrencyLocal: false, crossCurrency, crossBorder };
  }

  return { route: 'local', rateSide: 'local', dualCurrencyLocal: false, crossCurrency: false, crossBorder: false };
}

/**
 * 反向断言：路由、档位与两个生效事实必须自洽。引擎在关键节点调用它，
 * 让「返现取 local 但手续费取 foreign」这类矛盾在运行时立刻暴露而不是静默算错。
 *
 * ADR-012 新增两条不变量：
 * - 两布尔皆 false 当且仅当 route === 'local'
 * - crossCurrency === true 当且仅当 route === 'foreign'
 * `rateSide` 的取值逻辑一行不改（ADR-012 Alternatives 问题 1）。
 */
export function assertRouteConsistency(decision: RouteDecision): void {
  const expectedSide = decision.route === 'local' ? 'local' : 'foreign';
  if (decision.rateSide !== expectedSide) {
    throw new Error(
      `结算路由自相矛盾：route=${decision.route} 却取了 ${decision.rateSide} 档费率`,
    );
  }
  const bothFalse = !decision.crossCurrency && !decision.crossBorder;
  if (bothFalse !== (decision.route === 'local')) {
    throw new Error(
      `结算路由自相矛盾：route=${decision.route} 但 crossCurrency=${decision.crossCurrency} / crossBorder=${decision.crossBorder}`,
    );
  }
  if (decision.crossCurrency !== (decision.route === 'foreign')) {
    throw new Error(
      `结算路由自相矛盾：route=${decision.route} 但 crossCurrency=${decision.crossCurrency}`,
    );
  }
}
