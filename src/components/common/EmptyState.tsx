/**
 * 空状态 / 错误状态。全部文案取自 MASTER §8（可直接上线，不是占位符）。
 *
 * 为什么要独立成组件：本项目有 8 个空状态、4 个错误状态，散在各页面各写一遍
 * 必然出现「同一个意思三种说法」。集中之后文案改动只需要动一个文件。
 */

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  /** compact 用于答案卡内部（垂直留白减半） */
  size?: 'default' | 'compact';
}

export function EmptyState({ icon, title, body, action, size = 'default' }: EmptyStateProps): React.JSX.Element {
  const padding = size === 'compact' ? 'py-[var(--space-2)]' : 'py-[var(--space-10)]';
  return (
    <div className={`flex flex-col items-center gap-[var(--space-2)] px-[var(--space-4)] ${padding} text-center`}>
      {icon}
      <p className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg">{title}</p>
      {body !== undefined && (
        <p className="max-w-[280px] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">{body}</p>
      )}
      {action !== undefined && <div className="mt-[var(--space-1)]">{action}</div>}
    </div>
  );
}

interface InlineBannerProps {
  tone: 'warn' | 'neg' | 'info';
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}

const TONE: Record<InlineBannerProps['tone'], { box: string; text: string }> = {
  warn: { box: 'bg-warn-tint', text: 'text-warn' },
  neg: { box: 'bg-neg-tint', text: 'text-neg' },
  info: { box: 'bg-info-tint', text: 'text-info' },
};

/** 页内横幅：状态带、导入错误条、账本为空的提示都用它 */
export function InlineBanner({ tone, icon, title, body, action }: InlineBannerProps): React.JSX.Element {
  const cls = TONE[tone];
  return (
    <div className={`flex flex-col gap-[var(--space-2)] rounded-md px-[var(--space-4)] py-[var(--space-3)] ${cls.box}`}>
      <div className="flex items-start gap-[var(--space-2)]">
        {icon !== undefined && <span className={`mt-0.5 shrink-0 ${cls.text}`}>{icon}</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className={`text-[length:var(--text-base)] font-[var(--fw-emphasize)] ${cls.text}`}>{title}</p>
          {body !== undefined && (
            <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">{body}</p>
          )}
        </div>
      </div>
      {action !== undefined && <div className="flex gap-[var(--space-2)]">{action}</div>}
    </div>
  );
}
