/**
 * 引擎参数类型：汇率表 / 渠道规则 / 积分估值 / today 注入点。
 *
 * 从 types.ts 拆出：types.ts 是「领域名词」（卡、规则、输入、账本），
 * 本文件是「引擎运行时配置」。拆开的原因有两个：
 *   1. types.ts 超 300 行门禁（数据本身已到 329 行）；
 *   2. 两者变化节奏不同 —— 领域名词跟着卡库 JSON 变，
 *      参数结构跟着「用户可以调什么」变（Phase 4 接设置页时只动这里）。
 */

import type { ChannelFeeRule, CurrencyCode } from './types';

/** 汇率折算表：1 单位 source = rate 单位 target */
export interface FxRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
}

export interface FxTable {
  /** 基准：HKD 1 = MOP 1.03 */
  rates: FxRate[];
  /** 是否用户手动调整过，UI 需标注 */
  userAdjusted: boolean;
}

export interface EngineParams {
  fx: FxTable;
  /** 渠道服务费规则；缺省走全局兜底 */
  channelFees: ChannelFeeRule[];
  /**
   * 积分估值：programId -> 每分现金价值。
   * valuePerPoint 为 null 表示无官方固定值，引擎会退回保守下限并标注 estimated。
   */
  pointValuations: Record<
    string,
    {
      valuePerPoint: number | null;
      currency: CurrencyCode;
      basis?: 'confirmed' | 'estimated' | 'user_provided';
      note?: string;
    }
  >;
  /** 判定「今天」，便于测试注入 */
  today: string;
}
