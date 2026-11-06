/**
 * 卡库首次初始化 + 仓储操作（F2 / F7）。
 *
 * 一个必须讲清楚的取舍：**只在卡库从未初始化过时导入预置 12 张**。
 * 用户把 12 张全删了、下次打开又冒出来 12 张，会让「删除」变成假的 ——
 * 那是比「卡库为空」更严重的信任问题。所以用 settings 里的 `cardsSeeded` 标记
 * 记录「已经播过种」，而不是「表里有没有数据」。
 *
 * 预置卡来源是 `data/cards-hk-mo.json` 的 38 张全量库中的 SPEC §3.2 精选 12 张
 * （loadCards 的 PRESET_CARD_IDS）。为什么不是 38 张：19 张返现侧字段空白，
 * 全量导入会让用户看到一片「未知」，把「我们没查到」读成「这些卡不好」。
 */

import { db } from './schema';
import type { CardRow } from './schema';
import { PRESET_CARD_IDS, getCardById } from '../domain/data/loadCards';
import type { Card } from '../domain/types';
import { todayKey } from '../hooks/buildDefaultParams';

/** settings 表里的内部键，UI 不展示 */
export const KEY_CARDS_SEEDED = 'cardsSeeded';

/** 预置卡数据版本（本地库里已同步到哪一版） */
export const KEY_CARDS_DATA_VERSION = 'cardsDataVersion';

/** 用户删掉过的预置卡 id —— 升级时不能再把它们塞回来 */
export const KEY_DELETED_PRESETS = 'deletedPresetCards';

/**
 * 卡库数据版本。**每次修改 `data/cards-hk-mo.json` 必须 +1。**
 *
 * 为什么要这个数字：卡库在构建时被内联进 JS，但用户手机上的 IndexedDB
 * 早在第一次打开时就播种完了，`seedCardsIfNeeded` 之后永远返回 false。
 * 没有版本号的话，我们补多少数据都送不到用户手机上 —— 他看到的永远是
 * 第一次安装那天的数据。这正是「修了等于没修」的根源。
 */
export const CARDS_DATA_VERSION = 2;


/** 深拷贝，防止用户编辑预置卡时改到 loadCards 的模块级单例 */
function cloneCard(card: Card): Card {
  return JSON.parse(JSON.stringify(card)) as Card;
}

function toRow(card: Card, origin: CardRow['origin']): CardRow {
  return { ...card, origin, updatedAt: todayKey() };
}

/**
 * SPEC §3.2 的 12 张预置卡，按数据顺序导出，供模板选择器直接使用。
 * 不读 Dexie：模板选择器要展示「可添加的模板」，与用户已有的卡是两件事。
 */
export function presetTemplates(): Card[] {
  return PRESET_CARD_IDS.map((id) => getCardById(id)).filter((c): c is Card => Boolean(c));
}

/** 首次启动播种。已播过种则什么都不做（幂等）。返回是否真的写入了数据。 */
export async function seedCardsIfNeeded(): Promise<boolean> {
  const seeded = await db.settings.get(KEY_CARDS_SEEDED);
  if (seeded) return false;

  const rows = presetTemplates().map((card) => toRow(cloneCard(card), 'preset'));
  // 事务包住「写卡 + 打标记」：中途失败不能留下「有卡但没标记」的半初始化状态，
  // 否则下次启动会重复追加 12 张同 id 的卡（主键冲突 → 整次播种失败 → 死循环）。
  await db.transaction('rw', db.cards, db.settings, async () => {
    await db.cards.bulkPut(rows);
    await db.settings.put({ key: KEY_CARDS_SEEDED, value: { at: todayKey(), count: rows.length } });
    // 播种写的就是当前版本的数据，版本号一并落库 —— 否则新用户每次启动
    // 都会白跑一次 sync（12 次 put + 1 次写版本），纯属浪费。
    await db.settings.put({ key: KEY_CARDS_DATA_VERSION, value: { version: CARDS_DATA_VERSION } });
  });
  return true;
}

/**
 * 预置卡数据升级：把内置卡库的新数据同步到已有用户的本地库里。
 *
 * 三条保护，缺一条都会伤到用户：
 * 1. **用户删掉的预置卡不加回来**。删了又冒出来 = 「删除」是假的。
 * 2. **用户改过的行不覆盖**（`editedByUser`）。他调过的值就是他的真实情况。
 * 3. **用户自建/模板副本（`-copy` 后缀、origin='user'）不碰**，按 id 逐条比对。
 *
 * 返回 {updated, kept}：kept 是被保护而跳过的数量，用于设置页如实汇报。
 */
export async function syncPresetCardsIfOutdated(): Promise<{ updated: number; kept: number }> {
  const versionRow = await db.settings.get(KEY_CARDS_DATA_VERSION);
  const localVersion =
    typeof (versionRow?.value as { version?: number } | undefined)?.version === 'number'
      ? (versionRow?.value as { version: number }).version
      : 0;
  if (localVersion >= CARDS_DATA_VERSION) return { updated: 0, kept: 0 };

  const deletedRow = await db.settings.get(KEY_DELETED_PRESETS);
  const deleted = new Set<string>(
    Array.isArray((deletedRow?.value as { ids?: string[] } | undefined)?.ids)
      ? ((deletedRow?.value as { ids: string[] }).ids)
      : [],
  );

  const rows = presetTemplates().map((card) => toRow(cloneCard(card), 'preset'));
  let updated = 0;
  let kept = 0;

  await db.transaction('rw', db.cards, db.settings, async () => {
    for (const row of rows) {
      if (deleted.has(row.cardId)) {
        kept += 1;
        continue;
      }
      const existing = await db.cards.get(row.cardId);
      // 用户亲手改过 → 保留他的那份，不覆盖
      if (existing?.editedByUser === true) {
        kept += 1;
        continue;
      }
      await db.cards.put(row);
      updated += 1;
    }
    await db.settings.put({
      key: KEY_CARDS_DATA_VERSION,
      value: { version: CARDS_DATA_VERSION, at: todayKey() },
    });
  });

  return { updated, kept };
}

/** 从模板创建一份新的卡行（尚未写库）。id 加后缀避免与已有卡主键冲突。 */
export function cardFromTemplate(template: Card, existingIds: Set<string>): CardRow {
  let suffix = 2;
  let cardId = `${template.cardId}-copy`;
  while (existingIds.has(cardId)) {
    cardId = `${template.cardId}-copy${String(suffix)}`;
    suffix += 1;
  }
  return {
    ...cloneCard(template),
    cardId,
    confidence: 'user_provided',
    origin: 'user',
    updatedAt: todayKey(),
  };
}

/** 空白卡：只有骨架，费率字段留空，由用户填（AC-F2-04 阻止空费率保存）。 */
export function blankCard(id: string): CardRow {
  const emptyCategory = { kind: 'unknown' as const };
  return {
    cardId: id,
    issuer: '',
    issuerRegion: 'HK',
    cardName: '',
    network: 'visa',
    cardCurrency: 'HKD',
    annualFee: { amount: 0, currency: 'HKD' },
    fxFee: {
      rate: 0,
      fixedFee: 0,
      waivedWhen: {},
      source: { url: '', verifiedAt: todayKey() },
    },
    categories: {
      dining: emptyCategory,
      grocery: emptyCategory,
      fuel: emptyCategory,
      flight: emptyCategory,
      hotel: emptyCategory,
      online: emptyCategory,
      other: emptyCategory,
    },
    caps: [],
    thresholds: [],
    pointsValuation: null,
    source: [],
    verifiedAt: todayKey(),
    confidence: 'user_provided',
    origin: 'user',
    updatedAt: todayKey(),
  };
}

export async function putCard(row: CardRow): Promise<void> {
  // 只有用户操作才会走到这里（播种用 bulkPut，绕开本函数），
  // 所以这一行就等价于「用户亲手确认过」。卡库升级时靠它避让。
  await db.cards.put({ ...row, editedByUser: true, updatedAt: todayKey() });
}

export async function deleteCard(cardId: string): Promise<void> {
  // 账本刻意不删：它是历史记录，卡没了之后这些条目只是不再参与计算。
  // 删除确认文案里必须写明这一点（card-detail.md §7）。
  await db.transaction('rw', db.cards, db.settings, async () => {
    const card = await db.cards.get(cardId);
    await db.cards.delete(cardId);
    // 删的是预置卡就留个记号，否则下次卡库升级会把它塞回来
    if (card?.origin !== 'preset') return;
    const row = await db.settings.get(KEY_DELETED_PRESETS);
    const prev = (row?.value as { ids?: string[] } | undefined)?.ids;
    const ids = Array.isArray(prev) ? prev : [];
    if (ids.includes(cardId)) return;
    await db.settings.put({ key: KEY_DELETED_PRESETS, value: { ids: [...ids, cardId] } });
  });
}

/** 一键确认「我核对过了」（AC-F6-02）。预置卡同样允许，改的是用户自己的副本。 */
export async function touchVerified(cardId: string): Promise<void> {
  const card = await db.cards.get(cardId);
  if (!card) return;
  await db.cards.put({ ...card, verifiedAt: todayKey(), updatedAt: todayKey() });
}
