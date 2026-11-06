/**
 * 数据订阅层（Dexie + useLiveQuery）。
 *
 * 本文件是「数据库 → React」的唯一入口。组件只调这里的 hook，
 * 不直接 import db —— 否则「数据变了自动重算」这件事会在各页面各写一遍，
 * 漏一处就变成「改完卡库，主查询页还是旧结果」。
 *
 * 为什么都要给 `?? []` 兜底：useLiveQuery 首次返回 undefined（读取还没完成）。
 * 若直接把它传给引擎，rankCards 会在空数组上返回「所有卡都缺数据」的空态，
 * 然后几十毫秒后被真实数据覆盖 —— 用户会看到一次一闪而过的错误文案。
 * 所以返回值里同时给出 `loaded`，由 UI 决定「还没读完」时不渲染结果区。
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from './schema';
import type { CardRow } from './schema';
import { KEY_DELETED_PRESETS } from './cardsRepository';
import { KEY_HIDDEN_ISSUERS } from './hiddenIssuersRepository';
import type { LedgerEntry } from '../domain/types';

export interface CardsState {
  cards: CardRow[];
  loaded: boolean;
}

export function useCards(): CardsState {
  const rows = useLiveQuery(() => db.cards.toArray(), []);
  return { cards: rows ?? [], loaded: rows !== undefined };
}

export interface CardState {
  card: CardRow | undefined;
  /** false = 还没读完；true 且 card 为 undefined = 这张卡真的不在了 */
  loaded: boolean;
}

export function useCard(cardId: string | undefined): CardState {
  // 用 null 表示「读完了但不存在」，与 undefined（还没读完）区分开
  const row = useLiveQuery(async () => {
    if (!cardId) return null;
    return (await db.cards.get(cardId)) ?? null;
  }, [cardId]);
  return { card: row ?? undefined, loaded: row !== undefined };
}

export interface LedgerState {
  ledger: LedgerEntry[];
  loaded: boolean;
}

export function useLedger(): LedgerState {
  const rows = useLiveQuery(() => db.ledger.toArray(), []);
  return { ledger: rows ?? [], loaded: rows !== undefined };
}

export function useLedgerForCard(cardId: string | undefined): LedgerEntry[] {
  const rows = useLiveQuery(
    async () => (cardId ? db.ledger.where('cardId').equals(cardId).toArray() : []),
    [cardId],
  );
  return rows ?? [];
}

export type { CardRow };

/**
 * 用户从卡库里删掉过的预置卡 id。
 *
 * 用途只有一个：添加卡片页不再把这些卡列出来。
 * 用户删掉它 = 我不用这张，那就别在他每次添加新卡时反复推荐同一张。
 * 注意这是「不再显示」，不是「永久禁止添加」—— 页面上的「显示全部」能翻出来。
 */
export function useDeletedPresetIds(): ReadonlySet<string> {
  const row = useLiveQuery(() => db.settings.get(KEY_DELETED_PRESETS), []);
  return useMemo(() => {
    const ids = (row?.value as { ids?: string[] } | undefined)?.ids;
    return new Set<string>(Array.isArray(ids) ? ids : []);
  }, [row]);
}

/**
 * 用户主动藏起来的银行（`region|issuer`）。
 *
 * 与「已删预置卡」分开两个键，是因为恢复必须精确：
 * 清空隐藏名单只能让银行回到候选列表，不能顺带把用户真删掉的卡复活。
 */
export function useHiddenIssuers(): ReadonlySet<string> {
  const row = useLiveQuery(() => db.settings.get(KEY_HIDDEN_ISSUERS), []);
  return useMemo(() => {
    const keys = (row?.value as { keys?: string[] } | undefined)?.keys;
    return new Set<string>(Array.isArray(keys) ? keys : []);
  }, [row]);
}
