/**
 * 主查询页 —— 打开即用，输入即算（SPEC F3 / AC-F3-01~04）。
 *
 * 这一屏唯一要完成的事：让用户改一个数字，然后在拇指上方看到一个会跟着变的答案。
 * 没有「查询」按钮，没有结果页路由（AC-F3-02）。
 *
 * 布局是 flex column 三段式：顶栏 / 可滚动输入区 / 粘底答案卡 / TabBar。
 * 答案卡用 sticky 而不是 fixed —— fixed 会脱离文档流，输入区底部内容永远滚不出来
 * （main-query.md §2 的明确要求）。
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AmountInput } from '../components/form/AmountInput';
import { CategoryGrid } from '../components/form/CategoryGrid';
import { ChannelPills } from '../components/form/ChannelPills';
import { QuickAmount } from '../components/form/QuickAmount';
import { RegionSegment } from '../components/form/RegionSegment';
import { PageShell } from '../components/layout/PageShell';
import { TabBar } from '../components/layout/TabBar';
import { TopBar } from '../components/layout/TopBar';
import { AnswerCard } from '../components/answer/AnswerCard';
import type { AnswerState } from '../components/answer/AnswerCard';
import { ComparePanel } from '../components/compare/ComparePanel';
import { InstallGuide } from '../components/install/InstallGuide';
import { useSpendInput } from '../hooks/useSpendInput';
import { useQuote } from '../hooks/useQuote';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function DecidePage(): React.JSX.Element {
  const navigate = useNavigate();
  const spend = useSpendInput();
  const quote = useQuote(spend.input);
  const [compareOpen, setCompareOpen] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const install = useInstallPrompt();

  // 金额为 0 时不计算，回到空态引导；0 与负数额外显示错误行（AC-F1-05）
  const state: AnswerState =
    spend.input.amount <= 0
      ? { kind: 'empty', amountMissing: spend.amountText.trim() !== '' }
      : quote.kind === 'loading'
        ? { kind: 'loading' }
        : { kind: 'ready', result: quote.result };

  // 关闭安装引导后把焦点还给金额输入（onboarding-install.md §7 的可访问性要求）
  useEffect(() => {
    if (install.justDismissed) amountRef.current?.focus();
  }, [install.justDismissed]);

  return (
    <>
      <PageShell
        topbar={<TopBar title="刷哪张" withLogo borderless />}
        tabbar={<TabBar />}
        sticky={
          <AnswerCard
            state={quote.kind === 'ready' ? state : { kind: 'loading' }}
            onOpenCompare={() => {
              setCompareOpen(true);
            }}
            onGoLimits={() => {
              void navigate('/cards/limits');
            }}
            onGoImport={() => {
              void navigate('/settings');
            }}
          />
        }
      >
        {/* 内容集中在上半部，剩余空间留给答案卡上方的呼吸区。
            之前试过 justify-between 把四组控件摊平 —— 结果是三块孤岛，
            控件之间的空隙比控件本身还大，比留白更难看 */}
        <div className="mx-auto flex w-full max-w-[var(--container-desktop)] flex-col gap-[var(--space-6)] px-[var(--space-4)] pt-[var(--space-4)] pb-[var(--space-4)]">
          <RegionSegment value={spend.region} onChange={spend.setRegion} />
          <CategoryGrid value={spend.category} onChange={spend.setCategory} />
          <div className="flex flex-col gap-[var(--space-3)]">
            <AmountInput
              value={spend.amountText}
              currency={spend.settlementCurrency}
              error={spend.amountError}
              onChange={spend.setAmountText}
              onBlur={spend.blurAmount}
              inputRef={amountRef}
            />
            <QuickAmount
              current={spend.amount}
              onPick={(value) => {
                spend.setAmountText(String(value));
              }}
            />
          </div>
          <ChannelPills value={spend.channel} onChange={spend.setChannel} />
        </div>
      </PageShell>

      {quote.kind === 'ready' && (
        <ComparePanel
          open={compareOpen}
          onClose={() => {
            setCompareOpen(false);
          }}
          result={quote.result}
          region={spend.region}
        />
      )}

      <InstallGuide
        open={install.open}
        isSafari={install.isSafari}
        platform={install.platform}
        onClose={install.dismiss}
        onBackupRoute={() => {
          install.chooseBackupRoute();
          void navigate('/settings');
        }}
      />
    </>
  );
}
