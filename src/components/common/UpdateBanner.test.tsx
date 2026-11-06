/**
 * 更新提示条的显示契约。
 *
 * 关键断言是那句「不会丢」：用户看到「更新」二字的第一反应是
 * 「我的卡会不会没了」。这句话如果被删掉或改软，这个提示就从
 * 「让人放心地更新」变成「让人不敢更新」，功能等于没用。
 *
 * 用 renderToStaticMarkup（与 ComparePanel.test 同一套理由）：
 * 组件是受控的，没有内部状态，静态输出就足以覆盖它的全部行为。
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdateBannerView } from './UpdateBanner';

function render(): string {
  return renderToStaticMarkup(
    <UpdateBannerView onApply={() => {}} onDismiss={() => {}} />,
  );
}

describe('UpdateBannerView', () => {
  it('告知是新版本，并给出两个互斥选择', () => {
    const html = render();
    expect(html).toContain('新版本已就绪');
    expect(html).toContain('立即更新');
    expect(html).toContain('稍后');
  });

  it('明确说明数据留在本机，避免用户因担心丢卡而不更新', () => {
    expect(render()).toContain('不会丢');
  });

  it('是 live region：读屏用户在浏览时也能收到这条通知', () => {
    expect(render()).toContain('aria-live="polite"');
    expect(render()).toContain('role="status"');
  });

  it('图标是装饰性的，不出现在无障碍树里（不读成「刷新按钮」）', () => {
    const html = render();
    expect(html).toContain('aria-hidden="true"');
  });
});
