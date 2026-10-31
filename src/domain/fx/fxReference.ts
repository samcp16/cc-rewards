/**
 * 汇率折算参考表。
 *
 * 严格区分两件事（SPEC §6.5 裁定）：
 * - 汇率**成本**（汇兑损失） → 不建模（O4 保持不变）
 * - 汇率**折算**（把 HKD 上限换成 MOP 以便归集） → 必须做，否则上限功能直接失效
 *
 * 本文件只服务「折算」，任何时候都不得把这里的结果当成成本项写进「为什么」。
 */

import type { CurrencyCode, FxTable, FxRate } from '../types';

/** 初始值：HKD 1 = MOP 1.03（港澳市场长期稳定区间），用户可在设置页调整 */
export const DEFAULT_FX_TABLE: FxTable = {
  rates: [
    { from: 'HKD', to: 'MOP', rate: 1.03 },
    { from: 'MOP', to: 'HKD', rate: 1 / 1.03 },
    { from: 'HKD', to: 'CNY', rate: 0.92 },
    { from: 'CNY', to: 'HKD', rate: 1 / 0.92 },
    { from: 'MOP', to: 'CNY', rate: 0.893 },
    { from: 'CNY', to: 'MOP', rate: 1 / 0.893 },
  ],
  userAdjusted: false,
};

export function cloneFxTable(table: FxTable = DEFAULT_FX_TABLE): FxTable {
  return { rates: table.rates.map((r) => ({ ...r })), userAdjusted: table.userAdjusted };
}

/**
 * 查折算率。同币种返回 1；表里查不到返回 null（调用方必须显式处理，不得默认 1）。
 */
export function lookupRate(table: FxTable, from: CurrencyCode, to: CurrencyCode): number | null {
  if (from === to) return 1;
  const hit: FxRate | undefined = table.rates.find((r) => r.from === from && r.to === to);
  return hit ? hit.rate : null;
}

/**
 * 折算金额。查不到汇率时抛错——静默按 1:1 会把上限算错却不告诉任何人。
 */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, table: FxTable): number {
  const rate = lookupRate(table, from, to);
  if (rate === null) {
    throw new Error(`汇率折算表缺少 ${from} -> ${to} 的折算率，拒绝按 1:1 静默处理`);
  }
  return amount * rate;
}

/**
 * 用户可读的折算依据，UI 必须展示（SPEC §6.5 第 5 条：不允许静默折算）。
 * 例：按参考汇率 HKD 1 = MOP 1.03 折算
 */
export function describeRate(from: CurrencyCode, to: CurrencyCode, table: FxTable): string {
  const rate = lookupRate(table, from, to);
  if (rate === null) return `无 ${from} 兑 ${to} 折算率`;
  if (from === to) return '同币种，无需折算';
  return `按参考汇率 ${from} 1 = ${to} ${roundRate(rate)} 折算`;
}

function roundRate(rate: number): string {
  return String(Math.round(rate * 10000) / 10000);
}
