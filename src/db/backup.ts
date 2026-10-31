/**
 * 备份导出 / 导入（F7，AC-F7-02 ~ 05）。
 *
 * 三个硬约束：
 *
 * 1. **先校验后写入**：整个文件先过一遍结构校验，任何一条不合格就整体拒绝，
 *    并列出缺哪个字段（设置页要把它显示给用户，见 settings.md §5.3 步骤 2a）。
 * 2. **写入包在一个事务里**：任一步失败整体回滚，现有卡库保持原样（AC-F7-05）。
 * 3. **冲突不静默覆盖**：同名（同 cardId 或同 cardName）时由调用方选
 *    「覆盖 / 保留两者 / 取消」（AC-F7-04）。本文件只提供两种执行方式。
 */

import { db } from './schema';
import type { CardRow } from './schema';
import type { LedgerEntry } from '../domain/types';
import { todayKey } from '../hooks/buildDefaultParams';

export const BACKUP_KIND = 'cc-rewards-backup';

export interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: 1;
  exportedAt: string;
  cards: CardRow[];
  ledger: LedgerEntry[];
}

export interface ValidationResult {
  ok: boolean;
  /** 缺失或类型错误的字段路径，UI 原样展示（mono 字体） */
  problems: string[];
  data?: BackupFile;
}

const REQUIRED_CARD_FIELDS = ['cardId', 'cardName', 'issuer', 'issuerRegion', 'network', 'cardCurrency'];

/** 结构校验。刻意不用 zod：只需要这十几个字段的判断，引入校验库会让首包大 12KB。 */
export function validateBackup(raw: unknown): ValidationResult {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, problems: ['文件内容不是 JSON 对象'] };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== BACKUP_KIND) problems.push('kind');
  if (obj.version !== 1) problems.push('version');

  const cards = obj.cards;
  if (!Array.isArray(cards)) {
    problems.push('cards');
  } else {
    cards.forEach((cardRaw, i) => {
      if (typeof cardRaw !== 'object' || cardRaw === null) {
        problems.push(`cards[${String(i)}]`);
        return;
      }
      const card = cardRaw as Record<string, unknown>;
      for (const field of REQUIRED_CARD_FIELDS) {
        if (typeof card[field] !== 'string' || card[field] === '') {
          problems.push(`cards[${String(i)}].${field}`);
        }
      }
      const fxFee = card.fxFee as Record<string, unknown> | undefined;
      if (!fxFee || typeof fxFee.rate !== 'number') problems.push(`cards[${String(i)}].fxFee.rate`);
      const categories = card.categories as Record<string, unknown> | undefined;
      if (!categories || typeof categories !== 'object') problems.push(`cards[${String(i)}].categories`);
    });
  }

  const ledger = obj.ledger;
  if (!Array.isArray(ledger)) problems.push('ledger');

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, problems: [], data: raw as BackupFile };
}

/** 生成备份对象并触发下载。返回文件名，供 Toast 使用。 */
export async function exportBackup(): Promise<{ fileName: string; cardCount: number; ledgerCount: number }> {
  const [cards, ledger] = await Promise.all([db.cards.toArray(), db.ledger.toArray()]);
  const payload: BackupFile = {
    kind: BACKUP_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    cards,
    ledger,
  };
  const fileName = `shuanazhang-${todayKey()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 立刻 revoke 会让 Safari 有时拿不到内容，延迟一拍
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
  return { fileName, cardCount: cards.length, ledgerCount: ledger.length };
}

export type ConflictPolicy = 'overwrite' | 'keep-both';

/** 与现有卡库重名的卡（同 cardId 或同 cardName），供 UI 列出具体是哪几张 */
export function findConflicts(incoming: CardRow[], existing: CardRow[]): CardRow[] {
  const ids = new Set(existing.map((c) => c.cardId));
  const names = new Set(existing.map((c) => c.cardName));
  return incoming.filter((c) => ids.has(c.cardId) || names.has(c.cardName));
}

/**
 * 执行导入。整体在一个事务里，任一步抛错即回滚。
 * `keep-both` 时把冲突卡重新发号并加「（导入）」后缀，绝不丢数据。
 */
export async function applyImport(
  data: BackupFile,
  policy: ConflictPolicy,
): Promise<{ cards: number; ledger: number; renamed: number }> {
  const existing = await db.cards.toArray();
  const existingIds = new Set(existing.map((c) => c.cardId));
  const conflicts = findConflicts(data.cards, existing);
  const conflictIds = new Set(conflicts.map((c) => c.cardId));

  let renamed = 0;
  const prepared = data.cards.map((card) => {
    if (policy === 'overwrite' || !conflictIds.has(card.cardId)) return card;
    renamed += 1;
    let n = 1;
    let nextId = `${card.cardId}-imported`;
    while (existingIds.has(nextId)) {
      n += 1;
      nextId = `${card.cardId}-imported${String(n)}`;
    }
    existingIds.add(nextId);
    return { ...card, cardId: nextId, cardName: `${card.cardName}（导入）` };
  });

  await db.transaction('rw', db.cards, db.ledger, async () => {
    await db.cards.bulkPut(prepared);
    // 账本按 id 去重：同一条记录重复导入不能变成两笔（那会把已用额度翻倍）
    await db.ledger.bulkPut(data.ledger);
  });

  return { cards: prepared.length, ledger: data.ledger.length, renamed };
}
