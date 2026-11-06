/**
 * 答案卡 —— 本产品唯一主角，sticky 固定在视口底部（SPEC AC-F3-03）。
 *
 * 五态：empty / loading / populated / noResult / error。高度刻意做得接近
 * （空态用 min-height 撑到与结果态相同），否则内容区滚动位置会在输入时抖 ——
 * 用户在打字，页面自己在动，是最廉价的一种失礼。
 *
 * 数字排版的三条铁律（MASTER §5.3）：
 * - 符号属于金额，必须存在（+ / − / ±），且 `−` 是 U+2212 不是 hyphen
 * - 币种符号 0.7em 且同色：`HK$` 是上下文，`23.40` 是答案
 * - 全部 tabular-nums：改金额时宽度不跳，这是信任问题
 */

import { ChevronRight, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RankResult, Scheme } from '../../domain/types.result';
import { formatMoney, percent2, signedMoney } from '../../lib/format';
import { CardFace } from '../cards/CardFace';

export type AnswerState =
  | { kind: 'loading' }
  | { kind: 'empty'; amountMissing: boolean }
  | { kind: 'ready'; result: RankResult }
  | { kind: 'error'; onRetry: () => void };

interface AnswerCardProps {
  state: AnswerState;
  /** 点击折叠触发器 */
  onOpenCompare: () => void;
  /** 失格态里的 CTA */
  onGoLimits: () => void;
  onGoImport: () => void;
  children?: ReactNode;
}

const MIN_HEIGHT = 216;

export function AnswerCard({ state, onOpenCompare, onGoLimits, onGoImport }: AnswerCardProps): React.JSX.Element {
  return (
    <section
      aria-live="polite"
      aria-label="测算答案"
      /* 顶角圆 + 1px 描边 + 上投阴影：让它读作「从内容区浮起来的一块」，
         而不是页面被切成两半。深色下阴影几乎不可见，所以主要靠描边和圆角 */
      className="rounded-t-[var(--radius-lg)] border-x border-t border-line bg-surface-1 shadow-[0_-10px_28px_-16px_rgba(0,0,0,0.9)]"
      style={{ minHeight: MIN_HEIGHT }}
    >
      <div className="mx-auto w-full max-w-[var(--container-desktop)] px-[var(--space-4)] pb-[var(--space-3)] pt-[var(--space-4)]">
        {state.kind === 'loading' && <LoadingBody />}
        {state.kind === 'empty' && <EmptyBody amountMissing={state.amountMissing} />}
        {state.kind === 'error' && <ErrorBody onRetry={state.onRetry} onGoImport={onGoImport} />}
        {state.kind === 'ready' && <ReadyBody result={state.result} onOpenCompare={onOpenCompare} onGoLimits={onGoLimits} />}
      </div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="text-[length:var(--text-xs)] text-meta">{children}</p>;
}

function LoadingBody(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <Label>正在算</Label>
      {/* 两个破折号，tabular 宽度稳定；不转 spinner（会让 3 秒目标显得更慢） */}
      <p className="num text-[length:var(--text-2xl)] font-[var(--fw-announce)] leading-[var(--leading-tight)] text-disabled">
        ——
      </p>
    </div>
  );
}

function EmptyBody({ amountMissing }: { amountMissing: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <p className="text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
        {amountMissing ? '还差一个金额' : '选个类别和金额，立刻知道刷哪张'}
      </p>
      <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
        {amountMissing
          ? '输入这笔消费多少钱，答案就会出现在这里。'
          : '地区默认澳门，渠道默认上次用的那个。只要输入金额就会出答案。'}
      </p>
    </div>
  );
}

function ErrorBody({ onRetry, onGoImport }: { onRetry: () => void; onGoImport: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <p className="text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">读不到卡片数据</p>
      <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
        数据存在本机数据库里，可能是被浏览器清理了。先重试，不行就从备份 JSON 导入。
      </p>
      <div className="flex items-center gap-[var(--space-2)]">
        <button
          type="button"
          onClick={onRetry}
          className="h-9 rounded-md bg-accent px-[var(--space-3)] text-[length:var(--text-sm)] font-[var(--fw-emphasize)] text-on-accent"
        >
          重试
        </button>
        <button
          type="button"
          onClick={onGoImport}
          className="h-9 px-[var(--space-2)] text-[length:var(--text-sm)] text-fg-2 underline underline-offset-2"
        >
          去导入备份
        </button>
      </div>
    </div>
  );
}

/**
 * 冠军卡的副行 —— 回答「为什么是这张」，不重复下面的「净返 X%」。
 *
 * 踩过的坑：这里原本以「净返 2.00%」开头，而大数字正下方那行也写「净返 2.00%」。
 * 同一句话隔 60px 说两遍，用户第一反应不是「信息一致」，而是「这两个数是不是不一样」。
 * 副行只讲**差异**：外币费吃掉多少，或者比第二名多赚多少。都没有就不占这一行。
 */
function subLine(champion: Scheme, result: RankResult): string | null {
  const runnerUp = result.ranked[1];
  const currency = result.input.settlementCurrency;
  const parts: string[] = [];

  if (champion.fxFee > 0 && champion.route !== 'local') {
    parts.push(`外币费 ${percent2(champion.fxFee / result.input.amount)}`);
  }
  if (runnerUp !== undefined) {
    const lead = champion.netRealistic - runnerUp.netRealistic;
    if (lead > 0) parts.push(`比第二名多 ${formatMoney(lead)} ${currency}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function ReadyBody({
  result,
  onOpenCompare,
  onGoLimits,
}: {
  result: RankResult;
  onOpenCompare: () => void;
  onGoLimits: () => void;
}): React.JSX.Element {
  const champion = result.ranked[0];
  const currency = result.input.settlementCurrency;

  // 全部失格：明确给次优解与出路，不制造死路（MASTER §3.2 / §8.1）
  if (!champion) {
    const unknownCount = result.unranked.length;
    return (
      <div className="flex flex-col gap-[var(--space-2)]">
        <p className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg">
          {unknownCount > 0 ? '这里没有能比的卡' : '卡库里还没有卡'}
        </p>
        <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
          {unknownCount > 0
            ? `这 ${String(unknownCount)} 张卡在这个类别都没有回赠数据。不是它们不好，是我们还没查到。`
            : '从预置的 12 张港澳常见卡里选一张，规则会自动带出来。'}
        </p>
        <button
          type="button"
          onClick={onGoLimits}
          className="mt-[var(--space-1)] h-9 self-start rounded-md border border-line-strong px-[var(--space-3)] text-[length:var(--text-sm)] text-fg"
        >
          去补数据
        </button>
      </div>
    );
  }

  const needsCaution =
    champion.confidence === 'low' || champion.confidence === 'unknown' ||
    champion.warnings.some((w) => w.code === 'unknown_rate' || w.code === 'low_confidence');
  const optimisticDiffers = Math.abs(champion.netOptimistic - champion.netRealistic) >= 0.005;
  const why = subLine(champion, result);
  const netRate = champion.netRealistic / result.input.amount;
  const nominalRate = Math.max(0, champion.grossCashback + champion.pointsValue) / result.input.amount;
  /* 名义和实返相等时只写一个。写「净返 2.00% · 名义 2.00%」等于让用户去比两个
     一模一样的数，然后怀疑自己看错了 */
  const showNominal = Math.abs(nominalRate - netRate) >= 0.0001;

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-[var(--space-3)]">
        <div className="min-w-0 flex-1">
          <Label>刷这张</Label>
          <p
            className="mt-[var(--space-1)] text-[length:var(--text-xl)] font-[var(--fw-announce)] leading-[var(--leading-snug)] tracking-[var(--tracking-heading)] text-fg"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {champion.cardName}
          </p>
          {why !== null && <p className="num mt-[var(--space-1)] text-[length:var(--text-sm)] text-fg-2">{why}</p>}
        </div>
        {/* 小卡面：让「刷这张」从一句卡名变成一张看得见的卡。
            没有官方素材时自动退回绘制卡面，不会留空 */}
        <CardFace
          card={{
            cardId: champion.cardId,
            issuer: champion.issuer,
            cardName: champion.cardName,
            network: champion.network,
          }}
        />
      </div>

      {/* 48px 主数字：全屏唯一 */}
      <p className="mt-[var(--space-3)] flex items-baseline gap-[var(--space-1)]">
        <span
          className={[
            'num text-[length:var(--text-3xl)] font-[var(--fw-announce)] leading-[var(--leading-tight)]',
            'tracking-[var(--tracking-display)]',
            champion.netRealistic < 0 ? 'text-neg' : champion.netRealistic > 0 ? 'text-pos' : 'text-muted',
          ].join(' ')}
        >
          {/* 符号与币种降两号：视觉重量全部集中到数字本身 */}
          <span className="text-[length:var(--text-xl)]">{champion.netRealistic > 0 ? '+' : champion.netRealistic < 0 ? '−' : '±'}</span>
          <span className="text-[length:var(--text-xl)]">{currency} </span>
          {formatMoney(champion.netRealistic)}
        </span>
      </p>

      <p className="mt-[var(--space-1)] text-[length:var(--text-xs)] text-meta">
        {champion.netRealistic < 0 ? '倒贴 · ' : ''}净返 {percent2(netRate)}
        {showNominal && <> · 名义 {percent2(nominalRate)}</>}
      </p>

      {optimisticDiffers && (
        <p className="mt-[var(--space-1)] text-[length:var(--text-xs)] text-warn">
          额度用尽后降为 {signedMoney(champion.netOptimistic, '')} {currency}
        </p>
      )}

      {needsCaution && (
        <p className="mt-[var(--space-1)] flex items-center gap-[var(--space-1)] text-[length:var(--text-xs)] text-warn">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
          这张卡此项数据待核对，结论可能偏差
        </p>
      )}

      {/* 折叠触发器：整行 48px 可点 */}
      <button
        type="button"
        onClick={onOpenCompare}
        className="mt-[var(--space-2)] flex min-h-11 w-full items-center justify-between border-t border-line-subtle pt-[var(--space-2)] text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg-2"
      >
        <span>
          查看全部 {String(result.ranked.length + result.unranked.length)} 张对比
        </span>
        {/* 右侧原本再报一次「+2.00%」，那是主数字已经说过的话。
            换成箭头：这一行是「还有更多」，不是「又一个数字」 */}
        <ChevronRight size={18} strokeWidth={2} className="text-muted" aria-hidden="true" />
      </button>
    </div>
  );
}
