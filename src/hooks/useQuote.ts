/**
 * 报价 hook：把 Dexie 里的卡库 + 账本 + 用户设置喂给引擎，产出排序结果。
 *
 * 这一层存在的意义是「组件里不写计算逻辑」：页面只拿到 `result` 与状态标志，
 * 不 import rankCards，也不 import db。想改「要不要把停用卡排除」「要不要叠加积分」
 * 只改这里一处。
 */

import { useMemo } from 'react';
import { rankCards } from '../domain/engine';
import type { SpendInput } from '../domain/types';
import type { RankResult } from '../domain/types.result';
import { useCards, useLedger } from '../db/useDb';
import { useEngineParams } from '../db/paramsRepository';

export type QuoteState =
  | { kind: 'loading' }
  | { kind: 'ready'; result: RankResult; ledgerEmpty: boolean };

/** 主查询页与额度页共用的一次完整测算 */
export function useQuote(input: SpendInput): QuoteState {
  const { cards, loaded: cardsLoaded } = useCards();
  const { ledger, loaded: ledgerLoaded } = useLedger();
  const { params, loaded: paramsLoaded } = useEngineParams(cards);

  const result = useMemo(
    () => (cardsLoaded && ledgerLoaded && paramsLoaded ? rankCards(cards, ledger, params, input) : null),
    [cards, ledger, params, input, cardsLoaded, ledgerLoaded, paramsLoaded],
  );

  if (!result) return { kind: 'loading' };
  return { kind: 'ready', result, ledgerEmpty: ledger.length === 0 };
}
