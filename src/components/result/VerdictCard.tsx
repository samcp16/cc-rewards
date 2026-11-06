/**
 * 结论卡 —— 全屏唯一的 40px 主角数字所在处。
 *
 * 三条不可让步的规则（MASTER §11.3）：
 *
 * 1. **金额永远带符号。** 颜色只是第二遍阅读时的加速，第一遍靠符号 + 文字。
 *    倒贴还要额外写「倒贴」二字，不能只靠红色。
 * 2. **数字开 tabular-nums（.num）。** 改金额时宽度不跳 —— 这是信任问题。
 * 3. **accent 不能当文字色。** 蓝色文字一律 --accent-text（6.71:1），
 *    用 --accent 只有 3.54:1。
 *
 * 另外：冠军行/冠军卡用整行底色偏移 + 590 字重表达层级，不用左侧彩色条纹，
 * 也不用阴影（深色下阴影视觉无效）。
 */

import { AlertTriangle, Info, Trophy } from 'lucide-react';
import type { RankResult, Scheme, SchemeWarning } from '../../domain/types.result';
import { channelLabel } from '../../lib/labels';
import { formatAmount2, formatPercent2 } from '../../lib/money';

interface VerdictCardProps {
  result: RankResult;
}

/** 金额带符号。零值用 ± 而不是 +0.00，避免被读成「赚了一点点」。 */
function signedAmount(value: number): string {
  if (value === 0) return `±${formatAmount2(0)}`;
  const sign = value > 0 ? '+' : '−';
  return `${sign}${formatAmount2(Math.abs(value))}`;
}

/** 净额 → 语义色 token 类名。零与「少赚」不配红色（alarm fatigue）。 */
function amountColorClass(value: number): string {
  if (value > 0) return 'text-pos';
  if (value < 0) return 'text-neg';
  return 'text-muted';
}

/** 告警码 → 中文。SPEC AC-F4-03 要求这些必须能被人读懂，不能显示 code。 */
function warningText(warning: SchemeWarning): string {
  switch (warning.code) {
    case 'dcc_risk':
      return '若收银台提示 DCC（以澳门币/港币结算），请拒绝，选原币结算';
    case 'cap_nearly_exhausted':
      return `额度即将用尽：剩余 ${formatAmount2(warning.remaining)} ${warning.currency}`;
    case 'cap_exhausted':
      return '本期额度已用尽，超出部分按降档回赠计算';
    case 'stale_rate':
      return `回赠数据是 ${warning.verifiedAt} 核实的，已超过 90 天，建议核对`;
    case 'fx_fee_exempt_expired':
      return `免手续费优惠已于 ${warning.validUntil} 到期，现按默认手续费率计算`;
    case 'fx_fee_exempt_expiring':
      return `免手续费优惠将于 ${warning.validUntil} 到期（还剩 ${warning.daysLeft} 天）`;
    case 'cap_cross_currency_converted':
      return `额度以 ${warning.from} 计，已按参考汇率折算为 ${warning.to} 归集`;
    case 'unknown_rate':
      return '该类别回赠未知，不参与排序';
    // 渠道不适用必须给出「换成哪个渠道就好了」这个可执行动作，
    // 否则用户只知道这张卡没了，不知道该怎么补救。
    case 'channel_gated':
      return warning.applicableChannels.length > 0
        ? `本卡此类别仅在${warning.applicableChannels.map(channelLabel).join(' / ')}渠道适用，${channelLabel(warning.channel)} 下回赠未知，不参与排序`
        : `本卡此类别在 ${channelLabel(warning.channel)} 下回赠未知，不参与排序`;
    case 'no_point_valuation':
      return '积分价值未设定，暂按保守估值计算';
    case 'point_valuation_estimated':
      return warning.note;
    case 'low_confidence':
      return '该卡此项数据待核对，结论可能偏差';
    default:
      return '存在未识别的提示';
  }
}

function SchemeLine({ scheme, rank }: { scheme: Scheme; rank: number }): React.JSX.Element {
  const isChampion = rank === 0;
  return (
    <li
      className={[
        'flex items-center gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)]',
        isChampion ? 'bg-row-champion' : '',
      ].join(' ')}
      style={{ minHeight: 'var(--size-row-compare)' }}
    >
      <span className="w-6 shrink-0 text-[length:var(--text-xs)] text-meta" aria-hidden="true">
        {rank + 1}
      </span>
      <span
        className={[
          'min-w-0 flex-1 truncate text-[length:var(--text-md)]',
          isChampion
            ? 'font-[var(--fw-announce)] text-fg'
            : 'font-[var(--fw-emphasize)] text-fg-2',
        ].join(' ')}
      >
        {scheme.cardName}
      </span>
      <span
        className={`num shrink-0 text-right text-[length:var(--text-md)] font-[var(--fw-emphasize)] ${amountColorClass(scheme.netRealistic)}`}
      >
        {signedAmount(scheme.netRealistic)}
      </span>
      <span className="num w-16 shrink-0 text-right text-[length:var(--text-xs)] text-muted">
        {scheme.netRateRealistic === 0
          ? '±0.00%'
          : `${scheme.netRateRealistic > 0 ? '+' : '−'}${formatPercent2(Math.abs(scheme.netRateRealistic))}`}
      </span>
    </li>
  );
}

export function VerdictCard({ result }: VerdictCardProps): React.JSX.Element {
  const champion = result.ranked[0];

  // 一张卡都没排上：不是「没有好卡」，而是「数据不足以判断」。
  // 这两种情况必须给出不同的文案，否则用户会以为所有卡都不划算。
  if (!champion) {
    return (
      <section className="rounded-lg border border-line bg-surface-1 p-[var(--space-4)]">
        <div className="flex items-start gap-[var(--space-2)]">
          <Info size={20} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
          <div className="flex flex-col gap-[var(--space-1)]">
            <p className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg">
              暂无可比较的卡
            </p>
            <p className="text-[length:var(--text-sm)] text-fg-2">
              {result.unranked.length > 0
                ? `卡库中有 ${result.unranked.length} 张卡缺少该类别数据，因此无法判断优劣。`
                : '卡库为空，请先添加至少一张卡。'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const runnerUp = result.ranked[1];
  const lead = runnerUp ? champion.netRealistic - runnerUp.netRealistic : undefined;
  // 额度用尽后会降档：这两个数不同时必须讲清楚，否则用户高估收益
  const optimisticDiffers = champion.netOptimistic !== champion.netRealistic;

  return (
    <section
      className="flex flex-col gap-[var(--space-4)] rounded-lg border border-line bg-surface-1 p-[var(--space-4)]"
      aria-live="polite"
    >
      {/* 冠军结论 */}
      <div className="flex flex-col gap-[var(--space-2)]">
        <div className="flex items-center gap-[var(--space-1)]">
          <Trophy size={16} className="shrink-0 text-warn" aria-hidden="true" />
          <span className="text-[length:var(--text-xs)] tracking-[var(--tracking-caps)] text-muted">
            刷这张
          </span>
        </div>

        <p className="text-[length:var(--text-xl)] font-[var(--fw-announce)] tracking-[var(--tracking-heading)] text-fg">
          {champion.cardName}
        </p>

        {/* 全屏唯一的 40px 数字 */}
        <p className="flex items-baseline gap-[var(--space-1)]">
          <span
            className={`num text-[length:var(--text-2xl)] font-[var(--fw-announce)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] ${amountColorClass(champion.netRealistic)}`}
            aria-label={`净返 ${champion.netRealistic > 0 ? '正' : champion.netRealistic < 0 ? '负' : '零'} ${formatAmount2(Math.abs(champion.netRealistic))} ${result.input.settlementCurrency}`}
          >
            {signedAmount(champion.netRealistic)}
          </span>
          <span className="text-[length:var(--text-md)] text-muted">
            {result.input.settlementCurrency}
          </span>
        </p>

        {champion.netRealistic < 0 && (
          <p className="text-[length:var(--text-sm)] text-neg">
            倒贴：这笔刷它会亏钱，但通常仍优于付现金
          </p>
        )}

        {lead !== undefined && (
          <p className="text-[length:var(--text-sm)] text-muted">
            比第二名多 <span className="num">{formatAmount2(lead)}</span>{' '}
            {result.input.settlementCurrency}
          </p>
        )}

        {optimisticDiffers && (
          <p className="text-[length:var(--text-sm)] text-warn">
            额度用尽后降为{' '}
            <span className="num">{signedAmount(champion.netOptimistic)}</span>{' '}
            {result.input.settlementCurrency}
          </p>
        )}
      </div>

      {/* 告警：只在有内容时出现，不占位 */}
      {champion.warnings.length > 0 && (
        <ul className="flex flex-col gap-[var(--space-1)] border-t border-line-subtle pt-[var(--space-3)]">
          {champion.warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${String(index)}`}
              className="flex items-start gap-[var(--space-2)] text-[length:var(--text-sm)] text-fg-2"
            >
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-warn"
                aria-hidden="true"
              />
              <span>{warningText(warning)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* 排名列表 */}
      {result.ranked.length > 1 && (
        <div className="flex flex-col border-t border-line-subtle pt-[var(--space-2)]">
          <ul className="flex flex-col divide-y divide-line-subtle">
            {result.ranked.map((scheme, index) => (
              <SchemeLine key={scheme.cardId} scheme={scheme} rank={index} />
            ))}
          </ul>
        </div>
      )}

      {/* 未知卡：单独分组，明确说明不参与排序（AC-F1-03） */}
      {result.unranked.length > 0 && (
        <div className="flex flex-col gap-[var(--space-1)] border-t border-line-subtle pt-[var(--space-3)]">
          <span className="text-[length:var(--text-2xs)] tracking-[var(--tracking-caps)] text-meta">
            未知 · 不参与排序
          </span>
          <p className="text-[length:var(--text-sm)] text-fg-2">
            {result.unranked
              .slice(0, 3)
              .map((scheme) => scheme.cardName)
              .join('、')}
            {result.unranked.length > 3 ? ` 等 ${result.unranked.length} 张` : ''}
          </p>
        </div>
      )}

      {/* 汇率说明：折算必须可见，不允许静默（SPEC §6.5） */}
      {result.fxNotes.length > 0 && (
        <p className="border-t border-line-subtle pt-[var(--space-2)] text-[length:var(--text-xs)] text-meta">
          {result.fxNotes.join('；')}
        </p>
      )}
    </section>
  );
}
