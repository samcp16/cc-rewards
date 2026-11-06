/**
 * 卡库列表行（card-library.md §3）。
 *
 * 高度 84px = 卡面 56 + 上下 14×2。卡面从 48 提到 56 是因为 48px 时
 * 卡组织标识和芯片糊成一团色块 —— 而卡面存在的唯一理由就是「一眼认出是哪张卡」。
 *
 * 两次返工值得记下来：
 *
 *   1. 最初把「最高 5.00%」放在行尾独立列（76px 卡面 + 72px 百分比 + 16px 箭头），
 *      卡名只剩 174px，「BCM World Mastercard」被截成「BCM World Master...」。
 *      现在卡名独占一行，百分比下移到副行右端。
 *
 *   2. 额度进度条曾常驻副行，于是副行变成「机构名（被截断）+ 条 + 数字」三件挤在
 *      282px 里，机构名永远读不全。现在改成：常态不显示，只有 ≥80% 时用文字提示
 *      （「额度 85%」）。有用的是「快满了」这个信号，不是那根条的形状。
 */

import { useNavigate } from 'react-router-dom';
import type { CardRow } from '../../db/schema';
import { STALE_DAYS, staleDaysOf } from '../../lib/cardFacts';
import { cardSummary, shortIssuer } from '../../lib/issuerGroups';
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

export function CardListItem({ card, today, usedRatio, indexInIssuer }: CardListItemProps): React.JSX.Element {
  const navigate = useNavigate();
  const staleDays = staleDaysOf(card, today);
  /* 只在真过期时才提「多少天前核对」。
     12 张卡每张都挂一句「6 天未核对」，读起来像 12 条警告 —— 而它们全是正常的。
     90 天内没人需要知道这件事，超过 90 天才需要 */
  const stale = staleDays > STALE_DAYS;
  const summary = cardSummary(card);
  const inactive = card.active === false;
  const limitAlmostUsed = usedRatio !== null && usedRatio >= 0.8;

  return (
    <button
      type="button"
      onClick={() => {
        void navigate(`/cards/${card.cardId}`);
      }}
      className="relative flex w-full items-center gap-[var(--space-3)] px-[var(--space-4)] py-[14px] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 active:bg-surface-3"
      style={{ minHeight: 'var(--size-row-list)' }}
    >
      <CardFace card={card} muted={inactive} indexInIssuer={indexInIssuer} />

      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-[var(--space-2)]">
          <span
            className={[
              'truncate text-[length:var(--text-md)] font-[var(--fw-emphasize)] tracking-[var(--tracking-body)]',
              inactive ? 'text-muted line-through' : 'text-fg',
            ].join(' ')}
          >
            {card.cardName || '未命名卡'}
          </span>
          <ConfidenceTag confidence={card.confidence} />
        </span>

        <span className="flex min-w-0 items-baseline gap-[var(--space-2)]">
          <span className="min-w-0 flex-1 truncate text-[length:var(--text-xs)] text-muted">
            {shortIssuer(card.issuer)}
            {stale && <span className="text-warn"> · {String(staleDays)} 天未核对</span>}
            {limitAlmostUsed && (
              <span className="text-warn"> · 额度 {String(Math.round(Math.min(1.2, usedRatio) * 100))}%</span>
            )}
          </span>
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
        className="pointer-events-none absolute right-0 bottom-0 h-px bg-line-subtle"
        style={{ left: 'calc(var(--space-4) + 89px + var(--space-3))' }}
      />
    </button>
  );
}
