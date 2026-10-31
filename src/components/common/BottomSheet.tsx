/**
 * 底部弹层（BottomSheet）。
 *
 * 为什么所有「展开更多」都用 sheet 而不是原地撑开：原地撑开会把答案卡推走，
 * 用户失去「我在看哪个方案」的锚点。sheet 是覆盖式的，关掉就回来，空间关系连续。
 *
 * 无障碍要求（MASTER §6.3 / onboarding-install.md §7）：Esc 关闭、焦点锁定在 sheet 内、
 * 关闭后焦点回到触发元素。这是全项目唯一需要焦点陷阱的组件。
 */

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 标题右侧的条件摘要，如「消费 MOP 2,000 · 餐饮 · 澳门」 */
  subtitle?: string;
  children: ReactNode;
  /** 底部固定区（按钮组） */
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({ open, onClose, title, subtitle, children, footer }: BottomSheetProps): React.JSX.Element | null {
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = sheetRef.current;
    // 焦点移入 sheet：优先第一个可聚焦元素，没有则聚焦容器本身（读屏才能进得去）
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (!firstEl || !lastEl) return;
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // 打开时锁滚动，否则背景内容会跟着手指动
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-sheet-scrim)]">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/50"
        tabIndex={-1}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[var(--sheet-max-h)] flex-col rounded-t-lg bg-surface-3 outline-none"
        style={{ boxShadow: 'var(--elev-raised)' }}
      >
        <div className="mx-auto mt-[var(--space-2)] h-1 w-8 shrink-0 rounded-[var(--radius-pill)] bg-line-strong" aria-hidden="true" />
        <div className="flex shrink-0 items-start gap-[var(--space-3)] px-[var(--space-4)] pt-[var(--space-3)]">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={titleId} className="text-[length:var(--text-md)] font-[var(--fw-announce)] text-fg">
              {title}
            </h2>
            {subtitle !== undefined && (
              <span className="num mt-0.5 text-[length:var(--text-xs)] text-meta">{subtitle}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-fg"
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[var(--space-4)] pb-[var(--space-4)] pt-[var(--space-3)]">
          {children}
        </div>
        {footer !== undefined && (
          <div
            className="shrink-0 border-t border-line-subtle px-[var(--space-4)] pt-[var(--space-3)]"
            style={{ paddingBottom: 'calc(var(--space-3) + var(--safe-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
