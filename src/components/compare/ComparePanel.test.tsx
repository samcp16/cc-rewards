/**
 * `UnrankedRow` 的显示契约（ADR-011 §6，QA N2 指出的零测试缺口）。
 *
 * 这一行的唯一职责是**解释「为什么这张卡没算进来」**，且绝不出现数字
 * （AC-F1-03）。它有三个分支，过去一个都没有测试覆盖 —— 而删掉
 * `threshold_tier_incomplete` 分支时，正是这类「分支没人看」的地方最容易
 * 留下不可达的死代码。
 *
 * 覆盖的三件事：
 * 1. `channel_gated` → 「渠道不适用」，且行内必须给出「换成哪个渠道可用」
 * 2. 其余 unknown 类型 → 「回赠未知」
 * 3. `applicableChannels` 为空时不得渲染「换成…可用」（那时没有可换的渠道）
 *
 * 用 `renderToStaticMarkup` 而不是 testing-library：本项目 vitest 环境是 node，
 * 这个组件的输出是纯静态文本，不需要 DOM 查询能力。少一层依赖也少一类环境问题。
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnrankedRow } from './ComparePanel';
import type { Scheme } from '../../domain/types.result';

/** 最小可用 Scheme：只填 UnrankedRow 会读到的字段，其余给中性值 */
function scheme(over: Partial<Scheme>): Scheme {
  return {
    cardId: 'card-x',
    cardName: '测试卡',
    issuer: '测试银行',
    issuerRegion: 'HK',
    network: 'visa',
    confidence: 'high',
    verifiedAt: '2026-10-31',
    status: 'unknown',
    route: 'local',
    rateSide: 'local',
    grossCashback: 0,
    pointsValue: 0,
    fxFee: 0,
    channelFee: 0,
    netRealistic: 0,
    netOptimistic: 0,
    netRateRealistic: 0,
    netRateOptimistic: 0,
    capsAffected: [],
    warnings: [],
    ...over,
  } as Scheme;
}

function renderRow(over: Partial<Scheme>, channel = '实体刷卡'): string {
  return renderToStaticMarkup(
    <ul>
      <UnrankedRow channel={channel} scheme={scheme(over)} />
    </ul>,
  );
}

describe('UnrankedRow：channel_gated 分支', () => {
  it('显示「渠道不适用」并给出可用渠道', () => {
    const html = renderRow({
      warnings: [
        { code: 'channel_gated', category: 'dining', channel: 'physical', applicableChannels: ['alipay', 'wechat'] } as Scheme['warnings'][number],
      ],
    });

    expect(html).toContain('渠道不适用');
    expect(html).toContain('换成');
    expect(html).toContain('可用');
    expect(html).not.toContain('回赠未知');
  });

  it('applicableChannels 为空时不渲染「换成…可用」，退回显示当前渠道名', () => {
    const html = renderRow({
      warnings: [{ code: 'channel_gated', category: 'dining', channel: 'physical', applicableChannels: [] } as Scheme['warnings'][number]],
    });

    expect(html).toContain('渠道不适用');
    expect(html).not.toContain('换成');
    // 退回显示渠道名，不留空白
    expect(html).toContain('实体刷卡');
  });
});

describe('UnrankedRow：其余 unknown 类型', () => {
  it('unknown_rate → 「回赠未知」', () => {
    const html = renderRow({
      warnings: [{ code: 'unknown_rate', category: 'dining' } as Scheme['warnings'][number]],
    });
    expect(html).toContain('回赠未知');
    expect(html).not.toContain('渠道不适用');
  });

  it('no_point_valuation → 「回赠未知」', () => {
    const html = renderRow({
      warnings: [{ code: 'no_point_valuation' } as Scheme['warnings'][number]],
    });
    expect(html).toContain('回赠未知');
  });

  it('没有任何告警时也显示「回赠未知」（不留空白）', () => {
    const html = renderRow({ warnings: [] });
    expect(html).toContain('回赠未知');
  });

  it('任何分支都不得出现金额数字（AC-F1-03：只说为什么没算，不给数）', () => {
    const html = renderRow({
      warnings: [{ code: 'unknown_rate', category: 'dining' } as Scheme['warnings'][number]],
      netRealistic: 123.45,
      grossCashback: 456.78,
    });
    expect(html).not.toContain('123.45');
    expect(html).not.toContain('456.78');
  });
});
