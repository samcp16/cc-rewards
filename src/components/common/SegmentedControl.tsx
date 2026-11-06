/**
 * 分段控件（2–3 段，带滑动拇指）。
 *
 * 为什么不用「一排按钮各自改底色」：那是本产品最容易显出廉价感的地方。
 * 一个连续的轨道 + 一块真正滑动过去的拇指，才能让「切换」这件事有物理感 ——
 * 手指看到的位移量与它感受到的位移一致。
 *
 * 无障碍取舍：这是单选组而不是 tab 列表（不切换面板，只改一个值）。
 * 用 role="radiogroup" + role="radio"，方向键可切 —— 比 aria-pressed 的按钮组
 * 更准确表达「多选一」，也让读屏报出「3 之 1」。
 */

import { useRef, type ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** 读屏用，说明这组在切什么（如「外观」「消费地区」） */
  label: string;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: SegmentedControlProps<T>): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const count = options.length;

  function move(delta: number): void {
    const next = (index + delta + count) % count;
    const target = options[next];
    if (target !== undefined) onChange(target.value);
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      className={[
        'relative grid w-full rounded-[var(--radius-md)] bg-surface-2 p-[3px]',
        size === 'sm' ? 'h-9' : 'h-11',
      ].join(' ')}
      style={{ gridTemplateColumns: `repeat(${String(count)}, minmax(0, 1fr))` }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {/* 拇指：位置由 index 算，不依赖测量 —— 测量会在字体加载后跳一下 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[3px] bottom-[3px] left-[3px] rounded-[calc(var(--radius-md)-2px)] bg-[var(--row-raised)] shadow-[var(--elev-ring)] transition-transform duration-[var(--motion-base)] ease-[var(--ease-standard)]"
        style={{
          width: `calc((100% - 6px) / ${String(count)})`,
          transform: `translateX(calc(${String(index)} * 100%))`,
        }}
      />

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
            className={[
              'relative z-[1] flex items-center justify-center gap-[var(--space-2)] rounded-[calc(var(--radius-md)-2px)]',
              'transition-colors duration-[var(--motion-fast)]',
              size === 'sm' ? 'text-[length:var(--text-xs)]' : 'text-[length:var(--text-sm)]',
              selected ? 'font-[var(--fw-announce)] text-fg' : 'font-[var(--fw-read)] text-muted',
            ].join(' ')}
          >
            {option.icon !== undefined && (
              <span className="shrink-0" aria-hidden="true">
                {option.icon}
              </span>
            )}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
