/**
 * Toast。单行、2.5s 自散、最多叠 1 条（MASTER §3.10）。
 *
 * 为什么自己做而不用库：只有「已保存」「已导出」三类消息，
 * 引入 toast 库要 6KB + 一套自己的样式覆盖，不划算。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'default' | 'error';
}

type Listener = (message: ToastMessage) => void;

const listeners = new Set<Listener>();
let seq = 0;

export function showToast(text: string, tone: ToastMessage['tone'] = 'default'): void {
  seq += 1;
  const message: ToastMessage = { id: seq, text, tone };
  for (const listener of listeners) listener(message);
}

export function ToastHost(): React.JSX.Element | null {
  const [message, setMessage] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const listener: Listener = (next) => {
      setMessage(next);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, [message]);

  if (!message) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[var(--z-toast)] flex justify-center px-[var(--space-4)]"
      style={{ bottom: 'calc(var(--size-tabbar) + var(--safe-bottom) + var(--space-4))' }}
    >
      <div
        className={[
          'max-w-full rounded-md border px-[var(--space-4)] py-[var(--space-3)] text-[length:var(--text-base)]',
          message.tone === 'error' ? 'border-neg text-neg' : 'border-line text-fg',
        ].join(' ')}
        style={{ backgroundColor: 'var(--surface-4)' }}
      >
        {message.text}
      </div>
    </div>,
    document.body,
  );
}
