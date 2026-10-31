/**
 * Dexie 表结构（SPEC §5 / F7）。
 *
 * 三张表的划分依据是「谁的生命周期跟谁走」：
 *
 * - `cards`    用户卡库。**可删可改**，含预置 12 张（source: 'preset'）与自建卡（source: 'user'）。
 * - `ledger`   账本（F5 的「记一笔」写入）。上限归集与门槛定档的唯一数据来源。
 * - `settings` 键值单表。汇率表、积分覆盖、上次导出时间、安装引导冷却都放这里。
 *
 * 为什么卡库里存整张 Card 而不是「cardId + 覆盖项」：
 * 用户改的是规则本身（费率、上限口径），不是「对预置卡的备注」。存成差量会让
 * 「预置数据升级」与「用户改动」两件事互相污染 —— 引擎拿到的必须是**确定的**一份规则。
 *
 * 为什么不给 cards 建索引以外的东西：数据量上限 30 张卡（SPEC §10），
 * 全表读进内存再过滤比任何查询优化都快。
 */

import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Card, LedgerEntry } from '../domain/types';

/** 卡的来源。预置卡可被编辑、可被删除，来源只用于展示与「恢复预置」的判断。 */
export type CardSource = 'preset' | 'user';

/**
 * 卡库行 = 领域卡 + 应用层字段。
 *
 * 注意 `origin` 而不是 `source`：领域层的 `Card.source` 已经是「数据来源链接数组」
 * （SourceRef[]），两者同名会让 `CardRow extends Card` 直接类型冲突。
 * 命名上「origin（这张卡哪来的）」与「source（这条规则哪查的）」本来就是两件事。
 */
export interface CardRow extends Card {
  /** 'preset' = 首次启动从预置 12 张导入；'user' = 用户自建或按模板建的副本 */
  origin: CardSource;
  /** 用户可改昵称；为空时 UI 回落到 cardName */
  nickname?: string;
  /** 写入/更新时间，ISO */
  updatedAt: string;
}

/** 设置项。单表 KV，值类型在读取处收窄（见 settingsRepository）。 */
export interface SettingRow {
  key: string;
  value: unknown;
}

export class RewardsDatabase extends Dexie {
  cards!: Table<CardRow, string>;
  ledger!: Table<LedgerEntry, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'cc-rewards') {
    super(name);
    // 主键显式声明：cardId 是字符串，不能靠 ++id 自增
    this.version(1).stores({
      cards: 'cardId, issuerRegion, origin',
      ledger: 'id, cardId, periodKey, yearKey',
      settings: 'key',
    });
  }
}

export const db = new RewardsDatabase();
