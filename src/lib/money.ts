/**
 * 金额运算工具（纯函数，无副作用）。
 *
 * 为什么内部用「分」：0.1 + 0.2 !== 0.3。返现率 0.0195 × 金额这种乘法，
 * 直接浮点累加会在 4 位小数的费率上漂移，最终决定排序先后。全部转整数分再回浮点。
 */

/**
 * 元 -> 分，四舍五入到整数分。
 *
 * 不用 `Math.round(amount * 100)`：1.005 * 100 在二进制浮点下是 100.49999999999999，
 * 会得到 100 而不是 101。先按 15 位有效数字收敛成十进制字符串再解析，绕开这个偏差。
 */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const scaled = Number((Math.abs(amount) * 100).toPrecision(15));
  const cents = Math.round(scaled);
  return amount < 0 ? -cents : cents;
}

/** 分 -> 元 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** 两数相加，以分为单位 */
export function addMoney(a: number, b: number): number {
  return fromCents(toCents(a) + toCents(b));
}

/** 保留 2 位小数（展示口径） */
export function round2(amount: number): number {
  const cents = toCents(amount);
  // 归零时统一成 +0：-0 在 JSON 里序列化成 "0" 但 Object.is(-0, 0) 为 false，
  // 排序比较与相等断言都会因此出现「看着一样却不相等」的诡异失败
  return cents === 0 ? 0 : cents / 100;
}

/**
 * 按费率计算金额，保留到分。
 * 这是引擎里所有「金额 × 费率」的唯一出口，避免各处各自四舍五入。
 */
export function applyRate(amount: number, rate: number): number {
  return fromCents(Math.round(Number((amount * rate).toPrecision(15)) * 100));
}

/** 求和，以分为单位累加 */
export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

/** 回报率 = 净额 / 消费额。金额为 0 时返回 0（调用方已拒绝该输入） */
export function rateOf(net: number, amount: number): number {
  if (amount === 0) return 0;
  return net / amount;
}

/**
 * 固定 2 位小数的展示字符串（仅用于文案拼装，不参与后续运算）。
 *
 * 为什么不直接用 `n.toFixed(2)`：`1.005.toFixed(2)` 得 `"1.00"`，
 * 因为 1.005 在二进制里是 1.00499999...。这里的金额最终会出现在
 * 「已封顶：超出 HK$ 12.34」这类文案里，差 1 分会让用户核对时对不上账。
 * 先经 round2（十进制收敛）再补位，两条路径给出同一个数。
 *
 * 之所以单独开这个函数而不是在调用处写模板字符串：C5 门禁禁 toFixed，
 * 而「格式化」与「计算」是两个不同的意图，混在一处会让门禁只能整体关掉。
 */
export function formatAmount2(amount: number): string {
  const rounded = round2(amount);
  const negative = rounded < 0;
  const absolute = Math.abs(rounded);
  const whole = Math.trunc(absolute);
  // 分位用整数运算取出，避免再次落到浮点
  const fraction = Math.abs(toCents(absolute) - whole * 100);
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/** 百分比展示，固定 2 位小数。同上，只用于文案。 */
export function formatPercent2(rate: number): string {
  return `${formatAmount2(rate * 100)}%`;
}
