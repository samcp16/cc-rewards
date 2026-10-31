/**
 * 汇率参考表调整（SPEC §6.5 / settings.md）。
 *
 * 只在**折算**里用，不参与成本计算 —— 这一点必须在文案里说清楚，
 * 否则用户会以为改这里能影响「外币手续费多少钱」。
 *
 * 六条折算率全部可改，但不能删也不能加币种：删一条会让上限归集
 * 静默按 1:1 算（useCapUsage 里已显式提示，但更好的做法是根本不给出删除入口）。
 */

import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../common/Button';
import { BottomSheet } from '../common/BottomSheet';
import { resetFxTable, saveFxRate } from '../../db/settingsRepository';
import type { FxTable } from '../../domain/types.params';
import { showToast } from '../common/Toast';

interface FxSheetProps {
  open: boolean;
  onClose: () => void;
  table: FxTable;
  onSaved: () => void;
}

export function FxSheet({ open, onClose, table, onSaved }: FxSheetProps): React.JSX.Element {
  const [rates, setRates] = useState(table.rates);
  const [saving, setSaving] = useState(false);

  // 每次打开时同步一次外部表（用户可能在别处重置过）
  useEffect(() => {
    if (open) setRates(table.rates);
  }, [open, table]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      for (const rate of rates) {
        await saveFxRate(rate.from, rate.to, rate.rate);
      }
      showToast('汇率已保存，上限归集会按新汇率重算');
      onSaved();
      onClose();
    } catch {
      showToast('汇率存不上，本机数据库写入失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(): Promise<void> {
    await resetFxTable();
    setRates([]);
    showToast('已恢复默认汇率');
    onSaved();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="汇率参考"
      footer={
        <div className="flex gap-[var(--space-2)]">
          <Button variant="secondary" onClick={() => void handleReset()}>
            恢复默认
          </Button>
          <Button fullWidth disabled={saving} onClick={() => void handleSave()}>
            {saving ? '保存中…' : '保存汇率'}
          </Button>
        </div>
      }
    >
      <p className="pb-[var(--space-3)] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
        只用于把外币上限折算成同一币种来归集已用额度。它不影响外币手续费的金额 —— 那部分按卡上的费率算。
      </p>
      <div className="flex flex-col">
        {rates.map((rate, index) => (
          <div
            key={`${rate.from}-${rate.to}`}
            className="flex items-center gap-[var(--space-3)] border-b border-line-subtle py-[var(--space-2)] last:border-b-0"
          >
            <span className="num w-[104px] shrink-0 text-[length:var(--text-sm)] text-muted">
              {rate.from} → {rate.to}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={String(rate.rate)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9.]/g, '');
                const parsed = Number(raw);
                setRates((prev) =>
                  prev.map((r, i) => (i === index ? { ...r, rate: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 } : r)),
                );
              }}
              className="num min-h-[var(--size-touch)] min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-surface-2 px-[var(--space-3)] text-right text-[length:var(--text-md)] text-fg outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>
      <p className="flex items-center gap-[var(--space-1)] pt-[var(--space-3)] text-[length:var(--text-xs)] text-meta">
        <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
        默认 HKD 1 = MOP 1.03。改了这里，额度页的折算数字会立刻跟着变。
      </p>
    </BottomSheet>
  );
}
