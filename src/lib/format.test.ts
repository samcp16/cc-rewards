/**
 * 展示格式化测试。
 *
 * 这些函数不参与计算，但它们错了用户会直接读错数：
 * - 负号必须是 U+2212，不能是 ASCII hyphen（tabular-nums 下宽度不同，读屏读成破折号）
 * - 零必须显示 ±，不能因为它落在「正数分支」而显示 +
 * - 千分位只在 ≥ 10000 时加，否则 3 秒扫读的紧凑性就没了
 */

import { describe, it, expect } from 'vitest';
import {
  groupThousands,
  formatMoney,
  signedMoney,
  signedNumber,
  percent2,
  signedPercent,
  currencySymbol,
  amountToneClass,
  moneyAriaLabel,
} from './format';

const MINUS = '\u2212';

describe('groupThousands：只有 ≥ 10000 才加千分位', () => {
  it('万位以上按三位加逗号', () => {
    expect(groupThousands(12345.67)).toBe('12,345.67');
    expect(groupThousands(1234567.8)).toBe('1,234,567.80');
  });

  it('恰好一万是分界线', () => {
    expect(groupThousands(10000)).toBe('10,000.00');
    expect(formatMoney(9999.99)).toBe('9999.99');
  });

  it('小数位补足两位，不足不省略', () => {
    expect(groupThousands(5)).toBe('5.00');
    expect(groupThousands(5.1)).toBe('5.10');
  });

  it('负数取绝对值（符号由调用方决定）', () => {
    expect(groupThousands(-12345.6)).toBe('12,345.60');
  });
});

describe('formatMoney：永远不带符号', () => {
  it('小额保持紧凑，不加千分位', () => {
    expect(formatMoney(123.4)).toBe('123.40');
  });

  it('大额加千分位', () => {
    expect(formatMoney(23456.78)).toBe('23,456.78');
  });

  it('负值输出纯数字，符号不外泄', () => {
    expect(formatMoney(-88.8)).toBe('88.80');
  });
});

describe('signedMoney / signedNumber：正负零三种符号', () => {
  it('正值用 +', () => {
    expect(signedMoney(23.4, 'HK$')).toBe('+HK$23.40');
    expect(signedNumber(23.4)).toBe('+23.40');
  });

  it('负值用 U+2212 而非 ASCII hyphen', () => {
    expect(signedMoney(-4.2, 'HK$')).toBe(`${MINUS}HK$4.20`);
    expect(signedMoney(-4.2, 'HK$')).not.toContain('-');
    expect(signedNumber(-4.2)).toBe(`${MINUS}4.20`);
  });

  it('零用 ±，不能被判成正数', () => {
    expect(signedMoney(0, 'HK$')).toBe('±HK$0.00');
    expect(signedNumber(0)).toBe('±0.00');
  });

  it('浮点噪声收敛到零后也按零显示', () => {
    expect(signedNumber(0.001)).toBe('±0.00');
    expect(signedNumber(-0.001)).toBe('±0.00');
  });
});

describe('percent2 / signedPercent', () => {
  it('费率固定两位小数', () => {
    expect(percent2(0.0195)).toBe('1.95%');
    expect(percent2(0.1)).toBe('10.00%');
  });

  it('带符号回报率区分正负零', () => {
    expect(signedPercent(0.0234)).toBe('+2.34%');
    expect(signedPercent(-0.0045)).toBe(`${MINUS}0.45%`);
    expect(signedPercent(0)).toBe('±0.00%');
  });

  it('负值不会被格式化成「-0.45%」这种 hyphen 写法', () => {
    expect(signedPercent(-0.0045)).not.toContain('-');
  });
});

describe('currencySymbol', () => {
  it('三种本币各有符号', () => {
    expect(currencySymbol('MOP')).toBe('MOP ');
    expect(currencySymbol('HKD')).toBe('HK$');
    expect(currencySymbol('CNY')).toBe('CN¥');
  });

  it('未知币种回落到「代码 + 空格」，不抛错也不返回空串', () => {
    expect(currencySymbol('USD')).toBe('USD ');
  });
});

describe('amountToneClass：只有真负值才报警', () => {
  it('正数为 pos，负数为 neg，零为 muted', () => {
    expect(amountToneClass(10)).toBe('text-pos');
    expect(amountToneClass(-10)).toBe('text-neg');
    expect(amountToneClass(0)).toBe('text-muted');
  });

  it('浮点噪声不触发红色（避免 alarm fatigue）', () => {
    expect(amountToneClass(0.001)).toBe('text-muted');
    expect(amountToneClass(-0.001)).toBe('text-muted');
  });
});

describe('moneyAriaLabel：读屏读语义而非字符', () => {
  it('正负零各有中文前缀', () => {
    expect(moneyAriaLabel(23.4)).toBe('正 23.40');
    expect(moneyAriaLabel(-23.4)).toBe('负 23.40');
    expect(moneyAriaLabel(0)).toBe('零 0.00');
  });
});
