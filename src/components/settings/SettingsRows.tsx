/**
 * 设置页的行项与分组（settings.md §2/§5/§7）。
 *
 * 分组**不用卡片包裹**：本页唯一使用卡片形态的是数据安全卡，
 * 因为它是唯一需要用户「停下来读」的内容。其他都是可跳过的操作项 ——
 * 全都做成卡片会让安全卡失去重量。
 */

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="pt-[var(--space-6)]">
      <h2 className="mb-[var(--space-2)] pl-[var(--space-1)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

interface ActionRowProps {
  label: string;
  hint?: string;
  onClick: () => void;
  icon?: ReactNode;
  /** 副行用黄色：只有「关系数据存活」这一件事配得上 */
  hintTone?: 'meta' | 'warn';
}

export function ActionRow({ label, hint, onClick, icon, hintTone = 'meta' }: ActionRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-[var(--space-3)] border-b border-line-subtle px-[var(--space-1)] py-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 last:border-b-0"
      style={{ minHeight: hint === undefined ? 52 : 64 }}
    >
      {icon !== undefined && <span className="shrink-0 text-accent-text">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg">{label}</span>
        {hint !== undefined && (
          <span
            className={[
              'text-[length:var(--text-xs)] leading-[var(--leading-body)]',
              hintTone === 'warn' ? 'text-warn' : 'text-meta',
            ].join(' ')}
          >
            {hint}
          </span>
        )}
      </span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}

interface ValueRowProps {
  label: string;
  value: ReactNode;
  hint?: string;
  /** 有 onClick 时可点；只读行不给 chevron（§5.1 的「只读」规则） */
  onClick?: () => void;
  /** 值用 warn 色（如「还没导出过」） */
  valueTone?: 'normal' | 'warn';
}

export function ValueRow({ label, value, hint, onClick, valueTone = 'normal' }: ValueRowProps): React.JSX.Element {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg">{label}</span>
        {hint !== undefined && <span className="text-[length:var(--text-xs)] leading-[var(--leading-body)] text-meta">{hint}</span>}
      </span>
      <span
        className={[
          'num shrink-0 text-right text-[length:var(--text-md)]',
          valueTone === 'warn' ? 'text-warn' : onClick === undefined ? 'text-meta' : 'text-fg-2',
          onClick === undefined ? 'text-[length:var(--text-xs)]' : '',
        ].join(' ')}
      >
        {value}
      </span>
    </>
  );

  const base =
    'flex w-full items-center gap-[var(--space-3)] border-b border-line-subtle px-[var(--space-1)] py-[var(--space-3)] text-left last:border-b-0';
  if (onClick === undefined) {
    return <div className={base} style={{ minHeight: hint === undefined ? 52 : 64 }}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} transition-colors duration-[var(--motion-fast)] hover:bg-surface-2`}
      style={{ minHeight: hint === undefined ? 52 : 64 }}
    >
      {body}
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}

interface SwitchRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function SwitchRow({ label, hint, checked, onChange }: SwitchRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-[var(--space-3)] border-b border-line-subtle px-[var(--space-1)] py-[var(--space-3)] last:border-b-0" style={{ minHeight: 64 }}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg">{label}</span>
        <span className="text-[length:var(--text-xs)] leading-[var(--leading-body)] text-meta">{hint}</span>
      </span>
      {/* 44×44 命中区包住 44×26 的轨道（MASTER §6.2） */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => {
          onChange(!checked);
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span
          className={[
            'relative block h-[26px] w-11 rounded-[var(--radius-pill)] transition-colors duration-[var(--motion-fast)]',
            checked ? 'bg-accent' : 'bg-line-strong',
          ].join(' ')}
        >
          <span
            className="absolute top-[3px] block h-5 w-5 rounded-[var(--radius-pill)] bg-white transition-transform duration-[var(--motion-fast)]"
            style={{ transform: checked ? 'translateX(21px)' : 'translateX(3px)' }}
          />
        </span>
      </button>
    </div>
  );
}
