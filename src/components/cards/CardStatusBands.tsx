/**
 * 卡详情页的状态带（card-detail.md §4，页级 0–3 条）。
 *
 * 这是**所有时效与新鲜度警示的唯一集中地**。散在字段里会让用户漏看，
 * 集中之后用户养成「进这屏先看顶上有没有条」的习惯。
 *
 * 三种条的颜色语义是严格分层的，不能混用：
 * - 已过期 → 红：优惠确实失效了，计算结果已经变了。**本页唯一用红的地方**
 * - 即将到期 → 黄：提醒，不是错误。警示的目的是让用户有时间处理，不是让他惊慌
 * - 数据过期 → 灰（surface-2）：数据旧不是风险事件，是日常维护
 *
 * 左侧只有 1px 描边（整体边框的一部分），不是 3px 粗条纹 —— 粗条纹是 AI 模板语法。
 */

import { Clock, History, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ValidityState } from '../../domain/types';
import { percent2 } from '../../lib/format';

interface CardStatusBandsProps {
  validity: ValidityState;
  /** 距上次核对多少天 */
  staleDays: number;
  /** 卡的默认外币费率，用于「之后按 X% 计」 */
  fxRate: number;
  onConfirmFresh: () => void;
}

interface BandProps {
  icon: LucideIcon;
  tone: 'warn' | 'neg' | 'neutral';
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

const TONE: Record<BandProps['tone'], { box: string; icon: string; title: string }> = {
  warn: { box: 'bg-warn-tint border-warn', icon: 'text-warn', title: 'text-warn' },
  neg: { box: 'bg-neg-tint border-neg', icon: 'text-neg', title: 'text-neg' },
  neutral: { box: 'bg-surface-2 border-line', icon: 'text-muted', title: 'text-fg' },
};

function Band({ icon: Icon, tone, title, body, action }: BandProps): React.JSX.Element {
  const cls = TONE[tone];
  return (
    <div className={`flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] border px-[var(--space-4)] py-[var(--space-3)] ${cls.box}`}>
      <div className="flex items-start gap-[var(--space-2)]">
        <Icon size={16} strokeWidth={2} className={`mt-0.5 shrink-0 ${cls.icon}`} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className={`text-[length:var(--text-sm)] font-[var(--fw-emphasize)] ${cls.title}`}>{title}</p>
          <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">{body}</p>
        </div>
      </div>
      {action !== undefined && (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-[var(--size-touch)] self-start rounded-md border border-line-strong px-[var(--space-3)] text-[length:var(--text-sm)] text-fg"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function CardStatusBands({
  validity,
  staleDays,
  fxRate,
  onConfirmFresh,
}: CardStatusBandsProps): React.JSX.Element | null {
  const bands: React.JSX.Element[] = [];

  // 顺序固定：越紧急越靠上（§4.2）
  if (validity.state === 'expired') {
    bands.push(
      <Band
        key="expired"
        icon={TriangleAlert}
        tone="neg"
        title={`${percent2(0)} 优惠已于 ${validity.validUntil} 到期`}
        body={`现在按 ${percent2(fxRate)} 计算。以银行最新公告为准。`}
      />,
    );
  } else if (validity.state === 'expiring_soon') {
    bands.push(
      <Band
        key="expiring"
        icon={Clock}
        tone="warn"
        title={`还剩 ${String(validity.daysLeft)} 天到期`}
        body={`${percent2(0)} 跨境手续费优惠至 ${validity.validUntil}，之后按 ${percent2(fxRate)} 计`}
      />,
    );
  }

  if (staleDays > 90) {
    bands.push(
      <Band
        key="stale"
        icon={History}
        tone="neutral"
        title={`这张卡 ${String(staleDays)} 天没核对了`}
        body="回赠可能已经变了。核对过就点右边确认。"
        action={{ label: '确认过了', onClick: onConfirmFresh }}
      />,
    );
  }

  if (bands.length === 0) return null;

  return (
    <div className="flex flex-col gap-[var(--space-2)] pt-[var(--space-4)]">
      {bands}
    </div>
  );
}
