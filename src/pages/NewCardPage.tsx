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
import { hideIssuer, unhideAllIssuers } from '../db/hiddenIssuersRepository';
import { useCards, useDeletedPresetIds, useHiddenIssuers } from '../db/useDb';
import type { Card } from '../domain/types';
import { cardSummary, cardsOfIssuer, issuerGroups } from '../lib/issuerGroups';
import type { IssuerGroup } from '../lib/issuerGroups';
import { showToast } from '../components/common/Toast';

export function NewCardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { cards } = useCards();
  const [busy, setBusy] = useState(false);
  const [issuer, setIssuer] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);

  const deletedIds = useDeletedPresetIds();
  const hidden = useHiddenIssuers();
  const existingIds = useMemo(() => new Set(cards.map((c) => c.cardId)), [cards]);

  /**
   * 「显示全部」是彻底的：既不排除我已有的/删过的卡，也不排除我藏起来的银行。
   * 否则用户点开「全部」却还是看不到那几家，会以为自己的操作没生效。
   */
  const exclude = useMemo(() => {
    if (showAll) return new Set<string>();
    return new Set<string>([...existingIds, ...deletedIds]);
  }, [showAll, existingIds, deletedIds]);

  const hiddenForList = useMemo(() => (showAll ? new Set<string>() : hidden), [showAll, hidden]);

  const groups = useMemo(
    () => issuerGroups({ exclude, hidden: hiddenForList }),
    [exclude, hiddenForList],
  );
  const picks = useMemo(() => (issuer ? cardsOfIssuer(issuer).filter((c) => !exclude.has(c.cardId)) : []), [issuer, exclude]);

  const hiddenCount = hidden.size;

  async function hide(group: IssuerGroup): Promise<void> {
    try {
      await hideIssuer(group.region, group.issuer);
      // 不弹「已隐藏」toast：行消失 + 页面上方的「已隐藏 N 家 · 恢复」
      // 已经是更持久的反馈，再来一条会挡住列表下方那行（实测会遮挡）。
    } catch {
      showToast('隐藏失败，本机数据库写入不出去', 'error');
    }
  }

  async function restoreAll(): Promise<void> {
    try {
      await unhideAllIssuers();
      showToast('已恢复隐藏的银行');
    } catch {
      showToast('恢复失败，本机数据库写入不出去', 'error');
    }
  }

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
          actions={
            issuer === null && !showAll ? (
              <button
                type="button"
                onClick={() => {
                  setEditing((v) => !v);
                }}
                className="flex h-11 items-center px-[var(--space-3)] text-[length:var(--text-sm)] font-[var(--fw-emphasize)] text-accent-text"
              >
                {editing ? '完成' : '编辑'}
              </button>
            ) : undefined
          }
          borderless
        />
      }
    >
      <div className="mx-auto w-full max-w-[var(--container-desktop)] px-[var(--space-4)]">
        {issuer === null ? (
          <>
            <p className="pt-[var(--space-3)] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
              {editing
                ? '点右边的减号，藏起你没有的银行。藏错了随时能恢复。'
                : '先选银行，再选卡。费率、门槛、手续费都从卡库带出来，你不用填。'}
            </p>

            {groups.length === 0 && (
              <p className="py-[var(--space-6)] text-[length:var(--text-sm)] text-fg-2">
                {hiddenCount > 0
                  ? `能选的银行都藏起来了（${String(hiddenCount)} 家）。上面可以恢复。`
                  : '卡库里的卡都在你这儿了，没有可添加的。'}
              </p>
            )}

            {hiddenCount > 0 && !showAll && (
              <div className="mt-[var(--space-3)] flex items-center justify-between gap-[var(--space-3)] rounded-md border border-line-subtle px-[var(--space-3)] py-[var(--space-2)]">
                <span className="text-[length:var(--text-sm)] text-fg-2">
                  已隐藏 <span className="num">{hiddenCount}</span> 家银行
                </span>
                <Button variant="ghost" size="compact" onClick={() => void restoreAll()}>
                  恢复
                </Button>
              </div>
            )}

            <IssuerPicker
              groups={groups}
              editing={editing}
              onHide={(group) => void hide(group)}
              onPick={(next) => {
                setIssuer(next);
              }}
            />

            <div className="flex flex-col gap-[var(--space-2)] py-[var(--space-6)]">
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setShowAll((v) => !v);
                  setEditing(false);
                }}
              >
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
