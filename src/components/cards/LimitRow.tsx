/**
 * 额度行（limits.md §4）。
 *
 * 96px 定高：两行文字（卡名 + 已用/上限）+ 一条 6px 满宽进度条 + 一句可选的
 * 「额度用尽后降为 X」。96 是这三样东西不互相挤压的下限。
 *
 * 三色规则（limits.md §3，这是设计决策不是审美）：
 * - < 80%：**不染绿**。绿色在这里会被读成「赚到了」，而用户真正关心的是还能刷多少
 * - ≥ 80%：黄，提醒「快到了」
 * - ≥ 100%：红，且必须给出「降为 X%」的后续
 *
 * 进度条用 transform: scaleX 而不是 width：width 会触发 layout，
 * 用户「记一笔」之后整页重排，视觉上像闪了一下；scaleX 只走合成层。
 */

import type { CapUsage } from '../../hooks/useCapUsage';
import { formatMoney, percent2 } from '../../lib/format';
import { PERIOD_SCOPE_LABEL } from '../../lib/labels';
import type { CardRow } from '../../db/schema';

interface LimitRowProps {
  card: CardRow;
  usage: CapUsage;
  /** 额度用尽后的后续说明，如「降为 0.40%」；无则显示「不再有回赠」 */
  fallbackNote?: string;
  /** 有回调时整行可点 = 打开「记一笔」。额度行的自然动作就是记账 */
  onRecord?: () => void;
}

function toneOf(ratio: number): { bar: string; text: string } {
  if (ratio >= 1) return { bar: 'bg-neg', text: 'text-neg' };
  if (ratio >= 0.8) return { bar: 'bg-warn', text: 'text-warn' };
  // 不染绿：只用中性文字色
  return { bar: 'bg-accent', text: 'text-fg-2' };
}

export function LimitRow({ card, usage, fallbackNote, onRecord }: LimitRowProps): React.JSX.Element {
  const tone = toneOf(usage.ratio);
  const remaining = Math.max(0, usage.limit - usage.used);
  const scope = PERIOD_SCOPE_LABEL[usage.period];

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-[var(--space-3)]">
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
          {card.cardName || '未命名卡'}
        </span>
        <span className={`num shrink-0 text-[length:var(--text-sm)] ${tone.text}`}>
          {percent2(Math.min(10, usage.ratio))}
        </span>
      </div>

      <div
        className="relative h-1.5 overflow-hidden rounded-[var(--radius-sm)] bg-line"
        role="img"
        aria-label={`${scope}已用 ${formatMoney(usage.used)}，上限 ${formatMoney(usage.limit)} ${usage.currency}`}
      >
        <div
          className={`absolute inset-0 origin-left ${tone.bar}`}
          style={{
            transform: `scaleX(${String(Math.min(1, usage.ratio))})`,
            transition: 'transform var(--motion-progress) var(--ease-progress)',
          }}
        />
      </div>

      <div className="flex items-baseline justify-between gap-[var(--space-3)]">
        <span className="num text-[length:var(--text-xs)] text-muted">
          {scope}已用 {formatMoney(usage.used)} / {formatMoney(usage.limit)} {usage.currency}
        </span>
        <span className={`num shrink-0 text-[length:var(--text-xs)] ${usage.ratio >= 1 ? 'text-neg' : 'text-meta'}`}>
          {usage.ratio >= 1 ? '已用尽' : `还剩 ${formatMoney(remaining)}`}
        </span>
      </div>

      {usage.ratio >= 0.8 && (
        <p className="text-[length:var(--text-xs)] text-warn">
          {fallbackNote !== undefined ? `额度用尽后${fallbackNote}` : '额度用尽后这部分消费不再有回赠'}
        </p>
      )}

      {usage.fxNote !== undefined && (
        <p className="text-[length:var(--text-xs)] text-info">{usage.fxNote}</p>
      )}
    </>
  );

  if (onRecord === undefined) {
    return (
      <div
        className="flex flex-col justify-center gap-[var(--space-1)] border-b border-line-subtle px-[var(--space-4)] py-[var(--space-3)] last:border-b-0"
        style={{ minHeight: 96 }}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRecord}
      className="flex w-full flex-col justify-center gap-[var(--space-1)] border-b border-line-subtle px-[var(--space-4)] py-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 last:border-b-0"
      style={{ minHeight: 96 }}
    >
      {body}
    </button>
  );
}
