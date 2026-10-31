/**
 * 上限周期与分项费率的数据契约（QA B2 / B3 回归）。
 *
 * 这两条缺陷的共同点：**引擎分支写了，但数据层零存在** ——
 * `aggregate.ts` 的 half_year 归集与 `resolveFx.ts` 的 splitRates 选择
 * 在修复前是永远不会执行到的死代码，因此任何单测都覆盖不到「数据用对了没有」。
 * 本文件用真实卡库数据锁住这两个分支，而不是用合成的 fixture 自证。
 */

import { describe, it, expect } from 'vitest';
import { rankSingleCard } from './index';
import { card, makeParams, ledgerEntry } from '../__fixtures__/params';
import { aggregateLedger } from './aggregate';
import { resolveFxFee } from '../fx/resolveFx';
import type { LedgerEntry } from '../types';

const params = makeParams();
const TODAY = '2026-10-31';

const earnmore = card('earnmore-unionpay');
const EARNMORE_CAP = 'earnmore-unionpay:semi-annual-2pct';

/** 以 HKD 结算的消费入参（避开银联双币卡的 local 路由，让 2% 与 1% 的差别直接可见） */
const hkdInput = (occurredAt: string) => ({
  amount: 50_000,
  settlementCurrency: 'HKD' as const,
  category: 'dining' as const,
  channel: 'physical' as const,
  region: 'MO' as const,
  occurredAt,
});

/** 造一条「该半年额度已用 x」的账本记录 */
function usedEntry(halfYearKey: string, yearKey: string, used: number): LedgerEntry {
  const month = halfYearKey.endsWith('H1') ? '05' : '08';
  return ledgerEntry({
    cardId: 'earnmore-unionpay',
    occurredAt: `${yearKey}-${month}-10`,
    periodKey: `${yearKey}-${month}`,
    yearKey,
    halfYearKey,
    capConsumption: { [EARNMORE_CAP]: used },
  });
}

describe('B2 EarnMORE：每半年首 HK$80,000 享 2%，其后 1%', () => {
  it('上限契约：half_year + basis spend + 80000 HKD', () => {
    // 旧数据是 period: month / limitAmount: 3000 / basis: value —— id 名叫 annual
    // 却按月存储，每月都重置满额，年度上限形同虚设。
    const cap = earnmore.caps.find((c) => c.id === EARNMORE_CAP);
    expect(cap).toBeDefined();
    expect(cap!.period).toBe('half_year');
    expect(cap!.basis).toBe('spend');
    expect(cap!.limitAmount).toBe(80_000);
    expect(cap!.limitCurrency).toBe('HKD');
    // id 必须与 period 自洽：旧 id 叫 annual，period 却是 month
    expect(cap!.id).toBe(EARNMORE_CAP);
  });

  it('额度未用时全额 2%', () => {
    const s = rankSingleCard(earnmore, [], params, hkdInput(TODAY))!;
    expect(s.grossCashback).toBeCloseTo(1000, 2); // 50000 × 2%
  });

  it('同一半年内额度用尽后，本笔全部回落 1%（不重置）', () => {
    const s = rankSingleCard(earnmore, [usedEntry('2026-H1', '2026', 80_000)], params, hkdInput('2026-05-31'))!;
    expect(s.grossCashback).toBeCloseTo(500, 2); // 50000 × 1%
    expect(s.capsAffected[0]!.remaining).toBe(0);
  });

  it('跨半年重置：H1 用尽不影响 H2', () => {
    const s = rankSingleCard(earnmore, [usedEntry('2026-H1', '2026', 80_000)], params, hkdInput(TODAY))!;
    expect(s.grossCashback).toBeCloseTo(1000, 2);
    expect(s.capsAffected[0]!.remaining).toBe(80_000);
  });

  it('跨年重置：去年 H1 用尽不影响今年 H2', () => {
    const s = rankSingleCard(earnmore, [usedEntry('2025-H1', '2025', 80_000)], params, hkdInput(TODAY))!;
    expect(s.grossCashback).toBeCloseTo(1000, 2);
  });

  it('部分用额：剩余额度内 2%，超出部分 1%', () => {
    const s = rankSingleCard(earnmore, [usedEntry('2026-H1', '2026', 40_000)], params, hkdInput('2026-05-31'))!;
    // 剩余 40000 按 2% = 800；超出 10000 按 1% = 100
    expect(s.grossCashback).toBeCloseTo(900, 2);
  });

  it('归集键必须跟着 period 走：half_year 上限不看 periodKey', () => {
    // 同月但不同半年的两条记录，只有属于本半年的那条计入
    const h1 = usedEntry('2026-H1', '2026', 30_000);
    const h2 = { ...usedEntry('2026-H2', '2026', 10_000), periodKey: '2026-10', occurredAt: '2026-10-10' };
    const agg = aggregateLedger([h1, h2], TODAY, { [EARNMORE_CAP]: 'half_year' });
    expect(agg.spentByCap[EARNMORE_CAP]).toBe(10_000);
  });
});

describe('B3 BCM：跨货币 0.5% / 跨境 1% 按正交事实组合（ADR-012）', () => {
  const bcm = card('bcm-world-mc');
  const base = { settlementCurrency: 'HKD' as const, region: 'MO' as const, today: TODAY, dualCurrencyLocal: false };

  it('数据层存在 splitRates，且声明了跨货币成分', () => {
    expect(bcm.fxFee.splitRates).toBeDefined();
    expect(bcm.fxFee.splitRates!.foreign).toBe(0.005);
    expect(bcm.fxFee.splitRates!.crossBorder).toBe(0.01);
    // 跨货币成分必须单列：它是「换币」事实对应的独立收费项
    expect(bcm.fxFee.splitRates!.crossCurrencyComponent).toBe(0.005);
    // rate 仍是 1.5%（两项之和 = 官方封顶值），不是被误改成某一单一路由的值
    expect(bcm.fxFee.rate).toBe(0.015);
  });

  it('仅跨境（币种相同）→ 1.0%，不含跨货币成分', () => {
    const r = resolveFxFee(bcm.fxFee, { ...base, route: 'crossBorder', crossCurrency: false, crossBorder: true });
    expect(r.rate).toBeCloseTo(0.01, 6);
  });

  it('换币 + 跨境 → 1.5% = 跨境 1% + 跨货币 0.5%（恰为官方「最多合共」封顶）', () => {
    const r = resolveFxFee(bcm.fxFee, {
      ...base,
      route: 'foreign',
      settlementCurrency: 'CNY',
      region: 'CN',
      crossCurrency: true,
      crossBorder: true,
    });
    expect(r.rate).toBeCloseTo(0.015, 6);
  });

  it('仅换币（澳门本地 HKD 结算）→ 0.5%，不收跨境费（B3 反转回归）', () => {
    // 修复前：foreign 路由无条件加跨境 1%，本地换币被收 1.5%（官方 0.5%，高估 3 倍）。
    const r = resolveFxFee(bcm.fxFee, { ...base, route: 'foreign', crossCurrency: true, crossBorder: false });
    expect(r.rate).toBeCloseTo(0.005, 6);
  });

  it('端到端：换币 + 跨境的外币签账成本按 1.5% 计', () => {
    // BCM 是 MOP 卡、发卡地澳门：内地商户以 HKD 结算 → 跨境且换币。
    // MOP 1000 × 1.5% = 15。
    const s = rankSingleCard(bcm, [], params, {
      amount: 1000,
      settlementCurrency: 'HKD',
      category: 'dining',
      channel: 'physical',
      region: 'CN',
      occurredAt: TODAY,
    })!;
    expect(s.route).toBe('foreign');
    expect(s.fxFee).toBeCloseTo(15, 2);
  });

  it('本币结算仍豁免，splitRates 不得绕过豁免判定', () => {
    const r = resolveFxFee(bcm.fxFee, {
      ...base,
      route: 'local',
      settlementCurrency: 'MOP',
      crossCurrency: false,
      crossBorder: false,
    });
    expect(r.rate).toBe(0);
    expect(r.exempt).toBe(true);
  });
});
