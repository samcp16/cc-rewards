/**
 * 引擎输出类型。
 *
 * 与输入类型分开：输入是「用户填了什么」，输出是「算出了什么 + 为什么」。
 * 前端只消费这里，不重复计算（避免双份真相）。
 */

import type {
  CurrencyCode,
  Card,
  SpendCategory,
  SettlementRoute,
  ValidityState,
  PaymentChannel,
} from './types';

/**
 * 「为什么」的单项。
 *
 * kind 里刻意没有 cap/换算项：跨币种折算**不出现在成本项**（SPEC §6.5 第 4 条），
 * 它不是成本而是单位换算，只能通过 fxNote 附带说明。
 */
export interface BreakdownItem {
  label: string;
  /** 对净额的贡献，支出为负 */
  amount: number;
  currency: CurrencyCode;
  kind: 'cashback' | 'points' | 'fx_fee' | 'channel_fee';
  /** 数据来源链接，AC-F4-02 要求逐项标注 */
  sourceUrl?: string;
  verifiedAt?: string;
  /** 因上限被削减的金额（>0 表示打了折扣） */
  cappedBy?: number;
  /** 该金额的原文说明，如「已封顶：本月剩余 HK$150」 */
  detail?: string;
}

export type SchemeWarning =
  | { code: 'dcc_risk' }
  | { code: 'cap_nearly_exhausted'; capId: string; remaining: number; currency: CurrencyCode }
  | { code: 'cap_exhausted'; capId: string }
  | { code: 'stale_rate'; verifiedAt: string }
  | { code: 'fx_fee_exempt_expired'; validUntil: string }
  | { code: 'fx_fee_exempt_expiring'; validUntil: string; daysLeft: number }
  | { code: 'cap_cross_currency_converted'; capId: string; from: CurrencyCode; to: CurrencyCode; rate: number }
  | { code: 'unknown_rate'; category: SpendCategory }
  | { code: 'no_point_valuation'; programId: string }
  /**
   * 本笔支付渠道不在该卡该类别的任何轨道作用域内 —— 收益算不出来，整卡不参与排序。
   * 与 unknown_rate 分开：前者去换支付渠道（`applicableChannels` 告诉用户换成哪个），
   * 后者去补类别费率。两者的用户动作完全不同，不能混为一谈。
   *
   * 注：`threshold_tier_incomplete` 已随 ADR-011 删除 —— 新模型下费率永远来自
   * `categories`，不存在「档位没有收益声明」这个状态；等价的危险形态
   * （binding 有 gain 无 fallback 而 categories 记的是达标档）在加载期红灯。
   */
  | {
      code: 'channel_gated';
      category: SpendCategory;
      channel: PaymentChannel;
      /** 该卡此类别可用的渠道并集，用于 UI 文案「仅在 X / Y / Z 渠道适用」 */
      applicableChannels: PaymentChannel[];
    }
  | { code: 'point_valuation_estimated'; programId: string; note: string }
  | { code: 'low_confidence'; confidence: string };

/**
 * 单卡测算结果。
 *
 * `status` 是三态而非「有值/无值」：`unknown` 必须与「确实不赚钱」区分开，
 * 否则用户会把「没数据」读成「不划算」（SPEC §6.6）。
 */
export type SchemeStatus = 'ranked' | 'unknown';

export interface Scheme {
  cardId: string;
  cardName: string;
  issuer: string;
  issuerRegion: Card['issuerRegion'];
  network: Card['network'];
  confidence: Card['confidence'];
  verifiedAt: string;
  status: SchemeStatus;

  /** 结算路由（第 0 步产物），前端展示「为什么」时需可见 */
  route: SettlementRoute;

  /** 本次实际取用的返现档位：local / foreign */
  rateSide: 'local' | 'foreign';

  /** 毛返现（未扣费，已封顶），以 settlementCurrency 计 */
  grossCashback: number;
  /** 积分折算的现金价值 */
  pointsValue: number;
  /** 外币手续费，正数表示支出 */
  fxFee: number;
  /** 渠道服务费，正数表示支出 */
  channelFee: number;

  /** 净额 = 毛返现 + 积分价值 − 外币手续费 − 渠道服务费 */
  netRealistic: number;
  /** 假设额度完全未用时的净额 */
  netOptimistic: number;
  /** 净回报率 = netRealistic / amount */
  netRateRealistic: number;
  netRateOptimistic: number;

  breakdown: BreakdownItem[];
  warnings: SchemeWarning[];

  /** 命中的上限池剩余情况 */
  capsAffected: Array<{
    capId: string;
    remaining: number;
    limit: number;
    currency: CurrencyCode;
    /** 折算说明，跨币种时非空 */
    fxNote?: string;
  }>;

  /** 生效的豁免说明（如「银联双币：以澳门币计算的款项豁免」） */
  fxWaiverNote?: string;
  /** 豁免时效状态 */
  fxWaiverValidity: ValidityState;
  /** 命中的门槛说明 */
  thresholdNote?: string;
  /** 与下一名的净回报率差 < 0.1% 时置 true */
  tieWithNext: boolean;
}

/** 引擎整体输出，含输入回显与拒绝原因 */
export interface RankResult {
  ok: boolean;
  /** ok=false 时的原因码，前端需展示 */
  rejectReason?: EngineRejectReason;
  /** 已排序，仅 status='ranked'；unknown 另列 */
  ranked: Scheme[];
  /** 不参与排序的卡，附缺失原因 */
  unranked: Scheme[];
  /** 本次折算所用汇率说明，UI 必须展示（不允许静默折算） */
  fxNotes: string[];
  /** 输入回显，便于前端确认自己传对了 */
  input: {
    amount: number;
    settlementCurrency: CurrencyCode;
    category: SpendCategory;
    channel: PaymentChannel;
  };
}

export type EngineRejectReason =
  /** AC-F1-05：金额 <= 0 */
  | { code: 'invalid_amount'; amount: number }
  | { code: 'invalid_currency'; currency: string }
  | { code: 'invalid_category'; category: string };
