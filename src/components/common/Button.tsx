/**
 * 按钮。四种形态，全部来自 MASTER §3.10。
 *
 * 尺寸只有两档：44px（标准）与 36px（紧凑，用于设置页行内）。命中区一律 ≥44px，
 * 36px 的视觉高度由外层 padding 撑命中区，视觉上不放大 —— 设置页里每行都是
 * 大按钮会变成一堵墙。
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  /** compact = 36px 视觉（命中区仍 44px） */
  size?: 'default' | 'compact';
  fullWidth?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border border-line-strong bg-transparent text-fg hover:bg-surface-2 active:bg-surface-3',
  ghost: 'bg-transparent text-fg-2 hover:bg-surface-2 active:bg-surface-3',
  // 不用红填充：红填充会把「删除」做成本页主操作
  destructive: 'border border-neg bg-transparent text-neg hover:bg-surface-2',
};

const DISABLED_CLASS = 'border-line bg-line text-disabled hover:bg-line active:bg-line';

export function Button({
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  leading,
  trailing,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  const height = size === 'compact' ? 'h-9' : 'h-[var(--size-touch)]';
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled}
      {...rest}
      className={[
        'inline-flex items-center justify-center gap-[var(--space-2)] rounded-md px-[var(--space-4)]',
        'text-[length:var(--text-base)] font-[var(--fw-emphasize)] whitespace-nowrap',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
        height,
        fullWidth ? 'w-full' : '',
        disabled ? DISABLED_CLASS : VARIANT_CLASS[variant],
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {leading}
      {children}
      {trailing}
    </button>
  );
}
