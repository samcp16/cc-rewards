/**
 * 新建卡 —— 模板选择器（F2）。
 *
 * 两条路并列给：从 12 张预置卡里挑（规则已带出，用户只需核对），
 * 或者从空白卡开始（卡库里没有的卡）。
 *
 * 为什么模板不是「复制预置卡」而是带出全部规则再让用户改：
 * 预置数据是我们查到的，用户手里有一张同款卡 —— 他要的是「预填好、我能改」，
 * 不是「只能看不能改」。所以 cardFromTemplate 之后立刻进详情页编辑。
 *
 * 创建后 id 加后缀：用户可能想同时保留预置卡和自己那份（额度分开记）。
 */

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { PageShell } from '../components/layout/PageShell';
import { TopBar } from '../components/layout/TopBar';
import { blankCard, cardFromTemplate, presetTemplates, putCard } from '../db/cardsRepository';
import { useCards } from '../db/useDb';
import type { Card } from '../domain/types';
import { maxCategoryRate, unknownCategories } from '../lib/cardFacts';
import { percent2 } from '../lib/format';
import { ISSUER_REGION_LABEL, NETWORK_SHORT } from '../lib/labels';
import { showToast } from '../components/common/Toast';

export function NewCardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { cards } = useCards();
  const [busy, setBusy] = useState(false);
  const templates = presetTemplates();
  const existingIds = new Set(cards.map((c) => c.cardId));

  async function createFrom(template: Card | null): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const row =
        template === null
          ? blankCard(`user-${String(Date.now())}`)
          : cardFromTemplate(template, existingIds);
      await putCard(row);
      showToast(template === null ? '空白卡已建好，去填费率' : '已按模板建卡，去核对一下');
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
          title="添加卡片"
          onBack={() => {
            void navigate('/cards');
          }}
          borderless
        />
      }
    >
      <div className="mx-auto w-full max-w-[var(--container-desktop)] px-[var(--space-4)]">
        <p className="pt-[var(--space-3)] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
          挑一张预置卡，规则会全部带出来，你只需要核对数字对不对。卡库里的卡从来不是「唯一正确答案」——
          你自己那份随时能改。
        </p>

        <h2 className="pb-[var(--space-2)] pt-[var(--space-6)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
          预置卡 · {templates.length} 张
        </h2>

        <ul className="border-t border-line-subtle">
          {templates.map((template) => (
            <li key={template.cardId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void createFrom(template);
                }}
                className="flex w-full items-center gap-[var(--space-3)] border-b border-line-subtle py-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
                    {template.cardName}
                  </span>
                  <span className="truncate text-[length:var(--text-xs)] text-muted">
                    {template.issuer} · {ISSUER_REGION_LABEL[template.issuerRegion]} ·{' '}
                    {NETWORK_SHORT[template.network]}
                  </span>
                </span>
                <span className="num shrink-0 text-[length:var(--text-sm)] text-fg-2">
                  {maxCategoryRate(template) === null ? '费率待补' : `最高 ${percent2(maxCategoryRate(template) ?? 0)}`}
                </span>
                <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-meta" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-[var(--space-2)] py-[var(--space-6)]">
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={() => {
              void createFrom(null);
            }}
          >
            卡库里没有这张，从空白卡开始
          </Button>
          <p className="text-[length:var(--text-xs)] leading-[var(--leading-body)] text-meta">
            空白卡的返现费率是空的，需要你填。填好之前它不会参与「刷哪张」的排序，
            因为拿 0 当费率算出来的结论比不显示更糟。
          </p>
        </div>

        <p className="pb-[var(--space-8)] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-meta">
          预置卡中另有 {templates.filter((t) => unknownCategories(t).length > 0).length} 张的部分类别官方尚未公布，
          暂不参与对应排序；我们会持续核实补充，无需你手动填写。
        </p>
      </div>
    </PageShell>
  );
}
