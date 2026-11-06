/**
 * 我的卡 —— 卡库管理 + 额度，两 tab（F2 / F6）。
 *
 * 为什么额度并在这一页：额度是「这张卡的额度」的聚合，与卡库是同一份数据的
 * 两个视角。独立成一级 tab 会把底部导航撑到 4 项，而 8 张卡的用户需要的是
 * 「我的卡」这一个心智抽屉。深链 /cards/limits 由路由的 view prop 承接，
 * 供答案卡「额度快用尽」直达。
 *
 * 分组按发卡地而不是按收益：用户翻卡时在想「我那张香港的卡在哪」。
 */

import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CardListItem } from '../components/cards/CardListItem';
import { CardStatsBar } from '../components/cards/CardStatsBar';
import { LimitRow } from '../components/cards/LimitRow';
import { RecordSpendSheet } from '../components/cards/RecordSpendSheet';
import { EmptyState } from '../components/common/EmptyState';
import { PageShell } from '../components/layout/PageShell';
import { TabBar } from '../components/layout/TabBar';
import { TopBar } from '../components/layout/TopBar';
import { useCards, useLedger } from '../db/useDb';
import type { CardRow } from '../db/schema';
import type { CapUsage } from '../hooks/useCapUsage';
import { useEngineParams } from '../db/paramsRepository';
import { tightestUsage, useCardUsages } from '../hooks/useCapUsage';
import { ISSUER_REGION_LABEL } from '../lib/labels';

interface CardsPageProps {
  /** 'cards' 默认卡库视图；'limits' 额度视图（/cards/limits 深链） */
  view?: 'cards' | 'limits';
}

const GROUP_ORDER = ['MO', 'HK'] as const;

export function CardsPage({ view = 'cards' }: CardsPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'cards' | 'limits'>(view);
  /** 记一笔的目标卡；null = 面板关闭 */
  const [recordTarget, setRecordTarget] = useState<CardRow | null>(null);
  const { cards, loaded } = useCards();
  const { ledger } = useLedger();
  const { params } = useEngineParams(cards);

  const usages = useCardUsages(cards, ledger, params.fx, params.today);

  const ratios = useMemo(() => {
    const map = new Map<string, number>();
    for (const [cardId, list] of usages) {
      const tight = tightestUsage(list);
      if (tight) map.set(cardId, tight.ratio);
    }
    return map;
  }, [usages]);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((region) => ({
        region,
        items: cards.filter((c) => c.issuerRegion === region && c.active !== false),
      })).filter((g) => g.items.length > 0),
    [cards],
  );

  const inactive = cards.filter((c) => c.active === false);
  const limitRows = useMemo(
    () =>
      cards
        .flatMap((card) => (usages.get(card.cardId) ?? []).map((usage) => ({ card, usage })))
        // 额度视图按「最紧张」排前面：用户进来就是为了看哪张快满了
        .sort((a, b) => b.usage.ratio - a.usage.ratio),
    [cards, usages],
  );

  return (
    <PageShell
      topbar={<TopBar title="我的卡" />}
      tabbar={<TabBar />}
      contentPaddingBottom="calc(var(--size-tabbar) + var(--safe-bottom) + 88px)"
    >
      <div className="mx-auto w-full max-w-[var(--container-desktop)]">
        <TabSwitch value={tab} onChange={setTab} />

        {tab === 'cards' ? (
          <>
            {cards.length > 0 && <CardStatsBar cards={cards} ratios={ratios} />}

            {!loaded && <p className="px-[var(--space-4)] py-[var(--space-6)] text-[length:var(--text-sm)] text-muted">正在读本机卡片数据…</p>}

            {loaded && cards.length === 0 && (
              <EmptyState
                title="卡库里还没有卡"
                body="从预置的 12 张港澳常见卡里挑一张，规则会自动带出来，你只需要核对。"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      void navigate('/cards/new');
                    }}
                    className="h-[var(--size-touch)] rounded-md bg-accent px-[var(--space-5)] text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-on-accent"
                  >
                    选一张预置卡
                  </button>
                }
              />
            )}

            {groups.map((group) => (
              <section key={group.region}>
                <h2 className="px-[var(--space-4)] pb-[var(--space-1)] pt-[var(--space-5)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
                  {ISSUER_REGION_LABEL[group.region]}
                </h2>
                {group.items.map((card) => (
                  <CardListItem key={card.cardId} card={card} today={params.today} usedRatio={ratios.get(card.cardId) ?? null} />
                ))}
              </section>
            ))}

            {inactive.length > 0 && (
              <section>
                <h2 className="px-[var(--space-4)] pb-[var(--space-1)] pt-[var(--space-5)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
                  已停用 · {inactive.length} 张
                </h2>
                {inactive.map((card) => (
                  <CardListItem key={card.cardId} card={card} today={params.today} usedRatio={null} />
                ))}
              </section>
            )}

            <p className="px-[var(--space-4)] py-[var(--space-5)] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-meta">
              点任意一张卡可以核对回赠、看来源和核实日期。回赠变了随时能改，改完答案立刻跟着变。
            </p>
          </>
        ) : (
          <LimitsView
            rows={limitRows}
            loaded={loaded}
            hasLedger={ledger.length > 0}
            onRecord={(card) => {
              setRecordTarget(card);
            }}
          />
        )}
      </div>

      {recordTarget !== null && (
        <RecordSpendSheet
          open
          onClose={() => {
            setRecordTarget(null);
          }}
          card={recordTarget}
          params={params}
          ledger={ledger}
          defaultCurrency={recordTarget.cardCurrency}
        />
      )}

      <button
        type="button"
        onClick={() => {
          void navigate('/cards/new');
        }}
        aria-label="添加卡片"
        className="fixed right-[var(--space-4)] z-[var(--z-fab)] flex h-14 w-14 items-center justify-center rounded-[var(--radius-pill)] bg-accent text-on-accent transition-colors duration-[var(--motion-fast)] hover:bg-accent-hover"
        style={{ bottom: 'calc(var(--size-tabbar) + var(--safe-bottom) + var(--space-4))' }}
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>
    </PageShell>
  );
}

function TabSwitch({
  value,
  onChange,
}: {
  value: 'cards' | 'limits';
  onChange: (next: 'cards' | 'limits') => void;
}): React.JSX.Element {
  const items: Array<{ key: 'cards' | 'limits'; label: string }> = [
    { key: 'cards', label: '卡片' },
    { key: 'limits', label: '额度' },
  ];
  return (
    <div
      role="tablist"
      aria-label="卡库视图"
      className="flex gap-[var(--space-1)] border-b border-line-subtle px-[var(--space-4)]"
    >
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onChange(item.key);
            }}
            className={[
              'relative min-h-[var(--size-touch)] px-[var(--space-3)] text-[length:var(--text-base)] transition-colors duration-[var(--motion-fast)]',
              active ? 'font-[var(--fw-emphasize)] text-fg' : 'text-muted hover:text-fg-2',
            ].join(' ')}
          >
            {item.label}
            {active && <span className="absolute inset-x-[var(--space-2)] bottom-0 h-0.5 bg-accent" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function LimitsView({
  rows,
  loaded,
  hasLedger,
  onRecord,
}: {
  rows: Array<{ card: CardRow; usage: CapUsage }>;
  loaded: boolean;
  hasLedger: boolean;
  onRecord: (card: CardRow) => void;
}): React.JSX.Element {
  const navigate = useNavigate();

  if (loaded && rows.length === 0) {
    return (
      <EmptyState
        title="没有卡设了上限"
        body="你库里的卡都没有月度/年度回赠上限，所以这里没有进度可看。刷哪张只看回赠就行。"
        action={
          <button
            type="button"
            onClick={() => {
              void navigate('/');
            }}
            className="h-[var(--size-touch)] rounded-md border border-line-strong px-[var(--space-4)] text-[length:var(--text-base)] text-fg"
          >
            回算一笔
          </button>
        }
      />
    );
  }

  return (
    <>
      {!hasLedger && rows.length > 0 && (
        <div className="border-b border-line-subtle px-[var(--space-4)] py-[var(--space-3)]">
          <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
            还没有记账记录，所以所有额度都是满的。刷完一笔顺手「记一笔」，这里的进度才会准。
          </p>
        </div>
      )}
      {rows.map(({ card, usage }) => (
        <LimitRow
          key={`${card.cardId}-${usage.capId}`}
          card={card}
          usage={usage}
          onRecord={() => {
            onRecord(card);
          }}
        />
      ))}
    </>
  );
}
