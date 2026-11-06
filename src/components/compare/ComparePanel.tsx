/**
 * 对比 sheet（MASTER §3.3 + §4）—— 本项目最容易做吵的地方。
 *
 * 四条「不吵」的规则在这里落地：
 * 1. 统一基准，只比一个数（净返金额）
 * 2. 恰好 4 列，列宽固定（56/72/64）
 * 3. 冠军靠整行底色 + 字重 + 文字标签
 * 4. 默认只展开前 3 名，第 4 名起折叠；失格卡独立分组，**绝不静默排除**
 *
 * 第 4 条尤其重要：用户看到 7 张卡只列了 3 张，第一反应是「剩下的没算」。
 * 所以折叠行明确写「展开其余 N 张」，失格分组明确写原因。
 */

import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RankResult, Scheme } from '../../domain/types.result';
import { categoryLabel, channelLabel, regionLabel } from '../../lib/labels';
import { BottomSheet } from '../common/BottomSheet';
import { WhyBreakdown } from '../answer/WhyBreakdown';
import { CompareRow } from './CompareRow';

interface ComparePanelProps {
  open: boolean;
  onClose: () => void;
  result: RankResult;
  /** 消费地区，显示在条件摘要里 */
  region: 'MO' | 'CN';
}

const INITIAL_VISIBLE = 3;

function formatAmountCell(amount: number): string {
  return amount >= 10000 ? amount.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(amount);
}

export function ComparePanel({ open, onClose, result, region }: ComparePanelProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const amount = result.input.amount;
  const channel = channelLabel(result.input.channel);
  const champion = result.ranked[0];

  const visible = useMemo(
    () => (showAll ? result.ranked : result.ranked.slice(0, INITIAL_VISIBLE)),
    [result.ranked, showAll],
  );
  const hiddenCount = result.ranked.length - visible.length;
  const total = result.ranked.length + result.unranked.length;
  const subtitle = `消费 ${formatAmountCell(amount)} ${result.input.settlementCurrency} · ${categoryLabel(result.input.category)} · ${regionLabel(region)}`;

  return (
    <BottomSheet open={open} onClose={onClose} title={`全部 ${String(total)} 张卡`} subtitle={subtitle}>
      <div className="flex flex-col">
        <div className="flex items-center gap-[var(--space-2)] border-b border-line px-[var(--space-3)] py-[var(--space-2)]">
          <span className="min-w-0 flex-1 text-[length:var(--text-2xs)] text-meta">卡 / 渠道</span>
          <span className="shrink-0 text-right text-[length:var(--text-2xs)] text-meta" style={{ width: 56 }}>
            回赠
          </span>
          <span className="shrink-0 text-right text-[length:var(--text-2xs)] text-meta" style={{ width: 72 }}>
            净返
          </span>
          <span className="shrink-0 text-right text-[length:var(--text-2xs)] text-meta" style={{ width: 64 }}>
            差第一
          </span>
        </div>

        {visible.map((scheme, index) => {
          const isChampion = champion !== undefined && scheme.cardId === champion.cardId;
          const isExpanded = expandedId === scheme.cardId;
          return (
            <div key={scheme.cardId}>
              <CompareRow
                scheme={scheme}
                amount={amount}
                leadDiff={champion ? scheme.netRealistic - champion.netRealistic : undefined}
                channelLabel={channel}
                isChampion={isChampion && index === 0}
                expanded={isExpanded}
                onToggle={() => {
                  setExpandedId(isExpanded ? null : scheme.cardId);
                }}
              />
              {isExpanded && (
                <div className="px-[var(--space-3)] pb-[var(--space-3)]">
                  <WhyBreakdown scheme={scheme} currency={result.input.settlementCurrency} />
                </div>
              )}
            </div>
          );
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setShowAll(true);
            }}
            className="flex h-12 items-center justify-center gap-[var(--space-1)] text-[length:var(--text-base)] text-fg-2 hover:bg-surface-2"
          >
            展开其余 {String(hiddenCount)} 张
            <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        )}

        {result.unranked.length > 0 && (
          <div className="mt-[var(--space-2)] border-t border-line pt-[var(--space-3)]">
            <p className="mb-[var(--space-2)] px-[var(--space-3)] text-[length:var(--text-xs)] text-meta">
              不推荐 · {String(result.unranked.length)} 张
            </p>
            <ul className="flex flex-col gap-[var(--space-2)]">
              {result.unranked.map((scheme) => (
                <UnrankedRow key={scheme.cardId} scheme={scheme} channel={channel} />
              ))}
            </ul>
          </div>
        )}

        {result.ranked.length === 0 && result.unranked.length === 0 && (
          <p className="px-[var(--space-3)] py-[var(--space-6)] text-center text-[length:var(--text-sm)] text-fg-2">
            卡库里还没有卡。去「我的卡」添加一张，这里就会列出来。
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

/**
 * 不参与排序的卡：只说「为什么没算进来」，不给任何数字（AC-F1-03）。
 *
 * 二分流（ADR-011 §6）：
 * - `channel_gated` → 「渠道不适用」，行内必须带「换成哪个渠道可用」
 * - 其余（`unknown_rate` / `no_point_valuation`）→ 「返现未知」
 *
 * 原来的第三支 `threshold_tier_incomplete` 已随 ADR-011 删除：新模型下费率永远
 * 来自 `categories`，不存在「门槛档位未配置收益」这个状态，它的等价危险形态
 * 在加载期就红灯，到不了 UI。
 */
export function UnrankedRow({ scheme, channel }: { scheme: Scheme; channel: string }): React.JSX.Element {
  const gated = scheme.warnings.find((w) => w.code === 'channel_gated');

  return (
    <li className="flex items-center justify-between gap-[var(--space-2)] px-[var(--space-3)] opacity-60">
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[length:var(--text-md)] text-fg-2">{scheme.cardName}</span>
        <span className="text-[length:var(--text-xs)] text-meta">
          {gated && gated.applicableChannels.length > 0
            ? `换成${gated.applicableChannels.map(channelLabel).join(' / ')}可用`
            : channel}
        </span>
      </span>
      <span className="shrink-0 text-[length:var(--text-sm)] text-warn">
        {gated ? '渠道不适用' : '回赠未知'}
      </span>
    </li>
  );
}
