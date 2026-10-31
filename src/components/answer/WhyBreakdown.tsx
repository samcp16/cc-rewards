/**
 * 「为什么」逐项算式（SPEC AC-F4-01 / 02）。
 *
 * 三条不可让步的规则：
 *
 * 1. **至少四项**：毛返现、外币手续费、渠道服务费、净额。少一项用户就没法复算。
 * 2. **每项带来源链接与核实日期**。没有来源的费率等于「我猜的」，而本产品
 *    唯一的价值就是「这个数字来自哪里」。
 * 3. **跨币种折算说明不进成本项**（SPEC §6.5 第 4 条）——它不是成本，是单位换算。
 *    折算依据只在 fxNote 里出现，且必须显式可见，不允许静默折算。
 */

import { TriangleAlert } from 'lucide-react';
import type { BreakdownItem, Scheme } from '../../domain/types.result';
import { amountToneClass, formatMoney, signedMoney } from '../../lib/format';
import { SourceLink } from '../common/SourceLink';

interface WhyBreakdownProps {
  scheme: Scheme;
  currency: string;
}

const ROW_LABEL: Record<BreakdownItem['kind'], string> = {
  cashback: '毛返现',
  points: '积分价值',
  fx_fee: '外币手续费',
  channel_fee: '渠道服务费',
};

export function WhyBreakdown({ scheme, currency }: WhyBreakdownProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[var(--space-2)] rounded-md bg-surface-2 px-[var(--space-3)] py-[var(--space-3)]">
      {scheme.breakdown.map((item, index) => (
        <BreakdownRow key={`${item.kind}-${String(index)}`} item={item} currency={currency} />
      ))}

      {/* 折算与豁免说明：不静默，必须写在成本项之外 */}
      {(scheme.fxWaiverNote !== undefined || scheme.capsAffected.length > 0) && (
        <div className="flex flex-col gap-[var(--space-1)] border-t border-line-subtle pt-[var(--space-2)]">
          {scheme.fxWaiverNote !== undefined && (
            <p className="text-[length:var(--text-xs)] text-info">{scheme.fxWaiverNote}</p>
          )}
          {scheme.capsAffected.map((cap) =>
            cap.fxNote === undefined ? null : (
              <p key={cap.capId} className="text-[length:var(--text-xs)] text-info">
                {cap.fxNote}
              </p>
            ),
          )}
        </div>
      )}

      {scheme.thresholdNote !== undefined && (
        <p className="text-[length:var(--text-xs)] text-muted">{scheme.thresholdNote}</p>
      )}

      <div className="flex items-baseline justify-between border-t border-line pt-[var(--space-2)]">
        <span className="text-[length:var(--text-sm)] font-[var(--fw-emphasize)] text-fg">净额</span>
        <span className={`num text-[length:var(--text-lg)] font-[var(--fw-announce)] ${amountToneClass(scheme.netRealistic)}`}>
          {signedMoney(scheme.netRealistic, currency)}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[length:var(--text-sm)] text-muted">回报率</span>
        <span className="num text-[length:var(--text-sm)] text-fg-2">
          {formatMoney(scheme.netRateRealistic * 100)}%
        </span>
      </div>
    </div>
  );
}

function BreakdownRow({ item, currency }: { item: BreakdownItem; currency: string }): React.JSX.Element {
  // 成本项在引擎里已是负数（支出为负），这里保持原样显示符号，不二次取反
  const isCost = item.kind === 'fx_fee' || item.kind === 'channel_fee';
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <div className="flex items-start justify-between gap-[var(--space-2)]">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[length:var(--text-sm)] font-[var(--fw-emphasize)] text-fg-2">
            {ROW_LABEL[item.kind]}
          </span>
          <span className="text-[length:var(--text-xs)] leading-[var(--leading-normal)] text-muted">{item.label}</span>
        </div>
        <span className={`num shrink-0 text-[length:var(--text-md)] font-[var(--fw-emphasize)] ${isCost ? 'text-fg-2' : 'text-pos'}`}>
          {signedMoney(item.amount, currency)}
        </span>
      </div>

      {item.detail !== undefined && (
        <p className="flex items-start gap-[var(--space-1)] text-[length:var(--text-xs)] leading-[var(--leading-normal)] text-muted">
          {item.cappedBy !== undefined && item.cappedBy > 0 && (
            <TriangleAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          )}
          <span>{item.detail}</span>
        </p>
      )}

      {item.sourceUrl !== undefined && (
        <SourceLink url={item.sourceUrl} meta={item.verifiedAt === undefined ? undefined : `${item.verifiedAt} 核实`} />
      )}
    </div>
  );
}
