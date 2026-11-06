/**
 * 「选银行」两态的显示契约。
 *
 * 断言的重点不是样式，是两件用户会踩到的事：
 *   1. 编辑态下点行不能跳进选卡页 —— 他这时想的是「删掉这家」，
 *      跳走等于惩罚正确的意图；
 *   2. 某地区一家银行都不剩时，不能留一个「香港发卡 · 0 家」的空标题。
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IssuerPicker } from './IssuerPicker';
import type { IssuerGroup } from '../../lib/issuerGroups';
import type { Card } from '../../domain/types';

function group(issuer: string, region: 'MO' | 'HK', cardCount = 1): IssuerGroup {
  const cards = Array.from({ length: cardCount }, (_, i) => ({ cardId: `${issuer}-${String(i)}` })) as unknown as Card[];
  return { issuer, region, cards, usableCount: cardCount };
}

const GROUPS: IssuerGroup[] = [group('大丰银行 (Tai Fung Bank)', 'MO', 1), group('花旗银行香港 (Citi HK)', 'HK', 2)];

function render(props: Partial<React.ComponentProps<typeof IssuerPicker>> = {}): string {
  return renderToStaticMarkup(<IssuerPicker groups={GROUPS} onPick={() => {}} {...props} />);
}

describe('IssuerPicker', () => {
  it('只读态：每行右侧是进入箭头，没有隐藏按钮', () => {
    const html = render();
    expect(html).toContain('lucide-chevron-right');
    expect(html).not.toContain('aria-label="隐藏');
  });

  it('编辑态：出现「隐藏这家」按钮，且不再有进入箭头', () => {
    const html = render({ editing: true, onHide: () => {} });
    expect(html).toContain('aria-label="隐藏 大丰银行 (Tai Fung Bank)"');
    expect(html).toContain('aria-label="隐藏 花旗银行香港 (Citi HK)"');
    expect(html).not.toContain('lucide-chevron-right');
  });

  it('编辑态下行本身不可点 —— 点行不是「进去选卡」', () => {
    const readonlyButtons = render().match(/<button/g) ?? [];
    const editButtons = render({ editing: true, onHide: () => {} }).match(/<button/g) ?? [];
    // 每行恰好一个可点元素：只读态是「整行进选卡」，编辑态是「隐藏按钮」
    expect(readonlyButtons).toHaveLength(2);
    expect(editButtons).toHaveLength(2);
  });

  it('地区分组标题带家数，且分地区计数（不是总数重复两次）', () => {
    const html = render();
    expect(html).toContain('澳门发卡 · 1 家');
    expect(html).toContain('香港发卡 · 1 家');
  });

  it('某地区一家都不剩时不渲染空标题', () => {
    const html = renderToStaticMarkup(
      <IssuerPicker groups={[group('大丰银行 (Tai Fung Bank)', 'MO')]} onPick={() => {}} />,
    );
    expect(html).toContain('1 家');
    expect(html).not.toContain('香港发卡');
  });
});
