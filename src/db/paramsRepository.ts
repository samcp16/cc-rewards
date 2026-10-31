/**
 * 引擎参数装配（应用层）：把 Dexie 里的用户设置叠到默认参数上。
 *
 * 依赖方向（ARCHITECTURE §5）：domain 不认识「默认值从哪来」，装配只发生在这里和
 * buildDefaultParams。所以本文件允许 import db，domain 里的文件不允许。
 *
 * 三件事：
 * 1. 汇率表：用户改过的折算率（SPEC §6.5 允许用户在设置页调）
 * 2. 积分估值：用户覆盖优先于官方固定值，官方固定值优先于保守下限
 * 3. `today`：引擎所有时效判断的唯一时间源
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import type { EngineParams } from '../domain/types';
import type { Card } from '../domain/types';
import { buildDefaultParams, todayKey } from '../hooks/buildDefaultParams';
import { loadFxTable, loadPointOverrides } from './settingsRepository';
import type { PointOverride } from './settingsRepository';
import { CONSERVATIVE_VALUE_PER_POINT } from '../domain/fx/pointValuation';

/** 积分估值叠加：用户覆盖 > 卡数据里的官方固定值 > 保守下限 */
function applyPointOverrides(
  base: EngineParams['pointValuations'],
  overrides: PointOverride[],
): EngineParams['pointValuations'] {
  if (overrides.length === 0) return base;
  const next = { ...base };
  for (const o of overrides) {
    if (o.valuePerPoint === null) {
      // 用户标「未知」：继续用保守下限，但把依据标成用户设定，
      // 这样引擎仍会给出 no_point_valuation 之外的 estimated 提示
      next[o.programId] = {
        valuePerPoint: CONSERVATIVE_VALUE_PER_POINT,
        currency: o.currency,
        basis: 'estimated',
        note: '你标注该积分计划没有可靠估值，按保守下限折算',
      };
      continue;
    }
    next[o.programId] = {
      valuePerPoint: o.valuePerPoint,
      currency: o.currency,
      basis: 'user_provided',
      note: `按你设定的积分估值折算：每分 ${o.currency} ${String(o.valuePerPoint)}`,
    };
  }
  return next;
}

/**
 * 完整引擎参数。cards 参与积分估值表的重建 —— 因为积分计划挂在卡上，
 * 用户导入一张新卡后它的积分计划也要立刻能估值。
 */
export function useEngineParams(cards: Card[]): { params: EngineParams; loaded: boolean } {
  const data = useLiveQuery(async () => {
    const [fx, overrides] = await Promise.all([loadFxTable(), loadPointOverrides()]);
    return { fx, overrides };
  }, []);

  const params = useMemo(() => {
    const base = buildDefaultParams(todayKey());
    if (!data) return base;
    return {
      ...base,
      fx: data.fx,
      pointValuations: applyPointOverrides(base.pointValuations, data.overrides),
      today: todayKey(),
    };
  }, [data, cards]);

  return { params, loaded: data !== undefined };
}
