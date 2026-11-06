/**
 * 卡面组件的渲染契约。
 *
 * 重点不是「长得像不像信用卡」，是四件会静默出错的实现细节：
 *   1. 颜色必须是 `var(--brand-*)`，不能是裸 hex —— 裸 hex 会让品牌色分散到
 *      组件里，改一处等于检查 n 处（P0 门禁也是这么定的）
 *   2. 卡组织必须真的画出来，不能因为认不出就什么都不留
 *   3. muted 要能去色（停用卡不该比在用的卡抢眼）
 *   4. 同银行多卡的明度台阶要生效，且**不能超过 3 档**——
 *      第 4 档之后会暗到看不出是张卡
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardFace } from './CardFace';

const HSBC = { issuer: '香港上海汇丰银行（HSBC HK）', cardName: '汇丰 Red 信用卡', network: 'visa' };
const PULSE = { issuer: '香港上海汇丰银行（HSBC HK）', cardName: '汇丰 PULSE 银联双币钻石信用卡', network: 'unionpay' };
const AMEX = { issuer: '美国运通香港（American Express HK）', cardName: 'Amex Explorer 信用卡', network: 'amex' };

function render(props: Partial<React.ComponentProps<typeof CardFace>> = {}): string {
  return renderToStaticMarkup(<CardFace card={HSBC} {...props} />);
}

describe('CardFace：颜色只走 token', () => {
  it('底色用 var(--brand-*)，没有裸 hex', () => {
    const html = render();
    expect(html).toContain('var(--brand-hsbc)');
    // 除 #fff / #000 外不该出现 hex
    const hexes = html.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    expect(hexes.filter((h) => !['#fff', '#000'].includes(h.toLowerCase()))).toEqual([]);
  });

  it('文字色跟着品牌走（Mox 亮青底必须用黑字）', () => {
    expect(render()).toContain('var(--brand-hsbc-ink)');
    const mox = renderToStaticMarkup(
      <CardFace card={{ issuer: 'Mox Bank', cardName: 'Mox 信用卡', network: 'visa' }} />,
    );
    expect(mox).toContain('var(--brand-mox-ink)');
  });

  it('不同银行渲染出不同底色 —— 否则卡面没有任何辨识作用', () => {
    const hsbc = render();
    const amex = renderToStaticMarkup(<CardFace card={AMEX} />);
    expect(hsbc).toContain('var(--brand-hsbc)');
    expect(amex).toContain('var(--brand-amex)');
  });
});

describe('CardFace：卡组织标识', () => {
  it('Visa / 银联 / Amex 都画出了各自的图形', () => {
    expect(render()).toContain('<svg');
    expect(renderToStaticMarkup(<CardFace card={PULSE} />)).toContain('var(--net-unionpay-red)');
    expect(renderToStaticMarkup(<CardFace card={AMEX} />)).toContain('var(--net-amex)');
  });

  it('Mastercard 用两个交叠圆，不是一段文字', () => {
    const mc = renderToStaticMarkup(
      <CardFace card={{ issuer: '澳门商业银行（BCM）', cardName: 'BCM World Mastercard', network: 'mastercard' }} />,
    );
    expect(mc).toContain('var(--net-mastercard-red)');
    expect(mc).toContain('var(--net-mastercard-yellow)');
  });

  it('认不出的卡组织也留一个框，不留空白', () => {
    const html = renderToStaticMarkup(
      <CardFace card={{ issuer: 'x', cardName: 'y', network: 'jcb' }} />,
    );
    expect(html).toContain('<rect');
  });
});

describe('CardFace：尺寸档位', () => {
  it('thumb 是 89 宽，full 是 100%', () => {
    expect(render()).toContain('width:89px');
    expect(render({ size: 'full' })).toContain('width:100%');
  });

  it('芯片只在 full 出现 —— 48px 高的缩略图上它只是一团噪点', () => {
    expect(render()).not.toContain('var(--chip-face)');
    expect(render({ size: 'full' })).toContain('var(--chip-face)');
  });

  it('两档都保持信用卡的 1.586:1 比例', () => {
    expect(render()).toContain('1.586 / 1');
    expect(render({ size: 'full' })).toContain('1.586 / 1');
  });
});

describe('CardFace：官方素材', () => {
  it('登记过的卡渲染成 img，而不是继续画假卡面', () => {
    const html = render({ card: { ...HSBC, cardId: 'hsbc-red' } });
    expect(html).toContain('<img');
    expect(html).toContain('.webp');
    // 图没到之前露出来的是这张图自己的采样色，不是一块白
    expect(html).toMatch(/background:#[0-9a-f]{6}/i);
    // 但底子上不能有芯片和卡组织标识 —— 那是「画出来的卡」的零件，
    // 叠在真图下面就成了一个加载中看起来像假卡的缝合怪
    expect(html).not.toContain('var(--chip-face)');
    expect(html).not.toContain('<svg');
  });

  it('没登记素材的卡仍然画卡面 —— 空槽比假卡面更糟', () => {
    const html = render({ card: { ...HSBC, cardId: 'mox-credit' } });
    expect(html).not.toContain('<img');
    expect(html).toContain('var(--brand-hsbc)');
  });

  it('没有 cardId 时走绘制路径，不抛错', () => {
    expect(render()).not.toContain('<img');
  });

  it('有素材的卡不叠同银行暗阶 —— 真图本来就各不相同', () => {
    const html = render({ card: { ...HSBC, cardId: 'hsbc-red' }, indexInIssuer: 2 });
    expect(html).not.toContain('--card-shade');
  });
});

describe('CardFace：状态与层次', () => {
  it('muted 去色，停用卡不抢在用的卡的注意力', () => {
    expect(render()).not.toContain('saturate');
    expect(render({ muted: true })).toContain('saturate');
  });

  it('序号 0 不叠暗层，1–3 各叠一档', () => {
    expect(render({ indexInIssuer: 0 })).not.toContain('--card-shade');
    expect(render({ indexInIssuer: 1 })).toContain('var(--card-shade-1)');
    expect(render({ indexInIssuer: 3 })).toContain('var(--card-shade-3)');
  });

  it('序号超过 3 时封顶在第 3 档 —— 再暗下去就看不出是张卡了', () => {
    const html = render({ indexInIssuer: 9 });
    expect(html).toContain('var(--card-shade-3)');
    expect(html).not.toContain('--card-shade-9');
  });

  it('负数序号按 0 处理，不产生不存在的变量', () => {
    expect(render({ indexInIssuer: -2 })).not.toContain('--card-shade');
  });

  it('卡面整体对读屏隐藏 —— 它是装饰，卡名已在旁边用文字给出', () => {
    expect(render()).toContain('aria-hidden="true"');
  });
});
