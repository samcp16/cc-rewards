/**
 * 规则层类型 —— 上限／门槛／收益轨道／外币费／渠道费。
 *
 * 从 types.ts 拆出，原因有两条：
 * 1. 单文件 ≤ 300 行（团队代码组织门禁）；
 * 2. 这一组类型描述的是「一张卡的收益规则怎么算」，与「卡是什么」是两个关注点。
 *    改上限口径不该让整份领域契约文件产生 diff。
 *
 * 全部类型由 types.ts 再导出，import 路径不受影响。
 */

import type {
  CardNetwork,
  CurrencyCode,
  IssuerRegion,
  PaymentChannel,
  SourceRef,
  SpendCategory,
  SpendRegion,
} from './types';

// ============================================================
// 返现轨道
// ============================================================

/**
 * 双档费率。港澳卡普遍有「本地币种 / 外币」两档（38 张中 12 张如此）。
 *
 * 为什么必须双档：渣打 Simply Cash 本地 1.5% / 外币 2.0%。港卡在澳门刷 MOP
 * 属外币场景，取 2.0% 得净 +0.05%；若只存单值 1.5% 会得净 −0.45%，方向相反。
 */
export interface CashbackRates {
  /** 本地货币签账（卡币种 == 结算币种且非跨境） */
  local: number;
  /** 外币签账（卡币种 != 结算币种，或跨境）。缺省时沿用 local */
  foreign?: number;
}

export interface EarnTrackBase {
  /** 排他组：同组只取价值最高一条，不同组相加 */
  exclusivityGroup: string;
  capIds: string[];
  /**
   * 本轨道的渠道适用域（ADR-010）。缺省 = 全渠道适用（既有 38 张卡的语义不变）。
   *
   * 语义是「筛选」而非「加成」：声明 `['unionpay_qr','wechat']` 时，本轨道只在
   * 用户选择这两个渠道时进入候选；其余渠道下它连候选都不是，**不会以「取 0 值」
   * 的形态参与排他组比较**。
   *
   * 为什么 0 值是错的：按 0 进入排他组会让同组取到 0 值那条，等于告诉用户
   * 「这张卡这笔不赚钱」，而事实是「这张卡这笔的费率我们不知道」。前者用户会
   * 换卡，后者用户该换渠道 —— 两个完全不同的动作。
   *
   * 已知限制：这是成员判定（白名单），表达不了「除 X 外的所有渠道」，
   * 那种条款需写全枚举。
   */
  channelScope?: PaymentChannel[];
}

export interface CashbackTrack extends EarnTrackBase {
  kind: 'cashback';
  /** null 表示该类别费率未知，禁止按 0 参与排序 */
  rates: CashbackRates | null;
}

export interface PointsTrack extends EarnTrackBase {
  kind: 'points';
  multiplier: number;
  pointProgramId: string;
}

export interface UnknownTrack extends EarnTrackBase {
  kind: 'unknown';
  rates: null;
}

export type EarnTrack = CashbackTrack | PointsTrack | UnknownTrack;

// ============================================================
// 上限与门槛
// ============================================================

/**
 * 上限。period 支持月/年/半年（SPEC §5 + 变更记录：EarnMORE 上限按年计，
 * 卡库实测有 year / half_year 需求）。
 */
export interface CapDefinition {
  id: string;
  categories: SpendCategory[] | 'all';
  limitAmount: number;
  limitCurrency: CurrencyCode;
  period: 'month' | 'year' | 'half_year';
  /**
   * 上限的计量口径。这是「返现上限」与「优惠额度」的根本区别，写错会差一个量级。
   *
   * - `'value'`（默认）：limitAmount 指**返现/回赠金额**上限。
   *   例：中银 Chill「Chill 商户 10% 现金回赠，回赠上限 HK$150」。
   *   官方细则表格原文即「回赠上限(HK$) = $150」，故刷 HK$1,500 拿满 150 后，
   *   后续签账仍享无上限的基础 0.4%（该部分由 fallback 轨道承担）。
   *
   * - `'spend'`：limitAmount 指**可享优惠的消费金额**额度。
   *   例：某卡「每月首 HK$2,000 签账享 5%」。
   *
   * 为什么必须区分：Chill 若按 'spend' 计，2000 MOP 消费只得 22.83；
   * 按官方条款的 'value' 计应为 156.32 —— 相差近 7 倍，推荐结论会完全反向。
   */
  basis?: 'value' | 'spend';
  /** 超额部分按此轨道计收益；缺省则超额部分不计收益 */
  overLimitFallback?: EarnTrack;
}

/**
 * 门槛对某个类别的效果（ADR-011 + 第四轮勘误）。
 *
 * `categories[cat].rates` 记的是**达标档**（主档）。本类型只声明未达标侧：
 * - `fallback.rate`：未达标时的绝对费率（Chill flight 未达标 4%）
 * - `fallback.multiplierDelta`：积分轨道的未达标倍数
 *
 * 达标时直接使用 `categories` 的费率，不叠加任何增量 —— 全库 binding 无一需要
 * 达标侧增量（原 `gain` 字段全库恒 0，已删除，见 ADR-011 Errata 第 1-2 条）。
 * 二选一、不得同时声明（加载期校验）。
 */
export interface ThresholdCategoryBinding {
  /**
   * 未达标时的费率，**必填**。binding 存在即声明「本类别受门槛约束」：
   * 未达标取 `fallback`，达标取 `categories`。缺省即空 binding ——
   * 空 binding 与「不出现」语义等价，后者已存在，不允许第三种表达（加载期红灯）。
   */
  fallback?: { rate?: number; multiplierDelta?: number };
  note?: string;
}

/** 累计型门槛的奖励档：达标后整卡增益，与类别无关（DBS 里程翻倍属此类） */
export interface ThresholdBonusTier {
  /** 达成本档所需的周期内累计消费额（含本笔视 includeCurrentSpend） */
  minSpend: number;
  /** **增量**，不是绝对值：`multiplierDelta: 1` 表示 categories 的倍数 +1 */
  gain: { multiplierDelta?: number; rate?: number };
  note?: string;
}

/**
 * 门槛只回答「本笔是否达标」，`categories` 独自决定费率与上限（ADR-011）。
 *
 * 禁止让门槛复述类别费率：任何「门槛里再写一份 0.4% / 10%」的方案都会在
 * 数据漂移时静默算错（这是 B1 → N1 的共同根因）。门槛只持有增量。
 */
export interface ThresholdDefinition {
  id: string;
  /**
   * **累计口径**：本笔是否计入该门槛的周期累计。与费率无关，
   * 不是「哪些类别享受升档」。5 张门槛卡全为 `'all'` 是正确的 ——
   * Chill 的「月实体签账满 HK$1,500」确实由所有类别的签账累积。
   */
  accrualCategories: SpendCategory[] | 'all';
  includeCurrentSpend: boolean;
  period: 'month' | 'year' | 'half_year';
  currency: CurrencyCode;
  /**
   * 达标线（周期内累计额，`currency` 计）。
   *
   * 为什么它必须存在：ADR-011 §1b 删掉 `ThresholdTier` 时，`minSpend` 作为
   * 「档位下限」被删除了 —— 但**门槛的达标线本身不是档位**。按类别绑定的门槛
   * 只有「未达标 / 达标」两态，两态的门槛值仍需一个数字，否则引擎无法判断
   * 「本笔是否达标」（ADR-011 §2 第 1-2 步的前提）。
   *
   * 从被删的 `tiers` 中取第一个 > 0 的档位下限迁移而来，数值一个不改：
   * chill 1500 / cheers 5000 / bea 4000 / wewa 1500 / dbs 20000。
   * 累计型门槛（`bonusTiers`）的达标线由各档 `minSpend` 表达，本字段仍填
   * 其中「最高档」的达标线，供跨类型比较与 UI 说明使用；判定档位时以
   * `bonusTiers` 为准。
   */
  thresholdAmount: number;
  /**
   * 按类别绑定：哪些类别在本门槛达标后升档，升多少。
   * 未列入映射的类别 = 不受本门槛约束，费率恒取 `categories`（不受达标状态影响）。
   */
  categoryBindings?: Partial<Record<SpendCategory, ThresholdCategoryBinding>>;
  /** 累计型门槛的奖励档（与 `categoryBindings` 互斥，加载期校验） */
  bonusTiers?: ThresholdBonusTier[];
  note?: string;
  source?: SourceRef;
}

// ============================================================
// 外币手续费与渠道费
// ============================================================

export interface FxFeeRule {
  rate: number;
  /**
   * 分项费率：BCM 是唯一将「外币」与「跨域」分开收费的机构。
   * 存在时按「跨境」「换币」两个正交事实组合取值（ADR-012），不按 route 反推。
   *
   * 官方收费表口径：「外币交易 0.5% / 跨域交易 1.0% / **最多合共收取 1.5%**」。
   * 第三列是封顶，不是「两项必收」——两项是否各收取决于交易是否真的同时
   * 满足「跨境」与「换币」两个事实：
   * - 跨境 + 换币 = `crossBorder` + `crossCurrencyComponent`（1% + 0.5% = 1.5%，恰为封顶）
   * - 仅跨境 = `crossBorder`（1%）
   * - 仅换币 = `crossCurrencyComponent`（0.5%）
   *
   * `foreign` 是旧数据形态的单值「外币成本」，未声明成分拆分的卡沿用
   * `foreign ?? rate`，不受布尔组合影响。
   */
  splitRates?: {
    foreign?: number;
    crossBorder?: number;
    crossCurrencyComponent?: number;
  };
  fixedFee: number;
  waivedWhen?: {
    settlementCurrencyIn?: CurrencyCode[];
    regions?: SpendRegion[];
    /** ISO date；过期后豁免失效（AC-F6-04） */
    validUntil?: string;
  };
  /**
   * 发卡地区与卡组织。用于豁免过期后回落到默认费率表。
   * 由 loadCards 在加载时从卡的 issuerRegion / network 注入，
   * 避免在每处调用点各自传一遍（传漏一次就会静默按 0 计）。
   */
  currencyRegion?: IssuerRegion;
  currencyNetwork?: CardNetwork;
  source: SourceRef;
}

export interface ChannelFeeTier {
  fromAmount: number;
  /** null = 无上限 */
  toAmount: number | null;
  rate: number;
  fixedFee: number;
}

export interface ChannelFeeRule {
  id: string;
  channel: PaymentChannel;
  networkIn?: CardNetwork[];
  issuerRegionIn?: IssuerRegion[];
  monthlyFreeAllowance?: { amount: number; currency: CurrencyCode };
  tiers: ChannelFeeTier[];
  source: SourceRef;
}

