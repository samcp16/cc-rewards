/**
 * 设置项读写（汇率调整、积分估值覆盖、上次导出时间、安装引导冷却）。
 *
 * 全部走 KV 单表 + 默认值回落，不设「设置对象」的完整结构：
 * 未来加一项设置不需要迁移，也不会因为老数据缺字段而炸。
 */

import { db } from './schema';
import type { CurrencyCode, FxTable } from '../domain/types';
import { DEFAULT_FX_TABLE, cloneFxTable, lookupRate } from '../domain/fx/fxReference';
import { todayKey } from '../hooks/buildDefaultParams';

export const KEY_FX_TABLE = 'fxTable';
export const KEY_POINT_OVERRIDES = 'pointOverrides';
export const KEY_LAST_EXPORT = 'lastExportAt';
export const KEY_INSTALL_DISMISSED = 'installPromptDismissedAt';
export const KEY_INSTALL_DISMISS_COUNT = 'installPromptDismissCount';
export const KEY_LAST_CHANNEL = 'lastChannel';

export interface PointOverride {
  programId: string;
  /** null = 用户明确标注「未知」，不是 0 */
  valuePerPoint: number | null;
  currency: CurrencyCode;
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

async function putSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function loadFxTable(): Promise<FxTable> {
  const stored = await getSetting<FxTable | null>(KEY_FX_TABLE, null);
  if (!stored) return cloneFxTable(DEFAULT_FX_TABLE);
  // 缺一条折算率就整体回落到默认表：静默按 1:1 会把上限算错（SPEC §6.5）
  const complete = DEFAULT_FX_TABLE.rates.every((r) => lookupRate(stored, r.from, r.to) !== null);
  return complete ? stored : cloneFxTable(DEFAULT_FX_TABLE);
}

/** 只允许改方向与倍数，不允许删除条目或新增非法币种 */
export async function saveFxRate(from: CurrencyCode, to: CurrencyCode, rate: number): Promise<void> {
  const table = await loadFxTable();
  const rates = table.rates.map((r) => (r.from === from && r.to === to ? { ...r, rate } : r));
  await putSetting(KEY_FX_TABLE, { rates, userAdjusted: true });
}

export async function resetFxTable(): Promise<void> {
  await putSetting(KEY_FX_TABLE, cloneFxTable(DEFAULT_FX_TABLE));
}

export async function loadPointOverrides(): Promise<PointOverride[]> {
  return getSetting<PointOverride[]>(KEY_POINT_OVERRIDES, []);
}

export async function savePointOverride(override: PointOverride): Promise<void> {
  const list = await loadPointOverrides();
  const next = list.filter((o) => o.programId !== override.programId);
  next.push(override);
  await putSetting(KEY_POINT_OVERRIDES, next);
}

export async function loadLastExportAt(): Promise<string | null> {
  return getSetting<string | null>(KEY_LAST_EXPORT, null);
}

export async function markExported(): Promise<void> {
  await putSetting(KEY_LAST_EXPORT, todayKey());
}

/** 安装引导冷却（onboarding-install.md §2：关闭后 24h 内不弹，累计 3 次后不再弹） */
export async function loadInstallDismiss(): Promise<{ at: string | null; count: number }> {
  return {
    at: await getSetting<string | null>(KEY_INSTALL_DISMISSED, null),
    count: await getSetting<number>(KEY_INSTALL_DISMISS_COUNT, 0),
  };
}

export async function bumpInstallDismiss(): Promise<void> {
  const current = await loadInstallDismiss();
  await putSetting(KEY_INSTALL_DISMISSED, new Date().toISOString());
  await putSetting(KEY_INSTALL_DISMISS_COUNT, current.count + 1);
}
