/**
 * 对比表的行（MASTER §3.3）—— 一个行组件承担全部硬约束。
 *
 * 列宽固定：卡名列 `flex:1 min-w-0`（375px 视口下剩约 127px，约 5 个汉字），
 * 费率 56 / 净返 72 / 差第一 64。卡名必须 **clamp 1 行** —— 换行会让行高不固定，
 * 四列对齐立刻崩塌，等于没有表。
 *
 * 冠军行靠「整行底色 1.16:1 + 卡名 590 + 行首 12px 文字『刷这张』」建立层级，
 * 不用奖杯 emoji、不用左侧彩色条纹、不用发光边框。
 *
 * 数据口径：所有数字直接来自 `Scheme`，本文件不做任何算术 ——
 * 「这个类别到底给了多少费率」是引擎第 0/1 步的结果，UI 重算必然与之漂移。
 */

import { TriangleAlert } from 'lucide-react';
import type { Scheme } from '../../domain/types.result';
import { formatMoney, percent2, signedNumber } from '../../lib/format';

interface CompareRowProps {
  scheme: Scheme;
  /** 本笔消费金额（settlementCurrency 计），用于把费用换算成百分比展示 */
  amount: number;
  /** 与冠军的净额差；undefined 表示不适用（冠军本身） */
  leadDiff: number | undefined;
  channelLabel: string;
  isChampion: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/** 该类别实际取用的费率（local / foreign 双档已由引擎选好） */
function effectiveRate(scheme: Scheme, amount: number): string {
  if (amount <= 0) return '—';
  return percent2((scheme.grossCashback + scheme.pointsValue) / amount);
}

export function CompareRow({
  scheme,
  amount,
  leadDiff,
  channelLabel,
  isChampion,
  expanded,
  onToggle,
}: CompareRowProps): React.JSX.Element {
  const unknown = scheme.status === 'unknown';
  const fxRateText = `外币费 ${percent2(amount > 0 ? scheme.fxFee / amount : 0)}`;

  return (
    <div className={isChampion ? 'border-b border-line-subtle bg-row-champion' : 'border-b border-line-subtle'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-[var(--space-2)] px-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-row-hover"
        style={{ minHeight: 56 }}
      >
        {/* ① 卡 / 渠道 */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-[var(--space-1)]">
            {isChampion && (
              <span className="shrink-0 text-[length:var(--text-2xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-pos">
                刷这张
              </span>
            )}
            <span
              className={[
                'min-w-0 truncate text-[length:var(--text-md)]',
                isChampion ? 'font-[var(--fw-announce)] text-fg' : 'font-[var(--fw-emphasize)] text-fg-2',
              ].join(' ')}
            >
              {scheme.cardName}
            </span>
          </span>
          <span className="truncate text-[length:var(--text-xs)] text-meta">
            {channelLabel} · {fxRateText}
            {scheme.confidence === 'low' ? ' · 待核对' : ''}
          </span>
        </span>

        {/* ② 回赠 */}
        <span
          className="num shrink-0 text-right text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg-2"
          style={{ width: 56 }}
        >
          {unknown ? '—' : effectiveRate(scheme, amount)}
        </span>

        {/* ③ 净返：unknown 写「未知」，绝不写 0.00 */}
        <span
          className={[
            'num shrink-0 text-right text-[length:var(--text-md)] font-[var(--fw-emphasize)]',
            unknown ? 'text-muted' : scheme.netRealistic < 0 ? 'text-neg' : isChampion ? 'text-pos' : 'text-fg-2',
          ].join(' ')}
          style={{ width: 72 }}
        >
          {unknown ? '未知' : signedNumber(scheme.netRealistic)}
        </span>

        {/* ④ 差第一 */}
        <span className="num shrink-0 text-right text-[length:var(--text-sm)] text-muted" style={{ width: 64 }}>
          {unknown || isChampion || leadDiff === undefined ? '—' : signedNumber(leadDiff)}
        </span>
      </button>

      {unknown && (
        <p className="flex items-center gap-[var(--space-1)] px-[var(--space-3)] pb-[var(--space-2)] text-[length:var(--text-xs)] text-warn">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
          这个类别没有回赠数据，未参与排序
        </p>
      )}

      {!unknown && scheme.netRealistic < 0 && (
        <p className="px-[var(--space-3)] pb-[var(--space-2)] text-[length:var(--text-xs)] text-neg">
          倒贴 {formatMoney(Math.abs(scheme.netRealistic))} · 通常仍优于付现金
        </p>
      )}
    </div>
  );
}
