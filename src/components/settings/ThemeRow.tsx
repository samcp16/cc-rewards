/**
 * 外观选择行（跟随系统 / 深色 / 浅色）。
 *
 * 为什么是三态而不是一个开关：一个「深色模式」开关无法表达「跟随系统」，
 * 而跟随系统才是默认该有的行为（日落自动转深色，这才是深色模式的实际价值）。
 * 强制二选一等于让用户每天手动切两次。
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { SegmentedControl, type SegmentOption } from '../common/SegmentedControl';
import {
  getThemeSnapshot,
  setThemePreference,
  subscribeTheme,
  type ThemePreference,
} from '../../platform/theme';

const OPTIONS: ReadonlyArray<SegmentOption<ThemePreference>> = [
  { value: 'system', label: '跟随系统', icon: <Monitor size={16} strokeWidth={2} /> },
  { value: 'light', label: '浅色', icon: <Sun size={16} strokeWidth={2} /> },
  { value: 'dark', label: '深色', icon: <Moon size={16} strokeWidth={2} /> },
];

export function ThemeRow(): React.JSX.Element {
  const snapshot = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);
  const preference = (snapshot.split('|')[0] ?? 'system') as ThemePreference;

  return (
    <div className="flex flex-col gap-[var(--space-3)] px-[var(--space-1)] py-[var(--space-3)]">
      {/* 这里不再写一遍「外观」——分组标题已经写了，隔 20px 重复同一个词
          只会让页面显得是拼出来的 */}
      <SegmentedControl
        label="外观"
        options={OPTIONS}
        value={preference}
        onChange={setThemePreference}
      />
      <span className="text-[length:var(--text-xs)] leading-[var(--leading-body)] text-meta">
        白天在户外用浅色更清楚，收银台灯光暗时深色更省眼。
      </span>
    </div>
  );
}
