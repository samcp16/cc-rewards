/**
 * 消费地区段按钮（main-query.md §4.1）。
 *
 * 文案写「澳门 / 内地」，不写「中国内地」—— 用户就在澳门，「内地」是他的日常说法，
 * 多两个字在 44px 按钮里会挤。
 *
 * 用 radiogroup 而不是两个 toggle：语义上这是单选，读屏会读出「2 个选项中的 1 个」。
 */

import type { SpendRegion } from '../../domain/types';
import { REGION_OPTIONS } from '../../lib/labels';
import { SegmentedControl } from '../common/SegmentedControl';

interface RegionSegmentProps {
  value: SpendRegion;
  onChange: (next: SpendRegion) => void;
}

export function RegionSegment({ value, onChange }: RegionSegmentProps): React.JSX.Element {
  return (
    <div>
      <span id="region-label" className="mb-[var(--space-2)] block text-[length:var(--text-xs)] text-muted">
        消费地区
      </span>
      {/* 换成带滑块的分段控件：两个独立按钮在浅色主题下选中态只差一个色阶，
          看起来像「都没选中」。滑块位移是比色差更强的状态信号 */}
      <SegmentedControl
        label="消费地区"
        value={value}
        onChange={onChange}
        options={REGION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />
    </div>
  );
}
