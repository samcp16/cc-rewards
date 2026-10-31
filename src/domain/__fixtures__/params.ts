/**
 * 测试夹具：把卡库与默认参数装配成引擎可直接调用的形状。
 */

import { CARDS, getCardById } from '../data/loadCards';
import { DEFAULT_FX_TABLE } from '../fx/fxReference';
import { DEFAULT_CHANNEL_FEES } from '../data/channelFees';
import { buildPointValuations } from '../fx/pointValuation';
import type { Card, EngineParams, LedgerEntry, SpendInput } from '../types';

export const TODAY = '2026-10-31';

export function makeParams(overrides: Partial<EngineParams> = {}): EngineParams {
  return {
    fx: DEFAULT_FX_TABLE,
    channelFees: DEFAULT_CHANNEL_FEES,
    pointValuations: buildPointValuations(CARDS),
    today: TODAY,
    ...overrides,
  };
}

/** 澳门主场景：MOP 结算、实体刷卡、商户在澳门 */
export const MO_PHYSICAL: Omit<SpendInput, 'amount'> = {
  settlementCurrency: 'MOP',
  category: 'dining',
  channel: 'physical',
  region: 'MO',
};

export function card(cardId: string): Card {
  const c = getCardById(cardId);
  if (!c) throw new Error(`测试夹具里找不到卡 ${cardId}，先确认 cardId 与卡库一致`);
  return c;
}

export function ledgerEntry(over: Partial<LedgerEntry> & Pick<LedgerEntry, 'cardId'>): LedgerEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: '2026-10-15',
    periodKey: '2026-10',
    quarterKey: '2026-Q4',
    yearKey: '2026',
    halfYearKey: '2026-H2',
    amount: 1000,
    currency: 'HKD',
    category: 'dining',
    channel: 'physical',
    capConsumption: {},
    thresholdContribution: {},
    channelFreeConsumption: {},
    earnedCashback: 0,
    earnedPoints: 0,
    createdAt: '2026-10-15T00:00:00.000Z',
    ...over,
  };
}
