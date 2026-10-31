/**
 * 账本归集测试。
 *
 * 归集口径错了，上限会「静默地算对一半」——最典型的是把上个月的消费
 * 算进本月上限，剩余额度被错误扣光，用户看到的是「已用尽」。
 */

import { describe, it, expect } from 'vitest';
import { aggregateLedger } from './aggregate';
import { ledgerEntry } from '../__fixtures__/params';
import type { LedgerEntry } from '../types';

const periods = {
  'cap-month': 'month' as const,
  'cap-year': 'year' as const,
  'cap-half': 'half_year' as const,
};

function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return ledgerEntry({ cardId: 'c', ...over });
}

describe('aggregateLedger：按每个上限自己的周期归集', () => {
  it('月度上限只累计本月条目', () => {
    const agg = aggregateLedger(
      [
        entry({ periodKey: '2026-10', capConsumption: { 'cap-month': 100 } }),
        entry({ periodKey: '2026-09', capConsumption: { 'cap-month': 999 } }),
      ],
      '2026-10-31',
      periods,
    );
    expect(agg.spentByCap['cap-month']).toBe(100);
  });

  it('年度上限累计整年条目（1 月与 10 月都算）', () => {
    const agg = aggregateLedger(
      [
        entry({ periodKey: '2026-01', yearKey: '2026', capConsumption: { 'cap-year': 50 } }),
        entry({ periodKey: '2026-10', yearKey: '2026', capConsumption: { 'cap-year': 70 } }),
      ],
      '2026-10-31',
      periods,
    );
    expect(agg.spentByCap['cap-year']).toBe(120);
  });

  it('年度上限不累计去年条目', () => {
    const agg = aggregateLedger(
      [
        entry({ periodKey: '2025-12', yearKey: '2025', capConsumption: { 'cap-year': 999 } }),
        entry({ periodKey: '2026-10', yearKey: '2026', capConsumption: { 'cap-year': 10 } }),
      ],
      '2026-10-31',
      periods,
    );
    expect(agg.spentByCap['cap-year']).toBe(10);
  });

  it('半年上限只累计本半年', () => {
    const agg = aggregateLedger(
      [
        entry({ periodKey: '2026-07', halfYearKey: '2026-H2', capConsumption: { 'cap-half': 30 } }),
        entry({ periodKey: '2026-03', halfYearKey: '2026-H1', capConsumption: { 'cap-half': 999 } }),
      ],
      '2026-10-31',
      periods,
    );
    expect(agg.spentByCap['cap-half']).toBe(30);
  });

  it('未声明周期的 capId 默认按月度处理', () => {
    const agg = aggregateLedger(
      [entry({ periodKey: '2026-10', capConsumption: { 'cap-unknown': 42 } })],
      '2026-10-31',
      {},
    );
    expect(agg.spentByCap['cap-unknown']).toBe(42);
  });

  it('同一 capId 多条记录累加', () => {
    const agg = aggregateLedger(
      [
        entry({ periodKey: '2026-10', capConsumption: { 'cap-month': 60 } }),
        entry({ periodKey: '2026-10', capConsumption: { 'cap-month': 40 } }),
      ],
      '2026-10-31',
      periods,
    );
    expect(agg.spentByCap['cap-month']).toBe(100);
  });
});

describe('aggregateLedger：门槛与渠道免费额度', () => {
  it('门槛累计只统计本月', () => {
    const agg = aggregateLedger(
      [
        entry({ periodKey: '2026-10', thresholdContribution: { 'th-1': 1000 } }),
        entry({ periodKey: '2026-09', thresholdContribution: { 'th-1': 5000 } }),
      ],
      '2026-10-31',
      {},
    );
    expect(agg.spentByThreshold['th-1']).toBe(1000);
  });

  it('渠道免费额度只统计本月', () => {
    const agg = aggregateLedger(
      [
        entry({ periodKey: '2026-10', channelFreeConsumption: { 'channel:alipay': 500 } }),
        entry({ periodKey: '2026-09', channelFreeConsumption: { 'channel:alipay': 3000 } }),
      ],
      '2026-10-31',
      {},
    );
    expect(agg.freeUsedByRule['channel:alipay']).toBe(500);
  });

  it('空账本返回三个空映射', () => {
    const agg = aggregateLedger([], '2026-10-31', periods);
    expect(agg).toEqual({ spentByCap: {}, spentByThreshold: {}, freeUsedByRule: {} });
  });

  it('缺字段的条目不会抛错（兼容旧账本）', () => {
    const bare = { id: 'x', cardId: 'c', periodKey: '2026-10', yearKey: '2026', halfYearKey: '2026-H2' } as LedgerEntry;
    expect(() => aggregateLedger([bare], '2026-10-31', periods)).not.toThrow();
  });
});
