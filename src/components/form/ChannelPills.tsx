/**
 * 支付渠道 pill 组（main-query.md §4.4）。
 *
 * 三个规格要点：
 *
 * 1. **视觉 36px，命中区 44px** —— 用 `::after` 上下各扩 4px 撑满，
 *    不改视觉高度（36px 的 pill 在一行里才不至于变成一块大砖）。
 * 2. **只用 Lucide 通用图标 + 文字标签，不用品牌 logo**（SPEC §8）。
 *    商标风险 + 四套风格难统一 + 体积，而文字标签在小屏上比 logo 更好认。
 * 3. **右缘渐隐 24px** 暗示可横向滚动。375px 下 5 个 pill 溢出约 40px。
 */

import { CreditCard, MessageCircle, ScanLine, Smartphone, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PaymentChannel } from '../../domain/types';
import { CHANNEL_OPTIONS } from '../../lib/labels';

const ICON: Record<PaymentChannel, ReactNode> = {
  physical: <CreditCard size={16} strokeWidth={2} aria-hidden="true" />,
  alipay: <Smartphone size={16} strokeWidth={2} aria-hidden="true" />,
  wechat: <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />,
  unionpay_qr: <ScanLine size={16} strokeWidth={2} aria-hidden="true" />,
  apple_pay: <Wallet size={16} strokeWidth={2} aria-hidden="true" />,
};

interface ChannelPillsProps {
  value: PaymentChannel;
  onChange: (next: PaymentChannel) => void;
}

export function ChannelPills({ value, onChange }: ChannelPillsProps): React.JSX.Element {
  return (
    <div>
      {/* 这里原本右侧挂一句「上次用的记在这里」。它想解释「为什么一进来就选中了刷卡」，
          可那个解释对一个已经选中的 chip 是多余的；而且它没有任何视觉对应物 ——
          用户读完会去找哪个是「上次的」，结果找不到。删掉。 */}
      <div className="mb-[var(--space-2)]">
        <span id="channel-label" className="text-[length:var(--text-xs)] text-muted">
          走哪个渠道
        </span>
      </div>
      <div className="relative">
        <div
          role="radiogroup"
          aria-labelledby="channel-label"
          className="flex gap-[var(--space-2)] overflow-x-auto py-[var(--space-1)]"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {CHANNEL_OPTIONS.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  onChange(option.value);
                }}
                style={{ scrollSnapAlign: 'start' }}
                className={[
                  'relative flex h-[var(--size-pill)] shrink-0 items-center gap-[var(--space-1)]',
                  'rounded-[var(--radius-pill)] border px-[var(--space-3)]',
                  'text-[length:var(--text-sm)] whitespace-nowrap',
                  'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
                  // 命中区撑到 44px：视觉不动，热区上下各扩 4px
                  'after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""]',
                  active
                    ? 'border-accent bg-surface-3 font-[var(--fw-emphasize)] text-accent-text'
                    : 'border-line bg-transparent text-fg-2 hover:bg-surface-2',
                ].join(' ')}
              >
                <span className={active ? 'text-accent-text' : 'text-muted'}>{ICON[option.value]}</span>
                {option.label}
              </button>
            );
          })}
        </div>
        {/* 右缘渐隐：只做视觉暗示，不吃点击 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6"
          style={{ background: 'linear-gradient(to right, transparent, var(--surface-0))' }}
        />
      </div>
    </div>
  );
}
