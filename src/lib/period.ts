/**
 * 周期键工具。
 *
 * 上限按 period 归集，账本必须同时写四种键（ARCHITECTURE §12.2 / §12.6）。
 * 只存月键会导致按年上限（EarnMORE）无法归集——这正是已知坑之一。
 */

/** 'YYYY-MM-DD' 或 ISO 时间戳 -> 本地日期部分 */
export function toDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无法解析日期：${iso}`);
  }
  // 用 UTC 保证测试与运行环境一致（预置数据均为 UTC 零点）
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toPeriodKey(iso: string): string {
  return toDateKey(iso).slice(0, 7);
}

export function toYearKey(iso: string): string {
  return toDateKey(iso).slice(0, 4);
}

export function toQuarterKey(iso: string): string {
  const month = Number(toDateKey(iso).slice(5, 7));
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${toYearKey(iso)}-Q${quarter}`;
}

export function toHalfYearKey(iso: string): string {
  const month = Number(toDateKey(iso).slice(5, 7));
  return `${toYearKey(iso)}-H${month <= 6 ? 1 : 2}`;
}

export type CapPeriod = 'month' | 'year' | 'half_year';

/** 按上限周期取对应归集键 */
export function periodKeyFor(period: CapPeriod, iso: string): string {
  switch (period) {
    case 'month':
      return toPeriodKey(iso);
    case 'year':
      return toYearKey(iso);
    case 'half_year':
      return toHalfYearKey(iso);
  }
}

/** 两个日期相差天数（a - b），按 UTC 日历日计算 */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${toDateKey(a)}T00:00:00Z`);
  const db = Date.parse(`${toDateKey(b)}T00:00:00Z`);
  return Math.round((da - db) / 86_400_000);
}
