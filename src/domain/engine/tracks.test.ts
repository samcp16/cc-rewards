/**
 * 上限绑定（tracks.ts）测试。
 *
 * 这一层是「卡库数据现实」与「引擎语义」之间的适配器：
 * 卡库里 caps 声明了上限，但类别条目本身没写 capIds。
 * 如果不补挂，上限永远不会生效。
 */

import { describe, it, expect } from 'vitest';
import { bindCapsForCategory, capCoversCategory, categoryToTrack } from './tracks';
import { card } from '../__fixtures__/params';
import type { CapDefinition, CategoryRule, SpendCategory } from '../types';

const allCap: CapDefinition = {
  id: 'c-all',
  categories: 'all',
  limitAmount: 150,
  limitCurrency: 'HKD',
  period: 'month',
};

const diningCap: CapDefinition = {
  id: 'c-dining',
  categories: ['dining', 'grocery'],
  limitAmount: 500,
  limitCurrency: 'HKD',
  period: 'month',
};

describe('capCoversCategory', () => {
  it("categories: 'all' 覆盖任意类别", () => {
    expect(capCoversCategory(allCap, 'fuel')).toBe(true);
    expect(capCoversCategory(allCap, 'dining')).toBe(true);
  });

  it('列表内命中才算覆盖', () => {
    expect(capCoversCategory(diningCap, 'dining')).toBe(true);
    expect(capCoversCategory(diningCap, 'grocery')).toBe(true);
    expect(capCoversCategory(diningCap, 'fuel')).toBe(false);
  });
});

describe('bindCapsForCategory', () => {
  it('卡有覆盖该类别上限时自动挂上，并标记 inferred', () => {
    // 用一张「未在类别层声明 capIds」的卡验推断路径。
    // Chill 已经改成显式声明（ADR-011 §1c），不再走推断，故不能拿它当样本。
    const c = { ...card('sc-simply-cash'), caps: [allCap] };
    const b = bindCapsForCategory(c, 'dining');
    expect(b.capIds).toEqual(['c-all']);
    expect(b.inferred).toBe(true);
  });

  it('Chill 的 dining 走显式声明，不再依赖 cap.categories: all 推断', () => {
    const b = bindCapsForCategory(card('boc-hk-chill'), 'dining');
    expect(b.capIds).toEqual(['boc-hk-chill:extra']);
    expect(b.inferred).toBe(false);
  });

  it('无上限的卡返回空绑定，inferred 为 false', () => {
    const b = bindCapsForCategory(card('sc-simply-cash'), 'dining');
    expect(b.capIds).toEqual([]);
    expect(b.inferred).toBe(false);
  });

  it('类别层显式 capIds 优先，且不算推断', () => {
    // ADR-011 §1c：显式绑定挂在 CategoryRule 上，不再是调用参数
    const c = {
      ...card('boc-hk-chill'),
      categories: { ...card('boc-hk-chill').categories, dining: { kind: 'cashback' as const, rates: { local: 0.1 }, capIds: ['explicit-cap'] } },
    };
    const b = bindCapsForCategory(c, 'dining');
    expect(b.capIds).toEqual(['explicit-cap']);
    expect(b.inferred).toBe(false);
  });

  it('显式空数组 = 不受任何上限约束（与「未声明」必须区分）', () => {
    // Chill 的 grocery 恒 0.4%，官方条款里不消耗 HK$150 额外回赠上限；
    // 但 cap.categories: 'all' 按推断会把它算进去。空数组是纠正手段。
    const b = bindCapsForCategory(card('boc-hk-chill'), 'grocery');
    expect(b.capIds).toEqual([]);
    expect(b.inferred).toBe(false);
  });

  it('只挂覆盖该类别的上限，不挂无关上限', () => {
    const c = { ...card('citi-cash-back'), caps: [allCap, { ...diningCap, categories: ['fuel'] as SpendCategory[] }] };
    const b = bindCapsForCategory(c, 'dining');
    expect(b.capIds).toEqual([allCap.id]);
  });
});

describe('categoryToTrack', () => {
  it('cashback 规则转成带 base.<category> 排他组的轨道', () => {
    const rule: CategoryRule = { kind: 'cashback', rates: { local: 0.02 } };
    const t = categoryToTrack(rule, card('citi-cash-back'), 'dining')!;
    expect(t.kind).toBe('cashback');
    expect(t.exclusivityGroup).toBe('base.dining');
    // 不同类别落在不同排他组，避免互相取最大值
    expect(t.exclusivityGroup).not.toBe('base.grocery');
  });

  it('不同类别产生不同排他组', () => {
    const rule: CategoryRule = { kind: 'cashback', rates: { local: 0.02 } };
    const dining = categoryToTrack(rule, card('citi-cash-back'), 'dining')!;
    const fuel = categoryToTrack(rule, card('citi-cash-back'), 'fuel')!;
    expect(dining.exclusivityGroup).not.toBe(fuel.exclusivityGroup);
  });

  it('points 规则带 pointProgramId 与倍数', () => {
    const rule: CategoryRule = { kind: 'points', multiplier: 4, pointProgramId: 'yuu' };
    const t = categoryToTrack(rule, card('hang-seng-enjoy'), 'dining')!;
    expect(t.kind).toBe('points');
    if (t.kind === 'points') {
      expect(t.multiplier).toBe(4);
      expect(t.pointProgramId).toBe('yuu');
    }
  });

  it('unknown 规则返回 null（不可估值）', () => {
    expect(categoryToTrack({ kind: 'unknown', rates: null }, card('citi-cash-back'), 'dining')).toBeNull();
  });

  it('cashback 但 rates 为 null 时保留 null，交给上层标记 unknown', () => {
    const t = categoryToTrack({ kind: 'cashback', rates: null }, card('citi-cash-back'), 'dining')!;
    if (t.kind === 'cashback') expect(t.rates).toBeNull();
  });

  it('points 规则缺 multiplier / pointProgramId 时给出中性默认值', () => {
    const t = categoryToTrack({ kind: 'points' }, card('hang-seng-enjoy'), 'dining')!;
    if (t.kind === 'points') {
      expect(t.multiplier).toBe(1);
      expect(t.pointProgramId).toBe('');
    }
  });
});
