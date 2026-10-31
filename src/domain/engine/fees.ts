/**
 * 第 4-5 步：扣外币手续费、扣渠道服务费。
 *
 * 两步都合并在本文件：它们都是「从毛返现里减掉的支出」，口径一致（正数表示支出），
 * 且都依赖金额区间与卡组织。分开成两个文件会让「谁先扣」的问题在代码里可见，
 * 而实际计算中扣减顺序不影响结果（加法交换律），只有封顶与定档的顺序才影响结果。
 */

import type {
  CardNetwork,
  ChannelFeeRule,
  CurrencyCode,
  IssuerRegion,
  PaymentChannel,
  Card,
  SpendRegion,
} from '../types';
import type { FxResolution } from '../fx/resolveFx';
import { convert, describeRate } from '../fx/fxReference';
import { round2 } from '../../lib/money';
import type { FxTable } from '../types';

export interface FxFeeOutcome {
  amount: number;
  rate: number;
  fixedFee: number;
  exempt: boolean;
  waiverNote?: string;
  sourceUrl: string;
  verifiedAt: string;
}

/**
 * 计算外币手续费金额。
 *
 * 注意：费率已由 resolveFxFee 依据第 0 步路由确定，本函数不再判断币种，
 * 避免出现第二个判定点。
 */
export function computeFxFee(resolution: FxResolution, amount: number): FxFeeOutcome {
  const percent = round2(amount * resolution.rate);
  return {
    amount: round2(percent + resolution.fixedFee),
    rate: resolution.rate,
    fixedFee: resolution.fixedFee,
    exempt: resolution.exempt,
    waiverNote: resolution.waiverNote,
    sourceUrl: resolution.sourceUrl,
    verifiedAt: resolution.verifiedAt,
  };
}

export interface ChannelFeeOutcome {
  amount: number;
  rate: number;
  fixedFee: number;
  matchedRuleId?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  /** 未匹配到任何规则时的说明（兜底 0 且标注） */
  note?: string;
  /** 免费额度折算说明 */
  allowanceNote?: string;
}

export interface ChannelFeeContext {
  channel: PaymentChannel;
  network: CardNetwork;
  issuerRegion: IssuerRegion;
  amount: number;
  settlementCurrency: CurrencyCode;
  region: SpendRegion;
  /** 该渠道本周期已用免费额度（rule.monthlyFreeAllowance.currency 计） */
  freeUsed: number;
  rules: ChannelFeeRule[];
  fx: FxTable;
}

/**
 * 渠道服务费查表：卡级（此处无卡级覆盖）> (渠道, 卡组织, 发卡地) 匹配 > 全局兜底 0 并标注。
 */
export function computeChannelFee(ctx: ChannelFeeContext): ChannelFeeOutcome {
  const rule = ctx.rules.find(
    (r) =>
      r.channel === ctx.channel &&
      (!r.networkIn || r.networkIn.includes(ctx.network)) &&
      (!r.issuerRegionIn || r.issuerRegionIn.includes(ctx.issuerRegion)),
  );

  if (!rule) {
    return {
      amount: 0,
      rate: 0,
      fixedFee: 0,
      note: '该渠道未收录服务费规则，按 0 计并标注，结论可能偏差',
    };
  }

  // ---- 月度免费额度 ----
  // 免费额度与上限同源：都用账本累计，不另立一套（ARCHITECTURE §12.2 a）
  let billableAmount = ctx.amount;
  let allowanceNote: string | undefined;
  if (rule.monthlyFreeAllowance) {
    const allowanceInSettlement = convert(
      rule.monthlyFreeAllowance.amount,
      rule.monthlyFreeAllowance.currency,
      ctx.settlementCurrency,
      ctx.fx,
    );
    const usedInSettlement = convert(
      ctx.freeUsed,
      rule.monthlyFreeAllowance.currency,
      ctx.settlementCurrency,
      ctx.fx,
    );
    const freeRemaining = Math.max(allowanceInSettlement - usedInSettlement, 0);
    billableAmount = Math.max(ctx.amount - freeRemaining, 0);
    if (rule.monthlyFreeAllowance.currency !== ctx.settlementCurrency) {
      allowanceNote = `免费额度 ${describeRate(
        rule.monthlyFreeAllowance.currency,
        ctx.settlementCurrency,
        ctx.fx,
      )}`;
    }
  }

  const tier = pickChannelTier(rule, ctx.amount);
  // 档位按**整笔金额**匹配（规则条款均以单笔金额为界），
  // 费率与固定费则作用于**超出免费额度后的可计费金额**。
  // 两者混用会得出「MOP 200 免费额度内仍收固定费」这类错误。
  const amount = billableAmount > 0 ? round2(billableAmount * tier.rate + tier.fixedFee) : 0;

  return {
    amount,
    rate: tier.rate,
    fixedFee: billableAmount > 0 ? tier.fixedFee : 0,
    matchedRuleId: rule.id,
    sourceUrl: rule.source.url,
    verifiedAt: rule.source.verifiedAt,
    allowanceNote,
  };
}

/** 按单笔金额匹配区间档（半开区间 [from, to)） */
export function pickChannelTier(rule: ChannelFeeRule, amount: number) {
  if (rule.tiers.length === 0) {
    throw new Error(`渠道费规则 ${rule.id} 没有任何金额档`);
  }
  const sorted = [...rule.tiers].sort((a, b) => a.fromAmount - b.fromAmount);
  let chosen = sorted[0]!;
  for (const t of sorted) {
    if (amount >= t.fromAmount) chosen = t;
    else break;
  }
  return chosen;
}

/** 判断卡是否参与本次测算（停用卡不参与排序但保留账本历史） */
export function isCardActive(card: Pick<Card, 'active'>): boolean {
  return card.active !== false;
}

