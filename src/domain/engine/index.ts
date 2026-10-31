/**
 * 引擎编排 —— 对外唯一入口，只做装配。
 *
 * 执行次序不可调换（SPEC §6.2）：
 *   0. 结算路由 → 1. 定档 → 2. 毛返现（排他组） → 3. 封顶 → 4. 外币手续费 → 5. 渠道费 → 6. 排序
 *
 * 「先封顶后定档」会把高档额度错记到低档上，这是本文件必须守住的顺序。
 * 本文件不含算法实现，各步分别在 settlementRoute / thresholds / earn / caps / fees / rank。
 */

import type { Card, CurrencyCode, EngineParams, LedgerEntry, SpendCategory, SpendInput } from '../types';
import type { RankResult, Scheme } from '../types.result';
import { evaluateCard } from './evaluateCard';
import { aggregateLedger } from './aggregate';
import { rankSchemes, splitUnknown } from './rank';
import { isCardActive } from './fees';

const VALID_CATEGORIES: ReadonlySet<string> = new Set<SpendCategory>([
  'dining',
  'grocery',
  'fuel',
  'flight',
  'hotel',
  'online',
  'other',
]);

const VALID_CURRENCIES: ReadonlySet<string> = new Set<CurrencyCode>(['MOP', 'HKD', 'CNY']);

function validateInput(input: SpendInput): RankResult['rejectReason'] | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { code: 'invalid_amount', amount: input.amount };
  }
  if (!VALID_CURRENCIES.has(input.settlementCurrency)) {
    return { code: 'invalid_currency', currency: String(input.settlementCurrency) };
  }
  if (!VALID_CATEGORIES.has(input.category)) {
    return { code: 'invalid_category', category: String(input.category) };
  }
  return null;
}

function echoInput(input: SpendInput): RankResult['input'] {
  return {
    amount: input.amount,
    settlementCurrency: input.settlementCurrency,
    category: input.category,
    channel: input.channel,
  };
}

/**
 * 主入口：对卡库中每张卡计算净回报，返回已排序结果。
 *
 * 返回结构里 ranked 与 unranked 分开：unknown 卡绝不混进排序列表，
 * 否则前端一不留神就会按 0 渲染成「不划算」。
 */
export function rankCards(
  cards: Card[],
  ledger: LedgerEntry[],
  params: EngineParams,
  input: SpendInput,
): RankResult {
  const reject = validateInput(input);
  if (reject) {
    return { ok: false, rejectReason: reject, ranked: [], unranked: [], fxNotes: [], input: echoInput(input) };
  }

  const occurredAt = input.occurredAt ?? params.today;
  // 每个上限池自己的周期口径：年度上限不能被本月条目误扣，反之亦然
  const capPeriods: Record<string, 'month' | 'year' | 'half_year'> = {};
  for (const c of cards) {
    for (const cap of c.caps) capPeriods[cap.id] = cap.period;
  }
  const aggregates = aggregateLedger(ledger, occurredAt, capPeriods);
  const fxNotes = new Set<string>();

  const schemes: Scheme[] = [];
  for (const card of cards) {
    if (!isCardActive(card)) continue;
    schemes.push(evaluateCard(card, params, input, occurredAt, aggregates, fxNotes));
  }

  const { ranked, unranked } = splitUnknown(schemes);

  return {
    ok: true,
    ranked: rankSchemes(ranked),
    unranked,
    fxNotes: [...fxNotes],
    input: echoInput(input),
  };
}

/** 单卡快捷入口，供详情页与单测使用 */
export function rankSingleCard(
  card: Card,
  ledger: LedgerEntry[],
  params: EngineParams,
  input: SpendInput,
): Scheme | null {
  const result = rankCards([card], ledger, params, input);
  return result.ranked[0] ?? result.unranked[0] ?? null;
}
