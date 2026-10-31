/**
 * 应用层装配：把卡库、汇率表、渠道规则、积分估值组合成引擎可用的 EngineParams。
 *
 * 为什么不在 domain 里做这件事：domain 是纯函数层，不认识「默认值从哪来」。
 * 装配属于应用层职责 —— 换成 Dexie 里的用户数据后，只需改这一处，
 * 引擎完全不知情（ARCHITECTURE §5 的依赖方向）。
 *
 * 为什么 index.ts 与这里各有一份「参数」概念：
 *   - `buildDefaultParams()` 是**没有用户数据时的兜底**（首屏就能算）；
 *   - 接了 Dexie 之后由 `useEngineParams()` 覆盖 fx / pointValuations。
 * 两者共存是刻意的：卡库为空时产品不能变成白屏，仍要能给出参考结果。
 */

import { CARDS } from '../domain/data/loadCards';
import { DEFAULT_CHANNEL_FEES } from '../domain/data/channelFees';
import { DEFAULT_FX_TABLE } from '../domain/fx/fxReference';
import { buildPointValuations } from '../domain/fx/pointValuation';
import type { EngineParams } from '../domain/types';

/**
 * 今天是哪一天 —— 引擎的所有时效判断（90 天过期、60 天即将到期、
 * 豁免是否失效）都以它为准。
 *
 * 用本地日期而非 UTC：用户按自己的日历判断「这个月还剩几天」，
 * 用 UTC 会在东八区晚上 8 点后把日期算成第二天，导致月度上限提前归零。
 */
export function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 未接入用户数据时的默认参数。 */
export function buildDefaultParams(today: string = todayKey()): EngineParams {
  return {
    fx: DEFAULT_FX_TABLE,
    channelFees: DEFAULT_CHANNEL_FEES,
    pointValuations: buildPointValuations(CARDS),
    today,
  };
}
