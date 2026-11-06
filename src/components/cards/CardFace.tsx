/**
 * 卡面。
 *
 * 两档尺寸，不是同一套按比例缩放：
 *   thumb（76×48，列表用）  只保留「颜色 + 银行缩写 + 卡组织」——这个尺寸下
 *                           芯片和卡号只会糊成一团噪点
 *   full（全宽，详情页用）  加芯片，让「这是我的那张卡」成立
 *
 * 所有颜色来自 design-tokens.css 3.5 节，含卡组织官方标志色与芯片色。
 * 组件里没有裸 hex：品牌色是数据，但仍然必须可集中审查。
 */

import { useMemo } from 'react';
import { cardVisual, type CardNetwork } from '../../lib/cardVisual';

interface CardFaceProps {
  card: { issuer: string; cardName: string; network: string };
  size?: 'thumb' | 'full';
  /** 停用卡去色。它不该比在用的卡更抢眼 */
  muted?: boolean;
  /**
   * 这张卡在发卡行内的序号（0 起）。
   *
   * 同一家银行的卡共用品牌色，汇丰 4 张全是同一个红，并排看像同一张卡的
   * 4 个副本。按序号叠 3 档黑做出「同系不同款」的层次 —— 比给每张卡猜一个
   * 个性色诚实，因为它只表达「它们是一家的」。
   */
  indexInIssuer?: number;
}

export function CardFace({ card, size = 'thumb', muted = false, indexInIssuer = 0 }: CardFaceProps): React.JSX.Element {
  const v = useMemo(() => cardVisual(card), [card]);
  const ink = `var(--brand-${v.brand}-ink)`;
  const isFull = size === 'full';
  const shade = Math.min(Math.max(indexInIssuer, 0), 3);

  return (
    <div
      aria-hidden="true"
      className="relative isolate shrink-0 overflow-hidden"
      style={{
        width: isFull ? '100%' : 76,
        aspectRatio: '1.586 / 1',
        borderRadius: isFull ? 'var(--radius-lg)' : 'var(--radius-sm)',
        background: `var(--brand-${v.brand})`,
        filter: muted ? 'saturate(0.15) brightness(0.72)' : undefined,
        boxShadow: 'var(--card-rim)',
      }}
    >
      <div className="absolute inset-0" style={{ background: 'var(--card-sheen)' }} />
      {shade > 0 && (
        <div className="absolute inset-0" style={{ background: `var(--card-shade-${String(shade)})` }} />
      )}

      {isFull && (
        <div
          className="absolute overflow-hidden"
          style={{
            left: '8%',
            top: '34%',
            width: '13%',
            aspectRatio: '1.3 / 1',
            borderRadius: 4,
            background: 'var(--chip-face)',
          }}
        >
          <div className="absolute inset-x-[18%] top-1/2 h-px" style={{ background: 'var(--chip-etch)' }} />
          <div className="absolute bottom-[22%] left-1/2 top-[22%] w-px" style={{ background: 'var(--chip-etch)' }} />
        </div>
      )}

      <div
        className="relative flex h-full w-full flex-col justify-between"
        style={{ padding: isFull ? '7%' : '5px 6px' }}
      >
        <span
          className="font-[var(--fw-emphasize)] leading-none"
          style={{
            color: ink,
            opacity: 0.92,
            fontSize: isFull ? 'var(--text-base)' : 7,
            letterSpacing: isFull ? '0.04em' : '0.02em',
          }}
        >
          {v.mark}
        </span>

        <div className="flex items-end justify-end">
          <NetworkMark network={v.network} ink={ink} height={isFull ? 26 : 11} />
        </div>
      </div>
    </div>
  );
}

/**
 * 卡组织标识。
 *
 * 用形状而不是文字拼写：VISA 和银联的官方标志都有自己的图文语言，用系统字体
 * 拼一串字母是错的（Visa 官方是定制衬线斜体），而形状即使在 11px 高度仍可辨。
 */
function NetworkMark({
  network,
  ink,
  height,
}: {
  network: CardNetwork;
  ink: string;
  height: number;
}): React.JSX.Element {
  const h = height;
  const w = network === 'mastercard' ? h * 1.62 : h * 1.72;

  if (network === 'mastercard') {
    return (
      <svg width={w} height={h} viewBox="0 0 42 26" role="presentation">
        <circle cx="16" cy="13" r="12" style={{ fill: 'var(--net-mastercard-red)' }} opacity="0.95" />
        <circle cx="28" cy="13" r="12" style={{ fill: 'var(--net-mastercard-yellow)' }} opacity="0.95" />
        <path d="M22 3.2a12 12 0 0 1 0 19.6 12 12 0 0 1 0-19.6z" style={{ fill: 'var(--net-mastercard-orange)' }} />
      </svg>
    );
  }

  if (network === 'unionpay') {
    return (
      <svg width={w} height={h} viewBox="0 0 44 26" role="presentation">
        <path d="M6 26 13.5 0h8.2L14.2 26z" style={{ fill: 'var(--net-unionpay-red)' }} opacity="0.96" />
        <path d="M15.5 26 23 0h8.2L23.7 26z" style={{ fill: 'var(--net-unionpay-blue)' }} opacity="0.9" />
        <path d="M25 26 32.5 0h8.2L33.2 26z" style={{ fill: 'var(--net-unionpay-green)' }} opacity="0.92" />
        <path d="M6 26 13.5 0h8.2L14.2 26z" fill="#fff" opacity="0.12" />
      </svg>
    );
  }

  if (network === 'amex') {
    // 两条横杠在 11px 高度读起来是「等号」，不是 Amex。用官方那种蓝底白字。
    return (
      <svg width={w} height={h} viewBox="0 0 44 26" role="presentation">
        <rect width="44" height="26" rx="3" style={{ fill: 'var(--net-amex)' }} />
        <text
          x="22"
          y="18.5"
          textAnchor="middle"
          fill="#fff"
          style={{ font: '900 13px/1 Arial, Helvetica, sans-serif', letterSpacing: '0.04em' }}
        >
          AMEX
        </text>
      </svg>
    );
  }

  if (network === 'visa') {
    return (
      <svg width={w} height={h} viewBox="0 0 44 26" role="presentation">
        <text
          x="22"
          y="19"
          textAnchor="middle"
          style={{ fill: ink, font: 'italic 900 19px/1 Georgia, "Times New Roman", serif', letterSpacing: '-0.02em' }}
          opacity="0.95"
        >
          VISA
        </text>
      </svg>
    );
  }

  return (
    <svg width={w} height={h} viewBox="0 0 44 26" role="presentation">
      <rect
        x="2"
        y="5"
        width="40"
        height="16"
        rx="3"
        fill="none"
        style={{ stroke: ink }}
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
    </svg>
  );
}
