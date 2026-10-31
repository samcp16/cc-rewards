/**
 * 卡库顶部统计条（card-library.md §2）。
 *
 * 三个数字都有「可行动」的含义：
 * - 共 N 张：确认播种成功，也是备份前的心里有数
 * - N 个地区：港澳卡混用时，用户容易忘记自己有香港卡
 * - N 张本月额度已用尽：直接指向额度页 —— 这是卡库里唯一值得打断的数字
 *
 * 为什么不是四个数字：超过 3 个统计数字时人眼会开始略读，
 * 「已用尽」那条就会被漏掉，而它就是设计这个统计条的唯一理由。
 */

import type { CardRow } from '../../db/schema';

interface CardStatsBarProps {
  cards: CardRow[];
  /** cardId → 本月已用比例 */
  ratios: Map<string, number>;
}

export function CardStatsBar({ cards, ratios }: CardStatsBarProps): React.JSX.Element {
  const regions = new Set(cards.map((c) => c.issuerRegion));
  const exhausted = cards.filter((c) => (ratios.get(c.cardId) ?? 0) >= 1).length;

  return (
    <div className="flex items-center gap-[var(--space-2)] border-b border-line-subtle px-[var(--space-4)] py-[var(--space-2)] text-[length:var(--text-xs)] text-muted">
      <span className="num">共 {String(cards.length)} 张</span>
      <span aria-hidden="true">·</span>
      <span className="num">{String(regions.size)} 个地区</span>
      {exhausted > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className="num text-warn">{String(exhausted)} 张本月额度已用尽</span>
        </>
      )}
    </div>
  );
}
