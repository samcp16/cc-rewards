/**
 * 卡详情 / 编辑（F2 / F4 / F6，card-detail.md）。
 *
 * 这屏是**数据可信度的产地**：用户在别的屏看到「净返 +MOP 111.00」，
 * 能在这里追问到「这 111 从哪来、谁说的、什么时候说的」。
 *
 * 三个设计决定：
 *
 * 1. **不做即时保存**。字段间有依赖（改结算币种会改变外币费率的豁免判定），
 *    即时保存会让用户在中间态看到错误结果。必须给一个明确的提交点。
 * 2. **删除放顶栏，不放底部**。底部是「保存」的领地，把破坏性操作和主操作
 *    放在同一区域是最常见的手滑来源。
 * 3. **外币费率空时阻止保存**，且就近报错不弹 toast —— 视线应该在出错的字段上。
 */

import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { ConfidenceTag } from '../components/common/ConfidenceTag';
import { PageShell } from '../components/layout/PageShell';
import { IconAction, TopBar } from '../components/layout/TopBar';
import { SourceLink } from '../components/common/SourceLink';
import { showToast } from '../components/common/Toast';
import { DeleteConfirm } from '../components/cards/DeleteConfirm';
import { IdentityFxFeeSection } from '../components/cards/IdentityFxFeeSection';
import { CardStatusBands } from '../components/cards/CardStatusBands';
import { CategorySection, CapUsageRow } from '../components/cards/CategorySection';
import { useCard, useCards, useLedger } from '../db/useDb';
import { deleteCard, putCard, touchVerified } from '../db/cardsRepository';
import { useEngineParams } from '../db/paramsRepository';
import type { CardRow } from '../db/schema';
import type { SpendCategory } from '../domain/types';
import { unknownCategories, validityOf, staleDaysOf } from '../lib/cardFacts';
import { useCardUsages } from '../hooks/useCapUsage';
import { PERIOD_LABEL, categoryLabel } from '../lib/labels';
import { formatMoney } from '../lib/format';

/** 把卡的规则拼成「月上限 HK$150」这种一句话 */
function capNoteOf(row: CardRow, category: SpendCategory): string | undefined {
  const hit = row.caps.filter((cap) => cap.categories === 'all' || cap.categories.includes(category));
  if (hit.length === 0) return undefined;
  return hit
    .map((cap) => `${PERIOD_LABEL[cap.period]}上限 ${formatMoney(cap.limitAmount)} ${cap.limitCurrency}`)
    .join(' · ');
}

export function CardDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { card, loaded } = useCard(id);
  const { cards } = useCards();
  const { ledger } = useLedger();
  const { params } = useEngineParams(cards);

  const [draft, setDraft] = useState<CardRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const fxRef = useRef<HTMLDivElement>(null);

  // 首次读到卡时建立草稿；之后不再覆盖（否则用户输入会被 useLiveQuery 冲掉）
  useEffect(() => {
    if (card && draft === null) setDraft(card);
  }, [card, draft]);

  const booked = ledger.filter((e) => e.cardId === id);
  const usages = useCardUsages(draft ? [draft] : [], ledger, params.fx, params.today).get(id ?? '') ?? [];

  const dirty = useMemo(() => {
    if (!draft || !card) return false;
    return JSON.stringify(draft) !== JSON.stringify(card);
  }, [draft, card]);

  if (loaded && !card) {
    return (
      <PageShell topbar={<TopBar title="卡片" onBack={() => void navigate('/cards')} centerTitle />}>
        <div className="flex flex-col items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-12)] text-center">
          <p className="text-[length:var(--text-lg)] font-[var(--fw-announce)] text-fg">这张卡不在了</p>
          <p className="text-[length:var(--text-sm)] text-fg-2">可能已经被删除了。</p>
          <div className="mt-[var(--space-2)]">
          <Button onClick={() => void navigate('/cards')}>回卡库</Button>
        </div>
        </div>
      </PageShell>
    );
  }

  if (!draft) {
    return (
      <PageShell topbar={<TopBar title="卡片" onBack={() => void navigate('/cards')} centerTitle />}>
        <p className="px-[var(--space-4)] py-[var(--space-6)] text-[length:var(--text-sm)] text-muted">正在读这张卡…</p>
      </PageShell>
    );
  }

  const validity = validityOf(draft, params.today);
  const staleDays = staleDaysOf(draft, params.today);
  const unknown = unknownCategories(draft);

  function patch(next: Partial<CardRow>): void {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function setCategoryToCashback(category: SpendCategory): void {
    setDraft((prev) => {
      if (!prev) return prev;
      const rule = prev.categories[category];
      return {
        ...prev,
        categories: {
          ...prev.categories,
          [category]:
            rule.kind === 'unknown'
              ? { kind: 'cashback', rates: { local: 0 }, note: '你手动填的费率' }
              : rule,
        },
      };
    });
  }

  async function handleSave(): Promise<void> {
    if (!draft) return;
    if (draft.fxFee.rate <= 0) {
      setFxError('外币手续费率没填。这一项直接决定净回报算得对不对。');
      fxRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      await putCard(draft);
      showToast('已保存');
      setSaving(false);
    } catch {
      showToast('存不上，本机数据库写入失败', 'error');
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!draft) return;
    await deleteCard(draft.cardId);
    setConfirmDelete(false);
    showToast('已从卡库移除');
    void navigate('/cards', { replace: true });
  }

  return (
    <PageShell
      topbar={
        <TopBar
          title={draft.cardName || '新卡片'}
          centerTitle
          onBack={() => {
            void navigate('/cards');
          }}
          actions={
            <IconAction
              label="删除这张卡"
              tone="danger"
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={24} strokeWidth={2} aria-hidden="true" />
            </IconAction>
          }
        />
      }
      sticky={
        <div className="border-t border-line bg-surface-1 px-[var(--space-4)] py-[var(--space-3)]">
          <div className="mx-auto w-full max-w-[var(--container-desktop)]">
            <Button fullWidth disabled={!dirty || saving} onClick={() => void handleSave()}>
              {saving ? '保存中…' : dirty ? '保存' : '已保存'}
            </Button>
          </div>
        </div>
      }
      contentPaddingBottom="calc(var(--space-8) + 72px + var(--safe-bottom))"
    >
      <div className="mx-auto w-full max-w-[var(--container-desktop)] px-[var(--space-4)]">
        <CardStatusBands
          validity={validity}
          staleDays={staleDays}
          fxRate={draft.fxFee.rate * 100}
          onConfirmFresh={() => {
            void touchVerified(draft.cardId).then(() => {
              showToast('已记为今天核对');
            });
          }}
        />

        <IdentityFxFeeSection draft={draft} patch={patch} fxError={fxError} fxRef={fxRef} />

        <section className="pt-[var(--space-6)]">
          <h2 className="mb-[var(--space-2)] flex items-baseline justify-between text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
            <span>各类别返现</span>
            <span className="num text-meta">{unknown.length === 0 ? '7 类都填了' : `${String(unknown.length)} 类待补`}</span>
          </h2>
          <CategorySection
            card={draft}
            onEditCategory={setCategoryToCashback}
            capNotes={{
              dining: capNoteOf(draft, 'dining'),
              grocery: capNoteOf(draft, 'grocery'),
              fuel: capNoteOf(draft, 'fuel'),
              flight: capNoteOf(draft, 'flight'),
              hotel: capNoteOf(draft, 'hotel'),
              online: capNoteOf(draft, 'online'),
              other: capNoteOf(draft, 'other'),
            }}
          />
          {unknown.length > 0 && (
            <p className="pt-[var(--space-2)] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-info">
              待补：{unknown.map((c) => categoryLabel(c)).join('、')}。点每一类的铅笔就能手动填 —— 你知道哪一项就填哪一项，不用等我们查。
            </p>
          )}
        </section>

        {usages.length > 0 && (
          <section className="pt-[var(--space-6)]">
            <h2 className="mb-[var(--space-2)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
              上限与已用
            </h2>
            {usages.map((usage) => (
              <CapUsageRow
                key={usage.capId}
                label={PERIOD_LABEL[usage.period]}
                used={usage.used}
                limit={usage.limit}
                currency={usage.currency}
                ratio={usage.ratio}
              />
            ))}
          </section>
        )}

        <section className="pt-[var(--space-6)]">
          <h2 className="mb-[var(--space-2)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
            数据来源
          </h2>
          {draft.source.length === 0 ? (
            <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-muted">
              还没有填来源。补上来源，下次核对时就不用重新搜了。
            </p>
          ) : (
            <ul className="flex flex-col">
              {draft.source.map((src) => (
                <li key={src.url} className="flex flex-col gap-1 border-b border-line-subtle py-[var(--space-3)] last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)]">
                    <SourceLink url={src.url} showPath />
                    <span className="num text-[length:var(--text-xs)] text-meta">{src.verifiedAt} 核实</span>
                  </div>
                  {src.note !== undefined && (
                    <p className="text-[length:var(--text-xs)] leading-[var(--leading-body)] text-muted">{src.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pt-[var(--space-6)] pb-[var(--space-8)]">
          <h2 className="mb-[var(--space-2)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
            数据可信度
          </h2>
          <div className="flex items-center gap-[var(--space-2)]">
            <ConfidenceTag confidence={draft.confidence} mode="detail" />
            <span className="num text-[length:var(--text-xs)] text-meta">上次核对 {draft.verifiedAt}</span>
          </div>
          {draft.confidence === 'low' && (
            <p className="mt-[var(--space-2)] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
              不确定的具体项：{draft.notes ?? `${String(unknown.length)} 个类别费率来源单一，上限口径待交叉验证`}。
            </p>
          )}
          {draft.notes !== undefined && draft.confidence !== 'low' && (
            <p className="mt-[var(--space-2)] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">{draft.notes}</p>
          )}
        </section>
      </div>

      <DeleteConfirm
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
        }}
        cardName={draft.cardName}
        ledgerCount={booked.length}
        onConfirm={() => void handleDelete()}
      />
    </PageShell>
  );
}
