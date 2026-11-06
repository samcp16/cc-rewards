/**
 * 新建卡 —— 银行 → 卡 两级选择（F2）。
 *
 * 为什么不是一列平铺：38 张卡铺开，用户要在里面做视觉搜索。
 * 按银行分组后，动作变成「想起是哪家银行 → 在 1~4 张里认名字」，
 * 这才是人回忆自己手里那张卡的方式。
 *
 * 为什么选完直接回卡库、不跳编辑页：用户要的是「把这张卡加进来」，
 * 不是「开始填表」。数据是带出来的，核对是他的权利，不是义务。
 *
 * 空白卡仍保留在底部：卡库里确实没有的卡，总得有地方进去。
 * 但它不再是主路径 —— 主路径是选。
 */

import { ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { CardPickerList } from '../components/cards/CardPickerList';
import { IssuerPicker } from '../components/cards/IssuerPicker';
import { PageShell } from '../components/layout/PageShell';
import { TopBar } from '../components/layout/TopBar';
import { blankCard, cardFromTemplate, putCard } from '../db/cardsRepository';
import { useCards, useDeletedPresetIds } from '../db/useDb';
import type { Card } from '../domain/types';
import { cardSummary, cardsOfIssuer, issuerGroups } from '../lib/issuerGroups';
import { showToast } from '../components/common/Toast';

export function NewCardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { cards } = useCards();
  const [busy, setBusy] = useState(false);
  const [issuer, setIssuer] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const deletedIds = useDeletedPresetIds();
  const existingIds = useMemo(() => new Set(cards.map((c) => c.cardId)), [cards]);

  /**
   * 默认只列「我还没有、也没删过」的卡。
   *
   * 删过的卡不再出现，是因为用户删它就是在说「我不用这张」——
   * 每次添加新卡都被同一张不用的卡挡在前面，等同于没删掉。
   * 但「不显示」不等于「禁止添加」，所以留了 showAll 这个翻出来的口子。
   */
  const exclude = useMemo(() => {
    if (showAll) return new Set<string>();
    return new Set<string>([...existingIds, ...deletedIds]);
  }, [showAll, existingIds, deletedIds]);

  const groups = useMemo(() => issuerGroups({ exclude }), [exclude]);
  const picks = useMemo(() => (issuer ? cardsOfIssuer(issuer).filter((c) => !exclude.has(c.cardId)) : []), [issuer, exclude]);

  async function createFrom(template: Card): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const row = cardFromTemplate(template, existingIds);
      await putCard(row);
      const summary = cardSummary(template);
      showToast(
        summary.state === 'unknown'
          ? `${template.cardName} 已添加，它的费率还在核实`
          : `${template.cardName} 已添加`,
      );
      void navigate('/cards', { replace: true });
    } catch {
      showToast('建卡失败，本机数据库写入不出去', 'error');
      setBusy(false);
    }
  }

  async function createBlank(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const row = blankCard(`user-${String(Date.now())}`);
      await putCard(row);
      showToast('空白卡已建好');
      void navigate(`/cards/${row.cardId}`, { replace: true });
    } catch {
      showToast('建卡失败，本机数据库写入不出去', 'error');
      setBusy(false);
    }
  }

  return (
    <PageShell
      topbar={
        <TopBar
          title={issuer === null ? '添加卡片' : '选择卡片'}
          onBack={() => {
            if (issuer === null) {
              void navigate('/cards');
            } else {
              setIssuer(null);
            }
          }}
          borderless
        />
      }
    >
      <div className="mx-auto w-full max-w-[var(--container-desktop)] px-[var(--space-4)]">
        {issuer === null ? (
          <>
            <p className="pt-[var(--space-3)] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
              先选银行，再选卡。费率、门槛、手续费都从卡库带出来，你不用填。
            </p>

            {groups.length === 0 && (
              <p className="py-[var(--space-6)] text-[length:var(--text-sm)] text-fg-2">
                卡库里的卡都在你这儿了，没有可添加的。
              </p>
            )}

            <IssuerPicker
              groups={groups}
              onPick={(next) => {
                setIssuer(next);
              }}
            />

            <div className="flex flex-col gap-[var(--space-2)] py-[var(--space-6)]">
              <Button variant="ghost" fullWidth onClick={() => setShowAll((v) => !v)}>
                {showAll ? '只看还没加的卡' : '显示全部（含已删除的）'}
              </Button>
              <Button variant="ghost" fullWidth disabled={busy} onClick={() => void createBlank()}>
                卡库里没有这张，从空白卡开始
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-[var(--space-1)] pt-[var(--space-2)]">
              <button
                type="button"
                onClick={() => {
                  setIssuer(null);
                }}
                className="inline-flex items-center gap-[var(--space-1)] text-[length:var(--text-sm)] text-fg-2"
              >
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                换一家银行
              </button>
            </div>
            <p className="pb-[var(--space-3)] pt-[var(--space-2)] text-[length:var(--text-xs)] text-muted">
              {issuer} · {picks.length} 张卡
            </p>

            <CardPickerList
              cards={picks}
              existingIds={existingIds}
              busy={busy}
              onPick={(card) => void createFrom(card)}
            />

            <p className="py-[var(--space-5)] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-meta">
              「核实中」表示该卡的部分费率官方尚未公布，加进来暂时不参与排序。我们会持续补，不需要你填。
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
