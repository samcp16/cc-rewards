/**
 * 徽章 / 标签。三种语义：知识状态（待核对 / 未知）、时效（即将到期 / 已过期）、
 * 中性标记（已停用）。
 *
 * 关键约束（MASTER §3.9）：置信度用**知识状态**语义，不是收益语义。
 * 用 pos/neg 会让用户把「没数据」读成「亏钱」，两套语义必须两套视觉。
 */

import type { ReactNode } from 'react';

export type BadgeTone = 'warn' | 'neg' | 'info' | 'neutral' | 'muted';

const TONE_CLASS: Record<BadgeTone, string> = {
  // 待核对：黄底黄字。是提醒，不是错误
  warn: 'bg-warn-tint text-warn',
  // 已过期：红底红字。本产品唯一允许用红表达「规则失效」的地方
  neg: 'bg-neg-tint text-neg',
  info: 'bg-info-tint text-info',
  neutral: 'bg-surface-3 text-fg-2',
  // 未知：灰底灰字。灰不是「差」，是「不知道」
  muted: 'bg-line text-muted',
};

interface BadgeProps {
  tone: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}

export function Badge({ tone, icon, children }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={[
        'inline-flex items-center gap-[var(--space-1)] rounded-sm px-2 py-0.5',
        'text-[length:var(--text-2xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)]',
        TONE_CLASS[tone],
      ].join(' ')}
    >
      {icon}
      {children}
    </span>
  );
}
