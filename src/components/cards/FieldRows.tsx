/**
 * 可编辑字段行（card-detail.md §5.2）。
 *
 * 一个组件覆盖三种输入：文本、百分比、下拉。为什么不做三个组件：
 * 它们的行结构（76px 标签 + 右对齐值 + 分隔线）完全一致，拆开会让三个文件
 * 各写一遍同样的骨架，日后改行高要改三处。
 *
 * 校验错误就近显示（在该行下方），不弹 toast —— 用户点「保存」失败时，
 * 视线应该在出错的字段上，而不是屏幕顶部。
 */

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface FieldShellProps {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** 输入框获得焦点时整行高亮，让触屏用户知道改的是哪行 */
  focused?: boolean;
}

function FieldShell({ label, children, hint, error, focused }: FieldShellProps): React.JSX.Element {
  return (
    <div
      className={[
        'flex flex-col gap-[var(--space-1)] border-b border-line-subtle py-[var(--space-2)] last:border-b-0',
        focused ? 'bg-surface-2' : '',
      ].join(' ')}
    >
      <div className="flex min-h-[36px] items-center gap-[var(--space-3)]">
        <label className="w-[76px] shrink-0 text-[length:var(--text-sm)] text-muted">{label}</label>
        <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
      </div>
      {hint !== undefined && <p className="pl-[88px] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-muted">{hint}</p>}
      {error !== undefined && error !== null && (
        <p className="pl-[88px] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-neg">{error}</p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: string | null;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function TextField({ label, value, onChange, placeholder, hint, error, inputRef }: TextFieldProps): React.JSX.Element {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={[
          'num min-h-[var(--size-touch)] w-full min-w-0 rounded-[var(--radius-sm)] border bg-transparent px-[var(--space-2)] text-right',
          'text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg outline-none',
          error ? 'border-neg' : 'border-transparent focus:border-accent',
        ].join(' ')}
      />
    </FieldShell>
  );
}

interface PercentFieldProps {
  label: string;
  /** 以「百分点」为单位的值，如 1.95 表示 1.95% */
  value: number;
  onChange: (next: number) => void;
  hint?: ReactNode;
  error?: string | null;
  inputRef?: React.Ref<HTMLInputElement>;
}

/** 百分比输入。存的是 1.95，用户看到也是 1.95，不做 ×100 换算的来回错 */
export function PercentField({ label, value, onChange, hint, error, inputRef }: PercentFieldProps): React.JSX.Element {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <span className="flex min-w-0 items-center justify-end gap-[var(--space-1)]">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={Number.isFinite(value) ? String(value) : ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, '');
            const firstDot = raw.indexOf('.');
            const cleaned = firstDot === -1 ? raw : raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
            const parsed = Number(cleaned);
            onChange(cleaned === '' || !Number.isFinite(parsed) ? 0 : parsed);
          }}
          className={[
            'num min-h-[var(--size-touch)] w-20 min-w-0 rounded-[var(--radius-sm)] border bg-transparent px-[var(--space-2)] text-right',
            'text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg outline-none',
            error ? 'border-neg' : 'border-transparent focus:border-accent',
          ].join(' ')}
        />
        <span className="text-[length:var(--text-md)] text-fg-2">%</span>
      </span>
    </FieldShell>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  hint?: ReactNode;
}

/** 下拉。用原生 select：iOS 的原生选择器比任何自绘轮子都好用 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>): React.JSX.Element {
  return (
    <FieldShell label={label} hint={hint}>
      <span className="relative flex min-w-0 items-center justify-end">
        <select
          value={value}
          onChange={(e) => {
            onChange(e.target.value as T);
          }}
          className="min-h-[var(--size-touch)] w-full min-w-0 appearance-none rounded-[var(--radius-sm)] bg-transparent py-0 pl-[var(--space-2)] pr-[var(--space-5)] text-right text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg outline-none focus:border-accent"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronRight size={16} strokeWidth={2} className="pointer-events-none absolute right-1 rotate-90 text-meta" aria-hidden="true" />
      </span>
    </FieldShell>
  );
}

interface ReadOnlyRowProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

/** 只读行：无 chevron、值色降为 --fg-2（§5.2 的「只读」规则） */
export function ReadOnlyRow({ label, value, hint }: ReadOnlyRowProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[var(--space-1)] border-b border-line-subtle py-[var(--space-2)] last:border-b-0">
      <div className="flex min-h-[36px] items-center gap-[var(--space-3)]">
        <span className="w-[76px] shrink-0 text-[length:var(--text-sm)] text-muted">{label}</span>
        <span className="num min-w-0 flex-1 text-right text-[length:var(--text-md)] text-fg-2">{value}</span>
      </div>
      {hint !== undefined && <p className="pl-[88px] text-[length:var(--text-xs)] leading-[var(--leading-body)] text-muted">{hint}</p>}
    </div>
  );
}
