/**
 * 「从卡库选一张」的入口契约。
 *
 * 只锁两件事，因为其余都是复用 IssuerPicker / CardPickerList（各自有测试）：
 *   1. 打开时先让人选银行，而不是把 38 张卡一次倒出来；
 *   2. 副标题必须写明「会自动填上」—— 用户点这一下之前，得先知道
 *      它替代的是「照着卡面一格一格抄」那件苦差。
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TemplatePickerSheet } from './TemplatePickerSheet';

function render(): string {
  return renderToStaticMarkup(
    <TemplatePickerSheet open onClose={() => {}} onPick={() => {}} existingIds={new Set<string>()} />,
  );
}

describe('TemplatePickerSheet', () => {
  it('打开时停在选银行，而不是平铺全部卡', () => {
    const html = render();
    expect(html).toContain('从卡库选一张');
    expect(html).toContain('澳门发卡');
    expect(html).toContain('香港发卡');
  });

  it('说明选完会自动填 —— 这是用户点它的理由', () => {
    expect(render()).toContain('自动填上');
  });

  it('关闭状态不渲染任何内容', () => {
    const html = renderToStaticMarkup(
      <TemplatePickerSheet open={false} onClose={() => {}} onPick={() => {}} existingIds={new Set<string>()} />,
    );
    expect(html).toBe('');
  });
});
