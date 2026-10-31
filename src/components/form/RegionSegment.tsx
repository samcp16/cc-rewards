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
      <div role="radiogroup" aria-labelledby="region-label" className="flex gap-[var(--space-2)]">
        {REGION_OPTIONS.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                onChange(option.value);
              }}
              className={[
                'h-[var(--size-seg)] flex-1 rounded-md border text-[length:var(--text-base)]',
                'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
                active
                  ? 'border-line-strong bg-surface-3 font-[var(--fw-announce)] text-fg'
                  : 'border-line bg-surface-2 font-[var(--fw-emphasize)] text-fg-2 hover:border-line-strong',
              ].join(' ')}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
