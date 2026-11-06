/**
 * 类别费率编辑区（card-detail.md §5.3 ③）。
 *
 * 两个必须成立的展示约束：
 *
 * 1. **`unknown` 绝不显示 0%**。它是「我们没查到」，不是「这张卡不给返现」。
 *    UI 写 0.00% 会让用户跳过这张卡，而它可能是最优的那张。
 * 2. **费率与它的限制必须同行可见**。「餐饮 10.00%」和「月上限 HK$150」分在两屏
 *    是本产品最容易造成误读的做法 —— 用户在答案卡看到 111 元，回到这里看到 10%，
 *    会以为答案算错了，实际是上限在起作用。
 *
 * 每个 unknown 类别旁边给「我知道，手动填」入口（SPEC §6.6 第 4 条）：
 * 逐条列出而不是给一个总的「补数据」按钮 —— 用户手里可能正好知道餐饮那一项。
 */

import { Pencil, TriangleAlert } from 'lucide-react';
import type { Card, CategoryRule, SpendCategory } from '../../domain/types';
import { CATEGORY_OPTIONS } from '../../lib/labels';
import { formatMoney, percent2 } from '../../lib/format';

interface CategorySectionProps {
  card: Card;
  /** 进入某一类的编辑（当前实现：把该类从 unknown 切成 cashback 并聚焦） */
  onEditCategory: (category: SpendCategory) => void;
  /** 该类命中的上限说明，如「月上限 HK$150」 */
  capNotes: Partial<Record<SpendCategory, string>>;
}

/** 单类的展示文本 */
function ruleText(rule: CategoryRule): string {
  if (rule.kind === 'unknown') return '未知';
  if (rule.kind === 'cashback') {
    if (!rule.rates) return '未知';
    const local = percent2(rule.rates.local);
    if (rule.rates.foreign === undefined) return local;
    if (Math.abs(rule.rates.foreign - rule.rates.local) < 1e-9) return local;
    return `本地 ${local} · 外币 ${percent2(rule.rates.foreign)}`;
  }
  return `${String(rule.multiplier)} 倍积分`;
}

export function CategorySection({ card, onEditCategory, capNotes }: CategorySectionProps): React.JSX.Element {
  return (
    <div>
      {CATEGORY_OPTIONS.map((opt) => {
        const rule = card.categories[opt.value];
        const unknown = rule.kind === 'unknown';
        return (
          <div key={opt.value} className="flex flex-col gap-[var(--space-1)] border-b border-line-subtle py-[var(--space-2)] last:border-b-0">
            <div className="flex min-h-[36px] items-center gap-[var(--space-3)]">
              <span className="w-[76px] shrink-0 text-[length:var(--text-sm)] text-muted">{opt.label}</span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-[var(--space-2)]">
                {unknown && <TriangleAlert size={14} strokeWidth={2} className="shrink-0 text-warn" aria-hidden="true" />}
                <span
                  className={[
                    'num text-right text-[length:var(--text-md)] font-[var(--fw-emphasize)]',
                    unknown ? 'text-warn' : 'text-fg',
                  ].join(' ')}
                >
                  {ruleText(rule)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onEditCategory(opt.value);
                }}
                aria-label={unknown ? `手动填${opt.label}回赠` : `修改${opt.label}回赠`}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-fg"
              >
                <Pencil size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            {unknown ? (
              <p className="pl-[88px] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-muted">
                官方未收录此项，本卡不参与该类排序（我们持续核实补充）。
              </p>
            ) : (
              (capNotes[opt.value] !== undefined || rule.note !== undefined) && (
                <p className="pl-[88px] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-muted">
                  {[capNotes[opt.value], rule.note].filter(Boolean).join(' · ')}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 上限区的「本月已用」行（只读，来自账本） */
export function CapUsageRow({
  label,
  used,
  limit,
  currency,
  ratio,
}: {
  label: string;
  used: number;
  limit: number;
  currency: string;
  ratio: number;
}): React.JSX.Element {
  const bar = ratio >= 1 ? 'bg-neg' : ratio >= 0.8 ? 'bg-warn' : 'bg-accent';
  return (
    <div className="flex flex-col gap-[var(--space-2)] border-b border-line-subtle py-[var(--space-2)] last:border-b-0">
      <div className="flex min-h-[36px] items-center gap-[var(--space-3)]">
        <span className="w-[76px] shrink-0 text-[length:var(--text-sm)] text-muted">{label}</span>
        <span className={`num min-w-0 flex-1 text-right text-[length:var(--text-md)] ${ratio >= 1 ? 'text-neg' : 'text-fg-2'}`}>
          {formatMoney(used)} / {formatMoney(limit)} {currency} · {percent2(Math.min(10, ratio))}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-[var(--radius-sm)] bg-line" aria-hidden="true">
        <div
          className={`absolute inset-0 origin-left ${bar}`}
          style={{ transform: `scaleX(${String(Math.min(1, ratio))})`, transition: 'transform var(--motion-progress) var(--ease-progress)' }}
        />
      </div>
      <p className="text-[length:var(--text-xs)] text-meta">
        {ratio >= 1 ? '已用完' : `还剩 ${formatMoney(Math.max(0, limit - used))} ${currency}`}
      </p>
    </div>
  );
}
