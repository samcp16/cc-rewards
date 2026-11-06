/**
 * 卡库列表行（card-library.md §3）。
 *
 * 64px 定高（--size-row-list）不是随手取的：卡名 1 行 + 副行 1 行的自然高度是 40px，
 * 加 12px×2 的上下内边距得 64 —— 低于这个值副行会贴着分隔线，
 * 高于它会让人以为「每张卡之间有空隙」，而它们是同一张列表。
 *
 * 右侧的微进度条只有 64×4：它是「扫一眼知道哪张快用完了」的提示，
 * 不是额度明细。做成满宽条会让列表变成仪表盘，而这一页的任务是「找到那张卡」。
 */

import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CardRow } from '../../db/schema';
import { staleDaysOf } from '../../lib/cardFacts';
import { cardSummary } from '../../lib/issuerGroups';
import { ConfidenceTag } from '../common/ConfidenceTag';

interface CardListItemProps {
  card: CardRow;
  today: string;
  /** 该卡本月已用额度比例（0–1+）；无月度上限时为 null */
  usedRatio: number | null;
}

/** 进度条颜色：只有 ≥80% 才染黄、≥100% 染红（limits.md §3 的三色规则） */
function barClass(ratio: number): string {
  if (ratio >= 1) return 'bg-neg';
  if (ratio >= 0.8) return 'bg-warn';
  return 'bg-line-strong';
}

export function CardListItem({ card, today, usedRatio }: CardListItemProps): React.JSX.Element {
  const navigate = useNavigate();
  const staleDays = staleDaysOf(card, today);
  const summary = cardSummary(card);
  const inactive = card.active === false;

  const facts: string[] = [card.issuer];
  if (staleDays > 0) facts.push(`${String(staleDays)} 天未核对`);

  return (
    <button
      type="button"
      onClick={() => {
        void navigate(`/cards/${card.cardId}`);
      }}
      className="flex w-full items-center gap-[var(--space-3)] border-b border-line-subtle px-[var(--space-4)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 last:border-b-0"
      style={{ minHeight: 'var(--size-row-list)' }}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 py-[var(--space-3)]">
        <span className="flex min-w-0 items-center gap-[var(--space-2)]">
          <span
            className={[
              'truncate text-[length:var(--text-md)] font-[var(--fw-emphasize)]',
              inactive ? 'text-muted line-through' : 'text-fg',
            ].join(' ')}
          >
            {card.cardName || '未命名卡'}
          </span>
          <ConfidenceTag confidence={card.confidence} />
        </span>
        <span className="flex min-w-0 items-center justify-between gap-[var(--space-2)]">
          <span className="min-w-0 flex-1 truncate text-[length:var(--text-xs)] text-muted">{facts.join(' · ')}</span>
          {usedRatio !== null && (
            <span
              className="relative block shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-line"
              style={{ width: 64, height: 4 }}
              role="img"
              aria-label={`本月额度已用 ${String(Math.round(Math.min(1, usedRatio) * 100))}%`}
            >
              <span
                className={`absolute inset-0 origin-left ${barClass(usedRatio)}`}
                style={{
                  transform: `scaleX(${String(Math.min(1, usedRatio))})`,
                  transition: 'transform var(--motion-progress) var(--ease-progress)',
                }}
              />
            </span>
          )}
        </span>
      </span>
      <span
        className={[
          'num w-[72px] shrink-0 text-right text-[length:var(--text-sm)] whitespace-nowrap',
          summary.state === 'unknown' ? 'text-muted' : 'text-fg-2',
        ].join(' ')}
      >
        {summary.text}
      </span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-meta" aria-hidden="true" />
    </button>
  );
}
