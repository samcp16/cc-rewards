/**
 * 外币手续费解析。
 *
 * 三件事必须在这里一次做对：
 * 1. 取哪个费率 —— 由第 0 步的结算路由决定，不自己再判一次币种
 * 2. 是否豁免 —— 豁免有生效期，过期的豁免必须失效（AC-F6-04）
 * 3. 分项费率 —— BCM 分开收「外币 0.5% + 跨域 1.0%」，splitRates 优先于 rate
 */

import type { CurrencyCode, FxFeeRule, SettlementRoute, SpendRegion, ValidityState } from '../types';
import { daysBetween, toDateKey } from '../../lib/period';
import { getDefaultFx } from './defaultFxTable';
import { formatPercent2 } from '../../lib/money';

export interface FxResolution {
  /** 本次适用的百分比费率，0 表示豁免 */
  rate: number;
  fixedFee: number;
  exempt: boolean;
  /** 豁免依据说明，UI 展示用 */
  waiverNote?: string;
  /** 豁免（或规则）的时效状态 */
  validity: ValidityState;
  sourceUrl: string;
  verifiedAt: string;
}

/** 豁免到期前多少天进入「即将到期」（SPEC §5：提前 60 天警示） */
const EXPIRING_SOON_DAYS = 60;

/**
 * 计算 valifeUntil 的时效状态。
 * 两个时间阈值不得混用：这里是 validUntil（优惠何时到期，提前 60 天），
 * 不是 stale_rate（数据多久没核对，90 天）。
 */
export function resolveValidity(validUntil: string | undefined, today: string): ValidityState {
  if (!validUntil) return { state: 'permanent' };
  const daysLeft = daysBetween(validUntil, toDateKey(today));
  if (daysLeft < 0) return { state: 'expired', validUntil };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { state: 'expiring_soon', validUntil, daysLeft };
  return { state: 'active', validUntil, daysLeft };
}

export interface FxFeeInput {
  route: SettlementRoute;
  settlementCurrency: CurrencyCode;
  region: SpendRegion;
  today: string;
  /**
   * 双币卡在港澳 / 内地币种下按 local 处理。这是第 0 步的产物，必须传进来：
   * 它决定了豁免说明该写「官方双币条款」还是笼统的「本币结算」。
   */
  dualCurrencyLocal: boolean;
  /** 生效事实（ADR-012）：本笔是否换币。成分选择的依据，不再从 route 反推 */
  crossCurrency: boolean;
  /** 生效事实（ADR-012）：本笔是否跨境 */
  crossBorder: boolean;
}

/**
 * 解析本笔交易的外币手续费。
 *
 * 路由 → 费率的映射（ADR-012：splitRates 按「跨境」「换币」两个正交事实组合，
 * 官方口径「外币 0.5% / 跨域 1% / 最多合共 1.5%」的第三列是**封顶**，不是两项必收）：
 *
 * - 两布尔皆否：0，不适用外币手续费（local 路径早退）
 * - 跨境 + 换币 = `crossBorder` + `crossCurrencyComponent`（两项之和，天然 ≤ 1.5% 封顶）
 * - 仅跨境（币种相同）= `crossBorder`
 * - 仅换币（不跨境）= `crossCurrencyComponent`
 *
 * 修复前的错误（QA B3'）：`foreign` 路由无条件加上跨境费，澳门本地 HKD 结算
 * （只换币不跨境）被收 1.5%，官方 0.5%，高估 3 倍 —— `route` 单值枚举把
 * 「只换币」与「换币 + 跨境」压扁成同一个值，成分选择必须改用布尔组合。
 *
 * 字段语义（不可互换）：
 * - `splitRates.crossBorder` = 跨境服务费，只要跨境就收，与本币/外币无关
 * - `splitRates.crossCurrencyComponent` = 跨货币服务费，只要换了币种就收
 * - `splitRates.foreign` = 旧数据形态的单值「外币成本」，未声明成分拆分的卡沿用
 *
 * 只声明单值 `foreign` 的旧数据形态不受影响：未声明 `crossCurrencyComponent`
 * 的卡在任何换币组合下都退回 `foreign ?? rate`（它已含全部外币成本）。
 *
 * @param input.route 第 0 步产出的结算路由（档位与展示用）；成分选择看两个布尔
 */
export function resolveFxFee(fxFee: FxFeeRule, input: FxFeeInput): FxResolution {
  const { route, settlementCurrency, region, today, dualCurrencyLocal, crossCurrency, crossBorder } = input;
  const validity = resolveValidity(fxFee.waivedWhen?.validUntil, today);

  // --- 费率选择：splitRates 按「跨境」「换币」两个正交事实组合（ADR-012） ---
  let rate = fxFee.rate;
  if (fxFee.splitRates) {
    const { foreign, crossBorder: crossBorderRate, crossCurrencyComponent } = fxFee.splitRates;
    if (crossCurrency && crossBorder) {
      // 换币 + 跨境：两项都收（0.01 + 0.005 = 1.5%，恰为官方封顶值，无需额外 max）
      rate = crossCurrencyComponent !== undefined
        ? (crossBorderRate ?? 0) + crossCurrencyComponent
        : (foreign ?? fxFee.rate); // 旧数据形态：单值 foreign 已含全部外币成本
    } else if (crossCurrency) {
      // 只换币（不跨境）：只收跨货币成分，不收跨境费（B3' 的正面修复）
      rate = crossCurrencyComponent ?? foreign ?? fxFee.rate;
    } else if (crossBorder) {
      // 只跨境（币种相同）：只收跨境成分
      rate = crossBorderRate ?? foreign ?? fxFee.rate;
    }
    // 两布尔皆否 → local 路径早退，splitRates 不参与
  }

  const base: FxResolution = {
    rate,
    fixedFee: fxFee.fixedFee,
    exempt: rate === 0 && fxFee.fixedFee === 0,
    validity,
    sourceUrl: fxFee.source.url,
    verifiedAt: fxFee.source.verifiedAt,
  };

  // 本币结算（含双币卡视同本地）：不适用外币手续费。
  //
  // 早退保护（ADR-011 决策 1）：splitRates 存在时，「local 即免」必须有一个
  // 可陈述的依据，否则就是绕过 splitRates 的第二次判断。当前允许的两条依据：
  // 1. 双币卡官方条款「以该币种计算的款项豁免」→ dualCurrencyLocal
  // 2. 卡没有任何 waivedWhen 声明（即 local 就是「没有外币成分」，不是「豁免」）
  // 其余情况（如「有 waivedWhen 但本币不在豁免列表」）必须报错：静默返回 0
  // 等于把一条本该收的跨境费吃成 0，正是 B3 的形态。
  if (route === 'local') {
    if (fxFee.splitRates && !dualCurrencyLocal && fxFee.waivedWhen !== undefined) {
      throw new Error(
        `外币费规则存在 splitRates 但 local 路由缺少明确豁免依据：卡对 ${settlementCurrency} 既未声明双币豁免（dualCurrencyLocal），` +
          `waivedWhen 又未覆盖该币种。静默按 0 计会把跨境费吃成 0，请在数据层移除多余的 waivedWhen 或补齐豁免声明`,
      );
    }
    return {
      ...base,
      rate: 0,
      fixedFee: 0,
      exempt: true,
      waiverNote: dualCurrencyLocal
        ? '银联双币卡：官方条款规定以该币种计算的款项豁免跨境交易手续费'
        : '本币结算，不适用外币手续费',
    };
  }

  const waive = fxFee.waivedWhen;
  if (!waive) return base;

  // 豁免生效的三个条件必须同时满足，缺一不可
  const currencyOk = waive.settlementCurrencyIn
    ? waive.settlementCurrencyIn.includes(settlementCurrency)
    : true;
  const regionOk = waive.regions ? waive.regions.includes(region) : true;

  if (!(currencyOk && regionOk)) return base;

  if (validity.state === 'expired') {
    // AC-F6-04：优惠已过期 → 豁免判定失效。
    // 不能直接沿用本卡的 fxFee.rate：立桥那类卡的 rate 本身就是推广期内的 0%，
    // 过期后它同样不再成立，继续按 0 计等于把「已失效的优惠」当成现状。
    // 正确做法是回落到费率默认值表（issuerRegion + network 二维），并提示用户核对条款。
    const fallbackRate =
      fxFee.currencyRegion && fxFee.currencyNetwork
        ? (getDefaultFx(fxFee.currencyRegion, fxFee.currencyNetwork) ?? fxFee.rate)
        : fxFee.rate;
    return {
      ...base,
      rate: fallbackRate,
      fixedFee: fxFee.fixedFee,
      exempt: fallbackRate === 0 && fxFee.fixedFee === 0,
      waiverNote:
        `豁免已于 ${validity.validUntil} 到期，按发卡地区与卡组织默认费率 ` +
        `${formatPercent2(fallbackRate)} 计算，请核对最新条款`,
    };
  }

  return {
    ...base,
    rate: 0,
    fixedFee: 0,
    exempt: true,
    waiverNote: fxFee.source.note ?? '本卡对该结算币种豁免外币手续费',
  };
}
