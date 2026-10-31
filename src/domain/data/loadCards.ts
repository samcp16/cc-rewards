/**
 * 卡库加载（校验逻辑在 loadCards.validate.ts / loadCards.threshold.ts）。
 *
 * 本文件只做三件事：读取 JSON、按顺序调用校验、导出单例与查询函数。
 * 校验规则本身不在这里 —— 它有两百多行且会继续增长，与「加载」不是同一个职责。
 */

import type { Card } from '../types';
import rawCards from '../../../data/cards-hk-mo.json';
import { CardDataError, assertArray } from './loadCards.assert';
import { validateCard } from './loadCards.validate';

export { CardDataError } from './loadCards.assert';

/** 校验并加载预置卡库。任何一条不合格即抛错，绝不跳过坏数据。 */
export function loadCards(raw: unknown = rawCards): Card[] {
  const list = assertArray(raw, 'root');
  const seen = new Set<string>();
  return list.map((item, i) => {
    const card = validateCard(item, i);
    if (seen.has(card.cardId)) {
      throw new CardDataError(`cardId 重复：${card.cardId}（凭记忆书写的 id 容易与真实库不符）`);
    }
    seen.add(card.cardId);
    return card;
  });
}

/** 预置卡库单例（已在模块加载时校验） */
export const CARDS: Card[] = loadCards();

/** SPEC §3.2 锁定的 12 张预置精选 */
export const PRESET_CARD_IDS: readonly string[] = [
  'sc-simply-cash',
  'citi-cash-back',
  'hang-seng-enjoy',
  'boc-hk-chill',
  'boc-hk-cheers',
  'mox-credit',
  'aeon-wakuwaku',
  'amex-hk-explorer',
  'tai-fung-unionpay-dual',
  'bcm-world-mc',
  'bnu-world-mc',
  'earnmore-unionpay',
] as const;

export function getCardById(cardId: string): Card | undefined {
  return CARDS.find((c) => c.cardId === cardId);
}
