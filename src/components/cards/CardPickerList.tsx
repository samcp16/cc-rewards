/**
 * 第二步：选这张银行下的哪张卡。
 *
 * 三态摘要由 `cardSummary` 决定（现金回赠 / 积分 / 核实中），这里只负责排。
 *
 * 为什么「核实中」的卡不拦着不让点：拦掉会让用户以为卡库没有这张卡，
 * 而他手里明明拿着。点下去给出明确解释（数据还没核实，可以先建卡自己补），
 * 比一个点不动的灰行更诚实。
 */

import { ChevronRight } from 'lucide-react';
import type { Card } from '../../domain/types';
import { cardSummary } from '../../lib/issuerGroups';
import { NETWORK_SHORT } from '../../lib/labels';

interface CardPickerListProps {
  cards: Card[];
  /** 已在卡库里的 cardId，用于标注（不禁止再建一份：额度要分开记） */
  existingIds: Set<string>;
  busy: boolean;
  onPick: (card: Card) => void;
}

export function CardPickerList({ cards, existingIds, busy, onPick }: CardPickerListProps): React.JSX.Element {
  return (
    <ul className="border-t border-line-subtle">
      {cards.map((card) => {
        const summary = cardSummary(card);
        return (
          <li key={card.cardId}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onPick(card);
              }}
              className="flex w-full items-center gap-[var(--space-3)] border-b border-line-subtle py-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 active:bg-surface-3 disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-[var(--space-2)]">
                  <span className="truncate text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
                    {card.cardName}
                  </span>
                  {existingIds.has(card.cardId) && (
                    <span className="shrink-0 rounded-sm border border-line px-[var(--space-1)] text-[length:var(--text-2xs)] text-muted">
                      已有
                    </span>
                  )}
                </span>
                <span className="truncate text-[length:var(--text-xs)] text-muted">
                  {NETWORK_SHORT[card.network]} · {card.cardCurrency}
                  {summary.state === 'unknown' ? ' · 数据核实中' : ''}
                </span>
              </span>
              <span
                className={[
                  'num shrink-0 text-[length:var(--text-sm)]',
                  summary.state === 'unknown' ? 'text-meta' : 'text-fg-2',
                ].join(' ')}
              >
                {summary.text}
              </span>
              <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-meta" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
