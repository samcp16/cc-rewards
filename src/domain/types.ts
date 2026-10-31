/**
 * 领域类型 —— 唯一事实来源，对应 SPEC §5。
 *
 * 本文件只放类型，不放任何运行时代码，以便前端组件与引擎共享同一份契约。
 * 任何字段改动必须先改 docs/SPEC.md，再改这里（spec-as-contract）。
 *
 * 规则层（上限／门槛／收益轨道／外币费／渠道费）已拆到 types.rules.ts，
 * 在本文件末尾再导出，所以所有 `from '../domain/types'` 的 import 都不受影响。
 */

// ============================================================
// 基础枚举（SPEC §5 锁定）
// ============================================================

export type CurrencyCode = 'MOP' | 'HKD' | 'CNY';

/** 已移除 'US'，见 SPEC §0 范围变更记录 */
export type IssuerRegion = 'MO' | 'HK';

export type CardNetwork = 'visa' | 'mastercard' | 'unionpay' | 'amex' | 'jcb';

export type SpendCategory =
  | 'dining'
  | 'grocery'
  | 'fuel'
  | 'flight'
  | 'hotel'
  | 'online'
  | 'other';

export type PaymentChannel =
  | 'physical'
  | 'alipay'
  | 'wechat'
  | 'unionpay_qr'
  | 'apple_pay';

export type SpendRegion = 'MO' | 'CN';

/**
 * 结算路由（引擎第 0 步产物）。
 *
 * - local:       卡币种 == 结算币种，且非跨境
 * - foreign:     卡币种 != 结算币种（含跨境且币种不同）
 * - crossBorder: 跨境但币种相同（如 HKD 卡在澳门以 HKD 结算）
 */
export type SettlementRoute = 'local' | 'foreign' | 'crossBorder';

// ============================================================
// 溯源与时效
// ============================================================

export interface SourceRef {
  url: string;
  /** ISO 8601 */
  verifiedAt: string;
  note?: string;
}

export type ValidityState =
  | { state: 'permanent' }
  | { state: 'active'; validUntil: string; daysLeft: number }
  | { state: 'expiring_soon'; validUntil: string; daysLeft: number }
  | { state: 'expired'; validUntil: string };

// ============================================================
// 卡
// ============================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown' | 'user_provided';

export interface AnnualFee {
  amount: number;
  currency: CurrencyCode;
  waiverNote?: string;
}

export interface PointValuation {
  programId: string;
  /** null = 无官方固定值（里数类），引擎不得据此算出精确现金价值 */
  valuePerPoint: number | null;
  currency: CurrencyCode;
  derivation: string;
  source?: SourceRef;
}

/** 卡库原始卡（预置数据 + 用户自建共用同一结构） */
export interface Card {
  cardId: string;
  issuer: string;
  issuerRegion: IssuerRegion;
  cardName: string;
  network: CardNetwork;
  cardCurrency: CurrencyCode;
  annualFee: AnnualFee;
  fxFee: FxFeeRule;
  categories: Record<SpendCategory, CategoryRule>;
  caps: CapDefinition[];
  capsNote?: string;
  thresholds: ThresholdDefinition[];
  pointsValuation: PointValuation | null;
  source: SourceRef[];
  /** ISO date */
  verifiedAt: string;
  confidence: ConfidenceLevel;
  notes?: string;
  /** 用户手动停用；停用卡不参与排序 */
  active?: boolean;
}

export interface CategoryRule {
  kind: 'cashback' | 'points' | 'unknown';
  /** cashback 用 */
  rates?: CashbackRates | null;
  /** points 用 */
  multiplier?: number;
  pointProgramId?: string;
  /**
   * 渠道适用域（ADR-010）。此处是「数据文件里的输入形态」，
   * `categoryToTrack` 原样透传到 `EarnTrack.channelScope`（引擎消费的中间表示）。
   * 语义与校验规则见 `EarnTrackBase.channelScope` 与 `loadCards.validateChannelScope`。
   */
  channelScope?: PaymentChannel[];
  /**
   * 本类别占用的上限池（ADR-011 §1c）。显式声明优先（含显式空数组 =
   * 「本类别不受任何上限约束」），未声明时按 `cap.categories` 覆盖关系推断。
   *
   * 为什么需要它：`cap.categories: 'all'` 的上限（Chill 的 HK$150）按推断会
   * 覆盖 grocery，但官方条款里 grocery 的 0.4% 不受该上限约束。推断只能保守，
   * 数据必须能纠正。
   */
  capIds?: string[];
  /**
   * `rates` 存的是否是**基础档 / 无门槛档**的费率（缺省 `true`）。
   *
   * 只用于加载期校验，**不参与计算**：计算永远是「未达标取 `fallback`，
   * 达标取 `categories + gain`」，与这个标志无关。
   *
   * 标志的唯一作用，是让「哪一侧是主档」这件事无法被省略 —— 某类别的 `rates`
   * 存的是达标档（Chill flight 的 5%）时必须写 `false`，此时门槛 binding
   * 的 `fallback` 变成必填，否则「未达标笔沿用达标值」会被静默算成高估。
   */
  isBaseTierRate?: boolean;
  note?: string;
}

// ============================================================
// 引擎输入
// ============================================================

export interface SpendInput {
  /** 消费金额，以 settlementCurrency 计 */
  amount: number;
  settlementCurrency: CurrencyCode;
  category: SpendCategory;
  channel: PaymentChannel;
  /** 商户注册地 */
  region: SpendRegion;
  /** ISO 8601，缺省为今天 */
  occurredAt?: string;
}

/** 账本条目（SPEC §5 + ARCHITECTURE §12.6） */
export interface LedgerEntry {
  id: string;
  cardId: string;
  occurredAt: string;
  /** 'YYYY-MM' */
  periodKey: string;
  /** 'YYYY-Qn' */
  quarterKey: string;
  /** 'YYYY' —— 年度上限归集用，随 period: 'year' 引入 */
  yearKey: string;
  /** 'YYYY-H1' | 'YYYY-H2' —— 半年上限归集用 */
  halfYearKey: string;
  amount: number;
  currency: CurrencyCode;
  category: SpendCategory;
  channel: PaymentChannel;
  capConsumption: Record<string, number>;
  thresholdContribution: Record<string, number>;
  channelFreeConsumption: Record<string, number>;
  earnedCashback: number;
  earnedPoints: number;
  note?: string;
  createdAt: string;
}

export type { FxRate, FxTable, EngineParams } from './types.params';

// 规则层：定义在本文件之外，此处再导出以保证契约的单一入口
export type {
  CashbackRates,
  EarnTrackBase,
  CashbackTrack,
  PointsTrack,
  UnknownTrack,
  EarnTrack,
  CapDefinition,
  ThresholdCategoryBinding,
  ThresholdBonusTier,
  ThresholdDefinition,
  FxFeeRule,
  ChannelFeeTier,
  ChannelFeeRule,
} from './types.rules';

// 本文件内的 Card / CategoryRule 需要引用规则层类型
import type {
  CashbackRates,
  CapDefinition,
  FxFeeRule,
  ThresholdDefinition,
} from './types.rules';
