/**
 * 卡面。
 *
 * 两种渲染路径，同一个几何规格（1.586:1 + 统一圆角 + 统一描边）：
 *
 *   1. 有官方素材（data/card-art.json 里登记过的 11 张）→ 直接显示官网卡图。
 *      这是用户唯一能「一眼认出是自己的那张卡」的方式，任何手绘都替代不了。
 *   2. 没有素材（27 张）→ 绘制卡面：品牌色 + 单层斜光 + 芯片 + 卡组织标识。
 *      不假装是真卡，但保证几何与光感一致，混排时不违和。
 *
 * 为什么不做成「有图用图、没图就空白」：空白的卡位比假卡面更伤 ——
 * 列表里出现一块空槽，用户会以为数据丢了。
 *
 * 所有颜色来自 design-tokens.css 与 design/card-brand.css，组件内无裸 hex。
 */

import { useMemo } from 'react';
import { cardArt } from '../../lib/cardArt';
import { cardVisual, type CardNetwork } from '../../lib/cardVisual';

interface CardFaceProps {
  card: { cardId?: string; issuer: string; cardName: string; network: string };
  size?: 'thumb' | 'full';
  /** 停用卡去色。它不该比在用的卡更抢眼 */
  muted?: boolean;
  /**
   * 这张卡在发卡行内的序号（0 起）。
   *
   * 同一家银行的卡共用品牌色，汇丰 4 张全是同一个红，并排看像同一张卡的
   * 4 个副本。按序号叠 3 档黑做出「同系不同款」的层次 —— 比给每张卡猜一个
   * 个性色诚实，因为它只表达「它们是一家的」。
   *
   * 有官方素材的卡不需要这个：真图本身就各不相同。
   */
  indexInIssuer?: number;
}

/** 列表缩略卡面宽度。高度 = 宽 / 1.586 */
const THUMB_WIDTH = 89;

export function CardFace({ card, size = 'thumb', muted = false, indexInIssuer = 0 }: CardFaceProps): React.JSX.Element {
  const v = useMemo(() => cardVisual(card), [card]);
  const art = useMemo(() => (card.cardId === undefined ? undefined : cardArt(card.cardId)), [card.cardId]);
  const isFull = size === 'full';

  const shell = {
    width: isFull ? '100%' : THUMB_WIDTH,
    aspectRatio: '1.586 / 1',
    borderRadius: isFull ? 'var(--radius-lg)' : '6px',
    boxShadow: 'var(--card-rim)',
    filter: muted ? 'saturate(0.12) brightness(0.74)' : undefined,
  } as const;

  if (art) {
    return (
      <div
        aria-hidden="true"
        className="relative isolate shrink-0 overflow-hidden"
        /* 底色用这张卡的品牌色，而不是留白。
           踩过的坑：慢网下（地铁里、跨境漫游）图要几秒才到，这段时间卡位是一块
           纯白 —— 深色主题下更像「数据丢了」。铺品牌色之后，加载中看到的是
           「一张红色的汇丰卡正在变清晰」，而不是一个空洞。 */
        style={{ ...shell, background: `var(--brand-${v.brand})` }}
      >
        {/* 图片上不加任何 filter。
            踩过的坑：给缩略图加 contrast/saturate 补偿缩放损失，会让带 alpha 的 WebP
            在部分 Chromium 上栅格化失败，整块渲染成白色 —— 而且时有时无，
            比「稍微糊一点」糟得多。缩放损失交给浏览器的缩略图算法就好。 */}
        <img
          src={art.src}
          alt=""
          className="relative h-full w-full object-cover"
          loading="eager"
          decoding="async"
          draggable={false}
        />
        {/* 一层极淡高光，让照片也有塑料反光，与绘制卡面同一种材质感 */}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--card-gloss)' }} />
      </div>
    );
  }

  const ink = `var(--brand-${v.brand}-ink)`;
  const shade = Math.min(Math.max(indexInIssuer, 0), 3);

  return (
    <div
      aria-hidden="true"
      className="relative isolate shrink-0 overflow-hidden"
      style={{ ...shell, background: `var(--brand-${v.brand})` }}
    >
      {/* 左上柔光 + 对角明暗：单层主渐变，不叠多色 —— 多色渐变是 AI 模板味的第一个指纹 */}
      <div className="absolute inset-0" style={{ background: 'var(--card-bloom)' }} />
      <div className="absolute inset-0" style={{ background: 'var(--card-sheen)' }} />
      {/* 窄斜光带：卡面塑料膜反的那一道，是这个尺寸下「像卡」的关键 */}
      <div className="absolute inset-0" style={{ background: 'var(--card-streak)' }} />
      {shade > 0 && (
        <div className="absolute inset-0" style={{ background: `var(--card-shade-${String(shade)})` }} />
      )}

      {isFull && (
        <div
          className="absolute overflow-hidden"
          style={{
            left: '7.5%',
            top: '37%',
            width: '12.5%',
            aspectRatio: '1.28 / 1',
            borderRadius: 4,
            background: 'var(--chip-face)',
          }}
        >
          <div className="absolute inset-x-[16%] top-1/2 h-px" style={{ background: 'var(--chip-etch)' }} />
          <div className="absolute bottom-[20%] left-1/2 top-[20%] w-px" style={{ background: 'var(--chip-etch)' }} />
          <div className="absolute inset-x-[16%] top-[28%] h-px" style={{ background: 'var(--chip-etch)' }} />
          <div className="absolute inset-x-[16%] bottom-[28%] h-px" style={{ background: 'var(--chip-etch)' }} />
        </div>
      )}

      <div
        className="relative flex h-full w-full flex-col justify-between"
        style={{ padding: isFull ? '6.5%' : '5px 6px' }}
      >
        <span
          className="font-[var(--fw-emphasize)] leading-none"
          style={{
            color: ink,
            opacity: 0.94,
            fontSize: isFull ? 'var(--text-sm)' : 8.5,
            letterSpacing: isFull ? '0.05em' : '0.04em',
          }}
        >
          {v.mark}
        </span>

        <div className="flex items-end justify-end">
          <NetworkMark network={v.network} ink={ink} height={isFull ? 24 : 10} />
        </div>
      </div>
    </div>
  );
}

/**
 * 卡组织标识。
 *
 * 用形状而不是文字拼写：VISA 和银联的官方标志都有自己的图文语言，用系统字体
 * 拼一串字母是错的（Visa 官方是定制衬线斜体），而形状即使在 10px 高度仍可辨。
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
    // 两条横杠在 10px 高度读起来是「等号」，不是 Amex。用官方那种蓝底白字。
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
