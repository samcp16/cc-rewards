/**
 * 「记一笔」面板（F5）。
 *
 * 存在的理由：上限池只会在「用户记了账」之后才有已用额。没有这个入口，
 * 额度功能就只是摆设 —— 而额度恰恰是决定「下一笔刷哪张」的关键输入。
 *
 * 写入流程必须走 rankSingleCard 而不是让用户自己填返现额：
 * 账本里存的 earnedCashback / capConsumption 是快照，随手填的数字会污染未来的
 * 「额度已用」判断。这里复用引擎，保证「记一笔」与「算一笔」用同一套算法。
 */

import { useMemo, useState } from 'react';
import type { CardRow } from '../../db/schema';
import { rankSingleCard } from '../../domain/engine';
import type { EngineParams, LedgerEntry, PaymentChannel, SpendCategory } from '../../domain/types';
import { recordSpend } from '../../db/ledgerRepository';
import { CATEGORY_OPTIONS, CHANNEL_OPTIONS, categoryLabel, channelLabel } from '../../lib/labels';
import { parseAmount, sanitizeAmount } from '../../hooks/useSpendInput';
import { formatMoney } from '../../lib/format';
import { showToast } from '../common/Toast';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';

interface RecordSpendSheetProps {
  open: boolean;
  onClose: () => void;
  card: CardRow;
  params: EngineParams;
  ledger: LedgerEntry[];
  /** 默认地区跟随卡的发卡地：澳门卡最常见在澳门刷 */
  defaultCurrency: CardRow['cardCurrency'];
}

export function RecordSpendSheet({
  open,
  onClose,
  card,
  params,
  ledger,
  defaultCurrency,
}: RecordSpendSheetProps): React.JSX.Element {
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<SpendCategory>('dining');
  const [channel, setChannel] = useState<PaymentChannel>('physical');
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);

  // 实时回显「这一笔会记多少返现」，让用户在保存前就看到后果
  const preview = useMemo(() => {
    if (amount <= 0) return null;
    return rankSingleCard(card, ledger, params, {
      amount,
      settlementCurrency: defaultCurrency,
      category,
      channel,
      // 记账场景按卡的常用场景取值：澳门卡在澳门刷、港卡在澳门刷（用户就在澳门）
      region: 'MO',
    });
  }, [amount, card, ledger, params, category, channel, defaultCurrency]);

  const invalid = amount <= 0;

  async function handleSave(): Promise<void> {
    if (invalid || saving) return;
    if (!preview) return;
    setSaving(true);
    try {
      await recordSpend({
        card,
        amount,
        currency: defaultCurrency,
        category,
        channel,
        scheme: preview,
      });
      showToast('已记一笔，额度已更新');
      setAmountText('');
      onClose();
    } catch {
      showToast('记不上，本机数据库写入失败，稍后再试', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="记一笔"
      subtitle={card.cardName}
      footer={
        <Button
          fullWidth
          disabled={invalid || saving}
          onClick={() => {
            void handleSave();
          }}
        >
          {saving ? '正在记…' : invalid ? '先填个金额' : '记下这一笔'}
        </Button>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <label className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[length:var(--text-sm)] text-muted">金额（{defaultCurrency}）</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => {
              setAmountText(sanitizeAmount(e.target.value));
            }}
            placeholder="0.00"
            className="num h-[var(--size-touch)] w-full rounded-md border border-line bg-surface-2 px-[var(--space-3)] text-[length:var(--text-lg)] text-fg outline-none focus:border-accent"
          />
        </label>

        <fieldset className="flex flex-col gap-[var(--space-2)]">
          <legend className="mb-[var(--space-1)] text-[length:var(--text-sm)] text-muted">类别</legend>
          <div className="flex flex-wrap gap-[var(--space-2)]">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={category === opt.value}
                onClick={() => {
                  setCategory(opt.value);
                }}
                className={[
                  'min-h-[var(--size-touch)] rounded-[var(--radius-pill)] border px-[var(--space-3)] text-[length:var(--text-sm)] transition-colors duration-[var(--motion-fast)]',
                  category === opt.value
                    ? 'border-accent bg-surface-2 font-[var(--fw-emphasize)] text-accent-text'
                    : 'border-line text-fg-2',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-[var(--space-2)]">
          <legend className="mb-[var(--space-1)] text-[length:var(--text-sm)] text-muted">渠道</legend>
          <div className="flex flex-wrap gap-[var(--space-2)]">
            {CHANNEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={channel === opt.value}
                onClick={() => {
                  setChannel(opt.value);
                }}
                className={[
                  'min-h-[var(--size-touch)] rounded-[var(--radius-pill)] border px-[var(--space-3)] text-[length:var(--text-sm)] transition-colors duration-[var(--motion-fast)]',
                  channel === opt.value
                    ? 'border-accent bg-surface-2 font-[var(--fw-emphasize)] text-accent-text'
                    : 'border-line text-fg-2',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="num rounded-md bg-surface-2 px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-muted">
          {preview && !invalid
            ? `这一笔按 ${categoryLabel(category)} · ${channelLabel(channel)} 计，预计返现 ${formatMoney(preview.grossCashback)} ${defaultCurrency}。记账后额度与答案会一起更新。`
            : '填了金额之后，这里会显示这一笔预计拿多少返现。'}
        </p>
      </div>
    </BottomSheet>
  );
}
