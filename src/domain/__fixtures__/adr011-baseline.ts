/**
 * ADR-011 全矩阵快照夹具（数据在 adr011-baseline.json）。
 *
 * 为什么数据放 JSON：理由同 adr010-baseline.ts —— 这是不可变快照，不是代码。
 * 2660 条记录写成 .ts 字面量会让类型检查与 diff 都无法使用。
 *
 * 快照口径（第四轮 N5 补强后）：38 卡 × 5 渠道 × 7 类别 × 3 金额档 × 2 账本状态
 * = 7980 组合，参数固定 amounts={1000,3000,8000} / MOP / region=MO / today=2026-10-31。
 *
 * 为什么金额必须是三档（QA N5）：单一 1000 解决了门槛两态失明，但对「上限绑定
 * 被删」失明 —— chill dining 在 1000 MOP 下根本不触顶，删掉 capIds 快照 0 反应。
 * 8000 MOP 触及 chill/wewa/bea 的上限，快照行的 capsAffected（capId 列表）把
 * 上限机制纳入回归网。两态分离由 1000 档专责保证（3000/8000 在 includeCurrentSpend
 * 下空账本侧会自行达标）。
 *
 * 纪律：**不要为了让测试变绿而改这个 JSON**。它红说明改动产生了非预期影响。
 */

import raw from './adr011-baseline.json';

export interface MatrixRow {
  cardId: string;
  channel: string;
  category: string;
  amount: number;
  state: string;
  expect: {
    status: string;
    grossCashback: number | null;
    pointsValue: number | null;
    netRealistic: number | null;
    fxFee: number | null;
    channelFee: number | null;
    warnings: string;
    /** 上限绑定进入回归网的字段（N5）：该行触达的 capId 列表，排序后 join(','). */
    capsAffected: string;
  };
}

export const MATRIX_BASELINE: MatrixRow[] = raw as MatrixRow[];

/**
 * 有门槛的 5 张卡（ADR-011 有意变更对象）。
 * 其余 33 张是无关卡（含 tai-fung：它在 ADR-010 已定稿，本轮不得再变）。
 */
export const THRESHOLD_CARD_IDS = [
  'boc-hk-chill',
  'boc-hk-cheers',
  'bea-world-mc',
  'dbs-black-world',
  'wewa-unionpay',
] as const;

export const THRESHOLD_CARD_SET: ReadonlySet<string> = new Set(THRESHOLD_CARD_IDS);

/** 与门槛模型无关的卡（33 张）—— 它们必须一个值都不变 */
export function unrelatedRows(): MatrixRow[] {
  return MATRIX_BASELINE.filter((r) => !THRESHOLD_CARD_SET.has(r.cardId));
}
