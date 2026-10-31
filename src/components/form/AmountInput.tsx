/**
 * 金额输入（main-query.md §4.3）。
 *
 * 三个容易漏的边界，全部实现在这里：
 *
 * 1. **>99,999 降字号**（28px → 20px）。绝不截断、绝不横向滚动 —— 用户输入的
 *    六位数如果滚出视野，他会以为少打了一位。
 * 2. **粘贴 `1,234.56` 自动清洗逗号**。用户从账单里复制金额是最常见的路径。
 * 3. **不 autofocus**。iOS 禁止无手势聚焦，写了也会被忽略；写上去只会让
 *    桌面端在页面打开时弹出键盘。
 *
 * type 用 text 而不是 number：number 输入框在移动端带步进器，
 * 且滚轮误触会静默改金额 —— 这是满屏数字的产品里最不该有的控件。
 */

import { TriangleAlert } from 'lucide-react';
import type { ChangeEvent, ClipboardEvent, RefObject } from 'react';
import { currencySymbol } from '../../lib/format';

interface AmountInputProps {
  value: string;
  currency: string;
  error: string | null;
  onChange: (text: string) => void;
  onBlur: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/** >99,999 时降一级字号。阈值来自 main-query.md §4.3 的边界表 */
const LARGE_AMOUNT = 99999;

export function AmountInput({ value, currency, error, onChange, onBlur, inputRef }: AmountInputProps): React.JSX.Element {
  const numeric = Number(value.replace(/,/g, ''));
  const large = Number.isFinite(numeric) && Math.abs(numeric) > LARGE_AMOUNT;

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    // 手动接管粘贴：浏览器默认会把 "1,234.56" 原样塞进来，
    // 而我们的清洗规则在 onChange 里，中间态会先渲染出带逗号的值再被改掉。
    event.preventDefault();
    const text = event.clipboardData.getData('text');
    onChange(text);
  };

  return (
    <div>
      <label htmlFor="amount-input" className="mb-[var(--space-2)] block text-[length:var(--text-xs)] text-muted">
        这笔消费多少
      </label>
      <div
        className={[
          'flex h-[var(--size-amount-input)] items-center gap-[var(--space-2)] rounded-md border bg-surface-2',
          'px-[var(--space-4)] transition-colors duration-[var(--motion-fast)]',
          'focus-within:outline focus-within:outline-[length:var(--focus-width)] focus-within:outline-offset-[var(--focus-offset)] focus-within:outline-accent-text',
          error ? 'border-neg' : 'border-line focus-within:border-accent-text',
        ].join(' ')}
      >
        <span className="shrink-0 text-[length:var(--text-md)] text-muted" aria-hidden="true">
          {currencySymbol(currency).trim()}
        </span>
        <input
          id="amount-input"
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error !== null}
          aria-describedby={error !== null ? 'amount-error' : undefined}
          value={value}
          placeholder="0.00"
          onChange={handleChange}
          onPaste={handlePaste}
          onBlur={onBlur}
          className={[
            'num min-w-0 flex-1 bg-transparent text-right text-fg caret-accent-text outline-none',
            'placeholder:text-disabled',
            large ? 'text-[length:var(--text-lg)]' : 'text-[length:var(--text-xl)]',
            'font-[var(--fw-announce)] tracking-[var(--tracking-display)]',
          ].join(' ')}
        />
      </div>
      {error !== null && (
        <p
          id="amount-error"
          role="alert"
          className="mt-[var(--space-2)] flex items-center gap-[var(--space-1)] text-[length:var(--text-sm)] text-neg"
        >
          <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
