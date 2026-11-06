/**
 * 消费类别选择器（main-query.md §4.2）。
 *
 * 早期版本是 3 列网格、7 个大格子（图标 + 文字，高 56px），占了近 200px 垂直空间 ——
 * 在 900px 高的手机上，这等于把「净赚多少」挤出首屏。而类别在这屏只是一次单选，
 * 它的权重不配占掉首屏的五分之一。
 *
 * 现在是一行可横滑的 chip：高 40px，7 个选项在 360px 宽下露出 5 个，
 * 右边缘渐隐提示「还能滑」。信息一个没少，垂直空间省下 100 多像素。
 *
 * 图标全部来自 lucide-react，16px，绝不使用 emoji（P0-1 / SPEC §8）。
 */

import { Bed, Ellipsis, Fuel, Package, Plane, ShoppingBasket, Utensils } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SpendCategory } from '../../domain/types';

const ICON_SIZE = 16;

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

/* 只用 #000 与 transparent 两档：mask 的渐变本身就是 alpha 过渡，
   中间再插一档半透明色不会更平滑，只会撞上「禁止 rgb() 字面量」的门禁 */
const FADE_MASK = 'linear-gradient(90deg, #000 0, #000 calc(100% - 46px), transparent 100%)';

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
      {/* 渐隐遮罩放在滚动容器外层：直接加在 overflow 容器上，mask 会跟着滚动内容走，
          滑动时整条渐隐一起位移，看起来像蒙了一层脏东西 */}
      <div style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}>
        <div
          role="radiogroup"
          aria-labelledby="category-label"
          className="scrollbar-none -mx-[var(--space-4)] flex gap-[7px] overflow-x-auto px-[var(--space-4)] py-0.5"
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
                  'flex h-10 shrink-0 items-center gap-[6px] rounded-[var(--radius-pill)] px-[var(--space-3)]',
                  'text-[length:var(--text-sm)] whitespace-nowrap transition-[background-color,color,transform] duration-[var(--motion-fast)]',
                  'active:scale-[0.97]',
                  active
                    ? 'bg-accent-tint font-[var(--fw-announce)] text-accent-text'
                    : 'bg-surface-1 font-[var(--fw-read)] text-fg-2 hover:bg-surface-2',
                ].join(' ')}
                style={{ boxShadow: active ? 'inset 0 0 0 1px var(--accent-text)' : 'inset 0 0 0 1px var(--line-subtle)' }}
              >
                <span className={active ? 'text-accent-text' : 'text-muted'}>{CATEGORY_ICON[category]}</span>
                {LABEL[category]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
