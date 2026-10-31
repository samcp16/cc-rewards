/**
 * 汇率折算测试（SPEC §6.5 裁定：汇率成本不做，汇率折算必须做）。
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FX_TABLE,
  cloneFxTable,
  lookupRate,
  convert,
  describeRate,
} from './fxReference';

describe('fxReference：折算表', () => {
  it('初始值 HKD 1 = MOP 1.03', () => {
    expect(lookupRate(DEFAULT_FX_TABLE, 'HKD', 'MOP')).toBe(1.03);
  });

  it('反向汇率是倒数关系', () => {
    const back = lookupRate(DEFAULT_FX_TABLE, 'MOP', 'HKD')!;
    expect(back * 1.03).toBeCloseTo(1, 10);
  });

  it('同币种折算率为 1', () => {
    expect(lookupRate(DEFAULT_FX_TABLE, 'MOP', 'MOP')).toBe(1);
  });

  it('convert 把 HKD 上限折成 MOP：HK$150 → MOP 154.50', () => {
    expect(convert(150, 'HKD', 'MOP', DEFAULT_FX_TABLE)).toBeCloseTo(154.5, 10);
  });

  it('convert 同币种原样返回', () => {
    expect(convert(150, 'HKD', 'HKD', DEFAULT_FX_TABLE)).toBe(150);
  });

  it('反向验证：缺少汇率对必须抛错，不得按 1:1 静默处理', () => {
    const broken = { rates: [], userAdjusted: false };
    expect(() => convert(100, 'HKD', 'MOP', broken)).toThrow(/拒绝按 1:1 静默处理/);
  });

  it('describeRate 给出可展示的折算依据', () => {
    expect(describeRate('HKD', 'MOP', DEFAULT_FX_TABLE)).toBe('按参考汇率 HKD 1 = MOP 1.03 折算');
  });

  it('describeRate 同币种时说明无需折算', () => {
    expect(describeRate('MOP', 'MOP', DEFAULT_FX_TABLE)).toBe('同币种，无需折算');
  });

  it('describeRate 缺汇率对时返回明确提示而非空串', () => {
    expect(describeRate('HKD', 'MOP', { rates: [], userAdjusted: false })).toContain('无 HKD 兑 MOP 折算率');
  });

  it('cloneFxTable 产生独立副本，改副本不影响默认表', () => {
    const copy = cloneFxTable();
    copy.rates[0] = { from: 'HKD', to: 'MOP', rate: 1.1 };
    expect(lookupRate(DEFAULT_FX_TABLE, 'HKD', 'MOP')).toBe(1.03);
    expect(lookupRate(copy, 'HKD', 'MOP')).toBe(1.1);
  });

  it('用户调整汇率后，折算结果随之变化', () => {
    const custom = cloneFxTable();
    custom.rates[0] = { from: 'HKD', to: 'MOP', rate: 1.05 };
    custom.userAdjusted = true;
    expect(convert(150, 'HKD', 'MOP', custom)).toBeCloseTo(157.5, 10);
    expect(describeRate('HKD', 'MOP', custom)).toBe('按参考汇率 HKD 1 = MOP 1.05 折算');
  });
});
