/**
 * 消费类别选择器（main-query.md §4.2）。
 *
 * 7 个类别排 3 列，第 3 行只有「其他」一格 —— **必须 span 1，不拉伸**。
 * 若把「其他」拉成整行宽，它的视觉权重会超过 6 个真实类别，用户会误以为它是「全部」。
 *
 * 图标全部来自 lucide-react，20px，绝不使用 emoji（P0-1 / SPEC §8）。
 */

import { Bed, Ellipsis, Fuel, Package, Plane, ShoppingBasket, Utensils } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SpendCategory } from '../../domain/types';

const ICON_SIZE = 20;

const CATEGORY_ICON: Record<SpendCategory, ReactNode> = {
  dining: <Utensils size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />,
  grocery: <ShoppingBasket size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />,
  fuel: <Fuel size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />,
  flight: <Plane size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />,
  hotel: <Bed size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />,
  online: <Package size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />,
  other: <Ellipsis size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />,
};

const ORDER: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];

const LABEL: Record<SpendCategory, string> = {
  dining: '餐饮',
  grocery: '超市',
  fuel: '加油',
  flight: '机票',
  hotel: '酒店',
  online: '网购',
  other: '其他',
};

interface CategoryGridProps {
  value: SpendCategory;
  onChange: (next: SpendCategory) => void;
}

export function CategoryGrid({ value, onChange }: CategoryGridProps): React.JSX.Element {
  return (
    <div>
      <span id="category-label" className="mb-[var(--space-2)] block text-[length:var(--text-xs)] text-muted">
        消费类别
      </span>
      <div
        role="radiogroup"
        aria-labelledby="category-label"
        className="grid grid-cols-3 gap-[var(--space-2)]"
      >
        {ORDER.map((category) => {
          const active = category === value;
          return (
            <button
              key={category}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                onChange(category);
              }}
              className={[
                'flex h-[56px] flex-col items-center justify-center gap-[var(--space-1)] rounded-md border',
                'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
                active
                  ? 'border-accent bg-surface-3 text-accent-text'
                  : 'border-line bg-transparent text-fg-2 hover:bg-surface-2',
              ].join(' ')}
            >
              <span className={active ? 'text-accent-text' : 'text-muted'}>{CATEGORY_ICON[category]}</span>
              <span
                className={[
                  'text-[length:var(--text-sm)]',
                  active ? 'font-[var(--fw-emphasize)] text-accent-text' : 'font-[var(--fw-read)]',
                ].join(' ')}
              >
                {LABEL[category]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
