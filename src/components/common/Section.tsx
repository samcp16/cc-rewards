/**
 * 字段区块：分组标题 + 标签值行。卡详情页与设置页共用。
 *
 * 卡片套卡片会让界面变成一堆盒子（MASTER §3.1.5），所以分组**不用卡片包裹**，
 * 只靠 --space-6 留白 + 11px 分组标题建立层级。
 */

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface SectionProps {
  title?: string;
  /** 标题右侧的补充说明，如「12 张卡」 */
  hint?: string;
  children: ReactNode;
}

export function Section({ title, hint, children }: SectionProps): React.JSX.Element {
  return (
    <section className="mt-[var(--space-6)] first:mt-0">
      {title !== undefined && (
        <div className="mb-[var(--space-2)] flex items-baseline justify-between">
          <h2 className="text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
            {title}
          </h2>
          {hint !== undefined && <span className="num text-[length:var(--text-xs)] text-meta">{hint}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

interface FieldRowProps {
  label: string;
  /** 值。数字请自行加 .num 类 */
  value: ReactNode;
  /** 副行说明 */
  hint?: ReactNode;
  /** 有 onClick 时整行可点，并显示 chevron */
  onClick?: () => void;
  /** 值用语义色（如负收益） */
  valueClassName?: string;
}

export function FieldRow({ label, value, hint, onClick, valueClassName }: FieldRowProps): React.JSX.Element {
  const body = (
    <>
      <span className="w-[76px] shrink-0 text-left text-[length:var(--text-sm)] text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 flex-col items-end gap-0.5">
        <span
          className={[
            'num text-right text-[length:var(--text-md)] font-[var(--fw-emphasize)]',
            onClick === undefined ? 'text-fg-2' : 'text-fg',
            valueClassName ?? '',
          ].join(' ')}
        >
          {value}
        </span>
        {hint !== undefined && <span className="text-right text-[length:var(--text-xs)] text-muted">{hint}</span>}
      </span>
    </>
  );

  if (onClick === undefined) {
    return (
      <div className="flex min-h-[52px] items-center gap-[var(--space-3)] border-b border-line-subtle py-[var(--space-2)] last:border-b-0">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-[var(--space-3)] border-b border-line-subtle py-[var(--space-2)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 last:border-b-0"
    >
      {body}
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-meta" aria-hidden="true" />
    </button>
  );
}
