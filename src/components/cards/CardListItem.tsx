/**
 * 卡库列表行（card-library.md §3）。
 *
 * 高度 72px = 卡面 48 + 上下 12×2。
 *
 * 布局上做了一次返工：最初把「最高 5.00%」放在行尾独立列（76px 卡面 + 72px
 * 百分比 + 16px 箭头），卡名只剩 174px，「BCM World Mastercard」被截成
 * 「BCM World Master...」——认不出是哪张卡，卡面带来的辨识度全赔进去了。
 *
 * 现在：卡名独占一行（可用宽度 282px），百分比下移到副行右端。行尾箭头也去掉，
 * 整行本就可点，箭头只是多占 24px。
 *
 * 百分比留在副行而不是并进卡名行，是因为它是这一屏的第二信息：
 * 「哪张回报高」重要，「哪张叫什么」更重要 —— 叫不出名字的卡，回报再高也没用。
 */

import { useNavigate } from 'react-router-dom';
import type { CardRow } from '../../db/schema';
import { staleDaysOf } from '../../lib/cardFacts';
import { cardSummary } from '../../lib/issuerGroups';
import { ConfidenceTag } from '../common/ConfidenceTag';
import { CardFace } from './CardFace';

interface CardListItemProps {
  card: CardRow;
  today: string;
  /** 该卡本月已用额度比例（0–1+）；无月度上限时为 null */
  usedRatio: number | null;
  /** 这张卡在发卡行内的序号，用于同银行多卡时区分卡面深浅 */
  indexInIssuer?: number;
}

/** 进度条颜色：只有 ≥80% 才染黄、≥100% 染红（limits.md §3 的三色规则） */
function barClass(ratio: number): string {
  if (ratio >= 1) return 'bg-neg';
  if (ratio >= 0.8) return 'bg-warn';
  return 'bg-line-strong';
}

export function CardListItem({ card, today, usedRatio, indexInIssuer }: CardListItemProps): React.JSX.Element {
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
      className="relative flex w-full items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 active:bg-surface-3"
      style={{ minHeight: 'var(--size-row-list)' }}
    >
      <CardFace card={card} muted={inactive} indexInIssuer={indexInIssuer} />

      <span className="flex min-w-0 flex-1 flex-col gap-1">
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

        <span className="flex min-w-0 items-center gap-[var(--space-2)]">
          <span className="min-w-0 flex-1 truncate text-[length:var(--text-xs)] text-muted">{facts.join(' · ')}</span>
          {usedRatio !== null && (
            <span
              className="relative block shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-line"
              style={{ width: 48, height: 4 }}
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
          <span
            className={[
              'num shrink-0 text-[length:var(--text-sm)] font-[var(--fw-emphasize)] whitespace-nowrap',
              summary.state === 'unknown' ? 'text-meta' : 'text-fg-2',
            ].join(' ')}
          >
            {summary.text}
          </span>
        </span>
      </span>

      {/* 分隔线缩进到卡面右边缘：贯穿到左侧会让卡面看起来像被切掉的图片 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-px bg-line-subtle"
        style={{ left: 'calc(var(--space-4) + 76px + var(--space-3))' }}
      />
    </button>
  );
}
