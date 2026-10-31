/**
 * 金额与周期工具测试。
 *
 * 重点是浮点：0.1 + 0.2 !== 0.3，而返现率是 4 位小数，累加会漂移并改变排序。
 */

import { describe, it, expect } from 'vitest';
import {
  toCents,
  fromCents,
  addMoney,
  round2,
  applyRate,
  sumMoney,
  rateOf,
  formatAmount2,
  formatPercent2,
} from './money';
import {
  toDateKey,
  toPeriodKey,
  toYearKey,
  toQuarterKey,
  toHalfYearKey,
  periodKeyFor,
  daysBetween,
} from './period';

describe('money：整数分运算', () => {
  it('toCents 四舍五入到分', () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.004)).toBe(0);
    expect(toCents(-19.5)).toBe(-1950);
  });

  it('fromCents 还原', () => {
    expect(fromCents(1950)).toBe(19.5);
  });

  it('addMoney 避免 0.1 + 0.2 漂移', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });

  it('sumMoney 多项累加不漂移', () => {
    expect(sumMoney([0.1, 0.2, 0.3, 0.4])).toBe(1);
  });

  it('applyRate 按费率算到分', () => {
    // 渣打外币 2.0% × 1000 = 20
    expect(applyRate(1000, 0.02)).toBe(20);
    // 1.95% × 1000 = 19.5
    expect(applyRate(1000, 0.0195)).toBe(19.5);
    // 0.4% × 2000 = 8
    expect(applyRate(2000, 0.004)).toBe(8);
  });

  it('applyRate 对无法整除的分位四舍五入，不产生 3 位小数', () => {
    const v = applyRate(333, 0.0195);
    expect(Number.isInteger(toCents(v))).toBe(true);
  });

  it('round2 只保留两位', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(22.8345)).toBe(22.83);
  });

  it('round2 把负零归一为 +0（否则 Object.is 与序列化都会出现诡异不等）', () => {
    expect(Object.is(round2(-0.004), -0)).toBe(false);
    expect(Object.is(round2(-0.004), 0)).toBe(true);
    expect(Object.is(round2(-0), 0)).toBe(true);
  });

  it('rateOf 在金额为 0 时返回 0 而不是 Infinity', () => {
    expect(rateOf(5, 0)).toBe(0);
    expect(rateOf(0.5, 1000)).toBeCloseTo(0.0005, 10);
  });

  // ---------------------------------------------------------------------
  // 反向验证：formatAmount2 与原生 toFixed 的差异，正是它存在的理由。
  // 若哪天有人把它「简化」成 return n.toFixed(2)，下面第一条会立刻红。
  // ---------------------------------------------------------------------
  describe('formatAmount2：定点展示（不参与运算）', () => {
    it('1.005 得 1.01，而原生 toFixed(2) 得 1.00 —— 这是十进制与二进制的分界', () => {
      expect(formatAmount2(1.005)).toBe('1.01');
      expect((1.005).toFixed(2)).toBe('1.00'); // 反向对照：证明差异真实存在
    });

    it('负值的负号位置正确，且不出现 -0.00', () => {
      expect(formatAmount2(-1.005)).toBe('-1.01');
      expect(formatAmount2(-0.004)).toBe('0.00');
      expect(formatAmount2(-0)).toBe('0.00');
    });

    it('小数位不足时补零到两位', () => {
      expect(formatAmount2(0)).toBe('0.00');
      expect(formatAmount2(1000)).toBe('1000.00');
      expect(formatAmount2(1234.5)).toBe('1234.50');
      expect(formatAmount2(0.004)).toBe('0.00');
    });

    it('浮点累加误差被吸收', () => {
      expect(formatAmount2(0.1 + 0.2)).toBe('0.30');
    });

    it('进位跨整数位时不留痕', () => {
      expect(formatAmount2(99.999)).toBe('100.00');
      expect(formatAmount2(12.345)).toBe('12.35');
    });

    it('formatPercent2 复用小数的同一套逻辑', () => {
      expect(formatPercent2(0.0195)).toBe('1.95%');
      expect(formatPercent2(0.005)).toBe('0.50%');
      expect(formatPercent2(0.5)).toBe('50.00%');
    });
  });
});

describe('period：四种周期键', () => {
  const iso = '2026-10-31T00:00:00.000Z';

  it('toDateKey / toPeriodKey / toYearKey', () => {
    expect(toDateKey(iso)).toBe('2026-10-31');
    expect(toPeriodKey(iso)).toBe('2026-10');
    expect(toYearKey(iso)).toBe('2026');
  });

  it('toQuarterKey 按自然季', () => {
    expect(toQuarterKey('2026-01-15')).toBe('2026-Q1');
    expect(toQuarterKey('2026-03-31')).toBe('2026-Q1');
    expect(toQuarterKey('2026-04-01')).toBe('2026-Q2');
    expect(toQuarterKey('2026-10-31')).toBe('2026-Q4');
    expect(toQuarterKey('2026-12-31')).toBe('2026-Q4');
  });

  it('toHalfYearKey 按上下半年', () => {
    expect(toHalfYearKey('2026-06-30')).toBe('2026-H1');
    expect(toHalfYearKey('2026-07-01')).toBe('2026-H2');
  });

  it('periodKeyFor 按上限周期取键（year 上限不得按月归集）', () => {
    expect(periodKeyFor('month', iso)).toBe('2026-10');
    expect(periodKeyFor('year', iso)).toBe('2026');
    expect(periodKeyFor('half_year', iso)).toBe('2026-H2');
  });

  it('无法解析的日期必须抛错，不得静默当今天', () => {
    expect(() => toDateKey('not-a-date')).toThrow(/无法解析日期/);
  });

  it('daysBetween 按 UTC 日历日', () => {
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(30);
    expect(daysBetween('2026-06-30', '2026-10-31')).toBe(-123);
    expect(daysBetween('2026-10-31', '2026-10-31')).toBe(0);
  });
});
