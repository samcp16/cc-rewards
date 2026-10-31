/**
 * 顶栏。三种形态由 props 决定，全部是 48px 内容高 + 安全区。
 *
 * 高度用固定值而非 padding 拼：padding 拼出来的高度在字体切换时会抖 1–2px，
 * 而本产品满屏数字，任何抖动都会被读成「数据变了」。
 * 但两种形态之间要**完全对齐**，否则从主查询页跳到卡库页时标题会横移一下。
 */

import { ChevronLeft, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

interface TopBarProps {
  title: string;
  /** 标题左侧的品牌图标（仅主查询页用） */
  withLogo?: boolean;
  /** 有返回键时传回调；标题自动居中 */
  onBack?: () => void;
  backLabel?: string;
  /** 右侧操作区（图标按钮 44×44） */
  actions?: ReactNode;
  /** 标题是否居中（卡详情页需要，因为返回键占位） */
  centerTitle?: boolean;
  /** 去掉底部分隔线（主查询页下方就是输入区，加线会把首屏切成两块） */
  borderless?: boolean;
}

export function TopBar({
  title,
  withLogo = false,
  onBack,
  backLabel = '返回',
  actions,
  centerTitle = false,
  borderless = false,
}: TopBarProps): React.JSX.Element {
  return (
    <header
      className={[
        'bg-surface-0',
        borderless ? '' : 'border-b border-line-subtle',
      ].join(' ')}
    >
      <div className="relative mx-auto flex h-[var(--size-topbar)] w-full max-w-[var(--container-desktop)] items-center px-[var(--space-1)]">
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-fg-2 hover:text-fg"
          >
            <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        <div
          className={[
            'flex min-w-0 flex-1 items-center gap-[var(--space-2)]',
            centerTitle ? 'justify-center px-[var(--space-1)]' : 'px-[var(--space-3)]',
          ].join(' ')}
        >
          {withLogo && <Wallet size={20} strokeWidth={2} className="shrink-0 text-accent-text" aria-hidden="true" />}
          <h1
            className={[
              'truncate text-fg',
              centerTitle
                ? 'text-[length:var(--text-md)] font-[var(--fw-emphasize)]'
                : 'text-[length:var(--text-lg)] font-[var(--fw-announce)] tracking-[var(--tracking-heading)]',
            ].join(' ')}
          >
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center">{actions}</div>
      </div>
    </header>
  );
}

interface IconActionProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: 'default' | 'danger';
}

/** 顶栏图标按钮：视觉 20–24px，容器 44×44（MASTER §6.2） */
export function IconAction({ label, onClick, children, tone = 'default' }: IconActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        'flex h-11 w-11 items-center justify-center transition-colors duration-[var(--motion-fast)]',
        tone === 'danger' ? 'text-neg hover:text-fg' : 'text-muted hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
