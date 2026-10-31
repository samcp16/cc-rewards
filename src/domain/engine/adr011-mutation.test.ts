/**
 * 变异验证（不是产品测试，是「证明测试有防护力」的元测试）。
 *
 * 为什么需要它：QA N3 指出上一轮的 1295 快照对 7 组变异全部失明——因为快照
 * 只覆盖了达标档，「把未达标档写成 10%」这种误改不会被任何断言看见。
 *
 * 本文件的做法：不修改卡库，而是在测试内构造一张「chill 但未达标档 = 10%」的
 * 变异卡，用它与基线比对。若比对结果仍然全绿，说明快照对该变异失明。
 *
 * 用 chill 是因为它是 N1 里高估最严重的一张（grocery 声明 0.4%、实测 5.344%），
 * 也是 ADR-011 §4a 的核心样本。
 */

import { describe, it, expect } from 'vitest';
import { rankSingleCard } from './index';
import { card, makeParams } from '../__fixtures__/params';
import { MATRIX_BASELINE } from '../__fixtures__/adr011-baseline';
import type { Card, LedgerEntry, SpendCategory } from '../types';

const params = makeParams();
const CHILL = 'boc-hk-chill';

/**
 * 变异体：把 chill 所有 binding 的 `fallback`（未达标档）从真实值改成 10%。
 *
 * 这正是 QA N1 描述的形态——门槛把 10% 套到了未达标侧。
 * 若快照只能看到达标档，这种变异会在所有记录上得到与基线相同的值。
 */
function mutatedChill(): Card {
  const base = card(CHILL);
  const th = base.thresholds[0]!;
  const mutatedBindings = Object.fromEntries(
    Object.entries(th.categoryBindings ?? {}).map(([cat, b]) => [cat, { ...b, fallback: { rate: 0.1 } }]),
  );
  return {
    ...base,
    thresholds: [{ ...th, categoryBindings: mutatedBindings }],
  };
}

function runOn(c: Card, category: string, state: string) {
  const ledger: LedgerEntry[] =
    state === 'empty'
      ? []
      : [
          {
            id: 'variation',
            cardId: CHILL,
            occurredAt: '2026-10-15',
            periodKey: '2026-10',
            quarterKey: '2026-Q4',
            yearKey: '2026',
            halfYearKey: '2026-H2',
            amount: 100000,
            currency: 'HKD',
            category: 'dining',
            channel: 'physical',
            capConsumption: {},
            thresholdContribution: { 'boc-hk-chill:physical-spend': 15000 },
            channelFreeConsumption: {},
            earnedCashback: 0,
            earnedPoints: 0,
            createdAt: '2026-10-15T00:00:00.000Z',
          },
        ];
  return rankSingleCard(c, ledger, params, {
    amount: 1000, // 只与快照的 1000 档行比对（3000/8000 档由基线测试逐值钉住）
    settlementCurrency: 'MOP',
    category: category as SpendCategory,
    channel: 'physical',
    region: 'MO',
    occurredAt: '2026-10-31',
  });
}

describe('变异验证：快照必须能看见「未达标档被写成 10%」', () => {
  it('变异后与基线的差异条数 > 0（失明则等于 0）', () => {
    const mutated = mutatedChill();
    const rows = MATRIX_BASELINE.filter(
      (r) => r.cardId === CHILL && r.channel === 'physical' && r.amount === 1000,
    );

    const diffs: string[] = [];
    for (const row of rows) {
      const s = runOn(mutated, row.category, row.state);
      const actual = {
        status: s?.status ?? 'null',
        grossCashback: s?.grossCashback ?? null,
        pointsValue: s?.pointsValue ?? null,
        netRealistic: s?.netRealistic ?? null,
        fxFee: s?.fxFee ?? null,
        channelFee: s?.channelFee ?? null,
        warnings: (s?.warnings ?? []).map((w) => w.code).join(','),
        capsAffected: (s?.capsAffected ?? []).map((c) => c.capId).sort().join(','),
      };
      if (JSON.stringify(actual) !== JSON.stringify(row.expect)) {
        diffs.push(`${row.category}/${row.state}`);
      }
    }

    // 若这条断言变红（diffs 为空），说明快照对未达标档失明 —— 必须修快照而不是删断言
    expect(diffs.length).toBeGreaterThan(0);
  });

  it('差异必须落在「未达标」态（证明快照真的读到了未达标档）', () => {
    const mutated = mutatedChill();
    const rows = MATRIX_BASELINE.filter(
      (r) => r.cardId === CHILL && r.channel === 'physical' && r.amount === 1000,
    );

    const changedStates = rows
      .filter((row) => {
        const s = runOn(mutated, row.category, row.state);
        const actual = {
          status: s?.status ?? 'null',
          grossCashback: s?.grossCashback ?? null,
          pointsValue: s?.pointsValue ?? null,
          netRealistic: s?.netRealistic ?? null,
          fxFee: s?.fxFee ?? null,
          channelFee: s?.channelFee ?? null,
          warnings: (s?.warnings ?? []).map((w) => w.code).join(','),
        };
        return JSON.stringify(actual) !== JSON.stringify(row.expect);
      })
      .map((row) => row.state);

    expect(changedStates).toContain('empty');
  });

  it('变异只影响被 binding 点名的类别，grocery 岿然不动（新模型的结构性保证）', () => {
    const mutated = mutatedChill();
    const s = runOn(mutated, 'grocery', 'empty');
    // grocery 不在 categoryBindings 里 → 结构上不存在「被门槛污染」的路径。
    // 这是 ADR-011 相对 N1 的正面差异：旧模型下它会被套成 10%。
    expect(s?.grossCashback).toBeCloseTo(4, 2);
  });

  it('变异确实影响到被点名的类别（dining 未达标 0.4% → 10%）', () => {
    const mutated = mutatedChill();
    const s = runOn(mutated, 'dining', 'empty');
    // 1000 MOP × 10% = 100（真实值该是 4）
    expect(s?.grossCashback).toBeCloseTo(100, 2);
  });
});
