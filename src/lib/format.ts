/**
 * 金额与费率的展示格式化（纯展示，不参与计算）。
 *
 * 为什么单独一层：引擎已经用 lib/money 的 formatAmount2 做了「十进制收敛后补位」，
 * 但展示层还多两件事它不管 —— 千分位、以及**负号的字形**。
 * 负号必须用 U+2212 `−`，不是 hyphen `-`：hyphen 在 tabular-nums 下宽度偏窄，
 * 且与减号语义不同，读屏会读成「破折号」。
 */

import { formatAmount2, formatPercent2, toCents } from './money';

/** 千分位。金额 ≥ 10,000 才加（MASTER §5.2 第 5 条），以下保持紧凑。 */
export function groupThousands(value: number): string {
  const cents = toCents(value);
  const whole = String(Math.trunc(Math.abs(cents) / 100));
  const fraction = String(Math.abs(cents) % 100).padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${fraction}`;
}

/** 用户可读金额：≥10000 加千分位，否则纯 2 位小数。永远不带符号。 */
export function formatMoney(value: number): string {
  const rounded = Math.abs(value);
  return rounded >= 10000 ? groupThousands(rounded) : formatAmount2(rounded);
}

/** 带符号金额：`+HK$23.40` / `−HK$4.20` / `±0.00`。symbol 为 `HK$` 这类币种符号。 */
export function signedMoney(value: number, symbol: string): string {
  const body = formatMoney(value);
  if (toCents(value) === 0) return `±${symbol}${body}`;
  return `${value > 0 ? '+' : '−'}${symbol}${body}`;
}

/** 只有符号 + 数字（不含币种），用于列宽受约束的对比表。 */
export function signedNumber(value: number): string {
  const body = formatMoney(value);
  if (toCents(value) === 0) return `±${body}`;
  return `${value > 0 ? '+' : '−'}${body}`;
}

/** 汇率用 2 位小数（如 1.95%、10.00%）。 */
export function percent2(rate: number): string {
  return formatPercent2(rate);
}

/** 带符号的回报率：`+2.34%` / `−0.45%` / `±0.00%` */
export function signedPercent(rate: number): string {
  const body = formatPercent2(Math.abs(rate));
  const cents = toCents(rate * 10000);
  if (cents === 0) return `±${body}`;
  return `${rate > 0 ? '+' : '−'}${body}`;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  MOP: 'MOP ',
  HKD: 'HK$',
  CNY: 'CN¥',
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[code] ?? `${code} `;
}

/** 净额 → 语义色 Tailwind 类。零与「少赚」都不配红（alarm fatigue）。 */
export function amountToneClass(value: number): string {
  if (toCents(value) > 0) return 'text-pos';
  if (toCents(value) < 0) return 'text-neg';
  return 'text-muted';
}

/** 读屏用金额描述：把符号读出来，避免读成「加 HK 二十三点四零」这种噪声。 */
export function moneyAriaLabel(value: number): string {
  const cents = toCents(value);
  const sign = cents > 0 ? '正' : cents < 0 ? '负' : '零';
  return `${sign} ${formatMoney(value)}`;
}
