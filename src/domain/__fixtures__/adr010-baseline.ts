/**
 * ADR-010 回归基线夹具（数据在 adr010-baseline.json）。
 *
 * 为什么数据放 JSON、类型与加载放这里：
 *
 * 1. 这是一份**不可变快照**，不是代码。写成 .ts 字面量会让一个 38 万字符的
 *    数据文件进入类型检查、lint 与打包分析，而它没有任何逻辑可被检查。
 * 2. 300 行门禁的意图是「一个文件一个职责」。原 .ts 版本是纯数据、职责唯一，
 *    但 1.8 万行会让任何一次 diff 都无法阅读，也让 IDE 打开即卡。
 * 3. JSON 是这份数据的原生形态，工具链（diff、jq、编辑器格式化）都直接支持。
 *
 * 纪律：**不要为了让测试变绿而改这个 JSON**。它红说明改动产生了非预期影响，
 * 应当先解释清楚为什么某个值该变，再考虑是否是新基线。
 *
 * 快照口径：38 卡 × 5 渠道 × 7 类别 = 1330 组合，参数固定
 * amount=2000 / MOP / region=MO / 账本为空 / today=2026-10-31。
 * 本文件只保留 37 张非 tai-fung 卡的记录（tai-fung 是 ADR-010 有意变更的对象），
 * 即 1295 条。
 */

import raw from './adr010-baseline.json';

export interface BaselineRow {
  cardId: string;
  channel: string;
  category: string;
  expect: {
    status: string;
    grossCashback: number | null;
    pointsValue: number | null;
    netRealistic: number | null;
    fxFee: number | null;
    channelFee: number | null;
    warnings: string;
  };
}

export const BASELINE: BaselineRow[] = raw as BaselineRow[];
